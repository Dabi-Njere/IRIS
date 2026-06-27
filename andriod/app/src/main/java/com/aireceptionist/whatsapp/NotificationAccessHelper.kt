package com.aireceptionist.whatsapp

import android.content.Context
import android.content.Intent
import android.provider.Settings

/**
 * Notification access has no runtime permission dialog — it's a system
 * settings toggle the user has to find and enable manually. This deep-links
 * straight to that screen instead of making them hunt through Settings.
 */
object NotificationAccessHelper {

    fun openSettings(context: Context) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        context.startActivity(intent)
    }

    /**
     * Checks whether THIS app is in the system's enabled-listeners set.
     * Worth calling on app start / a settings screen so the UI can show
     * "WhatsApp reading: ON/OFF" rather than silently doing nothing if the
     * user never enabled it (or later disabled it).
     */
    fun isEnabled(context: Context): Boolean {
        val enabledListeners = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        return enabledListeners.contains(context.packageName)
    }
}
