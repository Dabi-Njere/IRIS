package com.aireceptionist

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.work.*
import com.aireceptionist.whatsapp.NotificationAccessHelper
import com.aireceptionist.work.SyncWorker
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {

    private val requestPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* proceed regardless */ }

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

        // Critical for reply speed: ask Android to stop delaying our background
        // work due to battery optimization. Without this, SMS processing can be
        // deferred by 15-20 minutes on Pixel phones in battery saver mode.
        requestBatteryOptimizationExemption()
        schedulePeriodicSync()

        setContent {
            MaterialTheme {
                Surface { OnboardingScreen() }
            }
        }
    }

    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(PowerManager::class.java)
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
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
        var notifAccessEnabled by remember {
            mutableStateOf(NotificationAccessHelper.isEnabled(this))
        }

        Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
            Text("IRIS", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(4.dp))
            Text(
                "Reading messages and replying on your behalf. " +
                "Everything else — decisions, drafts, conversation history — lives in the dashboard.",
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(24.dp))

            // Battery optimization status
            val pm = getSystemService(PowerManager::class.java)
            val batteryExempt = pm.isIgnoringBatteryOptimizations(packageName)
            Text(
                "Battery optimization: " + if (batteryExempt) "EXEMPT (replies will be fast ✓)" else "NOT EXEMPT (replies may be slow — tap below)",
                style = MaterialTheme.typography.bodySmall,
                color = if (batteryExempt) Color(0xFF6FCF97) else Color(0xFFE2685A)
            )
            if (!batteryExempt) {
                Spacer(Modifier.height(8.dp))
                Button(onClick = { requestBatteryOptimizationExemption() }) {
                    Text("Fix Reply Speed")
                }
            }

            Spacer(Modifier.height(16.dp))
            Text(
                "WhatsApp notification access: " + if (notifAccessEnabled) "ON" else "OFF",
                style = MaterialTheme.typography.bodySmall
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = {
                NotificationAccessHelper.openSettings(this@MainActivity)
                notifAccessEnabled = NotificationAccessHelper.isEnabled(this@MainActivity)
            }) { Text("Enable Notification Access") }

            Spacer(Modifier.height(32.dp))
            Button(onClick = {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.DASHBOARD_URL)))
            }) { Text("Open Dashboard") }
        }
    }
}
