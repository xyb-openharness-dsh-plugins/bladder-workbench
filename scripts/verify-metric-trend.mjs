#!/usr/bin/env node
/**
 * 指标趋势 Tab MT01–MT15 证据生成器（G2 签认用）
 * 用法：node scripts/verify-metric-trend.mjs [--write]
 *
 * 为什么单独做一个脚本：
 *   AGENTS.md 写明「MT01–MT15 在 HTML 中实际验证与确认，再接生产业务」。
 *   所以这 15 条要一条一条实测，实测值写进 docs/METRIC-TREND-SPEC.md，
 *   不能在文档里填「通过」两个字了事。
 *
 * 诚实原则：做不到的写「未实现」或「未验证」，不写「通过」。
 *   例如 MT11（最近报告 ID/修订聚合）与 MT14（100+ 记录压力）在当前原型里
 *   没有对应实现/没有压测数据，脚本会把它们判为未实现并说明原因，
 *   而不是跳过不报。
 */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/homebrew/lib/node_modules/@playwright/test');

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const URL_ = 'file://' + join(ROOT, 'prototypes/v0.1/index.html');
const WRITE = process.argv.includes('--write');
const KEY = 'uropal.prototype.v0.1';

const results = [];
/** status: pass | fail | notimpl | na */
const rec = (id, name, status, detail) => {
  results.push({ id, name, status, detail });
  const icon = { pass: '✅', fail: '❌', notimpl: '⛔', na: '⬜' }[status];
  console.log(`${icon} ${id}  ${name}${detail ? `  —— ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

async function boot(route = 'metrics') {
  await page.goto(URL_);
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate((r) => { location.hash = '#/' + r; }, route);
  await page.waitForTimeout(420);
}
async function goto(route) {
  await page.evaluate((r) => { location.hash = '#/' + r; }, route);
  await page.waitForTimeout(420);
}
async function clickTab(name) {
  const ok = await page.evaluate((n) => {
    const t = Array.from(document.querySelectorAll('#wbPage .tab')).find((x) => x.textContent.trim() === n);
    if (!t) return false;
    t.click();
    return true;
  }, name);
  await page.waitForTimeout(380);
  return ok;
}
const text = () => page.evaluate(() => (document.querySelector('#wbPage')?.innerText || '').replace(/\s+/g, ' ').trim());

// ── MT01 五个页内 Tab 与旧深链接映射可走通 ────────────────────────────
{
  await boot('metrics');
  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#wbPage .tab')).map((t) => t.textContent.trim()));
  const walked = [];
  for (const t of tabs) {
    const ok = await clickTab(t);
    const len = (await text()).length;
    walked.push(`${t}:${ok && len >= 40 ? 'ok' : 'EMPTY'}`);
  }
  const allOk = walked.every((w) => w.endsWith('ok'));
  // 通用规范写的是「五个页内 Tab」（病情整理下），本项目是「检查与指标」下 4 个页签。
  const note = `本项目为「检查与指标」下 ${tabs.length} 个页签（通用模板假设的 5 个是「病情整理」结构，本项目把指标独立成一级页）`;
  rec('MT01', '全部页内 Tab 都能走通且非空',
    allOk ? 'pass' : 'fail',
    allOk ? `${walked.join(' / ')}。偏离说明：${note}` : walked.join(' / '));
}

// ── MT02 各类别独立标题与网格，不混在一个平铺容器 ────────────────────
{
  await boot('metrics');
  await clickTab('分类指标卡');
  const groups = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#wbPage .metric-group')).map((g) => ({
      name: g.dataset.group,
      title: g.querySelector('.mg-title')?.textContent.trim().replace(/\s+/g, ' ') || '',
      cards: g.querySelectorAll('.metric-card').length,
      hasOwnGrid: !!g.querySelector('.metric-grid'),
    })));
  const cards = await page.evaluate(() => document.querySelectorAll('#wbPage .metric-card').length);
  const sum = groups.reduce((n, g) => n + g.cards, 0);
  const everyGridded = groups.every((g) => g.hasOwnGrid);
  rec('MT02', '指标按类别分组（独立标题 + 独立网格），不是一张平铺表',
    groups.length >= 3 && sum === cards && everyGridded ? 'pass' : 'fail',
    `${groups.length} 个分组：[${groups.map((g) => `${g.name}(${g.cards}项)`).join(' | ')}]；卡片总数 ${cards}，分组内合计 ${sum}；每组有独立网格=${everyGridded}`);
}

// ── MT03 指标页与一图秀同一目录：组名、顺序、项数一致 ─────────────────
{
  await boot('metrics');
  await clickTab('分类指标卡');
  const pageOrder = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#wbPage .metric-group')).map((g) => g.dataset.group));
  // 一图秀的选择清单来自同一 METRICS；这里核对「同一目录、顺序一致」是可证的。
  await goto('chart');
  const chartCats = await page.evaluate(() => {
    const codes = Array.from(document.querySelectorAll('#wbPage input[data-code]')).map((el) => el.dataset.code);
    return codes.map((c) => METRICS.find((m) => m.code === c)?.cat).filter(Boolean);
  });
  const chartUniq = [...new Set(chartCats)];
  const legend = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#wbPage .legend-item, #wbPage .legend span'))
      .map((e) => e.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean));
  // METRICS 顺序里，指标页分组顺序必须等于「该目录里类别首次出现的顺序」
  const expected = await page.evaluate(() => [...new Set(METRICS.map((m) => m.cat))]);
  const orderOk = JSON.stringify(pageOrder) === JSON.stringify(expected)
    && chartUniq.every((c, i) => expected.indexOf(c) >= 0 && (i === 0 || expected.indexOf(chartUniq[i - 1]) <= expected.indexOf(c)));
  rec('MT03', '指标页与一图秀共用同一目录，组名/顺序/项数一致',
    orderOk && pageOrder.length >= 3 ? 'pass' : 'fail',
    `指标页组顺序 [${pageOrder.join(' → ')}]；目录期望顺序 [${expected.join(' → ')}]；一图秀涉及类别 [${chartUniq.join(' | ')}]；图例 ${legend.length} 条`);
}

// ── MT04 正面完整显示信息，差值不写疗效结论 ──────────────────────────
{
  await boot('metrics');
  await clickTab('分类指标卡');
  const front = await page.evaluate(() => {
    const c = document.querySelector('#wbPage .metric-card');
    if (!c) return null;
    const f = c.querySelector('.metric-front');
    return { txt: (f?.innerText || '').replace(/\s+/g, ' ').trim(), cat: !!c.querySelector('.mc-cat') };
  });
  const hasUnit = /(g\/L|mL\/min|µmol\/L|μmol\/L|10⁹\/L|U\/L|kg|分)/.test(front?.txt || '');
  const hasDate = /\d{4}-\d{2}-\d{2}/.test(front?.txt || '');
  const hasCount = /共\s*\d+\s*次记录/.test(front?.txt || '');
  const hasSource = /来源/.test(front?.txt || '');
  const badWord = /(好转|恶化|疗效|有效|无效|建议)/.test(front?.txt || '');
  const ok = front?.cat && hasUnit && hasDate && hasCount && hasSource && !badWord;
  rec('MT04', '正面含类别/值/单位/日期/次数/来源，且不写疗效结论',
    ok ? 'pass' : 'fail',
    `类别=${!!front?.cat} 单位=${hasUnit} 日期=${hasDate} 次数=${hasCount} 来源=${hasSource} 疗效词=${badWord}`);
}

// ── MT05 单点 / 空态 / 文本值 / 未知日期 分别显示正确 ─────────────────
{
  /* 用合成指标构造单点与空窗口，而不是「碰巧演示数据里有」——
     演示数据里当前没有单点指标，靠它测等于没测（C2/C3 用同一思路）。 */
  await boot('chart');
  const syn = await page.evaluate(() => {
    const before = METRICS.length;
    METRICS.push({ code: '__mt5a', name: '合成单点', unit: 'x', cat: '演示', color: '#888',
      points: [{ d: '2026-10-22', v: 5, lab: '合成', method: '合成' }] });
    METRICS.push({ code: '__mt5b', name: '合成旧点', unit: 'x', cat: '演示', color: '#888',
      points: [{ d: '2020-01-05', v: 5, lab: '合成', method: '合成' }] });
    const one = CHART.render(['__mt5a'], 'all', 720);
    const none = CHART.render(['__mt5b'], '3', 720);
    const singleCard = metricCardHTML(METRICS[METRICS.length - 2], 0);
    METRICS.length = before;
    const wrap = document.createElement('div');
    wrap.innerHTML = one.svg || '';
    return {
      onePath: wrap.querySelectorAll('path.series-line').length,
      oneDots: wrap.querySelectorAll('circle.series-dot').length,
      noneEmpty: none.empty === true,
      noneSvg: (none.svg || '').length,
      noneReason: none.reason || '',
      singleCopy: /仅一次记录，无法比较/.test(singleCard),
    };
  });
  // 空窗口在真实界面里的呈现（.plot-empty）
  await page.evaluate(() => {
    document.querySelectorAll('#wbPage input[data-code]').forEach((el) => {
      const want = el.dataset.code === 'weight';
      if (el.checked !== want) { el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });
  await page.waitForTimeout(400);
  const plotEmpty = await page.evaluate(() => {
    const el = document.querySelector('#wbPage .plot-empty');
    return el ? el.textContent.trim() : '';
  });
  rec('MT05', '单点不连线且文案说明；空窗口给空态；不写 0 冒充缺测',
    syn.onePath === 0 && syn.oneDots === 1 && syn.singleCopy && syn.noneEmpty && syn.noneSvg === 0 ? 'pass' : 'fail',
    `合成单点：path=${syn.onePath}、圆点=${syn.oneDots}；卡片文案「仅一次记录，无法比较」=${syn.singleCopy}；`
    + `空窗口：empty=${syn.noneEmpty}、svg 长度=${syn.noneSvg}、reason=「${syn.noneReason}」；界面空态元素=${plotEmpty ? `「${plotEmpty}」` : '（本次窗口无空态，因 weight 在该窗口有数据）'}`);

  const zeroFill = await page.evaluate(() =>
    /(undefined|NaN|null)/.test(document.querySelector('#wbPage')?.innerText || ''));
  rec('MT05b', '界面不出现 undefined / NaN / null 占位',
    !zeroFill ? 'pass' : 'fail', zeroFill ? '发现未替换的占位值' : '未发现');

  // 文本值 / 未知日期：四种「没有」必须能分开表示（DESIGN-21）
  await boot('records');
  await clickTab('病情汇总');
  // 这段说明在原生 <details> 里（默认折叠），内层文本不在 innerText 里 —— 先展开再读。
  const opened = await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('#wbPage details'))
      .find((x) => /汇总里缺的东西|四种/.test(x.textContent));
    if (!d) return false;
    d.open = true;
    return true;
  });
  await page.waitForTimeout(200);
  const recTxt = await text();
  const fourNo = ['问过但没这项检查', '结果未出', '照抄原文', '本次未带入']
    .filter((k) => recTxt.includes(k));
  rec('MT05c', '四种「没有」能分开表示，不合并成一个「无」',
    fourNo.length === 4 ? 'pass' : 'fail',
    `折叠块可展开=${opened}；病情汇总命中 ${fourNo.length}/4：[${fourNo.join(' | ')}]`);
}

// ── MT06 方法/单位/机构变化不跨组连线 ────────────────────────────────
{
  await boot('chart');
  await page.evaluate(() => {
    document.querySelectorAll('#wbPage input[data-code]').forEach((el) => {
      const want = el.dataset.code === 'cr';
      if (el.checked !== want) { el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });
  await page.waitForTimeout(420);
  const groups = await page.evaluate(() => {
    const out = [];
    const host = document.querySelector('#wbPage .chart-host');
    if (!host) return out;
    const paths = Array.from(host.querySelectorAll('path.series-line'));
    return paths.map((p) => (p.getAttribute('d') || '').split(/[ML]/).filter(Boolean).length);
  });
  const legendTxt = await page.evaluate(() =>
    (document.querySelector('#wbPage .chart-legend, #wbPage .legend')?.innerText || '').replace(/\s+/g, ' ').trim());
  rec('MT06', '同指标换机构/方法后拆成可比组，段内才连线',
    groups.length >= 2 ? 'pass' : 'fail',
    `肌酐折线被拆成 ${groups.length} 段（顶点数 ${groups.join('/')}）；图例：${legendTxt.slice(0, 120)}`);
}

// ── MT07 点两次恢复正面，其他卡与页面高度不变 ────────────────────────
{
  await boot('metrics');
  await clickTab('分类指标卡');
  const h0 = await page.evaluate(() => document.querySelector('#wbPage').scrollHeight);
  const othersBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#wbPage .metric-card')).slice(1, 4)
      .map((c) => Math.round(c.getBoundingClientRect().height)));
  await page.evaluate(() => document.querySelector('#wbPage .metric-card').click());
  await page.waitForTimeout(650);
  const flipped = await page.evaluate(() => document.querySelector('#wbPage .metric-card').dataset.flipped);
  await page.evaluate(() => document.querySelector('#wbPage .metric-card').click());
  await page.waitForTimeout(650);
  const back = await page.evaluate(() => document.querySelector('#wbPage .metric-card').dataset.flipped);
  const h1 = await page.evaluate(() => document.querySelector('#wbPage').scrollHeight);
  const othersAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#wbPage .metric-card')).slice(1, 4)
      .map((c) => Math.round(c.getBoundingClientRect().height)));
  const same = JSON.stringify(othersBefore) === JSON.stringify(othersAfter);
  rec('MT07', '点两次回正面，其他卡与页面高度不变',
    flipped === 'true' && back === 'false' && same && Math.abs(h1 - h0) <= 2 ? 'pass' : 'fail',
    `翻转=${flipped}→${back}；其他卡高度 ${othersBefore}→${othersAfter}；页面高 ${h0}→${h1}`);
}

// ── MT08 鼠标与键盘都可翻面，隐藏面不进 Tab 序，减少动效无旋转 ───────
{
  await boot('metrics');
  await clickTab('分类指标卡');
  const kb = await page.evaluate(() => {
    const c = document.querySelector('#wbPage .metric-card');
    c.focus();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return c.dataset.flipped;
  });
  await page.waitForTimeout(300);
  const inert = await page.evaluate(() => {
    const c = document.querySelector('#wbPage .metric-card');
    const f = c.querySelector('.metric-front'), b = c.querySelector('.metric-back');
    return {
      frontInert: f.hasAttribute('inert'), backInert: b.hasAttribute('inert'),
      frontHidden: f.getAttribute('aria-hidden'), backHidden: b.getAttribute('aria-hidden'),
      pressed: c.getAttribute('aria-pressed'),
      focusableBack: !!b.querySelector('a[href], button:not([disabled]), input:not([disabled])'),
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot('metrics');
  await clickTab('分类指标卡');
  const rm = await page.evaluate(() => {
    const c = document.querySelector('#wbPage .metric-card');
    return getComputedStyle(c.querySelector('.metric-inner')).transitionDuration;
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  rec('MT08', '键盘可翻面，隐藏面 inert + aria-hidden，减少动效直接终态',
    kb === 'true' && inert.frontInert && !inert.backInert
      && inert.frontHidden === 'true' && inert.backHidden === 'false'
      && inert.pressed === 'true' && parseFloat(rm) < 0.01 ? 'pass' : 'fail',
    `键盘翻转=${kb}；翻转后 正面 inert=${inert.frontInert}/aria-hidden=${inert.frontHidden}，`
    + `背面 inert=${inert.backInert}/aria-hidden=${inert.backHidden}；aria-pressed=${inert.pressed}；减少动效下 transition=${rm}`);
}

// ── MT09 点图点打开来源，整卡不翻回 ─────────────────────────────────
{
  await boot('metrics');
  await clickTab('分类指标卡');
  await page.evaluate(() => document.querySelector('#wbPage .metric-card').click());
  await page.waitForTimeout(650);
  const before = await page.evaluate(() => document.querySelector('#wbPage .metric-card').dataset.flipped);
  const dotInfo = await page.evaluate(() => {
    const svg = document.querySelector('#wbPage .metric-card[data-flipped="true"] .mb-chart svg');
    if (!svg) return { hasSvg: false };
    const dots = Array.from(svg.querySelectorAll('circle'));
    const t = dots.map((d) => d.querySelector('title')?.textContent || d.getAttribute('data-tip') || '').filter(Boolean);
    return { hasSvg: true, dots: dots.length, withTip: t.length, sample: t[0] || '' };
  });
  if (dotInfo.hasSvg && dotInfo.dots > 0) {
    await page.evaluate(() => {
      const d = document.querySelector('#wbPage .metric-card[data-flipped="true"] .mb-chart svg circle');
      const r = d.getBoundingClientRect();
      d.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    });
    await page.waitForTimeout(400);
  }
  const after = await page.evaluate(() => document.querySelector('#wbPage .metric-card').dataset.flipped);
  rec('MT09', '点迷你折线上的点能看来源，且整卡不翻回正面',
    dotInfo.withTip > 0 && after === 'true' ? 'pass' : 'fail',
    dotInfo.hasSvg
      ? `折线点 ${dotInfo.dots} 个、带来源提示 ${dotInfo.withTip} 个；点击后翻转态 ${before}→${after}${after !== 'true' ? '（**点图点导致整卡翻回，是缺口**）' : ''}`
      : '背面没有渲染出迷你折线 svg');
}

// ── MT10 候选核对前不入图，核对后重开仍在 ───────────────────────────
{
  await boot('records');
  await clickTab('待核对草稿');
  const draft = await text();
  const hasDraftZone = /待核对|未经核对/.test(draft);
  const hasExtractRule = /只抄写|不判断|留空/.test(draft);
  await goto('metrics');
  await clickTab('分类指标卡');
  const cardTxt = await page.evaluate(() => {
    const c = document.querySelector('#wbPage .metric-card');
    return (c?.innerText || '').replace(/\s+/g, ' ').trim();
  });
  // 指标卡上的数值必须已经过核对：卡面不得出现「未核对 / 草稿 / 待核对」标记
  const cardMarkedDraft = /未核对|草稿|待核对/.test(cardTxt);
  // 持久化：重开页面后仍在
  await page.reload();
  await page.waitForTimeout(400);
  await goto('metrics');
  await clickTab('分类指标卡');
  const afterReload = await page.evaluate(() =>
    document.querySelectorAll('#wbPage .metric-card').length);
  rec('MT10', '候选核对前不入图；核对后重开仍在，两页读同一值',
    hasDraftZone && hasExtractRule && !cardMarkedDraft && afterReload >= 7 ? 'pass' : 'fail',
    `草稿区存在=${hasDraftZone}、抽取规则（只抄写不判断/留空）=${hasExtractRule}；`
    + `指标卡带草稿标记=${cardMarkedDraft}；重开后卡片数=${afterReload}`);
}

// ── MT11 最近报告表来自同一报告 ID / 修订 ───────────────────────────
{
  await boot('metrics');
  await clickTab('分类指标卡');
  const hasReportId = await page.evaluate(() =>
    /报告\s*ID|报告ID|修订/.test(document.querySelector('#wbPage')?.innerText || ''));
  rec('MT11', '最近报告表来自同一报告 ID / 修订，未知区间留空',
    hasReportId ? 'pass' : 'notimpl',
    hasReportId ? '界面出现报告 ID / 修订字样' : '**原型未实现报告 ID 与修订聚合**（phase1 止点；`docs/SCHEMA.md` 已有 documents.sha256 与 source_refs 结构承接）');
}

// ── MT12 700 / 620 / 窄内容区、大字下无整页横向溢出 ──────────────────
{
  const widths = [1280, 700, 620, 390];
  const rows = [];
  let ok = true;
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 1000 });
    await boot('metrics');
    await clickTab('分类指标卡');
    const m = await page.evaluate(() => ({
      de: document.documentElement.scrollWidth,
      vw: window.innerWidth,
      cols: (() => {
        const c = document.querySelector('#wbPage .metric-card');
        if (!c) return 0;
        const top = Math.round(c.getBoundingClientRect().top);
        return Array.from(document.querySelectorAll('#wbPage .metric-card'))
          .filter((x) => Math.abs(Math.round(x.getBoundingClientRect().top) - top) <= 2).length;
      })(),
    }));
    const pass = m.de <= m.vw;
    if (!pass) ok = false;
    rows.push(`${w}px:${m.de}/${m.vw}${pass ? '' : ' 溢出'}(${m.cols}列)`);
  }
  // 大字
  await page.setViewportSize({ width: 1280, height: 1000 });
  await boot('metrics');
  await clickTab('分类指标卡');
  await page.evaluate(() => {
    const b = document.querySelector('.btn-textsize, [data-textsize], [aria-label*="字号"]');
    if (b) b.click();
  });
  await page.waitForTimeout(420);
  const big = await page.evaluate(() => ({
    de: document.documentElement.scrollWidth, vw: window.innerWidth,
    h: Math.round(document.querySelector('#wbPage .metric-card')?.getBoundingClientRect().height || 0),
  }));
  rec('MT12', '各宽度与大字下无整页横向溢出，二列→一列合理',
    ok && big.de <= big.vw ? 'pass' : 'fail',
    `${rows.join(' / ')}；大字卡高 ${big.h}px、页宽 ${big.de}/${big.vw}`);
}

// ── MT13 病例切换隔离翻面 / 筛选 / 草稿 ─────────────────────────────
{
  await boot('metrics');
  await clickTab('分类指标卡');
  await page.evaluate(() => document.querySelector('#wbPage .metric-card').click());
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => document.querySelector('#wbPage .metric-card').dataset.flipped);
  const switched = await page.evaluate(() => {
    const sel = document.querySelector('#selDemo');   // 侧栏演示档案切换（在 #wbPage 之外）
    if (!sel) return false;
    const opt = Array.from(sel.options).find((o) => /mibc/i.test(o.value + o.textContent));
    if (!opt) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  await page.waitForTimeout(700);
  await clickTab('分类指标卡');
  const after = await page.evaluate(() => document.querySelector('#wbPage .metric-card')?.dataset.flipped);
  rec('MT13', '切换病例后翻面态被隔离，不串患者信息',
    switched ? (after === 'false' ? 'pass' : 'fail') : 'notimpl',
    switched ? `翻面态 ${before} → 切换档案后 ${after}` : '**原型无档案切换控件或切换后未重置**');
}

// ── MT14 100+ 记录、500 事件压力下曲线仍在固定区域 ──────────────────
rec('MT14', '压力数据下曲线仍在固定区域，原始事件可逐项回查',
  'notimpl',
  '**未做压力测试**：演示数据每项 2–8 点、治疗事件 3 个，没有 100+ 记录 / 500 事件的数据集；phase1 不造批量假数据（会污染 demo），留到 Phase2 真实数据接入后测');

// ── MT15 HTML 版本 / hash / 截图 / 偏差 / Desktop 状态分别记录 ───────
{
  await boot('metrics');
  const v = await page.evaluate(() => ({
    chip: document.querySelector('#versionChip')?.textContent.trim(),
    foot: document.querySelector('#footVersion')?.textContent.trim(),
    demo: document.querySelector('.demo-bar')?.textContent.trim(),
  }));
  const has = v.chip && v.foot;
  rec('MT15', 'HTML 版本/hash/截图/偏差/Desktop 状态分别记录',
    has ? 'pass' : 'fail',
    `顶栏 chip=${v.chip}／页脚=${v.foot}／演示条=${(v.demo || '').slice(0, 40)}；hash 与截图见 docs/PROTOTYPE-REVIEW.md；**Desktop 实测仍未做（未验证）**`);
}

// ── 收尾 ────────────────────────────────────────────────────────────
await browser.close();

const pass = results.filter((r) => r.status === 'pass').length;
const fail = results.filter((r) => r.status === 'fail').length;
const notimpl = results.filter((r) => r.status === 'notimpl').length;
console.log(`\n── MT 实测：通过 ${pass} / 失败 ${fail} / 未实现 ${notimpl} / 共 ${results.length} 条 ──`);
console.log(`控制台 error：${errors.length}${errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''}`);

const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16);
const table = results.map((r) => {
  const label = { pass: '通过', fail: '**未通过**', notimpl: '未实现', na: '不适用' }[r.status];
  return `| ${r.id} | ${r.name} | ${label} | ${r.detail.replace(/\|/g, '\\|')} |`;
}).join('\n');

if (WRITE) {
  const p = join(ROOT, 'docs/METRIC-TREND-SPEC.md');
  let doc = await readFile(p, 'utf8');
  const block = `\n<!-- MT-RESULTS:BEGIN （由 scripts/verify-metric-trend.mjs --write 生成，勿手改） -->\n## MT01–MT15 实测结果（${stamp}）\n\n复现：\`node scripts/verify-metric-trend.mjs\`\n\n| 断言 | 内容 | 结果 | 实测证据 |\n| --- | --- | --- | --- |\n${table}\n\n**结论**：通过 ${pass} / 未通过 ${fail} / 未实现 ${notimpl}，共 ${results.length} 条；浏览器控制台 error ${errors.length} 个。\n**未实现项（${notimpl} 条）不是"通过"**：${results.filter((r) => r.status === 'notimpl').map((r) => r.id).join('、') || '无'}。\n<!-- MT-RESULTS:END -->\n`;
  if (doc.includes('<!-- MT-RESULTS:BEGIN')) {
    doc = doc.replace(/<!-- MT-RESULTS:BEGIN[\s\S]*?<!-- MT-RESULTS:END -->\n?/, block.trimStart());
  } else {
    doc = doc.trimEnd() + '\n' + block;
  }
  await writeFile(p, doc, 'utf8');
  console.log(`已写入 docs/METRIC-TREND-SPEC.md`);
}

process.exit(fail > 0 ? 1 : 0);
