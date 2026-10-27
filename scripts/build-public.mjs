/**
 * 由原型生成开发版前端（M5）。`node scripts/build-public.mjs [--check]`
 *
 * ## 为什么用生成器而不是手改 public/
 * `public/app.js` 是 `charts.js`(249 行) + `app.js`(2524 行) 的拼接加五处定点改造。
 * 手工改一遍 2700 行，下次原型一动就得再来一遍，而且「改了哪几处」说不清。
 * 生成器把每一处改动写成可核对的替换，并且**每处替换都断言只命中一次**——
 * 原型一旦改动导致某处替换失效，这里会直接报错而不是悄悄生成一个坏文件。
 *
 * ## 与原型的关系（parity 的前提）
 * 验收标准是「原型与开发版逐字符渲染一致」（`test/ui-parity.test.mjs`），
 * 所以本生成器**只做五件事**，绝不动渲染逻辑与文案：
 *   1. 数据来源：`data.js` 的 28 个全局 → `/api/bootstrap`（新增绑定层）
 *   2. 分野切换后重新取数据（原型的 `setLine` 只改内存）
 *   3. 启动异步化 + 置 `data-booted="1"`（测试靠它判断就绪）
 *   4. 治疗事件从档案取（`CHART` 闭包内的 `TREATMENTS` 改为优先读 `PROFILE_TREATMENTS`）
 *   5. 版本号改从构建注入读（单一来源：VERSION 文件）
 *
 * ## 文件映射（原型 6 件 → 开发版 4 件）
 *   public/style.css ← prototypes/v0.1/tokens.css   （逐字节）
 *   public/shell.css ← prototypes/v0.1/shell.css    （逐字节 + 末尾追加开发版增量）
 *   public/index.html← prototypes/v0.1/index.html   （定点改造）
 *   public/app.js    ← charts.js + app.js           （拼接 + 定点改造）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'prototypes/v0.1');
const OUT = join(ROOT, 'public');
const CHECK = process.argv.includes('--check');

const read = (p) => readFileSync(p, 'utf8');

/* 版本号单一来源：仓库根 VERSION。原型 index.html 里的可见版本号与 app.js 的
   APP_VERSION 都按它做定点替换——否则每次升 patch 都要手改这里的匹配串。 */
const VERSION = read(join(ROOT, 'VERSION')).trim();

/** 每处替换都必须只命中一次：命中 0 次说明原型改了、这段失效；命中多次说明匹配太宽 */
function mustReplace(text, from, to, what) {
  const hits = text.split(from).length - 1;
  if (hits !== 1) {
    throw new Error(`定点替换「${what}」命中 ${hits} 次（要求恰好 1 次）。原型可能已改动，请核对 ${SRC}`);
  }
  return text.replace(from, to);
}

/* ============================================================
   1. public/app.js —— 绑定层
   ============================================================ */

/** 与档案无关的目录（放 catalogs）；与档案有关的 22 个事实从 profile 绑定 */
const CATALOG_KEYS = ['NAV', 'CATEGORICAL', 'DIVERSION', 'CONTRA', 'URGENT', 'DRAFT_SCOPES', 'WORDING_REDLINES'];
const PROFILE_KEYS = [
  ['PATHOLOGY', 'pathology'], ['BCG_RESPONSE', 'bcgResponse'], ['HIGH_RISK_MARKERS', 'highRiskMarkers'],
  ['INSTILLATION', 'instillation'], ['FOLLOWUP', 'followup'], ['RENAL', 'renal'],
  ['METRICS', 'metrics'], ['DIVERSION_CASE', 'diversionCase'], ['SURGERY_CASE', 'surgeryCase'],
  ['TREATMENT_CASE', 'treatmentCase'], ['RECORDS', 'records'], ['LIFE', 'life'],
  ['QUESTIONS', 'questions'], ['TRIAL_FAVORITES', 'trialFavorites'], ['TRIAL_QUESTIONS', 'trialQuestions'],
  ['STOMA_SUPPLY', 'stomaSupply'], ['STOMA_LOG', 'stomaLog'], ['TRIALS', 'trials'],
  ['TRIALS_STATS', 'trialsStats'],
];

const BINDING_LAYER = `/* ============================================================
   数据绑定层（M5 开发版新增；原型里这 28 个名字是 data.js 的全局 const）
   ------------------------------------------------------------
   为什么这么写：验收要求原型与开发版**逐字符渲染一致**，所以下游的渲染函数
   一个字都不能改——只能把「这些名字从哪来」换掉。做法是：在这里把它们声明为
   \`let\`，拿到 /api/bootstrap 之后再赋值，下面所有代码照旧直接引用原名。

   三件事分开：
   - \`STATE\`：UI 状态。**初值必须与原型 data.js 里的逐字一致**，否则首屏 parity 会差；
   - \`bindCatalogs\`：导航、术式目录、禁忌目录、急症目录这类**与具体患者无关**的目录；
   - \`bindProfile\`：病理、灌注、复查、改道记录这类**属于某个档案**的事实。
     分开是必须的：换分野只该换后者，目录不该跟着重算（也就不会因为目录缺失而整页空白）。
   ============================================================ */
const API_BASE = (document.documentElement.dataset.apiBase || '').replace(/\\/api$/, '');

let DATA = { meta: {}, catalogs: {}, profiles: [] };

/* UI 状态：初值逐字取自原型 data.js 的 STATE（含 verifiedOnly 这类只在个别页面用的项） */
let STATE = {
  line: null,              // null | 'nmibc' | 'mibc' | 'undetermined'
  lineHistory: [],         // 改线留痕
  route: 'dashboard',
  tab: {},                 // 每页当前二级页签
  textsize: 'normal',      // normal | large | xlarge
  motion: 'auto',          // auto | reduce
  agentOpen: false,
  agentWidth: 35,          // 25–45
  draftScope: 'visit',     // visit | chart | verify
  verifiedOnly: true,
};

let ${CATALOG_KEYS.join(', ')};
let ${PROFILE_KEYS.map(([name]) => name).join(', ')};
/** 治疗事件给 CHART 闭包读（见 charts.js 的定点替换） */
let PROFILE_TREATMENTS = [];

function bindCatalogs(c) {
  const src = c || {};
  ${CATALOG_KEYS.map((k) => `${k} = src.${k};`).join('\n  ')}
}

function bindProfile(p) {
  const src = p || {};
  ${PROFILE_KEYS.map(([name, key]) => `${name} = src.${key};`).join('\n  ')}
  PROFILE_TREATMENTS = Array.isArray(src.treatments) ? src.treatments : [];
}

/** 分野 → 档案：演示库里 demo1 是 NMIBC 线、demo2 是 MIBC 线（与原型下拉的取值一一对应） */
function profileForLine(line) {
  const list = DATA.profiles || [];
  return list.find((p) => p.line === line) || list[0] || null;
}

/**
 * 取一次数据并绑定。**这是开发版唯一的数据入口**（原型是本地全局，无需请求）。
 * 空库（profiles 为空）时绑定空对象而不是抛错——页面要能显示空态，不能白屏。
 */
async function bootData() {
  const res = await fetch(\`\${API_BASE}/api/bootstrap\`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(\`取数据失败：HTTP \${res.status}\`);
  DATA = await res.json();
  bindCatalogs(DATA.catalogs);
  const want = profileForLine(STATE.line);
  if (want) bindProfile(want);
  return DATA;
}
`;

/* ============================================================
   2. public/shell.css —— 只在末尾追加，前缀必须与原型逐字节相同
   ============================================================ */
const SHELL_DELTA = `
/* ===== 开发版外壳增量（M5）=====
   本文件以上内容与 prototypes/v0.1/shell.css **逐字节相同**；
   下面这一段是开发版独有，必须**只在文件末尾追加**——插在中间会让
   「哪些是开发版新增」再也说不清，test/ui-parity.test.mjs 也会因此失去可比性。
   宿主（DSH Desktop）在 iframe 左侧留了公共导航（含折叠按钮），
   这段保证我们的三段式顶栏不被它压住。值是 prompts/DSH-WORKBENCH-TOP-BAR.md 的硬要求。 */
.wb-topbar { padding-inline-start: var(--dsh-frame-leading-clearance, 12px); }
`;

/* ============================================================
   3. public/index.html —— 定点改造
   ============================================================ */
function buildHtml() {
  let h = read(join(SRC, 'index.html'));
  const P = (from, to, what) => { h = mustReplace(h, from, to, what); };

  P('<html lang="zh-CN">',
    '<html lang="zh-CN" data-api-base="{{WB_API_BASE}}" data-runtime="{{WB_RUNTIME}}">',
    'html 标签加 data-api-base / data-runtime');

  P('<title>小泉宝 UroPal · 膀胱癌工作台（原型 v0.1）</title>',
    '<meta name="robots" content="noindex, nofollow">\n'
    + '<title>小泉宝 UroPal · 膀胱癌工作台 v{{WB_VERSION}}</title>\n'
    + '<meta name="description" content="膀胱癌患者与照护者的资料整理工作台。'
    + '数据只在本机，不上传；记录不是诊断，判读归泌尿外科与治疗团队。">\n'
    + '<link rel="icon" href="data:image/svg+xml,'
    + "%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2048%2048'%3E"
    + '%3Ccircle%20cx=\'24\'%20cy=\'24\'%20r=\'19\'%20fill=\'%23E7F4F7\'/%3E'
    + '%3Cpath%20d=\'M24%2010c5%206%209%2010.5%209%2015a9%209%200%200%201-18%200c0-4.5%204-9%209-15Z\'%20fill=\'%231793A6\'/%3E'
    + '%3C/svg%3E">',
    'title 与 description 改为开发版');

  P('<link rel="stylesheet" href="tokens.css">', '<link rel="stylesheet" href="style.css">',
    'tokens.css 改名 style.css');

  P(`<!-- ============ 原型横幅：整页最顶，先声明「这是假的」 ============ -->
<div class="wb-demo-bar" role="note">
  <span class="db-left"><b>交互原型 v${VERSION}</b> · 全部为模拟资料</span>
  <span class="db-right">仅本页演示 · 刷新重置 · 未接入 DSH / AI · 无数据库</span>
</div>

`, '', '删掉原型横幅');

  P('<header class="wb-topbar" role="banner">', '<header class="wb-topbar wb-shell-topbar" role="banner">',
    '顶栏加 wb-shell-topbar（宿主左留白由 shell.css 增量负责）');

  /* 36 号疾病概要：primer-data.js / primer.js 是共享模块，开发版必须保留；
     只去掉原型专用的 data.js / charts.js（charts 由 buildApp 拼进 app.js）。 */
  P('<script src="data.js"></script>\n<script src="charts.js"></script>\n<script src="primer-data.js"></script>\n<script src="primer.js"></script>\n<script src="app.js"></script>',
    '<script>window.__WB_INFO__ = {{WB_INFO}};</script>\n<script src="primer-data.js"></script>\n<script src="primer.js"></script>\n<script src="app.js"></script>',
    '脚本：去掉 data.js/charts.js，保留 primer 模块，注入构建信息');

  P(`<span class="tb-version" id="versionChip" title="原型版本号，与 VERSION / package.json 一致（本原型手工同步，无构建注入）">v${VERSION}</span>`,
    '<span class="tb-version" id="versionChip" title="版本号由构建从 VERSION 文件注入，与 package.json 同源">v{{WB_VERSION}}</span>',
    '版本 chip 注释与值改为构建注入（发布可见性 P3）');

  P('<p class="tb-status" id="tbStatus">原型模式 · 资料未接入 · 无真实患者数据</p>',
    '<p class="tb-status" id="tbStatus">数据只在本机 · 记录不是诊断</p>',
    '顶栏状态说明改为开发版');

  P('<button type="button" class="tb-btn tb-btn-primary" id="btnAgent" aria-expanded="false" aria-controls="agentPane">打开 AI 对话</button>',
    '<button type="button" class="tb-btn tb-btn-primary" id="btnAgent" aria-expanded="false" aria-controls="agentPane" data-agent-state="idle">打开 AI 对话</button>',
    'AI 按钮加 data-agent-state（五态由它驱动）');

  P(`<span>小泉宝 UroPal · 原型 v0.1 · 版本 <b id="footVersion">${VERSION}</b></span>`,
    '<span>小泉宝 UroPal · 开发版 · 版本 <b id="footVersion">{{WB_VERSION}}</b></span>',
    '页脚版本号改为构建注入');

  P('<span class="wb-foot-note">本页为设计原型，数据为演示用；<b>不构成诊断或治疗建议</b></span>',
    '<span class="wb-foot-note">数据只在本机；<b>记录不是诊断，不构成治疗建议</b></span>',
    '页脚说明改为开发版');

  P('<span class="tb-pill" id="pillDir" data-state="off"><i aria-hidden="true"></i>资料目录 未接入</span>',
    '<span class="tb-pill" id="pillDir" data-state="off"><i aria-hidden="true"></i>资料目录 未接入</span>',
    '资料目录状态占位（保持原样，接入后才变绿）');

  return h;
}

/* ============================================================
   4. public/app.js —— 拼接 + 定点改造
   ============================================================ */
function buildApp() {
  const charts = read(join(SRC, 'charts.js'));
  let app = read(join(SRC, 'app.js'));

  // 4.1 治疗事件优先读档案（CHART 是 IIFE，TREATMENTS 是它闭包内的局部 const）
  const chartsPatched = mustReplace(charts, `  const TREATMENTS = [
    { d: '2026-09-18', label: 'TURBT', id: 'ev-turbt' },
    { d: '2026-10-02', label: 'BCG 诱导开始', id: 'ev-bcg' },
    { d: '2026-10-23', label: '灌注取消', id: 'ev-cancel' },
  ];`, `  /* 定点替换（M5 第 4 处）：治疗事件在开发版来自数据库（readmodels 按档案给出）。
     原型里是写死的三条，这里保留它们作兜底——万一某一侧数据缺失，写死的值会让
     两侧渲染出现可见差异，而不是两边一起变成空的、看起来「一致」。 */
  const TREATMENTS = (Array.isArray(PROFILE_TREATMENTS) && PROFILE_TREATMENTS.length)
    ? PROFILE_TREATMENTS
    : [
      { d: '2026-09-18', label: 'TURBT', id: 'ev-turbt' },
      { d: '2026-10-02', label: 'BCG 诱导开始', id: 'ev-bcg' },
      { d: '2026-10-23', label: '灌注取消', id: 'ev-cancel' },
    ];`, 'charts.js 的 TREATMENTS 改为优先读 PROFILE_TREATMENTS');

  // 4.2 app.js 的 'use strict' 上移到拼接文件顶部（否则每个脚本各自严格模式，重复声明会报错）
  app = mustReplace(app, "'use strict';\n", '', "app.js 的 'use strict'（上移到文件顶部）");

  // 4.3 版本号改从构建注入读
  app = mustReplace(app, `const APP_VERSION = '${VERSION}';`,
    "/* 定点替换（M5 第 5 处）：版本号单一来源。页面里的值由服务端从 lib/version.js 注入，\n"
    + "   而 lib/version.js 由 VERSION 文件生成——所以顶栏、页脚、package.json 三处同源。 */\n"
    + `const APP_VERSION = (window.__WB_INFO__ && window.__WB_INFO__.version) || '${VERSION}';`,
    'APP_VERSION 改为读构建注入');

  // 4.4 本地存储键改开发版（原型与开发版同机打开时不能互相覆盖状态）
  app = mustReplace(app, "const LS_KEY = 'uropal.prototype.v0.1';",
    "const LS_KEY = 'uropal.dev.v0.1';", '本地存储键改为开发版');

  // 4.5 setLine 换分野后要重新取数据（原型是本地全局，开发版在库里）
  app = mustReplace(app, `function setLine(v) {
  const next = v || null;
  if (STATE.line && next && STATE.line !== next) {
    STATE.lineHistory.unshift(\`\${STATE.line} → \${next}\`);
  }
  STATE.line = next;
  // 「重新选择分野」要回到闸门，而不是原地重渲染当前页
  if (!next) { STATE.route = 'dashboard'; location.hash = '#/dashboard'; }
  saveState(); renderNav(); renderPage();
}`, `/* 定点替换（M5 第 2 处）：分野即档案。原型两个档案都在内存里，切一下就行；
   开发版两个档案在数据库里，所以切完必须**重新取一次数据**再渲染。
   注意 await 的位置：saveState 之后、render 之前——渲染时数据必须已经就位，
   否则会先画出上一个档案的内容再跳变。 */
async function setLine(v) {
  const next = v || null;
  if (STATE.line && next && STATE.line !== next) {
    STATE.lineHistory.unshift(\`\${STATE.line} → \${next}\`);
  }
  STATE.line = next;
  // 「重新选择分野」要回到闸门，而不是原地重渲染当前页
  if (!next) { STATE.route = 'dashboard'; location.hash = '#/dashboard'; }
  saveState();
  try { await bootData(); } catch (e) { toast('暂时取不到数据，下面看到的可能不是最新的'); }
  renderNav(); renderPage();
}`, 'setLine 改为 async 并重新取数据');

  // 4.6 boot 异步化：先取数据再渲染
  app = mustReplace(app, `function boot() {
  loadState();
  applyPrefs();`, `/* 定点替换（M5 第 3 处）：启动异步化。
   原型的 boot 是同步的（数据在本地），开发版必须先拿到 /api/bootstrap 才能渲染。
   \`loadState\` 先跑是为了拿到上次选的分野——要按它去取对应档案。 */
async function boot() {
  loadState();
  applyPrefs();
  try {
    await bootData();
  } catch (e) {
    // 取不到数据也要把界面立起来：空态比白屏有用，患者至少能看见「哪里不对」
    document.getElementById('wbPage').innerHTML =
      \`<div class="empty"><b>暂时读不到本机数据</b><p>工作台的数据库还没就绪或服务未启动。\`
      + \`这一页没有显示任何记录，不代表你没有记录。</p><p class="src">\${esc(String(e && e.message || e))}</p></div>\`;
    document.body.setAttribute('data-booted', '1');
    return;
  }`, 'boot 改为 async 并先取数据');

  // 4.7 就绪信号：测试与宿主靠 data-booted 判断首屏渲染完成
  app = mustReplace(app, 'document.addEventListener(\'DOMContentLoaded\', boot);',
    `/* 就绪信号：\`data-booted="1"\` 表示首屏已渲染过一次。
   test/ui-parity.test.mjs 与宿主都靠它判断「可以比对了」。
   用 finally 而不是在末尾赋值：万一渲染中途抛错（例如数据形状不对），也要把信号置上——
   否则验收只会看到「页面 12 秒没就绪」这种没有信息量的超时，
   而真正的原因（console 里的那条异常）反而被超时盖住了。 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await boot();
  } finally {
    document.body.setAttribute('data-booted', '1');
  }
});`, 'DOMContentLoaded 改为置 data-booted');

  /**
   * 4.8 `STATUS_TEXT.trials` 改成惰性求值。
   *
   * 这是 parity 卡了很久的真正原因，值得写清楚：`const STATUS_TEXT = { …, trials: `…${TRIALS_STATS.total}…` }`
   * 在 app.js **顶层**。原型里 `TRIALS_STATS` 来自先加载的 data.js，脚本求值时已有值；
   * 开发版的数据是**异步**取的，脚本求值到这一行时它还是 `undefined` → 抛
   * `TypeError: Cannot read properties of undefined (reading 'total')` → **整个脚本中断**。
   *
   * 后果特别隐蔽：函数声明会提升，所以 `typeof renderNav === 'function'` 仍然成立，
   * 但末尾那句 `DOMContentLoaded` 监听器**根本没注册上**，页面表现为「12 秒没就绪」，
   * 而真正的原因（console 里那条 TypeError）被超时盖住了。绕了很久才发现。
   *
   * 用 getter 把这次求值推迟到真正读取的时候，那时数据已经绑好了。
   */
  app = mustReplace(app,
    '  trials: `临床试验 · 2026 登记数据 ${TRIALS_STATS.total} 条 · 抓取于 ${TRIALS_STATS.fetchedAt}`,',
    [
      '  /* 定点替换（M5 第 6 处）：STATUS_TEXT.trials 改为惰性求值。',
      '     原因见 scripts/build-public.mjs 的「4.8」注释：顶层求值时数据还没绑上，',
      '     会抛 TypeError 并中断整个脚本，连 DOMContentLoaded 都注册不上。 */',
      '  get trials() {',
      '    return `临床试验 · 2026 登记数据 ${TRIALS_STATS.total} 条 · 抓取于 ${TRIALS_STATS.fetchedAt}`;',
      '  },',
    ].join('\n'), 'STATUS_TEXT.trials 改为惰性求值');

  /**
   * 4.9 ResizeObserver 的观察目标要判空。
   *
   * 开发版没有原型的演示横幅 `.wb-demo-bar`（那是「这是原型」的提示条，装进工作台就不该再有），
   * 于是 `document.querySelector('.wb-demo-bar')` 回 `null`，直接喂给 `ro.observe()` 会抛
   * `TypeError: Failed to execute 'observe' on 'ResizeObserver': parameter 1 is not of type 'Element'`。
   * 这条错误发生在 `boot()` 末尾，前面已经渲染完了，所以页面看着是好的、只有 console 红——
   * 但 `test/ui-parity.test.mjs` 的「两侧零 error」那条会挂。逐个判空即可。
   */
  app = mustReplace(app,
    `if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => syncChromeHeight());
    ro.observe(document.querySelector('.wb-topbar'));
    ro.observe(document.querySelector('.wb-demo-bar'));
  }`,
    `if (window.ResizeObserver) {
    /* 定点替换（M5 第 7 处）：观察目标逐个判空。
       开发版没有演示横幅 .wb-demo-bar，querySelector 会回 null，
       直接 observe(null) 会抛 TypeError（实测踩过）。缺一个元素不该让启动报错。 */
    const ro = new ResizeObserver(() => syncChromeHeight());
    for (const sel of ['.wb-topbar', '.wb-demo-bar']) {
      const el = document.querySelector(sel);
      if (el) ro.observe(el);
    }
  }`, 'ResizeObserver 观察目标判空');

  /**
   * 4.10 / 4.11 按分野分键的两份数据，开发版不再二次索引。
   *
   * 原型的 `SURGERY_CASE` 与 `TREATMENT_CASE` 是**按分野分键**的：
   *   `const SURGERY_CASE = { nmibc: {...}, mibc: {...} };`
   * 所以原型要 `SURGERY_CASE[STATE.line === 'mibc' ? 'mibc' : 'nmibc']` 取出当前那条。
   *
   * 开发版里**一个档案就是一条线**（demo1 = nmibc、demo2 = mibc），readmodels 给出的
   * `surgeryCase` / `treatmentCase` 已经是**拍平的那一条**（`{turbt, reTurbt, radical}`），
   * 再索引一次会得到 `undefined`，然后在 `C.radical` 上抛
   * `TypeError: Cannot read properties of undefined (reading 'radical')`。
   *
   * 注意 `DIVERSION_CASE` 在原型里本来就是平的（顶层键 `activeKind/operatedOn/hospital/values/explain`），
   * 所以它**不需要**这处替换——三份数据形状不一致，只能逐份对待，不能一刀切。
   */
  app = mustReplace(app,
    "  const C = SURGERY_CASE[STATE.line === 'mibc' ? 'mibc' : 'nmibc'];",
    `  /* 定点替换（M5 第 8 处）：开发版一个档案就是一条线，SURGERY_CASE 已是拍平的那一条，
     不再按分野索引（原型是 {nmibc,mibc} 分键，所以原型才需要索引）。 */
  const C = SURGERY_CASE;`, 'SURGERY_CASE 不再二次索引');

  app = mustReplace(app,
    "  const C = TREATMENT_CASE[STATE.line === 'mibc' ? 'mibc' : 'nmibc'];",
    `  /* 定点替换（M5 第 9 处）：同第 8 处，TREATMENT_CASE 也已是拍平的那一条。 */
  const C = TREATMENT_CASE;`, 'TREATMENT_CASE 不再二次索引');

  return `/**
 * 小泉宝 UroPal · 开发版应用（M5）
 *
 * ⚠️ **本文件是生成物，不要直接改。**
 * 由 \`scripts/build-public.mjs\` 从 prototypes/v0.1/ 的 charts.js + app.js 拼接并做九处定点改造生成。
 * 改渲染逻辑请改原型（但那会动 G2 签认的哈希，需要重新确认）；改数据来源请改生成器。
 *
 * 九处定点改造（其余每一个字符都与原型相同，这是逐字符 parity 的前提）：
 *   1. 数据来源 data.js 全局 → /api/bootstrap
 *   2. 换分野后重新取数据
 *   3. 启动异步化 + data-booted 就绪信号
 *   4. 治疗事件优先读档案（CHART 闭包内）
 *   5. 版本号读构建注入（单一来源）
 *   6. STATUS_TEXT.trials 惰性求值（避免顶层读到未绑定的数据）
 *   7. ResizeObserver 观察目标判空（开发版没有 .wb-demo-bar）
 *   8. SURGERY_CASE 不再二次索引（档案即分野）
 *   9. TREATMENT_CASE 不再二次索引
 */
'use strict';

${BINDING_LAYER}
${chartsPatched}
${app}`;
}

/* ============================================================
   执行
   ============================================================ */
const outputs = [
  ['style.css', read(join(SRC, 'tokens.css'))],
  ['shell.css', read(join(SRC, 'shell.css')) + SHELL_DELTA],
  ['primer.css', read(join(SRC, 'primer.css'))],
  ['index.html', buildHtml()],
  ['primer-data.js', read(join(SRC, 'primer-data.js'))],
  ['primer.js', read(join(SRC, 'primer.js'))],
  ['app.js', buildApp()],
];

if (CHECK) {
  let bad = 0;
  for (const [name, want] of outputs) {
    const file = join(OUT, name);
    const got = existsSync(file) ? read(file) : null;
    if (got === want) { console.log(`= public/${name} 一致`); continue; }
    console.log(`✗ public/${name} ${got === null ? '缺失' : '与生成结果不一致'}`);
    bad += 1;
  }
  if (bad) { console.error(`\n${bad} 个文件需要重新生成：node scripts/build-public.mjs`); process.exit(1); }
  console.log(`\n✓ 开发版前端与原型同源（${outputs.length} 个文件）`);
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of outputs) {
    const file = join(OUT, name);
    const before = existsSync(file) ? read(file) : null;
    if (before === text) { console.log(`= public/${name} 未变化`); continue; }
    writeFileSync(file, text);
    console.log(`+ public/${name} 已写入（${text.split('\n').length} 行）`);
  }
  const proto = read(join(SRC, 'shell.css'));
  const shell = read(join(OUT, 'shell.css'));
  if (shell.slice(0, proto.length) !== proto) {
    console.error('✗ public/shell.css 的前缀与原型不一致——开发版增量只能追加在末尾');
    process.exit(1);
  }
  console.log('✓ public/shell.css 前缀与原型逐字节相同（增量只在末尾）');
}
