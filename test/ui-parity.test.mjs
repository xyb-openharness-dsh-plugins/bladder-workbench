/**
 * UI 一致性测试（M5 验收命门）：原型 vs 开发版**逐字符**一致。
 *
 * ## 判法（家族标准）
 * 同一台无头 Chrome 里渲染两边：
 *   - 原型：`prototypes/v0.1/index.html` 以 `file://` 直开，数据来自 `data.js` 的全局常量
 *   - 开发版：`http://127.0.0.1:<port>/`，数据来自 `/api/bootstrap` → `readmodels` 读真实 SQLite
 * 然后逐 `(分野, 一级页, 二级页签)` 比对业务区 `#wbPage` + 面包屑 `#wbCrumb` 的
 * `innerHTML`，**逐字符相等**才算过。
 *
 * ## 为什么按**分野**分两套比（而不是按「档案」）
 * 实测确认：原型是按分野（nmibc / mibc）分两套数据的——`SURGERY_CASE`、`TREATMENT_CASE`
 * 两块按 `STATE.line` 切换（`DIVERSION_CASE` 在原型里本来就是平的），
 * 其余（病理、灌注、复查、指标）两条线共享。
 * 所以「原型 NMIBC」对「开发版 demo1」、「原型 MIBC」对「开发版 demo2」，共 2 × 52 = 104 处比对。
 * 一开始我按「两个患者档案」理解，那是错的：原型的顶栏下拉切的是**分野**，不是患者。
 *
 * ## 为什么比 `#wbPage` + `#wbCrumb`，而不是整个 `#wbMain`
 * `#wbMain` 里还含**页脚**，而页脚是**故意不同**的：
 *   原型　「小泉宝 UroPal · 原型 v0.1 … 本页为设计原型，数据为演示用」
 *   开发版「小泉宝 UroPal · 开发版 … 数据只在本机；记录不是诊断，不构成治疗建议」
 * 开发版绝不能自称「原型」，所以这处差异是**要求**而不是缺陷。
 * 第一版没意识到这点，结果 102/102 全报不一致，而真正的原因只是页脚——
 * 真正的差异点全被这一处必然噪声淹没了。现在只比业务区与面包屑。
 * 页脚「必须不同」这件事由第 2 条测试单独钉住，不会被漏掉。
 *
 * ## 为什么带上 `#wbCrumb`
 * 面包屑含数据驱动的分野名（实测指标页两者曾差 1 个字符，正是面包屑里的分野名）。
 * 只比 `#wbPage` 会漏掉这一层。
 *
 * ## 依赖本机 Chrome
 * `CHROME_PATH` 可覆盖，查找链见 `scripts/cdp.mjs`。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorkbenchServer } from '../dsh/server.js';
import { launchChrome, stopChrome, sleep } from '../scripts/cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROTOTYPE = pathToFileURL(join(ROOT, 'prototypes/v0.1/index.html')).href;
const CDP_PORT = Number(process.env.UROPAL_PARITY_CDP_PORT || 9351);

/** 两条线都要比：原型按分野分两套数据，只比一条会放过一整半的偏差 */
const LINES = ['nmibc', 'mibc'];

/** 开发版 `index.html` 必须齐全的 id（缺一个就说明前端移植漏了接线） */
const REQUIRED_IDS = [
  'wbNav', 'wbMain', 'wbPage', 'wbCrumb', 'agentPane', 'splitter',
  'btnAgent', 'btnAgentClose', 'btnTextSize', 'btnWording', 'btnDraftScope', 'btnCopyDraft',
  'versionChip', 'footVersion', 'pillDir', 'pillTalk', 'tbStatus', 'wbToast',
];

/**
 * 切分野。开发版要在这里**重新取一次数据**（两个档案在库里，不在内存）；
 * 原型没有 `bootData`，所以按能力探测，两侧走同一个表达式但各自做该做的事。
 */
const SET_LINE = `async (line) => {
  STATE.line = line;
  STATE.lineHistory = [];
  STATE.route = 'dashboard';
  STATE.tab = {};
  if (typeof bootData === 'function') { await bootData(); }
  renderNav();
  renderPage();
  return true;
}`;

/** 切到 (route, tab) 并取业务区 + 面包屑的 HTML。两侧共用，保证归一化完全对称。 */
const GRAB = `(route, tab) => {
  STATE.route = route;
  if (tab) { STATE.tab = STATE.tab || {}; STATE.tab[route] = tab; }
  renderNav();
  renderPage();
  const page = document.getElementById('wbPage');
  if (!page) return null;
  const crumb = document.getElementById('wbCrumb');
  /* 用 \\u0000 分隔，避免「面包屑末尾 + 正文开头」凑出与另一边相同的串而假通过 */
  return (crumb ? crumb.outerHTML : '') + '\\u0000' + page.innerHTML;
}`;

/** 从原型现读 NAV 的全部 (route, tab)——抄一份清单必然漂移 */
const NAV_SHAPE = `JSON.stringify(NAV.map((n) => ({ route: n.id, tabs: n.tabs && n.tabs.length ? n.tabs : [''] })))`;

let app;
let chrome;
/** @type {{route:string, tab:string}[]} */
let viewSubs = [];

test.before(async () => {
  app = createWorkbenchServer({ dbPath: ':memory:' });
  app.__server = await app.listen(0);
  app.__port = app.__server.address().port;
  chrome = await launchChrome({ port: CDP_PORT });

  await navigate(PROTOTYPE, { dev: false });
  const shape = JSON.parse(await chrome.cdp.eval(NAV_SHAPE));
  viewSubs = shape.flatMap((n) => n.tabs.map((t) => ({ route: n.route, tab: t === '' ? '' : t })));
  assert.ok(viewSubs.length >= 40, `从原型 NAV 读到的页签数偏少：${viewSubs.length}`);
});

test.after(async () => {
  await stopChrome(chrome);
  try { app?.__server?.close(); } catch { /* 已关 */ }
  app?.close();
});

/** 导航并等待就绪；开发版多等一个 `data-booted="1"`（异步 bootstrap 完成的信号） */
async function navigate(url, { dev = true, timeoutMs = 12000 } = {}) {
  const { cdp } = chrome;
  await cdp.send('Page.navigate', { url });
  const started = Date.now();
  for (;;) {
    const ready = await cdp.eval(`(() => {
      try {
        if (!document.body) return false;
        if (${dev ? "document.body.getAttribute('data-booted') !== '1'" : 'false'}) return false;
        return typeof renderNav === 'function' && typeof renderPage === 'function' && !!document.getElementById('wbMain');
      } catch (e) { /* 还在加载 */ }
      return false;
    })()`);
    if (ready) return cdp;
    if (Date.now() - started > timeoutMs) throw new Error(`页面未在 ${timeoutMs}ms 内就绪：${url}`);
    await sleep(150);
  }
}

/** 取一段可读的差异摘要（标出首个不同字符的位置，两侧各截 160 字） */
function diffExcerpt(a, b) {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i += 1;
  const from = Math.max(0, i - 60);
  return [
    `  首个差异在第 ${i} 个字符（原型 ${a.length} / 开发版 ${b.length}）`,
    `  原型　…${JSON.stringify(a.slice(from, from + 160))}`,
    `  开发版…${JSON.stringify(b.slice(from, from + 160))}`,
  ].join('\n');
}

/** 在某一边按 (分野 × 页签) 抓一整套快照 */
async function snapshot({ dev }) {
  const { cdp } = chrome;
  const out = {};
  for (const line of LINES) {
    await cdp.eval(`(${SET_LINE})(${JSON.stringify(line)})`, { awaitPromise: true });
    for (const { route, tab } of viewSubs) {
      out[`${line}|${route}|${tab}`] = await cdp.eval(`(${GRAB})(${JSON.stringify(route)}, ${JSON.stringify(tab)})`);
    }
  }
  return out;
}

test('逐字符 parity：2 个分野 × 全部 (一级页, 二级页签)，业务区 + 面包屑完全一致', async () => {
  await navigate(PROTOTYPE, { dev: false });
  const protoSnap = await snapshot({ dev: false });

  await navigate(`http://127.0.0.1:${app.__port}/`);
  const devSnap = await snapshot({ dev: true });

  const keys = Object.keys(protoSnap);
  const mismatches = [];
  for (const key of keys) {
    if (protoSnap[key] == null) { mismatches.push(`${key}：原型侧取不到 #wbMain`); continue; }
    if (devSnap[key] == null) { mismatches.push(`${key}：开发版侧取不到 #wbMain`); continue; }
    if (protoSnap[key] !== devSnap[key]) {
      const [line, route, tab] = key.split('|');
      mismatches.push(`${line} · ${route}${tab ? ` / ${tab}` : ''}\n${diffExcerpt(protoSnap[key], devSnap[key])}`);
    }
  }

  assert.equal(
    mismatches.length, 0,
    `逐字符 parity 未通过：${mismatches.length}/${keys.length} 处不一致\n\n`
    + mismatches.slice(0, 4).join('\n\n')
    + (mismatches.length > 4 ? `\n\n（还有 ${mismatches.length - 4} 处；先修前 4 处再看）` : ''),
  );
});

test('开发版 index.html 接线齐全，且不再引用原型的 data.js / 演示横幅', async () => {
  await navigate(`http://127.0.0.1:${app.__port}/`);
  const { cdp } = chrome;
  const info = JSON.parse(await cdp.eval(`JSON.stringify({
    ids: ${JSON.stringify(REQUIRED_IDS)}.filter((id) => !document.getElementById(id)),
    scripts: Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src')),
    hasProtoBar: !!document.querySelector('.prototype-bar'),
    apiBase: document.documentElement.dataset.apiBase ?? null,
    runtime: document.documentElement.dataset.runtime ?? null,
    sheetOrder: Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => l.getAttribute('href')),
    version: (window.__WB_INFO__ || {}).version ?? null,
    footer: (document.querySelector('.wb-footer') || {}).innerText || '',
  })`));
  assert.deepEqual(info.ids, [], `开发版 index.html 缺这些 id：${info.ids.join(', ')}`);
  /* 36 号：primer-data.js / primer.js 是共享模块，开发版必须保留；
     只禁止原型专用的 data.js / charts.js（charts 已拼进 app.js）。 */
  const protoOnlyScripts = info.scripts.filter((s) => s !== 'primer-data.js' && s !== 'primer.js');
  assert.ok(!protoOnlyScripts.includes('data.js'), '开发版不该再引原型的 data.js');
  assert.ok(!protoOnlyScripts.includes('charts.js'), '开发版不该再引原型的 charts.js');
  assert.equal(info.hasProtoBar, false, '开发版不该保留原型的演示横幅 .prototype-bar');
  assert.deepEqual(info.sheetOrder, ['style.css', 'shell.css', 'primer.css'], `样式引用顺序不对：${info.sheetOrder.join(', ')}`);
  assert.ok(info.version, '页面必须拿到构建注入的版本号（发布可见性 P3）');
  assert.equal(info.runtime, 'standalone', '独立启动时 runtime 应为 standalone');
  /**
   * 页脚是 parity 里**唯一被排除**的差异点，所以必须单独钉死，否则排除就变成了放行。
   * 开发版绝不能自称「原型」，也绝不能再说「数据为演示用」——那两句在装机后都是假话。
   */
  assert.ok(!info.footer.includes('原型'), `开发版页脚不得自称「原型」：${info.footer}`);
  assert.ok(!info.footer.includes('演示用'), `开发版页脚不得再说「数据为演示用」：${info.footer}`);
  assert.ok(info.footer.includes('开发版'), `开发版页脚应写明「开发版」：${info.footer}`);
  assert.ok(info.footer.includes(info.version), `开发版页脚必须显示版本号 ${info.version}：${info.footer}`);
});

test('两侧浏览器零 error（console.error 与未捕获异常都算）', async () => {
  const { cdp } = chrome;
  await navigate(PROTOTYPE, { dev: false });
  const protoErrors = cdp.errors.slice();
  await navigate(`http://127.0.0.1:${app.__port}/`);
  const devErrors = cdp.errors.slice(protoErrors.length);
  assert.deepEqual(devErrors, [], '开发版控制台出现 error');
});

test('开发版两个档案：分野不同，且与分野相关的事实确实不同、共享的事实相同', async () => {
  await navigate(`http://127.0.0.1:${app.__port}/`);
  const { cdp } = chrome;
  const res = JSON.parse(await cdp.eval(`(async () => {
    const r = await fetch((document.documentElement.dataset.apiBase || '') + '/api/bootstrap');
    const boot = await r.json();
    const s = (v) => JSON.stringify(v);
    return JSON.stringify({
      count: boot.profiles.length,
      lines: boot.profiles.map((p) => p.line),
      surgery: boot.profiles.map((p) => s(p.surgeryCase)),
      diversion: boot.profiles.map((p) => s(p.diversionCase)),
      treatment: boot.profiles.map((p) => s(p.treatmentCase)),
      pathology: boot.profiles.map((p) => s(p.pathology)),
      followup: boot.profiles.map((p) => s(p.followup)),
    });
  })()`, { awaitPromise: true }));

  assert.ok(res.count >= 2, `应至少有两个演示档案，实际 ${res.count}`);
  assert.deepEqual([...res.lines].sort(), ['mibc', 'nmibc'], `两个档案的分野应分别是 nmibc / mibc，实际 ${res.lines.join(', ')}`);

  // 按分野变的三块必须不同（否则等于两个档案是同一份数据，那就白做了）
  for (const [what, pair] of [['手术史', res.surgery], ['改道记录', res.diversion], ['治疗历程', res.treatment]]) {
    assert.notEqual(pair[0], pair[1], `${what} 在两个档案里完全相同——按分野变化的数据没有分开`);
  }
  // 共享的必须相同（原型的 pathology / followup 是两条线共用一份，开发版若给了不同值，
  // 逐字符 parity 就会失败；这条断言把「为什么失败」提前说清楚）
  for (const [what, pair] of [['病理', res.pathology], ['复查', res.followup]]) {
    assert.equal(pair[0], pair[1], `${what} 在两个档案里不同，但原型两条线共用一份——这会让 parity 失败`);
  }
});
