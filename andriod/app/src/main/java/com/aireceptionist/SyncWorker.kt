package com.aireceptionist.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.aireceptionist.net.BackendClient
import com.aireceptionist.notification.ApprovalNotifier
import com.aireceptionist.sms.SmsSender
import com.aireceptionist.whatsapp.WhatsAppNotificationListener

/**
 * Runs every ~15-30 min (the practical minimum for Android's periodic
 * WorkManager). Two jobs each cycle:
 *  1. Dispatch any messages the owner approved via the web dashboard that
 *     haven't actually been sent yet (the backend can't send anything itself).
 *  2. Check for scheduled messages (the "good morning" feature) that are due.
 *
 * Note the asymmetry: SMS sends always work here, since SmsManager can send
 * to any number anytime. WhatsApp sends only work if this same app process
 * still has the original reply action in memory — if not, this reports
 * send_failed and notifies the owner to reply manually instead of failing
 * silently.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            dispatchPendingSends()
            dispatchScheduledMessages()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private suspend fun dispatchPendingSends() {
        val pending = BackendClient.getPendingSends()
        for (item in pending) {
            val sent = when (item.channel) {
                "sms" -> SmsSender.send(applicationContext, item.contactIdentifier, item.body)
                "whatsapp" -> {
                    val ok = WhatsAppNotificationListener.sendReply(item.messageId, item.body)
                    if (!ok) ApprovalNotifier(applicationContext).notifySendFailed(item.contactIdentifier, item.body)
                    ok
                }
                else -> false
            }
            BackendClient.confirmSent(item.messageId, sent)
        }
    }

    private suspend fun dispatchScheduledMessages() {
        val due = BackendClient.getScheduledDue() // backend already filters to SMS-only — see scheduled-due.ts
        for (item in due) {
            SmsSender.send(applicationContext, item.phoneNumber, item.text)
        }
    }
}
