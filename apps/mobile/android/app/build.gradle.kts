import java.util.Properties

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
val keystoreProps = Properties()
val keystorePropsFile = rootProject.file("keystore.properties")
if (keystorePropsFile.exists()) {
    keystorePropsFile.inputStream().use { keystoreProps.load(it) }
}
fun signingProp(name: String, env: String): String? =
    (keystoreProps.getProperty(name) ?: System.getenv(env))?.takeIf { it.isNotBlank() }

val releaseStoreFile = signingProp("storeFile", "TMS_KEYSTORE_FILE")
val releaseStorePassword = signingProp("storePassword", "TMS_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingProp("keyAlias", "TMS_KEY_ALIAS")
val releaseKeyPassword = signingProp("keyPassword", "TMS_KEY_PASSWORD")
val allowDebugSigningForLocalRelease =
    providers.gradleProperty("tmsAllowDebugSigningForLocalRelease").orNull
        ?.toBooleanStrictOrNull() == true
val missingReleaseSigningValues =
    buildList {
        if (releaseStoreFile == null) add("storeFile / TMS_KEYSTORE_FILE")
        if (releaseStorePassword == null) add("storePassword / TMS_KEYSTORE_PASSWORD")
        if (releaseKeyAlias == null) add("keyAlias / TMS_KEY_ALIAS")
        if (releaseKeyPassword == null) add("keyPassword / TMS_KEY_PASSWORD")
        if (releaseStoreFile != null && !rootProject.file(releaseStoreFile).isFile) {
            add("storeFile (file not found: $releaseStoreFile)")
        }
    }

android {
    namespace = "com.tms.tmsmobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
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
            signingConfig = when {
                missingReleaseSigningValues.isEmpty() ->
                    signingConfigs.getByName("release")
                allowDebugSigningForLocalRelease -> {
                    logger.warn(
                        "[tms] Local-only release build is using debug signing " +
                            "because -PtmsAllowDebugSigningForLocalRelease=true was supplied.",
                    )
                    signingConfigs.getByName("debug")
                }
                else -> signingConfigs.getByName("release")
            }
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }
}

gradle.taskGraph.whenReady {
    val releaseRequested = allTasks.any { task ->
        task.project.path == project.path && task.name.contains("Release", ignoreCase = true)
    }
    if (
        releaseRequested &&
        missingReleaseSigningValues.isNotEmpty() &&
        !allowDebugSigningForLocalRelease
    ) {
        throw GradleException(
            "TMS release signing is incomplete: ${missingReleaseSigningValues.joinToString()}. " +
                "Configure android/keystore.properties or TMS_KEYSTORE_* environment variables. " +
                "For local-only testing, explicitly pass " +
                "-PtmsAllowDebugSigningForLocalRelease=true.",
        )
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
