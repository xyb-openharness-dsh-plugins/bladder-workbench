# 数据主体—关系—表

**状态**：**草案（未冻结）**。G3（数据契约）未签认 → 不进 `schema/`、不写 `freeze-contract.md`、不建生产表、不写迁移。
草案位置：`schema/draft/0001_initial.sql`（44 张表 · 8 个索引；约束探针 28 / 28 通过）。
约束探针：`node scripts/check-schema-draft.mjs` → **18 / 18 通过**。
复核时点：HTML 原型经用户确认后，按 `docs/14-HTML-AND-DATA-CONTRACT.md` 复核并落实。

| 实体 | 稳定 ID | 主体/外键 | 核心字段/类型 | 约束/索引 | 来源/确认 | 生命周期 |
| --- | --- | --- | --- | --- | --- | --- |
| `subjects` | `id` TEXT | — | display_name / relation / birth_year / is_self | 只存出生年，不存完整生日（最小化） | 本人录入 | 不删；关系变化记 `records` |
| `line_selections` | `id` | subject_id | line ∈ {nmibc, mibc, undetermined} / decided_at / reason | `idx_line_current`；`supersedes_id` + `is_current` | DESIGN-08 | **可改但留痕**：改主意本身是信息，不 UPDATE 覆盖 |
| `source_refs` | `id` | subject_id? | kind / label / version / url / verified | kind 枚举 9 类 | 获取成功 ≠ 已核实 | 不删 |
| `documents` | `id` | subject_id | relative_path / sha256 / mime / doc_kind / status | `UNIQUE(subject_id, sha256)` 去重用 | 导入 | status: candidate → confirmed |
| `candidate_fields` | `id` | document_id | field_key / raw_text / unit_raw / unit_norm / page / status | status ∈ {pending, accepted, edited, rejected} | MinerU 或手工抄录 | **永远候选**，逐项确认才进事实层 |
| `pathology_reports` | `id` | subject_id, document_id | muscle_present / reported_on / hospital | `muscle_present ∈ {有, 无, 未提及}` | 病理原件 | candidate → confirmed |
| `pathology_findings` | `id` | report_id | finding_key / value_raw / value_norm / graded_by | `ord` | 原文照录 | value_raw 不可改，纠正用新行 |
| `staging_assertions` | `id` | subject_id | kind / t_stage / n_stage / m_stage | `is_current` + `supersedes_id` | 借卵巢癌做法 | **多断言并列**，不合并成单值 |
| `surgery_events` | `id` | subject_id, diversion_id | kind / performed_on / resection_complete | kind 枚举 6 类 | 手术记录 | TURBT 与根治术两类字段集不同，不塞一张表 |
| `instillation_courses` | `id` | subject_id | drug_kind / dose_raw / planned_cycles / maintenance_note / stop_reason | drug_kind ∈ {BCG, chemotherapy, other} | 灌注共识 2021 | 疗程层 |
| `instillation_events` | `id` | course_id | seq / phase / planned_on / status / cancel_reason / retention_minutes | phase ∈ {即刻, 诱导, 维持}；`idx_inst_event` | 灌注共识 2021 | **取消也要记**；`retention_minutes` 默认空不给建议值 |
| `contraindication_flags` | `id` | event_id | flag_code / applies_to | applies_to ∈ {chemo, bcg, both} | 共识原文 | 可拦，但解释成「保护」 |
| `diversion_facts` | `id` | subject_id | kind | kind ∈ {ileal_conduit, orthotopic_neobladder, cutaneous_ureterostomy, other}；`is_current` | 质控 BT-16-01/02/03 | **不可逆事实**：改记录用 supersedes，不覆盖 |
| `stoma_supplies` | `id` | subject_id | category / brand / model / is_default | `retired_at` 软停用 | 患者自报 | 可复用目录，不用每次重打 |
| `stoma_logs` | `id` | subject_id, supply_id | batch_date / changes_count / leak_count / skin_state / actor | — | 患者/照护者 | **按一次录一批**，不是每日打卡 |
| `continence_logs` | `id` | subject_id | pad_count / residual_ml / catheterize_times | — | 原位新膀胱专属 | — |
| `metabolic_observations` | `id` | subject_id, source_ref_id | item_key ∈ 6 项 / value_raw | `source_ref_id` 一期为空 = 来源待补 | **11 份共识查不到原文** | 只留位置，不填数字不给阈值 |
| `followup_schedules` | `id` | subject_id, source_ref_id | modality / interval_text / source_version / next_due_on | — | 2022 版给间隔，2024 版不复述 | 间隔数字**必须带版本** |
| `cystoscopy_records` | `id` | subject_id | scope_kind / anesthesia / finding | scope_kind ∈ {flexible, rigid, fluorescence, unknown} | 复查记录 | — |
| `cystoscopy_experiences` | `id` | record_id, subject_id | pain_score / mood_note / worry_note | pain_score 0–10 | 本人自评 | **感受与临床结论分区**，不混一列 |
| `urine_cytology` | `id` | subject_id | result_state / specimen_kind / ancillary | `result_state ∈ {阴性, 非典型, 可疑, 阳性}` | 报告 | **四态四个值，不是布尔** |
| `upper_tract_surveillance` | `id` | subject_id | modality / side / finding | — | HER2 共识：我国尿路上皮癌 20%～30% 来自肾盂及输尿管 | **第二原发监测**，不推断转移 |
| `renal_thresholds` | `id` | source_ref_id | criterion / op / value / unit | op ∈ {lt, le, gt, ge} | 共识原文 | 门槛值只在有来源时显示并标日期 |
| `split_renal_function` | `id` | subject_id | left_pct / right_pct / gfr_total | — | 核素肾图 | **[共享件·待回填]** 与前列腺癌 T0 对齐 |
| `drainage_events` | `id` | subject_id | kind ∈ {dj_stent, nephrostomy, none} / side | — | 手术/影像记录 | — |
| `urgent_symptoms` | `id` | subject_id, source_ref_id | category ∈ 4 类 / observed_items / outcome_note | category 枚举 | 判据来源待补（图片未获取） | 只帮判断「算不算要马上处理」 |
| `treatment_lines` | `id` | subject_id | seq / line_kind / started_on / ended_on | `is_current` + `supersedes_id` | 治疗历程 | 只增不删 |
| `regimen_drugs` / `cycles` / `responses` | `id` | line_id | drug_name / schedule_text；seq / status；value_raw / basis | — | 医嘱与病历 | response 原文照录，不自套 RECIST |
| `metric_definitions` | `code` TEXT PK | — | name / cat / unit / dec / value_kind / ref_low / ref_high / ctcae_* / **version** | value_kind ∈ {num, text, categorical} | 指标目录 | 单位/方法/口径变化 → **升版本**，不原地改 |
| `observations` | `id` | subject_id, metric_code, source_ref_id, document_id | observed_on / value_num / value_text / lab / method / **group_key** / absence_state | `idx_obs_subject_metric`；`idx_obs_group`；CHECK 三项至少一项非空 | 化验单 | **缺测留 NULL，不写 0**；lab+method 变化 → 换 group_key → 不连线 |
| `symptom_entries` | `id` | subject_id | name / score / score_max | — | 本人自评 | 表达面，与指标面两列并置 |
| `questions` | `id` | subject_id | text / asked_on / answer_text / origin / confirmed | — | 本人或 Agent 建议 | 「已确认」只表示转录核对，**不等于医学审核** |
| `tasks` | `id` | subject_id | title / due_on / state / arranged_by | state ∈ {todo, done, cancelled} | 本人或医院安排 | — |
| `viewpoints` | `id` | subject_id | topic / text / **is_private DEFAULT 1** | 私密 fail-closed | 本人 | 未显式勾选绝不进导出与 AI 草稿 |
| `records` | `id` | subject_id, actor_id | entity_table / entity_id / action / at | action ∈ {create, update, invalidate} | 由写入层自动记 | **记录人与主体分离**，换人接手可答「谁记的、记的是谁」 |
| `change_log` | `id` | subject_id? | entity_table / entity_id / field / old_value / new_value / reason / at | `idx_change_entity` | 由写入层自动记 | 只增不删；纠正用 supersedes + invalidated_at |
| `trials` | `id` | — | source / reg_no / status_raw / status_norm / scope / setting / raw_json | `UNIQUE(source, reg_no)`；`idx_trials_scope` | 自采 CT.gov + ChiCTR | scope 是派生分类，**不删记录只打标** |
| `trial_bookmarks` | `id` | subject_id, trial_id | note | `UNIQUE(subject_id, trial_id)` | 患者收藏 | — |
| `demo_meta` | `key` | — | value / schema_version | — | 演示用 | 演示档案与真实档案一眼可分 |

**实体图**（文字版，箭头 = 外键方向）：

```
subjects ──┬─ line_selections（分野，可改留痕）
           ├─ documents ── candidate_fields（永远候选）
           ├─ pathology_reports ── pathology_findings
           ├─ staging_assertions（多断言并列）
           ├─ surgery_events ──┐
           ├─ instillation_courses ── instillation_events ── contraindication_flags
           ├─ diversion_facts ◄─┘（术式是不可逆事实）
           │    ├─ stoma_supplies ── stoma_logs
           │    └─ continence_logs
           ├─ followup_schedules
           ├─ cystoscopy_records ── cystoscopy_experiences
           ├─ urine_cytology / upper_tract_surveillance
           ├─ split_renal_function / drainage_events / renal_thresholds
           ├─ urgent_symptoms
           ├─ treatment_lines ── regimen_drugs / cycles / responses
           ├─ observations ── metric_definitions（同一目录供指标页与一图秀共用）
           ├─ symptom_entries / viewpoints / questions / tasks
           ├─ trial_bookmarks ── trials
           └─ records / change_log（审计，指向任意 entity_table+entity_id）
```

**扩展策略**
- **定义目录新增** vs **结构迁移**的边界：新增一个普通指标 = 往 `metric_definitions` 插一行（必要时 `version+1`），**不迁移**；新增一类检查或一类事件（例如以后要加尿动力学）= **结构迁移**，新增 `NNNN_*.sql`。
- 核心关系（subject / document / observation / line / diversion / instillation）**一律外键 + CHECK**，不塞进任意 JSON。`observed_items`、`raw_json` 两处 JSON 是**边界明确的封闭集合**（判据勾选项、登记库原始记录），带 schema_version 与上限，不拿来当通用扩展位。
- **同名同义不同表**是刻意的：TURBT 与根治术、膀胱镜记录与膀胱镜感受、疗程与每次灌注，字段集和生命周期都不同，合并会让约束失效。

**迁移 ledger / 旧库 fixture / 备份 / 事务 / 回滚兼容**
- `schema_migrations(version, name, applied_at)` 是台账，用 `CREATE TABLE IF NOT EXISTS` 建（写在迁移里会「自己建自己」）。
- 迁移**只增不改**；冻结后每个文件记 sha256 到 `schema/freeze-contract.md`，由 `check-schema` 逐条比对（该合同在 G3 签认、进 `schema/` 时才建）。
- 每个迁移配一份旧库 fixture，跑「旧库 + 新迁移」读一遍，确认不要求用户清库。
- 写入在一个事务里完成；失败整体回滚，不留半条记录。
- **源码回滚与数据库兼容分开判断** —— 不以清库恢复版本。

**数据根选择、相对路径校验、公共与私人数据分离**
- 业务数据落用户确认的资料根目录（设置页可改，默认缩成 `~` 显示）；`documents.relative_path` **只存相对路径**，绝不落绝对路径、绝不带用户名。
- 切换资料根后**旧快照立即失效**。
- 私密数据（`viewpoints.is_private=1`、`cystoscopy_experiences.worry_note`、性功能与亲密相关）默认不进导出、不进 AI 草稿，需显式勾选；未勾选时在草稿里写「未带入」。

**统一读模型与跨页一致性验收**
- 一图秀 / 指标卡 / 复诊摘要 / 导出**共用同一指标目录与同一份观察记录**，页面不各存一份。
- 分组名与顺序两页一致（检查与指标页 / 一图秀页）—— 已由自检脚本断言。
- 演示数据（`prototypes/v0.1/data.js`）**不进库**，只在 HTML 原型里跑。

---

## 持久化与记忆选型（互动确认）

**等级：A（本地单机 SQLite + 本地文件）**。理由：患者病历与私密记录**不得出本机**（组织四条不可让步之二）；单用户、单机、无并发写入者；需要事务与增量迁移；离线必须可用。

**预计规模/增长**：单档案实测级 —— 观察记录百级、文档十级、灌注事件十级、造口批次十级；十年随访量级仍在**千条以内**。增长来自观察记录与造口批次，不是文档。常用查询：按 `subject + metric_code + observed_on` 取序列；按 `subject` 取全档；按 `scope + study_type` 筛试验。**并发写入者：单一（本人或照护者，非同时）**；离线要求：必须。

**SQLite 的实际运行条件与备选方案**：Node 侧走 `node:sqlite`（Node ≥22 内置）；备选 JSON 文件仅用于 `localStorage` 级偏好（字号、当前页签、面板宽度），**业务事实不用 JSON 兜底**。`trials` 表约 295 行，可随 db 一起分发；原始 JSONL 作为可重建来源保留在 `research/bladder-cancer/`。

| 数据类别 | 权威位置/格式 | 读写责任 | 来源/revision | 索引/失效/保留规则 |
| --- | --- | --- | --- | --- |
| 已确认业务事实 | SQLite（`schema/`） | 写入层唯一入口；UI 只通过命令用例写 | 每条带 `source_ref_id` 或 `document_id`；`change_log` 记 revision | 保留；纠正用 `supersedes_id` + `invalidated_at`，物理行不删 |
| 文件与产物 | 资料根目录下的原文件 + `documents` 元信息 | 导入时算 sha256 | 原件 | `UNIQUE(subject_id, sha256)` 去重；卸载不删除 |
| 偏好/摘要/检索记忆（可选） | `localStorage`（字号/页签/面板宽度）；摘要不落库，读取时生成 | 前端 | 用户操作 | 可清空，不影响事实层 |
| 可重建内存缓存/派生索引 | 无持久化 | — | 由事实层派生 | 分级结果、归一化坐标**读取时算，不落库** |

**同步**：单机无同步。若将来接云，**默认不开启**，且必须在设置页明示发送路径与范围。
**检索**：按 `subject_id` 过滤是**强制项**（多档案时不串档）；来源核对走 `source_ref_id`；过期与冲突由 `followup_schedules.source_version` 与 `staging_assertions.is_current` 表达。
**纠正/删除**：`change_log` 只增；删除用 `invalidated_at` 标记失效，**不物理删除**；私密项失效后其历史快照同步失效。
**外部记忆的实际 API/版本/部署/发送范围**：本项目**不引入外部记忆**。唯一云能力是 MinerU 文档解析，且用户显式触发；不可用时退化为手动抄录，本地路径始终是权威。
**性能证据**：**未测量** —— 尚无真实数据量，不写「已优化」。目标：单档案全档读取 < 200ms、一图秀重绘 < 50ms（G3 后实测补填）。
**确认人/日期、未决项**：**未确认**。未决项：① `split_renal_function`、`stoma_supplies`、`diversion_facts` 三块共享件待与前列腺癌 T0 对齐 ② `metabolic_observations` 全部来源待补 ③ 性功能与生育字段无权威来源，一期留字段不填值 ④ 试验库 `setting` 是标题推断的线索字段，不代表入组资格。

---

## 前端与业务流程变化矩阵（建库前必填）

**边界**：领域事实/关系 = `schema/`（事实层，G3 后只增不改）；工作流定义与实例 = `line_selections.is_current` / `instillation_events.status` / `change_log`；页面读模型/偏好 = 视图 + `localStorage`。
**稳定 ID / revision**：所有实体用不透明稳定 ID，不用自增；`change_log` 记 revision；流程定义版本走 `metric_definitions.version`，已有实例不受影响。
**状态转换与跳过/重开/取消语义**：灌注 `status ∈ {planned, done, cancelled, skipped, delayed}`，**取消必须带 `cancel_reason`**（取消是信息不是空白）；分野可改，旧值 `is_current=0` 保留；步骤跳过 = 状态置 `skipped`，不删行。

| 变化情境 | 不变的事实/关系 | 配置/投影/API变化 | 迁移/旧记录读取与恢复 | 验收证据 |
| --- | --- | --- | --- | --- |
| 改导航/布局/同一事实多视图 | 所有事实表与外键不变 | 只改读模型与前端；分组名/顺序由读模型统一提供 | 无需迁移 | 两页组名顺序一致（已有断言） |
| 新字段/指标/可选记录类型 | 核心关系与约束不变 | 新指标 = `metric_definitions` 插行（可 `version+1`）；新可选记录类型 = 新增表 + 视图 | 旧记录在新视图下按缺省呈现，不报错 | 指标卡/一图秀同时读到新指标 |
| 步骤插入/跳过/重开/并行 | 事实行不删 | 用状态字段 + `change_log` 表达 | 旧流程实例按原状态读取 | 取消一次灌注后治疗历程仍完整 |
| 来源更正/删除/摘要与缓存失效 | 物理行保留 | 标 `invalidated_at` + `supersedes_id`；派生摘要与缓存失效重算 | 旧来源仍可追溯（`source_ref_id` 保留） | 改误录分级后旧值可查 |
| 旧数据库/旧API客户端升级 | — | 新增 `NNNN_*.sql`；视图层做兼容 | 旧库跑一遍新迁移，不清库 | 旧库 fixture 读通 |

不把 UI 模拟数据当表，不为每个步骤复制事实；不通过无限 JSON、重置库或无理由的全量事件溯源代替设计。详见 `docs/14-HTML-AND-DATA-CONTRACT.md`。

---

## UI/流程变化的承受能力（必填）

领域实体/证据/主体/状态/版本是稳定核心；UI 通过命令用例写入、通过版本化读模型读取。**不按 Tab 复制事实，不把整页 state 当业务存储。**

| 变化 | 改哪层 | 是否迁移 | 兼容/恢复方式 |
| --- | --- | --- | --- |
| 页面拆合/移位 | 前端路由与读模型 | 否 | 读模型按 `subject_id + metric_code` 取数，与页面无关 |
| 流程先后改变 | 状态字段 + `change_log` | 否 | 已有实例按原状态读；新实例按新顺序 |
| 新增普通指标 | `metric_definitions` 插行 | 否 | 旧记录无该指标 = 无数据，给空态不报错 |
| 来源更正 | 事实行 + `source_ref_id` | 否 | `supersedes_id` 链可回溯；派生结果重算 |
| 候选 → 接受 | `status` 字段 | 否 | 候选不进读模型；接受后才出现在档案页 |
| 未知字段/枚举 | 新增枚举值 = 结构迁移 | **是** | 新增 `NNNN_*.sql`；旧值仍合法 |
| 隐私派生与快照失效 | `is_private` + 导出/草稿过滤 | 否 | 改成私密后，已有导出与草稿**同步失效** |

HTML 确认前是候选模型/模拟 adapter，确认对应模块后复核并落实生产 schema/API；仅布局/字段顺序变化**不能迫使用户清库**。JSON 扩展有类型/schema/version/上限，核心关系保留外键与约束；写入有 revision/幂等/事务。记录真实迁移/并发/故障证据，**未执行标未验证**。
