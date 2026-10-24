# 小泉宝 UroPal · 膀胱癌工作台 · 开发计划与里程碑

> **里程碑只认本文件**。SPEC 里的页数不是进度，截图不是签认，`npm run check` 通过不等于 M5。
> 闸口定义见 [22-PHASES-AND-GATES.md](22-PHASES-AND-GATES.md)；任务级看板见 [TASKS.md](TASKS.md)（只记待办，不记里程碑）。
> 刻度采用**家族标准 M0–M9 + G1–G3**（来源：脚手架 `prompts/PROGRESS-REPORT.md`）。
> 本项目此前 `TASKS.md` 只写到 M7，缺 M8/M9；本轮补齐并对齐家族口径。

起始：2026-10-23　当前版本：**v0.1.0**　M5 起始：2026-10-24（phase1 止点由用户解除）　下一版：v0.2.0（M5 开发版）

---

## 里程碑

| ID | 里程碑 | 判据（可验证，不靠感觉） | 状态 |
| --- | --- | --- | --- |
| M0 | 骨架可跑 | `dsh-wb-cli 1.4.3 init` 生成 137 文件；`dsh-wb-cli check .` → `staticPass: true`；`git init` 完成 | ✅ 2026-10-23 |
| M1 | 调研与 SPEC | `USER-RESEARCH.md`（证据分层 E1–E4，**无真实访谈已如实标注**）；`SCENARIOS.md` S01–S18 且追踪链 E→N→S→F→A 闭合；`DIFF-MATRIX.md` 15 行（≥3 为组织准入）；`CORE-MODULES.md` 四核心模块；`SPEC.md` M01–M15 + AC-01–AC-54；`HVT-REVIEW.md` 五层检查跑完且 **B 级 2 → 0** | ✅ 2026-10-23 |
| M2 | 原型可点 | `prototypes/v0.1/` 六件；**14 一级页 + 48 二级页签 + 设置**逐页真实点击且正文非空（逐页断言，非目测）；`verify-prototype` **164/164**；`verify-one-chart` C1–C12 **12/12**；`verify-metric-trend` MT **15/15**（另 2 条未实现已登记）；390px `documentElement.scrollWidth === 390`；控制台 **0 error** | ✅ 2026-10-24 |
| M3 | 数据模型 | `schema/0001_initial.sql` **44 表 · 8 索引**可执行；约束探针 **37/37**；`schema/freeze-contract.md` 落 sha256 `86e5a3e5…`；校验器能拒绝「篡改已冻结迁移」与「新增未登记迁移」（两者均实测退出码 1） | ✅ 2026-10-24 |
| M4 | 临床库 | 2026 年 **295** 条（ClinicalTrials.gov 212 + ChiCTR 83）；`trials-2026.jsonl` / sqlite / manifest 三方计数一致；4 个视图；声明 sha256 与实算一致；PII **17 类**模式剥除 + `assertNoPii` fail-closed，54 字段终检 **0 命中**；manifest 十条 limitations 随数据呈现 | ✅ 2026-10-23 |
| M5 | 开发版 | **判据（2026-10-24 用户「原型确认通过，继续M5开发」后写定）**：① 六步移植完成（`dsh/` 六件 + `lib/` 三件 + `public/` 四件 + `scripts/` 检查器 + `test/` 三层）；② `readmodels` 还原的行与 `prototypes/v0.1/data.js` **形状逐字符一致**（parity 是这一层唯一验收标准）；③ 真实 SQLite 落盘且**迁移幂等**（重跑不重复建表）；④ `demo.js` 播种**幂等**（有 subjects 整批跳过）、单事务、失败整体回滚；⑤ customFrame 右侧可拖面板：`businessSide=left`、`businessWidth=0.65` 与 `AGENT_PANE.def=0.35` **互补且只有一份来源**、splitter `role=separator`+键盘+localStorage 夹取、<760px 覆盖式抽屉；⑥ `NODE_OPTIONS= npm run check` 全绿；⑦ `npm start` 无头实测**出数字**（导航数 / 面板宽度开-宽-收 / `bodyScrollW` vs `innerWidth` / error 与 4xx 计数）并截图。**MinerU 与指南桥接不在 M5 判据内**（一期只留接口与设置页骨架） | ✅ 2026-10-24（证据见下） |
| M6 | 装机 | `dsh-wb-cli pack` 产出 tgz 且无生命周期脚本；安装到目标 Desktop 活动 profile（`~/Library/Application Support/dsh-desktop/harness/profiles/web`）；三层验收（配置层 / 加载层 / 交互层）；`probe-install` 类探针全过 | 🔵 已执行未验证（**45/46**，1 项未验证见下） |
| M7 | 发布 | 仓库 push + tag；LICENSE / NOTICE 复核；**市场投稿需单独授权**，未授权即写「未提交」 | ⬜ 未开始 |
| M8 | 状态回填 | 组织 `BACKLOG.md` 对应行（**膀胱癌 #35，T1 / NCCN 1.2025 / 波次 W3**）状态与版本同步；须 V1+V2+V3 三层都过 | ⬜ 未开始 |
| M9 | 回流闭环 | 从 `LESSONS` / 变更记录抽出**可执行**的脚手架闸门（不是再写一篇文档）；新项目 `init` 后自动生效；有反向回归。本项目已有候选素材：见 [LESSONS.md](LESSONS.md) | ⬜ 未开始 |

## 闸口

| ID | 闸口 | 判据 | 状态 |
| --- | --- | --- | --- |
| G1 | 需求签字 | HVT 五层检查 B 级清零 + **用户原话**确认 | ✅ 2026-10-24（[SIGNOFF-2026-10-24](SIGNOFF-2026-10-24.md)） |
| G2 | 原型签字 | 用户确认原型版本与范围 | ✅ 2026-10-24（同文；冻结 `prototypes/v0.1/` 总哈希 `32731707…`（后经用户指示改动，现为 `63099946…`，见 `docs/DESIGN-SESSION.md` DESIGN-40）） |
| G3 | 数据模型签字 | 用户确认表数与契约；`freeze-contract.md` 落 sha256 | ✅ 2026-10-24（同文；此后**只增不改**） |

> **phase1 止点已于 2026-10-24 由用户解除**（原话「原型确认通过，继续M5开发」）：
> 该句同时构成 ① G2 确认范围以**当前**哈希 `32731707…` 为准（此前因修假声明产生的
> `4d9e1b4b… → 32731707…` 变动**已被接受**）与 ② `DESIGN-07`「业务代码一行不写」的解除。
> 两者均记于 [SIGNOFF-2026-10-24.md](SIGNOFF-2026-10-24.md)。

---

## 状态词表（不许自造）

| 词 | 含义 |
| --- | --- |
| ✅ 完成 | 判据列全部可复核，且证据路径存在 |
| 🔵 已执行未验证 | 做了，但缺判据要求的最后一步证据 |
| ⬜ 未开始 | 未动 |
| ⏸ 挂起 | 判据已备好，等外部决定（如用户授权） |

## 三类状态分开写（家族红线）

**已完成（有证据）／已执行但未验证（做了什么、缺哪一步）／未开始** —— 三者不合并。
未验证的项**不许写「已验证」**。push / tag / 装进 Desktop / 市场上架是**四件事**，分别记录。

---

## M5 完成证据（2026-10-24）

> 三类状态分开写：下面是「已完成（有证据）」，末尾单列「未做」。

| 判据 | 证据 | 数字 |
| --- | --- | --- |
| ① 六步移植 | `dsh/` 六件（index 57 / server 239 / store 211 / workbench 103 / demo 1319 / readmodels 609）· `lib/` layout 88 / routes 31 / version 18 / client 552（由 `src/client.js` 546 生成）· `public/` index.html 85 / style.css 130 / shell.css 943 / app.js 2934 | dsh+lib 3773 行 · public 4092 行 |
| ② parity | `node --test test/*.test.mjs` | **21/21**，含 parity **4/4**（2 分野 × 52 视图 = **104 处** `#wbPage` + `#wbCrumb` 逐字符相同） |
| ③ 真实落盘 + 迁移幂等 | `workspace/xyb-bladder.sqlite` 由 `npm start` 起真实服务落盘；**重启前后行数逐表相同** | 44 表 · `schema_migrations` version 1；subjects 3 / pathology_reports 4 / instillation_events 14 / stoma_logs 2 / trials 6 / observations 96 / metric_definitions 8 |
| ④ 播种幂等 | 同上重启对比；`test/store.test.mjs` 9 条（迁移幂等 / 两次播种行数不变 / 单事务注入必败行后整体回滚 / 空库安全 / 原始值保真） | **9/9** |
| ⑤ 面板（customFrame） | `node scripts/probe-headless.mjs` 实测 | 默认 **35** / 夹取 **25–45** / 拖到最左 **45** / 拖到最右 **25** / Home 25 / End 45 / ArrowLeft 25→27 / 收起后隐藏 / 分隔条 `display=block 5×1272px` 可聚焦 |
| ⑥ `npm run check` | `check:version → :client → :public → :demo → :syntax → :schema → :wording → :package → test` | **exit 0**（21 test 全过） |
| ⑦ 无头实测出数字 | `probe-headless` **25/25 全达标**（数字取自真实渲染，非目测） | 一级导航 **14** · 二级页签 **48** · 390px `scrollWidth === 390` · console error **0** · 4xx/5xx **0** · 网络失败 **0** |

**顺带修掉两个真缺陷**（都是「不报错但静默失效」那类）：

1. `dsh/server.js` 的 `buildBootstrap(db, { today })` 传的是**函数**而读模型要**字符串** → `meta.today` 被 `JSON.stringify` 丢掉变 `undefined`；改为 `{ today: today() }`，实测 `meta.today = "2026-10-24"`。
2. `cordis.patch.yml` 缺 `config.root` → `dsh-wb-cli check` `staticPass: false`，且**装机后每次宿主重启都会换成新的内存库**（错误原文：`installs fine but resets to an in-memory DB on every restart`）；补 `root: !!js dshHomePath('bladder-workbench')` 后 `staticPass: true`、`errors: []`。

**用户可见差异（有意，非缺陷）**：开发版页脚与原型不同（「开发版 / 数据只在本机」vs「原型 / 数据为演示用」），因此 parity 的比较范围是**面包屑 + 业务区**，页脚由独立规则断言，不参与逐字符比对。

**未做（不冒充）**：MinerU 云端解析与指南桥接（**不在 M5 判据内**，一期只留接口与设置页骨架）；装机（M6）与 push/tag（M7）未做；`demo2` 与 `demo1` 的共享模块内容相同（`data.js` 只有一份），真正分线不同值的只有**手术 / 治疗 / 改道 / 造口**四处。

---

## M6 装机证据（2026-10-24）

> 同样是三类分开写：**已完成有证据** / **已执行未验证** / **未做**。

| 判据 | 证据 | 结果 |
| --- | --- | --- |
| 打包 | `node scripts/install-local.mjs`（内部走 `npm pack`） | tgz 无 `prepack`/`postinstall` 等生命周期脚本 |
| 安装到活动 profile | 目标 `~/Library/Application Support/dsh-desktop/harness/profiles/web/node_modules/@xyb-community/bladder-workbench` | 版本 `0.1.0`，`isInstallCopy: true` |
| 配置层 | profile `package.json` 的 `dsh.profile.bundles` 含本包（装机脚本自动补，不靠人记得第二步） | ✅ |
| 加载层 | 装机副本内 `import { loadPrototypeData } from './dsh/demo.js'` | 返回 **27** 个键（NAV 14 一级页 / METRICS 7 / TRIALS 6） |
| 交互层 | `node scripts/probe-install.mjs`（**在装机副本里跑**，非仓库根） | **46 项：45 通过 / 0 失败 / 1 未验证**，console error **0**，网络失败 **0**，390px `scrollWidth === 390`，AI 面板 35% 开-宽-收全达标 |
| **未验证（不写通过）** | 授权闸（`UROPAL_AUTH`）拒绝路径 | **未设置 `UROPAL_AUTH`，本轮未验**。要验必须改宿主进程环境变量，而 AGENTS.md 明令不得在会话内重启宿主——留待用户完整退出重开 Desktop 后补验 |

**装机才暴露的 P0（已修，详见 [LESSONS.md](LESSONS.md)）**：`dsh/demo.js` 原来在**运行期**用 `node:vm` 回读
`prototypes/v0.1/data.js`，而该目录不在 `files` 白名单里 → 装机副本缺此目录 → `apply()` 抛 `ENOENT`
→ **一条路由都不注册、界面开不出来**。仓库内所有检查都读得到那个路径，所以全绿也抓不到。
修法：构建期生成零损副本 `demo/demo-data.js`（原文照搬 + 一行 export），运行期只 import 它，
`npm run check:demo` 守漂移。修后在装机副本内直调 `loadPrototypeData()` 返回 27 个键，探针 46 项跑通。

**未做（不冒充）**：M7 push/tag 与市场投稿（**均需单独授权**）。

---

## 复现命令（判据都可自己跑一遍）

```bash
node scripts/verify-prototype.mjs      # 期望 164/164
node scripts/verify-one-chart.mjs      # 期望 C1–C12 12/12
node scripts/verify-metric-trend.mjs   # 期望 15/15（另 2 条未实现）
node scripts/check-schema.mjs          # 期望 冻结合同 1/1 + 探针 37/37
node scripts/check-wording.mjs         # 期望 界面面 0 违规；文档面 0 违规
node scripts/check-wording.mjs --self-test   # 期望 9/9（规则不空转）
npm run check:demo                     # 期望 demo/demo-data.js 与原型 data.js 同步
node scripts/install-local.mjs         # 期望装进活动 profile 并自动补 bundles
node scripts/probe-install.mjs         # 期望 45 通过 / 0 失败 / 1 未验证（授权闸）
dsh-wb-cli check .                     # 期望 staticPass: true
git status --short                     # 期望 空
```
