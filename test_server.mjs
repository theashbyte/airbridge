// Smallest thing that fails if the transfer path breaks: run `node test_server.mjs`.
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

process.env.PORT = "8791";
process.env.AIRBRIDGE_PASSWORD = "correct horse";
const { server } = await import("./server.js");
const auth = { Authorization: "Basic " + Buffer.from("x:correct horse").toString("base64") };

// Patch fetch so every call below carries the password, then prove the gate works.
const bare = globalThis.fetch;
globalThis.fetch = (url, opts = {}) =>
  bare(url, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });
const base = "http://127.0.0.1:8791";
await new Promise(r => server.listening ? r() : server.once("listening", r));

// Text round-trips.
await fetch(base + "/text", { method: "POST", body: "hello from the other device" });
const afterText = await (await fetch(base + "/state")).json();
assert.equal(afterText.text, "hello from the other device");

// A file round-trips byte for byte, including a name that would break a header.
const payload = randomBytes(300_000);
const nastyName = 'we"ird\\na\u00efve.bin';
const meta = await (await fetch(base + "/upload?name=" + encodeURIComponent(nastyName), {
  method: "POST",
  body: payload
})).json();
assert.equal(meta.size, payload.length);
assert.equal(meta.name, nastyName);

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

// The gate itself: no password and a wrong password are both refused.
assert.equal((await bare(base + "/state")).status, 401);
const wrong = { Authorization: "Basic " + Buffer.from("x:wrong").toString("base64") };
assert.equal((await bare(base + "/state", { headers: wrong })).status, 401);
assert.equal((await bare(base + "/file/" + meta.id, { headers: wrong })).status, 401);

console.log("ok - auth gate, text sync, file round-trip, delete, clear-all, header escaping, bad ids");
server.close();   // let the loop drain on its own; process.exit() trips libuv on Windows
