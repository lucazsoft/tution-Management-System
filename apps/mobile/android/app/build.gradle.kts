plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing reads from `keystore.properties` (see
// `keystore.properties.example`) with `TMS_KEYSTORE_*` env vars as fallback.
// The keystore itself and both files with real secrets are NEVER committed —
// see apps/mobile/README.md ("Release identity & signing").
val keystoreProps = java.util.Properties()
val keystorePropsFile = rootProject.file("keystore.properties")
if (keystorePropsFile.exists()) {
    keystorePropsFile.inputStream().use { keystoreProps.load(it) }
}
fun signingProp(name: String, env: String): String? =
    (keystoreProps.getProperty(name) ?: System.getenv(env))?.takeIf { it.isNotBlank() }

android {
    namespace = "com.tms.tmsmobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.tms.tmsmobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            val storeFilePath = signingProp("storeFile", "TMS_KEYSTORE_FILE")
            if (storeFilePath != null) {
                storeFile = rootProject.file(storeFilePath)
                storePassword = signingProp("storePassword", "TMS_KEYSTORE_PASSWORD")
                keyAlias = signingProp("keyAlias", "TMS_KEY_ALIAS")
                keyPassword = signingProp("keyPassword", "TMS_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            // Uses the `release` signing config when a keystore is configured;
            // otherwise falls back to debug keys so `flutter run --release`
            // keeps working on dev machines. Store builds MUST have a
            // keystore configured (CI fails the build when it is missing).
            val hasReleaseKey =
                signingConfigs.getByName("release").storeFile?.exists() == true ||
                    System.getenv("TMS_KEYSTORE_FILE")?.isNotBlank() == true
            signingConfig =
                if (hasReleaseKey) {
                    signingConfigs.getByName("release")
                } else {
                    logger.warn(
                        "[tms] No release keystore configured " +
                            "(keystore.properties or TMS_KEYSTORE_* env); " +
                            "signing release with debug keys. " +
                            "See apps/mobile/README.md.",
                    )
                    signingConfigs.getByName("debug")
                }
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }
}

flutter {
    source = "../.."
}
