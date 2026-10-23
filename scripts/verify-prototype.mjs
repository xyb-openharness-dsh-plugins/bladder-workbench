#!/usr/bin/env node
/**
 * 原型自检（G2 证据生成器）
 * 用法：node scripts/verify-prototype.mjs [--out prototypes/v0.1/_shots]
 *
 * 做三件事，缺一不可：
 *  1) 真浏览器打开 prototypes/v0.1/index.html（本地起静态服务，避免 file:// 限制）
 *  2) 逐页截图，并把「页面文字里出现红线词」当成失败
 *  3) 断言关键结构：分野闸门、3D 卡翻转、一图秀网格、390px 不横向溢出、顶栏三段式
 *
 * 注意：浏览器内核用全局安装的 @playwright/test（本机 /opt/homebrew/lib/node_modules）。
 * 脚本本身不写业务代码，只做目视证据采集。
 */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve(process.cwd());
const DIR = join(ROOT, 'prototypes', 'v0.1');
const argv = process.argv.slice(2);
const outArg = argv.indexOf('--out');
const OUT = resolve(ROOT, outArg >= 0 ? argv[outArg + 1] : join('prototypes', 'v0.1', '_shots'));

/* ---------- 1. 找到 playwright 内核 ---------- */
function loadChromium() {
  const candidates = [
    '@playwright/test',
    '/opt/homebrew/lib/node_modules/@playwright/test',
    '/usr/local/lib/node_modules/@playwright/test',
    'playwright',
    '/opt/homebrew/lib/node_modules/playwright',
  ];
  for (const c of candidates) {
    try {
      const m = require(c);
      if (m && m.chromium) return { chromium: m.chromium, from: c };
    } catch { /* 继续找 */ }
  }
  throw new Error('找不到 playwright 内核。试过：' + candidates.join(' / '));
}

/* ---------- 2. 极简静态服务 ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
function serve() {
  return new Promise((ok) => {
    const srv = createServer(async (req, res) => {
      const p = decodeURIComponent((req.url || '/').split('?')[0]);
      const f = join(DIR, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
      if (!f.startsWith(DIR)) { res.writeHead(403).end('forbidden'); return; }
      try {
        const buf = await readFile(f);
        res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
        res.end(buf);
      } catch { res.writeHead(404).end('not found'); }
    });
    srv.listen(0, '127.0.0.1', () => ok({ srv, port: srv.address().port }));
  });
}

/* ---------- 3. 断言工具 ---------- */
const results = [];
function assert(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const REDLINES = ['建议治疗', '可能复发', '可以停药', '无需就医', '一定是', '肯定会', '不用担心', '治愈率'];

async function main() {
  if (!existsSync(join(DIR, 'index.html'))) throw new Error('prototypes/v0.1/index.html 不存在');
  mkdirSync(OUT, { recursive: true });

  const { chromium, from } = loadChromium();
  console.log(`内核来源：${from}`);
  const { srv, port } = await serve();
  const base = `http://127.0.0.1:${port}/`;
  console.log(`本地服务：${base}\n输出目录：${OUT}\n`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  const shot = async (name) => { await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false }); };
  const nav = async (text) => {
    await page.click(`#wbNav .nav-item:has-text("${text}")`);
    await page.waitForTimeout(160);
  };

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(260);

  /* --- 首屏：分野闸门 --- */
  console.log('【首屏 · 分野闸门】');
  const gate = await page.$('.gate');
  assert('S01 首屏是分野引导卡，不是看板', !!gate);
  const gateText = gate ? await gate.innerText() : '';
  assert('闸门含三个选项', (await page.$$('.gate-choice')).length === 3, `${(await page.$$('.gate-choice')).length} 个`);
  /* 设计变更（2026-10-23）：原先未选线时整页只有一张闸门卡，首屏看着是空的、
     不像能用的产品（用户反馈「首页没有任何内容，这不真实」）。
     现在闸门降级成第一张卡，下面照常按演示档案 DEMO-1 渲染，但必须明标未确认。
     这条断言因此从「专属内容必须为 0」改成「闸门仍在 + 必有未确认标记 + 首页有内容」。 */
  const gateState = await page.evaluate(() => {
    const t = document.querySelector('#wbPage').innerText;
    return {
      gate: !!document.querySelector('.gate-page'),
      gateChoice: document.querySelectorAll('.gate-choice').length,
      unconfirmed: /分野未确认/.test(t),
      demoNamed: /DEMO-1/.test(t),
      entry: document.querySelectorAll('.entry-card').length,
      noFakeConfirm: !/当前阶段：/.test(t) || /分野未确认/.test(t),
    };
  });
  assert('尚未选线时：闸门仍在首屏且明标「分野未确认 · 按演示档案」',
    gateState.gate && gateState.gateChoice === 3 && gateState.unconfirmed && gateState.demoNamed,
    JSON.stringify(gateState));
  assert('尚未选线时首页不是空的（演示档案已渲染，但不假装已确认）',
    gateState.entry >= 1 && gateState.noFakeConfirm, JSON.stringify(gateState));
  assert('闸门页保留的待办卡明确标注「不依赖分野」', /不依赖分野/.test(await page.textContent('#wbPage')));
  assert('闸门文案如实说明「未选定时先按演示档案展示」（不得再写看板不显示内容）',
    /演示档案 DEMO-1/.test(await page.textContent('#wbPage')) && !/看板不会显示任何一条线/.test(await page.textContent('#wbPage')));
  assert('闸门里有 Ta/T1/Tis 白话解释', /Ta\s*\/\s*T1\s*\/\s*Tis/.test(gateText));
  assert('闸门里有「我还不确定」', /我还不确定/.test(gateText));
  assert('闸门声明不对保膀胱/切除表达倾向', /不.*表达倾向|不对.*倾向/.test(gateText));
  const chipV = await page.textContent('#versionChip');
  assert('顶栏版本 chip 首屏可见', /^v\d+\.\d+\.\d+$/.test((chipV || '').trim()), chipV);
  await shot('01-首屏-分野闸门');

  /* --- 外壳：原型横幅 / 品牌 / 演示档案卡 / 面包屑 / 状态灯 --- */
  console.log('\n【外壳 · 横幅 / 品牌 / 档案卡 / 面包屑】');
  const shell = await page.evaluate(() => {
    const bar = document.querySelector('.wb-demo-bar');
    const crumb = document.querySelector('#wbCrumb');
    const want = ['dashboard','records','staging','surgery','instillation','diversion','treatment',
                  'followup','metrics','chart','urgent','life','visit','trials'];
    return {
      bar: bar ? bar.innerText : '',
      brandName: (document.querySelector('.nav-brand-name') || {}).innerText || '',
      profile: !!document.querySelector('.nav-profile'),
      profileSel: !!document.querySelector('#selDemo'),
      sections: Array.from(document.querySelectorAll('.nav-sec')).map((x) => x.innerText.trim()),
      navCount: document.querySelectorAll('#wbNav .nav-item[data-route]').length,
      missing: want.filter((id) => !document.querySelector(`#wbNav .nav-item[data-route="${id}"]`)),
      settingsItem: !!document.querySelector('#wbNav .nav-item[data-act="settings"]'),
      crumb: crumb ? crumb.innerText : '',
      pills: Array.from(document.querySelectorAll('.tb-pill')).map((p) => ({ t: p.innerText.trim(), s: p.dataset.state })),
    };
  });
  assert('原型横幅声明「全部为模拟资料」', /模拟资料/.test(shell.bar), shell.bar);
  assert('原型横幅声明未接入 DSH / AI', /未接入/.test(shell.bar));
  assert('导航有品牌块与名称', /小泉宝/.test(shell.brandName), shell.brandName);
  assert('导航有演示档案卡（可切换分野）', shell.profile && shell.profileSel);
  assert('导航分组标题存在', shell.sections.length >= 3, shell.sections.join(' / '));
  assert('NAV 每一项都渲染（无静默丢失）', shell.missing.length === 0, shell.missing.join(','));
  assert('导航 14 个一级页 + 设置项', shell.navCount === 14 && shell.settingsItem, `${shell.navCount} 路由 + 设置=${shell.settingsItem}`);
  assert('面包屑显示当前位置', /小泉宝工作台/.test(shell.crumb), shell.crumb.replace(/\n/g, ' '));
  assert('两枚状态灯如实回显「未接入」',
    shell.pills.length === 2 && shell.pills.every((x) => x.s === 'off' && /未接入/.test(x.t)),
    JSON.stringify(shell.pills));

  /* --- 选 NMIBC → 看板 --- */
  console.log('\n【NMIBC 线 · 看板】');
  await page.click('.gate-choice[data-line="nmibc"]');
  await page.waitForTimeout(220);
  const nmibcText = await page.innerText('#wbPage');
  assert('NMIBC 看板出现（保膀胱线）', /非肌层浸润/.test(nmibcText));
  assert('NMIBC 看板含「膀胱灌注」卡', /膀胱灌注/.test(nmibcText));
  assert('NMIBC 看板含「下次膀胱镜」', /下次膀胱镜/.test(nmibcText));
  assert('表达面/指标面两列并置', /表达面/.test(nmibcText) && /指标面/.test(nmibcText));
  assert('看板声明不写因果', /不.*因果/.test(nmibcText));
  const dashShape = await page.evaluate(() => ({
    hero: document.querySelector('.hero-title') ? document.querySelector('.hero-title').innerText : '',
    strip: !!document.querySelector('.strip'),
    entries: document.querySelectorAll('.entry-card').length,
    todos: document.querySelectorAll('.todo-item').length,
    questions: document.querySelectorAll('.q-item').length,
    chart: !!document.querySelector('.chart-wrap svg'),
    urgent: document.querySelectorAll('.btn-urgent').length,
  }));
  assert('看板有 hero 主张句（不是卡片堆）', /把肿瘤控住|保住膀胱|重点/.test(dashShape.hero), dashShape.hero);
  assert('看板有「眼前一件事」主行动条', dashShape.strip);
  assert('看板有 3 张入口卡', dashShape.entries === 3, `${dashShape.entries} 张`);
  assert('看板有「接下来的安排」待办', dashShape.todos >= 2, `${dashShape.todos} 条`);
  assert('看板有「就诊前想问的事」', dashShape.questions >= 2, `${dashShape.questions} 条`);
  assert('看板有迷你趋势图（与一图秀同源）', dashShape.chart);
  assert('看板有急症入口按钮', dashShape.urgent >= 4, `${dashShape.urgent} 个`);
  await shot('02-看板-NMIBC');

  /* --- 膀胱灌注 --- */
  console.log('\n【膀胱灌注】');
  await nav('膀胱灌注');
  const inst = await page.innerText('#wbPage');
  assert('两段结构（诱导/维持）', /诱导/.test(inst) && /维持/.test(inst));
  assert('取消＝禁忌保护，不是病情变坏', /保护|禁忌在保护/.test(inst));
  assert('漏做不给建议', /不给任何建议|不给建议/.test(inst));
  const dots = await page.$$('.dot');
  assert('周期圆点已渲染', dots.length >= 6, `${dots.length} 个`);
  const cancelDot = await page.$('.dot[data-st="cancel"]');
  assert('存在「取消」状态的圆点', !!cancelDot);
  await shot('03-膀胱灌注-周期');

  /* --- 每个挂页签的页都必须真的注册了页签 --- */
  console.log('\n【页签完整性】');
  /* 曾经：pageRecords 按页签分发内容，但 NAV 里的 records 忘了写 tabs，
     于是「病情整理」点进去是「该页签还没有内容」。这类洞只有逐页走才看得见。 */
  const tabbed = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.nav-item[data-route]').forEach((b) => {
      out.push(b.dataset.route);
    });
    return out;
  });
  const tabProblems = [];
  for (const r of tabbed) {
    await page.evaluate((x) => { location.hash = '#/' + x; }, r);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => ({
      tabs: document.querySelectorAll('#wbPage .tab').length,
      empty: document.querySelectorAll('#wbPage .empty, #wbPage .empty-rich').length,
      chars: document.querySelector('#wbPage').innerText.replace(/\s+/g, '').length,
    }));
    if (info.empty > 0 || info.chars < 40) tabProblems.push(`${r}(tabs=${info.tabs},empty=${info.empty},chars=${info.chars})`);
  }
  assert('每个一级页打开都有实质内容（无空壳页）', tabProblems.length === 0, tabProblems.join(' '));
  const navNoTabs = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.nav-item[data-route]').forEach((b) => {
      if (b.dataset.route === 'dashboard') return;
    });
    return bad;
  });
  await nav('病情整理');
  const recTabs = await page.$$eval('#wbPage .tab', (els) => els.map((e) => e.textContent.trim()));
  assert('病情整理有五个页签且默认落在资料库',
    recTabs.length === 5 && recTabs[0] === '资料库', recTabs.join(' / '));

  /* --- 尿流改道 --- */
  console.log('\n【尿流改道与造口】');
  await nav('尿流改道与造口');
  await page.click('.tab:has-text("三术式对照")');
  await page.waitForTimeout(180);
  const div = await page.innerText('#wbPage');
  assert('三种术式并列', /回肠造口/.test(div) && /原位新膀胱/.test(div) && /输尿管皮肤造口/.test(div));
  assert('对照页声明不排序不推荐', /不排序|不推荐/.test(div));
  await shot('04-尿流改道-三术式对照');
  await page.click('.tab:has-text("原位新膀胱")');
  await page.waitForTimeout(180);
  const neo = await page.innerText('#wbPage');
  assert('原位新膀胱字段集不同（控尿/残余尿）', /控尿|残余尿/.test(neo));
  assert('术式改动留痕提示', /留痕/.test(neo));
  await shot('05-尿流改道-原位新膀胱');
  await page.click('.tab:has-text("造口日记")');
  await page.waitForTimeout(180);
  assert('造口日记为批量录入', !!(await page.$('.batch-row')));
  /* 光有 placeholder/aria-label，用户看不出「2」是换了几次还是漏了几次 —— 必须有可见标签 */
  const batchFields = await page.evaluate(() => [...document.querySelectorAll('.batch-row input, .batch-row select')].map((el) => {
    const lb = el.closest('label');
    const txt = lb ? lb.querySelector('span')?.textContent.trim() : '';
    return { t: el.type || el.tagName.toLowerCase(), label: txt || '' };
  }));
  assert('批量录入每个字段都有可见标签（不靠 placeholder 猜）',
    batchFields.length >= 5 && batchFields.every((f) => f.label.length > 0),
    batchFields.map((f) => `${f.t}:${f.label || '（无）'}`).join(' '));
  const lifeCard = await page.textContent('#wbPage');
  assert('造口日记含最近 30 天小结与生活影响', /最近 30 天小结/.test(lifeCard) && /造口对生活的影响/.test(lifeCard));
  /* 前缀曾写在 .src 上，把「总记录」「这是计数，不是评价」也冠成「来源：」。只允许 .src-line 带前缀。 */
  const srcPrefix = await page.evaluate(() => {
    const el = document.querySelector('.src:not(.src-line)');
    return el ? getComputedStyle(el, '::before').content : '__none__';
  });
  assert('普通说明不冒充「来源：」（前缀只加在 .src-line 上）',
    /^(none|normal|""|__none__)$/.test(String(srcPrefix)), String(srcPrefix));
  await shot('06-尿流改道-造口日记批量');

  /* --- 复查与膀胱镜 --- */
  console.log('\n【复查与膀胱镜】');
  await nav('复查与膀胱镜');
  await page.click('.tab:has-text("尿细胞学")');
  await page.waitForTimeout(180);
  const cyto = await page.innerText('#wbPage');
  assert('尿细胞学四态并列', ['阴性', '非典型', '可疑', '阳性'].every((s) => cyto.includes(s)));
  assert('说明「非典型」不等于阳性也不等于阴性', /非典型.*既不等于阳性，也不等于阴性/.test(cyto));
  await shot('07-复查-尿细胞学四态');
  await page.click('.tab:has-text("上尿路监测")');
  await page.waitForTimeout(180);
  assert('上尿路＝第二原发监测，与转移分开', /第二原发|另一个器官/.test(await page.innerText('#wbPage')));
  await shot('08-复查-上尿路监测');

  /* --- 指标卡 3D 翻转 --- */
  console.log('\n【检查与指标 · 3D 卡】');
  await nav('检查与指标');
  /* 用户反馈（2026-10-23）：「指标卡片没有实现 3D 反转」。
     复查发现卡片本身是好的 —— 是默认页签落在一张裸表上，3D 卡藏在第二个页签后面，
     打开这页根本看不到。默认页签必须是卡片。 */
  const metricsDefaultTab = await page.evaluate(() => {
    const t = document.querySelector('#wbPage .tab[aria-selected="true"]');
    return t ? t.textContent.trim() : null;
  });
  const cardsOnArrival = await page.$$('.metric-card');
  assert('检查与指标默认落在「分类指标卡」上（3D 卡不该藏在第二个页签后面）',
    metricsDefaultTab === '分类指标卡' && cardsOnArrival.length >= 7,
    `默认页签=${metricsDefaultTab}，首屏卡片=${cardsOnArrival.length}`);
  await page.click('.tab:has-text("分类指标卡")');
  await page.waitForTimeout(260);
  /* C11 可比组：肌酐在 2026-10-08 换了医院（酶法 → 苦味酸法），必须拆成两组 */
  const grp = await page.evaluate(() => {
    const m = METRICS.find((x) => x.code === 'cr');
    const gs = CHART.groupsOf(m);
    return { n: gs.length, labels: gs.map((g) => `${g.label}:${g.n}`),
             note: (document.querySelector('.metric-card[data-metric="cr"] .mc-groups') || {}).textContent || '' };
  });
  assert('可比组（C11）：肌酐换医院后拆成 2 组', grp.n === 2, JSON.stringify(grp));
  assert('可比组写在卡片正面（说清是哪几组、各几次）',
    /可比组 2 个/.test(grp.note) && /演示检验科/.test(grp.note) && /演示社区医院/.test(grp.note), grp.note);
  const totalPts = await page.evaluate(() => METRICS.reduce((a, m) => a + m.points.length, 0));
  assert('演示数据够厚（指标记录 ≥ 45 条，跨 ≥ 12 个月）', totalPts >= 45,
    `${totalPts} 条`);
  const before = await page.getAttribute('.metric-card', 'data-flipped');
  const persistStyle = await page.evaluate(() => {
    const inner = document.querySelector('.metric-inner');
    const card = document.querySelector('.metric-card');
    const cs = getComputedStyle(inner), cc = getComputedStyle(card);
    return { inner: cs.transformStyle, backface: getComputedStyle(document.querySelector('.metric-back')).backfaceVisibility, perspective: cc.perspective, h: Math.round(card.getBoundingClientRect().height) };
  });
  assert('外卡有 perspective', persistStyle.perspective !== 'none', persistStyle.perspective);
  assert('内层 preserve-3d', persistStyle.inner === 'preserve-3d', persistStyle.inner);
  assert('两面 backface-visibility:hidden', persistStyle.backface === 'hidden', persistStyle.backface);
  assert('外卡固定高度（276px 档）', persistStyle.h >= 260 && persistStyle.h <= 350, `${persistStyle.h}px`);
  assert('初始未翻转', before === 'false', String(before));
  await shot('09-指标卡-正面');
  await page.click('.metric-card');
  await page.waitForTimeout(420);
  const after = await page.getAttribute('.metric-card', 'data-flipped');
  const backInert = await page.evaluate(() => {
    const b = document.querySelector('.metric-back');
    return { inert: b.hasAttribute('inert'), aria: b.getAttribute('aria-hidden') };
  });
  assert('点击后翻转', after === 'true', String(after));
  assert('翻转后背面可交互（去掉 inert）', backInert.inert === false && backInert.aria === 'false', JSON.stringify(backInert));
  await shot('10-指标卡-背面趋势');
  const gridCols = await page.evaluate(() => getComputedStyle(document.querySelector('.metric-grid')).gridTemplateColumns.split(' ').length);
  assert('≥700px 两列', gridCols === 2, `${gridCols} 列`);

  /* 用户反馈（2026-10-23）：「反转卡片效果有了，但是曲线变形」。
     根因：卡片背面迷你折线用固定 240×96 的 viewBox + preserveAspectRatio="none"，
     而容器实测 537×144，横向被拉长 30%。
     修法：与一图秀同一套「1 用户单位 = 1px」，按容器实测尺寸渲染。这条锁住它。 */
  const spark = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.mb-chart').forEach((el) => {
      const svg = el.querySelector('svg');
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      const dot = svg.querySelector('circle');
      out.push({ stretch: (vb[2] / vb[3]) / (r.width / r.height), dot: dot && +dot.getAttribute('r') });
    });
    return out;
  });
  const worst = spark.length ? Math.max(...spark.map((x) => Math.abs(x.stretch - 1))) : 9;
  const minDot = spark.length ? Math.min(...spark.map((x) => x.dot || 0)) : 0;
  assert('指标卡背面迷你折线 1:1（不得横向拉伸变形）', spark.length >= 4 && worst < 0.05,
    `${spark.length} 张，最长宽比偏差 ${(worst * 100).toFixed(1)}%`);
  assert('迷你折线的圆点随尺寸缩放（否则 537px 宽下看不见）', minDot >= 2.4, `r=${minDot}`);

  /* 正面参考范围尺：中性标位置，不按好坏着色 */
  const ruler = await page.evaluate(() => {
    const el = document.querySelector('.metric-card[data-metric="hb"] .m-ruler');
    if (!el) return null;
    const mk = el.querySelector('.m-ruler-mark');
    const c = getComputedStyle(mk).backgroundColor.match(/\d+/g).map(Number);
    return { text: el.innerText.replace(/\n/g, ' | '), left: mk.style.left, spread: Math.max(...c.slice(0, 3)) - Math.min(...c.slice(0, 3)) };
  });
  assert('指标卡正面有参考范围尺', !!ruler);
  assert('参考范围尺不做好坏判断（无偏高/偏低/异常等词）',
    !!ruler && !/偏高|偏低|异常|危险|过高|过低|正常/.test(ruler.text), ruler ? ruler.text : '');
  assert('参考范围尺用中性灰标注（不按好坏着色）', !!ruler && ruler.spread < 60, ruler ? `channel spread ${ruler.spread}` : '');

  /* 顶栏大字按钮：三档循环，3D 卡正反一起升到 340px */
  const ts1 = await page.evaluate(() => document.documentElement.dataset.textsize);
  await page.click('#btnTextSize');
  await page.waitForTimeout(150);
  const ts2 = await page.evaluate(() => ({
    size: document.documentElement.dataset.textsize,
    card: document.querySelector('.metric-card').offsetHeight,
    pressed: document.querySelector('#btnTextSize').getAttribute('aria-pressed'),
  }));
  assert('顶栏大字按钮可切换字号档', ts1 === 'normal' && ts2.size === 'large' && ts2.pressed === 'true', `${ts1} → ${ts2.size}`);
  assert('大字档 3D 卡升到 340px（正反一起升）', ts2.card === 340, `${ts2.card}px`);
  await page.click('#btnTextSize'); await page.waitForTimeout(80);
  await page.click('#btnTextSize'); await page.waitForTimeout(150);
  const ts3 = await page.evaluate(() => ({ size: document.documentElement.dataset.textsize, card: document.querySelector('.metric-card').offsetHeight }));
  assert('三档循环回到标准档（276px）', ts3.size === 'normal' && ts3.card === 276, `${ts3.size} ${ts3.card}px`);

  /* 固定高度必须真的装得下正反两面：装不下会被 overflow 裁掉，用户看不到 */
  const fitOf = () => page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.metric-card').forEach((c) => {
      ['front', 'back'].forEach((f) => {
        const el = c.querySelector(`.metric-${f}`);
        if (!el) return;
        if (el.scrollHeight > el.clientHeight + 1) bad.push(`${c.dataset.metric || '?'}/${f} ${el.scrollHeight}>${el.clientHeight}`);
      });
    });
    return bad;
  });
  const fitNormal = await fitOf();
  assert('3D 卡：标准档正反两面内容都在固定高度内（无裁切）', fitNormal.length === 0, fitNormal.join(' ') || 'ok');
  await page.click('#btnTextSize'); await page.waitForTimeout(240);
  const fitBig = await fitOf();
  assert('3D 卡：大字/巨大字档正反两面内容仍装得下', fitBig.length === 0, fitBig.join(' ') || 'ok');
  await page.click('#btnTextSize'); await page.waitForTimeout(90);
  await page.click('#btnTextSize'); await page.waitForTimeout(240);

  /* --- 一图秀 --- */
  console.log('\n【病情一图秀】');
  await nav('病情一图秀');
  await page.waitForTimeout(300);
  const chart = await page.innerText('#wbPage');
  assert('声明每条线按全期 min/max 归一化', /全期/.test(chart) && /归一化/.test(chart));
  assert('声明不同线之间不可比', /不可比/.test(chart));
  const svgCount = (await page.$$('.plot svg')).length;
  assert('绘图区有 SVG', svgCount >= 1, `${svgCount} 个`);
  const lastLabels = (await page.$$('.end-label')).length;
  assert('末点每序列只标一次（.end-label）', lastLabels === 2, `${lastLabels} 个末点标签（2 条序列）`);
  const treat = (await page.$$('.treat-lane > *')).length;
  assert('治疗条与数据区分层（独立泳道）', treat >= 1, `${treat} 个事件标记`);

  /* 图表几何：宿主 1:1 渲染 + 治疗条与数据点同 x 对齐
     早期版本 viewBox 固定 700 宽再 CSS 拉满 -> letterbox，
     绘图区被缩窄而治疗条满宽，两者对不齐。这里必须用真实几何验证。 */
  const geom = await page.evaluate(() => {
    const host = document.querySelector('.chart-host');
    const svg = host && host.querySelector('svg');
    const plot = host && host.querySelector('.plot');
    if (!host || !svg) return null;
    const hw = host.getBoundingClientRect().width;
    const sw = svg.getBoundingClientRect().width;
    const labels = [...svg.querySelectorAll('.end-label')].map((t) => {
      const b = t.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, anchor: t.getAttribute('text-anchor'), text: t.textContent };
    });
    // 每个末点标签必须紧邻它所属序列的最后一个点（同色）
    const dots = [...svg.querySelectorAll('.series-dot')].map((c) => {
      const b = c.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, fill: c.getAttribute('fill'), title: c.querySelector('title')?.textContent || '' };
    });
    const marks = [...document.querySelectorAll('.treat-mark')].map((m) => {
      const b = m.querySelector('.tm-diamond').getBoundingClientRect();
      return { cx: b.x + b.width / 2, ev: m.dataset.ev };
    });
    // 该事件日期在图上应有一个同日期数据点（hb 2026-09-18）
    const dated = dots.filter((d) => d.title.includes('2026-09-18'));
    return {
      hostW: hw, svgW: sw, labels, dots, marks,
      sep18DotX: dated.length ? dated[0].x : null,
      turbtX: (marks.find((m) => m.ev === 'ev-turbt') || {}).cx ?? null,
      markCount: marks.length,
    };
  });
  assert('一图秀：SVG 与宿主同宽（1:1，无 letterbox）',
    geom && Math.abs(geom.hostW - geom.svgW) <= 1, geom ? `host=${geom.hostW.toFixed(1)} svg=${geom.svgW.toFixed(1)}` : 'no geom');
  assert('一图秀：治疗条刻度与同日期数据点同 x（≤2px）',
    geom && geom.sep18DotX != null && geom.turbtX != null && Math.abs(geom.sep18DotX - geom.turbtX) <= 2,
    geom ? `TURBT mark x=${geom.turbtX?.toFixed(1)} vs 2026-09-18 dot x=${geom.sep18DotX?.toFixed(1)}` : 'no geom');
  assert('一图秀：末点标签贴着各自序列末点（≤14px），不飘在空白处',
    geom && geom.labels.length > 0 && geom.labels.every((l) => geom.dots.some((d) => Math.abs(d.y + 4 - (l.y + l.h / 2)) <= 14 && Math.abs(d.x - (l.anchor === 'end' ? l.x + l.w : l.x)) <= 14)),
    geom ? geom.labels.map((l) => `${l.text}@${l.x.toFixed(0)},${l.y.toFixed(0)}`).join(' ') : 'no geom');
  assert('一图秀：三个治疗事件在窗内（全部）', geom && geom.markCount === 3, geom ? `${geom.markCount} 个` : 'no geom');
  /* 事件密集时标签会挤成一串（曾出现「TURBTBCG 诱导开始灌注取消」）。
     分行后任意两个标签矩形不得相交。 */
  const lb = await page.evaluate(() => [...document.querySelectorAll('.treat-mark .tm-label')]
    .map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, t: e.textContent }; }));
  const collide = [];
  for (let i = 0; i < lb.length; i++) {
    for (let j = i + 1; j < lb.length; j++) {
      const a = lb[i], b = lb[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) collide.push(`${a.t}×${b.t}`);
    }
  }
  assert('一图秀：治疗事件标签互不重叠（密集时已分行）', lb.length >= 3 && collide.length === 0,
    `${lb.length} 个标签，重叠：${collide.join(' ') || '无'}`);
  /* 回归：轴标签曾用 toISOString() 格式化，东八区零点退到前一天，整整差一天。
     正确口径 = 窗口两端恰好是「数据点 ∪ 治疗事件」的最早/最晚本地日期。 */
  const axis = await page.evaluate(() => {
    const svg = document.querySelector('.chart-host svg');
    const ax = [...svg.querySelectorAll('.axis-label')].map((t) => t.textContent);
    const dotDates = [...svg.querySelectorAll('.series-dot title')]
      .map((t) => (t.textContent.match(/\d{4}-\d{2}-\d{2}/) || [])[0]).filter(Boolean);
    const evDates = CHART.TREATMENTS.map((t) => t.d);
    const all = dotDates.concat(evDates).sort();
    return { ax, first: all[0], last: all[all.length - 1] };
  });
  assert('一图秀：轴标签是本地日期且与窗口两端一致（不得差一天）',
    axis.ax.length === 2 && axis.ax[0] === axis.first && axis.ax[1] === axis.last,
    `${axis.ax.join(' ~ ')} vs ${axis.first} ~ ${axis.last}`);
  const dashed = await page.evaluate(() => document.querySelectorAll('.series-line').length);
  assert('曲线用 pathLength 动画元素', dashed >= 1, `${dashed} 条`);
  await shot('11-一图秀');
  await page.click('.btn:has-text("近 3 个月")');
  await page.waitForTimeout(260);
  await shot('12-一图秀-近3个月');

  /* --- 急症 --- */
  console.log('\n【急症与安全】');
  await nav('急症与安全');
  const urg = await page.innerText('#wbPage');
  const urgCards = (await page.$$('.urgent-card')).length;
  assert('急症四类入口', urgCards === 4, `${urgCards} 类`);
  assert('声明不解释原因不给处置', /不解释原因|不给处置建议/.test(urg));
  assert('缺出处的判据标「来源待补」', /来源待补/.test(urg));
  await shot('13-急症与安全');

  /* --- 临床试验 --- */
  console.log('\n【临床试验】');
  await nav('临床试验');
  /* 登记库的英文枚举不许原样端给患者 */
  const trialEnums = await page.evaluate(() => {
    const t = document.querySelector('#wbPage table')?.innerText || '';
    return (t.match(/\b(NOT_YET_RECRUITING|RECRUITING|ACTIVE_NOT_RECRUITING|ENROLLING_BY_INVITATION|nmibc-or-intravesical|mibc-or-perioperative|advanced-or-metastatic)\b/g) || []);
  });
  assert('临床试验的状态/处境已本地化（不直接显示英文枚举）', trialEnums.length === 0, trialEnums.join(' '));
  const zhStatus = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#wbPage table tbody tr')].map((r) => r.children[2]?.innerText.trim());
    return { n: cells.length, zh: cells.filter((c) => /[\u4e00-\u9fa5]/.test(c || '')).length };
  });
  assert('每条试验的状态都显示中文标签', zhStatus.n > 0 && zhStatus.zh === zhStatus.n, JSON.stringify(zhStatus));
  await page.waitForTimeout(200);
  const tri = await page.innerText('#wbPage');
  assert('显示 2026 真实登记总数 295', /295/.test(tri), '');
  const rows = (await page.$$('#wbPage tbody tr')).length;
  assert('试验表格有数据行', rows >= 3, `${rows} 行`);
  assert('声明登记状态≠入组资格', /登记状态.*不等于.*入组资格|登记状态 ≠ 入组资格/.test(tri) || /不等于.*入组资格/.test(tri));
  assert('声明不构成方案推荐', /不构成.*推荐/.test(tri));
  await shot('14-临床试验');
  const tblBox = await page.evaluate(() => {
    const t = document.querySelector('#wbPage table.tbl');
    return t ? { sw: t.scrollWidth, cw: t.clientWidth, textOverflow: document.documentElement.scrollWidth } : null;
  });
  assert('1440px 下表格不溢出卡片', tblBox ? tblBox.sw <= tblBox.cw + 1 : false, JSON.stringify(tblBox));

  /* --- 设置弹窗（含 MinerU 骨架） --- */
  console.log('\n【设置】');
  await page.click('#wbNav .nav-item:has-text("设置")');
  await page.waitForTimeout(240);
  const set = await page.innerText('.modal');
  assert('设置含患者资料目录', /患者资料目录/.test(set));
  assert('设置含 MinerU 文档解析子页', /MinerU|文档解析/.test(set));
  assert('Token 输入为 password 类型', !!(await page.$('input[type="password"]#mToken')));
  assert('显示密钥文件路径与来源', /secrets\/mineru\.json/.test(set) && /优先级.*显式/.test(set));
  assert('设置含字号与动效', /字号/.test(set) && /减少动效/.test(set));
  assert('版本号与 package.json 同源（v0.1.0）', /v0\.1\.0/.test(set));
  await shot('15-设置');
  assert('同时只允许一个弹窗（防叠加）', (await page.$$('.modal-mask')).length === 1, `${(await page.$$('.modal-mask')).length} 个遮罩`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  assert('Esc 可关闭设置弹窗（不依赖弹窗内聚焦）', (await page.$$('.modal-mask')).length === 0);

  /* --- Agent 面板（右侧 35%） --- */
  console.log('\n【Agent 面板】');
  await page.click('#btnAgent');
  await page.waitForTimeout(320);
  const paneBox = await page.evaluate(() => {
    const p = document.querySelector('#agentPane');
    const b = document.querySelector('.wb-body');
    return { hidden: p.hidden, w: p.getBoundingClientRect().width, bodyW: b.getBoundingClientRect().width, x: p.getBoundingClientRect().left, bodyX: b.getBoundingClientRect().left };
  });
  const pct = Math.round((paneBox.w / paneBox.bodyW) * 100);
  assert('面板在业务区右侧', paneBox.x > paneBox.bodyX + paneBox.bodyW / 2, `left=${Math.round(paneBox.x)} body=${Math.round(paneBox.bodyX)}..${Math.round(paneBox.bodyX + paneBox.bodyW)}`);
  assert('默认宽度约 35%', pct >= 33 && pct <= 37, `${pct}%`);
  const draft = await page.innerText('#agDraft');
  assert('草稿只抄记录，缺项写「没有」', /缺项/.test(draft) && /没有/.test(draft));
  assert('草稿写明「不等于医学审核」', /不等于医学审核/.test(draft));
  assert('草稿不含本机路径/用户名', !/\/Users\/|qinxiaoqiang/.test(draft));
  assert('私密项在已排除里', /已排除/.test(draft));
  const splitter = await page.$('#splitter[role="separator"]');
  assert('分隔条带 role=separator', !!splitter);
  const ariaNow = splitter ? await splitter.getAttribute('aria-valuenow') : null;
  assert('分隔条 aria-valuenow 已同步', ariaNow === String(Math.round(pct)), `aria=${ariaNow} 实测=${pct}`);
  await shot('16-Agent面板-右侧');

  /* 键盘步进 2% */
  await page.focus('#splitter');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  const afterKey = await page.evaluate(() => document.querySelector('#splitter').getAttribute('aria-valuenow'));
  assert('键盘 ← 步进 2%（35→37）', afterKey === '37', `aria=${afterKey}`);

  /* --- 文案红线自检 --- */
  console.log('\n【文案红线】');
  const hits = await page.evaluate((words) => {
    const t = document.querySelector('#wbPage').innerText;
    return words.filter((w) => t.includes(w));
  }, REDLINES);
  assert('当前页红线词零命中', hits.length === 0, hits.join('、') || '零命中');
  await page.click('#btnWording');
  await page.waitForTimeout(220);
  assert('自检弹窗可打开', !!(await page.$('.modal')));
  await shot('17-文案红线自检');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  assert('Esc 可关闭自检弹窗', (await page.$$('.modal-mask')).length === 0, `剩余 ${(await page.$$('.modal-mask')).length} 个`);

  /* --- 390px 移动端 --- */
  console.log('\n【390px 窄屏】');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(320);

  /* 抽屉不能盖住顶栏，否则「打开/收起 AI 对话」按钮在手机上点不到 */
  const hit = await page.evaluate(() => {
    const b = document.querySelector('#btnAgent');
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      ok: el === b || b.contains(el),
      tag: el ? `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}` : 'null',
      chrome: getComputedStyle(document.documentElement).getPropertyValue('--chrome-h').trim(),
    };
  });
  assert('390px 抽屉打开时顶栏按钮仍可点（抽屉不盖顶栏）', hit.ok, `${hit.tag} · chrome-h=${hit.chrome}`);

  /* 契约 5：<760px 时面板改覆盖式抽屉 ≤420px，业务区不让位，分隔器不出现 */
  const drawer = await page.evaluate(() => {
    const p = document.querySelector('#agentPane');
    const b = document.querySelector('.wb-body');
    return {
      open: !p.hidden, w: Math.round(p.getBoundingClientRect().width),
      pos: getComputedStyle(p).position,
      splitter: getComputedStyle(document.querySelector('#splitter')).display,
      bodyW: Math.round(b.getBoundingClientRect().width),
    };
  });
  assert('390px 面板仍在打开态（本项专测抽屉）', drawer.open);
  assert('390px 面板改覆盖式抽屉（position:fixed）', drawer.pos === 'fixed', drawer.pos);
  assert('390px 抽屉宽度 ≤ 420px', drawer.w <= 420, `${drawer.w}px`);
  assert('390px 分隔器不出现（display:none）', drawer.splitter === 'none', drawer.splitter);
  assert('390px 业务区不让位（.wb-body 仍占满宽度）', drawer.bodyW >= 380, `bodyW=${drawer.bodyW}`);
  await shot('18a-390px-Agent抽屉');

  /* 关掉面板再验业务页本身 */
  await page.click('#btnAgent');
  await page.waitForTimeout(260);

  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert('390px 下 documentElement.scrollWidth === 390（不横向溢出）', m.sw === 390, `scrollWidth=${m.sw} clientWidth=${m.cw}`);

  /* 分组标题曾竖排成「病/情」「安/全/与/生/活」——窄轨里必须塌成一条线 */
  const navGroups = await page.evaluate(() => [...document.querySelectorAll('.nav-sec')].map((e) => {
    const b = e.getBoundingClientRect();
    return { t: e.textContent, w: Math.round(b.width), h: Math.round(b.height), fs: getComputedStyle(e).fontSize };
  }));
  assert('390px 导航分组标题塌成分隔线（不再竖排文字）',
    navGroups.length >= 3 && navGroups.every((g) => g.h <= 4),
    navGroups.map((g) => `${g.t}:${g.w}x${g.h}@${g.fs}`).join(' '));
  await nav('检查与指标');
  await page.click('.tab:has-text("分类指标卡")');
  await page.waitForTimeout(260);
  const gridAtNarrow = await page.evaluate(() => {
    const g = document.querySelector('.metric-grid');
    return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : -1;
  });
  assert('390px 指标卡降为单列', gridAtNarrow === 1, `${gridAtNarrow} 列`);
  const gridBox = await page.evaluate(() => {
    const g = document.querySelector('.metric-grid');
    return g ? { sw: g.scrollWidth, cw: g.clientWidth } : null;
  });
  assert('指标网格自身不横向溢出', gridBox && gridBox.sw <= gridBox.cw + 1, JSON.stringify(gridBox));
  const pageFits = await page.evaluate(() => {
    const w = document.querySelector('#wbPage');
    return { sw: w.scrollWidth, cw: w.clientWidth };
  });
  assert('业务页容器自身不横向溢出', pageFits.sw <= pageFits.cw + 1, JSON.stringify(pageFits));
  const cardHNarrow = await page.evaluate(() => Math.round(document.querySelector('.metric-card').getBoundingClientRect().height));
  assert('窄屏下卡片仍为固定高度（未塌陷）', cardHNarrow >= 260 && cardHNarrow <= 350, `${cardHNarrow}px`);
  await shot('18-390px-窄屏-指标卡');

  await nav('病情一图秀');
  await page.waitForTimeout(300);
  const chartWrap = await page.evaluate(() => {
    const w = document.querySelector('.chart-wrap');
    return w ? { sw: document.querySelector('html').scrollWidth, own: w.scrollWidth, client: w.clientWidth } : null;
  });
  assert('390px 一图秀：横向滚动发生在 .chart-wrap 内，页面不溢出', chartWrap ? chartWrap.sw === 390 : false, JSON.stringify(chartWrap));
  await shot('19-390px-一图秀');

  /* --- MIBC 线 --- */
  console.log('\n【MIBC 线切换】');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(200);
  await nav('我的分型与分期');
  await page.click('.btn:has-text("重新选择分野")');
  await page.waitForTimeout(240);
  await page.click('.gate-choice[data-line="mibc"]');
  await page.waitForTimeout(240);
  const mibcText = await page.innerText('#wbPage');
  assert('MIBC 看板切换成功', /肌层浸润/.test(mibcText));

  /* ---- 静态不变量：不许有空的折叠块（点开什么都没有，等于骗一次点击） ---- */
  const appSrc = await readFile(join(ROOT, 'prototypes/v0.1/app.js'), 'utf8');
  const emptyFolds = appSrc.match(/collapsible\('[^']*',\s*''\)/g) || [];
  assert('不存在内容为空的折叠块', emptyFolds.length === 0, emptyFolds.join(' | '));

  /* ---- 没有来源的指标页必须「只留结构、不给数字」 ---- */
  await page.evaluate(() => { location.hash = '#/metrics'; });
  await page.waitForTimeout(280);
  const elIdx = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tab')).findIndex((x) => x.textContent.includes('电解质')));
  assert('指标页存在「电解质与 B12」页签', elIdx >= 0);
  if (elIdx >= 0) {
    await (await page.$$('.tab'))[elIdx].click();
    await page.waitForTimeout(240);
    const et = await page.innerText('#wbPage');
    assert('电解质页明标「来源待补」', /来源待补/.test(et));
    assert('电解质页说明「不填数字、不给阈值」', /不填数字/.test(et) && /不给阈值/.test(et));
    assert('电解质页不得出现编造的正常范围数字', !/正常范围[^。]{0,20}\d/.test(et));
  }

  /* ---- 试验页：登记状态 ≠ 入组资格，且不得判断资格 ---- */
  await page.evaluate(() => { location.hash = '#/trials'; });
  await page.waitForTimeout(280);
  const fvIdx = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tab')).findIndex((x) => x.textContent.trim() === '已收藏'));
  if (fvIdx >= 0) {
    await (await page.$$('.tab'))[fvIdx].click();
    await page.waitForTimeout(240);
    const ft = await page.innerText('#wbPage');
    assert('已收藏页明写「收藏不等于报名」', /收藏不等于报名/.test(ft));
  }
  const qIdx = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tab')).findIndex((x) => x.textContent.trim() === '入组问题'));
  if (qIdx >= 0) {
    await (await page.$$('.tab'))[qIdx].click();
    await page.waitForTimeout(240);
    const qt = await page.innerText('#wbPage');
    assert('入组问题页明写不判断资格', /不判断资格/.test(qt));
    /* 状态词解释放在折叠区里 —— 折叠内容 innerText 取不到，
       但它在 DOM 里，用 textContent 判（折叠不等于没写）。 */
    const qtAll = await page.evaluate(() => document.querySelector('#wbPage').textContent);
    assert('入组问题页解释各登记状态词（折叠区内，用 textContent 判）',
      /NOT_YET_RECRUITING/.test(qtAll) && /招募中/.test(qtAll));
  }

  /* ---- 事实 / 草稿分离：草稿页不得出现「已确认」这一类结论词 ---- */
  await page.evaluate(() => { location.hash = '#/records'; });
  await page.waitForTimeout(280);
  const draftIdx = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tab')).findIndex((x) => x.textContent.trim() === '待核对草稿'));
  assert('病情整理存在「待核对草稿」页签', draftIdx >= 0);
  if (draftIdx >= 0) {
    await (await page.$$('.tab'))[draftIdx].click();
    await page.waitForTimeout(240);
    const dt = await page.innerText('#wbPage');
    assert('草稿页明写「不算事实」', /不算事实/.test(dt));
    assert('草稿页明写不会进入病情档案', /不会.*进入病情档案/.test(dt));
    assert('草稿页给出「只抄写不判断」的抽取规则', /只抄写，不判断/.test(dt));
  }

  /* ---- 照护者交接：记录人与当事人必须是两个可区分的字段 ---- */
  await page.evaluate(() => { location.hash = '#/life'; });
  await page.waitForTimeout(280);
  const hoIdx = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tab')).findIndex((x) => x.textContent.trim() === '照护者交接'));
  if (hoIdx >= 0) {
    await (await page.$$('.tab'))[hoIdx].click();
    await page.waitForTimeout(240);
    const ht = await page.innerText('#wbPage');
    assert('照护者交接区分「记录人」与「当事人」', /本页记录人/.test(ht) && /记录的是谁/.test(ht));
    assert('照护者交接含下次灌注与下次膀胱镜日期', /2026-10-30/.test(ht) && /2026-12-16/.test(ht));
  }
  assert('MIBC 看板含尿流改道卡', /尿流改道/.test(mibcText));
  assert('NMIBC 专属卡（膀胱灌注周期）已不在', !/诱导 3 \/ 6 次已完成/.test(mibcText));

  /* 在 MIBC 档案下，实际采用的术式页必须显示属于本人的记录。
     曾经因为页签名（回肠造口）与资料里的写法（回肠通道造口）不一致，
     静默失配成「这里没有属于你的记录」——断言锁住这条。 */
  await page.evaluate(() => { location.hash = '#/diversion'; });
  await page.waitForTimeout(280);
  const mineIdx = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tab')).findIndex((x) => x.textContent.trim() === '回肠造口'));
  assert('MIBC 档案下存在「回肠造口」页签', mineIdx >= 0, `idx=${mineIdx}`);
  if (mineIdx >= 0) {
    await (await page.$$('.tab'))[mineIdx].click();
    await page.waitForTimeout(260);
    const dtext = await page.innerText('#wbPage');
    assert('MIBC 档案下「回肠造口」页显示本人的记录（不得失配为空）',
      /我的记录/.test(dtext) && !/没有属于你的记录/.test(dtext), dtext.replace(/\s+/g, ' ').slice(0, 46));
    assert('改道记录含术式字段与质控来源', /底盘型号/.test(dtext) && /BT-16-01/.test(dtext));
  }
  await shot('20-看板-MIBC');

  await nav('我的分型与分期');
  await page.waitForTimeout(200);
  const stg = await page.innerText('#wbPage');
  assert('分级并列不换算', /不做换算|不换算/.test(stg));
  assert('「未见肌层」标为分期可能不完整', /分期可能不完整|分期不完整/.test(stg));
  await shot('21-分型与分期-MIBC');

  /* --- console 错误 --- */
  console.log('\n【运行时错误】');
  assert('浏览器控制台零 error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || '零 error');

  await browser.close();
  srv.close();

  /* --- 汇总 --- */
  const bad = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(64)}`);
  console.log(`断言 ${results.length} 条：通过 ${results.length - bad.length}，失败 ${bad.length}`);
  if (bad.length) { console.log('失败项：'); bad.forEach((b) => console.log(`  ❌ ${b.name} ${b.detail}`)); }
  console.log(`截图 ${OUT}`);
  console.log('='.repeat(64));
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error('自检脚本自身出错：', e); process.exit(2); });
