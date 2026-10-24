/**
 * 极简 CDP 客户端（零依赖：Node 22 自带 WebSocket + fetch）。
 *
 * 为什么自己写而不是引 playwright：① 组织规范要求业务包零第三方运行时依赖；
 * ② 验收（`test/ui-parity.test.mjs`）必须在**同一台无头浏览器**里同时渲染
 *    原型（file://）与开发版（http://127.0.0.1），逐字符比对 `#wbMain` 的 innerHTML
 *    ——这需要能对两个页面反复导航并求值，CDP 直连最省事。
 *
 * 供 `test/ui-parity.test.mjs`、`scripts/probe-headless.mjs` 共用。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 浏览器可执行文件的查找链：显式 CHROME_PATH 优先，其次本机常见安装位置。
 *  本项目原型的自检脚本走的是 Playwright 自带的 chromium，但本机缓存里没有它，
 *  而系统 Chrome 在标准位置存在（已实测），所以这里以系统 Chrome 为主。 */
export const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  join(homedir(), 'Library/Caches/ms-playwright/chromium-1200/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
].filter(Boolean);

export const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p)) || CHROME_CANDIDATES[0];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiters = new Map();
    /** 页面抛出的异常与 console.error —— 验收要求「浏览器零 error」，所以要能取到 */
    this.errors = [];
    /** 失败的请求（含 404）；用来抓「图片/样式/脚本悄悄没加载」这类假通过 */
    this.badResponses = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.waiters.has(msg.id)) {
        const { resolve: ok, reject: bad } = this.waiters.get(msg.id);
        this.waiters.delete(msg.id);
        if (msg.error) bad(new Error(msg.error.message));
        else ok(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const where = d.stackTrace?.callFrames?.[0]
          ? `${d.stackTrace.callFrames[0].url}:${d.stackTrace.callFrames[0].lineNumber + 1}`
          : d.url ?? '';
        this.errors.push([d.exception?.description || d.text || 'exception', where].filter(Boolean).join(' @ '));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      } else if (msg.method === 'Network.loadingFailed') {
        this.badResponses.push(`${msg.params.errorText} ${msg.params.blockedReason ?? ''}`.trim());
      }
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((ok, bad) => {
      this.waiters.set(id, { resolve: ok, reject: bad });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, { awaitPromise = false } = {}) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) {
      throw new Error(`evaluate 失败：${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    }
    return r.result?.value;
  }
}

/**
 * 起一个无头 Chrome 并连上第一个 page target。
 * @param {{port:number, userDataPrefix?:string}} opts port 是调试端口（必填，避免与已有实例撞车）
 */
export async function launchChrome({ port, userDataPrefix = '.xyb-uropal-chrome-' } = {}) {
  if (!existsSync(CHROME)) {
    throw new Error(`找不到 Chrome：${CHROME}（可用 CHROME_PATH 指定）`);
  }
  const userDataDir = mkdtempSync(join(homedir(), userDataPrefix));
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-software-rasterizer', `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl ?? null;
    } catch { /* 端口还没起来，继续等 */ }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) {
    chrome.kill();
    throw new Error('Chrome 调试端口未就绪');
  }
  const sock = new WebSocket(wsUrl);
  await new Promise((ok, bad) => {
    sock.addEventListener('open', ok, { once: true });
    sock.addEventListener('error', bad, { once: true });
  });
  const cdp = new CDP(sock);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  try {
    await cdp.send('Network.enable');
  } catch { /* 可选能力，失败不影响验收 */ }
  return { chrome, cdp, sock, userDataDir };
}

export async function stopChrome({ chrome, sock, userDataDir }) {
  try { sock?.close(); } catch { /* 已断开 */ }
  chrome?.kill();
  await sleep(200);
  return userDataDir;
}
