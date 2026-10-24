#!/usr/bin/env node
/**
 * hash-prototype.mjs — 原型六件的规范哈希
 * 用法：node scripts/hash-prototype.mjs [--json]
 *
 * 为什么要有这个脚本：
 *   独立审查第 1 条发现「原型改了 hash 没更新，G2 就会签错版本」。
 *   手算总哈希必然对不上（顺序、是否含换行、是否含 _shots 都会变），
 *   所以顺序写死在脚本里，任何人跑出来的值都一样。
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
// 顺序固定：入口 → 样式 → 数据 → 脚本。改动此顺序会使所有历史哈希失效。
const FILES = ['index.html', 'tokens.css', 'shell.css', 'data.js', 'charts.js', 'app.js'];
const DIR = join(ROOT, 'prototypes/v0.1');

const per = FILES.map((f) => ({
  file: f,
  sha256: createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex'),
  bytes: readFileSync(join(DIR, f)).length,
}));
const total = createHash('sha256')
  .update(FILES.map((f) => readFileSync(join(DIR, f))).join(''))
  .digest('hex');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ files: per, total, order: FILES }, null, 2));
} else {
  for (const p of per) console.log(`${p.file.padEnd(14)} ${p.sha256.slice(0, 12)}  ${p.bytes} bytes`);
  console.log('-'.repeat(60));
  console.log(`总哈希（顺序拼接 ${FILES.join(' → ')}）`);
  console.log(total);
}
