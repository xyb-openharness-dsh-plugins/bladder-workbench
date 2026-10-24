#!/usr/bin/env node
// 检查器脚本 4/5：独立启动开发版，供人工在浏览器里点着看（npm start）。
//
// 为什么需要一个独立服务器，而不是只依赖 DSH 宿主：
// 宿主里的界面要过"构建 → 打包 → 装进 profile → 重启 Harness"四道门，
// 改一行文案就得走一遍；开发阶段需要一条"直接看到 public/ 业务页"的短路径。
// 所以这里用 runtime:'standalone' + basePath:'' 起一个干净的本机服务。
//
// 端口占用为什么必须自己处理：
// dsh/server.js 的 listen() 只在成功回调里 resolve，没有挂 error 监听——
// EADDRINUSE 时那个 Promise 永远不会 settle，进程既不起服务也不报错，
// 表面看就是"卡住"。所以先自己探一次端口，占用就明确告警并改用系统分配端口；
// 同时给 listen 套超时兜底，把"静默卡住"变成"看得见的错误"。
//
// 只绑 127.0.0.1，不接受外部地址：这是患者本机数据，不开局域网口。
//
// 用法：
//   npm start
//   PORT=8899 npm start
//   node scripts/dev-server.mjs --port 8791 --workspace ./workspace --strict-port
// 退出：Ctrl-C（SIGINT/SIGTERM 都会优雅关闭，并打印实际监听的端口）

import { createServer } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWorkbenchServer } from '../dsh/server.js';
import { DB_FILE } from '../dsh/workbench.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1'; // 只绑回环
const DEFAULT_PORT = 8791; // 与家族其他工作台错开，避免多个工作台同时开发时抢端口

// 版本号用于打印，与业务页显示同一个来源（lib/version.js 由构建脚本生成）。
// 用动态 import + try：version.js 还没生成时不该让开发服务器起不来，只是少一行信息。
let versionLabel = '版本未生成';
try {
  const mod = await import('../lib/version.js');
  const info = mod.APP_INFO || {};
  versionLabel = [info.displayVersion, info.channelLabel].filter(Boolean).join(' · ') || versionLabel;
} catch {
  versionLabel = '版本未生成（先跑 npm run build:version）';
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`小泉宝 UroPal 开发服务器

用法：node scripts/dev-server.mjs [选项]
  --port <n>        监听端口（默认 ${DEFAULT_PORT}，也可用 PORT 环境变量）
  --workspace <dir> 资料目录（默认 <包内>/workspace）
  --strict-port     端口被占用时直接退出，不自动换端口
  --help            显示本说明
`);
  process.exit(0);
}

const strictPort = process.argv.includes('--strict-port');
const workspaceDir = resolve(argValue('--workspace') || join(ROOT, 'workspace'));
const dbPath = join(workspaceDir, DB_FILE);
const rawPort = argValue('--port') ?? process.env.PORT ?? String(DEFAULT_PORT);
const requestedPort = Number(rawPort);

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  console.error(`✗ 端口不合法：${rawPort}（应为 0–65535 的整数）`);
  process.exit(1);
}

/** 探一下端口能不能绑。占用与无权限都返回 false——两者都只能换端口，处理方式一样。 */
function isPortFree(port, host) {
  return new Promise((ok) => {
    const probe = createServer();
    probe.once('error', () => ok(false));
    probe.once('listening', () => probe.close(() => ok(true)));
    probe.listen(port, host);
  });
}

/** 给可能永远不 settle 的 Promise 加超时，避免开发服务器"静静地卡死"。 */
function withTimeout(promise, ms, label) {
  return new Promise((ok, no) => {
    const timer = setTimeout(() => no(new Error(`${label} 超过 ${Math.round(ms / 1000)} 秒没有响应`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        ok(v);
      },
      (e) => {
        clearTimeout(timer);
        no(e);
      },
    );
  });
}

// 资料目录要先建出来：sqlite 首次打开不会替我们创建多级目录。
mkdirSync(workspaceDir, { recursive: true });

const app = createWorkbenchServer({
  root: workspaceDir,
  dbPath,
  basePath: '',
  apiBase: '',
  runtime: 'standalone',
});

let port = requestedPort;
if (port !== 0 && !(await isPortFree(port, HOST))) {
  if (strictPort) {
    console.error(`✗ 端口 ${port} 已被占用（--strict-port 要求原样启动）。`);
    console.error(`  换端口重试：npm start -- --port ${port + 1}；或先结束占用该端口的进程。`);
    process.exit(1);
  }
  // 自动换端口比"报错退出"更适合开发场景：人工看的是终端里打印出来的地址，
  // 端口变了也不会找错地方；但必须显式告警，不能悄悄换。
  console.error(`! 端口 ${port} 已被占用，改用系统分配的临时端口（要固定端口请先释放它，或加 --strict-port）。`);
  port = 0;
}

let server;
try {
  server = await withTimeout(app.listen(port, HOST), 5000, '监听端口');
} catch (error) {
  console.error(`✗ 开发服务器启动失败：${error.message}`);
  console.error('  常见原因：端口被占用（同一端口上已有其它实例）、或 public/ 静态目录读取异常。');
  process.exit(1);
}

const address = server.address();
const actualPort = address && typeof address === 'object' ? address.port : port;
const url = `http://${HOST}:${actualPort}/`;

console.log('');
console.log(`小泉宝 UroPal 本机工作台（${versionLabel}）：${url}`);
console.log(`  运行模式：standalone（不经过 DSH 宿主）`);
console.log(`  资料目录：${workspaceDir}`);
console.log(`  业务库：  ${dbPath}`);
console.log(`  健康检查：${url}api/health`);
// public/ 缺失时首页会回 404 JSON——提前说清楚，省得人工以为服务没起来。
if (!existsSync(join(ROOT, 'public', 'index.html'))) {
  console.log('  ! public/index.html 还不存在：打开首页会返回 404 JSON（业务页面由 public/ 子任务产出）。');
}
console.log('  按 Ctrl-C 退出');
console.log('');

server.on('error', (error) => {
  console.error(`✗ 服务器运行中出错：${error.message}`);
});

// 优雅退出：先停止接收新连接，再退出。开发时可能反复 Ctrl-C，所以要幂等。
let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n收到 ${signal}，正在关闭开发服务器（端口 ${actualPort}）…`);
  server.close(() => {
    console.log('已关闭。');
    process.exit(0);
  });
  // close 回调被长连接（比如浏览器 keep-alive）拖住时兜底强退，不让 Ctrl-C 看起来没反应。
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
