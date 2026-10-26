package com.layar.tv

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class PlayerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_OPTIONS = "options"
        private val AD_HOSTS = listOf(
            "doubleclick.net", "googlesyndication.com", "adsterra.com",
            "popads.net", "popcash.net", "propellerads.com", "exoclick.com"
        )
    }

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
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
        }
        setContentView(webView)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.userAgentString = IdlixClient.USER_AGENT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        val playerCSS = """
            html,body{background:#000!important;scrollbar-width:none!important}
            body.layar-player-active{overflow:hidden!important}
            body.layar-player-active *{visibility:hidden!important}
            body.layar-player-active [data-layar-player],body.layar-player-active [data-layar-player] *{visibility:visible!important}
            body.layar-player-active [role="dialog"],body.layar-player-active [role="dialog"] *,body.layar-player-active dialog,body.layar-player-active dialog *{visibility:visible!important}
            [data-layar-player]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:0!important;max-height:none!important;margin:0!important;border-radius:0!important;z-index:2147483600!important}
            [data-layar-player] .hero-player-frame{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;aspect-ratio:auto!important;margin:0!important;transform:none!important;border-radius:0!important}
        """.trimIndent()

        val injectScript = """
            (function() {
                var style = document.createElement('style');
                style.textContent = ${JSONObject.quote(playerCSS)};
                document.head.appendChild(style);

                function update() {
                    var target = document.querySelector('.hero-player-playing') || document.querySelector('.detail-backdrop');
                    var previous = document.querySelector('[data-layar-player]');
                    if (previous !== target) {
                        if (previous) previous.removeAttribute('data-layar-player');
                        if (target) target.setAttribute('data-layar-player', '');
                    }
                    document.body.classList.toggle('layar-player-active', !!target);
                    for (var button of document.querySelectorAll('button')) {
                        if (!button.disabled && button.getClientRects().length && /^(skip ad|skip ads|lewati iklan|lanjutkan ke video)$/i.test(button.textContent.trim())) {
                            button.click();
                        }
                    }
                }
                new MutationObserver(function() { update(); }).observe(document.body, { childList: true, subtree: true });
                update();
            })();
        """.trimIndent()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val urlStr = request?.url?.toString() ?: return null
                val uri = Uri.parse(urlStr)
                val host = uri.host ?: ""

                val isAd = AD_HOSTS.any { host == it || host.endsWith(".$it") } ||
                    (host == "z2.idlixku.com" && uri.path == "/api/watch/session/media")

                if (isAd) {
                    return WebResourceResponse("text/plain", "utf-8", 200, "OK", emptyMap(), null)
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                webView.evaluateJavascript(injectScript, null)
            }
        }

        webView.webChromeClient = WebChromeClient()

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
