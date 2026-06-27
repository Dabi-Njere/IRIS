package com.aireceptionist

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.work.*
import com.aireceptionist.whatsapp.NotificationAccessHelper
import com.aireceptionist.work.SyncWorker
import java.util.concurrent.TimeUnit

/**
 * This app is intentionally thin now — the "brain" (classification, drafting,
 * applicant tracking, decisions) lives in the backend, and the main UI for
 * reviewing/approving things is the web dashboard, not a screen in here.
 * This activity just handles the on-device-only setup: permissions, and a
 * shortcut to the dashboard.
 */
class MainActivity : ComponentActivity() {

    private val requestPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* proceed regardless; UI reflects current grant state on next render */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestPermissions.launch(
            arrayOf(
                Manifest.permission.RECEIVE_SMS,
                Manifest.permission.READ_SMS,
                Manifest.permission.SEND_SMS,
                Manifest.permission.READ_CONTACTS,
                Manifest.permission.POST_NOTIFICATIONS
            )
        )

        schedulePeriodicSync()

        setContent {
            MaterialTheme {
                Surface { OnboardingScreen() }
            }
        }
    }

    private fun schedulePeriodicSync() {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "iris_sync", ExistingPeriodicWorkPolicy.KEEP, request
        )
    }

    @Composable
    fun OnboardingScreen() {
        var notifAccessEnabled by remember { mutableStateOf(NotificationAccessHelper.isEnabled(this)) }

        Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
            Text("IRIS", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(4.dp))
            Text(
                "Reading messages and replying on your behalf. Everything else — decisions, drafts, conversation history — lives in the dashboard.",
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(24.dp))

            Text("WhatsApp notification access: " + if (notifAccessEnabled) "ON" else "OFF")
            Spacer(Modifier.height(8.dp))
            Button(onClick = {
                NotificationAccessHelper.openSettings(this@MainActivity)
            }) { Text("Enable Notification Access") }

            Spacer(Modifier.height(32.dp))

            Button(onClick = {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.DASHBOARD_URL)))
            }) { Text("Open Dashboard") }
        }
    }
}
