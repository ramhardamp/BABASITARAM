# 🔐 BABASITARAM Vault - Professional Offline Password Manager

[![Build BABASITARAM Vault APK](https://github.com/ramhardamp/BABASITARAM/actions/workflows/build-apk.yml/badge.svg)](https://github.com/ramhardamp/BABASITARAM/actions/workflows/build-apk.yml)

A professional-grade, zero-knowledge, and completely offline password manager for **Android** and **Chrome/PC**. Built with high-security standards (600,000 PBKDF2 iterations) and a premium glassmorphism interface.

---

## 🚀 Key Features

- **🛡️ Elite Security**: AES-256 GCM encryption. No cloud, no server, 100% offline.
- **🕒 Security Audit Log**: Track all vault activities (Unlocks, Edits, Exports).
- **⏳ Password History**: Recover previous versions of passwords for any entry.
- **⚡ TOTP Authenticator**: Built-in 2FA generator (Google Authenticator style).
- **📱 Android Integration**: Native Autofill support and Biometric (Fingerprint) unlock.
- **📄 Smart Templates**: Dedicated fields for Logins, Cards, ID Cards, and Secure Notes.
- **📥 Universal Importer**: Support for Bitwarden, LastPass, Chrome CSV, and .vaultbak.
- **🔄 Universal Sync**: Master Password-based `.vaultbak` system works on PC and Mobile.

---

## 🇮🇳 मुख्य विशेषताएँ (Hindi)

- **🛡️ उच्च सुरक्षा**: AES-256 GCM एन्क्रिप्शन। कोई क्लाउड नहीं, पूरी तरह से ऑफलाइन।
- **🕒 सुरक्षा ऑडिट**: आपकी वॉल्ट की सभी गतिविधियों (Unlock, Edit, Export) पर नज़र रखें।
- **⏳ पासवर्ड इतिहास**: पुराने पासवर्ड को कभी भी देख और कॉपी कर सकते हैं।
- **⚡ TOTP ऑथेंटिकेटर**: ऐप के अंदर ही 2FA कोड (Google Authenticator जैसा) जेनरेट करें।
- **📱 एंड्रॉइड इंटीग्रेशन**: फिंगरप्रिंट लॉक और ऑटोफिल की सुविधा।
- **🔄 यूनिवर्सल सिंक**: पीसी और मोबाइल के बीच पासवर्ड आसानी से सिंक करें।

---

## 🛠️ Build Information

This repository contains:
1.  **Chrome Extension**: Source files in the root directory.
2.  **Android App**: Source files in `/AndroidProject`.

### How to Build (Android)
The APK is automatically built using **GitHub Actions**. 
1. Push changes to the `main` or `master` branch.
2. Go to the **Actions** tab in this repository.
3. Download the successful build artifact named `BABASITARAM-Vault-APK`.

---

## 🔒 Security Architecture
- **KDF**: PBKDF2-HMAC-SHA256 with 600,000 iterations.
- **Encryption**: AES-256-GCM.
- **Privacy**: Zero trackers, Zero internet permissions in the Android manifest.

---

## ⚖️ License
Personal & Commercial use allowed. All rights reserved by BABASITARAM.
