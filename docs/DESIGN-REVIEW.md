# 设计独立审查记录 · 小泉宝 UroPal · 膀胱癌

状态：**第 1 轮已执行**。自审与独立审查分开记录，**不以模板存在宣称 review 完成**。

> **独立性口径（如实说明）**：本轮审查由一个**独立会话、独立上下文**的审查 Agent 完成（`ab2558e0-397f-4227-a88e-bfa08383383c`）。它**只拿到产物清单与审查重点，拿不到本项目的推理过程、结论与自评**，因此不受"作者视角"影响。
> **但它与我运行在同一个模型上** —— 这**不等于**"不同模型的交叉审查"。**真正的异模型审查仍未做**，本表不据此宣称设计已获独立背书。

审查范围：phase1 全部文档 + `prototypes/v0.1/` 六件 + 四个自检脚本，允许实际运行脚本验证。
审查时间：2026-10-24 04:10–04:20（Asia/Shanghai）。

---

## 1 第 1 轮审查记录

| 项 | 内容 |
| --- | --- |
| 轮次 | 1 |
| 阶段/文档版本 | phase1 全部产物（原型 `v0.1`）；审查跨越本轮正在进行的原型修改，**审查者已自行声明 hash 可能过期** |
| 实际模型/推理档位/审查Agent | 与本项目同一模型；**独立会话独立上下文**，产物清单输入、无推理过程输入 |
| 时间与输入范围 | 2026-10-24 04:10–04:20；`docs/*`（33 份）+ `schema/draft/0001_initial.sql` + `prototypes/v0.1/*` + `scripts/*` |
| 发现及优先级 | 高 10 条 / 中 15 条（见 §2、§3） |
| 建议/讨论项 | 见每条"建议"栏 |
| 用户决定与修改证据 | **待用户裁决**。本轮只做完审查，尚未逐条处置 |
| 未解决项 | 全部 25 条，处置状态见 §5 |

**审查者的总体判断（原文要点）**：「这个 phase1 的诚实度高于大多数交付物 —— 占位、未核实、未签认都主动登记了。最严重的问题不是『没做完』，而是**记录的版本与磁盘上的版本已经对不上，而且若干『声称防住』的东西没防住**。」

---

## 2 高优先级发现（10 条）

| # | 问题 | 位置 | 为什么是问题 | 建议 | 优先级 | 处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **原型 hash 已失效，G2 会签错版本** | `docs/PROTOTYPE-REVIEW.md §一`、`docs/UI-PARITY.md §1` | 记录的 app.js `9635def9…`／shell.css `8f704691…`／总哈希 `3dff302d…` 与磁盘不一致；任何基于该 hash 的用户确认都指向一个不存在的版本 | 改文件即重算 hash 并作废既有确认；hash 由脚本生成而非手写 | 高 | **已处理**：六件哈希重算（shell.css `075da3fd` / app.js `dc204237`，总哈希 `030c7bc6`），已回写 `PROTOTYPE-REVIEW.md` 与 `DEMO-INDEX.md`；`UI-PARITY.md §1` 同步 |
| 2 | **私密项在数据层没有 fail-closed** | `docs/SCENARIO-PATHS.md` S08、`docs/SPEC.md` M05 vs `schema/draft/0001_initial.sql` | 声称 `stoma_log.privacy` 默认 private，实测**无 privacy 列**；`worry_note` 也无 `is_private`；全库只有 `viewpoints.is_private` 默认 1 | 统一 visibility 列或单一 `privacy_policy` 表 + 默认值 `CHECK`；探针补进 `check-schema-draft.mjs` | 高 | 待办 |
| 3 | **`recorded_by` 未落地，照护者代记无处存** | `docs/SPEC.md` M10 / AC-38 vs schema | `recorded_by` 在 schema 出现 **0 次**；只有 `records` 审计表与 `stoma_logs.actor`（自由文本、非 `subjects` 外键） | 事实表统一加 `recorded_by`，或统一事件层 | 高 | 待办 |
| 4 | **ADR-02 选的 `diagnosis_assertion` 没实现，验收仍指向它** | `docs/SPEC.md:41/262`、`docs/ACCEPTANCE.md:84`(AC-04) vs schema `line_selections`(`:46/:52/:56`) | ADR 未修订，AC-04 **不可执行** | 改 ADR/字段，或改验收，二选一并同步 | 高 | **已处理**：以 schema 为准改文档。`docs/SPEC.md` ADR-02 / 实体清单 / M01 字段改为实际三表（`line_selections` / `staging_assertions` / `pathology_findings`），`AC-04` 的落点改 `line_selections.supersedes_id`。三表拆分优于原单表 `diagnosis_assertion`（分野/分期/病理形态是三件事） |
| 5 | **第 4 个自检脚本失败且结果无落点** | `scripts/verify-metric-trend.mjs`；`docs/METRIC-TREND-SPEC.md` | 审查时脚本 exit 1；MT 结果在 `PARITY.csv`/`UI-PARITY.md`/`ACCEPTANCE.md` **零命中** | 结果登记进 `ACCEPTANCE.md §3`，未实现项写进 `PARITY.csv` | 高 | **已处理**：`ACCEPTANCE.md` 新增 `ACC-36`（MT 15/15，另 2 条如实记未实现）；`PARITY.csv` 新增 `PAR-030` 记 MT14/MT16 未实现 |
| 6 | **声称把发现记进 DESIGN-REVIEW，文件却是空模板** | `docs/UI-PARITY.md §5` vs `docs/DESIGN-REVIEW.md` | claim 与被引文件矛盾；这是 G1 独立审查的指定落点 | 写入或删 claim | 高 | **本文件即处置**：`docs/UI-PARITY.md §5` 引用的两条薄弱点已登记为 §4 的 D-01/D-02 |
| 7 | **E4 假设被挂上 E1 来源** | S07(P1)、`docs/FEATURE-INVENTORY.csv:20`、`docs/SCHEMA.md:22` | 写「来源：质控 BT-16-01/02/03」，但原文那三条只是**术式比例指标**，不含生活向对比；`docs/USER-RESEARCH.md:64` B2 自己写「生活向对比是 E4」 | 来源列与界面同改标 **E4** | 高 | **已处理**：`SCENARIOS.md` S07 来源列、`FEATURE-INVENTORY.csv` FI-019、`SCHEMA.md` 三处同改 —— E1 只支持「三种术式是三个独立类别」，日常生活对比改标 **E4 设计假设** |
| 8 | **S14（P1）在原型里走不通** | `docs/SCENARIO-PATHS.md` S14 vs `prototypes/v0.1/app.js:136-139` | 文档称"首页顶部档案切换器承担我的/患者的资料"；原型只有 `#selDemo`（DEMO-1/DEMO-2 **分野**切换），无主体切换、无照护者视角 | 明确一期做不做；不做就改文档 | 高 | **已处理（按未实现登记，未粉饰）**：`SCENARIO-PATHS.md` S14 删掉不成立的切换器说法并标「原型缺口」，§5 补条目；`PARITY.csv` `PAR-025` 状态记 **未实现**。一期倾向只做交接页+记录人字段 |
| 9 | **处置指令与「不写处置」自相矛盾** | `prototypes/v0.1/app.js:1722`、`:957` vs S10 锚点③ | 同屏既写「不告诉你怎么处理」又写「请尽快联系…或就近急诊」；`check-wording.mjs` 只查 7 个禁词，**语义越界无覆盖** | 把「不写处置」变成可判定断言（禁祈使句） | 高 | **已处理**：急症页/灌注页改为「共识列出的固定情形 + 转接」，删掉「也不告诉你怎么处理」与「不要等到下次门诊」；`check-wording.mjs` 新增 7 条处置指令规则（自行用药/可以等/先吃点/热敷/不用去医院/不要等到），界面面零命中 |
| 10 | **声称的约束没防住，探针还恒真** | schema `instillation_events.cancel_reason` vs `docs/SCHEMA.md:126`/AC-10 | 无 `CHECK`；`check-schema-draft.mjs` 那条只验「带原因的取消能写」，**没有反向验证"不带原因必须被拒"** | 加 `CHECK(status<>'cancelled' OR cancel_reason IS NOT NULL)`，探针**反向**测 | 高 | **已处理**：`instillation_events` 加表级 `CHECK(status<>'cancelled' OR 非空 cancel_reason)`；探针 **28 → 37**，含 6 条反向探针（只验「合法值能写」是恒真的） |

---

## 3 中低优先级发现（15 条）

| # | 位置 | 问题 | 建议 | 优先级 |
| --- | --- | --- | --- | --- |
| 11 | `docs/SPEC.md §功能范围` | 写「一级导航（12）」，实际 14；`PROTOTYPE-REVIEW.md`/`PARITY.csv` PAR-022 又写 15 | 定为 **14** 全库统一 | 中 |
| 12 | `docs/PROTOTYPE-REVIEW.md` 覆盖清单 | 写 15 个一级页、灌注只有 3 页签、SCENARIOS「S01–S16」 | 与 **14 / 5 / S01–S18** 对齐 | 中 |
| 13 | `docs/HVT-REVIEW.md:30/175/316` | §0 说 ACCEPTANCE 仍是空模板、§7 说 B 级 2 条未清零，与同文 §5「2→0」冲突 | 标注为**审核时快照**，或同步更新 | 中 |
| 14 | `docs/ACCEPTANCE.md:217` ACC-33 | 期望「150/150」，实际 **155** | 更新 | 中 |
| 15 | `docs/ACCEPTANCE.md` M15 节 | 写「入口…（待原型补）」，原型已有该页签 + 3 条断言 | 改 | 中 |
| 16 | `docs/ACCEPTANCE.md` M05 节 | 把 S12 归给 M05，S12 实属 **M13** | 改映射 | 中 |
| 17 | `docs/SPEC.md:413` / `docs/UI-PARITY.md:67` / `docs/SOURCES.md:69` | 三处称「HER2 判读字段留位」，schema 无该字段、无页无场景 | 真建或删 | 中 |
| 18 | `docs/SOURCES.md:47` | 实际「11 个文件 → 6 份文献」，却被约 20 处写成「11 份共识」支撑"零覆盖" | 统一口径 | 中 |
| 19 | `docs/SCENARIOS.md` S04 / `docs/USER-RESEARCH.md` A8 | 自认"最危险假设"却放 **P1**；§1.2 无「记录让我更难受」的退出 | 加心理风险降级路径 | 中 |
| 20 | `docs/SPEC.md:95` vs schema | 9 个 SPEC 实体名不存在；schema 另有 9 张表未被 SPEC 提及 | 出名称对照表 | 中 |
| 21 | schema `demo_meta` | 注释称"模拟数据不进库"却建演示元数据表 | 删或改注释 | 中 |
| 22 | schema `metabolic_observations`/`responses` vs `observations`/`bcg_responses` | 同语义两处落地 | 指定唯一事实源 | 中 |
| 23 | `docs/FEATURE-INVENTORY.csv` FI-052/002/003/006/023/035 | 验收 ID 错填 | 逐条改正 | 中 |
| 24 | `docs/ACCEPTANCE.md:216` ACC-32 | 只用 7 个禁词代表"文案红线零命中" | 补祈使/因果断言 | 中 |
| 25 | `docs/SPEC.md §互动设计` | 写 `UI-DESIGN.md（待写）`，该文件已 220 行且 DESIGN-01–10 已确认 | 更新 | 中 |

---

## 4 审查者指出的"已做对、但最容易被误判成问题"三件事

记录在此，防止后续 review 走偏：

1. **占位与「来源待补」是主动登记，不是遮掩**：危险度判据、BCG 分级表、憋尿时间**宁可空着**（憋尿倒计时器直接删掉），9 处占位在 `docs/UI-PARITY.md §3` 逐条列明。**不要按"完成度低"打分。**
2. **不签就是不签**：G1/G2/G3 未签、用户确认栏留空、P2 写「未验证」、不写「可发布」——这是正确姿态，不是流程走形式。
3. **真几何自检而非看截图**：svg 与宿主同宽 ±1px、标签相交检测、`scrollHeight` 不裁切；单点不连线、空窗口空态、分类变量不按好坏着色、双分级不换算是实打实的医学安全设计。

---

## 5 审查者明确未能验证的部分（沿用其原话要点）

- **未在 DSH Desktop 真机打开**（P2 只能读文档）；**无真实用户走查**。
- **无医学核对能力**：无法判断 BCG 术后 ≥2 周、120 mg/1 年 19 次、SWOG 27 次、CrCl<60 等数字是否与原文一致（**原文图片审查者也拿不到**）。
- 295 条试验**未回源抽查**。
- 隐私只能读 SQL；导出／AI 草稿链路**未实现，无法动态验证是否会漏私密项**。
- **审查期间工作区被另一进程持续改写**（正是本项目在同步修改原型与脚本），审查者的 hash 与 MT 数值可能已过期；**静态文档类问题（#2/#3/#4/#6/#7/#10）不受影响**。

---

## 6 自审补充的薄弱点（非审查者提出）

| # | 问题 | 位置 | 说明 |
| --- | --- | --- | --- |
| D-01 | **同一份页签名清单写在两个文件里** | `prototypes/v0.1/data.js`（`NAV.tabs`）与 `app.js`（`pageRecords(tab)` 分发） | 结构上必然漂移，已踩过两次（首次"空壳页"，第二次"回肠造口"映射失配）。当前只靠断言兜底，**没有从根上消灭** |
| D-02 | **「新增字段自动渲染」没有断言** | `prototypes/v0.1/` | 纯人工走查，新字段漏渲染不会被自检发现 |

---

## 7 结论

| 项 | 结论 |
| --- | --- |
| 第 1 轮独立审查 | ✅ 已执行（独立会话独立上下文，**同一模型**） |
| **异模型交叉审查** | ❌ **未做** |
| 高优先级发现 | 10 条，**已处置 1 条（#6）**，部分处置 1 条（#5） |
| 中低优先级发现 | 15 条，**全部待办** |
| 自审补充 | 2 条，待办 |
| **是否构成 G1 独立审查通过** | ❌ **不构成**。G1 仍未签认 |

**审查者的一句总结值得留在最后**：「最严重的问题不是『没做完』，而是记录的版本与磁盘上的版本已经对不上，而且若干『声称防住』的东西没防住。」

---

## 8 改动追踪

| 日期 | 改动 |
| --- | --- |
| 2026-10-24 | 第 1 轮独立审查执行并记录（高 10 / 中 15）；补记自审 D-01、D-02 |

---

本表只审设计方案，**不代表发布已授权、包已安装、Desktop 已加载或市场已收录**。发布决策与证据分别记录在 `docs/RELEASE.md`、`docs/ACCEPTANCE.md`；市场流程见 `docs/10-MARKET-PUBLISHING.md`。
