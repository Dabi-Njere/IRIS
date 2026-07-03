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
import com.aireceptionist.work.SyncWorker
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {

    private val requestPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestPermissions.launch(arrayOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.POST_NOTIFICATIONS
        ))

        requestBatteryOptimizationExemption()
        schedulePeriodicSync()

        setContent {
            MaterialTheme {
                Surface { MainScreen() }
            }
        }
    }

    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(PowerManager::class.java)
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                })
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
    fun MainScreen() {
        val pm = getSystemService(PowerManager::class.java)
        val batteryOk = pm.isIgnoringBatteryOptimizations(packageName)

        Column(modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)) {

            Text("IRIS", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(6.dp))
            Text(
                "Running in the background, reading SMS and replying on your behalf.",
                style = MaterialTheme.typography.bodyMedium
            )

            Spacer(Modifier.height(28.dp))

            // Battery status
            Text(
                "Reply speed: " + if (batteryOk) "✓ Fast (battery optimization exempt)" else "⚠ May be slow — tap below to fix",
                style = MaterialTheme.typography.bodySmall,
                color = if (batteryOk) Color(0xFF6FCF97) else Color(0xFFE2685A)
            )
            if (!batteryOk) {
                Spacer(Modifier.height(8.dp))
                Button(onClick = { requestBatteryOptimizationExemption() }) {
                    Text("Fix Reply Speed")
                }
            }

            Spacer(Modifier.height(12.dp))
            Text(
                "SMS: Active — replies to all contacts automatically",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF6FCF97)
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "WhatsApp: Paused — coming in a future update",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF9A97A6)
            )

            Spacer(Modifier.height(32.dp))

            Button(
                onClick = {
                    startActivity(Intent(Intent.ACTION_VIEW,
                        Uri.parse(BuildConfig.DASHBOARD_URL)))
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Open Dashboard")
            }

            Spacer(Modifier.height(8.dp))
            Text(
                "Tip: open the dashboard on your tablet or laptop for the best experience. " +
                "This phone app runs silently in the background — you don't need to open it.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF9A97A6)
            )
        }
    }
}
