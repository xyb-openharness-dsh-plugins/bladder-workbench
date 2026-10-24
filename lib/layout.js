/**
 * 面板布局参数（M5）。本文件是面板参数的**唯一来源**：
 * - 宿主面板合同（PANEL）给 cordis.patch.yml / dsh 清单 / register 用；
 * - 页面内 AI 对话栏（右侧）的宽度档给 src/client.js 用——由 scripts/build-client.mjs
 *   在生成 lib/client.js 时注入，客户端里不许再出现第二份 0.65 / 35 / 25 / 45 / 760 / 420。
 *
 * ## 为什么是 0.65 与 35%
 * 两个值**互补**（0.65 + 0.35 = 1），依据 prompts/DSH-AGENT-PANE-INTEGRATION.md：
 * Agent 展开时默认占工作区 35%，可拖范围 25%–45%，分栏顺序「中间工作台、最右侧 Agent」；
 * 界面口径与配色档见 docs/UI-DESIGN.md（本工作台主区按 65% 排版时，看板与一图秀
 * 仍是两列/单列自适应，不靠宿主动态改宽度）。
 *
 * ## 为什么本项目**必须** customFrame
 * 膀胱癌工作台有两个家族里属于本项目特有的交互：① 灌注周期与复查时间轴要能一边看
 * 资料一边追问，宽度得**随手拖**；② 患者常在全屏看膀胱镜复查/造口日记时把 AI 栏
 * **收起**再回来，而不希望因此结束会话。标准分栏（gastric-workbench 走的那条）
 * 里宿主把宽度写成注册时的静态值，服务里没有 setBusinessWidth / togglePane，
 * DOM 里也没有 splitter 节点——那条路上**不存在**这两个能力（见
 * prompts/ZERO-TO-DEV.md §2.2 的说明）。所以本项目走 customFrame：由我们自己
 * 排原生会话节点，拖动与收起都自己实现。
 *
 * customFrame 下宿主不再按 businessWidth 分栏，但 register 仍会校验取值区间
 * （businessSide ∈ left|right，businessWidth ∈ 0.25–0.7，越界直接抛错），
 * 所以照样传合法值。
 */

/** 宿主面板参数（customFrame 下主要供注册校验与备案） */
export const PANEL = Object.freeze({
  businessSide: 'left',      // 业务区在左、原生会话在最右（家族统一，不许各仓自定）
  businessWidth: 0.65,       // 与 AGENT_PANE.default 互补（0.65 + 0.35 = 1）
  customFrame: true,
});

/** 宿主允许的 businessWidth 区间（越界 register 直接抛错） */
export const HOST_LIMITS = Object.freeze({ min: 0.25, max: 0.7 });

/** 页面内 AI 对话面板（右侧）的宽度档：百分比、键鼠同精度步进 */
export const AGENT_PANE = Object.freeze({
  side: 'right',
  min: 25,
  max: 45,
  default: 35,
  def: 35,          // 兼容家族代码里读 def 的写法，与 default 同值
  step: 2,          // 键盘 ←/→ 步进 = 拖动最小有效刻度（同精度，百分点）
  ratioStep: 0.02,  // 客户端 customFrame 排版用比例（=step/100），build-client 注入这一项
  narrowBelowPx: 760, // 容器窄于此改覆盖式抽屉（按容器宽度判断，不按窗口宽度）
  drawerMaxPx: 420,   // 抽屉最大宽度
  storageKey: 'uropal.agent.w', // 会话栏宽度在本机的存储键（build-client 注入客户端，别写第二份）
});

/** 读回持久化宽度时必须过一遍夹取（旧版本/手改可能存了越界值） */
export function clampAgentWidth(w) {
  const n = Number(w);
  if (!Number.isFinite(n)) return AGENT_PANE.default;
  return Math.min(AGENT_PANE.max, Math.max(AGENT_PANE.min, Math.round(n * 10) / 10));
}

/** 注入页面/客户端的布局参数（唯一入口；客户端只读它，不自带常量） */
export function clientLayout() {
  return {
    agentPane: { ...AGENT_PANE },
  };
}

/** 自检：返回问题清单，空数组表示合法。参数可注入，便于单测覆盖越界情形。 */
export function assertPanelConfig(config = PANEL, agent = AGENT_PANE) {
  const problems = [];
  if (!['left', 'right'].includes(config.businessSide)) {
    problems.push(`businessSide 只能是 left/right，当前 ${config.businessSide}`);
  }
  if (config.customFrame !== true) {
    problems.push('本工作台要「可拖 + 可收起」必须 customFrame: true，当前不是');
  }
  const w = config.businessWidth;
  if (!(typeof w === 'number' && w >= HOST_LIMITS.min && w <= HOST_LIMITS.max)) {
    problems.push(`businessWidth 必须在 ${HOST_LIMITS.min}–${HOST_LIMITS.max} 之间，当前 ${w}`);
  }
  // AGENT_PANE 用百分点存（35），businessWidth 用比例（0.65），比较前统一换成比例。
  if (Math.abs(w + agent.default / 100 - 1) > 1e-9) {
    problems.push(`businessWidth(${w}) 与 AGENT_PANE.default(${agent.default}%) 必须互补为 1`);
  }
  if (!(agent.min < agent.default && agent.default < agent.max)) {
    problems.push(`AGENT_PANE 必须 min < default < max，当前 ${agent.min}/${agent.default}/${agent.max}`);
  }
  if (agent.side !== 'right') problems.push('AI 面板固定在右侧（用户确认过），不许改');
  if (!agent.storageKey) problems.push('AGENT_PANE.storageKey 必填：宽度必须能本机恢复');
  return problems;
}
