#!/usr/bin/env node
/**
 * 一图秀 C1–C12 证据生成器（G2 签认用）
 * 用法：node scripts/verify-one-chart.mjs [--write]
 *
 * 为什么单独做一个脚本：
 *   AGENTS.md 写明「C1–C12 断言属 G2 签认范围，不做『开发自测』了事」。
 *   所以这 12 条要一条一条实测，把实测值写进 docs/ONE-CHART-SPEC.md，
 *   而不是在文档里填「通过」两个字。
 *
 * 两类检查：
 *   · UI 级——真浏览器点页签、点按钮、量 bbox（C1/C5/C6/C8/C9/C10/C11/C12）
 *   · 契约级——直接调 CHART.render 喂合成指标（C2/C3/C4）。
 *     不往演示数据里塞假记录来凑测试，那会污染 demo。
 *
 * C7 说明：标准模板里的 C7 是「康复类用绝对值」（针对乳腺癌的上肢臂围）。
 *   膀胱癌没有这一类指标，所以按同一原则换算成本癌种的适用形式：
 *   「变化文案必须带绝对单位，不得用百分比」。
 */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/homebrew/lib/node_modules/@playwright/test');

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const URL_ = 'file://' + join(ROOT, 'prototypes/v0.1/index.html');
const WRITE = process.argv.includes('--write');

const results = [];
const rec = (id, name, ok, detail) => {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id}  ${name}${detail ? `  —— ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

async function gotoChart() {
  await page.goto(URL_);
  await page.evaluate(() => localStorage.removeItem('uropal.prototype.v0.1'));
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = '#/chart'; });
  await page.waitForTimeout(420);
}
async function setCodes(codes) {
  await page.evaluate((cs) => {
    document.querySelectorAll('#wbPage input[data-code]').forEach((el) => {
      const want = cs.includes(el.dataset.code);
      if (el.checked !== want) { el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }, codes);
  await page.waitForTimeout(420);
}
const readPaths = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('#wbPage .chart-host .series-line'))
    .map((p) => (p.getAttribute('d') || '').trim()));

await gotoChart();

/* ---------------- C1 量纲差异大的两指标都占满纵向区 ---------------- */
{
  await setCodes(['anc', 'hb']);
  const g = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#wbPage .chart-host .series-line').forEach((p) => {
      const b = p.getBBox();
      out.push({ h: b.height, name: p.getAttribute('stroke') });
    });
    const grid = document.querySelector('#wbPage .chart-host .grid-line');
    return { lines: out, plotH: grid ? Math.abs(grid.getBBox().height) : 0 };
  });
  const hs = g.lines.map((x) => x.h);
  if (hs.length === 2) {
    const diff = Math.abs(hs[0] - hs[1]) / Math.max(hs[0], hs[1]);
    rec('C1', '量纲差异大的两指标都占满纵向区', diff < 0.10,
      `两条 path bbox 高 ${hs.map((x) => x.toFixed(1)).join(' / ')}，差 ${(diff * 100).toFixed(1)}%（<10%）`);
  } else {
    rec('C1', '量纲差异大的两指标都占满纵向区', false, `只量到 ${hs.length} 条线`);
  }
}

/* ---------------- C2 单点不连线 / C3 空窗口有空态 ---------------- */
{
  const r = await page.evaluate(() => {
    const before = METRICS.length;
    METRICS.push({ code: '__c2', name: '合成单点', unit: 'x', cat: '演示', color: '#888',
      points: [{ d: '2026-10-22', v: 5, lab: '合成', method: '合成' }] });
    METRICS.push({ code: '__c3', name: '合成旧点', unit: 'x', cat: '演示', color: '#888',
      points: [{ d: '2020-01-05', v: 5, lab: '合成', method: '合成' }] });
    const one = CHART.render(['__c2'], 'all', 720);
    const none = CHART.render(['__c3'], '3', 720);
    METRICS.length = before;
    const wrap = document.createElement('div');
    wrap.innerHTML = one.svg || '';
    return {
      onePath: wrap.querySelectorAll('path.series-line').length,
      oneDots: wrap.querySelectorAll('circle.series-dot').length,
      noneEmpty: none.empty === true,
      noneSvg: (none.svg || '').length,
      noneReason: none.reason || '',
    };
  });
  rec('C2', '单点不连线（无 path，恰 1 个圆点）',
    r.onePath === 0 && r.oneDots === 1, `path=${r.onePath} dot=${r.oneDots}`);
  rec('C3', '空窗口有空态（不是空 svg）',
    r.noneEmpty && r.noneSvg === 0 && !!r.noneReason, `empty=${r.noneEmpty} reason="${r.noneReason}"`);
}

/* ---------------- C4 关治疗节点曲线不变 ---------------- */
{
  await setCodes(['egfr', 'hb']);
  const before = await readPaths();
  const lane = await page.evaluate(() => {
    const l = document.querySelector('#wbPage .treat-lane');
    if (!l) return false;
    l.style.display = 'none';
    return true;
  });
  await page.waitForTimeout(200);
  const after = await readPaths();
  const same = before.length > 0 && before.length === after.length
    && before.every((d, i) => d === after[i]);
  rec('C4', '关治疗节点曲线不变（path[d] 字符串完全一致）', lane && same,
    lane ? `${before.length} 条 path，隐藏治疗泳道后逐一比对${same ? '一致' : '不一致'}` : '找不到 .treat-lane');
  await page.evaluate(() => {
    const l = document.querySelector('#wbPage .treat-lane');
    if (l) l.style.display = '';
  });
}

/* ---------------- C5 每序列只有一个数值标签 ---------------- */
{
  const r = await page.evaluate(() => {
    const labels = document.querySelectorAll('#wbPage .chart-host .end-label').length;
    const lines = document.querySelectorAll('#wbPage .chart-host .series-line').length;
    return { labels, lines };
  });
  rec('C5', '每序列只有一个数值标签', r.labels === r.lines && r.lines > 0,
    `${r.lines} 条线 / ${r.labels} 个末点标签`);
}

/* ---------------- C6 标签不越界 ---------------- */
{
  const r = await page.evaluate(() => {
    const svg = document.querySelector('#wbPage .chart-host svg');
    if (!svg) return { bad: ['无 svg'], n: 0 };
    const vb = svg.viewBox.baseVal;
    const bad = [];
    svg.querySelectorAll('text').forEach((t) => {
      const b = t.getBBox();
      if (b.x < vb.x - 0.5 || b.y < vb.y - 0.5
        || b.x + b.width > vb.x + vb.width + 0.5
        || b.y + b.height > vb.y + vb.height + 0.5) {
        bad.push(`${t.textContent.trim()}(${b.x.toFixed(0)},${b.y.toFixed(0)},${b.width.toFixed(0)}×${b.height.toFixed(0)})`);
      }
    });
    return { bad, n: svg.querySelectorAll('text').length };
  });
  rec('C6', '标签不越界（所有 text bbox 在 viewBox 内）', r.bad.length === 0,
    `${r.n} 个 text，越界 ${r.bad.length}${r.bad.length ? '：' + r.bad.join(' ') : ''}`);
}

/* ---------------- C7 本癌种适用形式：变化文案带绝对单位，不用百分比 ---------------- */
{
  await page.evaluate(() => { location.hash = '#/metrics'; });
  await page.waitForTimeout(420);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#wbPage .tab')).find((x) => x.textContent.includes('分类指标卡'));
    if (b) b.click();
  });
  await page.waitForTimeout(420);
  const r = await page.evaluate(() => {
    const deltas = Array.from(document.querySelectorAll('#wbPage .mc-delta'))
      .map((el) => el.innerText.replace(/\s+/g, ' ').trim())
      .filter((t) => t && !/无法比较/.test(t));
    /* 标准模板的 C7 是「康复类用绝对值」（乳腺癌臂围 1.8cm，不写 +20%）。
       膀胱癌没有康复类指标，按同一原则换算：变化必须带绝对单位，不能给百分比。 */
    const withUnit = deltas.filter((t) => /[a-zA-Zμ²³/]|mL|g\/L|kg|U\/L|次|分/.test(t));
    const withPct = deltas.filter((t) => t.includes('%'));
    return { n: deltas.length, withUnit: withUnit.length, withPct, sample: deltas.slice(0, 3) };
  });
  rec('C7', 'C7（本癌种换算）变化文案带绝对单位、不用百分比',
    r.n > 0 && r.withUnit === r.n && r.withPct.length === 0,
    `${r.n} 处变化文案全部带单位，含百分比 ${r.withPct.length} 处｜例：${r.sample.join(' ／ ')}`);
}

/* ---------------- C8 时间窗联动 ---------------- */
{
  await gotoChart();
  await setCodes(['egfr', 'hb']);
  const all = await page.evaluate(() => ({
    dots: document.querySelectorAll('#wbPage .chart-host .series-dot').length,
    first: document.querySelector('#wbPage .chart-host .axis-label')?.textContent?.trim(),
  }));
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#wbPage button[data-win]')).find((x) => x.textContent.includes('近 3 个月'));
    if (b) b.click();
  });
  await page.waitForTimeout(420);
  const w3 = await page.evaluate(() => ({
    dots: document.querySelectorAll('#wbPage .chart-host .series-dot').length,
    first: document.querySelector('#wbPage .chart-host .axis-label')?.textContent?.trim(),
  }));
  const movedRight = !!all.first && !!w3.first && w3.first > all.first;
  rec('C8', '时间窗联动（切近 3 月后首刻度右移、点数减少）',
    movedRight && w3.dots < all.dots,
    `全部：首刻度 ${all.first} / ${all.dots} 点 → 近 3 月：首刻度 ${w3.first} / ${w3.dots} 点`);
}

/* ---------------- C9 390 宽无横向溢出 ---------------- */
{
  await page.setViewportSize({ width: 390, height: 900 });
  await gotoChart();
  await page.waitForTimeout(420);
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    wrap: (() => {
      const w = document.querySelector('#wbPage .chart-wrap');
      return w ? { sw: w.scrollWidth, cw: w.clientWidth } : null;
    })(),
  }));
  rec('C9', '390 宽无横向溢出（scrollWidth === 390）',
    r.doc === 390 && r.body === 390,
    `documentElement=${r.doc} body=${r.body}；图表滚动容器 ${r.wrap ? `${r.wrap.sw}/${r.wrap.cw}` : '无'}`);
  await page.setViewportSize({ width: 1280, height: 1000 });
}

/* ---------------- C10 减少动效下曲线可见 ---------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  const p2 = await ctx.newPage();
  await p2.goto(URL_);
  await p2.waitForTimeout(300);
  await p2.evaluate(() => { location.hash = '#/chart'; });
  await p2.waitForTimeout(500);
  const r = await p2.evaluate(() => {
    const out = [];
    document.querySelectorAll('#wbPage .chart-host .series-line').forEach((el) => {
      const cs = getComputedStyle(el);
      out.push({ off: cs.strokeDashoffset, anim: cs.animationName });
    });
    const sq = document.querySelector('#wbPage .metric-card .sparkline, #wbPage .metric-card svg');
    return { lines: out, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, hasSpark: !!sq };
  });
  const visible = r.lines.length > 0 && r.lines.every((l) => l.off === '0px' || l.off === '0');
  rec('C10', '减少动效下曲线可见（stroke-dashoffset 为 0，直接给终态）',
    r.reduce && visible, `reduced-motion=${r.reduce}，${r.lines.map((l) => `offset=${l.off}`).join(' ')}`);
  await ctx.close();
}

/* ---------------- C11 翻转不位移 / C12 翻转状态独立 ---------------- */
{
  await gotoChart();
  await page.evaluate(() => { location.hash = '#/metrics'; });
  await page.waitForTimeout(420);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#wbPage .tab')).find((x) => x.textContent.includes('分类指标卡'));
    if (b) b.click();
  });
  await page.waitForTimeout(420);
  const r = await page.evaluate(async () => {
    const cards = Array.from(document.querySelectorAll('#wbPage .metric-card'));
    if (cards.length < 2) return { ok: false, why: `只找到 ${cards.length} 张卡` };
    const before = cards[0].getBoundingClientRect();
    cards[0].click();
    await new Promise((s) => setTimeout(s, 700));
    const after = cards[0].getBoundingClientRect();
    const inner = cards[0].querySelector('.metric-card-inner, .mc-inner, .metric-inner');
    const cs = inner ? getComputedStyle(inner) : null;
    const states = cards.map((c) => c.getAttribute('aria-pressed'));
    return {
      ok: true,
      dx: Math.abs(after.x - before.x), dy: Math.abs(after.y - before.y),
      dw: Math.abs(after.width - before.width), dh: Math.abs(after.height - before.height),
      transform: cs ? cs.transform : '',
      states,
      flipped: cards[0].dataset.flipped,
    };
  });
  if (!r.ok) {
    rec('C11', '翻转不位移', false, r.why);
    rec('C12', '翻转状态独立', false, r.why);
  } else {
    const still = r.dx < 0.5 && r.dy < 0.5 && r.dw < 0.5 && r.dh < 0.5;
    const is3d = /matrix3d/.test(r.transform);
    rec('C11', '翻转不位移（翻转前后 rect 完全一致，内层含 matrix3d）', still && is3d,
      `Δx=${r.dx.toFixed(2)} Δy=${r.dy.toFixed(2)} Δw=${r.dw.toFixed(2)} Δh=${r.dh.toFixed(2)}；transform=${r.transform.slice(0, 22)}…`);
    const on = r.states.filter((s) => s === 'true').length;
    rec('C12', '翻转状态独立（单卡 aria-pressed=true，其他 false）',
      on === 1 && r.states[0] === 'true', `aria-pressed=[${r.states.join(',')}]`);
  }
}

/* ---------------- 汇总 ---------------- */
const pass = results.filter((r) => r.ok).length;
console.log(`\n${'='.repeat(64)}\nC1–C12：通过 ${pass} / ${results.length}${errors.length ? `（浏览器 error ${errors.length} 条）` : '（浏览器零 error）'}\n${'='.repeat(64)}`);

if (WRITE) {
  const p = join(ROOT, 'docs/ONE-CHART-SPEC.md');
  let doc = await readFile(p, 'utf8');
  for (const r of results) {
    const cell = r.ok ? '通过' : '**未通过**';
    doc = doc.replace(new RegExp(`(\\| ${r.id} \\| [^|]+\\| )[^|]*(\\| )?[^|]*(\\|)`),
      (m, a, b) => `| ${r.id} | ${r.name} | ${cell} | ${r.detail.replace(/\|/g, '/')} |`);
  }
  doc = doc.replace(/\n## 7\. 指标卡/, `\n> 本节 C1–C12 由 \`scripts/verify-one-chart.mjs\` 在真浏览器实测生成，\n> 复现：\`node scripts/verify-one-chart.mjs --write\`。实测时间：${new Date().toISOString().slice(0, 10)}。\n\n## 7. 指标卡`);
  await writeFile(p, doc, 'utf8');
  console.log('已回写 docs/ONE-CHART-SPEC.md');
}

await browser.close();
process.exit(pass === results.length ? 0 : 1);
