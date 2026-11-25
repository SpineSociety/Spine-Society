import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const chromium = "/repl/tools/bin/chromium";
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

async function runMobileBrowser(url, width) {
  const profile = await mkdtemp(`${tmpdir()}/reader-bookshelf-chrome-`);
  const process = spawn(chromium, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  process.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const debuggerUrl = await new Promise((resolveUrl, rejectUrl) => {
    const timer = setTimeout(() => rejectUrl(new Error(`Chromium debugger did not start: ${stderr}`)), 12000);
    const inspect = () => {
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolveUrl(match[1]); return true; }
      return false;
    };
    if (inspect()) return;
    const interval = setInterval(() => {
      if (inspect()) clearInterval(interval);
    }, 30);
    process.once("error", error => { clearTimeout(timer); clearInterval(interval); rejectUrl(error); });
    process.once("close", code => {
      clearTimeout(timer);
      clearInterval(interval);
      rejectUrl(new Error(`Chromium exited ${code}: ${stderr}`));
    });
  });

  const socket = new WebSocket(debuggerUrl);
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const slot = pending.get(message.id);
    if (!slot) return;
    pending.delete(message.id);
    clearTimeout(slot.timer);
    message.error ? slot.reject(new Error(message.error.message)) : slot.resolve(message.result);
  });
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  const command = (method, params = {}, sessionId) => new Promise((resolveCommand, rejectCommand) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectCommand(new Error(`CDP command timed out: ${method}`));
    }, 5000);
    pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  try {
    const { targetId } = await command("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    await command("Page.enable", {}, sessionId);
    await command("Runtime.enable", {}, sessionId);
    await command("Emulation.setDeviceMetricsOverride", {
      width, height: 900, deviceScaleFactor: 1, mobile: true,
    }, sessionId);
    await command("Page.navigate", { url }, sessionId);
    let report = "";
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await new Promise(resolvePoll => setTimeout(resolvePoll, 50));
      const result = await command("Runtime.evaluate", {
        expression: "document.querySelector('#testReport')?.textContent || ''",
        returnByValue: true,
      }, sessionId);
      report = result.result?.value || "";
      if (/^(PASS|FAIL)/.test(report)) break;
    }
    return { report, stderr };
  } finally {
    socket.close();
    process.kill("SIGTERM");
    await new Promise(resolveClose => {
      if (process.exitCode !== null) resolveClose();
      else process.once("close", resolveClose);
    });
    await rm(profile, { recursive: true, force: true });
  }
}

test("integrated shelf controls and pointer interactions remain usable at 375px and 390px", async t => {
  try {
    await readFile(chromium);
  } catch {
    t.skip("Chromium is not installed in this environment.");
    return;
  }

  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = resolve(root, `.${pathname}`);
      if (file !== root && !file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise(resolveServer => server.listen(0, "127.0.0.1", resolveServer));
  const { port } = server.address();
  t.after(() => new Promise(resolveServer => server.close(resolveServer)));

  for (const width of [375, 390]) {
    const browser = await runMobileBrowser(
      `http://127.0.0.1:${port}/tests/library-arrangement-browser-fixture.html`, width
    );
    const report = browser.report;
    assert.match(report, /PASS/, `Mobile interaction fixture failed at ${width}px: ${report}`);
    assert.match(report, new RegExp(`${width}px`));
    assert.match(report, /cross-shelf|shelf rows/);
  }
});
