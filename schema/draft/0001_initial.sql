-- 0001_initial.sql · 小泉宝 UroPal 膀胱癌工作台（草案）
--
-- ⚠️ 这是**草案**，不是冻结迁移。G3（数据契约）未签认之前不进 `schema/`，
--    也不写 `schema/freeze-contract.md`。冻结后本文件不许再改，只能新增 NNNN_*.sql。
--
-- 为什么放 draft/：docs/SCHEMA.md 与 docs/SPEC.md 都写明「HTML 确认后再复核落实生产
-- schema/迁移」（docs/14-HTML-AND-DATA-CONTRACT.md）。原型期把模型先写成 SQL 是为了
-- **用真实约束走查一遍**（三态分野、四态尿细胞学、双分级不换算、不可逆术式），
-- 而不是为了提前锁死。
-- 「模拟数据不进库」的准确意思是：**不把编造的患者病历写进事实表**。
-- 演示档案本身要留一条可辨识的标记（见 §14 demo_meta），
-- 否则真实数据与演示数据混在一起就再也分不开了 —— 两件事不矛盾。
--
-- 与泌尿族样板（前列腺癌 T0）的关系：DESIGN-01 定膀胱癌为泌尿族实际先行者，
-- 家族基线未定，所以「肾功能与分肾核素」「尿流改道通用字段」「造口耗材目录」
-- 三块按本项目需要先建，标 `-- [共享件·待回填]`，等前列腺癌 T0 出来再对齐。

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- 0. 迁移台账
-- ---------------------------------------------------------------------------
-- 台账必须先于迁移存在。生成器不管它，只有 dsh/store.js 的 migrate() 用
-- CREATE TABLE IF NOT EXISTS 建（写在迁移里会「自己建自己」）。
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL          -- ISO8601 带 +08:00
);

-- ---------------------------------------------------------------------------
-- 1. 工作区 / 主体
-- ---------------------------------------------------------------------------
-- subject = 患者档案。三条并列记录主体（NMIBC 患者本人 / MIBC 患者本人 / 照护者）
-- 不各建一张表：**主体是 subject，记录人是 actor**，见 records 的 actor 列。
CREATE TABLE subjects (
  id            TEXT PRIMARY KEY,          -- 稳定 ID，不用自增
  display_name  TEXT NOT NULL,
  relation      TEXT,                      -- 本人 / 配偶 / 子女 / 其他
  birth_year    INTEGER,                   -- 只存年，不存完整生日（最小化）
  is_self       INTEGER NOT NULL DEFAULT 1 CHECK (is_self IN (0, 1)),
  note          TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 一条档案属于哪条线 —— **可改，但改动必须留痕**（DESIGN-08 首屏先问一次分野）。
-- 不用 subjects.line 单列存当前值就完事：患者会改主意，改主意这件事本身是信息。
CREATE TABLE line_selections (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  line          TEXT NOT NULL CHECK (line IN ('nmibc', 'mibc', 'undetermined')),
  decided_at    TEXT NOT NULL,
  reason        TEXT,                      -- 「报告看不懂」也是合法理由
  supersedes_id TEXT REFERENCES line_selections(id),
  is_current    INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_line_current ON line_selections(subject_id, is_current);

-- ---------------------------------------------------------------------------
-- 2. 来源与文档
-- ---------------------------------------------------------------------------
CREATE TABLE source_refs (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT REFERENCES subjects(id),
  kind        TEXT NOT NULL CHECK (kind IN
                ('hospital_report', 'guideline', 'consensus', 'patient_edu',
                 'registry', 'society', 'self_report', 'agent_suggestion', 'other')),
  label       TEXT NOT NULL,
  version     TEXT,                        -- 指南/共识必须给版本或年份
  url         TEXT,
  accessed_at TEXT,
  -- 获取成功 ≠ 已核实。verified 只表示「人工核对过来源本身」。
  verified    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  created_at  TEXT NOT NULL
);

CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  relative_path TEXT NOT NULL,             -- 相对资料根目录，绝不存绝对路径
  sha256        TEXT NOT NULL,             -- 同一文件重复导入要能认出
  mime          TEXT,
  bytes         INTEGER,
  doc_kind      TEXT CHECK (doc_kind IN
                  ('pathology', 'cystoscopy', 'cytology', 'imaging', 'lab',
                   'discharge', 'operative', 'other')),
  -- 「待核对草稿」与「病情档案」分区：确认前永远 candidate。
  status        TEXT NOT NULL DEFAULT 'candidate'
                  CHECK (status IN ('candidate', 'confirmed', 'rejected')),
  imported_at   TEXT NOT NULL,
  UNIQUE (subject_id, sha256)
);

-- 解析候选字段：MinerU 或手工抄录的产物，逐项确认才进事实层。
CREATE TABLE candidate_fields (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id),
  field_key     TEXT NOT NULL,
  raw_text      TEXT,                      -- 原样抄写，不做判断
  unit_raw      TEXT,
  unit_norm     TEXT,                      -- 归一前先剥 LaTeX 外壳（$10^9/L$ → 10⁹/L）
  page          INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'edited', 'rejected')),
  reviewed_at   TEXT,
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3. 病理与分期（膀胱癌专属 · 维度 1/2/5）
-- ---------------------------------------------------------------------------
-- 病理是一条「报告」，报告里有多条发现。分开存，因为一份报告会同时给
-- 两套分级（WHO 1973 的 G1/G2/G3 与 2004/2022 的低/高级别）——
-- **两套并列保存，不做任何换算，也不出等价表述**。
CREATE TABLE pathology_reports (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  document_id   TEXT REFERENCES documents(id),
  reported_on   TEXT,
  hospital      TEXT,
  -- 「未见肌层」是分期不完整，不是好消息。三态必须可区分：
  muscle_present TEXT CHECK (muscle_present IN ('有', '无', '未提及')),
  muscle_note    TEXT,
  status        TEXT NOT NULL DEFAULT 'candidate'
                  CHECK (status IN ('candidate', 'confirmed')),
  created_at    TEXT NOT NULL
);

CREATE TABLE pathology_findings (
  id            TEXT PRIMARY KEY,
  report_id     TEXT NOT NULL REFERENCES pathology_reports(id),
  finding_key   TEXT NOT NULL,             -- 组织学类型 / 分级 / 浸润深度 / 淋巴血管侵犯 …
  value_raw     TEXT NOT NULL,             -- 原文照录，改一个字都要留原值
  value_norm    TEXT,                      -- 归一后的枚举，认不出就留空并标未核实
  graded_by     TEXT,                      -- 'WHO1973' / 'WHO2004_2022' / 未注明
  -- 组织学变异型（S18）：finding_key='组织学变异类型' 时 value_raw 照录
  -- （腺样/鳞状/巢状/微乳头样/神经内分泌分化…）。是否占主要类型（>50%）单独一列
  -- 且三态受控——因为「报告没提」和「明确说不是」是两回事，不能混成一个空值。
  variant_is_predominant TEXT CHECK (variant_is_predominant IN ('是','否','未提及')),
  verified      INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  ord           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_path_finding ON pathology_findings(report_id, ord);

-- 分期用**多断言并列**（借卵巢癌做法），不用单值 staging 字段：
-- 同一患者可能同时有临床分期与病理分期，且两者可能不一致。
CREATE TABLE staging_assertions (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  kind          TEXT NOT NULL CHECK (kind IN ('clinical', 'pathological', 'post_neoadjuvant')),
  t_stage       TEXT,
  n_stage       TEXT,
  m_stage       TEXT,
  asserted_on   TEXT,
  source_ref_id TEXT REFERENCES source_refs(id),
  supersedes_id TEXT REFERENCES staging_assertions(id),
  is_current    INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 4. 手术（维度 2）
-- ---------------------------------------------------------------------------
-- TURBT 与根治术是两类记录，字段集不同，不塞一张表。
-- 二次电切是同一手术线的下一事件，**不新建档案**。
CREATE TABLE surgery_events (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  kind          TEXT NOT NULL CHECK (kind IN
                  ('turbt', 're_turbt', 'radical_cystectomy', 'partial_cystectomy',
                   'nephroureterectomy', 'other')),
  performed_on  TEXT NOT NULL,
  hospital      TEXT,
  -- TURBT 专属：是否完全切除（决定要不要二次电切）
  resection_complete TEXT CHECK (resection_complete IN ('完全', '不完全', '未记录')),
  re_turbt_reason    TEXT,
  -- 根治术专属：改道方式。**不可逆事实**，改记录留痕不覆盖。
  diversion_id  TEXT REFERENCES diversion_facts(id),
  note          TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_surgery_subject ON surgery_events(subject_id, performed_on);

-- ---------------------------------------------------------------------------
-- 5. 膀胱灌注（维度 3）—— 疗程 + 每次事件两层
-- ---------------------------------------------------------------------------
CREATE TABLE instillation_courses (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  drug_kind     TEXT NOT NULL CHECK (drug_kind IN ('BCG', 'chemotherapy', 'other')),
  drug_name     TEXT,
  dose_raw      TEXT,                      -- 「国产 BCG 120 mg」原文；不给建议值
  started_on    TEXT,
  planned_cycles INTEGER,                  -- 诱导计划次数
  maintenance_note TEXT,                   -- 维持方案原文；不确定就空着
  ended_on      TEXT,
  stop_reason   TEXT,                      -- 断供 / 副作用 / 完成 / 其他
  supply_note   TEXT,                      -- BCG 断供备注
  created_at    TEXT NOT NULL
);

-- 每次灌注是一条事件。phase 分「即刻 / 诱导 / 维持」三段，
-- **不是等距序列**（诱导每周 1 次，维持每 2～4 周 1 次）。
CREATE TABLE instillation_events (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES instillation_courses(id),
  seq           INTEGER,                   -- 第几次（诱导与维持各自计）
  phase         TEXT NOT NULL CHECK (phase IN ('即刻', '诱导', '维持')),
  planned_on    TEXT,
  performed_on  TEXT,
  status        TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'done', 'cancelled', 'skipped', 'delayed')),
  cancel_reason TEXT,                      -- 「因肉眼血尿取消」；取消也要记
  retention_minutes INTEGER,               -- 灌注后憋尿时间。**默认空，不给建议值**
  urine_output_note TEXT,
  side_effect   TEXT,
  created_at    TEXT NOT NULL,
  -- 「取消也要记原因」光写在文档里约束不住（AC-10）。写成表级 CHECK：
  -- 不是要求把原因解释清楚，只要求不能空着 —— 空着的取消等于把一次
  -- 治疗中断变成不可追问的空白。
  CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND length(trim(cancel_reason)) > 0))
);
CREATE INDEX idx_inst_event ON instillation_events(course_id, planned_on);

-- 禁忌旗标：化疗药 4 条 + BCG 另加 2 条。**可拦但要解释成「保护」**，不给处置建议。
CREATE TABLE contraindication_flags (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES instillation_events(id),
  flag_code     TEXT NOT NULL,             -- perforation / gross_hematuria / chemical_cystitis /
                                           -- acute_uti / post_op_2w / traumatic_catheter
  applies_to    TEXT NOT NULL CHECK (applies_to IN ('chemo', 'bcg', 'both')),
  observed_on   TEXT,
  source_ref_id TEXT REFERENCES source_refs(id),
  note          TEXT
);

-- ---------------------------------------------------------------------------
-- 6. 尿流改道与造口（维度 8/9/10）
-- ---------------------------------------------------------------------------
CREATE TABLE diversion_facts (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  kind          TEXT NOT NULL CHECK (kind IN
                  ('ileal_conduit', 'orthotopic_neobladder', 'cutaneous_ureterostomy', 'other')),
  performed_on  TEXT,
  -- 不可逆：改记录用 supersedes，不 UPDATE 覆盖
  supersedes_id TEXT REFERENCES diversion_facts(id),
  is_current    INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  note          TEXT,
  created_at    TEXT NOT NULL
);

-- [共享件·待回填] 造口耗材可复用目录：型号从目录里选，不用每次重打
CREATE TABLE stoma_supplies (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  category      TEXT NOT NULL,             -- 底盘 / 造口袋 / 防漏环 / 护肤粉 …
  brand         TEXT,
  model         TEXT NOT NULL,
  size_note     TEXT,
  is_default    INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  retired_at    TEXT,                      -- 停产/换型号不删除
  created_at    TEXT NOT NULL
);

-- 造口日记**按一次录一批**，不是每日打卡
CREATE TABLE stoma_logs (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  supply_id     TEXT REFERENCES stoma_supplies(id),
  batch_date    TEXT NOT NULL,
  changes_count INTEGER,                   -- 这批换了几次
  leak_count    INTEGER,
  skin_state    TEXT,                      -- 红 / 破皮 / 无 …
  odor_note     TEXT,
  night_bag     TEXT,
  -- 原来这里是 actor TEXT（自由文本）。它是 records.actor_id 的弱化副本：
  -- 同一件事有两个来源，其中一个还不是外键，照护者代记反而查不准。
  -- 「谁记的」统一走 records.actor_id 一层（见文件末「谁记的」小节）。
  -- 身体形象相关默认私密（DESIGN-09 / SPEC M05）：默认 1，未显式勾选绝不出本机。
  is_private    INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0, 1)),
  created_at    TEXT NOT NULL
);

-- 原位新膀胱专属：控尿训练 / 间歇导尿 / 残余尿
CREATE TABLE continence_logs (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  d             TEXT NOT NULL,
  pad_count     INTEGER,
  residual_ml   INTEGER,
  catheterize_times INTEGER,
  note          TEXT,
  -- 控尿/导尿/残余尿属于身体功能，默认私密（同上）
  is_private    INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0, 1)),
  created_at    TEXT NOT NULL
);

-- 改道后代谢长期负担（维度 10）。**来源待补**：B12/碳酸氢盐/氯/结石/尿感
-- 在已精读的 11 份中文共识里查不到原文，所以此处只留位置，不填数字不给阈值。
CREATE TABLE metabolic_observations (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  item_key      TEXT NOT NULL CHECK (item_key IN
                  ('bicarbonate', 'chloride', 'potassium', 'vitamin_b12',
                   'urinary_infection', 'stone')),
  d             TEXT,
  value_raw     TEXT,
  unit_raw      TEXT,
  source_ref_id TEXT REFERENCES source_refs(id),   -- 一期为空 = 来源待补
  note          TEXT,
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 7. 复查与膀胱镜（维度 4/5/6）
-- ---------------------------------------------------------------------------
CREATE TABLE followup_schedules (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  modality      TEXT NOT NULL CHECK (modality IN
                  ('cystoscopy', 'urine_cytology', 'imaging', 'upper_tract', 'lab')),
  interval_text TEXT,                      -- 「每 3 个月」原文
  -- 间隔数字必须带版本。2022 版给 3/6/12 个月，2024 版不再复述 —— 不能混。
  source_version TEXT,
  source_ref_id TEXT REFERENCES source_refs(id),
  next_due_on   TEXT,
  planned_note  TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE cystoscopy_records (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  performed_on  TEXT,
  scope_kind    TEXT CHECK (scope_kind IN ('flexible', 'rigid', 'fluorescence', 'unknown')),
  anesthesia    TEXT CHECK (anesthesia IN ('none', 'local', 'spinal', 'general', 'unknown')),
  finding       TEXT,
  source_ref_id TEXT REFERENCES source_refs(id),
  created_at    TEXT NOT NULL
);

-- 膀胱镜是**有创且心理事件**。感受与临床结论分区存放，不混一列。
CREATE TABLE cystoscopy_experiences (
  id            TEXT PRIMARY KEY,
  record_id     TEXT REFERENCES cystoscopy_records(id),
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  pain_score    INTEGER CHECK (pain_score BETWEEN 0 AND 10),
  mood_note     TEXT,
  worry_note    TEXT,                      -- 复发恐惧独立记录位（E4，见下）
  -- 疼痛 / 心情 / 复发恐惧三项默认私密。复查感受是最容易被"顺手带进导出"的内容，
  -- 所以默认值为 1（fail-closed），要带出去必须显式勾选（SPEC M09）。
  is_private    INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0, 1)),
  recorded_at   TEXT NOT NULL
);

-- 尿细胞学：**四态四个值，不是布尔**。非典型既不等于阳性也不等于阴性。
CREATE TABLE urine_cytology (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  collected_on  TEXT NOT NULL,
  result_state  TEXT NOT NULL CHECK (result_state IN ('阴性', '非典型', '可疑', '阳性')),
  -- 标本方式参与可比性判断（自然尿 vs 膀胱冲洗），不参与就不给结论
  specimen_kind TEXT CHECK (specimen_kind IN ('voided', 'bladder_wash', 'catheterized', 'unknown')),
  ancillary     TEXT,                      -- FISH / NMP22 / BTA 结果原文
  report_text   TEXT,
  source_ref_id TEXT REFERENCES source_refs(id),
  created_at    TEXT NOT NULL
);

-- 上尿路是**第二原发监测**，不并入膀胱局部复查，也不用来推断是否转移
CREATE TABLE upper_tract_surveillance (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  d             TEXT,
  modality      TEXT CHECK (modality IN ('ct_urography', 'mru', 'ultrasound', 'ureteroscopy', 'cytology', 'other')),
  finding       TEXT,
  side          TEXT CHECK (side IN ('left', 'right', 'bilateral', 'unknown')),
  source_ref_id TEXT REFERENCES source_refs(id),
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 8. 肾功能与顺铂门槛（维度 7）
-- ---------------------------------------------------------------------------
-- 顺铂门槛 CrCl＜60 ml/min 或 eGFR ≤60 —— 门槛值只在有来源时显示并标出处日期。
CREATE TABLE renal_thresholds (
  id            TEXT PRIMARY KEY,
  criterion     TEXT NOT NULL,             -- 'cisplatin_crcl' / 'cisplatin_egfr'
  op            TEXT NOT NULL CHECK (op IN ('lt', 'le', 'gt', 'ge')),
  value         REAL NOT NULL,
  unit          TEXT NOT NULL,
  source_ref_id TEXT REFERENCES source_refs(id),
  effective_from TEXT,
  note          TEXT
);

-- [共享件·待回填] 分肾核素肾图（与前列腺癌 T0 对齐）
CREATE TABLE split_renal_function (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  d             TEXT,
  left_pct      REAL,
  right_pct     REAL,
  method        TEXT,
  gfr_total     REAL,
  source_ref_id TEXT REFERENCES source_refs(id),
  created_at    TEXT NOT NULL
);

CREATE TABLE drainage_events (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  kind          TEXT NOT NULL CHECK (kind IN ('dj_stent', 'nephrostomy', 'none')),
  side          TEXT CHECK (side IN ('left', 'right', 'bilateral', 'unknown')),
  placed_on     TEXT,
  removed_on    TEXT,
  reason        TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 9. 急症与安全（维度 11）
-- ---------------------------------------------------------------------------
-- 四类各自独立入口。**只帮判断「算不算要马上处理」，不写因果、不写处置。**
CREATE TABLE urgent_symptoms (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  category      TEXT NOT NULL CHECK (category IN
                  ('clot_retention', 'bcg_systemic', 'stoma_ischemia', 'anuria_flank_pain', 'other')),
  observed_on   TEXT,
  observed_items TEXT,                     -- 勾了哪几条判据（JSON 数组，项数有限）
  outcome_note  TEXT,
  source_ref_id TEXT REFERENCES source_refs(id),   -- 一期为空 = 判据来源待补
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 10. 治疗历程（维度 1/3/7 的交叉视图来源）
-- ---------------------------------------------------------------------------
CREATE TABLE treatment_lines (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  seq           INTEGER NOT NULL,
  line_kind     TEXT CHECK (line_kind IN
                  ('turbt', 'intravesical', 'neoadjuvant', 'adjuvant', 'radical',
                   'systemic_1l', 'systemic_2l', 'radiotherapy', 'surveillance', 'other')),
  started_on    TEXT,
  ended_on      TEXT,
  intent        TEXT,
  supersedes_id TEXT REFERENCES treatment_lines(id),
  is_current    INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  created_at    TEXT NOT NULL
);

CREATE TABLE regimen_drugs (
  id            TEXT PRIMARY KEY,
  line_id       TEXT NOT NULL REFERENCES treatment_lines(id),
  drug_name     TEXT NOT NULL,
  dose_text     TEXT,
  schedule_text TEXT,
  is_trial_drug INTEGER NOT NULL DEFAULT 0 CHECK (is_trial_drug IN (0, 1)),
  ord           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cycles (
  id            TEXT PRIMARY KEY,
  line_id       TEXT NOT NULL REFERENCES treatment_lines(id),
  seq           INTEGER,
  planned_on    TEXT,
  performed_on  TEXT,
  status        TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'done', 'cancelled', 'skipped', 'delayed')),
  note          TEXT
);

CREATE TABLE responses (
  id            TEXT PRIMARY KEY,
  line_id       TEXT NOT NULL REFERENCES treatment_lines(id),
  assessed_on   TEXT,
  value_raw     TEXT,                      -- 原文照录，不自行套 RECIST
  basis         TEXT,
  source_ref_id TEXT REFERENCES source_refs(id),
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 11. 指标目录与观察记录（M13 · 一图秀/指标卡共用同一事实源）
-- ---------------------------------------------------------------------------
CREATE TABLE metric_definitions (
  code          TEXT PRIMARY KEY,          -- 稳定的机器可用编码
  name          TEXT NOT NULL,
  cat           TEXT NOT NULL,             -- 组名（两页组名/顺序必须一致）
  unit          TEXT NOT NULL,
  dec           INTEGER NOT NULL DEFAULT 1,
  value_kind    TEXT NOT NULL CHECK (value_kind IN ('num', 'text', 'categorical')),
  ref_low       REAL,
  ref_high      REAL,
  -- CTCAE 对照只启用标准里**有绝对数值界限**的项；「×ULN」型不启用也不近似
  ctcae_grade   INTEGER,
  ctcae_text    TEXT,
  ctcae_range   TEXT,
  version       INTEGER NOT NULL DEFAULT 1, -- 单位/方法/口径变化 → 升版本，不原地改
  retired_at    TEXT,
  created_at    TEXT NOT NULL
);

-- 观察记录。**缺测留 NULL，不写 0**。机构与方法变化 → 换 group_key → 不连线。
CREATE TABLE observations (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  metric_code   TEXT NOT NULL REFERENCES metric_definitions(code),
  observed_on   TEXT NOT NULL,
  value_num     REAL,                      -- 与 value_text 至少有一个非空
  value_text    TEXT,
  unit_raw      TEXT,
  unit_norm     TEXT,
  lab           TEXT,
  method        TEXT,
  group_key     TEXT,                      -- 由 lab+method 派生；跨组不连线
  source_ref_id TEXT REFERENCES source_refs(id),
  document_id   TEXT REFERENCES documents(id),
  status        TEXT NOT NULL DEFAULT 'candidate'
                  CHECK (status IN ('candidate', 'confirmed', 'rejected')),
  -- 六态不可混同：未检测 ≠ 未检出 ≠ 阴性 ≠ 失败 ≠ 待出 ≠ VUS
  absence_state TEXT CHECK (absence_state IN
                  ('not_tested', 'not_detected', 'negative', 'failed', 'pending', 'vus')),
  note          TEXT,
  created_at    TEXT NOT NULL,
  CHECK (value_num IS NOT NULL OR value_text IS NOT NULL OR absence_state IS NOT NULL)
);
CREATE INDEX idx_obs_subject_metric ON observations(subject_id, metric_code, observed_on);
CREATE INDEX idx_obs_group ON observations(subject_id, metric_code, group_key, observed_on);

-- 症状自评（表达面）。与指标面**两列并置**，不写因果、不写处置。
CREATE TABLE symptom_entries (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  d             TEXT NOT NULL,
  name          TEXT NOT NULL,             -- 疼痛 / 排尿困扰 / 乏力 …
  score         INTEGER,
  score_max     INTEGER DEFAULT 10,
  note          TEXT,
  -- 症状自评常含身体与情绪内容，默认私密
  is_private    INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0, 1)),
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 12. 咨询问题 / 待办 / 私密 / 变更留痕
-- ---------------------------------------------------------------------------
CREATE TABLE questions (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  text          TEXT NOT NULL,
  asked_on      TEXT,
  answer_text   TEXT,
  origin        TEXT,                      -- self / agent_suggestion / summary
  -- 「已确认」只表示转录核对，**不等于医学审核**
  confirmed     INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
  created_at    TEXT NOT NULL
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  title         TEXT NOT NULL,
  due_on        TEXT,
  state         TEXT NOT NULL DEFAULT 'todo'
                  CHECK (state IN ('todo', 'done', 'cancelled')),
  arranged_by   TEXT CHECK (arranged_by IN ('self', 'hospital', 'unknown')),
  created_at    TEXT NOT NULL
);

-- 私密默认 fail-closed：is_private 默认 1，未显式勾选绝不进导出与 AI 草稿。
CREATE TABLE viewpoints (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  topic         TEXT NOT NULL,             -- 身体形象 / 性功能与亲密 / 复发恐惧 …
  text          TEXT,
  is_private    INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0, 1)),
  recorded_at   TEXT NOT NULL
);

-- 记录人与主体分离：换照护者接手时，能说出「这条是谁记的、记的是谁」。
CREATE TABLE records (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  actor_id      TEXT REFERENCES subjects(id),   -- 记录人
  entity_table  TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('create', 'update', 'invalidate')),
  at            TEXT NOT NULL,
  note          TEXT
);

-- 只增不删：纠正用 supersedes + invalidated_at，物理行保留。
-- 与「不以清库恢复版本」配套 —— 源码回滚与数据库兼容分开判断。
CREATE TABLE change_log (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT REFERENCES subjects(id),
  entity_table  TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  field         TEXT,
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,
  at            TEXT NOT NULL
);
CREATE INDEX idx_change_entity ON change_log(entity_table, entity_id, at);

-- ---------------------------------------------------------------------------
-- 13. 临床试验（2026 登记数据 · 双源）
-- ---------------------------------------------------------------------------
-- 登记状态 ≠ 入组资格。scope 是抓取时自动分类的派生字段，**不删记录只打标**，
-- 查询用视图排除（见 v_bladder_only / v_interventional / v_china）。
CREATE TABLE trials (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL CHECK (source IN ('ctgov', 'chictr', 'cdr', 'other')),
  reg_no          TEXT NOT NULL,
  title           TEXT,
  title_cn        TEXT,
  status_raw      TEXT,
  status_norm     TEXT,                    -- 归一后的中文标签（原值保留在 status_raw）
  phase           TEXT,
  study_type      TEXT,                    -- interventional / observational / other
  scope           TEXT CHECK (scope IN ('bladder', 'utuc', 'urothelial-unspecified', 'other')),
  setting         TEXT,                    -- nmibc / mibc / advanced … （标题推断，是线索不是资格）
  sponsor         TEXT,
  institution     TEXT,
  country_cn      INTEGER CHECK (country_cn IN (0, 1)),
  first_posted    TEXT,
  updated_at_src  TEXT,
  url             TEXT,
  raw_json        TEXT,                    -- 原始记录；PII 写盘前已按字段名剥离
  UNIQUE (source, reg_no)
);
CREATE INDEX idx_trials_scope ON trials(scope, study_type);

CREATE TABLE trial_bookmarks (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  trial_id      TEXT NOT NULL REFERENCES trials(id),
  note          TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (subject_id, trial_id)
);

-- ---------------------------------------------------------------------------
-- 14. 演示元信息
-- ---------------------------------------------------------------------------
-- 演示档案与真实档案必须能一眼分开。JSON 扩展有类型/schema/version/上限，
-- 核心关系保留外键与约束，不拿无限 JSON 代替设计。
-- BCG 应答状态（S17）。status 只能来自"医生说了什么"：
-- decided_on 与 doctor_words_raw 必填，工作台不自行判定「无应答」。
-- 应答状态是患者要回顾的事实，改动进版本链不覆盖。
CREATE TABLE bcg_responses (
  id                TEXT PRIMARY KEY,
  subject_id        TEXT NOT NULL REFERENCES subjects(id),
  course_id         TEXT REFERENCES instillation_courses(id),
  status            TEXT NOT NULL CHECK (status IN ('初治','无应答','不耐受','未判定')),
  decided_on        TEXT,                  -- 医生给出这个判断的日期；status≠初治时必填
  decided_by_raw    TEXT,                  -- 医生原话里的角色；不猜姓名
  doctor_words_raw  TEXT,                  -- 医生原话照录；status≠初治时必填
  supersedes_id     TEXT REFERENCES bcg_responses(id),  -- 版本链，不覆盖旧判定
  is_current        INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1)),
  recorded_at       TEXT NOT NULL,
  CHECK (status = '初治' OR (decided_on IS NOT NULL AND doctor_words_raw IS NOT NULL))
);

-- 极高危四项构成（S17）。kind 四值**与 2024 版共识原文一一对应**，不得增补删减：
-- 「BCG 无应答、血管淋巴管侵犯、变异组织类型、前列腺尿道侵犯」
-- 每一项都要能回指原文条目（source_ref_id），否则它只是工作台的猜测。
CREATE TABLE high_risk_markers (
  id            TEXT PRIMARY KEY,
  subject_id    TEXT NOT NULL REFERENCES subjects(id),
  kind          TEXT NOT NULL CHECK (kind IN ('BCG无应答','血管淋巴管侵犯','变异组织类型','前列腺尿道侵犯')),
  source_ref_id TEXT REFERENCES source_refs(id),  -- 回指共识原文；NULL 表示尚未回指
  noted_on      TEXT,
  note_raw      TEXT,
  created_at    TEXT NOT NULL
);

-- 谁记的（照护者代记，DESIGN-09 / SPEC M10）
-- ---------------------------------------------------------------------------
-- 本草案**只有一层**记录人：records.actor_id（外键 → subjects.id）。
-- 刻意不在每张事实表上加 recorded_by —— 那样会有 44 份"谁记的"，
-- 改一次规则要改 44 处，且必然有一半忘记更新。
--
-- 因此有两条应用层不变量（**数据库管不住，只能靠代码与探针守**）：
--   1) 每条事实写入必须同时写一条 records 行（entity_table + entity_id + actor_id）；
--   2) 照护者代记时，actor_id 是**照护者**，subjects 里另有被记录人 ——
--      「记录人」与「当事人」是两个字段，不是一个字段的两种解释。
-- 已清除的历史写法：stoma_logs.actor（自由文本，非外键，已删）。
--
-- 隐私同样只有一处口径：敏感事实表上的 is_private，默认 1（fail-closed）。
-- 现有：viewpoints / stoma_logs / continence_logs / cystoscopy_experiences / symptom_entries。
CREATE TABLE demo_meta (
  key           TEXT PRIMARY KEY,
  value         TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT
);
