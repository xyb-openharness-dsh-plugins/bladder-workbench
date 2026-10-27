#!/usr/bin/env node
// 检查器 1/5：语法扫描 + 禁用词扫描。
//
// 为什么把两件事放一个脚本：
// package.json 里已有一个手写的 check:syntax（逐条列文件名），那种写法每加一个
// 文件就要改一次清单，漏加就等于没检查。这里改成"扫全仓"，
// 保证新增脚本自动纳入；再把 ZERO-TO-DEV §2.3 要求的文案红线一起做进来，
// 让"语法能过、文案违规"这种组合在一次命令里暴露。
//
// 退出码：0 = 全过；1 = 有语法错误或命中红线词表。
//
// 不作为硬失败的词（应该 / 必须 / 需要治疗 …）：
// 这些词在指南转述、免责句、自检提示里是正当用语（实测仓库里有 70 处"必须"，
// 几乎全是"必须与…逐字一致"这类工程约束），把它们当失败会造成大面积误报，
// 久了就没人看检查结果了。所以只统计、只提示，不阻断。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 只扫这两种扩展名。.cjs 本项目不用（package.json 是 type:module）。
const EXTS = new Set(['.js', '.mjs']);

// 不扫的目录：
// - node_modules：第三方代码不归我们管；
// - prototypes：HTML 原型目录自带一套旧脚本，且原型里刻意保留了反面文案样本
//   （红线的"负样本"），扫它会与 check-wording.mjs 的职责重复；
// - 点开头目录：工具缓存（.git/.workbuddy 等），不是源码。
const SKIP_DIRS = new Set(['node_modules', 'prototypes']);

// 硬失败词表：prompts/ZERO-TO-DEV.md §2.3 的 7 个词。
// 这些是"工作台替患者下处置结论"的话术，任何一处出现都算越界。
const REDLINE_WORDS = ['建议治疗', '可能复发', '可以停药', '无需就医', '推荐方案', '治愈率', '生存率'];

// 提示词表：指南语境专用扩张词。同上，只统计不阻断。
const HINT_WORDS = ['应该', '必须', '建议复查', '需要治疗', '暂停用药', '可以考虑加用'];

// 否定语境放行：命中词之前 12 个字里出现否定词，说明这句话本身就在否定它
// （例如"以下做法不要做：建议治疗…"、"不推荐方案"），属于免责/警示句。
const NEGATIONS = ['不', '勿', '禁', '别', '未', '毋', '莫'];
const NEGATION_LOOKBACK = 12;

// 检查器自己必须写出这些词才能检查它们（词表定义、断言样例），放行。
// 只放行 scripts/ 下的 check-*.mjs / verify-*.mjs / probe-*.mjs，避免把这条豁免扩大成后门。
// probe-* 也要放行：probe-disease-primer.mjs 的 BANNED 数组必须逐字包含这些词，才能测出违规。
const SELF_EXEMPT = /^scripts\/(check|verify|probe)-[^/]*\.mjs$/;

const rel = (p) => relative(ROOT, p).split('\\').join('/');

/**
 * 红线扫描按文件跳过（**语法检查不跳**：生成物也该过 node --check）。
 *
 * `demo/demo-data.js` 是 `prototypes/v0.1/data.js` 的逐字节副本（见
 * `demo/build-demo-data.mjs`），而 `prototypes/` 本来就在 SKIP_DIRS 里——
 * 它属于界面面，红线归 `scripts/check-wording.mjs` 管（那边对
 * `WORDING_REDLINES` 这张"我们不用的词"词表有明确豁免）。
 * 扫这份副本不会多查出一个字，只会把同一张词表再报一次。
 *
 * 收紧条件：只放行这一个生成物，不放行整个 `demo/` 目录——
 * `demo/build-demo-data.mjs` 是真正手写的源码，必须照常扫。
 */
const WORDING_SKIP_FILES = new Set(['demo/demo-data.js']);

/** 递归收集待检查文件（按路径排序，保证输出稳定可比）。 */
function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      collectFiles(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf('.');
    if (dot < 0 || !EXTS.has(entry.name.slice(dot))) continue;
    out.push(full);
  }
  return out;
}

/** 逐文件跑 `node --check`。用 spawnSync 而不是 execFileSync，是为了不让第一个
 *  失败文件中断整轮扫描——一次报全所有语法错误，省一轮来回。 */
function checkSyntax(files) {
  const failures = [];
  for (const file of files) {
    const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (res.status === 0) continue;
    const detail = (res.stderr || res.stdout || '').trim().split('\n').slice(0, 6).join('\n    ');
    failures.push({ file: rel(file), detail: detail || `退出码 ${res.status}` });
  }
  return failures;
}

/** 文案扫描。返回 { redline: [...], hints: Map } */
function checkWording(files) {
  const redline = [];
  const hints = new Map();
  for (const file of files) {
    const r = rel(file);
    if (SELF_EXEMPT.test(r)) continue;
    if (WORDING_SKIP_FILES.has(r)) continue;

    let text;
    try {
      if (!statSync(file).isFile()) continue;
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);

    lines.forEach((line, idx) => {
      // 行末标记放行：自检清单、断言样例可以显式声明"这一行就是要出现这个词"。
      const allowed = line.includes('wording-allow');
      for (const word of REDLINE_WORDS) {
        const at = line.indexOf(word);
        if (at < 0 || allowed) continue;
        const before = line.slice(Math.max(0, at - NEGATION_LOOKBACK), at);
        if (NEGATIONS.some((n) => before.includes(n))) continue;
        redline.push({ file: r, line: idx + 1, word, text: line.trim().slice(0, 120) });
      }
      for (const word of HINT_WORDS) {
        if (!line.includes(word)) continue;
        const key = word;
        const hit = hints.get(key) || { count: 0, files: new Map() };
        hit.count += 1;
        hit.files.set(r, (hit.files.get(r) || 0) + 1);
        hints.set(key, hit);
      }
    });
  }
  return { redline, hints };
}

function main() {
  const files = collectFiles(ROOT);
  if (files.length === 0) {
    console.error('✗ 没扫到任何 .js/.mjs 文件，路径可能不对：' + ROOT);
    process.exitCode = 1;
    return;
  }

  console.log(`▶ 语法检查（node --check）· 根目录 ${rel(ROOT) || '.'} · ${files.length} 个文件`);
  const syntaxFailures = checkSyntax(files);
  if (syntaxFailures.length === 0) {
    console.log(`✓ 语法检查通过（${files.length} 个 JS/MJS 文件）`);
  } else {
    console.error(`✗ 语法检查失败 ${syntaxFailures.length} 个文件：`);
    for (const f of syntaxFailures) console.error(`  ✗ ${f.file}\n    ${f.detail}`);
  }

  console.log('');
  console.log(`▶ 禁用词扫描（硬失败词表 ${REDLINE_WORDS.length} 个：${REDLINE_WORDS.join(' / ')}）`);
  const { redline, hints } = checkWording(files);
  if (redline.length === 0) {
    console.log('✓ 未命中硬失败词表（否定语境与 wording-allow 行已放行）');
  } else {
    console.error(`✗ 命中硬失败词表 ${redline.length} 处：`);
    for (const h of redline) {
      console.error(`  ✗ ${h.file}:${h.line} 命中「${h.word}」`);
      console.error(`      ${h.text}`);
    }
  }

  console.log('');
  console.log('▶ 指南语境扩词（提示，不阻断）');
  if (hints.size === 0) {
    console.log('  · 无');
  } else {
    for (const [word, hit] of [...hints.entries()].sort((a, b) => b[1].count - a[1].count)) {
      const where = [...hit.files.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([f, n]) => `${f}×${n}`)
        .join('、');
      console.log(`  · ${word} × ${hit.count}（${where}）`);
    }
    console.log('  ⚠ 这些词本身不算违规，但新增出现时请确认它出现在指南转述/工程约束/免责语境里，');
    console.log('    不是"我们替患者下结论"。硬失败只看上面那 7 个词。');
  }

  if (syntaxFailures.length > 0 || redline.length > 0) process.exitCode = 1;
}

main();
