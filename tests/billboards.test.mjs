import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";

test("billboard authorization, publishing, media and persistence", { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "navme-billboards-"));
  await writeFile(path.join(directory, "billboards.json"), "[]");
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NAVME_DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Test server did not start")), 15000);
    child.stdout.on("data", (data) => { if (data.toString().includes("Ready")) { clearTimeout(timer); resolve(); } });
    child.on("error", reject);
    child.on("exit", (code) => { if (code) { clearTimeout(timer); reject(new Error(`Test server exited: ${code}`)); } });
  });
  const password = randomUUID();
  let cookie = "";
  async function request(url, method = "GET", body, authorized = false, extraHeaders = {}) {
    return fetch(origin + url, {
      method,
      headers: { ...(method !== "GET" ? { origin, "Content-Type": "application/json", "x-survey-mode": "1" } : {}), ...(authorized ? { cookie } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const existingBuildings = await (await request("/api/buildings")).json();
  assert.equal(existingBuildings.length, 8);
  assert.equal((await request("/api/admin/billboards")).status, 401);
  for (const url of ["/api/admin/billboards", "/api/buildings"]) {
    assert.equal((await request(url, "PUT", [])).status, 403);
  }
  assert.equal((await request("/api/admin/media", "POST", {})).status, 403);
  const session = await request("/api/admin/session", "POST", { setup: true, password });
  assert.equal(session.status, 200);
  cookie = session.headers.get("set-cookie").split(";")[0];
  assert.match(session.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal((await request("/api/admin/billboards", "PUT", {}, true, { "x-survey-mode": "" })).status, 403);
  assert.equal((await request("/api/admin/billboards", "PUT", {}, true, { origin: "https://other.example" })).status, 403);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "Campus.png");
  const uploaded = await fetch(origin + "/api/admin/media", { method: "POST", headers: { origin, cookie, "x-survey-mode": "1" }, body: form });
  assert.equal(uploaded.status, 201);
  const media = await uploaded.json();
  const billboard = { id: randomUUID(), title: "Campus story", description: "Visitor content", position: existingBuildings[0].position, published: false, enabled: true, media: [media] };
  assert.equal((await request("/api/admin/billboards", "PUT", billboard, true)).status, 200);
  assert.deepEqual(await (await request("/api/billboards")).json(), []);
  assert.equal((await request(media.url)).status, 404);
  assert.equal((await request(media.url, "GET", undefined, true)).status, 200);
  billboard.published = true;
  await request("/api/admin/billboards", "PUT", billboard, true);
  assert.deepEqual(await (await request("/api/billboards")).json(), [billboard]);
  const range = await request(media.url, "GET", undefined, false, { range: "bytes=0-7" });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 8);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, "billboards.json"), "utf8")), [billboard]);
  billboard.enabled = false;
  await request("/api/admin/billboards", "PUT", billboard, true);
  assert.deepEqual(await (await request("/api/billboards")).json(), []);
  assert.equal((await request(media.url)).status, 404);
  assert.equal((await request(`/api/admin/billboards?id=${billboard.id}`, "DELETE", undefined, true)).status, 200);
  assert.deepEqual(await (await request("/api/admin/billboards", "GET", undefined, true)).json(), []);
  assert.deepEqual(await (await request("/api/buildings")).json(), existingBuildings);
  // A fresh clone must display the published snapshot and its bundled media.
  await rm(path.join(directory, "billboards.json"));
  const seeded = await (await request("/api/billboards")).json();
  assert.ok(seeded.length > 0);
  const bundledMedia = seeded.flatMap((billboard) => billboard.media)[0];
  if (bundledMedia) assert.equal((await request(bundledMedia.url)).status, 200);
  assert.equal((await request("/api/admin/session", "DELETE", undefined, true)).status, 200);
  assert.equal((await request("/api/admin/billboards")).status, 401);
});
