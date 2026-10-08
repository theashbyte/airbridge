// Smallest thing that fails if the transfer path breaks: run `node test_server.mjs`.
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { get } from "node:http";

process.env.PORT = "8791";
process.env.AIRBRIDGE_PASSWORD = "correct horse";
// Never touch the real saved passcode.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
const PASSFILE = join(tmpdir(), "airbridge-test-passcode-" + process.pid);
process.env.AIRBRIDGE_PASSCODE_FILE = PASSFILE;
const { server, sessions } = await import("./server.js");
const base = "http://127.0.0.1:8791";
await new Promise(r => server.listening ? r() : server.once("listening", r));
const bare = globalThis.fetch;
const login = passcode => bare(base + "/login", { method: "POST", body: JSON.stringify({ passcode }) });

// The page loads without a passcode (it draws the passcode screen); data does not.
assert.equal((await bare(base + "/")).status, 200);
assert.equal((await bare(base + "/state")).status, 401);
assert.equal((await login("wrong")).status, 401);

// The right passcode returns a session cookie; patch fetch so every call below carries it.
const ok = await login("correct horse");
assert.equal(ok.status, 200);
const auth = { Cookie: ok.headers.get("set-cookie").split(";")[0] };
globalThis.fetch = (url, opts = {}) =>
  bare(url, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });

// A device that opens the live stream shows up, named, in the device list.
const stream = new AbortController();
const events = await fetch(base + "/events?id=dev1&name=Test%20phone", {
  signal: stream.signal, headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)" }
});
assert.match(new TextDecoder().decode((await events.body.getReader().read()).value), /^event: sync/);
const [device] = (await (await fetch(base + "/state")).json()).devices;
assert.deepEqual([device.id, device.name, device.system], ["dev1", "Test phone", "iPhone"]);

// Behind the tunnel, the real address comes from Cloudflare's header (loopback only).
const viaTunnel = new AbortController();
await fetch(base + "/events?id=dev2", { signal: viaTunnel.signal, headers: { "CF-Connecting-IP": "203.0.113.9" } });
const tunnelled = (await (await fetch(base + "/state")).json()).devices.find(d => d.id === "dev2");
assert.deepEqual([tunnelled.ip, tunnelled.host], ["203.0.113.9", false]);
viaTunnel.abort();

// A request through the tunnel teaches the server its public address.
// (fetch won't set Host, so a raw request plays cloudflared.)
await new Promise(done => get({ port: 8791, path: "/", headers: { "CF-Connecting-IP": "203.0.113.9", Host: "bridge.example.com" } },
  r => r.resume().on("end", done)));
assert.equal((await (await fetch(base + "/state")).json()).publicUrl, "https://bridge.example.com");

// Switching address: a signed-in page gets a one-time code that signs in elsewhere, once.
const { code } = await (await fetch(base + "/handoff", { method: "POST" })).json();
const swap = body => bare(base + "/login", { method: "POST", body: JSON.stringify(body) });
const handed = await swap({ handoff: code });
assert.equal(handed.status, 200);
assert.equal((await bare(base + "/state", { headers: { Cookie: handed.headers.get("set-cookie").split(";")[0] } })).status, 200);
assert.equal((await swap({ handoff: code })).status, 401);          // already used
assert.equal((await swap({ handoff: "f".repeat(64) })).status, 401); // never issued
assert.equal((await bare(base + "/handoff", { method: "POST" })).status, 401); // must be signed in to get one

// Text round-trips.
await fetch(base + "/text", { method: "POST", body: "hello from the other device" });
const afterText = await (await fetch(base + "/state")).json();
assert.equal(afterText.text, "hello from the other device");

// A file round-trips byte for byte, including a name that would break a header.
const payload = randomBytes(300_000);
const nastyName = 'we"ird\\na\u00efve.bin';
const meta = await (await fetch(base + "/upload?from=dev1&name=" + encodeURIComponent(nastyName), {
  method: "POST",
  body: payload
})).json();
assert.equal(meta.size, payload.length);
assert.equal(meta.name, nastyName);
assert.equal(meta.fromName, "Test phone");
stream.abort();

const back = await fetch(base + "/file/" + meta.id);
assert.equal(back.status, 200);
assert.deepEqual(Buffer.from(await back.arrayBuffer()), payload);
// A quote or backslash reaching the header raw would truncate the filename.
assert.ok(!/[^\x20-\x7E]|["\\]/.test(
  back.headers.get("content-disposition").match(/filename="([^"]*)"/)[1]
));

// Unknown ids 404 rather than reading something off disk.
assert.equal((await fetch(base + "/file/../../server.js")).status, 404);
assert.equal((await fetch(base + "/file/" + crypto.randomUUID())).status, 404);

// Deleting one file removes it everywhere; the bytes stop being served.
assert.equal((await fetch(base + "/file/" + meta.id, { method: "DELETE" })).status, 200);
assert.equal((await fetch(base + "/file/" + meta.id)).status, 404);
assert.equal((await (await fetch(base + "/state")).json()).files.length, 0);
assert.equal((await fetch(base + "/file/" + meta.id, { method: "DELETE" })).status, 404);

// Clear-all empties the list whatever is in it.
await fetch(base + "/upload?name=a.txt", { method: "POST", body: "a" });
await fetch(base + "/upload?name=b.txt", { method: "POST", body: "b" });
assert.equal((await (await fetch(base + "/state")).json()).files.length, 2);
assert.equal((await fetch(base + "/files", { method: "DELETE" })).status, 200);
assert.equal((await (await fetch(base + "/state")).json()).files.length, 0);

// Changing the passcode needs the current one, saves only a hash, and
// signs everyone else out while keeping the device that changed it.
const change = (body, headers = {}) =>
  fetch(base + "/passcode", { method: "POST", headers, body: JSON.stringify(body) });
assert.equal((await change({ current: "nope", next: "new pass" })).status, 403);
assert.equal((await change({ current: "correct horse", next: "abc" })).status, 400);
const changed = await change({ current: "correct horse", next: "new pass" });
assert.equal(changed.status, 200);
assert.ok(!readFileSync(PASSFILE, "utf8").includes("new pass"), "stored as a hash");
assert.equal((await fetch(base + "/state")).status, 401, "old session is gone");
const mine = { Cookie: changed.headers.get("set-cookie").split(";")[0] };
assert.equal((await bare(base + "/state", { headers: mine })).status, 200, "changer stays signed in");
assert.equal((await login("correct horse")).status, 401);
const fresh = await login("new pass");
assert.equal(fresh.status, 200);
auth.Cookie = fresh.headers.get("set-cookie").split(";")[0];

// Turning it off opens the door and deletes the saved hash; turning it on again closes it.
assert.equal((await change({ current: "new pass", next: "" })).status, 200);
assert.equal((await bare(base + "/state")).status, 200);
assert.ok(!existsSync(PASSFILE));
const reenabled = await change({ next: "correct horse" });
assert.equal(reenabled.status, 200);
assert.equal((await bare(base + "/state")).status, 401);
auth.Cookie = reenabled.headers.get("set-cookie").split(";")[0];

// The gate itself: no cookie and a forged cookie are both refused.
assert.equal((await bare(base + "/state")).status, 401);
const forged = { Cookie: "ab_session=" + "0".repeat(64) };
assert.equal((await bare(base + "/state", { headers: forged })).status, 401);
assert.equal((await bare(base + "/file/" + meta.id, { headers: forged })).status, 401);

// Five misses lock the address out, even for the right passcode.
for (let i = 0; i < 5; i++) await login("nope");
assert.equal((await login("correct horse")).status, 429);

// Sign-out-all kills every session, including the one that asked.
assert.equal((await fetch(base + "/logout-all", { method: "POST" })).status, 200);
assert.equal(sessions.size, 0);
assert.equal((await fetch(base + "/state")).status, 401);

console.log("ok - passcode gate, change/turn off passcode, lockout, sign-out-all, device list, tunnel address, address switch handoff, text sync, file round-trip, delete, clear-all, header escaping, bad ids");
server.close();   // let the loop drain on its own; process.exit() trips libuv on Windows
