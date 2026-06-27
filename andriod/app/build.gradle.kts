import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Read secrets from local.properties so they never get committed to git.
// Create a file named local.properties in the project root containing:
//   BACKEND_URL=https://your-app.vercel.app
//   DEVICE_SHARED_SECRET=the_same_random_string_you_set_in_vercel
//   DASHBOARD_URL=https://your-app.vercel.app
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) load(file.inputStream())
}

android {
    namespace = "com.aireceptionist"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.aireceptionist"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.2-backend"

        buildConfigField("String", "BACKEND_URL", "\"${localProperties.getProperty("BACKEND_URL", "")}\"")
        buildConfigField("String", "DEVICE_SHARED_SECRET", "\"${localProperties.getProperty("DEVICE_SHARED_SECRET", "")}\"")
        buildConfigField("String", "DASHBOARD_URL", "\"${localProperties.getProperty("DASHBOARD_URL", "")}\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Core / Compose
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.2")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

    // Networking (talks to the IRIS backend — no AI keys live on-device)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // WorkManager — periodic dispatch of approved sends + scheduled messages
    implementation("androidx.work:work-runtime-ktx:2.9.0")
}
