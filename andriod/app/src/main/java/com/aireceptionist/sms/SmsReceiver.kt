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

class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) return

        val sender = messages[0].originatingAddress ?: return
        val fullBody = messages.joinToString("") { it.messageBody ?: "" }

        // goAsync() gives us 10 extra seconds beyond the normal 5s BroadcastReceiver
        // window — enough for a backend round trip + reply send without the OS
        // killing us mid-flight. This is the key to near-instant replies.
        val pendingResult = goAsync()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val trusted = TrustChecker.isTrustedSmsSender(context, sender)
                val result = BackendClient.processMessage(
                    channel = "sms",
                    contactIdentifier = sender,
                    contactName = null,
                    trusted = trusted,
                    body = fullBody
                )

                // Send immediately on the same thread — no waiting for SyncWorker.
                // This is what makes replies feel instant rather than 15 min late.
                if (result.autoSendText != null) {
                    val sent = SmsSender.send(context, sender, result.autoSendText)
                    if (sent) {
                        BackendClient.confirmSent(result.messageId, true)
                    }
                }

                if (result.needsApproval && result.draftText != null) {
                    ApprovalNotifier(context).notifyDraftReady(
                        sender, fullBody, result.draftText
                    )
                }

                if (result.decisionCreated != null) {
                    ApprovalNotifier(context).notifyDecisionNeeded(
                        "Decision needed",
                        "Open the IRIS dashboard to review",
                        sender.hashCode() + 1
                    )
                }
            } catch (e: Exception) {
                // Backend hiccup — message is still safe in the Messages app
            } finally {
                pendingResult.finish()
            }
        }
    }
}
