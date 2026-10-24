#!/usr/bin/env node
// 检查器 5/5：无头实测探针（M5 判据第 7 条）。
//
// 为什么必须"真跑出数字"：
// 导航项数、页签数、面板宽度夹取、窄屏横向溢出这四件事，
// 只看代码或看截图都可能骗过审核（原型对了、生产页没接上；CSS 写了 clamp 但没生效）。
// 所以这里起一个真实服务 + 无头 Chrome，在真实渲染结果上数、真实拖拽、真实改视口，
// 把数字原样打出来，并且**期望值来自设计契约而不是本次实测**（否则就成了自证）。
//
// 依赖说明：脚本 import 了 ./cdp.mjs（已存在，不重写）与 ../lib/layout.js（面板参数唯一来源）。
//
// 用法：
//   node scripts/probe-headless.mjs
//   PROBE_PUBLIC_DIR=prototypes/v0.1 node scripts/probe-headless.mjs   # 诊断模式
// 退出码：
//   0 = 生产页面（public/）全部达标
//   1 = 有断言不达标，或依赖未就绪（例如 public/index.html 还不存在）
//   3 = 诊断模式：数字取自 PROBE_PUBLIC_DIR 指定的目录，**不能替代 public/ 验收**

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWorkbenchServer } from '../dsh/server.js';
import { AGENT_PANE } from '../lib/layout.js';
import { launchChrome, stopChrome, sleep } from './cdp.mjs';

// ─────────────────────────── 设计契约（期望值） ───────────────────────────
// 这些数字来自 docs/UI-DESIGN.md 与 prototypes/v0.1/data.js，**不是**从被检页面读出来的。
const EXPECT = {
  navRoutes: 14, // 一级导航项（不含「设置」）
  tabsTotal: 48, // 全部一级页面的二级页签总数
  defaultW: 35,
  minW: 25,
  maxW: 45,
  narrow: 390, // 窄屏宽度（iPhone 14 逻辑宽）
};

// 实测出来的坑：无头 Chrome 默认窗口只有 ~800px 宽，而本工作台在 ≤760px 会
// 切换成"覆盖式抽屉"布局（shell.css 里 `.wb-splitter { display: none !important }`），
// 这时分隔条 rect 是 0×0，任何拖拽都落在别的元素上，面板宽度怎么看都是 35——
// 看起来像"拖动无效"，其实是探针跑在了窄屏分支里。所以量面板前必须先声明桌面视口。
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };

// 生产页面与原型共用同一套 DOM 契约（public/ 由原型落成），
// 但为了在 public/ 还在施工时不至于"选择器一变就查不到"，
// 这里给每个部件准备候选选择器，并**打印实际命中的是哪一个**。
const SEL = {
  nav: ['#wbNav .nav-item[data-route]', '#nav .nav-button[data-route]', '#nav .nav-button'],
  tabs: ['#wbPage .tab[data-tab]', '#page .tab', '.tabs .tab'],
  pane: ['#agentPane', '#agent-pane'],
  toggle: ['#btnAgent', '#agent-toggle'],
  splitter: ['#splitter', '#agent-splitter'],
  close: ['#btnAgentClose', '#agent-hide'],
};

const PROBE_CDP_PORT = Number(process.env.UROPAL_PROBE_CDP_PORT || 9344);
const publicOverride = process.env.PROBE_PUBLIC_DIR ? resolve(process.env.PROBE_PUBLIC_DIR) : null;
const diagnostic = !!publicOverride;
const servedDir = publicOverride || resolve(fileURLToPath(new URL('../public', import.meta.url)));

// ─────────────────────────────── 报告工具 ───────────────────────────────
const rows = [];
/** 记一行判定。实测值原样展示；期望值来自契约。 */
function row(item, actual, expected, ok, note = '') {
  rows.push({ item, actual: String(actual), expected: String(expected), ok, note });
  return ok;
}
function twins(s) {
  // 中文字符按两列宽算，保证表格在终端里对得齐。
  let w = 0;
  for (const ch of String(s)) w += ch.codePointAt(0) > 0x2e80 ? 2 : 1;
  return w;
}
function printTable() {
  const cols = ['项目', '实测', '期望', '判定'];
  const width = [0, 0, 0, 0];
  const all = rows.map((r) => [r.item, r.actual, r.expected, r.ok ? '✓' : '✗']);
  all.forEach((cells) => cells.forEach((c, i) => (width[i] = Math.max(width[i], twins(c)))));
  const line = (cells) => cells.map((c, i) => c + ' '.repeat(Math.max(0, width[i] - twins(c)))).join('  ');
  console.log('');
  console.log(line(cols));
  console.log(width.map((w) => '─'.repeat(w)).join('  '));
  for (const c of all) console.log(line(c));
  const notes = rows.filter((r) => r.note);
  if (notes.length) {
    console.log('');
    for (const r of notes) console.log(`  · ${r.item}：${r.note}`);
  }
}

const failures = [];
const hardFail = (m) => failures.push(m);

async function main() {
  console.log('▶ 无头实测探针 · 小泉宝 UroPal');
  console.log(`  服务静态目录：${servedDir}`);
  if (diagnostic) {
    console.log('  ⚠ 诊断模式（PROBE_PUBLIC_DIR）：数字来自指定目录，不能替代 public/ 验收');
  }

  // ① 静态契约：面板参数的唯一来源是 lib/layout.js，先确认常量本身没漂。
  row('lib/layout.js 面板默认宽', AGENT_PANE.default, EXPECT.defaultW, AGENT_PANE.default === EXPECT.defaultW);
  row('lib/layout.js 面板夹取下限', AGENT_PANE.min, EXPECT.minW, AGENT_PANE.min === EXPECT.minW);
  row('lib/layout.js 面板夹取上限', AGENT_PANE.max, EXPECT.maxW, AGENT_PANE.max === EXPECT.maxW);

  // ② 依赖就绪：连 index.html 都没有就跑，只会得到一堆 404，早说早停。
  const indexFile = join(servedDir, 'index.html');
  if (!existsSync(indexFile)) {
    console.error('');
    console.error(`✗ 依赖未就绪：找不到 ${indexFile}`);
    console.error('  public/ 由另一个子任务产出；在它就绪前，本探针无法对生产页面出数。');
    console.error('  先跑代码契约检查：node scripts/check-workbench-package.mjs .');
    console.error('  需要"探针逻辑本身能不能出数"时，用诊断模式（不冒充验收）：');
    console.error('    PROBE_PUBLIC_DIR=prototypes/v0.1 node scripts/probe-headless.mjs');
    process.exitCode = 1;
    return;
  }

  const probeDir = mkdtempSync(join(tmpdir(), 'uropal-probe-'));
  const app = createWorkbenchServer({
    root: probeDir,
    dbPath: join(probeDir, 'xyb-bladder-probe.sqlite'),
    ...(publicOverride ? { publicDir: publicOverride } : {}), // 不传时用包内 public/
    runtime: 'standalone',
    basePath: '',
  });

  let server = null;
  let chrome = null;
  try {
    server = await app.listen(0, '127.0.0.1');
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/`;
    console.log(`  服务地址：${url}`);

    chrome = await launchChrome({ port: PROBE_CDP_PORT });
    const { cdp } = chrome;

    await cdp.send('Emulation.setDeviceMetricsOverride', DESKTOP); // 先固定桌面视口，理由见 DESKTOP 注释
    await cdp.send('Page.navigate', { url });
    // 就绪判据用 DOM 而不是 body 上的某个标记：生产页与原型都没有统一的 booted 标记，
    // 而"导航项出现了"是两者共有的、可观察的事实。
    let booted = false;
    let bodyText = '';
    for (let i = 0; i < 60 && !booted; i += 1) {
      await sleep(150);
      const probe = await cdp.eval(`(() => ({
        nav: ${JSON.stringify(SEL.nav)}.reduce((n, s) => n || document.querySelectorAll(s).length, 0),
        text: (document.body ? document.body.textContent : '').trim().slice(0, 140)
      }))()`);
      bodyText = probe?.text || '';
      booted = (probe?.nav || 0) > 0;
    }

    const navStatus = await cdp.eval(`performance.getEntriesByType('navigation')[0]?.responseStatus ?? null`);
    if (!booted) {
      console.error('');
      console.error('✗ 页面没有渲染出导航项，探针无法出数。');
      console.error(`  首个文档响应状态：${navStatus ?? '(取不到)'}`);
      console.error(`  页面正文开头：${bodyText || '(空)'}`);
      console.error('  若正文是 {"error":"找不到页面文件（public/index.html）"}，说明静态目录不对。');
      process.exitCode = 1;
      return;
    }

    // ── ③ 一级导航项数与「设置」入口 ──
    const navSel = await cdp.eval(
      `(() => { for (const s of ${JSON.stringify(SEL.nav)}) if (document.querySelectorAll(s).length) return s; return null; })()`,
    );
    const navCount = await cdp.eval(`document.querySelectorAll(${JSON.stringify(navSel)}).length`);
    const hasSettings = await cdp.eval(`!!document.querySelector('[data-act="settings"], #btnSettings, [data-route="settings"]')`);
    row('一级导航项数', navCount, EXPECT.navRoutes, navCount === EXPECT.navRoutes, `选择器 ${navSel}`);
    row('「设置」入口存在', hasSettings ? '有' : '无', '有', !!hasSettings);

    // ── ④ 二级页签总数：逐个一级页面点进去数 ──
    // 坑：不能在这里"先解析出一个页签选择器"。起始页（看板）本来就没有二级页签，
    // 提前解析会得到 null，之后 querySelectorAll("null") 永远匹配不到东西，
    // 于是每一页都数出 0——那是探针的错，不是页面的错。改成每页用联合选择器现数。
    const tabsUnion = SEL.tabs.join(', ');
    const perRoute = [];
    let tabsSelHit = null;
    for (let i = 0; i < navCount; i += 1) {
      const clicked = await cdp.eval(
        `(() => { const b = document.querySelectorAll(${JSON.stringify(navSel)})[${i}];
           if (!b) return null; b.click(); return b.dataset.route || b.textContent.trim().slice(0, 12); })()`,
      );
      await sleep(80);
      const n = (await cdp.eval(`document.querySelectorAll(${JSON.stringify(tabsUnion)}).length`)) || 0;
      if (n > 0 && !tabsSelHit) {
        tabsSelHit = await cdp.eval(
          `(() => { for (const s of ${JSON.stringify(SEL.tabs)}) if (document.querySelectorAll(s).length) return s; return null; })()`,
        );
      }
      perRoute.push([clicked || `#${i}`, n]);
    }
    const tabsTotal = perRoute.reduce((s, [, n]) => s + n, 0);
    row(
      '二级页签总数',
      tabsTotal,
      EXPECT.tabsTotal,
      tabsTotal === EXPECT.tabsTotal,
      `逐页：${perRoute.map(([r, n]) => `${r}=${n}`).join(' ')}${tabsSelHit ? ` ／ 命中选择器 ${tabsSelHit}` : ''}`,
    );

    // ── ⑤ 面板：关闭 → 打开（默认宽）→ 拖到最左/最右（夹取）→ 收起 ──
    const paneSel = await cdp.eval(
      `(() => { for (const s of ${JSON.stringify(SEL.pane)}) if (document.querySelector(s)) return s; return null; })()`,
    );
    const toggleSel = await cdp.eval(
      `(() => { for (const s of ${JSON.stringify(SEL.toggle)}) if (document.querySelector(s)) return s; return null; })()`,
    );
    const splitterSel = await cdp.eval(
      `(() => { for (const s of ${JSON.stringify(SEL.splitter)}) if (document.querySelector(s)) return s; return null; })()`,
    );
    const closeSel = await cdp.eval(
      `(() => { for (const s of ${JSON.stringify(SEL.close)}) if (document.querySelector(s)) return s; return null; })()`,
    );

    if (!paneSel || !toggleSel || !splitterSel) {
      hardFail(`面板部件缺失（pane=${paneSel} toggle=${toggleSel} splitter=${splitterSel}）`);
      row('面板部件齐备', `pane=${paneSel} toggle=${toggleSel} splitter=${splitterSel}`, '三者都在', false);
    } else {
      const readPane = () =>
        cdp.eval(`(() => {
          const v = getComputedStyle(document.documentElement).getPropertyValue('--agent-w').trim();
          const sp = document.querySelector(${JSON.stringify(splitterSel)});
          const pane = document.querySelector(${JSON.stringify(paneSel)});
          const tg = document.querySelector(${JSON.stringify(toggleSel)});
          return {
            css: v,
            aria: sp ? sp.getAttribute('aria-valuenow') : null,
            hidden: pane ? !!pane.hidden : null,
            expanded: tg ? tg.getAttribute('aria-expanded') : null
          };
        })()`);

      const before = await readPane();
      row('面板初始为收起', before.hidden === true ? '收起' : '展开', '收起', before.hidden === true);

      await cdp.eval(`document.querySelector(${JSON.stringify(toggleSel)}).click()`);
      await sleep(220);
      const opened = await readPane();
      const wDefault = Number.parseFloat(opened.css);
      row('打开后面板宽度(%)', Number.isFinite(wDefault) ? wDefault : `解析失败(${opened.css})`, EXPECT.defaultW, wDefault === EXPECT.defaultW, `aria-valuenow=${opened.aria}`);

      // 拖拽用真实鼠标事件（Input.dispatchMouseEvent），而不是直接派发合成 DOM 事件：
      // 只有真实事件才走完"按在分隔条上 → 移动 → 松开"的完整路径。
      // 每次拖动前重新取分隔条位置：宽度变了，分隔条的位置也跟着变。
      const drag = async (toX) => {
        const at = await cdp.eval(
          `(() => { const e = document.querySelector(${JSON.stringify(splitterSel)}); const b = e.getBoundingClientRect();
             return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
        );
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(at.x), y: Math.round(at.y), button: 'left', buttons: 1, clickCount: 1 });
        for (const x of [at.x - 40, at.x - 120, toX]) {
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(at.y), button: 'left', buttons: 1 });
          await sleep(30);
        }
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(toX), y: Math.round(at.y), button: 'left', buttons: 0 });
        await sleep(160);
        const r = await readPane();
        return Number.parseFloat(r.css);
      };

      // 拖拽前先确认分隔条真的占位。rect 0×0（通常是 display:none）说明当前布局不是
      // "带分隔条的桌面布局"（≤760px 会切成覆盖式抽屉），这时拖拽必然落在别的元素上。
      // 这种情况必须明确报出来，而不是让宽度"没变化"含糊过去。
      const spGeom = await cdp.eval(
        `(() => { const sp = document.querySelector(${JSON.stringify(splitterSel)});
           if (!sp) return null;
           const b = sp.getBoundingClientRect();
           return { w: Math.round(b.width), h: Math.round(b.height), display: getComputedStyle(sp).display }; })()`,
      );
      const splittable = !!spGeom && spGeom.w > 0 && spGeom.h > 0;
      row(
        '分隔条在桌面视口下有实体尺寸',
        spGeom ? `display=${spGeom.display} ${spGeom.w}×${spGeom.h}px` : '(找不到分隔条)',
        '可见且有宽高',
        splittable,
        splittable ? '' : `当前视口 ${DESKTOP.width}×${DESKTOP.height}px；display=none 说明走到了窄屏抽屉分支`,
      );

      const widest = splittable ? await drag(0) : NaN; // 面板在右：拖到最左 = 拉到最宽
      row('拖到最左后宽度(%)', Number.isFinite(widest) ? widest : '没能拖（见上一行）', `${EXPECT.minW}–${EXPECT.maxW}（应到上限）`, widest === EXPECT.maxW);
      const narrowest = splittable ? await drag(4000) : NaN;
      row('拖到最右后宽度(%)', Number.isFinite(narrowest) ? narrowest : '没能拖（见上一行）', `${EXPECT.minW}–${EXPECT.maxW}（应到下限）`, narrowest === EXPECT.minW);
      row(
        '宽度始终夹在 25–45',
        `${widest} / ${narrowest}`,
        `⊂ [${EXPECT.minW},${EXPECT.maxW}]`,
        [widest, narrowest].every((n) => Number.isFinite(n) && n >= EXPECT.minW && n <= EXPECT.maxW),
      );

      // 键盘可达性：分隔条必须能用键盘调整（无障碍要求）。
      // 方向约定（哪个键变宽）不写死，只要求 Home/End 到达两端、左右键方向相反。
      const kb = await cdp.eval(
        `(() => { const sp = document.querySelector(${JSON.stringify(splitterSel)});
           if (!sp) return null;
           const read = () => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--agent-w'));
           const press = (k) => { sp.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); return read(); };
           sp.focus();
           return {
             home: press('Home'),
             left: press('ArrowLeft'),
             right: press('ArrowRight'),
             end: press('End'),
             focused: document.activeElement === sp,
             tabindex: sp.getAttribute('tabindex')
           };
         })()`,
      );
      if (kb) {
        row('分隔条可聚焦', kb.tabindex ?? '(无)', '0', kb.tabindex === '0', kb.focused ? '' : '本次 focus() 未取得焦点');
        row('Home 键 → 最小宽', kb.home, EXPECT.minW, kb.home === EXPECT.minW);
        row('End 键 → 最大宽', kb.end, EXPECT.maxW, kb.end === EXPECT.maxW);
        row(
          '方向键能调宽度且方向相反',
          `ArrowLeft ${kb.home}→${kb.left}，ArrowRight ${kb.left}→${kb.right}`,
          `左键变宽、右键变窄，且都在 [${EXPECT.minW},${EXPECT.maxW}]`,
          Number.isFinite(kb.left) && Number.isFinite(kb.right)
            && kb.left > kb.home && kb.right < kb.left
            && [kb.left, kb.right].every((n) => n >= EXPECT.minW && n <= EXPECT.maxW),
        );
      }

      // 收起：优先用面板自带的关闭按钮，没有就再点一次顶栏开关。
      if (closeSel) await cdp.eval(`document.querySelector(${JSON.stringify(closeSel)}).click()`);
      else await cdp.eval(`document.querySelector(${JSON.stringify(toggleSel)}).click()`);
      await sleep(220);
      const closed = await readPane();
      row('收起后回到隐藏态', closed.hidden === true ? '隐藏' : `仍可见(hidden=${closed.hidden})`, '隐藏', closed.hidden === true);
    }

    // ── ⑥ 窄屏 390px：不许横向溢出 ──
    // 判据写成 scrollWidth <= innerWidth：无头 Chrome 的滚动条是否占宽度因平台而异，
    // 硬比 `=== 390` 会在某些环境假失败；"是否溢出"才是真正要守的性质。
    // 同时把 clientWidth / body.scrollWidth 一起打出来，方便人判断。
    const measureNarrow = () =>
      cdp.eval(`(() => {
        const de = document.documentElement;
        return {
          scrollWidth: de.scrollWidth,
          clientWidth: de.clientWidth,
          bodyScrollWidth: document.body ? document.body.scrollWidth : null,
          innerWidth: window.innerWidth,
          dpr: window.devicePixelRatio
        };
      })()`);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: EXPECT.narrow, height: 844, deviceScaleFactor: 2, mobile: false });
    await sleep(400);
    const narrowClosed = await measureNarrow();
    row(
      `${EXPECT.narrow}px 窄屏 scrollWidth ≤ innerWidth（面板收起）`,
      `${narrowClosed.scrollWidth} ≤ ${narrowClosed.innerWidth}`,
      '成立',
      narrowClosed.scrollWidth <= narrowClosed.innerWidth,
      `clientWidth=${narrowClosed.clientWidth} body.scrollWidth=${narrowClosed.bodyScrollWidth}`,
    );
    row(
      `${EXPECT.narrow}px 窄屏 scrollWidth === ${EXPECT.narrow}`,
      narrowClosed.scrollWidth,
      EXPECT.narrow,
      narrowClosed.scrollWidth === EXPECT.narrow,
    );

    if (paneSel && toggleSel) {
      await cdp.eval(`document.querySelector(${JSON.stringify(toggleSel)}).click()`);
      await sleep(400);
      const narrowOpen = await measureNarrow();
      row(
        `${EXPECT.narrow}px 窄屏 面板展开也不横向溢出`,
        `${narrowOpen.scrollWidth} ≤ ${narrowOpen.innerWidth}`,
        '成立',
        narrowOpen.scrollWidth <= narrowOpen.innerWidth,
        `clientWidth=${narrowOpen.clientWidth} body.scrollWidth=${narrowOpen.bodyScrollWidth}`,
      );
      if (toggleSel) await cdp.eval(`document.querySelector(${JSON.stringify(toggleSel)}).click()`);
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', DESKTOP); // 回到桌面视口，不改全局默认
    await sleep(200);

    // ── ⑦ 控制台 error 与 4xx ──
    // favicon 单独处理：无头 Chrome 总会去要 /favicon.ico，没有就 404。
    // 这不是页面缺陷，混进 4xx 计数会让"零 4xx"这条判据永远为假，反而掩盖真正的坏资源。
    const badResources = (await cdp.eval(
      `performance.getEntriesByType('resource').filter((e) => e.responseStatus >= 400).map((e) => e.name.split('/').slice(-1)[0] + ' → ' + e.responseStatus)`,
    )) || [];
    const favicon = badResources.filter((r) => r.startsWith('favicon.ico'));
    const realBad = badResources.filter((r) => !r.startsWith('favicon.ico'));
    row('console error 计数', cdp.errors.length, 0, cdp.errors.length === 0, cdp.errors.slice(0, 3).join(' | '));
    row('主文档响应状态', navStatus ?? '(取不到)', '200', navStatus === 200);
    row('4xx/5xx 资源计数（不含 favicon）', realBad.length, 0, realBad.length === 0, realBad.slice(0, 5).join(' | '));
    row(
      'favicon.ico（参考，不计判据）',
      favicon.length ? '404' : '有',
      '—',
      true, // 刻意恒为 ✓：这条只是把事实摆出来，404 不算缺陷，也不能拖累退出码
      '无头 Chrome 默认会去要 /favicon.ico；没有它只影响浏览器标签页图标',
    );
    row('网络加载失败计数', cdp.badResponses.length, 0, cdp.badResponses.length === 0, cdp.badResponses.slice(0, 3).join(' | '));

    printTable();
  } finally {
    // 不管成功失败都要收干净：Chrome 进程、服务、临时目录。
    if (chrome) await stopChrome(chrome);
    if (server) await new Promise((ok) => server.close(ok));
    try {
      rmSync(probeDir, { recursive: true, force: true });
    } catch {
      /* 临时目录清不掉不影响结论 */
    }
  }

  const failedRows = rows.filter((r) => !r.ok);
  console.log('');
  if (failedRows.length === 0 && failures.length === 0) {
    if (diagnostic) {
      console.log('△ 诊断模式全部达标——但这是 PROBE_PUBLIC_DIR 指定的目录，不能替代 public/ 验收（退出码 3）。');
      process.exitCode = 3;
    } else {
      console.log(`✓ 全部达标（${rows.length} 项实测，数字取自真实渲染）`);
      process.exitCode = 0;
    }
  } else {
    console.error(`✗ 未达标：${failedRows.length} 行 + ${failures.length} 个硬失败`);
    for (const r of failedRows) console.error(`  ✗ ${r.item}：实测 ${r.actual}，期望 ${r.expected}`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error('');
  console.error(`✗ 探针执行失败：${error?.stack || error}`);
  console.error('  常见原因：Chrome 找不到（用 CHROME_PATH 指定）、调试端口被占用（UROPAL_PROBE_CDP_PORT）、');
  console.error('  或 dsh/server.js 还没就绪。');
  process.exitCode = 1;
});
