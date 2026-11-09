#!/usr/bin/env node
/**
 * 生成 `demo/demo-data.js`：把原型的唯一数据源搬进包里。
 *
 * 为什么必须有这一步（2026-10-24 装机探针抓到的 P0）：
 * `dsh/demo.js` 原来用 `node:vm` 在**运行期**读 `prototypes/v0.1/data.js`。
 * 开发版从仓库根跑一切正常，但 `prototypes/` 不在 `package.json` 的 `files` 白名单里
 * （那是开发目录，不该随包分发），装机副本里根本没有这个目录 —— 于是
 * `apply()` 在播种时抛 ENOENT，整个插件在 Desktop 里挂不上。这正是
 * 「装进 Desktop 才暴露」的那一类故障，本地怎么点都复现不出来。
 *
 * 不想把 `prototypes/` 塞进白名单（会把整个 HTML 原型也发出去），所以改为
 * **构建期**生成一个包内副本：`demo/demo-data.js` = 原型 data.js 原文 + 一行 export。
 *
 * 为什么是「原文照搬 + export 尾部」而不是 JSON：
 * `JSON.stringify` 会**静默丢掉值为 `undefined` 的键**，而原型里存在这种字段
 * （例如 `variantRaw: null` 之外还有若干未填的占位）。丢一个键，readmodels 还原出的
 * 形状就与原型差一格，逐字符 parity 会挂 —— 而且挂的原因看起来像「readmodels 写错了」。
 * 原文照搬是零损的：一个字节都不改，只加一行导出。
 *
 * 唯一数据源仍然是 `prototypes/v0.1/data.js`；本文件是**派生物**，
 * 由 `npm run check:demo` 保证它没有漂移（生成结果与磁盘不一致即退出码 1）。
 *
 * 用法：
 *   node demo/build-demo-data.mjs           写入（内容没变不落盘）
 *   node demo/build-demo-data.mjs --check   只校验
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 唯一数据源。原型目录只在仓库里存在，不进包。 */
const SOURCE = join(ROOT, 'prototypes', 'v0.1', 'data.js');
/** 派生物。进包（`files` 白名单含 `demo`），dsh/demo.js 从它 import。 */
const OUTPUT = join(ROOT, 'demo', 'demo-data.js');

/**
 * 要导出的全局常量。**必须与 `dsh/demo.js` 的消费清单一致**——
 * 少一个就会在播种时得到 `undefined`，而 `undefined` 传进 INSERT 会变成 NULL，
 * 库里看着「有行」，字段却是空的。所以两边各有一份，`check:demo` 会比对。
 */
const EXPORTS = [
  'NAV', 'STATE', 'PATHOLOGY', 'BCG_RESPONSE', 'HIGH_RISK_MARKERS', 'INSTILLATION',
  'CONTRA', 'FOLLOWUP', 'RENAL', 'METRICS', 'CATEGORICAL', 'DIVERSION', 'DIVERSION_CASE',
  'SURGERY_CASE', 'TREATMENT_CASE', 'RECORDS', 'LIFE', 'QUESTIONS', 'TRIAL_FAVORITES',
  'TRIAL_QUESTIONS', 'STOMA_SUPPLY', 'STOMA_LOG', 'URGENT', 'TRIALS', 'TRIALS_STATS',
  /* 35 号匹配条目与灌注后不适：两者都只写一份来源（data.js），
     导出让 dsh 的 catalogs / free_blocks 能拿到同一份。 */
  'TRIAL_DEMO_MATCH', 'SIDE_EFFECTS',
  'WORDING_REDLINES', 'DRAFT_SCOPES',
];

const HEADER = `/*
 * 本文件由 \`demo/build-demo-data.mjs\` 从 \`prototypes/v0.1/data.js\` 生成，**请勿手改**。
 * 唯一数据源是原型目录里的 data.js；这里只是它的零损副本 + 一行导出，
 * 目的是让装机副本（node_modules 里没有 prototypes/）也能拿到同一份演示数据。
 * 改动流程：改原型 → \`npm run build:demo\` → \`npm run check\`。
 */
`;

function generate() {
  if (!existsSync(SOURCE)) {
    throw new Error(
      `找不到原型数据源：${SOURCE}\n` +
        '这是仓库内路径。如果你在装机副本里看到这条，说明有人把本脚本当成运行期依赖了——它只在构建期跑。',
    );
  }
  const source = readFileSync(SOURCE, 'utf8');
  const footer = `\n/* ── 导出（由 build-demo-data.mjs 追加）── */\nexport { ${EXPORTS.join(', ')} };\n`;
  // 原文一个字节不改，只在末尾追加导出：这样 vm 版与模块版的求值结果必然一致。
  return `${HEADER}\n${source}${footer}`;
}

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');

let next;
try {
  next = generate();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

if (checkOnly) {
  if (!existsSync(OUTPUT)) {
    console.error(`✗ ${OUTPUT.replace(`${ROOT}/`, '')} 不存在，请运行 npm run build:demo`);
    process.exit(1);
  }
  const current = readFileSync(OUTPUT, 'utf8');
  if (current !== next) {
    const bare = OUTPUT.replace(`${ROOT}/`, '');
    console.error(`✗ ${bare} 与原型 data.js 不同步，请运行 npm run build:demo`);
    // 给出第一处差异，便于定位（逐字符比，不打印整文件）
    let i = 0;
    while (i < current.length && i < next.length && current[i] === next[i]) i += 1;
    const slice = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 60));
    console.error(`  首个差异在第 ${i} 个字符附近：`);
    console.error(`    磁盘：${slice(current)}`);
    console.error(`    期望：${slice(next)}`);
    process.exit(1);
  }
  console.log(`✓ demo/demo-data.js 与原型 data.js 同步（${next.split('\n').length} 行 · ${EXPORTS.length} 个导出）`);
  process.exit(0);
}

mkdirSync(dirname(OUTPUT), { recursive: true });
if (existsSync(OUTPUT) && readFileSync(OUTPUT, 'utf8') === next) {
  console.log(`= demo/demo-data.js 未变化（${EXPORTS.length} 个导出）`);
} else {
  writeFileSync(OUTPUT, next);
  console.log(`✓ 已生成 demo/demo-data.js（${next.split('\n').length} 行 · ${EXPORTS.length} 个导出）`);
}
