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
  assert('尚未选线时看板卡片为 0（不得先长出专属内容）', (await page.$$('.big-card')).length === 0);
  assert('闸门里有 Ta/T1/Tis 白话解释', /Ta\s*\/\s*T1\s*\/\s*Tis/.test(gateText));
  assert('闸门里有「我还不确定」', /我还不确定/.test(gateText));
  assert('闸门声明不对保膀胱/切除表达倾向', /不.*表达倾向|不对.*倾向/.test(gateText));
  const chipV = await page.textContent('#versionChip');
  assert('顶栏版本 chip 首屏可见', /^v\d+\.\d+\.\d+$/.test((chipV || '').trim()), chipV);
  await shot('01-首屏-分野闸门');

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
  await page.click('.tab:has-text("分类指标卡")');
  await page.waitForTimeout(260);
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
  assert('MIBC 看板含尿流改道卡', /尿流改道/.test(mibcText));
  assert('NMIBC 专属卡（膀胱灌注周期）已不在', !/诱导 3 \/ 6 次已完成/.test(mibcText));
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
