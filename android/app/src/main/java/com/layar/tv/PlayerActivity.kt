package com.layar.tv

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets

class PlayerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_OPTIONS = "options"
        private val AD_HOSTS = listOf(
            "doubleclick.net", "googlesyndication.com", "adsterra.com",
            "popads.net", "popcash.net", "propellerads.com", "exoclick.com",
            "histats.com", "google-analytics.com", "googletagmanager.com",
            "mc.yandex.ru", "statcounter.com", "adnxs.com", "criteo.com",
            "juicyads.com", "trafficjunky.com", "bidvertiser.com", "clickadu.com",
            "monetag.com", "hilltopads.com", "onclickalgo.com"
        )
    }

    private lateinit var webView: WebView
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        )
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )

        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
        }
        setContentView(webView)

        // Enable third-party cookies for CDN authentication & session tokens
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.userAgentString = IdlixClient.USER_AGENT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.offscreenPreRaster = true
        settings.safeBrowsingEnabled = false

        val playerCSS = """
            html,body{background:#000!important;scrollbar-width:none!important}
            body.layar-player-active{overflow:hidden!important}
            body.layar-player-active *{visibility:hidden!important}
            body.layar-player-active [data-layar-player],body.layar-player-active [data-layar-player] *{visibility:visible!important}
            body.layar-player-active [role="dialog"],body.layar-player-active [role="dialog"] *,body.layar-player-active dialog,body.layar-player-active dialog *{visibility:visible!important}
            [data-layar-player]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:0!important;max-height:none!important;margin:0!important;border-radius:0!important;z-index:2147483600!important}
            [data-layar-player] .hero-player-frame{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;aspect-ratio:auto!important;margin:0!important;transform:none!important;border-radius:0!important}
        """.trimIndent()

        val encodedCSS = Base64.encodeToString(playerCSS.toByteArray(StandardCharsets.UTF_8), Base64.NO_WRAP)

        val injectScript = """
            (function() {
                if (window.__layarPlayerInjected) return;
                window.__layarPlayerInjected = true;

                var style = document.createElement('style');
                style.textContent = atob('$encodedCSS');
                (document.head || document.documentElement).appendChild(style);

                function checkAndPlay() {
                    var target = document.querySelector('.hero-player-playing') || document.querySelector('.detail-backdrop');
                    var previous = document.querySelector('[data-layar-player]');
                    if (target && previous !== target) {
                        if (previous) previous.removeAttribute('data-layar-player');
                        target.setAttribute('data-layar-player', '');
                    }
                    if (target) {
                        document.body.classList.add('layar-player-active');
                    }

                    var buttons = document.querySelectorAll('button, .skip-button, .jw-skip');
                    for (var i = 0; i < buttons.length; i++) {
                        var b = buttons[i];
                        var txt = (b.textContent || '').trim().toLowerCase();
                        if (/^(skip ad|skip ads|lewati iklan|lanjutkan ke video|skip)$/i.test(txt)) {
                            b.click();
                        }
                    }

                    var playOverlays = document.querySelectorAll('.jw-display-icon-container, .vjs-big-play-button, .play-button, [aria-label*="Play" i], [title*="Play" i], .hero-player-play, .play-icon');
                    for (var k = 0; k < playOverlays.length; k++) {
                        var po = playOverlays[k];
                        if (po.offsetWidth > 0 && po.offsetHeight > 0) {
                            po.click();
                        }
                    }

                    var videos = document.querySelectorAll('video');
                    for (var j = 0; j < videos.length; j++) {
                        var v = videos[j];
                        if (v.paused) {
                            var p = v.play();
                            if (p && p.catch) {
                                p.catch(function() {
                                    v.muted = true;
                                    v.play().catch(function(){});
                                });
                            }
                        }
                    }
                }

                setInterval(checkAndPlay, 300);
                checkAndPlay();
                new MutationObserver(checkAndPlay).observe(document.documentElement, { childList: true, subtree: true });
            })();
        """.trimIndent()

        fun injectTools() {
            webView.evaluateJavascript(injectScript, null)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val urlStr = request?.url?.toString() ?: return null
                val uri = Uri.parse(urlStr)
                val host = uri.host?.lowercase() ?: ""
                val path = uri.path ?: ""

                val isAdHost = AD_HOSTS.any { host == it || host.endsWith(".$it") }
                val isVast = path.contains("/vast") || path.contains("/adserver")
                val isAdSession = host == "z2.idlixku.com" && path == "/api/watch/session/media"

                if (isVast) {
                    val emptyVast = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><VAST version=\"3.0\"/>"
                    return WebResourceResponse(
                        "application/xml",
                        "utf-8",
                        200,
                        "OK",
                        mapOf("Access-Control-Allow-Origin" to "*"),
                        ByteArrayInputStream(emptyVast.toByteArray(StandardCharsets.UTF_8))
                    )
                }

                if (isAdSession) {
                    return WebResourceResponse(
                        "application/json",
                        "utf-8",
                        200,
                        "OK",
                        mapOf("Access-Control-Allow-Origin" to "*"),
                        ByteArrayInputStream("{}".toByteArray(StandardCharsets.UTF_8))
                    )
                }

                if (isAdHost) {
                    return WebResourceResponse(
                        "text/plain",
                        "utf-8",
                        200,
                        "OK",
                        emptyMap(),
                        ByteArrayInputStream(ByteArray(0))
                    )
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectTools()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    callback?.onCustomViewHidden()
                    return
                }
                customView = view
                customCallback = callback
                webView.visibility = View.GONE
                (window.decorView as? ViewGroup)?.addView(
                    view,
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
            }

            override fun onHideCustomView() {
                if (customView == null) return
                (window.decorView as? ViewGroup)?.removeView(customView)
                customView = null
                customCallback?.onCustomViewHidden()
                webView.visibility = View.VISIBLE
            }

            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                if (newProgress >= 15) {
                    injectTools()
                }
            }
        }

        val optionsJson = intent.getStringExtra(EXTRA_OPTIONS) ?: "{}"
        val playbackUrl = try {
            val opts = JSONObject(optionsJson)
            val type = opts.optString("type")
            val slug = opts.optString("slug")
            val season = opts.optInt("season", 0)
            val episode = opts.optInt("episode", 0)
            if (type == "movie") {
                "${IdlixClient.SOURCE}/movie/$slug?play=1"
            } else if (season > 0 && episode > 0) {
                "${IdlixClient.SOURCE}/series/$slug/season/$season/episode/$episode?play=1"
            } else {
                IdlixClient.SOURCE
            }
        } catch (_: Exception) {
            IdlixClient.SOURCE
        }

        webView.loadUrl(playbackUrl)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                webView.evaluateJavascript(
                    "document.querySelectorAll('video').forEach(function(v){ if(v.paused){ v.play(); } else { v.pause(); } });",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_MEDIA_REWIND -> {
                webView.evaluateJavascript(
                    "document.querySelectorAll('video').forEach(function(v){ v.currentTime = Math.max(0, v.currentTime - 10); });",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                webView.evaluateJavascript(
                    "document.querySelectorAll('video').forEach(function(v){ v.currentTime += 10; });",
                    null
                )
                return true
            }
            KeyEvent.KEYCODE_BACK -> {
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
                    return true
                }
                finish()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        webView.destroy()
    }
}
