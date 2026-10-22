# 实施任务与当前交接

规格版本：`docs/SPEC.md`（含 M01–M14）· 原型 hash：`app.js` = `0b8d8b0cc7ee6149…` / `index.html` = `6348da9b621c9c38…`（全表见 `docs/PROTOTYPE-REVIEW.md`）
当前分支：`master`（首次提交待做）· 包版本：`@xyb-community/bladder-cancer-workbench` `0.1.0`

## 闸口状态（当前最要紧的事实）

| 闸口 | 含义 | 状态 |
|---|---|---|
| **G1** | 业务流程与功能签认（HVT B 级清零 + DIFF-MATRIX 非空 + SPEC） | **未签** |
| **G2** | HTML 原型签认（确认具体版本/hash 与范围） | **未签** |
| **G3** | 数据模型与数据流签认（此前不建表、不写迁移） | **未签** |

按 `docs/22-PHASES-AND-GATES.md`：**G1 未签不写业务代码，G3 未签不建表不写迁移。** 因此下列 T02–T07 全部为「阻塞」。

## 任务表

| ID | 业务单元 | 前置依赖 | 拥有文件/模块 | 实现/检查要求 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| **P01** | phase1 调研与场景 | — | `docs/USER-RESEARCH.md`、`docs/SCENARIOS.md` | S01–S16 场景 + 患者困难排序，证据分层 | 已落盘（**含「无真实访谈」声明**） | **完成** |
| **P02** | HVT 审核 | P01 | `docs/HVT-REVIEW.md`、`HVT-SCENES.csv` | 十条疾病轴现场推导 + 五层落地检查（S/M/F/I/A） | 已落盘 | **完成** |
| **P03** | 差异化矩阵 | P01 | `docs/DIFF-MATRIX.md` | ≥3 行，每条「场景→功能→验收」 | **15 行** | **完成** |
| **P04** | SPEC 与核心模块 | P02/P03 | `docs/SPEC.md`、`docs/CORE-MODULES.md` | M01–M14 规格 + 四个核心模块及其判定理由 | 已落盘 | **完成** |
| **P05** | 2026 临床试验数据 | — | `scripts/fetch-bladder-trials-2026.mjs`、`research/bladder-cancer/` | 双源、可重跑、口径写入 manifest、PII 剥除 | **295 条**（CT.gov 212 + ChiCTR 83） | **完成** |
| **P06** | HTML 原型 | P03/P04 | `prototypes/v0.1/` | 可点通 15 个一级页 + 二级页签；C1–C12；390px 不溢出 | 自检 **116/116**，22 张截图 | **完成** |
| **P07** | 数据模型草案 | P04 | `docs/SCHEMA.md` | **只到草案**，含报告导入契约 | 已落盘；**无 DDL、无迁移** | **完成（草案）** |
| **P08** | 文件体系与交付索引 | P01–P07 | `docs/DEMO-INDEX.md` | 一页看清交付物、怎么打开、没做什么 | 已落盘 | **完成** |
| **T01** | 接入基线 | **G1 + G2** | `package.json`、`cordis.patch.yml`、`dsh/index.js`、`lib/client.js` | 实际包可被目标宿主加载 | 待填 | **阻塞（G2 未签）** |
| **T02** | 数据/API | T01 + **G3** | `schema/0001_initial.sql`、`dsh/store.js`、`dsh/migrate.js`、`dsh/routes.js` | 旧库兼容与读写闭环 | 待填 | **阻塞（G3 未签）** |
| **T03** | 共享 UI | 原型冻结 + API 合同 | `public/app.js` 等 | 翻面卡 / 一图秀 / 弹窗 / 空态与错误态 | 待填 | **阻塞** |
| **T04** | 完整页 | T02/T03 | 按页面分配 | 输入→操作→结果→回顾 闭环 | 待填 | **阻塞** |
| **T05** | 装机验收 | T04 | `docs/RELEASE.md` | V1 包级 → V2 装机 → V3 业务，三层缺一不算通过 | 待填 | **阻塞** |
| **T06** | 发布与市场（按授权） | T05 + 用户授权 | 发行仓库、市场 PR | 记录授权、tag/包/hash、Profile、PR 及可见状态 | 待填 | **未授权** |
| **T07** | 原生 Agent 面板 | T01 + UI 状态稿确认 | 全局入口、宿主面板适配、`docs/AGENT-PANE-DESIGN.md`、`docs/UI-PARITY.md` | 按 ACC-28–31；不仿制聊天 UI | 原型内只有**状态稿** | **未开始** |
| **T08** | MinerU 报告导入 | T02 + 按 `docs/18` | `dsh/mineru.js`、`dsh/settings.js` | Token 文件优先、掩码回显、表格先转再对齐 | 只有设置页骨架 | **未开始** |

## 当前失败/复现

无。`node scripts/verify-prototype.mjs` → 117 条断言全部通过，浏览器控制台零 error。

## 未验证项（不得写成「已支持」）

1. **DSH Desktop 真机内嵌** —— 宿主未接入，**未验证**
2. **原生 Agent 面板真实会话** —— 未接入，**未验证**
3. **PDF 报告导入** —— 无解析链路，**未验证**
4. **真实患者可用性** —— **无真实访谈、无病友叙述、无真实病历**（DESIGN-12），全部场景来自公开资料推导
5. **医学内容临床核对** —— **暂无临床核对人**，阈值/随访节奏/适应证均标「来源待补」或「待核验」
6. **危险度分组判据** —— 2021 灌注共识表 1、2024 保膀胱共识表 5/表 6 是**图片**，文字未取得 → 原型**不做任何分层判断**

## 下一步具体动作/命令

等用户三选一：

1. **签 G1**（确认 `HVT-REVIEW.md` + `DIFF-MATRIX.md` + `SPEC.md`）
2. **提修改**（指页指条）
3. **看 HTML**：
   ```
   open /Users/qinxiaoqiang/Downloads/bladder-workbench/prototypes/v0.1/index.html
   ```

若签 G2 成立，才进入 T01；签 G3 成立，才进入 T02。

## 用户已确认的偏好与授权

- **DESIGN-01…07**（m00145）：泌尿族先行者 / 两条线都做 MIBC 做厚 / 三种改道都做 / 小泉宝·UroPal / 目录 `/Users/qinxiaoqiang/Downloads/bladder-workbench` / 2026 全年 CT.gov 主通道 + 中国通道 300–500 条 / **严格停在 phase1**
- **DESIGN-08…10**（m00282）：首屏先问一次分野 / 按照护者批量录入设计 / 有资料目录可提供
- **DESIGN-11…12**（m00309）：资料根目录限定为已扫到的三处 + 一份 ADC 安全共识 PDF / **患者侧材料都没有，只做桌面研究**
- **未授权**：Git 推送、公开发布、市场投稿、装机。组织规则「认领 ≠ 建仓，**G1 通过才建仓**」。
