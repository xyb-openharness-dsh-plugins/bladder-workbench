#!/usr/bin/env node
/**
 * 装机验收探针（M6 三层验收：配置层 + 加载层 + 交互层）。
 *
 * 为什么装机要单独一个探针（照家族已验证的参考实现移植）：
 * 装进 Desktop 才暴露的故障都是「开发版能跑、装机副本不能跑」——开发版从来不经过
 * node_modules 里的那一份，也不经过宿主的 webServer.register 前缀挂载。所以这个探针
 * 只做一件事：把**装机副本**从 node_modules 里加载起来，喂它一个假宿主，再让真 Chrome
 * 走一遍副本自己的 UI。
 *
 * 三层判据（这是 M6 的验收面，缺一层就是「未验证」）：
 *   配置层 —— package.json 有 dsh 块（bundle.patch / client.platform='web' / client.inject）；
 *              cordis.patch.yml 的 id 与副本 PLUGIN_ID 逐字一致、insert.name 与包名逐字一致、
 *              含 config.root（缺了不是「少个目录」，是每次重启换内存库）；
 *              exports / main / files 指向的文件在副本里真的存在。
 *   加载层 —— 用假宿主从副本 import 插件并 apply()，断言注册路径、health、bootstrap
 *              （含 app/layout/profiles 且不含本机绝对路径）、越界静态路径 403/404、
 *              config.root 指的那只库真的建在磁盘上。
 *   交互层 —— 真 Chrome 走一遍副本的 UI：console 零 error、data-booted 就绪、
 *              一级导航 14、二级页签 48、主业务区非空、拖右侧 AI 面板分隔条宽度真的变、
 *              390px 下 documentElement.scrollWidth === 390。
 *
 * 假宿主只实现 apply() 真正用到的三个面（见 dsh/workbench.js）：
 *   ctx.webServer.register({ kind, path, handler })  → 接住 handler
 *   ctx.connection.requestRejection(req)            → 返回 undefined 放行
 *   ctx.effect(fn, label)                           → 立即执行（真宿主随 ctx 生命周期）
 * `@deepseek-ai/schemastery` 是**宿主注入的 peer**（profile 的 node_modules 里故意没有），
 * 所以用 module.registerHooks 把它指到一个最小 shim；shim 只覆盖 apply() 不碰的部分。
 *
 * 只读承诺：绝不写 profile、绝不写 node_modules、绝不改仓库文件。探针的临时库与 shim
 * 一律落在 mkdtempSync(join(tmpdir(), ...)) 下；探针不截图、不落任何仓库产物。
 * 因此这里**不**演练「缺 config.root」那条运行时后果——本项目 apply() 缺 root 时会退到
 * 包内 workspace/ 兜底库，跑一次就会往副本里写一个目录，违反只读承诺；那一条只做
 * 「patch 里有没有 config.root」的静态判据（见配置层）。
 *
 * 与参考实现的一处有意差异：UROPAL_AUTH 不接到主假宿主上，而是**另起一个**拒绝型假宿主
 * 做授权闸断言。参考实现把拒绝码接到主宿主，会让整轮 200 断言同时挂掉；分开之后
 * 「正常三层」与「授权闸」可以在同一次运行里各自给出干净的结论，判定标准不变。
 *
 * 用法：
 *   node scripts/probe-install.mjs                     # 探测 Desktop profile 里装的那份
 *   UROPAL_PKG=/abs/path/to/pkg node scripts/probe-install.mjs
 *   UROPAL_NO_CHROME=1 node scripts/probe-install.mjs  # 只跑配置层/加载层，不起浏览器
 *   UROPAL_CDP_PORT=9400 node scripts/probe-install.mjs
 *   UROPAL_AUTH=401 node scripts/probe-install.mjs     # 追加验证本机授权闸
 *
 * 退出码：
 *   0 = 三层全过，且探测对象确实是一份装机副本
 *   1 = 有硬失败（含「装机副本不存在」）
 *   3 = 无硬失败，但有「未验证」项（UROPAL_NO_CHROME / 找不到 Chrome / UROPAL_PKG 指向仓库本身）
 *       —— 3 不是通过，是明确告诉调用方「这一层这次没验」。
 */
import { createServer, request as httpRequest } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const NAME = '@xyb-community/bladder-workbench';
const SHORT = 'bladder-workbench';
const DEFAULT_PKG = join(homedir(), 'Library/Application Support/dsh-desktop/harness/profiles/web/node_modules/@xyb-community/bladder-workbench');
const PKG = process.env.UROPAL_PKG ? resolve(process.env.UROPAL_PKG) : DEFAULT_PKG;
const IS_REPO_ROOT = PKG === ROOT;
const NO_CHROME = process.env.UROPAL_NO_CHROME === '1';
const AUTH_CODE = process.env.UROPAL_AUTH ? Number(process.env.UROPAL_AUTH) : null;
const CDP_PORT = Number(process.env.UROPAL_CDP_PORT || 9351);
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };
/** 期望值来自设计契约（docs/UI-DESIGN.md、lib/layout.js），不是本次实测读出来的 */
const EXPECT = { navRoutes: 14, tabsTotal: 48, paneDefault: 35, paneMin: 25, paneMax: 45, narrow: 390, minChars: 40 };

/* ------------------------------------------------------------------ 报告工具 */

const checks = [];
const fails = [];
const unverified = [];
let currentLayer = '';

function layer(title) {
  currentLayer = title;
  console.log(`\n▶ ${title}`);
}
function line(mark, name, detail) {
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}
function check(layerName, name, ok, detail = '') {
  const item = { layer: layerName, name, ok: Boolean(ok), detail: String(detail ?? '') };
  checks.push(item);
  if (item.ok) line('✓', name, item.detail);
  else { fails.push(item); line('✗', name, item.detail); }
  return item.ok;
}
/** ⋯ = 未验证：不计通过、也不算失败，但会让退出码变成 3 */
function note(layerName, name, detail = '') {
  checks.push({ layer: layerName, name, ok: false, skipped: true, detail: String(detail ?? '') });
  unverified.push(`${name}${detail ? ` — ${detail}` : ''}`);
  line('⋯', name, detail);
}

/* ------------------------------------------------------------- 装机副本存在性 */

console.log('▶ 装机验收探针 · 小泉宝 UroPal');
console.log(`  探测对象：${PKG}`);
if (IS_REPO_ROOT) console.log('  ⚠ UROPAL_PKG 指向仓库本身：这是诊断运行，不能当成装机通过');

const pkgJsonPath = join(PKG, 'package.json');
if (!existsSync(pkgJsonPath)) {
  console.error('');
  console.error('✗ 装机副本不存在，配置层/加载层/交互层都无法开验。');
  console.error(`  缺的是：${pkgJsonPath}`);
  console.error(`  默认位置：${DEFAULT_PKG}`);
  console.error('  先装一次（会打 tgz、装进 profile、再自动回来跑本探针）：');
  console.error('    npm run install:local          # 或 node scripts/install-local.mjs');
  console.error('  只想验探针自身的配置层/加载层，可临时指向一份解包副本或仓库根：');
  console.error(`    UROPAL_PKG=${ROOT} node scripts/probe-install.mjs   # 诊断运行，不算装机通过`);
  console.error('');
  console.error('结论：未验证（退出码 1，不是通过）。');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
const version = pkg.version;
const patchPath = join(PKG, 'cordis.patch.yml');
const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
const wbSrc = existsSync(join(PKG, 'dsh/workbench.js')) ? readFileSync(join(PKG, 'dsh/workbench.js'), 'utf8') : '';
const pluginIdInSource = (wbSrc.match(/PLUGIN_ID\s*=\s*'([^']+)'/) || [])[1] || null;

/* ---------------------------------------------------- schemastery shim（临时目录） */

const tmpRoot = mkdtempSync(join(tmpdir(), 'uropal-install-probe-'));
const shimFile = join(tmpRoot, 'schemastery.mjs');
writeFileSync(shimFile, `
const chain = () => {
  const o = {}
  for (const k of ['required', 'optional', 'default', 'description', 'min', 'max', 'role', 'comment']) o[k] = () => o
  return o
}
const make = () => chain()
const Schema = {
  object: (shape) => ({ __schema: 'object', shape }),
  string: make, number: make, boolean: make, array: make, dict: make, union: make, const: make, any: make,
}
export { Schema }
export default Schema
`);
registerHooks({
  resolve(spec, context, next) {
    if (spec === '@deepseek-ai/schemastery') {
      return { url: pathToFileURL(shimFile).href, shortCircuit: true, format: 'module' };
    }
    return next(spec, context);
  },
});

/* ------------------------------------------------------------------ 配置层 */

layer('配置层（副本的包元数据与 patch 声明）');
check('配置层', '装机副本存在', true, PKG);
check('配置层', `package.json 的 name 是 ${NAME}`, pkg.name === NAME, String(pkg.name));
check('配置层', 'dsh.bundle.patch 指向 ./cordis.patch.yml',
  pkg.dsh?.bundle?.patch === './cordis.patch.yml', String(pkg.dsh?.bundle?.patch));
check('配置层', "dsh.client.platform = 'web'", pkg.dsh?.client?.platform === 'web', String(pkg.dsh?.client?.platform));
check('配置层', 'dsh.client.inject 是含 dsh-desktop-workbenches 的非空数组',
  Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0,
  JSON.stringify(pkg.dsh?.client?.inject));

check('配置层', 'cordis.patch.yml 存在且以 `- insert:` 开头',
  patch.trimStart().startsWith('- insert:'), patch ? patch.trimStart().slice(0, 24) : '文件不存在');
const patchId = (patch.match(/\bid:\s*([^\s#]+)/) || [])[1] || null;
const patchName = (patch.match(/\bname:\s*"?([^"\s#]+)"?/) || [])[1] || null;
check('配置层', 'patch 的 id 与副本 PLUGIN_ID 逐字一致（宿主按它认插件身份）',
  Boolean(pluginIdInSource) && patchId === pluginIdInSource, `patch=${patchId} PLUGIN_ID=${pluginIdInSource}`);
check('配置层', 'patch 的 insert.name 与包名逐字一致',
  patchName === pkg.name, `patch=${patchName} 包名=${pkg.name}`);
/* 家族踩过：这一行缺了不是「少个目录」，是宿主每次重启换一只内存库，用户记录全没。 */
check('配置层', `patch 含 config.root = dshHomePath('${SHORT}')（缺了=重启回内存库）`,
  new RegExp(`root:\\s*!!js\\s+dshHomePath\\('${SHORT}'\\)`).test(patch),
  (patch.split('\n').find((l) => /root:/.test(l)) || '(没有 root: 这一行)').trim());

const entryTargets = [];
if (typeof pkg.main === 'string') entryTargets.push(['main', pkg.main]);
for (const [key, value] of Object.entries(pkg.exports || {})) {
  if (typeof value === 'string') entryTargets.push([`exports["${key}"]`, value]);
}
const missingEntries = entryTargets.filter(([, rel]) => !existsSync(resolve(PKG, rel.replace(/^\.\//, ''))));
check('配置层', `exports / main 指向的 ${entryTargets.length} 个文件在副本里都存在`,
  entryTargets.length > 0 && missingEntries.length === 0,
  missingEntries.length ? missingEntries.map(([k, v]) => `${k}=${v}`).join(' ') : entryTargets.map(([k]) => k).join(' '));
const missingFiles = (Array.isArray(pkg.files) ? pkg.files : [])
  .filter((rel) => !existsSync(resolve(PKG, String(rel).replace(/^\.\//, ''))));
check('配置层', `files 白名单 ${(pkg.files || []).length} 项在副本里都存在`,
  Array.isArray(pkg.files) && missingFiles.length === 0, missingFiles.join(' '));
const clientSrc = existsSync(join(PKG, 'lib/client.js')) ? readFileSync(join(PKG, 'lib/client.js'), 'utf8') : '';
const clientMarks = ['window.__ModuleLoader__.load(', 'ctx.effect(', 'desktopWorkbenches.register(']
  .filter((m) => clientSrc.includes(m));
check('配置层', 'lib/client.js 是单文件客户端（含 3 个注入点）',
  clientMarks.length === 3, `命中 ${clientMarks.length}/3，${(clientSrc.length / 1024).toFixed(1)} kB`);
if (IS_REPO_ROOT) note('配置层', '探测对象是装机副本（不是仓库本身）', '指向仓库根：不能当成装机通过');
else check('配置层', '探测对象是装机副本（不是仓库本身）', true, PKG);

/* ------------------------------------------------------------------ 加载层 */

layer('加载层（从副本 import 插件 + 假宿主 apply + 真接口）');
let mod = null;
try {
  mod = await import(pathToFileURL(join(PKG, 'dsh/index.js')).href);
  check('加载层', 'import 装机副本 dsh/index.js', true);
} catch (error) {
  check('加载层', 'import 装机副本 dsh/index.js', false, error?.message);
}
if (mod) {
  check('加载层', '导出 name / inject / Config / apply 四样',
    typeof mod.name === 'string' && Array.isArray(mod.inject) && Boolean(mod.Config) && typeof mod.apply === 'function',
    `name=${mod.name} inject=${JSON.stringify(mod.inject)}`);
  check('加载层', `name = ${pluginIdInSource}（与 patch 的 id 同值）`, mod.name === pluginIdInSource, String(mod.name));
  check('加载层', 'inject 含 webServer + connection',
    mod.inject.includes('webServer') && mod.inject.includes('connection'), JSON.stringify(mod.inject));
  check('加载层', 'Config 覆盖 root（Schema.object）', Boolean(mod.Config?.shape?.root), 'Config 是 Schemastery schema');
  check('加载层', 'HOST_BASE / UI_ENTRY / HEALTH_PATH 三段拼法自洽',
    mod.HOST_BASE === `/api/${mod.API_PREFIX}-workbench`
    && mod.UI_ENTRY === `${mod.HOST_BASE}/ui/`
    && mod.HEALTH_PATH === `${mod.HOST_BASE}/api/health`,
    `${mod.HOST_BASE} · ${mod.UI_ENTRY} · ${mod.HEALTH_PATH}`);
}

/** 假宿主：只实现 apply() 用到的三个面；rejection 为 undefined 表示一律放行 */
function makeFakeHost({ rejection } = {}) {
  const state = { handler: null, mounted: null, registered: 0, disposed: 0 };
  const ctx = {
    webServer: {
      register(opts) {
        state.registered += 1;
        state.mounted = opts;
        state.handler = opts.handler;
        return () => { state.disposed += 1; };
      },
    },
    connection: { requestRejection: () => rejection },
    effect: (fn) => fn(),
  };
  return { ctx, state };
}

async function serve(handler) {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(() => {
      try { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"probe"}'); } catch { /* 头已发出 */ }
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, port: server.address().port };
}

/** 走 fetch 的普通请求（URL 会被 WHATWG 规范化，适合正常路径） */
async function get(port, path, init) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON 正常 */ }
  return { status: res.status, json, text };
}

/**
 * 走 node:http 的原始请求：path 原样发出去，**不**做 `..` 规范化。
 * 越界静态路径必须用它——fetch/URL 会把 `/ui/../package.json` 先收敛掉，
 * 那样测到的是「收敛后不存在」，不是「拒绝 `..`」。
 */
function rawGet(port, path) {
  return new Promise((ok, bad) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => ok({ status: res.statusCode, text }));
    });
    req.on('error', bad);
    req.end();
  });
}

let server = null;
let port = 0;
let dataDir = null;
if (mod?.apply) {
  dataDir = mkdtempSync(join(tmpdir(), 'uropal-install-data-'));
  const { ctx, state } = makeFakeHost();
  let mainSrv = null;
  try {
    mod.apply(ctx, { root: dataDir });
    mainSrv = mod.mountedServer?.() ?? null;
    check('加载层', 'apply() 不抛异常（真宿主会当整个插件崩掉）', true);
  } catch (error) {
    check('加载层', 'apply() 不抛异常（真宿主会当整个插件崩掉）', false, error?.message);
  }
  check('加载层', `向宿主注册了恰好 1 条 prefix 路由 ${mod.HOST_BASE}`,
    state.registered === 1 && state.mounted?.kind === 'prefix' && state.mounted?.path === mod.HOST_BASE,
    `registered=${state.registered} kind=${state.mounted?.kind} path=${state.mounted?.path}`);
  check('加载层', 'UI_ENTRY 与 HEALTH_PATH 都落在这条注册路径之下',
    String(mod.UI_ENTRY).startsWith(`${mod.HOST_BASE}/`) && String(mod.HEALTH_PATH).startsWith(`${mod.HOST_BASE}/`),
    `${mod.UI_ENTRY} · ${mod.HEALTH_PATH}`);

  if (state.handler) {
    const started = await serve(state.handler);
    server = started.server;
    port = started.port;

    const health = await get(port, mod.HEALTH_PATH);
    check('加载层', `GET ${mod.HEALTH_PATH} = 200 且 JSON 可解析`,
      health.status === 200 && health.json?.ok === true,
      `status=${health.status} ${health.text.slice(0, 100)}`);
    check('加载层', 'health.version 与副本 package.json 同值', health.json?.version === version, `${health.json?.version} vs ${version}`);
    check('加载层', 'config.root 生效：health.dir 指回探针给的临时资料目录',
      health.json?.dir === dataDir, `dir=${health.json?.dir}`);

    const boot = await get(port, `${mod.HOST_BASE}/api/bootstrap`);
    const bootKeys = boot.json ? Object.keys(boot.json) : [];
    check('加载层', `GET ${mod.HOST_BASE}/api/bootstrap = 200`, boot.status === 200, `status=${boot.status} ${boot.text.slice(0, 100)}`);
    check('加载层', 'bootstrap 含 app / layout / profiles 三件',
      ['app', 'layout', 'profiles'].every((k) => bootKeys.includes(k)), `keys=${bootKeys.join(',')}`);
    check('加载层', 'bootstrap 里已种演示档案（至少一份）',
      Array.isArray(boot.json?.profiles) && boot.json.profiles.length >= 1, `profiles=${boot.json?.profiles?.length}`);
    /* 隐私断言：bootstrap 会被写进 localStorage / 导出 JSON，绝不能带本机绝对路径。 */
    const leaks = ['/Users/', '/home/', homedir()].filter((s) => s && boot.text.includes(s));
    const userHit = basename(homedir()).length >= 3 && boot.text.includes(basename(homedir()));
    check('加载层', 'bootstrap 不含任何本机绝对路径 / 用户名（隐私）',
      leaks.length === 0 && !userHit,
      leaks.length || userHit ? `命中 ${[...leaks, userHit ? basename(homedir()) : ''].filter(Boolean).join('、')}` : `${boot.text.length} 字节无泄漏`);

    const ui = await get(port, mod.UI_ENTRY);
    check('加载层', `GET ${mod.UI_ENTRY} 返回真页面（非 404）`,
      ui.status === 200 && /<html/i.test(ui.text), `status=${ui.status} len=${ui.text.length}`);

    /* config.root 是不是真的落盘：内存库也能回 200，所以必须回读文件。只读打开，不写。 */
    const dbFile = join(dataDir, mod.DB_FILE);
    let migrated = 0;
    if (existsSync(dbFile)) {
      try {
        const { DatabaseSync } = await import('node:sqlite');
        const db = new DatabaseSync(dbFile, { readOnly: true });
        try { migrated = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n ?? 0; }
        finally { db.close(); }
      } catch (error) {
        check('加载层', '回读磁盘库的迁移台账', false, error?.message);
      }
    }
    check('加载层', `config.root 生效：磁盘库 ${mod.DB_FILE} 已建且已迁移（不是内存库）`,
      existsSync(dbFile) && migrated >= 1, `${dbFile} · schema_migrations=${migrated}`);

    /* 越界静态路径：必须在进静态目录前被拦成 403/404，且绝不吐出 package.json。 */
    const escapes = [
      `${mod.HOST_BASE}/ui/../package.json`,
      `${mod.HOST_BASE}/ui/..%2fpackage.json`,
      `${mod.HOST_BASE}/ui/%2e%2e%2f%2e%2e%2fpackage.json`,
    ];
    const escapeResults = [];
    let leak = null;
    for (const p of escapes) {
      const r = await rawGet(port, p);
      escapeResults.push(`${p.slice(mod.HOST_BASE.length)}=${r.status}`);
      if (r.status !== 403 && r.status !== 404) leak = `${p} → ${r.status}`;
      if (!leak && r.text.includes('"name"') && r.text.includes(SHORT)) leak = `${p} 回吐了 package.json`;
    }
    check('加载层', '越界静态路径 3 条全部 403/404 且不回吐 package.json',
      leak === null, leak || escapeResults.join(' '));

    /* 授权闸：另起一个拒绝型假宿主，不污染上面的 200 断言（见文件头说明）。 */
    if (AUTH_CODE) {
      const authRoot = mkdtempSync(join(tmpdir(), 'uropal-install-auth-'));
      const auth = makeFakeHost({ rejection: AUTH_CODE });
      let verdict = null;
      try {
        mod.apply(auth.ctx, { root: authRoot });
        const authSrv = mod.mountedServer?.() ?? null;
        if (auth.state.handler) {
          const s = await serve(auth.state.handler);
          verdict = await get(s.port, mod.HEALTH_PATH);
          await new Promise((ok) => s.server.close(ok));
        }
        try { authSrv?.close?.(); } catch { /* 关库失败不影响结论 */ }
      } catch (error) {
        verdict = { status: 0, text: error?.message };
      }
      check('加载层', `requestRejection 回 ${AUTH_CODE} 时原样透传为 HTTP ${AUTH_CODE}`,
        verdict?.status === AUTH_CODE, `status=${verdict?.status} ${String(verdict?.text).slice(0, 80)}`);
      rmSync(authRoot, { recursive: true, force: true });
    } else {
      note('加载层', '授权闸（UROPAL_AUTH）', '未设置 UROPAL_AUTH，本次未验授权拒绝路径');
    }
  } else {
    check('加载层', '假宿主拿到了 handler', false, 'webServer.register 没被调用');
  }
} else {
  note('加载层', 'apply() / 接口层', 'dsh/index.js 没 import 成功，后续加载层与交互层全部未验');
}

/* ------------------------------------------------------------------ 交互层 */

layer('交互层（真 Chrome 走装机副本的 UI）');
if (!server) {
  note('交互层', '真浏览器走查', '加载层没起来，未验');
} else if (NO_CHROME) {
  note('交互层', '真浏览器走查', 'UROPAL_NO_CHROME=1：本次只跑配置层/加载层');
} else {
  let chrome = null;
  try {
    const { launchChrome, stopChrome, sleep } = await import('./cdp.mjs');
    chrome = await launchChrome({ port: CDP_PORT });
    const { cdp } = chrome;
    await cdp.send('Emulation.setDeviceMetricsOverride', DESKTOP);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}${mod.UI_ENTRY}` });

    /* 就绪信号用 app.js 自己置的 data-booted：它表示首屏已渲染过一次。 */
    let booted = false;
    for (let i = 0; i < 90 && !booted; i += 1) {
      await sleep(120);
      booted = await cdp.eval(`document.body && document.body.getAttribute('data-booted') === '1'`);
    }
    check('交互层', '页面就绪信号 data-booted=1', booted, booted ? '' : '12 秒内没置上');
    if (!booted) throw new Error('页面未就绪，后续交互断言无从谈起');

    const navSel = '#wbNav .nav-item[data-route]';
    const navCount = await cdp.eval(`document.querySelectorAll(${JSON.stringify(navSel)}).length`);
    check('交互层', `一级导航 ${EXPECT.navRoutes} 项`, navCount === EXPECT.navRoutes, `实际 ${navCount}`);
    const hasSettings = await cdp.eval(`!!document.querySelector('#wbNav [data-act="settings"]')`);
    check('交互层', '「设置」入口存在（不计入 14 项一级导航）', Boolean(hasSettings), String(hasSettings));

    /* 二级页签：逐页点进去现数。起始页（看板）本来就没有页签，提前解析选择器会得 null。 */
    const tabsSel = '#wbPage .tab[data-tab]';
    const perRoute = [];
    let emptyRoutes = [];
    for (let i = 0; i < navCount && i < 30; i += 1) {
      const clicked = await cdp.eval(`(() => {
        const b = document.querySelectorAll(${JSON.stringify(navSel)})[${i}];
        if (!b) return null;
        b.click();
        return b.dataset.route || null;
      })()`);
      await sleep(90);
      const info = await cdp.eval(`(() => ({
        tabs: document.querySelectorAll(${JSON.stringify(tabsSel)}).length,
        chars: (document.querySelector('#wbPage')?.innerText || '').replace(/\\s+/g, '').length,
        empty: !!document.querySelector('#wbPage .empty'),
      }))()`);
      perRoute.push([clicked || `#${i}`, info?.tabs || 0, info?.chars || 0]);
      /* 主业务区非空：正文 ≥40 字且没有空态块（与 docs/UI-PARITY.md 同一口径） */
      if ((info?.chars || 0) < EXPECT.minChars || info?.empty) emptyRoutes.push(`${clicked}=${info?.chars}字${info?.empty ? '/空态' : ''}`);
    }
    const tabsTotal = perRoute.reduce((sum, [, n]) => sum + n, 0);
    check('交互层', `二级页签共 ${EXPECT.tabsTotal} 个`,
      tabsTotal === EXPECT.tabsTotal, `逐页：${perRoute.map(([r, n]) => `${r}=${n}`).join(' ')}`);
    check('交互层', `主业务区逐页非空（${perRoute.length} 页，正文 ≥${EXPECT.minChars} 字、无 .empty）`,
      emptyRoutes.length === 0, emptyRoutes.length ? emptyRoutes.join(' ') : `最少 ${Math.min(...perRoute.map(([, , c]) => c))} 字`);

    /* 拖右侧 AI 面板分隔条：必须用真实鼠标事件走完「按下→移动→松开」。 */
    const readPane = () => cdp.eval(`(() => ({
      css: getComputedStyle(document.documentElement).getPropertyValue('--agent-w').trim(),
      aria: document.querySelector('#splitter')?.getAttribute('aria-valuenow') ?? null,
      hidden: document.querySelector('#agentPane')?.hidden ?? null,
    }))()`);
    await cdp.eval(`document.querySelector('#btnAgent').click()`);
    await sleep(250);
    const opened = await readPane();
    const wDefault = Number.parseFloat(opened?.css);
    check('交互层', `打开 AI 面板后分隔条宽度 = ${EXPECT.paneDefault}%`,
      wDefault === EXPECT.paneDefault, `--agent-w=${opened?.css} aria=${opened?.aria}`);

    const geom = await cdp.eval(`(() => { const e = document.querySelector('#splitter'); const b = e.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: Math.round(b.width), h: Math.round(b.height), display: getComputedStyle(e).display }; })()`);
    const splittable = Boolean(geom) && geom.w > 0 && geom.h > 0;
    check('交互层', '分隔条在 1280px 桌面视口下有实体尺寸', splittable,
      geom ? `display=${geom.display} ${geom.w}×${geom.h}px` : '找不到 #splitter');
    let dragged = NaN;
    if (splittable) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(geom.x), y: Math.round(geom.y), button: 'left', buttons: 1, clickCount: 1 });
      for (const x of [geom.x - 40, geom.x - 120, 0]) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(geom.y), button: 'left', buttons: 1 });
        await sleep(30);
      }
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 0, y: Math.round(geom.y), button: 'left', buttons: 0 });
      await sleep(200);
      dragged = Number.parseFloat((await readPane())?.css);
    }
    check('交互层', `拖到最左后宽度真的变（${wDefault}% → ${EXPECT.paneMax}%）`,
      Number.isFinite(dragged) && dragged !== wDefault && dragged === EXPECT.paneMax, `实测 ${dragged}%`);
    check('交互层', `拖动结果始终夹在 ${EXPECT.paneMin}–${EXPECT.paneMax}%`,
      Number.isFinite(dragged) && dragged >= EXPECT.paneMin && dragged <= EXPECT.paneMax, `实测 ${dragged}%`);

    await cdp.eval(`document.querySelector('#btnAgentClose').click()`);
    await sleep(200);
    check('交互层', 'AI 面板可收起并回到隐藏态', (await readPane())?.hidden === true, `hidden=${(await readPane())?.hidden}`);

    /* 390px 窄屏：不许横向溢出。scrollWidth <= innerWidth 是性质判据，===390 是契约判据。 */
    const measure = () => cdp.eval(`(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))()`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: EXPECT.narrow, height: 844, deviceScaleFactor: 2, mobile: false });
    await sleep(450);
    const narrow = await measure();
    check('交互层', `${EXPECT.narrow}px 下 documentElement.scrollWidth === ${EXPECT.narrow}`,
      narrow?.scrollWidth === EXPECT.narrow, `scrollWidth=${narrow?.scrollWidth} innerWidth=${narrow?.innerWidth}`);
    await cdp.send('Emulation.setDeviceMetricsOverride', DESKTOP);
    await sleep(200);

    check('交互层', '页面加载 0 个未捕获异常 / console.error', cdp.errors.length === 0, cdp.errors.slice(0, 3).join(' | '));
    check('交互层', '0 个网络加载失败', cdp.badResponses.length === 0, cdp.badResponses.slice(0, 3).join(' | '));
  } catch (error) {
    check('交互层', '浏览器探针执行', false, String(error?.message || error).slice(0, 200));
  } finally {
    try { if (chrome) { const { stopChrome } = await import('./cdp.mjs'); await stopChrome(chrome); } } catch { /* Chrome 已退出 */ }
  }
}

/* ------------------------------------------------------------------ 收尾与结论 */

try { mod?.mountedServer?.()?.close?.(); } catch { /* 关库失败不影响结论 */ }
try { if (server) await new Promise((ok) => server.close(ok)); } catch { /* 已关闭 */ }
try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* 临时目录清不掉不影响结论 */ }
try { if (dataDir) rmSync(dataDir, { recursive: true, force: true }); } catch { /* 同上 */ }

const passed = checks.filter((c) => c.ok && !c.skipped).length;
const exitCode = fails.length ? 1 : (unverified.length ? 3 : 0);

console.log('');
console.log(JSON.stringify({
  ok: fails.length === 0 && unverified.length === 0,
  pkg: PKG,
  isInstallCopy: !IS_REPO_ROOT,
  version,
  checks: checks.length,
  passed,
  failed: fails.map((c) => `[${c.layer}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`),
  unverified,
  exitCode,
}, null, 2));

console.log('');
if (fails.length) {
  console.error(`✗ 未通过：${fails.length} 项硬失败（另有 ${unverified.length} 项未验证）`);
  for (const f of fails) console.error(`  ✗ [${f.layer}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}
if (unverified.length) {
  console.log(`⋯ 无硬失败，但有 ${unverified.length} 项「未验证」——不是通过（退出码 3）：`);
  for (const u of unverified) console.log(`  ⋯ ${u}`);
  process.exit(3);
}
console.log(`✓ 三层全过（${passed} 项断言，装机副本 ${PKG}）`);
process.exit(0);
