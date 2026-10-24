/**
 * 包入口（M5）。三件事：
 * 1. 把插件的 name / apply / STATUS / Config 暴露给 cordis 宿主；
 * 2. 让 dsh/server.js 与 dsh/store.js 可以脱离宿主单独跑（脚本、测试、诊断）；
 * 3. 明确本里程碑**没有**哪些模块。
 *
 * ⚠️ 尚未存在的模块（本里程碑故意不 export，避免宿主加载时 import 失败）：
 *   dsh/readmodels.js、dsh/demo.js、dsh/settings.js、dsh/mineru.js、dsh/parse.js。
 *   它们属于后续里程碑；等文件真的落地再在这里加一行，不要提前 import 占位。
 */
import Schema from '@deepseek-ai/schemastery';
import { version, displayVersion, channel, channelLabel, build, commit } from '../lib/version.js';

export { createWorkbenchServer, stripBasePath, PUBLIC_DIR, DEFAULT_DB } from './server.js';
export {
  PLUGIN_ID,
  API_PREFIX,
  HOST_BASE,
  UI_ENTRY,
  HEALTH_PATH,
  DB_FILE,
  FALLBACK_DB,
  name,
  inject,
  apply,
  createHostHandler,
  mountedServer,
} from './workbench.js';
export { SCHEMA_DIR, LEDGER, migrate, migrationFiles, openDb, closeDb, createStore, nowISO, todayISO } from './store.js';

/**
 * root 必填：宿主在装/开工作台时会分一个资料目录，业务库落在它下面。
 * 这里 required 是刻意的——省掉「默认写进包目录」这种在真机上会丢数据的兜底。
 */
export const Config = Schema.object({
  root: Schema.string().required(),
});

/** 宿主适配层已实现（不等于已装机） */
export const HOST_ADAPTER_READY = true;

/** 诊断用状态快照：只能报告「代码里是什么」，不能报告「装机后是什么」 */
export const STATUS = Object.freeze({
  version,
  displayVersion,
  channel,
  channelLabel,
  build,
  commit,
  pluginId: 'bladder-cancer-workbench-main',
  apiPrefix: 'bladder',
  dbFile: 'xyb-bladder.sqlite',
  hostAdapter: 'implemented',
  installed: false, // 未接入 DSH 装机环境核验前恒为 false（P2 写「未验证」）
  standalone: 'npm start',
  note: 'customFrame 工作台：中间业务页 + 最右侧可拖/可收起的原生 AI 对话',
});
