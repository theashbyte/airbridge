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

### Windows: one double-click

Double-click **`start.cmd`**. It does everything:

1. Stops any AirBridge that's already running, so double-clicking again is a restart.
2. Starts your Cloudflare Tunnel in its own minimized window, if you've set one up and it isn't already running.
3. Starts AirBridge, which restarts itself whenever `server.js` changes (after a `git pull`, say).
4. Opens AirBridge in your browser.

Keep the AirBridge window open while you use it. Close it, or press Ctrl+C, to stop. Every restart clears the shared files.

### Any OS

```bash
node --watch server.js
```

It prints the addresses to use:

```
  AirBridge is running.

  On this computer:  http://localhost:8765
  On your devices:   http://192.168.29.118:8765
```

Open the second one on your phone, tablet or another laptop. To use a different port: `PORT=3000 node server.js`.

### The passcode

Set it on the website: **Settings → Passcode → Set passcode**. From then on every device sees a passcode screen.

* **Change it:** Settings → Passcode → **Change**. Enter the current one, then the new one twice. Every other device is signed out and has to enter the new one; the device you changed it on stays signed in.
* **Turn it off:** Settings → Passcode → Change → **Turn passcode off**. This needs the current passcode.
* **It's remembered across restarts.** AirBridge keeps only a salted hash in `.airbridge-passcode` (never the passcode itself, and never committed to git).
* **Forgot it?** Delete `.airbridge-passcode` and restart. AirBridge comes up with no passcode, and you set a new one in Settings.
* Optional: starting with `AIRBRIDGE_PASSWORD=...` set replaces the saved passcode.

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

Checks the passcode gate, changing and turning off the passcode, lockout and sign-out-all, the device list, that text syncs, that a file comes back byte for byte, that filenames can't break out of the download header, and that unknown ids 404.

## 🔒 Security Note

AirBridge has no passcode until you set one (Settings → Passcode). On your own Wi-Fi the network is the boundary; **set a passcode before using the Internet (tunnel) address.**

Every device then sees AirBridge's own passcode screen. Tick "Trust this device" to stay signed in for 7 days; otherwise the session ends when the browser closes. Five wrong tries lock that address out for a minute. **Settings → Sign out all** kicks every device back to the passcode screen if the passcode leaks.

* Fine on your home Wi-Fi.
* **Don't run it on public, cafe, or hotel Wi-Fi**, where strangers share the network.
* Guest networks on many routers isolate clients from each other, so devices won't see each other. Use your main network.

**Phones can't open the Wi-Fi address?** It's almost always the Windows Firewall, especially when Windows calls your Wi-Fi "Public". Run this once in an admin PowerShell. It opens the port to your own network only:

```powershell
New-NetFirewallRule -DisplayName "AirBridge (port 8765, local network only)" -Direction Inbound -Protocol TCP -LocalPort 8765 -RemoteAddress LocalSubnet -Action Allow -Profile Any
```

## 🌐 Reaching It From Anywhere

A [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) puts the same server on a real domain with HTTPS, with no port forwarding and no firewall rules:

```bash
cloudflared tunnel login
cloudflared tunnel create airbridge
cloudflared tunnel route dns airbridge airbridge.example.com
cloudflared tunnel run airbridge
```

Point `ingress` at `http://localhost:8765` in `~/.cloudflared/config.yml`. **Set a passcode in Settings first** - this makes the server reachable from the public internet.

**Wi-Fi / Internet switch:** every page has a toggle between the Wi-Fi address (fast, home only) and the tunnel (anywhere, much slower: ~200 MB/s vs ~1.5 MB/s in testing). You stay signed in when you switch. The server learns the tunnel address from the first request through it; set `AIRBRIDGE_PUBLIC_URL=https://airbridge.example.com` to have it from the start.

## 🛠️ How It Works

```
Browser  ──POST /text────────►  server.js  ──SSE /events──►  every other browser
Browser  ──POST /upload──────►  uploads/<uuid> on disk
Browser  ◄─GET /file/<uuid>──   streamed back with the original filename
```

Server-Sent Events push changes out; files stream to disk rather than being buffered in memory, so large files don't blow up RAM. Uploads are stored under a generated id, never the supplied filename.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
