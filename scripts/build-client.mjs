#!/usr/bin/env node
/**
 * 生成 lib/client.js（DSH 客户端入口）。
 *
 * 官方要求客户端必须是「已构建好的单文件」——Desktop 不会替我们打包
 * （workbench-standard §3.5）。本项目的界面本来就是零依赖的原生 ES Module，
 * 没有一个打包器要跑，所以这个"构建"只做一件事：把常量注入 `src/client.js`。
 *
 * 为什么是生成而不是手抄：面板参数（customFrame / 0.65 / 会话 25%–45%）、挂载路径、
 * 版本号、仓库地址都各自只有一份来源（lib/layout.js、lib/routes.js、VERSION、package.json）。
 * 手抄一份进客户端就会漂移，改成生成后由 `npm run check` 的 `--check` 兜住。
 *
 * 用法：
 *   node scripts/build-client.mjs           写入（内容没变不落盘）
 *   node scripts/build-client.mjs --check   只校验，与来源不一致时退出码 1
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'src', 'client.js')
const target = join(root, 'lib', 'client.js')
const checkOnly = process.argv.includes('--check')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { PANEL, AGENT_PANE, assertPanelConfig } = await import('../lib/layout.js')
const { HOST_BASE, UI_ENTRY, HEALTH_PATH } = await import('../lib/routes.js')
const { version } = await import('../lib/version.js')

/** 仓库地址规范化成 https://github.com/<owner>/<repo>，去掉 .git 与 SSH 前缀。 */
function canonicalRepository(raw) {
  const url = typeof raw === 'string' ? raw : raw?.url
  if (!url) return ''
  let text = String(url).trim()
  if (text.startsWith('git@')) text = text.replace(/^git@([^:]+):/, 'https://$1/')
  text = text.replace(/^git:\/\//, 'https://').replace(/\.git$/, '')
  return text.replace(/\/+$/, '')
}

const repository = canonicalRepository(pkg.repository)
if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repository)) {
  console.error(`✗ package.json 的 repository 不是可用的 GitHub 地址：${pkg.repository?.url ?? pkg.repository ?? '（未填）'}`)
  console.error('  客户端 register() 必填它，Desktop 由它派生 owner/repo。填好再跑一次。')
  process.exit(1)
}

const problems = []
if (!pkg.name) problems.push('package.json 缺少 name')
// 布局参数交给 lib/layout.js 自检（含 customFrame 与会话宽度区间），这里不再抄第二份判据
for (const problem of assertPanelConfig(PANEL, AGENT_PANE)) problems.push(problem)
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`)
  process.exit(1)
}

const replacements = {
  __PKG_NAME__: pkg.name,
  __REPOSITORY__: repository,
  // 路径从 lib/routes.js 来：客户端与服务端同源，避免"两边各写一份前缀"。
  __API_PREFIX__: HOST_BASE,
  __HEALTH_PATH__: HEALTH_PATH,
  __UI_ENTRY__: UI_ENTRY,
  __VERSION__: version,
  __BUSINESS_SIDE__: PANEL.businessSide,
  __BUSINESS_WIDTH__: String(PANEL.businessWidth),
  __CUSTOM_FRAME__: String(PANEL.customFrame === true),
  // customFrame 下会话面板宽度由我们自己排版，下面几个值都来自 lib/layout.js。
  // 注意注入的是**比例**（0.35 / 0.25 / 0.45 / 0.02）：客户端里直接加到 width 上。
  // storageKey 也一并注入：GBM 参考实现里 lib/layout.js 声明了 storageKey，客户端却另写
  // 一个键（'...agent-pane.v1'），结果声明的那个键是死代码。这里统一从布局参数注入。
  __AGENT_DEFAULT__: String((AGENT_PANE.default ?? AGENT_PANE.def) / 100),
  __AGENT_MIN__: String(AGENT_PANE.min / 100),
  __AGENT_MAX__: String(AGENT_PANE.max / 100),
  __AGENT_STEP__: String(AGENT_PANE.ratioStep),
  __NARROW_BELOW__: String(AGENT_PANE.narrowBelowPx),
  __DRAWER_MAX__: String(AGENT_PANE.drawerMaxPx),
  __AGENT_STORAGE_KEY__: AGENT_PANE.storageKey,
}

const header = `/* 本文件由 scripts/build-client.mjs 从 src/client.js 生成，请勿手改。\n`
  + ` * 改客户端源码请改 src/client.js 后运行 npm run build:client。\n`
  + ` * 包名 ${pkg.name} · 仓库 ${repository}\n`
  + ` * 面板 customFrame=${PANEL.customFrame === true} · 业务 ${PANEL.businessSide} ${PANEL.businessWidth}\n`
  + ` * AI 会话可拖宽度 ${AGENT_PANE.min}–${AGENT_PANE.max}%（默认 ${AGENT_PANE.default ?? AGENT_PANE.def}）\n`
  + ` */\n`

let generated = header + readFileSync(source, 'utf8')
for (const [token, value] of Object.entries(replacements)) {
  generated = generated.split(token).join(value)
}

// 替换完再找一遍：有残留说明源码里写了个没人认领的占位，静默留着会在浏览器里变成 undefined
const leftover = [...new Set([...generated.matchAll(/__[A-Z_]+__/g)].map((m) => m[0]))]
if (leftover.length) {
  console.error(`✗ src/client.js 里有未替换的占位：${leftover.join(', ')}`)
  console.error(`  已在替换表里的：${Object.keys(replacements).join(', ')}`)
  process.exit(1)
}

if (checkOnly) {
  if (!existsSync(target)) {
    console.error('✗ 缺少 lib/client.js，请先运行 npm run build:client')
    process.exit(1)
  }
  if (readFileSync(target, 'utf8') !== generated) {
    console.error('✗ lib/client.js 与来源不同步，请运行 npm run build:client')
    process.exit(1)
  }
  console.log(`✓ lib/client.js 与来源同步（${pkg.name} · customFrame=${PANEL.customFrame === true} · 会话 ${AGENT_PANE.min}–${AGENT_PANE.max}%）`)
  process.exit(0)
}

if (existsSync(target) && readFileSync(target, 'utf8') === generated) {
  console.log(`= lib/client.js 未变化（v${version} · ${pkg.name}）`)
  process.exit(0)
}

writeFileSync(target, generated)
console.log(`✓ 已生成 lib/client.js（v${version} · ${pkg.name} · customFrame=${PANEL.customFrame === true} · 会话 ${AGENT_PANE.min}–${AGENT_PANE.max}%）`)
