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

1. **Send a file:** on **Share**, drag it onto the drop zone, tap to pick one, or paste a screenshot. Every other device gets a "sent" card with a Save button.
2. **Sync text:** switch Share to **Text** and type. It reaches the other devices in about a third of a second. Copy copies it locally.
3. **Devices** lists who's connected. Name this device in **Settings** so others know who sent what.
4. **Activity** shows every file, sent or received, with search, download and delete-for-everyone.
5. Files are held on the computer running the server and are cleared every time you restart it.

## 🧪 Test

```bash
node test_server.mjs
```

Checks the passcode gate, lockout and sign-out-all, the device list, that text syncs, that a file comes back byte for byte, that filenames can't break out of the download header, and that unknown ids 404.

## 🔒 Security Note

AirBridge is unprotected by default: on your own network, the network is the boundary.
Set a password before exposing it anywhere else.

```bash
AIRBRIDGE_PASSWORD='some words you remember' node server.js
```

Every device then sees AirBridge's own passcode screen. Tick "Trust this device" to stay signed in for 7 days; otherwise the session ends when the browser closes. Five wrong tries lock that address out for a minute. **Settings → Sign out all** kicks every device back to the passcode screen if the passcode leaks.

* Fine on your home Wi-Fi.
* **Don't run it on public, cafe, or hotel Wi-Fi**, where strangers share the network.
* Guest networks on many routers isolate clients from each other, so devices won't see each other. Use your main network.

Windows may ask to allow Node through the firewall the first time. Allow it for **Private** networks, and for **Public** too if your Wi-Fi is classified that way (check with `Get-NetConnectionProfile`).

## 🌐 Reaching It From Anywhere

A [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) puts the same server on a real domain with HTTPS, with no port forwarding and no firewall rules:

```bash
cloudflared tunnel login
cloudflared tunnel create airbridge
cloudflared tunnel route dns airbridge airbridge.example.com
cloudflared tunnel run airbridge
```

Point `ingress` at `http://localhost:8765` in `~/.cloudflared/config.yml`. **Always set a password first** - this makes the server reachable from the public internet.

## 🛠️ How It Works

```
Browser  ──POST /text────────►  server.js  ──SSE /events──►  every other browser
Browser  ──POST /upload──────►  uploads/<uuid> on disk
Browser  ◄─GET /file/<uuid>──   streamed back with the original filename
```

Server-Sent Events push changes out; files stream to disk rather than being buffered in memory, so large files don't blow up RAM. Uploads are stored under a generated id, never the supplied filename.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
