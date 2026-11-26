import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const baseline = process.env.NOOK_LAYOUT_BASELINE === "1";
const output = resolve(root, "generated-artifacts/nook-mobile-hotfix", baseline ? "before" : "after");
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };

async function startBrowser(width, height) {
  const profile = await mkdtemp(`${tmpdir()}/nook-mobile-layout-`);
  const process = spawn("/repl/tools/bin/chromium", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--no-first-run", "--no-default-browser-check",
    // No remote origin, including production Firebase, can resolve in this test.
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const debuggerUrl = await new Promise((resolveUrl, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(stderr || "Chromium startup timed out")), 15000);
    process.stderr.on("data", chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolveUrl(match[1]); }
    });
    process.once("error", reject);
  });
  const socket = new WebSocket(debuggerUrl);
  await new Promise(resolveOpen => socket.addEventListener("open", resolveOpen, { once: true }));
  const pending = new Map();
  const exceptions = [];
  let sequence = 0;
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
    const slot = pending.get(message.id);
    if (!slot) return;
    pending.delete(message.id);
    clearTimeout(slot.timer);
    message.error ? slot.reject(new Error(message.error.message)) : slot.resolve(message.result);
  });
  const command = (method, params = {}, sessionId) => new Promise((resolveCommand, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15000);
    pending.set(id, { resolve: resolveCommand, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await command("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => command(method, params, sessionId);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  return {
    send, exceptions,
    async evaluate(expression) {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result?.value;
    },
    async close() {
      socket.close();
      process.kill("SIGTERM");
      await new Promise(resolveExit => {
        if (process.exitCode !== null) resolveExit(); else process.once("exit", resolveExit);
      });
      await rm(profile, { recursive: true, force: true });
    },
  };
}
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));
const metrics = `(() => {
  const box = selector => {
    const node = document.querySelector(selector), rect = node.getBoundingClientRect(), css = getComputedStyle(node);
    return { tag: node.tagName, parent: node.parentElement?.className, top: rect.top,
      bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width,
      height: rect.height, client: node.clientHeight, scroll: node.scrollHeight,
      scrollTop: node.scrollTop, overflow: css.overflow, background: css.backgroundColor };
  };
  return { viewport: { width: innerWidth, height: innerHeight },
    documentWidth: document.documentElement.scrollWidth, bodyClass: document.body.className,
    frame: box('.phone-frame'), content: box('.app-content'), main: box('#mainApp'),
    nook: box('#nookScreen'), nav: box('#mainNav'),
    collection: box('.phase4b1-nook-room-card'), circles: box('.nook-circles-section'),
    hit: [300, 650].map(y => {
      let node = document.elementFromPoint(innerWidth / 2, y);
      const ancestors = [];
      while(node) {
        const css = getComputedStyle(node);
        ancestors.push({tag:node.tagName,id:node.id,class:node.className,
          touchAction:css.touchAction,pointerEvents:css.pointerEvents,overflow:css.overflow});
        node = node.parentElement;
      }
      return {y,ancestors};
    }),
    books: [...document.querySelectorAll('#nookCollectionShelf .library-spine-title')].map(n => {
      const r = n.getBoundingClientRect();
      const surface = n.closest('.library-book-spine').getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(n);
      const text = range.getBoundingClientRect();
      return { title: n.textContent, width: r.width, height: r.height, font: getComputedStyle(n).fontSize,
        surface: { top:surface.top, bottom:surface.bottom, left:surface.left, right:surface.right },
        text: { top:text.top, bottom:text.bottom, left:text.left, right:text.right } };
    }), auth: window.__mobileLayoutTest };
})()`;

test("full application Nook touch/wheel scroll and navigation at iPhone sizes, local data only", async t => {
  await mkdir(output, { recursive: true });
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, "http://127.0.0.1").pathname;
      const file = resolve(root, path === "/" ? "index.html" : `.${decodeURIComponent(path)}`);
      if (!file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
      let body = baseline && path === "/library-restoration.css"
        ? execFileSync("git", ["show", "456dfff:library-restoration.css"], { cwd: root })
        : await readFile(file);
      if (path === "/script.js") {
        body = body.toString().replace(
          /https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/firebase-(app|auth|database)\.js/g,
          "./tests/helpers/mobile-layout-firebase.mjs");
      }
      response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream",
        "cache-control": "no-store" });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolveServer => server.listen(0, "127.0.0.1", resolveServer));
  t.after(() => new Promise(resolveServer => server.close(resolveServer)));
  for (const [width, height, count] of [[375, 812, 3], [390, 844, 6]]) {
    await t.test(`${width}x${height}, ${count} fictional books`, async () => {
      const browser = await startBrowser(width, height);
      try {
        await browser.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?books=${count}` });
        let ready = false;
        for (let i = 0; i < 120; i++) {
          await pause(100);
          ready = await browser.evaluate("Boolean(window.__mobileLayoutTest?.authReady && document.querySelector('#nookCollectionShelf .library-book-spine'))");
          if (ready) break;
        }
        assert.equal(ready, true, `App auth/data did not settle: ${JSON.stringify(browser.exceptions)}`);
        // Dismiss the real entrance with its existing event handler.
        await browser.evaluate("document.querySelector('#societyEntranceButton').click()");
        await pause(1500);
        const top = await browser.evaluate(metrics);
        const capture = async name => {
          const image = await browser.send("Page.captureScreenshot", { format: "png" });
          await writeFile(resolve(output, `${width}-${name}.png`), Buffer.from(image.data, "base64"));
        };
        await capture("nook-top");
        // A genuine touch gesture, not scrollTop assignment or scrollIntoView.
        for (let gesture = 0; gesture < 5; gesture++) {
          await browser.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: width / 2, y: 650 }] });
          for (let y = 620; y >= 210; y -= 35) {
            await browser.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: width / 2, y }] });
            await pause(16);
          }
          await browser.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await pause(180);
        }
        const touched = await browser.evaluate(metrics);
        await capture("nook-lower");
        // Wheel in the same content surface also has to scroll.
        await browser.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: width / 2, y: 300, deltaY: -500, deltaX: 0 });
        await pause(250);
        const wheeled = await browser.evaluate(metrics);
        await writeFile(resolve(output, `${width}-metrics.json`), JSON.stringify({ top, touched, wheeled, exceptions: browser.exceptions }, null, 2));
        console.log(JSON.stringify({ width, baseline, books: top.books.length,
          initialScroll:top.nook.scrollTop, touchScroll:touched.nook.scrollTop,
          wheelScroll:wheeled.nook.scrollTop, backdrop:[top.main.left,top.main.right],
          touchTarget:top.hit[0].ancestors[0], exceptions:browser.exceptions }));
        assert.equal(browser.exceptions.length, 0);
        assert.equal(top.books.length, count, "Real app must use the supplied count, not force six books");
        if (baseline) return;
        assert.ok(touched.nook.scrollTop > 100 || touched.nook.top < top.nook.top - 100, "Touch did not scroll Nook");
        assert.ok(touched.circles.top < height - 80 && touched.circles.bottom > 0, "Your Circles is not reachable");
        assert.notEqual(wheeled.circles.top, touched.circles.top, "Wheel did not move the content");
        assert.ok(top.documentWidth <= width + 1, "Horizontal document overflow");
        assert.ok(top.main.left <= 1 && top.main.right >= width - 1, "Main warm backdrop leaves side gutters");
        assert.ok(top.nav.bottom <= height + 1 && top.nav.top > height - 120, "Navigation is not visible at the bottom");
        assert.ok(touched.circles.bottom <= touched.nav.top, "Navigation covers the bottom of Your Circles");
        assert.equal(top.bodyClass.includes("friends-modal-open"), false, "Modal scroll lock survived auth boot");
        assert.ok(top.hit.every(hit => !hit.ancestors.some(node => node.id === "profileScreen")),
          "Inactive Reader screen intercepts Nook input");
        for (const book of top.books) {
          assert.ok(Number.parseFloat(book.font) >= 9, "Miniature title is too small");
          assert.ok(book.text.top >= book.surface.top - 1 &&
            book.text.bottom <= book.surface.bottom + 1, `Miniature title clipped: ${book.title}`);
        }
        // Click the actual View My Collection button after scrolling it into the viewport.
        await browser.evaluate("document.querySelector('.phase4b1-nook-room-card').scrollIntoView({block:'center'})");
        await pause(100);
        const button = await browser.evaluate(`(() => { const r = document.querySelector('.phase4b1-nook-room-card').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
        await browser.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [button] });
        await browser.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await pause(400);
        assert.equal(await browser.evaluate("document.querySelector('#collectionScreen').classList.contains('active')"), true);
        // Use the real dock button to get home; no custom screenshot navigation.
        const nookTab = await browser.evaluate(`(() => { const r = document.querySelector('#nookTab').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
        await browser.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [nookTab] });
        await browser.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await pause(250);
        assert.equal(await browser.evaluate("document.querySelector('#nookScreen').classList.contains('active')"), true);
        // Existing Reader navigation must still make its own screen visible.
        const readerTab = await browser.evaluate(`(() => { const r = document.querySelector('#profileTab').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
        await browser.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [readerTab] });
        await browser.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await pause(400);
        assert.equal(await browser.evaluate(`document.querySelector('#profileScreen').classList.contains('active') &&
          getComputedStyle(document.querySelector('#profileScreen')).display !== 'none' &&
          document.body.classList.contains('golden-reader-active')`), true);
        const returnTab = await browser.evaluate(`(() => { const r = document.querySelector('#nookTab').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
        await browser.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [returnTab] });
        await browser.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await pause(300);
        assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('#profileScreen')).display === 'none' &&
          !document.body.classList.contains('golden-reader-active') &&
          !document.body.classList.contains('friends-modal-open')`), true);
      } finally { await browser.close(); }
    });
  }
});
