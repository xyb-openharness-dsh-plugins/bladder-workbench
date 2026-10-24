#!/usr/bin/env node
/**
 * 检查器 3/5：装机前检查（本地静态） + DSH Desktop profile 只读核对。
 *
 * 为什么把两件事放一起、又必须分开报：
 * M5 阶段还没有真实装机（M6 才做），但"装了打不开"的原因大多在打包前就能查出来：
 * files 白名单漏目录、npm pack 没带上入口文件、凭据文件被顺手打进 tgz。
 * 这三条是**本地就能确定**的事实，必须现在查；
 * 而"Desktop 是否真的加载了本包"必须读用户机器上的 Harness profile，
 * 没接入就**不能算通过**——所以这里明确打印"未接入 DSH，跳过"，
 * 并用专门的退出码把它和失败区分开，杜绝"跳过被当成绿灯"。
 *
 * 退出码（三个码都有明确含义，不要合并）：
 *   0 = 本地静态检查全过 **且** Desktop 装机核验通过
 *   1 = 有硬失败（本地静态不过，或"依赖装了但没进 bundles"这种确定故障）
 *   2 = 本地静态检查全过，但装机核验未做（未接入 DSH / 本包尚未登记，跳过）
 *      —— 2 不是失败，是"未验证"。接到 `npm run check` 里时应视为待办提醒。
 *
 * 这个脚本**只读**，不写任何文件、不装任何东西；装包命令只在需要时打印出来给人看。
 *
 * 用法：
 *   node scripts/check-install.mjs
 *   node scripts/check-install.mjs --home <harness 目录> --profile <profile 名>
 */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
let REAL_ROOT = ROOT;
try {
  REAL_ROOT = realpathSync(ROOT); // 根目录可能是软链（macOS /tmp），越界判定要用真实路径
} catch {
  /* 根目录不存在时留给后面的读取报错 */
}

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? resolve(args[i + 1]) : null;
}

const failures = []; // 硬失败
const warnings = []; // 提示
const lines = []; // 报告正文
const fail = (m) => {
  failures.push(m);
  lines.push(`  ✗ ${m}`);
};
const warn = (m) => {
  warnings.push(m);
  lines.push(`  ⚠ ${m}`);
};
const okLine = (m) => lines.push(`  ✓ ${m}`);

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.name;

// ───────────────────────── ① files 白名单逐项存在 ─────────────────────────
lines.push(`▶ ① files 白名单逐项存在（${Array.isArray(pkg.files) ? pkg.files.length : 0} 项）`);
if (!Array.isArray(pkg.files)) {
  fail('package.json 的 files 不是数组');
} else {
  for (const entry of pkg.files) {
    const rel = String(entry).replace(/^\.\//, '');
    const abs = resolve(REAL_ROOT, rel);
    const relBack = relative(REAL_ROOT, abs);
    if (!relBack || relBack.startsWith('..') || isAbsolute(relBack)) {
      fail(`files 项越出仓库边界：${rel}`);
      continue;
    }
    if (!existsSync(abs)) {
      // 声明了却不存在 = 打包时会静默少一个目录（npm 不报错），装出来就是缺文件。
      const hint = rel === 'public' ? '（业务页面目录，由 public/ 子任务产出；未就绪时本项即为失败）' : '';
      fail(`files 声明了「${rel}」但仓库里不存在——打包会静默少这一项${hint}`);
      continue;
    }
    let st;
    try {
      st = lstatSync(abs);
    } catch (e) {
      fail(`files 项读不了：${rel}（${e.message}）`);
      continue;
    }
    if (st.isDirectory()) {
      let n = 0;
      try {
        n = readdirSync(abs, { recursive: true }).length;
      } catch {
        n = 0;
      }
      if (n === 0) fail(`files 项「${rel}」是空目录，实际什么都没打包`);
      else okLine(`${rel}/（目录，${n} 个条目）`);
    } else if (st.isFile()) {
      okLine(`${rel}（${st.size} 字节）`);
    } else {
      warn(`files 项既不是文件也不是目录：${rel}`);
    }
  }
}

// ───────────────────── ② npm pack --dry-run 覆盖必需项 ─────────────────────
lines.push('');
lines.push('▶ ② npm pack --dry-run 清单（真实打包结果的静态预演）');
// 必需项来自"宿主怎么加载这个包"：清单、版本、入口、客户端 bundle、patch、说明文件。
const requiredInPack = [
  'package.json',
  'VERSION',
  typeof pkg.main === 'string' ? pkg.main.replace(/^\.\//, '') : null,
  typeof pkg.exports?.['./client'] === 'string' ? pkg.exports['./client'].replace(/^\.\//, '') : null,
  typeof pkg.dsh?.bundle?.patch === 'string' ? pkg.dsh.bundle.patch.replace(/^\.\//, '') : null,
  'README.md',
  'NOTICE.md',
].filter(Boolean);
// 至少各带一个文件的目录前缀（业务页面在 public/，没有它装机后就是空白页）。
const requiredPrefixes = ['dsh/', 'lib/', 'public/'];

let packed = null;
{
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error || res.status !== 0) {
    fail(`npm pack --dry-run 跑不起来（${res.error?.message || `退出码 ${res.status}`}）`);
    if (res.stderr) lines.push(`      ${res.stderr.trim().split('\n').slice(0, 3).join('\n      ')}`);
  } else {
    try {
      const parsed = JSON.parse(res.stdout);
      packed = Array.isArray(parsed) ? parsed[0] : parsed;
    } catch (e) {
      fail(`npm pack --dry-run --json 的输出不是 JSON：${e.message}`);
    }
  }
}

const packedPaths = new Set((packed?.files || []).map((f) => f.path));
if (packed) {
  okLine(`打包清单 ${packedPaths.size} 个文件（${packed.filename}，${packed.unpackedSize} 字节解包）`);
  if (packed.name !== NAME) fail(`打包出的包名是 ${packed.name}，与 package.json 的 ${NAME} 不一致`);
  if (packed.version !== pkg.version) fail(`打包出的版本是 ${packed.version}，与 package.json 的 ${pkg.version} 不一致`);
  const missing = requiredInPack.filter((p) => !packedPaths.has(p));
  if (missing.length > 0) fail(`打包清单缺必需文件：${missing.join('、')}`);
  else okLine(`必需文件齐备（${requiredInPack.join('、')}）`);
  for (const prefix of requiredPrefixes) {
    const n = [...packedPaths].filter((p) => p.startsWith(prefix)).length;
    if (n === 0) fail(`打包清单里 ${prefix} 下一个文件都没有——装机后这块功能是空的`);
    else okLine(`${prefix} 下带上了 ${n} 个文件`);
  }
  // 白名单里声明了、但打包清单里一个文件都没有的项：多半是空目录或全被 .npmignore 挡了。
  if (Array.isArray(pkg.files)) {
    for (const entry of pkg.files) {
      const rel = String(entry).replace(/^\.\//, '').replace(/\/$/, '');
      const hit = [...packedPaths].some((p) => p === rel || p.startsWith(`${rel}/`));
      if (!hit) warn(`files 里的「${rel}」在打包清单里没有对应文件（空目录，或被 ignore 规则挡住）`);
    }
  }
}

// ───────────────────────── ③ 包内不许出现凭据 ─────────────────────────
lines.push('');
lines.push('▶ ③ 凭据文件扫描（打进 tgz 的凭据会随包分发，属于安全事故）');
// 文件名黑名单：覆盖常见密钥/令牌/凭据落点（含本项目 .gitignore 里排除的那些目录）。
const CREDENTIAL_PATH_PATTERNS = [
  { re: /(^|\/)\.env(\.|$)/, why: '.env 环境变量文件' },
  { re: /(^|\/)\.envrc$/, why: 'direnv 配置（常含密钥）' },
  { re: /(^|\/)\.npmrc$/, why: 'npm 配置（常含 _authToken）' },
  { re: /(^|\/)\.netrc$/, why: 'netrc 凭据' },
  { re: /(^|\/)\.git-credentials$/, why: 'Git 凭据' },
  { re: /(^|\/)(\.secrets|_secrets|_private)(\/|$)/, why: '密钥目录（仓库约定）' },
  { re: /\.(pem|key|p12|pfx|keystore|jks|ppk)$/i, why: '私钥/证书文件' },
  { re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.|$)/, why: 'SSH 私钥' },
  { re: /(^|\/)(credentials|auth)(\.json)?$/i, why: '凭据 JSON' },
  { re: /(^|\/)secrets?\.json$/i, why: '密钥文件' },
  { re: /\.tgz$/, why: '打包产物（不该再套一层）' },
];
// 文件名可疑但**有正当用途**的：只提示，且能用内容自证清白。
// assets/tokens.json 就是活例子——它是本项目的设计 token（W3C DTCG 格式，带 $type/$value），
// 早期版本把它当"令牌文件"直接判失败，是误报。
const SUSPECT_NAME_PATTERNS = [
  { re: /(^|\/)[^/]*tokens?\.json$/i, why: '文件名像令牌文件' },
  { re: /(^|\/)[^/]*secret[^/]*$/i, why: '文件名像密钥文件' },
];
// 内容兜底：只扫小体积文本文件（跳过 PDF/PNG 等），看有没有真密钥字面量。
const CONTENT_SUSPECTS = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: '内嵌私钥' },
  {
    // 要求 `KEY = "真值"` 形式且值看起来像真密钥；占位符/环境变量引用一律放行。
    re: /(API_KEY|APIKEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET_KEY|CLIENT_SECRET|_TOKEN|PASSWORD)\s*[:=]\s*['"]([^'"\s]{12,})['"]/,
    why: '疑似硬编码密钥字面量',
  },
  {
    // JSON 形式：{"apiKey": "...."} / {"access_token": "...."}，值同样要求够长。
    re: /"(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password)"\s*:\s*"([^"]{12,})"/i,
    why: '疑似硬编码密钥字面量（JSON）',
  },
];
const PLACEHOLDER = /your|xxx|example|placeholder|changeme|placeholder|dummy|sample|<|>|\$\{|process\.env|\bTODO\b/i;
const TEXTY = new Set(['.md', '.json', '.yml', '.yaml', '.js', '.mjs', '.cjs', '.css', '.html', '.sql', '.txt', '.svg', '.ts']);

function scanCredentials(paths) {
  const hits = [];
  for (const p of paths) {
    for (const { re, why } of CREDENTIAL_PATH_PATTERNS) {
      if (re.test(p)) hits.push({ file: p, why, hard: true });
    }
    const dot = p.lastIndexOf('.');
    const ext = dot < 0 ? '' : p.slice(dot).toLowerCase();
    if (!TEXTY.has(ext)) continue;
    const abs = resolve(REAL_ROOT, p);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > 512 * 1024) continue; // 大文件多半是资源，跳过避免慢
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue; // 二进制伪装成文本
    // 可疑文件名：能被内容自证（W3C 设计 token 带 $type/$value）就放行，否则提示。
    for (const { re, why } of SUSPECT_NAME_PATTERNS) {
      if (!re.test(p)) continue;
      if (/"\$value"\s*:/.test(text)) continue; // 设计 token，不是凭据
      hits.push({ file: p, why, hard: false });
    }
    for (const { re, why } of CONTENT_SUSPECTS) {
      const m = text.match(re);
      if (!m) continue;
      const value = m[2] || '';
      if (value && PLACEHOLDER.test(value)) continue;
      hits.push({ file: p, why: `${why}${value ? `（值以 ${value.slice(0, 4)}… 开头）` : ''}`, hard: true });
    }
  }
  return hits;
}

if (packed) {
  const hits = scanCredentials(packedPaths);
  const hard = hits.filter((h) => h.hard);
  const soft = hits.filter((h) => !h.hard);
  if (hard.length === 0 && soft.length === 0) {
    okLine(`打包清单 ${packedPaths.size} 个文件，文件名与内容均未见凭据迹象`);
  } else {
    for (const h of hard) fail(`包内含凭据迹象：${h.file}（${h.why}）`);
    for (const h of soft) warn(`文件名像凭据但内容不像：${h.file}（${h.why}）——请人工确认一次`);
  }
} else {
  warn('打包清单没拿到，凭据扫描未执行（未验证）');
}

// ─────────────────── ④ DSH Desktop 装机核对（未接入则跳过） ───────────────────
lines.push('');
lines.push('▶ ④ DSH Desktop 装机核对');

function appSupportRoot() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

/** 候选 Harness：先 Desktop app 自己的，再 DSH_HOME，最后 CLI 侧（只用于提示"装错地方"）。 */
function candidates() {
  const explicitHome = argValue('--home');
  const explicitProfile = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : null;
  if (explicitHome) {
    return [{ label: '手动指定（--home）', home: explicitHome, profile: explicitProfile || 'web', live: true }];
  }
  const list = [];
  const appHome = join(appSupportRoot(), 'dsh-desktop', 'harness');
  list.push({
    label: 'DSH Desktop Harness（app 自带）',
    home: appHome,
    profile: explicitProfile || 'web',
    live:
      existsSync(join(appHome, 'desktop-workbenches', 'state.json')) ||
      existsSync(join(appHome, 'desktop-workbenches', 'market-installs.json')),
  });
  if (process.env.DSH_HOME) {
    list.push({ label: 'DSH_HOME 环境变量', home: resolve(process.env.DSH_HOME), profile: explicitProfile || 'web' });
  }
  const cliHome = join(homedir(), '.dsh');
  list.push({ label: 'CLI Harness（Desktop 不读）', home: cliHome, profile: 'web' });
  return list;
}

function readProfile(home, profile) {
  const file = join(home, 'profiles', profile, 'package.json');
  if (!existsSync(file)) return null;
  try {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    return {
      file,
      dep: json.dependencies?.[NAME] ?? null,
      bundled: (json.dsh?.profile?.bundles ?? []).includes(NAME),
    };
  } catch (error) {
    return { file, error: error.message };
  }
}

function marketRecord(home) {
  const file = join(home, 'desktop-workbenches', 'market-installs.json');
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const repo = String(pkg.repository?.url || pkg.repository || '')
      .replace(/^git\+/, '')
      .replace(/\.git$/, '');
    return (
      Object.values(data.installs || {}).find(
        (item) => item.pluginName === NAME || (repo && item.catalogId && repo.toLowerCase().endsWith(String(item.catalogId).toLowerCase())),
      ) || null
    );
  } catch {
    return null;
  }
}

const all = candidates().map((c) => ({ ...c, entry: readProfile(c.home, c.profile) }));
const live =
  all.find((c) => c.live === true) ||
  all.find((c) => c.label.startsWith('DSH Desktop') && c.entry) ||
  all.find((c) => c.label.startsWith('DSH_HOME') && c.entry) ||
  null;

let installVerified = false; // 只有"真的查到已登记"才是 true
let installSkipped = false; // 未接入 / 尚未安装：算「未验证」，不算失败

if (!live) {
  // M5 现实：宿主 Harness 还没出现（没装过 DSH Desktop，或还没启动过一次）。
  // 如实说"跳过"，并且**不**把 ④ 算成通过。
  installSkipped = true;
  lines.push('  ⋯ 未接入 DSH，跳过');
  lines.push(`      （没找到 DSH Desktop 的 Harness：${join(appSupportRoot(), 'dsh-desktop', 'harness')}）`);
  lines.push('      这一节的结论是「未验证」，不是「通过」——装机核验要等 M6 拿到真实装机环境。');
} else {
  lines.push(`  判定基准：${live.label} → ${join(live.home, 'profiles', live.profile)}`);
  const entry = live.entry;
  if (!entry) {
    installSkipped = true;
    lines.push('  ⋯ 未接入 DSH，跳过');
    lines.push(`      （这个 profile 下还没有 package.json：${join(live.home, 'profiles', live.profile, 'package.json')}）`);
  } else if (entry.error) {
    fail(`package.json 读不了：${entry.error}`);
  } else if (!entry.dep) {
    // 「还没装」不是缺陷：M6 才装机。这里只声明"未验证"，并打印装包命令。
    installSkipped = true;
    lines.push('  ⋯ 未接入 DSH，跳过（本包尚未登记到该 profile；装机按计划在 M6）');
    lines.push('      这一节的结论是「未验证」，不是「通过」。');
  } else if (!entry.bundled) {
    // 「装了但没进 bundles」才是真故障：依赖在、宿主不加载，界面永远不出现。
    fail(`依赖装了（${entry.dep}）但 dsh.profile.bundles 里没有 ${NAME}——装了不加载`);
  } else {
    installVerified = true;
    okLine(`${NAME} 已登记到 Desktop 实际加载的 profile（${entry.dep}）`);
    const rec = marketRecord(live.home);
    if (rec) okLine(`市场安装记录：${rec.catalogId} · ${rec.version} · ${rec.source}`);
    else warn('无市场安装记录：属手工/native 安装，市场里可能不显示「已安装」');
  }
}

for (const c of all) {
  if (c === live || !c.entry?.dep) continue;
  warn(`另在「${c.label}」也装了（${c.entry.dep}）——那是另一份 Harness，不能替 Desktop 验收`);
}

if (live && !installVerified) {
  lines.push('');
  lines.push('  装包命令（目标版本明确支持本地 tgz 时才用；先查 `dsh plugin add --help`）：');
  lines.push(`    export DSH_HOME="${live.home}"`);
  lines.push(`    export PATH="$DSH_HOME/.desktop-bin:$PATH"   # 用 app 自带的 pnpm / node`);
  lines.push(
    `    NODE_OPTIONS= npx --yes pnpm@10.15.0 --dir "$DSH_HOME/profiles/${live.profile}" add -w ./release/<包名>-<版本>.tgz`,
  );
  lines.push(`    再把 ${NAME} 加进 "$DSH_HOME/profiles/${live.profile}/package.json" 的 dsh.profile.bundles，重启 Harness。`);
  lines.push('  不要装到 ~/.dsh/profiles/*——Desktop 不读那里，装上也只是「配置层有了」。');
}

// ───────────────────────────────── 结论 ─────────────────────────────────
const staticPass = failures.length === 0;
lines.push('');
if (!staticPass) {
  lines.push(`✗ 本地静态检查未通过：${failures.length} 个错误`);
  for (const f of failures) lines.push(`    ✗ ${f}`);
} else {
  lines.push(`✓ 本地静态检查通过（${warnings.length} 条提示）`);
}
if (staticPass && !installVerified) {
  lines.push(
    installSkipped
      ? '⋯ 装机核验：未验证（未接入 DSH，跳过）→ 退出码 2（不是通过）'
      : '⋯ 装机核验：未验证 → 退出码 2（不是通过）',
  );
} else if (installVerified) {
  lines.push('✓ 装机核验：已登记到 Desktop 实际加载的 profile → 退出码 0');
}

console.log(lines.join('\n'));
process.exit(staticPass ? (installVerified ? 0 : 2) : 1);
