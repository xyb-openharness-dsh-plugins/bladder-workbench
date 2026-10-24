/**
 * 宿主适配层（M5）：把本机服务挂到 DSH Desktop 的 webServer 上。
 *
 * 为什么单独一层：业务页在宿主里不能用 `listen()`（会和宿主抢端口），必须走
 * `ctx.webServer.register({kind:'prefix'})`。挂载前缀由 connection 层与宿主
 * 静态资源规则约定，注册成功 ≠ 渲染成功，所以只做一件事——把前缀交给宿主。
 *
 * 本文件是本仓 **apiPrefix('bladder') 与 DB 文件名的唯一来源**（server.js 的
 * DEFAULT_DB 与这里指向同一文件，下面有断言兜住漂移）。
 */
import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { API_PREFIX_NAME, HOST_BASE, UI_ENTRY, HEALTH_PATH } from '../lib/routes.js';
import { createWorkbenchServer, DEFAULT_DB } from './server.js';

/** 必须与 cordis.patch.yml 里的 id 逐字一致（宿主按它认插件身份） */
export const PLUGIN_ID = 'bladder-cancer-workbench-main';
/** 接口命名空间：与 DB_FILE 的短名一致，供 STATUS / 诊断文案使用 */
export const API_PREFIX = API_PREFIX_NAME;
export { HOST_BASE, UI_ENTRY, HEALTH_PATH };

/** 业务库文件名：有 root 时落在 root 下（资料目录=用户自己选题的目录，卸载不删） */
export const DB_FILE = 'xyb-bladder.sqlite';
/** 没有 root（旧宿主 / 未传配置）时的兜底库：包内 workspace/，不碰用户目录 */
export const FALLBACK_DB = DEFAULT_DB;

if (basename(FALLBACK_DB) !== DB_FILE) {
  throw new Error(`DB_FILE(${DB_FILE}) 与 dsh/server.js 的 DEFAULT_DB(${FALLBACK_DB}) 不一致：文件名必须只有一处定义`);
}

/** 与 dsh/index.js 的 name 同值：cordis 按 name 找 apply */
export const name = PLUGIN_ID;
export const inject = ['webServer', 'connection'];

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

/**
 * 本机授权闸：宿主把 /api/bladder-workbench/** 转给我们之前，要先过 connection 层。
 * 判定沿用家族写法——`requestRejection(req)` 返回 undefined 表示放行，其它值当拒绝码。
 *
 * 比 GBM 多两处硬化（见交付报告）：
 * 1. `await`：宿主若把它实现成 async，GBM 的同步写法会把 Promise 当状态码传进 writeHead
 *    直接抛 TypeError；
 * 2. 拒绝码只接受数字：GBM 的 `rejection || 403` 在返回 true 时会 writeHead(true) 崩掉。
 * 两者都**不改变**放行/拒绝的判定，只是让异常路径变成一个可读的 403。
 */
export function createHostHandler(server, ctx = null) {
  const gate = ctx?.connection?.requestRejection;
  return async (req, res) => {
    let rejection;
    try {
      rejection = gate ? await gate.call(ctx.connection, req) : undefined;
    } catch (error) {
      sendJson(res, 403, { error: `本机授权校验失败：${error.message}` });
      return;
    }
    if (!gate || rejection !== undefined) {
      sendJson(res, typeof rejection === 'number' ? rejection : 403, {
        error: '需要通过 DSH 本机授权会话访问这个工作台',
      });
      return;
    }
    await server.handle(req, res);
  };
}

/** 最近一次 apply 造出来的服务；诊断/自检只读，不要拿它当业务依赖 */
let MOUNTED = null;
export function mountedServer() {
  return MOUNTED;
}

/**
 * cordis 插件入口。注意：**非 async、无返回值**——cordis 对 apply 的返回值很挑，
 * 返回 Promise 会被当成「未处理完」。
 * @param {object} ctx
 * @param {{root?: string}} config  root 由宿主分配（用户在 Desktop 里选的资料目录）
 */
export function apply(ctx, config = {}) {
  const root = typeof config?.root === 'string' && config.root.trim() ? config.root.trim() : '';
  if (root) mkdirSync(root, { recursive: true });
  if (!root) mkdirSync(dirname(FALLBACK_DB), { recursive: true });

  const dbPath = root ? join(root, DB_FILE) : FALLBACK_DB;
  const server = createWorkbenchServer({
    root,
    dbPath,
    basePath: HOST_BASE,
    apiBase: HOST_BASE,
    runtime: 'host',
  });
  MOUNTED = server;

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: HOST_BASE,
    handler: createHostHandler(server, ctx),
  }), `${PLUGIN_ID}: api`);
}
