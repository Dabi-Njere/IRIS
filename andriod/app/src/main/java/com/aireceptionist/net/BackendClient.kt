package com.aireceptionist.net

import com.aireceptionist.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Talks to the IRIS backend (Vercel). The phone never holds an AI API key —
 * every classify/draft decision happens server-side. This client just sends
 * what the backend needs and acts on what comes back.
 */
object BackendClient {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val baseUrl get() = BuildConfig.BACKEND_URL.trimEnd('/')
    private val secret get() = BuildConfig.DEVICE_SHARED_SECRET

    data class ProcessResult(
        val conversationId: String,
        val messageId: String,
        val category: String,
        val autoSendText: String?,
        val needsApproval: Boolean,
        val draftText: String?,
        val decisionCreated: String?
    )

    /** Called by SmsReceiver / WhatsAppNotificationListener for every incoming message. */
    suspend fun processMessage(
        channel: String, contactIdentifier: String, contactName: String?,
        trusted: Boolean, body: String
    ): ProcessResult = withContext(Dispatchers.IO) {
        val json = JSONObject().apply {
            put("deviceSecret", secret)
            put("channel", channel)
            put("contactIdentifier", contactIdentifier)
            put("contactName", contactName)
            put("trusted", trusted)
            put("body", body)
        }
        val response = post("$baseUrl/api/process-message", json)
        ProcessResult(
            conversationId = response.getString("conversationId"),
            messageId = response.getString("messageId"),
            category = response.optString("category", "OTHER"),
            autoSendText = response.optString("autoSendText", null).takeIf { it != null && it != "null" },
            needsApproval = response.optBoolean("needsApproval", false),
            draftText = response.optString("draftText", null).takeIf { it != null && it != "null" },
            decisionCreated = response.optString("decisionCreated", null).takeIf { it != null && it != "null" }
        )
    }

    data class PendingSend(val messageId: String, val body: String, val channel: String, val contactIdentifier: String)

    /** Polled periodically by SyncWorker — messages approved via the web dashboard, not yet actually sent. */
    suspend fun getPendingSends(): List<PendingSend> = withContext(Dispatchers.IO) {
        val response = get("$baseUrl/api/pending-sends?deviceSecret=$secret")
        val arr: JSONArray = response.getJSONArray("pending")
        (0 until arr.length()).map { i ->
            val item = arr.getJSONObject(i)
            val conv = item.getJSONObject("conversations")
            PendingSend(
                messageId = item.getString("id"),
                body = item.getString("body"),
                channel = conv.getString("channel"),
                contactIdentifier = conv.getString("contact_identifier")
            )
        }
    }

    suspend fun confirmSent(messageId: String, success: Boolean) = withContext(Dispatchers.IO) {
        val json = JSONObject().apply {
            put("deviceSecret", secret); put("messageId", messageId); put("success", success)
        }
        post("$baseUrl/api/confirm-sent", json)
    }

    data class DueScheduledMessage(val ruleId: String, val phoneNumber: String, val text: String)

    suspend fun getScheduledDue(): List<DueScheduledMessage> = withContext(Dispatchers.IO) {
        val response = get("$baseUrl/api/scheduled-due?deviceSecret=$secret")
        val arr: JSONArray = response.getJSONArray("due")
        (0 until arr.length()).map { i ->
            val item = arr.getJSONObject(i)
            DueScheduledMessage(item.getString("ruleId"), item.getString("phoneNumber"), item.getString("text"))
        }
    }

    private fun post(url: String, json: JSONObject): JSONObject {
        val request = Request.Builder().url(url)
            .post(json.toString().toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(request).execute().use { resp ->
            val bodyStr = resp.body?.string() ?: "{}"
            if (!resp.isSuccessful) throw RuntimeException("Backend error ${resp.code}: $bodyStr")
            return JSONObject(bodyStr)
        }
    }

    private fun get(url: String): JSONObject {
        val request = Request.Builder().url(url).get().build()
        client.newCall(request).execute().use { resp ->
            val bodyStr = resp.body?.string() ?: "{}"
            if (!resp.isSuccessful) throw RuntimeException("Backend error ${resp.code}: $bodyStr")
            return JSONObject(bodyStr)
        }
    }
}
