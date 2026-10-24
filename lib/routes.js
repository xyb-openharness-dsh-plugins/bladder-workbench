/**
 * 挂载路径常量（M5）。**唯一来源**：dsh/workbench.js 与 scripts/build-client.mjs
 * 都从这里 import，避免出现「客户端一份、服务端一份」的路径漂移
 * （prompts/ZERO-TO-DEV.md 明确要求客户端里不许出现第二份面板/路径常量）。
 *
 * 三段拼法与家族一致：
 *   UI_ENTRY    = <HOST_BASE>/ui/          业务页静态目录（宿主同源 iframe 打开）
 *   HEALTH_PATH = <HOST_BASE>/api/health  客户端探活用（拿 dir 与版本）
 * 服务端内部路由是去掉 HOST_BASE 的相对段：/api/health 与 /api/bootstrap。
 *
 * ⚠️ HEALTH_PATH 与「业务数据接口」都以 API_PREFIX 为前缀，注意别写成
 * /api/bladder-workbench/health——那样和 HOST_BASE 拼出来少一层 api，客户端会 404。
 */

/** 服务名（与 DB_FILE 前缀、API_PREFIX 一致，改一处即可） */
export const API_PREFIX_NAME = 'bladder';

/** 宿主挂载前缀 */
export const HOST_BASE = `/api/${API_PREFIX_NAME}-workbench`;

/** 业务页入口（宿主把它当同源 iframe 打开） */
export const UI_ENTRY = `${HOST_BASE}/ui/`;

/** 客户端探活与「拿资料目录」的接口 */
export const HEALTH_PATH = `${HOST_BASE}/api/health`;

/** 服务端内部路由表（挂载时拼在 HOST_BASE 之后） */
export const ROUTES = Object.freeze({
  health: '/api/health',
  bootstrap: '/api/bootstrap',
});
