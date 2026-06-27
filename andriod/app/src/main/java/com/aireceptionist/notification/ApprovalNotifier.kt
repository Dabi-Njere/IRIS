package com.aireceptionist.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.aireceptionist.BuildConfig

/**
 * Posts a notification whenever a draft needs the owner's approval. Tapping
 * it opens the web dashboard — that's where approve/edit/decline actually
 * happens now (talking straight to the backend), rather than a local in-app
 * screen, since the dashboard is the one place that works from any device.
 */
class ApprovalNotifier(private val context: Context) {

    companion object {
        const val CHANNEL_ID = "approval_channel"
        const val CHANNEL_NAME = "Reply Approvals"
    }

    init {
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for SMS/WhatsApp drafts and decisions awaiting your approval"
        }
        manager.createNotificationChannel(channel)
    }

    private fun dashboardIntent(): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.DASHBOARD_URL))
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE)
    }

    fun notifyDraftReady(contactIdentifier: String, incoming: String, draft: String) {
        if (draft.isBlank()) return

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle("Reply ready for $contactIdentifier")
            .setContentText(draft)
            .setStyle(NotificationCompat.BigTextStyle().bigText("Them: $incoming\n\nDraft: $draft"))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(dashboardIntent())
            .build()

        val manager = context.getSystemService(NotificationManager::class.java)
        manager.notify(contactIdentifier.hashCode(), notification)
    }

    fun notifyDecisionNeeded(title: String, body: String, requestId: Int) {
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(dashboardIntent())
            .build()

        val manager = context.getSystemService(NotificationManager::class.java)
        manager.notify(requestId, notification)
    }

    fun notifySendFailed(contactIdentifier: String, draft: String) {
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Couldn't auto-send to $contactIdentifier")
            .setContentText("Reply manually in WhatsApp: \"$draft\"")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.notify(("failed_" + contactIdentifier).hashCode(), notification)
    }
}
