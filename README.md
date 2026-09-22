# AirBridge ⚡

AirBridge is a lightweight, real-time web application designed to instantly share text, clipboard data, and files across multiple devices connected to the same network. No cables, no USB drives, and no external software required.

## 🚀 Features

* **Real-Time Clipboard Sync:** Type or paste text on one device, and it instantly appears on all other connected devices.
* **Peer-to-Peer File Transfer:** With the app open on two or more devices, files travel straight between them over WebRTC at local network speed. Firebase sees the connection handshake, never a byte of the file.
* **Cross-Platform:** Works entirely in the browser. Access it from iOS, Android, Windows, Mac, or Linux.
* **Modern UI:** Clean, responsive design built with Tailwind CSS, featuring dark mode support and custom scrollbars.
* **Instant Downloads:** Received files appear immediately with a download link. They live in the browser tab only, so nothing lingers on a server.

## 🛠️ Tech Stack

* **Frontend:** HTML5, JavaScript (ES6+), Tailwind CSS (via CDN)
* **Icons:** Lucide Icons
* **Transfer:** WebRTC DataChannels for direct device-to-device file transfer
* **Backend / Database:** Firebase Firestore - real-time text sync, peer presence, and WebRTC signaling. Firebase Storage is not used.
* **Authentication:** Firebase Anonymous Authentication

## 📋 Prerequisites

To run this project yourself using Firebase, you will need:
1. A modern web browser.
2. A free [Firebase account](https://firebase.google.com/).
3. A basic code editor (like VS Code).

## ⚙️ Setup & Installation

### 1. Firebase Configuration
Since AirBridge relies on Firebase for real-time syncing, you need to set up a Firebase project:

1. Go to the Firebase Console and create a new project.
2. Enable **Firestore Database** (start in Test Mode for development).
3. Enable **Authentication** and turn on **Anonymous** sign-in.
4. Register a web app in your Firebase project settings to get your Firebase config object.

You do **not** need Firebase Storage, so you do not need the Blaze billing plan. Firestore's free tier is enough - text sync and signaling are a few hundred bytes per message.

### 2. Project Setup
1. Clone this repository or download `docs/index.html`.
2. Open `docs/index.html` in your code editor.
3. Locate the Firebase initialization section in the script and replace the placeholder `__firebase_config` with your actual Firebase config object:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Running the App
Because the app uses standard ES modules for Firebase, it must be served over `http://` or `https://`, not directly from the file system (`file://`).

You can use a simple local server to run it. If you have Node.js installed, use `npx`:
```bash
npx serve docs
```
Or with Python:
```bash
python -m http.server 8000 --directory docs
```

## 📱 How to Use

1. **Host Device:** Open the app in your browser via your local server (e.g., `http://localhost:8000`).
2. **Client Devices:** On your other devices (phones, tablets, laptops), connect to the same Wi-Fi network. Open a browser and navigate to the host's local IP address (e.g., `http://192.168.1.15:8000`).
3. **Sync Text:** Type in the "Shared Clipboard" box. The text syncs automatically to every device. Click the copy icon to copy it locally.
4. **Share Files:** Once the badge in the header turns green and reads "N direct", click the drop zone or drag files into it. The file streams straight to the other devices and appears in their list.

> **File transfer requires HTTPS.** Browsers only expose WebRTC in a secure context, and a plain `http://192.168.x.x` address is not one. Over a local IP, text sync works but file transfer stays disabled. Host the page over HTTPS - GitHub Pages, Firebase Hosting, Cloudflare Pages, or a tunnel like `ngrok` - and file transfer works on every device, on or off your Wi-Fi.

## 🛡️ Security Note

By default, the Firestore rules are set to test mode (public access) to make setup easy. **Do not leave test mode on.** At minimum require authentication:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{room}/{doc=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Since anonymous sign-in is open to anyone, this stops unauthenticated scripts but not a person with your URL. Your actual privacy control is the room name in the URL fragment (`#a7f3k9`) - it never leaves the browser, so it is not in your Firebase data either. Treat it like a password.

Files are peer-to-peer and are never stored anywhere, so no storage rules are needed.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).