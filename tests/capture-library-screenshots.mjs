import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(new URL("..", import.meta.url).pathname);
const outputDirectory = resolve(root, "generated-artifacts/library-restoration");
const chromium = "/repl/tools/bin/chromium";
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const defaultScreens = [
  "nook",
  "nook-lower",
  "collection",
  "collection-shelf",
  "collection-shelf-next",
  "collection-arrange",
  "collection-arrange-stack",
  "bookmarks",
];
const screens = process.argv[2]
  ? process.argv[2].split(",").filter(Boolean)
  : defaultScreens;
if (screens.some(screen => !defaultScreens.includes(screen))) {
  throw new Error(`Unknown screenshot state requested: ${screens.join(", ")}`);
}

async function capture(url, screen, width, height) {
  const profile = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(`${tmpdir()}/reader-full-app-${screen}-${width}-`));
  const process = spawn(chromium, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  process.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const debuggerUrl = await new Promise((resolveUrl, rejectUrl) => {
    const timer = setTimeout(() => rejectUrl(new Error(`Chromium debugger did not start: ${stderr}`)), 12000);
    const poll = setInterval(() => {
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        clearInterval(poll);
        resolveUrl(match[1]);
      }
    }, 30);
    process.once("error", error => {
      clearTimeout(timer);
      clearInterval(poll);
      rejectUrl(error);
    });
    process.once("close", code => {
      clearTimeout(timer);
      clearInterval(poll);
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
    }, 10000);
    pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  try {
    const { targetId } = await command("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    await command("Page.enable", {}, sessionId);
    await command("Runtime.enable", {}, sessionId);
    await command("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: true,
    }, sessionId);
    await command("Page.navigate", { url: `${url}?screen=${screen}` }, sessionId);
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await new Promise(resolvePoll => setTimeout(resolvePoll, 50));
      const result = await command("Runtime.evaluate", {
        expression: "document.documentElement.dataset.screenshotReady === 'true'",
        returnByValue: true,
      }, sessionId);
      ready = result.result?.value === true;
      if (ready) break;
    }
    if (!ready) throw new Error(`The ${screen} screen did not finish rendering at ${width}px.`);
    await command("Runtime.evaluate", {
      expression: "new Promise(resolve => setTimeout(resolve, 500))",
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    const transitionResult = await command("Runtime.evaluate", {
      expression: "Number(getComputedStyle(document.querySelector('.screen.active')).opacity)",
      returnByValue: true,
    }, sessionId);
    if (transitionResult.result?.value < 0.99) {
      throw new Error(`${screen} at ${width}px was captured before its screen transition settled.`);
    }
    const layoutResult = await command("Runtime.evaluate", {
      expression: `(() => {
        const main = document.getElementById("mainApp");
        const content = document.querySelector(".app-content");
        const frame = document.querySelector(".phone-frame");
        const active = main.querySelector(".screen.active");
        const nav = document.getElementById("mainNav");
        const rect = element => {
          const value = element.getBoundingClientRect();
          return { top: Math.round(value.top), bottom: Math.round(value.bottom), height: Math.round(value.height) };
        };
        return {
          mainDisplay: getComputedStyle(main).display,
          mainRect: rect(main),
          frameDisplay: getComputedStyle(frame).display,
          activeRect: rect(active),
          navPosition: getComputedStyle(nav).position,
          navRect: rect(nav),
        };
      })()`,
      returnByValue: true,
    }, sessionId);
    const layout = layoutResult.result?.value;
    if (
      layout?.mainDisplay !== "flex" ||
      layout?.frameDisplay !== "flex" ||
      layout?.navPosition === "fixed" ||
      layout?.mainRect.bottom > layout?.navRect.top + 1 ||
      layout?.navRect.bottom > height
    ) {
      throw new Error(`${screen} at ${width}px has overlapping or unreserved bottom navigation: ${JSON.stringify(layout)}`);
    }
    if (screen.startsWith("collection-arrange")) {
      const orientations = await command("Runtime.evaluate", {
        expression: `({
          left: document.querySelectorAll('#libraryGrid .personal-shelf-book[data-orientation="lean-left"]').length,
          right: document.querySelectorAll('#libraryGrid .personal-shelf-book[data-orientation="lean-right"]').length,
          horizontal: document.querySelectorAll('#libraryGrid .personal-shelf-book[data-orientation="horizontal"]').length
        })`,
        returnByValue: true,
      }, sessionId);
      const counts = orientations.result?.value;
      if (counts?.left !== 1 || counts?.right !== 1 || counts?.horizontal !== 3) {
        throw new Error(`The ${screen} arrangement fixture is incomplete: ${JSON.stringify(counts)}`);
      }
    }
    if (screen === "collection-arrange-stack") {
      const stackVisibility = await command("Runtime.evaluate", {
        expression: `(() => {
          const viewport = document.querySelector("#libraryGrid .personal-shelf-viewport");
          const active = document.querySelector("#collectionScreen.active");
          const ids = ["book-small", "book-copper", "book-paper"];
          const viewportRect = viewport?.getBoundingClientRect();
          const activeRect = active?.getBoundingClientRect();
          const books = ids.map(id => document.querySelector(\`#libraryGrid [data-book-id="\${id}"]\`));
          const rects = books.map(book => book?.getBoundingClientRect());
          return {
            present: books.every(Boolean),
            fullyVisible: rects.every(rect => rect &&
              rect.top >= viewportRect.top && rect.bottom <= viewportRect.bottom &&
              rect.top >= activeRect.top && rect.bottom <= activeRect.bottom)
          };
        })()`,
        returnByValue: true,
      }, sessionId);
      const visible = stackVisibility.result?.value;
      if (!visible?.present || !visible?.fullyVisible) {
        throw new Error(`The full three-book stack is clipped at ${width}px: ${JSON.stringify(visible)}`);
      }
    }
    const screenshot = await command("Page.captureScreenshot", {
      format: "jpeg",
      quality: 86,
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    }, sessionId);
    const filePath = resolve(outputDirectory, `${screen}-${width}.jpg`);
    await writeFile(filePath, Buffer.from(screenshot.data, "base64"));
    return filePath;
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

await mkdir(outputDirectory, { recursive: true });
const originalIndex = await readFile(resolve(root, "index.html"), "utf8");
const previewHtml = originalIndex
  .replace(/<script\b[\s\S]*?<\/script>/gi, "")
  .replace('id="mainApp" style="display:none;"', 'id="mainApp" style="display:block;"')
  .replace('id="mainNav" style="display:none;"', 'id="mainNav"')
  .replace(
    /<\/body>/i,
    '<script type="module" src="/tests/library-screenshot-fixture.mjs"></script></body>',
  );
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    if (pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(previewHtml);
      return;
    }
    const filePath = resolve(root, `.${pathname}`);
    if (!filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": mime[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise(resolveServer => server.listen(0, "127.0.0.1", resolveServer));
const { port } = server.address();
try {
  for (const screen of screens) {
    for (const width of [375, 390]) {
      const height = width === 390 ? 844 : 812;
      const filePath = await capture(`http://127.0.0.1:${port}/index.html`, screen, width, height);
      console.log(`${screen} ${width}x${height}px -> ${filePath}`);
    }
  }
} finally {
  await new Promise(resolveServer => server.close(resolveServer));
}
