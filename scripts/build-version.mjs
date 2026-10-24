#!/usr/bin/env node
/**
 * 生成 lib/version.js（M5）。唯一来源：仓库根 VERSION。lib/version.js 是生成物，不手改。
 *
 * ## 版本校验的陷阱（prompts/ZERO-TO-DEV.md §2.3 v1.2）
 * commit 行记录的是**生成时**的 HEAD，一提交就落后一格。所以 `--check` 做两件事：
 *   1. 逐字比对时**忽略 commit 行**——否则提交后永远假红；
 *   2. 用 `git merge-base --is-ancestor <recorded> HEAD` 核 commit 是**真实存在且为祖先**
 *      （防止有人手改/编造一个哈希，也防止回滚后残留一个未来分支上的哈希）。
 *
 * ⚠️ git 成败必须看**退出码**：`--is-ancestor` 成功时**没有输出**，
 * 用「返回值是不是空串」判会永远判错。这里写 `spawnSync(...).status === 0`。
 *
 * 用法：
 *   node scripts/build-version.mjs           写入（内容没变不落盘）
 *   node scripts/build-version.mjs --check   只校验（忽略 commit 行 + 核 commit 真实性），不一致退出码 1
 *
 * 渠道 UROPAL_CHANNEL 三选一：prototype / beta / stable。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'lib', 'version.js');
const checkOnly = process.argv.includes('--check');

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const CHANNELS = ['prototype', 'beta', 'stable'];
const CHANNEL_LABELS = {
  prototype: '交互原型 · 未接入 DSH',
  beta: '开发版 · 数据仅在本机',
  stable: '正式版 · 数据仅在本机',
};

const raw = readFileSync(join(root, 'VERSION'), 'utf8').trim();
if (!SEMVER.test(raw)) {
  console.error(`✗ VERSION 不是合法语义化版本：${raw}`);
  process.exit(1);
}

const channel = process.env.UROPAL_CHANNEL || 'prototype';
if (!CHANNELS.includes(channel)) {
  console.error(`✗ UROPAL_CHANNEL 只能是 ${CHANNELS.join(' / ')}，收到：${channel}`);
  process.exit(1);
}

function git(args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const commit = git(['rev-parse', '--short', 'HEAD']) || 'local';
const build = git(['log', '-1', '--format=%cs']) || 'local';

const generated = `// 本文件由 scripts/build-version.mjs 生成，请勿手改。
// 唯一来源：仓库根目录的 VERSION。改版本先改 VERSION，再跑 npm run build:version。
export const version = '${raw}'
export const build = '${build}'
export const channel = '${channel}'
export const commit = '${commit}'

export const displayVersion = \`v\${version}\`
export const channelLabel = '${CHANNEL_LABELS[channel]}'

export const APP_INFO = Object.freeze({
  version,
  displayVersion,
  build,
  channel,
  channelLabel,
  commit,
})
`;

/** 忽略 commit 行的比对（commit 必然滞后一格，逐字比对会永远假红） */
function sameIgnoringCommit(a, b) {
  const strip = (s) => s.split('\n').filter((l) => !/^export const commit = /.test(l)).join('\n');
  return strip(a) === strip(b);
}

/** 取出已生成文件里记录的 commit（可能不存在或为 'local'） */
function recordedCommit(text) {
  const m = text.match(/^export const commit = '([^']*)'/m);
  return m ? m[1] : '';
}

/**
 * 核 commit 真实性：必须能解析成对象、且是 HEAD 的祖先（相等也算）。
 * 返回 { ok, reason }；仓库里还没有提交（unborn HEAD）时 ok=true 并说明跳过。
 */
function verifyCommit(sha) {
  if (!sha || sha === 'local') return { ok: true, reason: '记录的是 local（生成时还没有 git 提交），跳过真实性核对' };
  const head = git(['rev-parse', '--verify', 'HEAD']);
  if (!head) return { ok: true, reason: '当前仓库没有提交，无法核对祖先关系，跳过' };
  // 关键：用退出码判成败，不能用输出是否为空（成功时没有输出）。
  const res = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', sha, 'HEAD'], { stdio: 'ignore' });
  if (res.status === 0) return { ok: true, reason: `${sha} 是 HEAD 的祖先` };
  return { ok: false, reason: `记录里的 commit ${sha} 不是 HEAD 的祖先（不存在、打错或来自未合并的分支），请重跑 npm run build:version` };
}

if (checkOnly) {
  if (!existsSync(target)) {
    console.error('✗ 缺少 lib/version.js，请先运行 npm run build:version');
    process.exit(1);
  }
  const current = readFileSync(target, 'utf8');
  if (!sameIgnoringCommit(current, generated)) {
    console.error('✗ lib/version.js 与 VERSION 不同步（已忽略 commit 行），请运行 npm run build:version');
    process.exit(1);
  }
  const verdict = verifyCommit(recordedCommit(current));
  if (!verdict.ok) {
    console.error(`✗ ${verdict.reason}`);
    process.exit(1);
  }
  console.log(`✓ lib/version.js 与 VERSION 同步（忽略 commit 行）：v${raw}（build ${build} · ${channel}）；commit 真实性：${verdict.reason}`);
  process.exit(0);
}

if (existsSync(target) && sameIgnoringCommit(readFileSync(target, 'utf8'), generated)) {
  console.log(`= lib/version.js 未变化：v${raw}（build ${build} · ${channel}）`);
  process.exit(0);
}

writeFileSync(target, generated);
console.log(`✓ 已生成 lib/version.js：v${raw}（build ${build} · ${channel}）`);
