# 小泉宝 UroPal · 膀胱癌工作台 · 开发计划与里程碑

> **里程碑只认本文件**。SPEC 里的页数不是进度，截图不是签认，`npm run check` 通过不等于 M5。
> 闸口定义见 [22-PHASES-AND-GATES.md](22-PHASES-AND-GATES.md)；任务级看板见 [TASKS.md](TASKS.md)（只记待办，不记里程碑）。
> 刻度采用**家族标准 M0–M9 + G1–G3**（来源：脚手架 `prompts/PROGRESS-REPORT.md`）。
> 本项目此前 `TASKS.md` 只写到 M7，缺 M8/M9；本轮补齐并对齐家族口径。

起始：2026-10-23　当前版本：**v0.1.0**（phase1 止点内）　下一版：v0.2.0（M5 开发版）

---

## 里程碑

| ID | 里程碑 | 判据（可验证，不靠感觉） | 状态 |
| --- | --- | --- | --- |
| M0 | 骨架可跑 | `dsh-wb-cli 1.4.3 init` 生成 137 文件；`dsh-wb-cli check .` → `staticPass: true`；`git init` 完成 | ✅ 2026-10-23 |
| M1 | 调研与 SPEC | `USER-RESEARCH.md`（证据分层 E1–E4，**无真实访谈已如实标注**）；`SCENARIOS.md` S01–S18 且追踪链 E→N→S→F→A 闭合；`DIFF-MATRIX.md` 15 行（≥3 为组织准入）；`CORE-MODULES.md` 四核心模块；`SPEC.md` M01–M15 + AC-01–AC-54；`HVT-REVIEW.md` 五层检查跑完且 **B 级 2 → 0** | ✅ 2026-10-23 |
| M2 | 原型可点 | `prototypes/v0.1/` 六件；**14 一级页 + 48 二级页签 + 设置**逐页真实点击且正文非空（逐页断言，非目测）；`verify-prototype` **155/155**；`verify-one-chart` C1–C12 **12/12**；`verify-metric-trend` MT **15/15**（另 2 条未实现已登记）；390px `documentElement.scrollWidth === 390`；控制台 **0 error** | ✅ 2026-10-24 |
| M3 | 数据模型 | `schema/0001_initial.sql` **44 表 · 8 索引**可执行；约束探针 **37/37**；`schema/freeze-contract.md` 落 sha256 `86e5a3e5…`；校验器能拒绝「篡改已冻结迁移」与「新增未登记迁移」（两者均实测退出码 1） | ✅ 2026-10-24 |
| M4 | 临床库 | 2026 年 **295** 条（ClinicalTrials.gov 212 + ChiCTR 83）；`trials-2026.jsonl` / sqlite / manifest 三方计数一致；4 个视图；声明 sha256 与实算一致；PII **17 类**模式剥除 + `assertNoPii` fail-closed，54 字段终检 **0 命中**；manifest 十条 limitations 随数据呈现 | ✅ 2026-10-23 |
| M5 | 开发版 | **判据待用户确认后写定**。家族口径参考：搬运步骤完成 + 核心功能实测 + MinerU 全链路真实云端跑通。当前 `dsh/` 1 文件、`lib/` 1 文件、`public/` 空、`migrations/` 无、`test/` 0 文件 → **业务代码 0 行** | ⬜ 未开始 |
| M6 | 装机 | `dsh-wb-cli pack` 产出 tgz 且无生命周期脚本；安装到目标 Desktop 活动 profile（`~/Library/Application Support/dsh-desktop/harness/profiles/web`）；三层验收（配置层 / 加载层 / 交互层）；`probe-install` 类探针全过 | ⬜ 未开始 |
| M7 | 发布 | 仓库 push + tag；LICENSE / NOTICE 复核；**市场投稿需单独授权**，未授权即写「未提交」 | ⬜ 未开始 |
| M8 | 状态回填 | 组织 `BACKLOG.md` 对应行（**膀胱癌 #35，T1 / NCCN 1.2025 / 波次 W3**）状态与版本同步；须 V1+V2+V3 三层都过 | ⬜ 未开始 |
| M9 | 回流闭环 | 从 `LESSONS` / 变更记录抽出**可执行**的脚手架闸门（不是再写一篇文档）；新项目 `init` 后自动生效；有反向回归。本项目已有候选素材：见 [LESSONS.md](LESSONS.md) | ⬜ 未开始 |

## 闸口

| ID | 闸口 | 判据 | 状态 |
| --- | --- | --- | --- |
| G1 | 需求签字 | HVT 五层检查 B 级清零 + **用户原话**确认 | ✅ 2026-10-24（[SIGNOFF-2026-10-24](SIGNOFF-2026-10-24.md)） |
| G2 | 原型签字 | 用户确认原型版本与范围 | ✅ 2026-10-24（同文；冻结 `prototypes/v0.1/` 总哈希 `32731707…`） |
| G3 | 数据模型签字 | 用户确认表数与契约；`freeze-contract.md` 落 sha256 | ✅ 2026-10-24（同文；此后**只增不改**） |

> **签认 ≠ phase1 止点解除**（`DESIGN-32`）：`DESIGN-07` 的「业务代码一行不写」由用户在 m00145 设定，
> 只有用户能解除。三个闸口通过是 M5 的**前提**，不是 M5 的**开始**。

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

## 复现命令（判据都可自己跑一遍）

```bash
node scripts/verify-prototype.mjs      # 期望 155/155
node scripts/verify-one-chart.mjs      # 期望 C1–C12 12/12
node scripts/verify-metric-trend.mjs   # 期望 15/15（另 2 条未实现）
node scripts/check-schema.mjs          # 期望 冻结合同 1/1 + 探针 37/37
node scripts/check-wording.mjs         # 期望 界面面 0 违规；文档面 0 违规
node scripts/check-wording.mjs --self-test   # 期望 9/9（规则不空转）
dsh-wb-cli check .                     # 期望 staticPass: true
git status --short                     # 期望 空
```
