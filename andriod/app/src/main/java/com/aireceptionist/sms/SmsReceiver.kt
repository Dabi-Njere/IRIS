package com.aireceptionist.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.aireceptionist.net.BackendClient
import com.aireceptionist.notification.ApprovalNotifier
import com.aireceptionist.util.TrustChecker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Fires whenever an SMS arrives. We don't intercept/abort it (the stock
 * Messages app still gets it too) — we just read it, send it to the backend
 * for classification, and act on whatever comes back. No local AI calls, no
 * local database — the backend (and Supabase behind it) is the source of
 * truth, reachable from both this app and the web dashboard.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) return

        val sender = messages[0].originatingAddress ?: return
        val fullBody = messages.joinToString(separator = "") { it.messageBody ?: "" }

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val trusted = TrustChecker.isTrustedSmsSender(context, sender)
                val result = BackendClient.processMessage(
                    channel = "sms", contactIdentifier = sender, contactName = null,
                    trusted = trusted, body = fullBody
                )

                if (result.autoSendText != null) {
                    SmsSender.send(context, sender, result.autoSendText)
                }
                if (result.needsApproval && result.draftText != null) {
                    ApprovalNotifier(context).notifyDraftReady(sender, fullBody, result.draftText)
                }
            } catch (e: Exception) {
                // Network/backend hiccup — the message is still safely sitting
                // in the real Messages app; nothing is lost, just not auto-handled.
            } finally {
                pendingResult.finish()
            }
        }
    }
}
