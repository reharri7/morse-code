import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import WebSocket from 'ws';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browserRoot = resolve('dist/morse-cw-transcriber/browser');
const profilePath = await mkdtemp(join(tmpdir(), 'cw-offline-check-'));
let chrome;
let server;

try {
  await stat(join(browserRoot, 'index.html'));
  server = createStaticServer(browserRoot);
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  console.log('offline-check: server ready');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local test port.');
  const appUrl = `http://127.0.0.1:${address.port}/`;

  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-component-update',
    '--no-first-run', `--user-data-dir=${profilePath}`, '--remote-debugging-port=0', 'about:blank'
  ], { stdio: 'ignore' });

  const debugPort = await readDebugPort(profilePath);
  console.log('offline-check: browser ready');
  const pages = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
  const page = pages.find((item) => item.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('Headless browser page was unavailable.');
  const cdp = await connectCdp(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const firstLoad = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: appUrl });
  await firstLoad;
  console.log('offline-check: first load complete');

  const online = await evaluate(cdp, `(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolveWait) => setTimeout(resolveWait, 5000))
    ]);
    for (let tries = 0; tries < 50 && !navigator.serviceWorker.controller; tries += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    return {
      title: document.title,
      path: location.pathname,
      controlled: Boolean(navigator.serviceWorker.controller),
      registrations: (await navigator.serviceWorker.getRegistrations()).map((item) => ({
        scope: item.scope,
        active: item.active?.state ?? null,
        installing: item.installing?.state ?? null,
        waiting: item.waiting?.state ?? null
      })),
      caches: await caches.keys(),
      workletCached: Boolean(await caches.match('./cw-audio-processor.js'))
    };
  })()`);
  if (online.title !== 'Learn Morse — Morse Practice' || online.path !== '/learn' ||
      !online.controlled || !online.workletCached) {
    throw new Error(`Online installation check failed: ${JSON.stringify(online)}`);
  }
  const retainedProductData = {
    schemaVersion: 1,
    settings: {
      selectedDeviceId: '', lockMode: 'manual', scanMinFrequencyHz: 400,
      scanMaxFrequencyHz: 900, manualFrequencyHz: 650
    },
    sessions: [{
      id: 'offline-proof', savedAt: '2026-09-15T12:00:00.000Z',
      rawText: 'OFFLINE TEST 73', editedText: 'OFFLINE TEST 73', annotations: [],
      metadata: {
        deviceLabel: 'System default microphone', toneFrequencyHz: 650,
        characterWordsPerMinute: 20, effectiveWordsPerMinute: 20
      }
    }]
  };
  await evaluate(cdp, `localStorage.setItem('cw-transcriber.product.v1', ${JSON.stringify(JSON.stringify(retainedProductData))})`);
  const retainedLearningData = {
    schemaVersion: 1,
    courseId: 'international-receive',
    courseVersion: 1,
    currentSymbolCount: 2,
    settings: { characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600, sessionLength: 40 },
    characters: {},
    recentUnassistedAttempts: [],
    recentSessions: [],
    updatedAt: '2026-09-25T12:00:00.000Z'
  };
  await evaluate(cdp, `localStorage.setItem('cw-transcriber.learning.v1', ${JSON.stringify(JSON.stringify(retainedLearningData))})`);
  console.log('offline-check: shell cached');

  await closeServer(server);
  server = undefined;
  console.log('offline-check: server stopped');
  const learningLoad = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${appUrl}learn` });
  await learningLoad;
  console.log('offline-check: learning route reload complete');
  const learning = await evaluate(cdp, `({
    heading: document.querySelector('h1')?.textContent?.trim(),
    hasSetup: document.body.textContent.includes('Start practice'),
    hasProgress: document.body.textContent.includes('Progress'),
    retainedSpeed: document.body.textContent.includes('20 / 10 WPM'),
    controlled: Boolean(navigator.serviceWorker?.controller)
  })`);
  if (learning.heading !== 'Character practice' || !learning.hasSetup || !learning.hasProgress ||
      !learning.retainedSpeed || !learning.controlled) {
    throw new Error(`Offline learning route check failed: ${JSON.stringify(learning)}`);
  }

  const freeCopyLoad = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${appUrl}learn/free-copy` });
  await freeCopyLoad;
  console.log('offline-check: free-copy route reload complete');
  const freeCopy = await evaluate(cdp, `(async () => {
    for (let tries = 0; tries < 50 && document.querySelector('h1')?.textContent?.trim() !== 'Free copy'; tries += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    return {
      title: document.title,
      heading: document.querySelector('h1')?.textContent?.trim(),
      hasGeneratedPractice: document.body.textContent.includes('Eight-word passage'),
      hasLocalRecording: document.body.textContent.includes('Optional local recording'),
      controlled: Boolean(navigator.serviceWorker?.controller)
    };
  })()`);
  if (freeCopy.title !== 'Free copy — Morse Practice' || freeCopy.heading !== 'Free copy' ||
      !freeCopy.hasGeneratedPractice || !freeCopy.hasLocalRecording || !freeCopy.controlled) {
    throw new Error(`Offline free-copy route check failed: ${JSON.stringify(freeCopy)}`);
  }

  const keyingLoad = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${appUrl}learn/keying` });
  await keyingLoad;
  console.log('offline-check: keying route reload complete');
  const keying = await evaluate(cdp, `(async () => {
    for (let tries = 0; tries < 50 && document.querySelector('h1')?.textContent?.trim() !== 'Learn to key CW'; tries += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    return {
      title: document.title,
      heading: document.querySelector('h1')?.textContent?.trim(),
      hasKeyboardKey: document.body.textContent.includes('or hold Space'),
      hasCheckAction: document.body.textContent.includes('Finish now'),
      controlled: Boolean(navigator.serviceWorker?.controller)
    };
  })()`);
  if (keying.title !== 'Keying practice — Morse Practice' || keying.heading !== 'Learn to key CW' ||
      !keying.hasKeyboardKey || !keying.hasCheckAction || !keying.controlled) {
    throw new Error(`Offline keying route check failed: ${JSON.stringify(keying)}`);
  }

  const offlineLoad = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${appUrl}transcribe` });
  await offlineLoad;
  console.log('offline-check: transcription route reload complete');
  const offline = await evaluate(cdp, `(async () => {
    let quickButton;
    for (let tries = 0; tries < 50 && !quickButton; tries += 1) {
      quickButton = [...document.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === 'Run quick self-test');
      if (!quickButton) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    quickButton?.click();
    for (let tries = 0; tries < 50 && !document.body.textContent.includes('Verification passed'); tries += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    return {
      title: document.title,
      heading: document.querySelector('h1')?.textContent?.trim(),
      hasDecoder: document.body.textContent.includes('Start listening'),
      hasVerification: document.body.textContent.includes('Verify the app'),
      hasAcousticTest: document.body.textContent.includes('Test microphone and speakers'),
      quickVerificationPassed: document.body.textContent.includes('Verification passed') &&
        document.body.textContent.includes('Raw text matched exactly'),
      retainedSession: document.body.textContent.includes('OFFLINE TEST 73'),
      retainedManualPitch: document.querySelector('#manual-frequency')?.value === '650',
      controlled: Boolean(navigator.serviceWorker?.controller)
    };
  })()`);
  if (offline.title !== 'Receive CW — Morse Practice' || offline.heading !== 'Copy CW' || !offline.hasDecoder ||
      !offline.hasVerification || !offline.hasAcousticTest || !offline.quickVerificationPassed ||
      !offline.retainedSession || !offline.retainedManualPitch) {
    throw new Error(`Offline reload check failed: ${JSON.stringify(offline)}`);
  }

  console.log(JSON.stringify({ online, learning, freeCopy, offline, result: 'offline route reload passed' }, null, 2));
  await cdp.send('Browser.close');
  console.log('offline-check: browser close requested');
  await cdp.closed;
  chrome = undefined;
} finally {
  if (server) await closeServer(server);
  if (chrome) {
    chrome.kill('SIGTERM');
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function createStaticServer(root) {
  const types = {
    '.css': 'text/css', '.html': 'text/html', '.ico': 'image/x-icon', '.js': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
  };
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const filePath = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filePath.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': types[extname(filePath)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
}

async function readDebugPort(profile) {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return Number((await readFile(portFile, 'utf8')).split('\n')[0]);
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error('Chrome debugging port did not become available.');
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${url}`);
  return response.json();
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.once('open', resolveOpen);
    socket.once('error', rejectOpen);
  });
  let nextId = 0;
  const pending = new Map();
  const eventWaiters = new Map();
  let closeResolve;
  const closed = new Promise((resolveClosed) => { closeResolve = resolveClosed; });
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.id) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(message.error.message));
      else waiter?.resolve(message.result);
      return;
    }
    const waiters = eventWaiters.get(message.method);
    if (waiters?.length) waiters.shift()(message.params);
  });
  socket.once('close', () => closeResolve());
  return {
    closed,
    send(method, params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveSend, rejectSend) => pending.set(id, { resolve: resolveSend, reject: rejectSend }));
    },
    once(method) {
      return new Promise((resolveEvent) => {
        const waiters = eventWaiters.get(method) ?? [];
        waiters.push(resolveEvent);
        eventWaiters.set(method, waiters);
      });
    }
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

function closeServer(activeServer) {
  activeServer.closeAllConnections?.();
  return new Promise((resolveClose, rejectClose) => activeServer.close((error) => error ? rejectClose(error) : resolveClose()));
}
