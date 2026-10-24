#!/usr/bin/env node
/**
 * 本地 tgz 自测装机：打包装进 DSH Desktop 的 profile → 逐文件校验副本 → 跑装机探针。
 *
 * 为什么要有这个脚本（移植自家族 2026-10-24 的实测教训）：
 * 同一版本号重打包后，`pnpm add -w file:xxx.tgz` 会打印 **"Already up to date"**，
 * lockfile 里的 integrity 已经换成新包的，但 `node_modules` 下那坨文件**还是旧的**。
 * 结果是：你以为自己装的是刚打出来的包，探针跑的却是一个小时前的代码，
 * 而且两种情况下版本号都一样，看 package.json 分辨不出来。
 * 所以这里装完必须**逐文件比对** tgz 与装机副本，比不出来就当失败。
 *
 * 用法：
 *   npm run install:local                # pack → 装进 Desktop profile → 探针
 *   npm run install:local -- --dry-run   # 只打包并列文件，不碰 profile
 *   npm run install:local -- --no-probe  # 装完不跑探针（不建议）
 *
 * 环境变量：
 *   UROPAL_PROFILE  指定 profile 目录（**绝对路径**；默认 macOS 的 dsh-desktop/harness/profiles/web）
 *   UROPAL_PNPM  指定 pnpm 版本（默认取 profile 的 packageManager 字段）
 *
 * 退出码：0 = 装好且副本与包一致（探针也过）；非 0 = 任一步失败。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const NO_PROBE = args.includes('--no-probe');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.name;
const VERSION = pkg.version;
const SHORT = NAME.split('/').pop();

function appSupportRoot() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

/**
 * profile 解析（2026-10-24 实测踩坑）：
 * 宿主会往子进程里塞 `DSH_PROFILE=desktop`（profile **名字**，不是路径）与
 * `DSH_PROFILE_DIR=~/.dsh/profiles/desktop`（**CLI 侧** harness）。后者 Desktop 根本不读。
 * 参考实现直接 `resolve(process.env.DSH_PROFILE)` 会解析成 `<cwd>/desktop` 然后报
 * 「profile 不存在」。所以本项目只认独立后缀的 `UROPAL_PROFILE`（必须绝对路径），
 * **绝不读宿主的 `DSH_PROFILE` / `DSH_PROFILE_DIR`**。
 */
const PROFILE = (() => {
  const override = process.env.UROPAL_PROFILE;
  if (override) {
    if (!isAbsolute(override)) {
      throw new Error(`UROPAL_PROFILE 必须是绝对路径，收到：${override}`);
    }
    return resolve(override);
  }
  return resolve(join(appSupportRoot(), 'dsh-desktop', 'harness', 'profiles', 'web'));
})();
const MODULES = join(PROFILE, 'node_modules');
const INSTALLED = join(MODULES, ...NAME.split('/'));

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const step = (n, text) => console.log(`\n[${n}/5] ${text}`);

/* ── 1. 打包 ─────────────────────────────────────────────────────────── */
step(1, `打包 ${NAME}@${VERSION}`);
const releaseDir = join(ROOT, 'release');
mkdirSync(releaseDir, { recursive: true });
const out = execFileSync('npm', ['pack', '--pack-destination', releaseDir], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, NODE_OPTIONS: '' },
});
const tgzName = out.trim().split('\n').filter(Boolean).pop();
const tgz = join(releaseDir, tgzName);
if (!existsSync(tgz)) throw new Error(`打出来的包找不到：${tgz}`);
const tgzSha = sha256(tgz);
const tgzSize = (statSync(tgz).size / 1024).toFixed(1);
console.log(`  ${tgzName}  ${tgzSize} kB  sha256 ${tgzSha.slice(0, 12)}…`);

/* ── 2. 包里到底有哪些文件（后面要拿来跟装机副本逐个对） ──────────────── */
const tgzEntries = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' })
  .split('\n')
  .filter((line) => line && !line.endsWith('/'))
  .map((line) => line.replace(/^package\//, ''))
  .sort();
console.log(`  包内 ${tgzEntries.length} 个文件`);

if (DRY) {
  console.log('\n--dry-run：到此为止，未改动 profile。');
  process.exit(0);
}

/* ── 3. 装进 profile ────────────────────────────────────────────────── */
if (!existsSync(join(PROFILE, 'package.json'))) {
  throw new Error(`profile 不存在：${PROFILE}\nDSH Desktop 至少启动过一次吗？或用 DSH_PROFILE 指定。`);
}

// pnpm 版本：默认跟 profile 自己声明的那个走（换版本可能改写 lockfile 格式）。
const profilePkg = JSON.parse(readFileSync(join(PROFILE, 'package.json'), 'utf8'));
const declared = String(profilePkg.packageManager || '').split('+')[0];
const PNPM = process.env.UROPAL_PNPM || declared || 'pnpm@10.15.0';
const pnpmSpec = PNPM.includes('@') ? PNPM : `pnpm@${PNPM}`;

step(2, `装进 profile：${PROFILE}`);
const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
const backup = join(PROFILE, `package.json.bak-${SHORT}-${VERSION}-${stamp}`);
const lockBackup = join(PROFILE, `pnpm-lock.yaml.bak-${SHORT}-${VERSION}-${stamp}`);
copyFileSync(join(PROFILE, 'package.json'), backup);
if (existsSync(join(PROFILE, 'pnpm-lock.yaml'))) {
  copyFileSync(join(PROFILE, 'pnpm-lock.yaml'), lockBackup);
}
console.log(`  已备份 → ${backup.split(sep).pop()}`);
console.log(`  pnpm：${pnpmSpec}（profile 声明：${declared || '未声明'}）`);

const pnpm = (argv) =>
  execFileSync('npx', ['--yes', pnpmSpec, '--dir', PROFILE, ...argv], {
    cwd: PROFILE,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
  });

try {
  pnpm(['add', '-w', `file:${tgz}`]);
  console.log('  pnpm add 完成');
} catch (error) {
  console.error('  pnpm add 失败：');
  console.error(String(error.stdout || '').slice(-2000));
  console.error(String(error.stderr || '').slice(-2000));
  process.exit(1);
}

/* 关键：装了依赖 ≠ 会加载。profile 的 `dsh.profile.bundles` 才是「哪些包作为 bundle 加载」，
   家族四个仓的 check-install.mjs 都核对这一项（bundled），但都只提示用户手工加。
   这里自动加：不改 bundles 的话，包在 node_modules 里躺着、界面里什么都不会出现。 */
step('2.5', `登记到 dsh.profile.bundles`);
{
  const profilePath = join(PROFILE, 'package.json');
  const json = JSON.parse(readFileSync(profilePath, 'utf8'));
  json.dsh ??= {};
  json.dsh.profile ??= {};
  json.dsh.profile.bundles ??= [];
  if (json.dsh.profile.bundles.includes(NAME)) {
    console.log(`  已登记，无需改动`);
  } else {
    json.dsh.profile.bundles.push(NAME);
    writeFileSync(profilePath, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`  已加入 bundles（bundles 现 ${json.dsh.profile.bundles.length} 项）`);
  }
}

/* 关键：同版本重打，pnpm 会认为「已是最新」而不重链。删掉副本目录再 install 才真换。 */
step(3, '强制重链（绕开 pnpm "Already up to date"）');
rmSync(INSTALLED, { recursive: true, force: true });
try {
  pnpm(['install']);
  console.log('  重链完成');
} catch (error) {
  console.error('  pnpm install 失败：');
  console.error(String(error.stderr || '').slice(-2000));
  process.exit(1);
}

/* ── 4. 副本 = 包里那批文件（缺或多都算失败） ─────────────────────── */
step(4, '逐文件比对包与装机副本');
/* 用 Node 自己走目录，不 shell out 给 find：沙箱里 find 会被拦成空输出，
   空输出看起来像「副本一个文件都没有」，反而掩盖真问题。 */
function walk(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(abs, base, acc);
    } else if (entry.isFile()) {
      acc.push(abs.slice(base.length + 1).split(sep).join('/'));
    }
  }
  return acc;
}
const installedFiles = walk(INSTALLED).sort();

const missing = tgzEntries.filter((file) => !installedFiles.includes(file));
const extra = installedFiles.filter((file) => !tgzEntries.includes(file));

let ok = true;
if (missing.length) {
  ok = false;
  console.log(`  ✗ 副本缺 ${missing.length} 个文件（装的是旧包 / 没重链）`);
  console.log(`      ${INSTALLED}`);
  console.log(`      包内 ${tgzEntries.length} 条 / 副本扫到 ${installedFiles.length} 条`);
  for (const file of missing.slice(0, 10)) console.log(`      - ${file}`);
} else if (extra.length) {
  ok = false;
  console.log(`  ✗ 副本多出 ${extra.length} 个文件（残留没清干净）：`);
  for (const file of extra.slice(0, 10)) console.log(`      + ${file}`);
} else {
  console.log(`  ✓ ${tgzEntries.length} 个文件逐个对上`);
}

const installedVersion = JSON.parse(readFileSync(join(INSTALLED, 'package.json'), 'utf8')).version;
if (installedVersion !== VERSION) {
  ok = false;
  console.log(`  ✗ 版本不符：仓库 ${VERSION} / 副本 ${installedVersion}`);
}

/* 内容也对一遍：同版本重打时文件名与版本都相同，只有内容能证明换没换 */
const CONTENT_CHECK = ['dsh/index.js', 'dsh/workbench.js', 'lib/client.js', 'lib/version.js', 'public/app.js'];
let contentDiff = 0;
for (const rel of CONTENT_CHECK) {
  const a = join(ROOT, rel);
  const b = join(INSTALLED, rel);
  if (!existsSync(a) || !existsSync(b)) continue;
  if (sha256(a) !== sha256(b)) {
    contentDiff += 1;
    console.log(`  ✗ 内容不一致：${rel}`);
  }
}
if (contentDiff === 0) console.log(`  ✓ 抽检 ${CONTENT_CHECK.length} 个关键文件内容一致`);
else ok = false;

/* 冒烟：入口文件能在副本里被解析（探针会做全量模块图，这里先给一句） */
for (const entry of ['dsh/index.js', 'dsh/server.js']) {
  if (!existsSync(join(INSTALLED, entry))) {
    ok = false;
    console.log(`  ✗ 入口缺失：${entry}`);
  }
}

if (!ok) {
  console.log('\n副本与包不一致，探针结果不可信，先修安装再来。');
  process.exit(1);
}

/* ── 5. 对装机副本跑探针 ─────────────────────────────────────────────── */
if (NO_PROBE) {
  console.log('\n[5/5] 已跳过探针（--no-probe）。');
  process.exit(0);
}

step(5, '对装机副本跑装机探针');
const probe = spawnSync(process.execPath, [join(ROOT, 'scripts', 'probe-install.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, UROPAL_PKG: INSTALLED, NODE_OPTIONS: '' },
});
process.exit(probe.status ?? 1);
