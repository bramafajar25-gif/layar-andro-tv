package com.layar.tv

import android.webkit.WebResourceResponse
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class IdlixClient {

    companion object {
        const val SOURCE = "https://z2.idlixku.com"
        const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
    }

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(25, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .followRedirects(false)
        .build()

    private val cache = ConcurrentHashMap<String, CacheEntry>()

    data class CacheEntry(val jsonString: String, val expiresAt: Long)

    fun validateResource(resource: String): String {
        if (resource.length > 1500) throw IllegalArgumentException("Permintaan tidak valid.")
        val fullUrl = if (resource.startsWith("http://") || resource.startsWith("https://")) {
            URL(resource)
        } else {
            val clean = resource.removePrefix("/")
            URL("$SOURCE/api/$clean")
        }

        val path = fullUrl.path
        if (fullUrl.protocol != "https" || fullUrl.host != "z2.idlixku.com") {
            throw IllegalArgumentException("Sumber tidak diizinkan.")
        }
        val allowedPattern = Regex("^/api/(homepage|search|movies|series|(?:movies|series)/[a-z0-9-]+|series/[a-z0-9-]+/season/\\d+)$")
        if (!allowedPattern.matches(path)) {
            throw IllegalArgumentException("Permintaan tidak didukung.")
        }
        return fullUrl.toString()
    }

    fun fetchSync(resource: String): String {
        val targetUrl = validateResource(resource)
        val now = System.currentTimeMillis()

        val hit = cache[targetUrl]
        if (hit != null && hit.expiresAt > now) {
            return hit.jsonString
        }

        val request = Request.Builder()
            .url(targetUrl)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "application/json")
            .build()

        val response = httpClient.newCall(request).execute()
        if (!response.isSuccessful) {
            val code = response.code
            val message = if (code == 403) "IDLIX menolak koneksi. Coba muat ulang." else "IDLIX belum bisa dimuat ($code)."
            val errJson = JSONObject().apply { put("error", message) }
            return errJson.toString()
        }

        val rawText = response.body?.string() ?: "{}"
        val rawJson = try {
            if (rawText.trim().startsWith("[")) {
                JSONObject().apply { put("data", JSONArray(rawText)) }
            } else {
                JSONObject(rawText)
            }
        } catch (e: Exception) {
            JSONObject(rawText)
        }

        val normalized = normalize(targetUrl, rawJson)
        val resultString = normalized.toString()

        if (cache.size > 200) {
            val firstKey = cache.keys().nextElement()
            if (firstKey != null) cache.remove(firstKey)
        }
        cache[targetUrl] = CacheEntry(resultString, now + 120_000)
        return resultString
    }

    fun handleApiRequest(resource: String): WebResourceResponse {
        return try {
            val result = fetchSync(resource)
            val inputStream = ByteArrayInputStream(result.toByteArray(StandardCharsets.UTF_8))
            val headers = mapOf(
                "Access-Control-Allow-Origin" to "*",
                "Content-Type" to "application/json; charset=utf-8"
            )
            WebResourceResponse("application/json", "utf-8", 200, "OK", headers, inputStream)
        } catch (e: Exception) {
            val errJson = JSONObject().apply { put("error", e.message ?: "Terjadi kesalahan.") }
            val inputStream = ByteArrayInputStream(errJson.toString().toByteArray(StandardCharsets.UTF_8))
            WebResourceResponse("application/json", "utf-8", 502, "Bad Gateway", emptyMap(), inputStream)
        }
    }

    private fun title(raw: JSONObject, fallbackType: String? = null): JSONObject {
        val item = raw.optJSONObject("content") ?: raw
        val rawType = raw.optString("contentType")
        val itemType = item.optString("contentType")
        val type = when {
            rawType == "episode" -> "tv_series"
            rawType.isNotEmpty() -> rawType
            itemType.isNotEmpty() -> itemType
            fallbackType != null -> fallbackType
            item.optString("firstAirDate").isNotEmpty() -> "tv_series"
            else -> "movie"
        }

        val res = JSONObject()
        res.put("id", item.opt("id"))
        res.put("type", type)
        res.put("slug", item.optString("slug", ""))
        val titleStr = item.optString("title").ifEmpty { item.optString("name", "") }
        res.put("title", titleStr)
        res.put("overview", item.optString("overview", ""))
        res.put("poster", item.optString("posterPath", ""))
        res.put("backdrop", item.optString("backdropPath", ""))
        res.put("logo", item.optString("logoPath", ""))

        val releaseDate = item.optString("releaseDate").ifEmpty { item.optString("firstAirDate", "") }
        res.put("year", if (releaseDate.length >= 4) releaseDate.substring(0, 4) else "")
        res.put("rating", item.optDouble("voteAverage", 0.0))
        if (item.isNull("runtime") || !item.has("runtime")) {
            res.put("runtime", JSONObject.NULL)
        } else {
            res.put("runtime", item.optInt("runtime"))
        }
        res.put("quality", item.optString("quality", ""))
        res.put("numberOfSeasons", item.optInt("numberOfSeasons", 0))

        val genresArr = JSONArray()
        val rawGenres = item.optJSONArray("genres")
        if (rawGenres != null) {
            for (i in 0 until rawGenres.length()) {
                val g = rawGenres.opt(i)
                if (g is String && g.isNotEmpty()) genresArr.put(g)
                else if (g is JSONObject && g.has("name")) genresArr.put(g.getString("name"))
            }
        }
        res.put("genres", genresArr)

        val castArr = JSONArray()
        val rawCast = item.optJSONArray("cast")
        if (rawCast != null) {
            val limit = minOf(8, rawCast.length())
            for (i in 0 until limit) {
                val c = rawCast.optJSONObject(i)
                val cName = c?.optString("name") ?: ""
                if (cName.isNotEmpty()) castArr.put(cName)
            }
        }
        res.put("cast", castArr)
        res.put("director", item.optString("director", ""))
        res.put("tagline", item.optString("tagline", ""))
        res.put("hasVideo", item.optBoolean("hasVideo", true))

        val seasonsArr = JSONArray()
        val rawSeasons = item.optJSONArray("seasons")
        if (rawSeasons != null) {
            for (i in 0 until rawSeasons.length()) {
                val s = rawSeasons.optJSONObject(i) ?: continue
                if (!s.optBoolean("isPublished", true)) continue
                val sObj = JSONObject().apply {
                    put("number", s.optInt("seasonNumber", 1))
                    put("name", s.optString("name", "Season ${s.optInt("seasonNumber", 1)}"))
                    val count = s.optInt("episodeCount", s.optJSONArray("episodes")?.length() ?: 0)
                    put("count", count)
                }
                seasonsArr.put(sObj)
            }
        }
        res.put("seasons", seasonsArr)
        return res
    }

    private fun normalize(targetUrl: String, raw: JSONObject): JSONObject {
        val path = URL(targetUrl).path

        if (path == "/api/homepage") {
            val modules = mutableListOf<JSONObject>()
            val above = raw.optJSONArray("above")
            if (above != null) {
                for (i in 0 until above.length()) {
                    above.optJSONObject(i)?.let { modules.add(it) }
                }
            }
            val below = raw.optJSONArray("below")
            if (below != null) {
                for (i in 0 until below.length()) {
                    below.optJSONObject(i)?.let { modules.add(it) }
                }
            }

            val featuredArr = JSONArray()
            val featuredModule = modules.find { it.optString("type") == "featured" }
            val featuredData = featuredModule?.optJSONArray("data")
            if (featuredData != null) {
                for (i in 0 until featuredData.length()) {
                    val item = featuredData.optJSONObject(i) ?: continue
                    val t = title(item)
                    if (t.optString("slug").isNotEmpty()) featuredArr.put(t)
                }
            }

            val rowsArr = JSONArray()
            for (m in modules) {
                val mType = m.optString("type")
                if (mType == "featured" || mType == "latest_episodes") continue
                val mData = m.optJSONArray("data") ?: continue
                val itemsArr = JSONArray()
                for (i in 0 until mData.length()) {
                    val item = mData.optJSONObject(i) ?: continue
                    val t = title(item)
                    if (t.optString("slug").isNotEmpty()) itemsArr.put(t)
                }
                if (itemsArr.length() > 0) {
                    val rowObj = JSONObject().apply {
                        val key = m.optString("slug").ifEmpty { mType }
                        put("key", key)
                        put("title", m.optString("title", ""))
                        put("type", mType)
                        put("items", itemsArr)
                    }
                    rowsArr.put(rowObj)
                }
            }

            return JSONObject().apply {
                put("featured", featuredArr)
                put("rows", rowsArr)
            }
        }

        if (Regex("/season/\\d+$").containsMatchIn(path)) {
            val s = raw.optJSONObject("season") ?: raw
            val res = JSONObject()
            res.put("number", s.optInt("seasonNumber", 1))

            val epArr = JSONArray()
            val rawEps = s.optJSONArray("episodes")
            val epList = mutableListOf<JSONObject>()
            if (rawEps != null) {
                for (i in 0 until rawEps.length()) {
                    val e = rawEps.optJSONObject(i) ?: continue
                    if (!e.optBoolean("isPublished", true)) continue
                    val epNum = e.optInt("episodeNumber", i + 1)
                    val epObj = JSONObject().apply {
                        put("number", epNum)
                        put("title", e.optString("name", "Episode $epNum"))
                        put("overview", e.optString("overview", ""))
                        put("still", e.optString("stillPath", ""))
                        if (e.isNull("runtime") || !e.has("runtime")) {
                            put("runtime", JSONObject.NULL)
                        } else {
                            put("runtime", e.optInt("runtime"))
                        }
                        put("available", e.optBoolean("hasVideo", true))
                    }
                    epList.add(epObj)
                }
            }
            epList.sortBy { it.optInt("number") }
            epList.forEach { epArr.put(it) }
            res.put("episodes", epArr)
            return res
        }

        if (Regex("/api/(movies|series)/.+").matches(path)) {
            val fallback = if (path.startsWith("/api/movies/")) "movie" else "tv_series"
            return title(raw, fallback)
        }

        val rawItems = raw.optJSONArray("results") ?: raw.optJSONArray("data") ?: JSONArray()
        val itemsArr = JSONArray()
        val fallback = if (path == "/api/series") "tv_series" else null
        for (i in 0 until rawItems.length()) {
            val item = rawItems.optJSONObject(i) ?: continue
            val t = title(item, fallback)
            if (t.optString("slug").isNotEmpty()) itemsArr.put(t)
        }

        val pagination = raw.optJSONObject("pagination")
        val limit = pagination?.optInt("limit", 24) ?: 24
        val total = pagination?.optInt("total", raw.optInt("total", itemsArr.length())) ?: itemsArr.length()
        val totalPages = pagination?.optInt("totalPages", Math.ceil(total.toDouble() / limit).toInt()) ?: 1

        return JSONObject().apply {
            put("items", itemsArr)
            put("pages", totalPages)
            put("total", total)
        }
    }
}

