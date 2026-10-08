// Smallest thing that fails if the transfer path breaks: run `node test_server.mjs`.
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

process.env.PORT = "8791";
const { server } = await import("./server.js");
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

console.log("ok - text sync, file round-trip, header escaping, bad ids");
server.close();   // let the loop drain on its own; process.exit() trips libuv on Windows
