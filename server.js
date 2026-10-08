#!/usr/bin/env node
// AirBridge - shares text and files between devices on one network.
// No dependencies, no accounts, no cloud. Run it, open the printed URL.

import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, "docs", "index.html");
const UPLOADS = join(HERE, "uploads");
const PORT = Number(process.env.PORT) || 8765;

// The passcode is set and changed from the page (Settings) and survives
// restarts. Only a salted scrypt hash is kept, never the passcode itself.
// AIRBRIDGE_PASSWORD, if set at startup, replaces the saved one.
const PASSFILE = process.env.AIRBRIDGE_PASSCODE_FILE || join(HERE, ".airbridge-passcode");
let passHash = "";   // "salt:hash", or "" for no passcode

const state = { text: "", files: [] };   // files: { id, name, size, from, at }
const clients = new Map();               // SSE response -> { id, name, system, ip }
const started = Date.now();

// The page draws its own passcode screen; a correct passcode buys a session
// cookie. Unset password means LAN use, where the network is the boundary.
// Set one before exposing this past your own network.
const sessions = new Set();
const hashOf = (s, salt = randomBytes(16).toString("hex")) =>
  salt + ":" + scryptSync(String(s), salt, 32).toString("hex");
// Same salt, same length, so the comparison is constant-time.
const passcodeOk = s => Boolean(passHash) &&
  timingSafeEqual(Buffer.from(hashOf(s, passHash.split(":")[0])), Buffer.from(passHash));

async function setPasscode(next) {
  passHash = next ? hashOf(next) : "";
  if (passHash) await writeFile(PASSFILE, passHash);
  else await rm(PASSFILE, { force: true });
}

const cookie = req => (req.headers.cookie || "").match(/(?:^|;\s*)ab_session=([^;]+)/)?.[1];
const authorized = req => !passHash || sessions.has(cookie(req));

function startSession(req, res, trust) {
  const token = randomBytes(32).toString("hex");
  sessions.add(token);
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  // Without "trust", the cookie dies with the browser session.
  const age = trust ? "; Max-Age=" + 7 * 86400 : "";
  res.setHeader("Set-Cookie", "ab_session=" + token + "; Path=/; HttpOnly; SameSite=Strict" + age + secure);
}

// A guessable passcode plus unlimited tries is no passcode. Per address:
// 5 misses, then a minute's wait. ponytail: in-memory, resets on restart.
const failures = new Map();   // ip -> { count, until }
const LOCKOUT = 5, LOCKOUT_MS = 60_000;

function lockedOut(req, res) {
  const f = failures.get(ipOf(req));
  if (!f || f.until <= Date.now()) return false;
  json(res, 429, { error: "Too many tries. Wait " + Math.ceil((f.until - Date.now()) / 1000) + "s." });
  return true;
}

function miss(req) {
  const ip = ipOf(req);
  const count = (failures.get(ip)?.count || 0) + 1;
  failures.set(ip, { count: count >= LOCKOUT ? 0 : count, until: count >= LOCKOUT ? Date.now() + LOCKOUT_MS : 0 });
}

// Through a Cloudflare Tunnel every request arrives from cloudflared on this
// machine; the device's real address is in a header. Trust that header only
// from loopback, so a device on the LAN cannot spoof it.
const viaTunnel = req =>
  ["127.0.0.1", "::1"].includes((req.socket.remoteAddress || "").replace(/^::ffff:/, "")) &&
  Boolean(req.headers["cf-connecting-ip"]);
const ipOf = req => viaTunnel(req)
  ? String(req.headers["cf-connecting-ip"])
  : (req.socket.remoteAddress || "").replace(/^::ffff:/, "");

// The page offers a Wi-Fi <-> Internet switch, so it needs the tunnel's
// address. Set it, or let the first request through the tunnel teach it.
let publicUrl = (process.env.AIRBRIDGE_PUBLIC_URL || "").replace(/\/+$/, "");

// Another address is another site to the browser, with its own cookies.
// A signed-in page swaps its session for a one-time code and carries it
// across in the URL, so switching does not mean typing the passcode again.
const handoffs = new Map();   // code -> expiry
const HANDOFF_MS = 60_000;

function systemOf(ua = "") {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Browser";
}

// One entry per device, even with the page open in several tabs.
function deviceList() {
  const hosts = new Set(["127.0.0.1", "::1", ...lanAddresses()]);
  const byId = new Map();
  for (const d of clients.values()) byId.set(d.id, { ...d, host: hosts.has(d.ip) });
  return [...byId.values()];
}

const nameOf = id => [...clients.values()].find(d => d.id === id)?.name || "";

// A stream we just ended stays in `clients` until its close event fires;
// writing to it in between would crash the server.
const sse = (res, event, data) =>
  res.writableEnded || res.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");

function broadcast(event, data) {
  for (const res of clients.keys()) sse(res, event, data);
}

const snapshot = () => ({
  text: state.text, files: state.files, devices: deviceList(),
  passcode: Boolean(passHash), port: PORT, addresses: lanAddresses(), started, publicUrl
});
const broadcastDevices = () => broadcast("devices", deviceList());

// Send the whole list on every change. Cheap at this size, and it keeps a
// device that missed one event from drifting out of sync.
const broadcastFiles = () => broadcast("files", state.files);

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      body += chunk;
      if (body.length > limit) {
        req.destroy();
        reject(new Error("body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// A filename reaches us from another device, so it is untrusted input that
// ends up in a response header. Strip anything that could break out of it.
const headerSafe = name => name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");

const json = (res, code, value) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
};

async function handle(req, res) {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const path = url.pathname;
  if (viaTunnel(req) && req.headers.host && !process.env.AIRBRIDGE_PUBLIC_URL) publicUrl = "https://" + req.headers.host;

  // The page itself is public: it holds no data, and it has to load to show
  // the passcode screen.
  if (path === "/" || path === "/index.html") {
    const html = await readFile(PAGE);
    // Never cache the page, or a phone keeps running yesterday's JavaScript
    // and no amount of refreshing explains why a fix did not take.
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    return res.end(html);
  }

  if (path === "/login" && req.method === "POST") {
    if (!passHash) return json(res, 200, { ok: true });
    if (lockedOut(req, res)) return;
    let body = {};
    try { body = JSON.parse(await readBody(req, 4096)); } catch { }
    const handedOff = handoffs.get(body.handoff) > Date.now();
    handoffs.delete(body.handoff);   // single use, whatever happens next
    if (!handedOff && !passcodeOk(body.passcode || "")) {
      miss(req);
      return json(res, 401, { error: "Wrong passcode." });
    }
    failures.delete(ipOf(req));
    startSession(req, res, body.trust);
    return json(res, 200, { ok: true });
  }

  if (!authorized(req)) return json(res, 401, { error: "locked" });

  // Set, change or remove the passcode. Always asks for the current one, so
  // a device left unlocked can't be used to take AirBridge over.
  if (path === "/passcode" && req.method === "POST") {
    if (lockedOut(req, res)) return;
    let body = {};
    try { body = JSON.parse(await readBody(req, 4096)); } catch { }
    if (passHash && !passcodeOk(body.current || "")) {
      miss(req);
      // 403, not 401: the page treats 401 as "you're signed out".
      return json(res, 403, { error: "Current passcode is wrong." });
    }
    const next = String(body.next || "");
    if (next && next.length < 4) return json(res, 400, { error: "Use at least 4 characters." });
    if (next.length > 128) return json(res, 400, { error: "That's too long." });
    await setPasscode(next);
    sessions.clear();
    if (next) {
      // Keep the device that made the change signed in; everyone else
      // has to enter the new passcode.
      startSession(req, res, true);
      const me = req.headers["x-client-id"];
      for (const [r, d] of clients) if (d.id !== me) { sse(r, "locked", {}); r.end(); }
    }
    console.log(new Date().toLocaleTimeString() + "  passcode " + (next ? "changed" : "turned off"));
    broadcast("sync", snapshot());
    return json(res, 200, { ok: true });
  }

  if (path === "/handoff" && req.method === "POST") {
    const now = Date.now();
    for (const [c, until] of handoffs) if (until < now) handoffs.delete(c);
    const code = randomBytes(32).toString("hex");
    handoffs.set(code, now + HANDOFF_MS);
    return json(res, 200, { code });
  }

  if (path === "/logout" && req.method === "POST") {
    sessions.delete(cookie(req));
    res.setHeader("Set-Cookie", "ab_session=; Path=/; Max-Age=0");
    return json(res, 200, { ok: true });
  }

  if (path === "/logout-all" && req.method === "POST") {
    sessions.clear();
    // Open streams were authorised by the old sessions; cut them so every
    // device lands back on the passcode screen.
    broadcast("locked", {});
    for (const r of clients.keys()) r.end();
    return json(res, 200, { ok: true });
  }

  if (path === "/state") return json(res, 200, snapshot());

  // Live updates. Every device holds this open and gets told what changed.
  if (path === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const system = systemOf(req.headers["user-agent"]);
    clients.set(res, {
      id: (url.searchParams.get("id") || randomUUID()).slice(0, 64),
      name: (url.searchParams.get("name") || "").trim().slice(0, 40) || system,
      system,
      ip: ipOf(req)
    });
    sse(res, "sync", snapshot());
    broadcastDevices();
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
      broadcastDevices();
    });
    return;
  }

  if (path === "/text" && req.method === "POST") {
    state.text = await readBody(req);
    // Echoing a device's own text back would fight with its cursor.
    broadcast("text", { text: state.text, from: req.headers["x-client-id"] || "" });
    return json(res, 200, { ok: true });
  }

  if (path === "/upload" && req.method === "POST") {
    const name = (url.searchParams.get("name") || "file").slice(0, 255);
    const id = randomUUID();
    await mkdir(UPLOADS, { recursive: true });
    await pipeline(req, createWriteStream(join(UPLOADS, id)));
    const { size } = await stat(join(UPLOADS, id));
    const from = url.searchParams.get("from") || "";
    const file = { id, name, size, from, fromName: nameOf(from), at: Date.now() };
    state.files.unshift(file);
    broadcastFiles();
    console.log(new Date().toLocaleTimeString() + "  received  " + name +
      "  " + (size / 1048576).toFixed(1) + " MB");
    return json(res, 200, file);
  }

  if (path === "/files" && req.method === "DELETE") {
    state.files = [];
    await rm(UPLOADS, { recursive: true, force: true });
    broadcastFiles();
    return json(res, 200, { ok: true });
  }

  if (path.startsWith("/file/") && req.method === "DELETE") {
    const id = path.slice(6);
    const index = state.files.findIndex(f => f.id === id);
    if (index === -1) return json(res, 404, { error: "gone" });
    state.files.splice(index, 1);
    // Drop the metadata first, so a download racing this delete 404s
    // rather than finding a half-removed file.
    await rm(join(UPLOADS, id), { force: true });
    broadcastFiles();
    return json(res, 200, { ok: true });
  }

  if (path.startsWith("/file/")) {
    // Files are stored under a generated id, never under the supplied name,
    // so a name like "../../etc/passwd" cannot point anywhere.
    const file = state.files.find(f => f.id === path.slice(6));
    if (!file) return json(res, 404, { error: "gone" });
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": file.size,
      "Content-Disposition": "attachment; filename=\"" + headerSafe(file.name) +
        "\"; filename*=UTF-8''" + encodeURIComponent(file.name)
    });
    return createReadStream(join(UPLOADS, file.id)).pipe(res);
  }

  json(res, 404, { error: "not found" });
}

const server = createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(new Date().toLocaleTimeString() + "  FAILED  " + req.method + " " +
      req.url + "  " + (err.message || err));
    if (res.headersSent) return res.end();
    json(res, 500, { error: String(err.message || err) });
  });
});

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(i => i && i.family === "IPv4" && !i.internal)
    .map(i => i.address);
}

// Each run starts clean, so transfers never pile up on disk between sessions.
await rm(UPLOADS, { recursive: true, force: true });

if (process.env.AIRBRIDGE_PASSWORD) await setPasscode(process.env.AIRBRIDGE_PASSWORD);
else passHash = (await readFile(PASSFILE, "utf8").catch(() => "")).trim();

server.on("error", err => {
  if (err.code !== "EADDRINUSE") throw err;
  console.error("\n  Port " + PORT + " is already in use, most likely by another AirBridge.\n" +
    "  Close that window (or run start.cmd, which stops it), or pick another port: PORT=8766\n");
  process.exitCode = 1;
});

// No host: Node listens on IPv6 and IPv4 together. With "0.0.0.0", anything
// that tries localhost as ::1 first (cloudflared does) stalls 2s per
// connection on Windows before falling back to IPv4.
server.listen(PORT, () => {
  console.log("\n  AirBridge is running.\n");
  console.log("  On this computer:  http://localhost:" + PORT);
  for (const ip of lanAddresses()) {
    console.log("  On your devices:   http://" + ip + ":" + PORT);
  }
  console.log("\n  Same Wi-Fi, any browser. Ctrl+C to stop.");
  console.log(passHash
    ? "  Passcode is on. Change it in Settings on the website.\n"
    : "  No passcode yet. Set one in Settings on the website before\n" +
      "  using it over the internet.\n");
});

export { server, sessions };
