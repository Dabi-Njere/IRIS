package com.aireceptionist.whatsapp

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.aireceptionist.net.BackendClient
import com.aireceptionist.notification.ApprovalNotifier
import com.aireceptionist.util.TrustChecker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class WhatsAppNotificationListener : NotificationListenerService() {

    companion object {
        private const val WHATSAPP_PACKAGE = "com.whatsapp"
        private val pendingReplies = mutableMapOf<String, PendingReply>()
        private val processedKeys = mutableSetOf<String>()

        fun sendReply(messageId: String, text: String): Boolean {
            val pending = pendingReplies.remove(messageId) ?: return false
            return try {
                val resultsBundle = Bundle()
                pending.remoteInputs.forEach { ri ->
                    resultsBundle.putCharSequence(ri.resultKey, text)
                }
                val fillInIntent = Intent()
                RemoteInput.addResultsToIntent(pending.remoteInputs, fillInIntent, resultsBundle)
                pending.actionIntent.send(pending.context, 0, fillInIntent)
                true
            } catch (e: PendingIntent.CanceledException) {
                false
            }
        }
    }

    private data class PendingReply(
        val actionIntent: PendingIntent,
        val remoteInputs: Array<RemoteInput>,
        val context: android.content.Context
    )

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName != WHATSAPP_PACKAGE) return

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        // Skip group conversations entirely
        val isGroup = extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false)
        if (isGroup) return

        // Get sender name and message body
        val sender = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            ?.trim() ?: return
        val body = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?.trim() ?: return

        // CRITICAL FIX 1: Skip if the notification body starts with "You:"
        // WhatsApp shows sent messages in the notification as "You: [message]"
        // We must never process our own sent messages as incoming.
        if (body.startsWith("You:", ignoreCase = true) ||
            body.startsWith("You :", ignoreCase = true)) {
            return
        }

        // CRITICAL FIX 2: Skip if the notification shows a message thread where
        // the most recent message is from us — indicated by the text containing
        // patterns like "You: " mid-string (summary notifications)
        val messages = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        if (messages != null && messages.isNotEmpty()) {
            val lastMessage = messages.last().toString().trim()
            // If the last message in the thread is from "You:", skip entirely —
            // we already replied, no need to reply again
            if (lastMessage.startsWith("You:", ignoreCase = true) ||
                lastMessage.startsWith("You :", ignoreCase = true)) {
                return
            }
            // Use the last message as the body for more accuracy
            val actualBody = if (lastMessage.contains(":")) {
                lastMessage.substringAfter(":").trim()
            } else lastMessage
            processNotification(sbn, sender, actualBody, notification)
            return
        }

        processNotification(sbn, sender, body, notification)
    }

    private fun processNotification(
        sbn: StatusBarNotification,
        sender: String,
        body: String,
        notification: Notification
    ) {
        // De-duplicate: same sender + same body = same message, don't process twice
        val dedupeKey = "${sender}::${body}"
        if (!processedKeys.add(dedupeKey)) return
        if (processedKeys.size > 300) processedKeys.clear()

        // Find the reply action
        val replyAction = notification.actions?.firstOrNull { action ->
            !action.remoteInputs.isNullOrEmpty() &&
                (action.semanticAction == Notification.Action.SEMANTIC_ACTION_REPLY ||
                 action.title?.toString()?.contains("Reply", ignoreCase = true) == true)
        } ?: return

        CoroutineScope(Dispatchers.IO).launch {
            try {
                // CRITICAL FIX 3: Trusted contacts should never get
                // "who is this?" treatment. If they're saved in your contacts,
                // IRIS drafts a reply and asks YOU to approve it — it does NOT
                // auto-run a rental Q&A or send anything without your say-so.
                val trusted = TrustChecker.isTrustedWhatsAppSender(
                    applicationContext, sender
                )

                val result = BackendClient.processMessage(
                    channel = "whatsapp",
                    contactIdentifier = sender,
                    contactName = sender,
                    trusted = trusted,
                    body = body
                )

                pendingReplies[result.messageId] = PendingReply(
                    actionIntent = replyAction.actionIntent,
                    remoteInputs = replyAction.remoteInputs!!,
                    context = applicationContext
                )

                if (result.autoSendText != null) {
                    sendReply(result.messageId, result.autoSendText)
                }
                if (result.needsApproval && result.draftText != null) {
                    ApprovalNotifier(applicationContext).notifyDraftReady(
                        sender, body, result.draftText
                    )
                }
            } catch (e: Exception) {
                // Network hiccup — nothing to clean up
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        // No cleanup needed
    }
}
