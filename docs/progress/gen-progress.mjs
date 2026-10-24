#!/usr/bin/env node
/**
 * 生成 `docs/progress/m0-m9.svg`（+ 用 playwright 出 png）。
 *
 * 为什么要脚本而不是手改 SVG：进度图是最容易**过期**的交付物——
 * 里程碑一动就要改十来个坐标和颜色，手改必然漏，漏了又不报错。
 * 上一版就是手写的，M5 已经完成、M6 已经装机了，图里还写着「M5–M9 未开始」。
 * 现在状态只写一处（下面的 MILESTONES），坐标与配色由脚本算。
 *
 * 数据来源：
 *   - 里程碑状态与日期：本文件的状态表（与 docs/DEV-PLAN.md 人工同步；
 *     不一致时以 DEV-PLAN.md 为准——它是里程碑的唯一权威来源）
 *   - 提交数与日期区间：`git log` 实算，不手填
 *
 * 用法：
 *   node docs/progress/gen-progress.mjs          只生成 svg
 *   node docs/progress/gen-progress.mjs --png    同时出 png（需要 playwright）
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

/**
 * 里程碑状态。`status` 只有三种，与 docs/DEV-PLAN.md 的状态词表对齐：
 *   done = ✅ 完成（判据可复核、证据路径存在）
 *   wip  = 🔵 已执行未验证（做了，但缺判据要求的最后一步证据）
 *   todo = ⬜ 未开始
 * 不许出现「基本完成」「差不多了」这类第四种状态。
 */
const MILESTONES = [
  { id: 'M0', label: '骨架', status: 'done', note: '10-23' },
  { id: 'M1', label: '调研SPEC', status: 'done', note: '10-23' },
  { id: 'M2', label: '原型', status: 'done', note: '10-24' },
  { id: 'M3', label: '数据模型', status: 'done', note: '10-24' },
  { id: 'M4', label: '临床库', status: 'done', note: '10-23' },
  { id: 'M5', label: '开发版', status: 'done', note: '10-24' },
  // M6 是 wip 而不是 done：装机三层验收跑通了，但授权闸（UROPAL_AUTH）
  // 的拒绝路径没验——未验证不写已验证，见 docs/DEV-PLAN.md「M6 装机证据」。
  { id: 'M6', label: '装机', status: 'wip', note: '45/46' },
  { id: 'M7', label: '发布', status: 'todo', note: '' },
  { id: 'M8', label: '状态回填', status: 'todo', note: '' },
  { id: 'M9', label: '回流闭环', status: 'todo', note: '' },
];

const GATES = [
  { label: 'G1 需求 · 10-24 已签', done: true },
  { label: 'G2 原型 · 10-24 已签', done: true },
  { label: 'G3 数据契约 · 10-24 已签', done: true },
];

const COLOR = {
  done: '#2F7D6B',
  wip: '#C77D2B',
  todo: '#B4B2A9',
  textDone: '#1E3A42',
  textTodo: '#888780',
  textBody: '#4E6B74',
  textHead: '#1E3A42',
  gate: '#D3D1C7',
  bg: '#FFFFFF',
};

const W = 960;
const H = 260;
const X0 = 60;
const STEP = 90;
const Y = 112;

function gitStats() {
  try {
    const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const first = execFileSync('git', ['log', '--reverse', '--format=%ad', '--date=format:%m-%d'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')[0];
    const last = execFileSync('git', ['log', '-1', '--format=%ad', '--date=format:%m-%d'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    return { count, range: `${first} → ${last}` };
  } catch {
    return { count: '?', range: '未知' };
  }
}

const check = (cx, cy) =>
  `<path d="M${cx - 7} ${cy}l5 5 9-10" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;

function node(m, cx) {
  const c = COLOR[m.status];
  const fill = m.status === 'todo' ? '#fff' : c;
  const stroke = m.status === 'todo' ? ` stroke="${c}" stroke-width="1.5"` : '';
  const textFill = m.status === 'todo' ? COLOR.textTodo : COLOR.textDone;
  const noteFill = m.status === 'wip' ? COLOR.wip : c;
  const inner = m.status === 'done' ? check(cx, Y) : '';
  const note = m.note
    ? `<text x="${cx}" y="172" text-anchor="middle" font-size="10" fill="${noteFill}">${m.note}</text>`
    : '';
  return `  <!-- ${m.id} ${m.status} -->
  <g><circle cx="${cx}" cy="${Y}" r="15" fill="${fill}"${stroke}/>
  ${inner}
  <text x="${cx}" y="143" text-anchor="middle" font-size="12.5" font-weight="600" fill="${textFill}">${m.id}</text>
  <text x="${cx}" y="158" text-anchor="middle" font-size="10.5" fill="${m.status === 'todo' ? COLOR.textTodo : COLOR.textBody}">${m.label}</text>
  ${note}</g>`;
}

function build() {
  const { count, range } = gitStats();
  const xs = MILESTONES.map((_, i) => X0 + i * STEP);
  const lastDone = MILESTONES.map((m) => m.status).lastIndexOf('done');
  const firstTodo = MILESTONES.findIndex((m) => m.status === 'todo');

  const solidEnd = xs[lastDone];
  const amberStart = xs[lastDone] + 26;
  const amberEnd = firstTodo >= 0 ? xs[firstTodo] - 26 : W - 60;
  const grayStart = amberEnd;

  const doneCount = MILESTONES.filter((m) => m.status === 'done').length;
  const wip = MILESTONES.filter((m) => m.status === 'wip').map((m) => m.id);

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,-apple-system,'PingFang SC',sans-serif">
  <rect width="${W}" height="${H}" fill="${COLOR.bg}"/>
  <text x="30" y="34" font-size="15" font-weight="600" fill="${COLOR.textHead}">小泉宝 UroPal · 膀胱癌工作台 · 里程碑进度</text>
  <text x="30" y="54" font-size="11.5" fill="${COLOR.textBody}">v0.1.0 · ${count} 次提交（${range}）· 依据 docs/DEV-PLAN.md 与 git 实况</text>

  <!-- 已完成段实线 -->
  <line x1="${X0}" y1="${Y}" x2="${solidEnd}" y2="${Y}" stroke="${COLOR.done}" stroke-width="2"/>
  <!-- 进行中段（M6） -->
  ${wip.length ? `<line x1="${amberStart}" y1="${Y}" x2="${amberEnd}" y2="${Y}" stroke="${COLOR.wip}" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
  <!-- 未开始段虚线 -->
  <line x1="${grayStart}" y1="${Y}" x2="${W - 60}" y2="${Y}" stroke="${COLOR.todo}" stroke-width="1.5" stroke-dasharray="4 4"/>

${MILESTONES.map((m, i) => node(m, xs[i])).join('\n\n')}

  <!-- 闸口 G1 G2 G3 -->
  <line x1="${X0}" y1="205" x2="${W - 60}" y2="205" stroke="${COLOR.gate}" stroke-width="0.8"/>
  <text x="30" y="228" font-size="11" fill="#854F0B" font-weight="600">闸口</text>
  <g>
${GATES.map((g, i) => {
  const cx = 76 + i * 140;
  return `    <circle cx="${cx}" cy="224" r="6" fill="${g.done ? COLOR.done : COLOR.todo}"/><text x="${cx + 12}" y="228" font-size="11" fill="${g.done ? COLOR.done : COLOR.textTodo}">${g.label}</text>`;
}).join('\n')}
    <circle cx="530" cy="224" r="6" fill="${COLOR.wip}"/><text x="542" y="228" font-size="11" fill="${COLOR.wip}">M6 已执行未验证（授权闸待补验）· M7–M9 未开始</text>
  </g>

  <!-- 图例 -->
  <g>
    <circle cx="60" cy="250" r="4.5" fill="${COLOR.done}"/><text x="70" y="253" font-size="10.5" fill="${COLOR.textBody}">已完成（带日期）</text>
    <circle cx="190" cy="250" r="4.5" fill="${COLOR.wip}"/><text x="200" y="253" font-size="10.5" fill="${COLOR.textBody}">已执行未验证</text>
    <circle cx="300" cy="250" r="4.5" fill="#fff" stroke="${COLOR.todo}" stroke-width="1.5"/><text x="310" y="253" font-size="10.5" fill="${COLOR.textBody}">未开始</text>
    <circle cx="380" cy="250" r="6" fill="none" stroke="${COLOR.done}" stroke-width="1.8"/><text x="394" y="253" font-size="10.5" fill="${COLOR.textBody}">闸口（已签认）</text>
    <text x="520" y="253" font-size="10.5" fill="${COLOR.textTodo}">${doneCount}/10 完成 · 状态口径见 DEV-PLAN.md</text>
  </g>
</svg>
`;
}

const svg = build();
writeFileSync(join(HERE, 'm0-m9.svg'), svg);
console.log(`✓ docs/progress/m0-m9.svg（${svg.split('\n').length} 行）`);

if (process.argv.includes('--png')) {
  // playwright 只装在本机全局，不在 package.json 里（它是自检工具，不是运行依赖）。
  // 用 createRequire 而不是 await import：全局包是 CommonJS，import 路径解析不稳。
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { chromium } = require('/opt/homebrew/lib/node_modules/@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await page.setContent(
    `<html><body style="margin:0;background:#fff">${svg.replace('<svg ', '<svg style="display:block" ')}</body></html>`,
  );
  await page.screenshot({ path: join(HERE, 'm0-m9.png') });
  await browser.close();
  console.log('✓ docs/progress/m0-m9.png（1920×520）');
}
