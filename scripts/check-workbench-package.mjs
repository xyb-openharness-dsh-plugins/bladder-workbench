#!/usr/bin/env node
// 检查器 2/5：工作台包契约检查（package.json + cordis.patch.yml + dsh/workbench.js）。
//
// 为什么必须有这个脚本：
// DSH Desktop 是靠"包清单 + patch 文件 + 插件 id"三件套把工作台插进宿主的。
// 这三处任何一处对不上（版本号没同步、files 白名单漏了目录、patch id 与
// PLUGIN_ID 差一个字符），本地一切正常、装到 Desktop 上却静默不加载——
// 这类故障只能在装机现场发现，代价极高。所以在打包前用纯静态检查挡住。
//
// 用法：
//   node scripts/check-workbench-package.mjs [仓库根目录] [--json]
// 退出码：0 = 契约成立；1 = 有 error（warning 不阻断）。

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

// 本项目的身份常量：写死在这里是有意的——契约检查的价值就在"期望值不许跟着实测走"，
// 如果从被检对象里读期望值，改坏了包名也能"通过"。
const EXPECTED_NAME = '@xyb-community/bladder-workbench';
const EXPECTED_MAIN = './dsh/index.js';
const EXPECTED_PLATFORM = 'web';
// files 白名单必须覆盖的项目符号（任务 §2.4 交付清单）。
const REQUIRED_FILES = ['dsh', 'lib', 'public', 'assets', 'cordis.patch.yml', 'README.md', 'NOTICE.md'];
// exports 必须提供这 4 个子路径：宿主入口、客户端 bundle、清单、patch。
const REQUIRED_EXPORTS = ['.', './client', './package.json', './cordis.patch.yml'];

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const rootArg = argv.find((a) => !a.startsWith('--'));
const ROOT = resolve(rootArg || '.');
// 根目录本身可能是软链（macOS 的 /tmp → /private/tmp 就是），
// 若拿未解析的 ROOT 去和 realpath 后的文件比，整棵树都会被误判成"越界"。
// 所以先把 ROOT 规范化，越界判定一律在真实路径上做。
let REAL_ROOT = ROOT;
try {
  REAL_ROOT = realpathSync(ROOT);
} catch {
  /* 根目录不存在时保留原值，后面的读取自然会报错 */
}

const errors = [];
const warnings = [];
const checks = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
/** 记一条契约判定：ok=true/false，同时把不 ok 的升级成 error。 */
const assert = (label, ok, detail) => {
  checks.push({ label, ok: !!ok, detail: detail || '' });
  if (!ok) err(detail ? `${label}：${detail}` : label);
  return !!ok;
};

/** 把包内相对路径解析成绝对路径，同时挡住越界与符号链接逃逸。
 *  为什么不用简单的 join：一个 `files: ["../../.ssh"]` 或指向仓库外的软链，
 *  会让"文件存在"的检查在包外通过，等于没查。 */
function internal(relPath) {
  const abs = resolve(REAL_ROOT, relPath);
  const rel = relative(REAL_ROOT, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  if (!existsSync(abs)) return null;
  let real = abs;
  try {
    real = realpathSync(abs);
  } catch {
    return null;
  }
  const relReal = relative(REAL_ROOT, real);
  if (relReal.startsWith('..') || isAbsolute(relReal)) return null; // 链接指向仓库外
  return real;
}

function readInside(relPath) {
  const abs = internal(relPath);
  if (!abs) return null;
  try {
    if (!lstatSync(abs).isFile()) return null;
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

/** 极简 patch 解析：本项目 patch 只有 `- insert: / - id: / name:` 三行结构，
 *  引第三方 YAML 库不值得（本项目硬约束是零第三方依赖），
 *  所以按行取字段，取不到就报错而不是猜。 */
function parsePatch(text) {
  const unq = (s) => s.trim().replace(/^["']|["']$/g, '');
  const ids = [...text.matchAll(/^[ \t]*-[ \t]*id:[ \t]*(.+?)[ \t]*$/gm)].map((m) => unq(m[1]));
  const names = [...text.matchAll(/^[ \t]*name:[ \t]*(.+?)[ \t]*$/gm)].map((m) => unq(m[1]));
  return { hasInsert: /^[ \t]*-[ \t]*insert:[ \t]*$/m.test(text), ids, names };
}

// ── 1. package.json 本体 ────────────────────────────────────────────────
const pkgText = readInside('package.json');
if (!pkgText) {
  console.error(`✗ 读不到 ${join(ROOT, 'package.json')}`);
  process.exit(1);
}
let pkg;
try {
  pkg = JSON.parse(pkgText);
} catch (e) {
  console.error(`✗ package.json 不是合法 JSON：${e.message}`);
  process.exit(1);
}

assert('包名', pkg.name === EXPECTED_NAME, `期望 ${EXPECTED_NAME}，实际 ${pkg.name}`);
assert('private 标记', pkg.private === true, `期望 true，实际 ${JSON.stringify(pkg.private)}`);
assert('main 入口', pkg.main === EXPECTED_MAIN, `期望 ${EXPECTED_MAIN}，实际 ${pkg.main}`);

// ── 2. version 与根 VERSION 文件逐字一致 ────────────────────────────────
// 为什么必须逐字：Desktop 装机后会拿应用首页显示的版本号与 package.json / tag /
// 市场条目对账，两边差一个字符就是"装错版本"。只允许一个尾换行（文本文件惯例）。
{
  const versionAbs = join(ROOT, 'VERSION');
  if (!existsSync(versionAbs)) {
    assert('VERSION 文件存在', false, `缺少 ${versionAbs}`);
  } else {
    const raw = readFileSync(versionAbs, 'utf8');
    const trimmed = raw.replace(/[\r\n]+$/, '');
    assert('VERSION 与 package.json 版本逐字一致', trimmed === pkg.version, `VERSION 文件="${trimmed}"，package.json="${pkg.version}"`);
    if (trimmed === pkg.version && raw !== `${pkg.version}\n`) {
      warn(`VERSION 文件内容与「版本号 + 单个尾换行」不同（实际 ${JSON.stringify(raw)}），请确认不是多余空格`);
    }
  }
}

// ── 3. dsh 段：bundle.patch / client.platform / client.inject ───────────
const dsh = pkg.dsh || {};
const patchRel = typeof dsh?.bundle?.patch === 'string' ? dsh.bundle.patch : '';
assert('dsh.bundle.patch 已声明', !!patchRel, `实际 ${JSON.stringify(dsh?.bundle?.patch)}`);
if (patchRel) {
  assert('dsh.bundle.patch 指向的文件存在', !!(patchRel && readInside(patchRel)), `找不到 ${patchRel}`);
}
assert('dsh.client.platform', dsh?.client?.platform === EXPECTED_PLATFORM, `期望 ${EXPECTED_PLATFORM}，实际 ${JSON.stringify(dsh?.client?.platform)}`);
assert(
  'dsh.client.inject 含 dsh-desktop-workbenches',
  Array.isArray(dsh?.client?.inject) && dsh.client.inject.includes('dsh-desktop-workbenches'),
  `实际 ${JSON.stringify(dsh?.client?.inject)}`,
);

// ── 4. files 白名单覆盖必需项 ───────────────────────────────────────────
{
  const files = pkg.files;
  if (assert('files 是数组', Array.isArray(files), `实际 ${JSON.stringify(files)}`)) {
    // 目录项匹配前缀，文件项要求逐字存在（npm 的 files 语义）。
    const missing = REQUIRED_FILES.filter((need) => {
      const bare = need.endsWith('/') ? need.slice(0, -1) : need;
      return !files.some((f) => {
        const entry = String(f).replace(/^\.\//, '').replace(/\/$/, '');
        return entry === bare || entry.startsWith(`${bare}/`);
      });
    });
    assert('files 覆盖 dsh/ lib/ public/ assets/ cordis.patch.yml README.md NOTICE.md', missing.length === 0, `缺 ${missing.join('、')}`);
  }
}

// ── 5. exports 四个子路径齐备，且指向的文件真的在 ──────────────────────
{
  const exportsField = pkg.exports || {};
  const missing = REQUIRED_EXPORTS.filter((key) => !(key in exportsField));
  assert(`exports 含 ${REQUIRED_EXPORTS.join(' ')}`, missing.length === 0, `缺 ${missing.join('、')}`);
  for (const key of REQUIRED_EXPORTS) {
    const target = exportsField[key];
    const relPath = typeof target === 'string' ? target : target?.import || target?.default;
    if (typeof relPath !== 'string') continue; // 非字符串映射（条件导出）这里不做展开
    assert(`exports["${key}"] → ${relPath} 存在`, !!readInside(relPath), `找不到 ${relPath}`);
  }
  // 与 main 对齐：宿主两种解析方式都必须落到同一个文件。
  if (pkg.main && exportsField['.']) {
    assert('main 与 exports["."] 指向同一文件', pkg.main === exportsField['.'], `main=${pkg.main}，exports["."]=${exportsField['.']}`);
  }
}

// ── 6. cordis.patch.yml 的插件 id 与 dsh/workbench.js 的 PLUGIN_ID 逐字一致 ──
// 为什么不能动态 import 取 PLUGIN_ID：dsh/* 依赖 @deepseek-ai/*，本仓库没有
// node_modules，import 会直接抛模块解析错误。源码正则提取是这里唯一可行的办法，
// 提取失败要报错，不能静默跳过（静默跳过 = 这条最重要的检查形同虚设）。
{
  const workbenchSrc = readInside('dsh/workbench.js');
  if (!assert('dsh/workbench.js 可读', !!workbenchSrc)) {
    // 读不到就无从比对，后面跳过。
  } else {
    const m = workbenchSrc.match(/PLUGIN_ID\s*=\s*['"]([^'"]+)['"]/);
    const pluginId = m ? m[1] : '';
    assert('dsh/workbench.js 导出 PLUGIN_ID 常量', !!pluginId, '未找到 `PLUGIN_ID = "..."` 形式的定义');

    const patchText = patchRel ? readInside(patchRel) : null;
    if (patchText) {
      const parsed = parsePatch(patchText);
      assert(`${patchRel} 含 insert 段`, parsed.hasInsert, '未找到 `- insert:`，插件不会被登记');
      if (parsed.ids.length === 0) {
        assert('patch 含插件 id', false, '未找到 `- id:` 行');
      } else {
        if (parsed.ids.length > 1) warn(`patch 里有 ${parsed.ids.length} 个 id（${parsed.ids.join('、')}），本检查只比对第一个匹配项`);
        assert('patch 插件 id 与 PLUGIN_ID 逐字一致', pluginId ? parsed.ids.includes(pluginId) : false, `PLUGIN_ID="${pluginId}"，patch id=${JSON.stringify(parsed.ids)}`);
      }
      if (parsed.names.length > 0) {
        assert('patch insert.name 与包名逐字一致', parsed.names.includes(EXPECTED_NAME), `patch name=${JSON.stringify(parsed.names)}`);
      } else {
        warn(`patch 未声明 name 字段，无法核对插件名`);
      }
    }
  }
}

// ── 7. 家族结构检查（沿用 GBM 参考实现的几项，防止客户端 bundle 被打断） ──
// 这些不是本任务清单里的条目，但同属"装了不加载"的高发区，一并静态挡住。
{
  const clientRel = pkg.exports?.['./client'];
  const clientSrc = typeof clientRel === 'string' ? readInside(clientRel) : null;
  if (!clientSrc) {
    warn(`读不到 exports["./client"]（${clientRel}），跳过客户端 bundle 结构检查`);
  } else {
    assert('客户端 bundle 含 window.__ModuleLoader__.load(', clientSrc.includes('window.__ModuleLoader__.load('), '缺少 DSH 客户端插件装载入口');
    const idm = clientSrc.match(/window\.__ModuleLoader__\.load\(\s*\{[\s\S]{0,200}?id:\s*['"]([^'"]+)['"]/);
    assert('客户端 loader id 与包名一致', idm ? idm[1] === pkg.name : false, `loader id=${idm ? idm[1] : '(未找到)'}，包名=${pkg.name}`);
    assert('客户端 bundle 调用 ctx.effect(', clientSrc.includes('ctx.effect('), '缺少 cordis 生命周期注册');
    assert('客户端 bundle 调用 desktopWorkbenches.register(', clientSrc.includes('desktopWorkbenches.register('), '未向宿主注册工作台');
    const repo = pkg.repository?.url || pkg.repository;
    if (typeof repo === 'string' && repo) {
      assert('客户端 descriptor 的 repository 与清单一致', clientSrc.includes(repo), `bundle 中未出现 ${repo}`);
    } else {
      warn('package.json 未声明 repository，跳过一致性核对');
    }
  }

  const entrySrc = pkg.exports?.['.'] ? readInside(pkg.exports['.']) : null;
  if (entrySrc) {
    assert('宿主入口导出 Config（Schema.object）', /export\s+const\s+Config\s*=\s*Schema\./.test(entrySrc), 'DSH 靠 Config 校验工作台配置');
    assert('宿主入口 import @deepseek-ai/schemastery', entrySrc.includes('@deepseek-ai/schemastery'), '缺少 Config 的 Schema 来源');
  }

  // 依赖纪律：宿主侧能力必须走 peer，不能让工作台自带一份 @deepseek-ai/* 或 React，
  // 否则装机会出现两套运行时（表现为白屏/双实例）。
  const deps = Object.keys(pkg.dependencies || {});
  const badDeps = deps.filter((d) => d.startsWith('@deepseek-ai/') || d === 'react' || d === 'react-dom');
  assert('dependencies 不含宿主/React 依赖', badDeps.length === 0, `出现 ${badDeps.join('、')}（应放 peerDependencies）`);
}

// ── 输出 ────────────────────────────────────────────────────────────────
if (asJson) {
  console.log(
    JSON.stringify(
      {
        root: ROOT,
        package: pkg.name,
        version: pkg.version,
        checked: checks.length,
        staticPass: errors.length === 0,
        errors,
        warnings,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`▶ 工作台包契约检查 · ${pkg.name}@${pkg.version}`);
  console.log(`  根目录 ${ROOT}`);
  console.log('');
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.label}${c.ok || !c.detail ? '' : ` — ${c.detail}`}`);
  }
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log('');
  if (errors.length === 0) {
    console.log(`✓ 契约成立（${checks.length} 项检查，${warnings.length} 条提示）`);
  } else {
    console.error(`✗ 契约不成立：${errors.length} 个错误`);
    for (const e of errors) console.error(`  ✗ ${e}`);
  }
}

if (errors.length > 0) process.exitCode = 1;
