# AirBridge ⚡

AirBridge is a lightweight, real-time web application designed to instantly share text, clipboard data, and files across multiple devices connected to the same network. No cables, no USB drives, and no external software required.

## 🚀 Features

* **Real-Time Clipboard Sync:** Type or paste text on one device, and it instantly appears on all other connected devices.
* **Peer-to-Peer File Transfer:** When two or more devices have the app open, files travel directly between them over WebRTC at local network speed. Nothing is uploaded to the cloud.
* **Automatic Cloud Fallback:** If no other device is open, the file uploads to Firebase Storage instead, so a device that joins later still receives it.
* **Cross-Platform:** Works entirely in the browser. Access it from iOS, Android, Windows, Mac, or Linux.
* **Modern UI:** Clean, responsive design built with Tailwind CSS, featuring dark mode support and custom scrollbars.
* **Instant Downloads:** Shared files provide direct, immediate download links to all connected clients.

## 🛠️ Tech Stack

* **Frontend:** HTML5, JavaScript (ES6+), Tailwind CSS (via CDN)
* **Icons:** Lucide Icons
* **Transfer:** WebRTC DataChannels for direct device-to-device file transfer
* **Backend / Database:** Firebase (Firestore for real-time text sync, peer presence and WebRTC signaling; Firebase Storage for the cloud fallback)
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
3. Enable **Firebase Storage** (start in Test Mode for development).
4. Enable **Authentication** and turn on **Anonymous** sign-in.
5. Register a web app in your Firebase project settings to get your Firebase config object.

### 2. Project Setup
1. Clone this repository or download the `index.html` file.
2. Open `index.html` in your code editor.
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
npx serve .
```
Or with Python:
```bash
python -m http.server 8000
```

## 📱 How to Use

1. **Host Device:** Open the app in your browser via your local server (e.g., `http://localhost:8000`).
2. **Client Devices:** On your other devices (phones, tablets, laptops), connect to the same Wi-Fi network. Open a browser and navigate to the host's local IP address (e.g., `http://192.168.1.15:8000`).
3. **Sync Text:** Type in the "Shared Clipboard" box. The text will sync automatically to all devices. Click the copy icon to copy it locally.
4. **Share Files:** Click the drop zone or drag files into it. Once uploaded, the file will appear in the list for everyone to download.

## 🛡️ Security Note

By default, the Firebase rules are set to test mode (public access) to make setup easy. **Do not use test mode for sensitive data in production.** If you plan to leave this running permanently, please update your Firestore and Firebase Storage security rules to restrict access.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).