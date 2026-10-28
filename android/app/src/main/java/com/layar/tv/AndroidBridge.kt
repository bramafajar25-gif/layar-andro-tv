package com.layar.tv

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

class AndroidBridge(
    private val activity: Activity,
    private val webView: WebView,
    private val launchPlayer: (String) -> Unit
) {
    private val prefs = activity.getSharedPreferences("layar_prefs", Context.MODE_PRIVATE)

    @JavascriptInterface
    fun getSettings(): String {
        val json = JSONObject().apply {
            put("quality", prefs.getString("quality", "auto"))
            put("blockAds", prefs.getBoolean("blockAds", true))
            put("passthrough", prefs.getBoolean("passthrough", false))
            put("nativePath", "")
            put("language", prefs.getString("language", "id"))
        }
        return json.toString()
    }

    @JavascriptInterface
    fun saveSettings(jsonStr: String) {
        try {
            val json = JSONObject(jsonStr)
            prefs.edit().apply {
                if (json.has("quality")) putString("quality", json.getString("quality"))
                if (json.has("blockAds")) putBoolean("blockAds", json.getBoolean("blockAds"))
                if (json.has("passthrough")) putBoolean("passthrough", json.getBoolean("passthrough"))
                if (json.has("language")) putString("language", json.getString("language"))
                apply()
            }
        } catch (_: Exception) {}
    }

    @JavascriptInterface
    fun setLanguage(lang: String) {
        prefs.edit().putString("language", lang).apply()
    }

    @JavascriptInterface
    fun play(jsonOptions: String) {
        activity.runOnUiThread {
            launchPlayer(jsonOptions)
        }
    }

    @JavascriptInterface
    fun closePlayer() {
        // Handled by PlayerActivity
    }

    @JavascriptInterface
    fun openSource(jsonOptions: String) {
        activity.runOnUiThread {
            try {
                val url = if (jsonOptions.isNotEmpty()) {
                    val opts = JSONObject(jsonOptions)
                    val type = opts.optString("type")
                    val slug = opts.optString("slug")
                    val season = opts.optInt("season", 0)
                    val episode = opts.optInt("episode", 0)
                    if (type == "movie") "${IdlixClient.SOURCE}/movie/$slug?play=1"
                    else if (season > 0 && episode > 0) "${IdlixClient.SOURCE}/series/$slug/season/$season/episode/$episode?play=1"
                    else IdlixClient.SOURCE
                } else IdlixClient.SOURCE

                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                activity.startActivity(intent)
            } catch (_: Exception) {}
        }
    }

    @JavascriptInterface
    fun showKeyboard() {
        activity.runOnUiThread {
            webView.requestFocus()
            val imm = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.showSoftInput(webView, InputMethodManager.SHOW_FORCED)
            imm?.toggleSoftInput(InputMethodManager.SHOW_FORCED, InputMethodManager.HIDE_IMPLICIT_ONLY)
        }
    }

    @JavascriptInterface
    fun hideKeyboard() {
        activity.runOnUiThread {
            val imm = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.hideSoftInputFromWindow(webView.windowToken, 0)
        }
    }

    @JavascriptInterface
    fun exitApp() {
        activity.runOnUiThread {
            activity.finish()
        }
    }
}
