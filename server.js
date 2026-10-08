#!/usr/bin/env node
// AirBridge - shares text and files between devices on one network.
// No dependencies, no accounts, no cloud. Run it, open the printed URL.

import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, "docs", "index.html");
const UPLOADS = join(HERE, "uploads");
const PORT = Number(process.env.PORT) || 8765;

const PASSWORD = process.env.AIRBRIDGE_PASSWORD || "";

const state = { text: "", files: [] };   // files: { id, name, size }
const clients = new Set();

// Basic auth: the browser draws the login box, so this needs no UI of its own.
// Unset password means LAN use, where the network is the boundary. Set one
// before exposing this past your own network.
const digest = s => createHash("sha256").update(s).digest();

function authorized(req) {
  if (!PASSWORD) return true;
  const [scheme, encoded] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const supplied = Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":");
  // Compare digests so the check cannot be timed to reveal the password.
  return timingSafeEqual(digest(supplied), digest(PASSWORD));
}

const sse = (res, event, data) =>
  res.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");

function broadcast(event, data) {
  for (const res of clients) sse(res, event, data);
}

const snapshot = () => ({ text: state.text, files: state.files, devices: clients.size });

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
  if (!authorized(req)) {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="AirBridge", charset="UTF-8"',
      "Content-Type": "text/plain"
    });
    return res.end("AirBridge: password required");
  }

  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const path = url.pathname;

  if (path === "/" || path === "/index.html") {
    const html = await readFile(PAGE);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (path === "/state") return json(res, 200, snapshot());

  // Live updates. Every device holds this open and gets told what changed.
  if (path === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    clients.add(res);
    sse(res, "sync", snapshot());
    broadcast("devices", { devices: clients.size });
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
      broadcast("devices", { devices: clients.size });
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
    const file = { id, name, size };
    state.files.unshift(file);
    broadcast("file", file);
    return json(res, 200, file);
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

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n  AirBridge is running.\n");
  console.log("  On this computer:  http://localhost:" + PORT);
  for (const ip of lanAddresses()) {
    console.log("  On your devices:   http://" + ip + ":" + PORT);
  }
  console.log("\n  Same Wi-Fi, any browser. Ctrl+C to stop.");
  console.log(PASSWORD
    ? "  Password is set - devices will be asked to log in.\n"
    : "  No password set. Fine on your own network; set AIRBRIDGE_PASSWORD\n" +
      "  before exposing this to the internet.\n");
});

export { server };
