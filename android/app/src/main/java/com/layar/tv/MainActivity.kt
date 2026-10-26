package com.layar.tv

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val idlixClient = IdlixClient()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#141414"))
            isFocusable = true
            isFocusableInTouchMode = true
        }
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.userAgentString = IdlixClient.USER_AGENT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.addJavascriptInterface(AndroidBridge(this, idlixClient), "AndroidBridge")

        val focusHelperJs = """
            (function() {
                document.addEventListener('focusin', function(e) {
                    if (e.target && typeof e.target.scrollIntoView === 'function') {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                });
            })();
        """.trimIndent()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val url = request?.url ?: return null
                if (url.path == "/api/source") {
                    val resource = url.getQueryParameter("resource") ?: ""
                    return idlixClient.handleApiRequest(resource)
                }
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                webView.evaluateJavascript(focusHelperJs, null)
            }
        }

        webView.webChromeClient = WebChromeClient()
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            webView.evaluateJavascript(
                "(function() { var m = document.getElementById('modal'); if (m && !m.classList.contains('hidden')) { var c = m.querySelector('[data-close], .dialog-close'); if (c) c.click(); else m.classList.add('hidden'); return true; } return false; })();"
            ) { result ->
                if (result != "true") {
                    finish()
                }
            }
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        webView.destroy()
    }
}
