/**
 * 本机服务（M5）。零依赖 http：静态托管 public/ + /api/* 读本机库。
 *
 * 只监听 127.0.0.1；不做鉴权/外网/多用户/云同步（鉴权由宿主 connection 层在
 * dsh/workbench.js 里完成）。路由形状：独立启动走 `/api/...`；宿主前缀
 * （/api/bladder-workbench）由 stripBasePath 剥掉后保持内部形状不变。
 *
 * 读模型：`/api/bootstrap` 回「应用信息 + 布局参数 + 库台账 + 目录常量（catalogs）+ 档案数组
 * （profiles）」。字段形状由 dsh/readmodels.js 决定，**必须与原型 `prototypes/v0.1/data.js`
 * 逐字符一致**——`test/ui-parity.test.mjs` 拿两边渲染后的 DOM 直接比字符串，这是 M5 的验收命门。
 *
 * 空库时先播种演示数据（dsh/demo.js 的 `seedIfEmpty`）：不播种的话首屏是全空态，
 * parity 无从比起，也看不出「是没数据还是读模型坏了」。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_INFO } from '../lib/version.js';
import { clientLayout } from '../lib/layout.js';
import { ROUTES } from '../lib/routes.js';
import { createStore, nowISO, openDb, todayISO } from './store.js';
import { buildBootstrap } from './readmodels.js';
import { seedIfEmpty } from './demo.js';

export const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
export const DEFAULT_DB = fileURLToPath(new URL('../workspace/xyb-bladder.sqlite', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * 宿主前缀下的路径 → 本服务认识的路径（宿主把 /api/bladder-workbench/** 整段转来）：
 * `<base>` / `<base>/` → /index.html；`<base>/ui/xxx` → /xxx；`<base>/api/xxx` → /api/xxx。
 * 独立启动 base 为空串，原样返回。
 */
export function stripBasePath(pathname, base = '') {
  const path = String(pathname ?? '/');
  if (!base || !path.startsWith(base)) return path;
  const rest = path.slice(base.length);
  if (!rest || rest === '/') return '/index.html';
  // `/ui` 与 `/ui/` 都是入口（宿主在地址栏/链接里两种写法都会出现，test/server.test.mjs 钉住了这一条）
  if (rest === '/ui' || rest === '/ui/') return '/index.html';
  if (rest.startsWith('/ui/')) return rest.slice(3);
  return rest;
}

/**
 * 把请求路径变成静态目录内的相对路径；不合法一律返回 null（调用方回 403）。
 *
 * 两道闸：
 * 1. **显式拒绝 `..`**：任何一段是 `..` 就拒。normalize 确实能把 `/a/../b` 收敛回
 *    `/b`，但「收敛后仍在目录内」意味着这类请求是合法的——而浏览器不会发它，
 *    只有探测边界的人才会发。拒绝比收敛更好读，也更难写错。
 * 2. decodeURIComponent 后的 NUL 字节同样拒绝（文件系统 API 会截断路径）。
 */
function safeRelPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(pathname ?? '/'));
  } catch {
    return null; // 坏的百分号转义
  }
  if (decoded.includes('\0')) return null;
  if (decoded.split(/[/\\]+/).some((segment) => segment === '..')) return null;
  return normalize(decoded).replace(/^([/\\])+/, '');
}

/**
 * 造本机服务。
 * @param {object} options
 * @param {string} [options.root]      宿主分配的资料目录（health 的 dir 用它，会话 folder 也用它）
 * @param {string} [options.dbPath]    业务库路径；默认落在 root 下，其次包内 workspace/
 * @param {string} [options.publicDir] 业务页静态目录
 * @param {string} [options.basePath]  宿主给的挂载前缀；独立启动为空串
 * @param {string} [options.apiBase]   注入页面的接口基址（不含 /api）
 * @param {'standalone'|'host'} [options.runtime]
 */
export function createWorkbenchServer({
  root = '',
  dbPath = DEFAULT_DB,
  publicDir = PUBLIC_DIR,
  today = () => todayISO(),
  now = () => nowISO(),
  basePath = '',
  apiBase = '',
  runtime = 'standalone',
} = {}) {
  const pageApiBase = apiBase || basePath; // 页面拼 `${API_BASE}/api/xxx`，基址里不能再含 /api
  const pageRuntime = runtime === 'host' ? 'host' : 'standalone';
  const dataRoot = typeof root === 'string' ? root.trim() : '';

  const db = openDb(dbPath, { now });
  const store = createStore(db, { today });
  /**
   * 空库播种演示数据。放在建服务时做一次，不放在请求里：请求里做会让首次 bootstrap
   * 慢一拍，而且并发两个请求可能同时判定「空库」重复播种。
   * 已有数据时 `seedIfEmpty` 直接返回，不覆盖用户真实记录（这是它的契约）。
   */
  seedIfEmpty(db);
  const staticRoot = resolve(publicDir);
  const dbDir = dirname(resolve(dbPath));

  const json = (res, code, data) => {
    const body = JSON.stringify(data);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  };

  const routes = {
    /**
     * `dir` 只有一个用途：面板里点「AI 对话」时作为 `ensureSession({ folder })` 的业务目录。
     * 宿主的 ensureSession 要求 folder 是非空字符串，否则抛「创建会话需要业务项目文件夹。」
     * ——早期版本这里没有 dir，客户端传 null，点按钮必然失败且只看到一句没头没尾的报错。
     * 优先用宿主分配的资料目录，没给就用库所在目录。本机同源，无额外泄露面。
     */
    [`GET ${ROUTES.health}`]: () => ({
      ok: true,
      version: APP_INFO.version,
      displayVersion: APP_INFO.displayVersion,
      apiVersion: 'v1',
      dir: dataRoot || dbDir,
      capabilities: ['health', 'bootstrap'],
    }),

    /**
     * ⚠️ 这里**故意不放 `dir`**：bootstrap 是业务页拉取的数据，会被写进 localStorage、
     * 出现在导出的 JSON 里；而本机绝对路径（/Users/xxx）一旦流出去，「数据只在本机」
     * 的承诺就形同虚设（test/server.test.mjs 有「不泄漏本机绝对路径」断言）。
     * 需要目录的只有「点 AI 对话 → ensureSession({folder})」这一处，走 /api/health。
     *
     * `catalogs`/`profiles` 来自 dsh/readmodels.js。`meta` 覆盖在 app 之上而不是与它合并：
     * 客户端读版本号既有 `meta.version` 也有 `app.version` 两条路径，保持两个键都在，
     * 免得为了省几个字节让某一处读不到。
     */
    [`GET ${ROUTES.bootstrap}`]: ({ url }) => {
      /* `today` 是函数（可注入，便于测试固定日期），而 readmodels 要的是字符串：
         直接传函数会被 JSON.stringify 丢掉，meta.today 变成 undefined（静默失效）。 */
      const boot = buildBootstrap(db, { today: today() });
      /* 选哪个档案由服务端定：`?profile=<id>` 命中就用它，没给或不认识就回落到第一个。
         为什么不在客户端挑：档案 id 是库里的主键，客户端只应拿「本次要渲染的那一份」+ 全量
         profiles（切档案时不必再等一次请求）。回落到第一个而不是报错，是因为首次进入、
         书签过期、档案被删都会走到这里，报错会让首屏直接白掉。 */
      const wanted = url.searchParams.get('profile');
      const profileId = boot.profiles.some((p) => p.id === wanted) ? wanted : boot.profiles[0]?.id ?? null;
      return {
        app: { ...APP_INFO },
        layout: clientLayout(),
        runtime: pageRuntime,
        schema: { ledger: store.ledger(), tables: store.tables() },
        meta: { ...(boot.meta || {}), ...APP_INFO },
        catalogs: boot.catalogs,
        profileId,
        profiles: boot.profiles,
      };
    },
  };

  /**
   * 页面占位替换：接口基址 / 运行形态 / 版本信息 / 布局参数。
   *
   * 版本号为什么由**服务端**注入：发布可见性 P3 要求「顶栏、页脚、package.json 三处同源」，
   * 源是仓库根的 `VERSION` → `lib/version.js`（构建生成）→ 这里。写死在 index.html 里
   * 就得改两处，迟早对不上——本项目在原型阶段已经因为「页面声称与 VERSION 同源、
   * 而仓库里根本没有 VERSION」返工过一次，所以这次让服务端做唯一注入点。
   * `WB_INFO` 注入成 JSON，供 public/app.js 读 `version`（它第 5 处定点替换要用）。
   */
  function renderPage(html) {
    return html
      .split('{{WB_API_BASE}}').join(pageApiBase)
      .split('{{WB_RUNTIME}}').join(pageRuntime)
      .split('{{WB_VERSION}}').join(APP_INFO.version)
      .split('{{WB_INFO}}').join(JSON.stringify(APP_INFO))
      .split('{{WB_LAYOUT}}').join(JSON.stringify(clientLayout()));
  }

  async function handle(req, res) {
    const raw = new URL(req.url ?? '/', 'http://127.0.0.1');
    const url = basePath
      ? new URL(`${stripBasePath(raw.pathname, basePath)}${raw.search}`, 'http://127.0.0.1')
      : raw;

    if (url.pathname.startsWith('/api/')) {
      const key = `${req.method} ${url.pathname}`;
      const route = routes[key];
      if (!route) return json(res, 404, { error: `没有这个接口：${key}` });
      try {
        return json(res, 200, (await route({ url, req })) ?? { ok: true });
      } catch (error) {
        return json(res, error.status ?? 400, { error: error.message });
      }
    }

    /* 静态文件：只允许 publicDir 内。safeRelPath 已拒掉 `..`，这里再兜一层边界校验。 */
    const rel = safeRelPath(url.pathname);
    if (rel === null) return json(res, 403, { error: '路径不合法' });
    const file = resolve(staticRoot, rel === '' ? 'index.html' : rel);
    if (file !== staticRoot && !file.startsWith(staticRoot + sep)) {
      return json(res, 403, { error: '越出静态目录' });
    }
    try {
      const st = await stat(file);
      const target = st.isDirectory() ? join(file, 'index.html') : file;
      const type = MIME[extname(target)] ?? 'application/octet-stream';
      let buf = await readFile(target);
      if (type.startsWith('text/html')) buf = Buffer.from(renderPage(buf.toString('utf8')), 'utf8');
      res.writeHead(200, { 'content-type': type, 'content-length': buf.length, 'cache-control': 'no-cache' });
      return res.end(buf);
    } catch {
      /* public/ 还没建（M5 只有骨架）：给出可读的 404，而不是让宿主日志里只剩 ENOENT */
      return json(res, 404, { error: '找不到页面文件（public/index.html）' });
    }
  }

  return {
    handle,
    basePath,
    apiBase: pageApiBase,
    runtime: pageRuntime,
    root: dataRoot,
    db,
    store,
    close() {
      db.close();
    },
    listen(port = 8899, host = '127.0.0.1') {
      const server = createServer((req, res) => { void handle(req, res); });
      return new Promise((ok) => server.listen(port, host, () => ok(server)));
    },
  };
}
