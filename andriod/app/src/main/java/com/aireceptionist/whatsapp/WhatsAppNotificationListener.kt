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

/**
 * Reads incoming WhatsApp messages via Android's notification system, and can
 * reply by triggering the SAME "quick reply" action a human would tap from
 * the notification shade — no reverse-engineered WhatsApp client involved.
 *
 * Real limitations (see also the repo README):
 *  - Only sees messages that arrive while this listener is active.
 *  - Group chats are skipped entirely.
 *  - The reply PendingIntent only lives in memory for this process's
 *    lifetime. If the owner approves a WhatsApp draft via the web dashboard
 *    long after this notification was posted (and Android killed the app
 *    in between), the pending reply action is gone — SyncWorker will detect
 *    this and report send_failed back to the backend so the dashboard can
 *    tell the owner to reply manually instead of silently doing nothing.
 */
class WhatsAppNotificationListener : NotificationListenerService() {

    companion object {
        private const val WHATSAPP_PACKAGE = "com.whatsapp"
        private val pendingReplies = mutableMapOf<String, PendingReply>() // keyed by backend messageId
        private val seenNotificationKeys = mutableSetOf<String>()

        /** Called by SyncWorker when the dashboard has approved a WhatsApp draft. */
        fun sendReply(messageId: String, text: String): Boolean {
            val pending = pendingReplies.remove(messageId) ?: return false
            return try {
                val resultsBundle = Bundle()
                pending.remoteInputs.forEach { ri -> resultsBundle.putCharSequence(ri.resultKey, text) }
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

        val notification = sbn.notification
        val extras = notification.extras

        val isGroupConversation = extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false)
        if (isGroupConversation) return // groups excluded by design

        val sender = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: return
        val body = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: return

        val dedupeKey = "${sbn.key}:$body"
        if (!seenNotificationKeys.add(dedupeKey)) return
        if (seenNotificationKeys.size > 200) seenNotificationKeys.clear()

        val replyAction = notification.actions?.firstOrNull { action ->
            !action.remoteInputs.isNullOrEmpty() &&
                (action.semanticAction == Notification.Action.SEMANTIC_ACTION_REPLY ||
                 action.title?.toString()?.contains("Reply", ignoreCase = true) == true)
        } ?: return

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val trusted = TrustChecker.isTrustedWhatsAppSender(applicationContext, sender)
                val result = BackendClient.processMessage(
                    channel = "whatsapp", contactIdentifier = sender, contactName = sender,
                    trusted = trusted, body = body
                )

                // Hold the reply action regardless of outcome, keyed by the
                // backend's message id, so SyncWorker can fire it later if
                // the dashboard approves a held draft.
                pendingReplies[result.messageId] = PendingReply(
                    actionIntent = replyAction.actionIntent,
                    remoteInputs = replyAction.remoteInputs!!,
                    context = applicationContext
                )

                if (result.autoSendText != null) {
                    sendReply(result.messageId, result.autoSendText)
                }
                if (result.needsApproval && result.draftText != null) {
                    ApprovalNotifier(applicationContext).notifyDraftReady(sender, body, result.draftText)
                }
            } catch (e: Exception) {
                // Network/backend hiccup — nothing to clean up here.
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        // Deliberately no cleanup here — the owner may still approve after
        // the notification itself has cleared from the shade.
    }
}
