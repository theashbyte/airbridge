# AirBridge ⚡

Share text and files between every device on your Wi-Fi, straight from the browser. No cables, no USB drives, no apps to install on the phone, and no cloud account.

Your computer runs a small server. Every other device just opens a URL.

## 🚀 Features

* **Real-Time Clipboard Sync:** Type or paste on one device and it appears on the others as you type.
* **Drag-and-Drop File Sharing:** Drop a file on any device; every other device gets a download link immediately.
* **Nothing Leaves Your Network:** Files live on your own computer for as long as the server runs. No account, no upload to anyone's cloud.
* **Cross-Platform:** Anything with a browser - iOS, Android, Windows, Mac, Linux.
* **Zero Dependencies:** One Node file using only the standard library. No `npm install`.

## 📋 Prerequisites

* [Node.js](https://nodejs.org/) 18 or newer on the computer running the server.
* Every device on the same Wi-Fi network.

That's the whole list. The other devices need nothing but a browser.

## ⚙️ Running It

```bash
node server.js
```

It prints the addresses to use:

```
  AirBridge is running.

  On this computer:  http://localhost:8765
  On your devices:   http://192.168.29.118:8765

  Same Wi-Fi, any browser. Ctrl+C to stop.
```

Open the second URL on your phone, tablet, or another laptop. The badge in the header shows how many devices are connected.

To use a different port: `PORT=3000 node server.js`

## 📱 How to Use

1. **Sync text:** type in the Shared Clipboard box. It reaches the other devices in about a third of a second. The copy button copies it locally.
2. **Send a file:** drag it onto the drop zone, or tap to pick one. It appears in everyone's list with a download button.
3. Files are held on the computer running the server and are cleared every time you restart it.

## 🧪 Test

```bash
node test_server.mjs
```

Checks that text syncs, that a file comes back byte for byte, that filenames can't break out of the download header, and that unknown ids 404.

## 🔒 Security Note

AirBridge trusts your local network. Anyone who can reach the URL can read the clipboard and download the shared files - there is no password.

* Fine on your home Wi-Fi.
* **Don't run it on public, cafe, or hotel Wi-Fi**, where strangers share the network.
* Guest networks on many routers isolate clients from each other, so devices won't see each other. Use your main network.

Windows may ask to allow Node through the firewall the first time. Allow it for **Private** networks, and for **Public** too if your Wi-Fi is classified that way (check with `Get-NetConnectionProfile`).

## 🛠️ How It Works

```
Browser  ──POST /text────────►  server.js  ──SSE /events──►  every other browser
Browser  ──POST /upload──────►  uploads/<uuid> on disk
Browser  ◄─GET /file/<uuid>──   streamed back with the original filename
```

Server-Sent Events push changes out; files stream to disk rather than being buffered in memory, so large files don't blow up RAM. Uploads are stored under a generated id, never the supplied filename.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
