package com.cleancut.vault

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.MimeTypeMap
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Vault: the web app, served from inside the APK, with everything kept in the app's own storage.
 * The phone adds three things: files arrive from the share sheet, the back button walks Vault's
 * layers, and OneDrive opens signed in, inside the app, saving what you download into Vault.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private var od: WebView? = null
    private var odPanel: LinearLayout? = null
    private var odProgress: ProgressBar? = null
    private var fullscreen: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pageReady = false
    private val pending = mutableListOf<Pair<JSONArray, String?>>()
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var counter = System.currentTimeMillis()

    private val shareDir by lazy { File(cacheDir, "share").apply { mkdirs() } }

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val cb = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        val data = result.data
        val uris = mutableListOf<Uri>()
        if (result.resultCode == RESULT_OK && data != null) {
            data.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
            if (uris.isEmpty()) data.data?.let { uris.add(it) }
        }
        cb.onReceiveValue(uris.toTypedArray())
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // The page sits between the status bar and the navigation bar; the bars take the page's colours.
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val sys = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            root.setPadding(sys.left, sys.top, sys.right, maxOf(sys.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }
        tintBars(Color.BLACK, Color.BLACK)

        cleanOldShares()
        setUpVault()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (fullscreen != null) { leaveFullscreen(); return }
                val o = od
                if (odPanel?.visibility == View.VISIBLE && o != null) {
                    if (o.canGoBack()) o.goBack() else closeOneDrive()
                    return
                }
                if (!pageReady) { moveTaskToBack(true); return }
                web.evaluateJavascript("(window.Vault && Vault.back) ? Vault.back() : false") { r ->
                    if (r != "true") moveTaskToBack(true)
                }
            }
        })

        handleShare(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShare(intent)
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    // ---------------- Vault itself ----------------

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpVault() {
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/vault-share/", WebViewAssetLoader.InternalStoragePathHandler(this, shareDir))
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            // a Vault server reached over plain http (on your own network or Tailscale) is allowed too
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(web.settings, false)
        }
        web.setBackgroundColor(Color.BLACK)
        web.addJavascriptInterface(Bridge(), "VaultAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == HOST) return false
                // anything outside Vault (a link in a note, say) opens in the phone's browser
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: ActivityNotFoundException) { }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = true
                flushPending()
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
                return try { pickFiles.launch(Intent.createChooser(pick, "Add to Vault")); true } catch (e: Exception) { fileCallback = null; false }
            }

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (fullscreen != null) { callback.onCustomViewHidden(); return }
                fullscreen = view
                fullscreenCallback = callback
                root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                WindowCompat.getInsetsController(window, root).hide(WindowInsetsCompat.Type.systemBars())
            }

            override fun onHideCustomView() { leaveFullscreen() }
        }
        web.loadUrl("https://$HOST/app.html")
    }

    private fun leaveFullscreen() {
        val v = fullscreen ?: return
        root.removeView(v)
        fullscreen = null
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
        WindowCompat.getInsetsController(window, root).show(WindowInsetsCompat.Type.systemBars())
    }

    /** What the page can ask of the phone. Only Vault's own page (served from the APK) ever loads here. */
    inner class Bridge {
        @android.webkit.JavascriptInterface
        fun openOneDrive() { main.post { openOneDriveView() } }

        @android.webkit.JavascriptInterface
        fun openWith(name: String, type: String, base64: String) {
            io.execute {
                try {
                    val dir = File(cacheDir, "open").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
                    val f = File(dir, safeName(name))
                    f.writeBytes(Base64.decode(base64, Base64.DEFAULT))
                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                    val mime = type.ifBlank { mimeFor(f.name) }
                    val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    main.post {
                        try { startActivity(Intent.createChooser(view, "Open with")) } catch (_: Exception) { toast("No app on this phone opens that file") }
                    }
                } catch (e: Exception) { main.post { toast("Couldn't open that file") } }
            }
        }

        @android.webkit.JavascriptInterface
        fun bars(top: String, bottom: String) {
            val t = parseCss(top) ?: return
            val b = parseCss(bottom) ?: t
            main.post { if (odPanel?.visibility != View.VISIBLE) tintBars(t, b) }
        }
    }

    // ---------------- the share sheet ----------------

    private fun handleShare(intent: Intent?) {
        intent ?: return
        val action = intent.action
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE && action != Intent.ACTION_VIEW) return
        if (action == Intent.ACTION_VIEW && intent.data?.scheme !in setOf("content", "file")) return
        val uris = mutableListOf<Uri>()
        when (action) {
            Intent.ACTION_SEND -> streamExtra(intent)?.let { uris.add(it) }
            Intent.ACTION_SEND_MULTIPLE -> uris.addAll(streamListExtra(intent))
            Intent.ACTION_VIEW -> intent.data?.let { uris.add(it) }
        }
        intent.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { if (it !in uris) uris.add(it) } }
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        // handled once: rotating the phone must not add them twice
        intent.action = null
        if (uris.isEmpty() && text.isNullOrBlank()) return
        toast(if (uris.size > 1) "Getting ${uris.size} files ready…" else "Getting it ready…")
        io.execute {
            val list = JSONArray()
            for (u in uris) {
                try {
                    val name = displayName(u)
                    val f = File(shareDir, "${counter++}-${safeName(name)}")
                    contentResolver.openInputStream(u)?.use { input -> f.outputStream().use { input.copyTo(it) } } ?: continue
                    list.put(JSONObject().put("url", "https://$HOST/vault-share/${Uri.encode(f.name)}").put("name", name)
                        .put("type", contentResolver.getType(u) ?: mimeFor(name)))
                } catch (_: Exception) { }
            }
            if (uris.isEmpty() && !text.isNullOrBlank()) {
                val f = File(shareDir, "${counter++}-Shared text.txt")
                f.writeText(text)
                list.put(JSONObject().put("url", "https://$HOST/vault-share/${Uri.encode(f.name)}").put("name", "Shared text.txt").put("type", "text/plain"))
            }
            main.post {
                if (list.length() == 0) toast("Couldn't read what was shared") else deliver(list, null)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun streamExtra(i: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun streamListExtra(i: Intent): List<Uri> =
        (if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableArrayListExtra(Intent.EXTRA_STREAM)) ?: emptyList()

    private fun displayName(u: Uri): String {
        try {
            contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0)?.let { if (it.isNotBlank()) return it }
            }
        } catch (_: Exception) { }
        return u.lastPathSegment?.substringAfterLast('/')?.ifBlank { null } ?: "shared file"
    }

    /** Hands files to the page: to the add sheet, or (dest set) straight into that section. */
    private fun deliver(list: JSONArray, dest: String?) {
        if (!pageReady) { pending.add(list to dest); return }
        if (odPanel?.visibility == View.VISIBLE && dest == null) closeOneDrive()
        val d = if (dest == null) "null" else JSONObject.quote(dest)
        web.evaluateJavascript("Promise.resolve(window.Vault && Vault.ready).then(function(){ Vault.receiveShared($list, $d); });", null)
    }

    private fun flushPending() {
        val all = pending.toList()
        pending.clear()
        all.forEach { (l, d) -> deliver(l, d) }
    }

    private fun cleanOldShares() {
        val day = System.currentTimeMillis() - 24 * 3600 * 1000L
        shareDir.listFiles()?.forEach { if (it.lastModified() < day) it.delete() }
    }

    // ---------------- OneDrive, inside Vault ----------------

    @SuppressLint("SetJavaScriptEnabled")
    private fun openOneDriveView() {
        if (od == null) buildOneDrive()
        odPanel?.visibility = View.VISIBLE
        odPanel?.bringToFront()
        tintBars(OD_BAR, Color.WHITE.takeIf { !isNight() } ?: Color.BLACK)
    }

    private fun closeOneDrive() {
        odPanel?.visibility = View.GONE
        web.evaluateJavascript("window.Vault && Vault.android && Vault.android.retint && Vault.android.retint()", null)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildOneDrive() {
        val dp = resources.displayMetrics.density
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(if (isNight()) Color.BLACK else Color.WHITE)
        }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(OD_BAR)
            setPadding((6 * dp).toInt(), 0, (6 * dp).toInt(), 0)
        }
        fun button(label: String, onTap: () -> Unit) = TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 15f
            setPadding((12 * dp).toInt(), 0, (12 * dp).toInt(), 0)
            gravity = Gravity.CENTER
            isClickable = true
            background = with(android.util.TypedValue()) {
                theme.resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, this, true)
                getDrawable(resourceId)
            }
            setOnClickListener { onTap() }
        }
        bar.addView(button("‹  Vault") { closeOneDrive() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT))
        bar.addView(TextView(this).apply {
            text = "OneDrive"
            setTextColor(Color.WHITE)
            textSize = 17f
            paint.isFakeBoldText = true
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
        bar.addView(button("Reload") { od?.reload() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT))
        panel.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (52 * dp).toInt()))

        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#7fd0ff"))
        }
        panel.addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (3 * dp).toInt()))
        odProgress = progress

        val w = WebView(this)
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            allowFileAccess = false
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = true
            // the phone's own Chrome, as far as Microsoft's sign-in can tell
            userAgentString = WebSettings.getDefaultUserAgent(this@MainActivity).replace("; wv", "").replace(Regex(" Version/[\\d.]+"), "")
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(w, true)
        }
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val s = request.url.scheme ?: return true
                if (s == "http" || s == "https") return false
                // ms-word:, intent: and other app links go to the phone
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { }
                return true
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress >= 100) View.INVISIBLE else View.VISIBLE
            }

            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                // uploading to OneDrive from the phone
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                }
                return try { pickFiles.launch(Intent.createChooser(pick, "Upload to OneDrive")); true } catch (e: Exception) { fileCallback = null; false }
            }
        }
        // Downloads land in Vault's OneDrive section.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(w, "VaultSave", MICROSOFT_ORIGINS) { _, message, _, _, _ ->
                val m = try { JSONObject(message.data ?: "") } catch (_: Exception) { null } ?: return@addWebMessageListener
                saveBytes(m.optString("name", "file"), m.optString("type", ""), m.optString("data", ""))
            }
        }
        w.setDownloadListener { url, userAgent, disposition, mime, _ ->
            val name = URLUtil.guessFileName(url, disposition, mime)
            when {
                url.startsWith("http") -> download(url, userAgent, name, mime)
                url.startsWith("blob:") -> w.evaluateJavascript(blobGrab(url, name, mime), null)
                url.startsWith("data:") -> saveDataUrl(url, name)
                else -> toast("That download can't be saved")
            }
        }
        panel.addView(w, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(panel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        od = w
        odPanel = panel
        val signedIn = (CookieManager.getInstance().getCookie("https://login.live.com") ?: "").isNotBlank()
        w.loadUrl(if (signedIn) "https://onedrive.live.com/" else "https://onedrive.live.com/login/")
    }

    private fun download(url: String, userAgent: String, name: String, mime: String?) {
        toast("Saving $name to Vault…")
        io.execute {
            try {
                var link = URL(url)
                var conn: HttpURLConnection
                var hops = 0
                while (true) {
                    conn = (link.openConnection() as HttpURLConnection).apply {
                        instanceFollowRedirects = false
                        connectTimeout = 20000
                        readTimeout = 60000
                        setRequestProperty("User-Agent", userAgent)
                        CookieManager.getInstance().getCookie(link.toString())?.let { setRequestProperty("Cookie", it) }
                    }
                    val code = conn.responseCode
                    if (code in 300..399 && hops++ < 8) {
                        link = URL(link, conn.getHeaderField("Location"))
                        conn.disconnect()
                        continue
                    }
                    if (code !in 200..299) throw IllegalStateException("HTTP $code")
                    break
                }
                val real = conn.getHeaderField("Content-Disposition")?.let { URLUtil.guessFileName(link.toString(), it, conn.contentType) } ?: name
                val f = File(shareDir, "${counter++}-${safeName(real)}")
                conn.inputStream.use { input -> f.outputStream().use { input.copyTo(it) } }
                conn.disconnect()
                val type = (mime?.takeIf { it.isNotBlank() && it != "application/octet-stream" }) ?: mimeFor(real)
                main.post { savedToVault(f, real, type) }
            } catch (e: Exception) {
                main.post { toast("Couldn't save $name") }
            }
        }
    }

    private fun saveBytes(name: String, type: String, base64: String) {
        io.execute {
            try {
                val f = File(shareDir, "${counter++}-${safeName(name)}")
                f.writeBytes(Base64.decode(base64, Base64.DEFAULT))
                main.post { savedToVault(f, name, type.ifBlank { mimeFor(name) }) }
            } catch (e: Exception) { main.post { toast("Couldn't save $name") } }
        }
    }

    private fun saveDataUrl(url: String, name: String) {
        val comma = url.indexOf(',')
        if (comma < 0) return
        val meta = url.substring(5, comma)
        val type = meta.substringBefore(';')
        if (meta.endsWith(";base64")) saveBytes(name, type, url.substring(comma + 1))
        else saveBytes(name, type, Base64.encodeToString(Uri.decode(url.substring(comma + 1)).toByteArray(), Base64.NO_WRAP))
    }

    private fun savedToVault(f: File, name: String, type: String) {
        val list = JSONArray().put(JSONObject().put("url", "https://$HOST/vault-share/${Uri.encode(f.name)}").put("name", name).put("type", type))
        deliver(list, "onedrive")
        toast("Saved $name to Vault")
    }

    /** A blob: download only exists inside the page, so the page reads it and posts it back. */
    private fun blobGrab(url: String, name: String, mime: String?): String {
        val u = JSONObject.quote(url)
        val n = JSONObject.quote(name)
        val t = JSONObject.quote(mime ?: "")
        return """
            (function(){
              if (!window.VaultSave) return;
              fetch($u).then(function(r){ return r.blob(); }).then(function(b){
                var fr = new FileReader();
                fr.onload = function(){ VaultSave.postMessage(JSON.stringify({ name: $n, type: b.type || $t, data: String(fr.result).split(',')[1] || '' })); };
                fr.readAsDataURL(b);
              });
            })();
        """.trimIndent()
    }

    // ---------------- small things ----------------

    private fun tintBars(top: Int, bottom: Int) {
        root.setBackgroundColor(top)
        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT < 35) {
            window.statusBarColor = top
            window.navigationBarColor = bottom
        }
        // below the page, the navigation bar's strip shows the bottom colour
        root.foreground = BottomStrip(bottom)
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = isLight(top)
            isAppearanceLightNavigationBars = isLight(bottom)
        }
    }

    /** Paints the strip under the navigation bar in the page's bottom colour. */
    private inner class BottomStrip(private val color: Int) : android.graphics.drawable.Drawable() {
        private val paint = android.graphics.Paint().apply { this.color = color }
        override fun draw(canvas: android.graphics.Canvas) {
            val b = bounds
            val pad = root.paddingBottom
            if (pad > 0) canvas.drawRect(b.left.toFloat(), (b.bottom - pad).toFloat(), b.right.toFloat(), b.bottom.toFloat(), paint)
        }
        override fun setAlpha(alpha: Int) {}
        override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) {}
        @Deprecated("Deprecated in Java")
        override fun getOpacity() = android.graphics.PixelFormat.TRANSLUCENT
    }

    private fun isLight(c: Int): Boolean =
        (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) > 160

    private fun isNight(): Boolean =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private fun parseCss(c: String): Int? {
        val m = Regex("rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)").find(c) ?: return null
        val (r, g, b) = m.destructured
        return Color.rgb(r.toInt(), g.toInt(), b.toInt())
    }

    private fun safeName(n: String): String =
        n.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").take(120).ifBlank { "file" }

    private fun mimeFor(name: String): String =
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream"

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()

    companion object {
        const val HOST = "appassets.androidplatform.net"
        val OD_BAR: Int = Color.parseColor("#0f6cbd")
        val MICROSOFT_ORIGINS = setOf(
            "https://onedrive.live.com", "https://*.live.com", "https://*.microsoft.com",
            "https://*.microsoftpersonalcontent.com", "https://*.sharepoint.com", "https://*.1drv.com", "https://*.office.com",
        )
    }
}
