# BabaSitaRam Pro — Android APK

## Project Structure
```
apk/
├── build.gradle              # Root Gradle config
├── settings.gradle
├── gradle.properties
└── app/
    ├── build.gradle          # App Gradle config
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── assets/
        │   └── index.html    # Main app (password-manager-pro.html)
        ├── java/com/babasitaram/pro/
        │   └── MainActivity.java
        └── res/
            ├── layout/activity_main.xml
            ├── values/strings.xml
            ├── values/styles.xml
            └── mipmap-*/     # App icons (add ic_launcher.png here)
```

## Build Steps

### Requirements
- Android Studio (latest) OR JDK 17 + Android SDK
- `ANDROID_HOME` environment variable set

### Android Studio (Recommended)
1. Open Android Studio → **Open** → select `apk/` folder
2. Wait for Gradle sync
3. Add app icons in `res/mipmap-*` folders (ic_launcher.png + ic_launcher_round.png)
4. **Build → Generate Signed APK** → release APK banao

### Command Line
```bash
cd apk
./gradlew assembleRelease    # Linux/Mac
gradlew.bat assembleRelease  # Windows
```
Output: `app/build/outputs/apk/release/app-release.apk`

## Icons Required
Add these files (PNG format):
- `res/mipmap-mdpi/ic_launcher.png`      — 48×48
- `res/mipmap-hdpi/ic_launcher.png`      — 72×72
- `res/mipmap-xhdpi/ic_launcher.png`     — 96×96
- `res/mipmap-xxhdpi/ic_launcher.png`    — 144×144
- `res/mipmap-xxxhdpi/ic_launcher.png`   — 192×192
- Same for `ic_launcher_round.png`

## Android Bridge
`MainActivity.java` exposes `window.AndroidBridge` to JS:
- `AndroidBridge.saveFile(content, filename, mimeType)` — Downloads folder mein save karta hai
- `AndroidBridge.isAndroid()` — returns `true`
- `AndroidBridge.getTimestamp()` — returns `yyyy-MM-dd` date

## Notes
- Data `localStorage` mein store hota hai (WebView isolated storage)
- Fingerprint/WebAuthn `file://` origin pe kaam nahi karta — Android BiometricPrompt future upgrade ke liye
- `allowBackup="false"` set hai — vault data Android backup mein nahi jayega
