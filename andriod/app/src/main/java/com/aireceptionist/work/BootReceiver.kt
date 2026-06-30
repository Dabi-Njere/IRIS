package com.aireceptionist.work

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.*
import java.util.concurrent.TimeUnit

/**
 * Restarts the SyncWorker after the phone reboots — without this,
 * WorkManager periodic jobs don't survive a reboot on some devices.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "iris_sync", ExistingPeriodicWorkPolicy.KEEP, request
        )
    }
}
