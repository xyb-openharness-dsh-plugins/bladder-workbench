/**
 * dsh/demo.js · 演示数据播种（M5 数据层）
 *
 * 为什么要有这个文件：原型（prototypes/v0.1/）的演示数据全在 window 上的
 * 全局 const 里，页面直接读它 —— 那样根本没有数据层，也证明不了「模型装得下
 * 这些事实」。这里把同一批事实**搬进 schema/0001_initial.sql 的真实表**，
 * 让开发版从 SQLite 读出来的东西和原型渲染结果一致。
 *
 * 三条硬原则（照家族 glioblastoma-workbench/dsh/demo.js 的结构，数据形状换成本项目的）：
 *   1) 演示内容**只有一份来源**：prototypes/v0.1/data.js。构建期由
 *      `demo/build-demo-data.mjs` 生成零损副本 `demo/demo-data.js`，本模块 import 它，
 *      不复制成第二份常量。同一份数据写两处必然漂移（docs/LESSONS.md 已踩过两次）。
 *   2) 一个档案一整套：DEMO-1（NMIBC 张先生）与 DEMO-2（MIBC 李先生）各自成行，
 *      不是「一份全局数据 + 一个 line 开关」。原型「切档案只影响看板、子页数据相同」
 *      的缺陷，靠这件事从数据层面消掉。
 *   3) 静态目录（NAV / CATEGORICAL / DIVERSION / CONTRA / URGENT / DRAFT_SCOPES /
 *      WORDING_REDLINES）**不入库**，由 dsh/readmodels.js 直接从 data.js 读出来放进
 *      catalogs —— 它们与具体患者无关，进库只会多一份会漂移的副本。
 *
 * 冻结 schema 里没有对应列的展示属性（原型的 pages / interval / cath / 问题分组 …）：
 * 不硬塞进临床列、也不复制成 JS 常量，而是**播种进 demo_meta 的 JSON 扩展位**
 * （schema 第 14 节「演示元信息」的用途）。读模型只读库，不回读 data.js 的患者事实。
 * 每个这样的缺口都在种子末尾的 hints 里逐条写明，并在交付报告里列出 —— 它们是
 * 数据模型的缺口，不是「绕过去就完了」。
 *
 * 本文件不做：迁移（store.js 的事）、读模型（readmodels.js 的事）、任何 UPDATE/DELETE。
 */
import { createHash } from 'node:crypto';
import { nowISO } from './store.js';
import * as PROTOTYPE_DATA from '../demo/demo-data.js';

/* ------------------------------------------------------------------ *
 * 一、唯一数据源：`demo/demo-data.js`（原型的零损副本，构建期生成）
 * ------------------------------------------------------------------ */

/**
 * 2026-10-24 装机探针抓到的 P0，改法记在这里（避免有人再改回去）：
 *
 * 原来这里是 `new URL('../prototypes/v0.1/data.js', import.meta.url)` + `node:vm` 读盘。
 * 仓库里跑得好好的，**装机副本里必然崩**：`prototypes/` 不在 `package.json` 的
 * `files` 白名单里（那是开发目录，不该随包分发），副本里没有这个目录，
 * `apply()` 在播种时抛 ENOENT，结果是插件在 Desktop 里整个挂不上
 * （apply 抛异常 → 一条路由都不注册 → 界面空白）。
 *
 * 现在改为 import `demo/demo-data.js`：它是构建期从原型 data.js **原文照搬 + 一行 export**
 * 生成的（见 `demo/build-demo-data.mjs`），原文一个字节没改，所以求值结果与 vm 版一致；
 * 而 `demo` 在 `files` 白名单里，装机副本必然带着它。
 * 漂移由 `npm run check:demo` 兜住（生成结果与磁盘不一致即失败）。
 *
 * 数据仍然只有一份来源：`prototypes/v0.1/data.js`。本模块只是它的派生物。
 */
let dataCache = null;

/**
 * 读演示数据（带缓存）。
 *
 * 返回**普通对象副本**而不是模块命名空间：模块命名空间是冻结的、且属性是 getter，
 * 万一后续有代码想就地加工（例如补一条演示记录）会静默失败或抛 TypeError。
 * 这里的浅拷贝只发生一次，成本可以忽略。
 */
export function loadPrototypeData() {
  if (dataCache) return dataCache;
  dataCache = { ...PROTOTYPE_DATA };
  return dataCache;
}

/**
 * 演示基准日。原型里最新的一条事实是 2026-10-23（试验收藏），M5 开发日 2026-10-24，
 * 所以「今天」取 10-24。**不写 new Date()**：播种必须可复现，否则每次跑出来的
 * 「下次复查还剩几天」都在变，测试也没法断言。
 */
export const DEMO_REF_DATE = '2026-10-24';

/** demo_meta 的三个键：数据集元信息 / 展示属性白名单 / 无表可落的内容块 */
export const META_KEYS = {
  dataset: 'uropal.demo.dataset',
  hints: 'uropal.demo.view_hints',
  free: 'uropal.demo.free_blocks',
};

/* ------------------------------------------------------------------ *
 * 二、两个档案的档案级事实（哪些是分线的，哪些是共享的）
 * ------------------------------------------------------------------ */

/**
 * 原型 data.js 里真正**按线切分**的只有四块：
 *   SURGERY_CASE / TREATMENT_CASE / DIVERSION_CASE（+ STOMA_SUPPLY/STOMA_LOG）。
 * 其余块（PATHOLOGY / INSTILLATION / FOLLOWUP / RENAL / METRICS / RECORDS / LIFE /
 * QUESTIONS / …）在 data.js 里只有一份，属于「当前演示档案」。
 *
 * 处理办法：共享块在两个档案下**各自独立成行**（各自 subject_id，内容相同）——
 * 这样切换档案时读到的是各行自己的数据，将来补了 DEMO-2 专属内容也只改 DEMO-2 的行；
 * 分线块各取各的切片。共享块内容相同这件事是**演示数据缺口**（不是模型缺口），
 * 已如实写进交付报告：要真正分开必须补 MIBC 演示数据，这里不编。
 */
const PROFILES = [
  {
    id: 'demo1',
    name: '张先生（演示）',
    relation: '本人',
    line: 'nmibc',
    lineLabel: '非肌层浸润（Ta/T1/Tis）· 保膀胱线',
    demoLabel: 'DEMO-1 · NMIBC 保膀胱线',
    decidedAt: '2026-10-02', // 来自 RECORDS.facts「所在分野」事实的日期
    decidedReason: null,
    withDiversion: false,
  },
  {
    id: 'demo2',
    // data.js 没有给出 DEMO-2 的姓名（只有「MIBC 患者本人」），所以不编姓氏。
    name: '演示档案 DEMO-2',
    relation: '本人',
    line: 'mibc',
    lineLabel: '肌层浸润（T2+）· 根治与改道线',
    demoLabel: 'DEMO-2 · MIBC 根治与改道线',
    // data.js 没给 DEMO-2 的分野日期，而 line_selections.decided_at 是 NOT NULL。
    // 用演示基准日登记，并把原因写进 reason（可追溯），不编一个具体历史日期。
    decidedAt: DEMO_REF_DATE,
    decidedReason: '原型未记录 DEMO-2 的分野日期；按演示基准日登记',
    withDiversion: true,
  },
];

/** 照护者主体：LIFE.handover.recordBy / RECORDS.facts「照护者代记」需要一个非本人 actor */
const CARER = { id: 'demo1-carer', name: '照护者（女儿）', relation: '子女', of: 'demo1' };

/* ------------------------------------------------------------------ *
 * 三、播种
 * ------------------------------------------------------------------ */

/** 占位文件哈希：演示文件不在磁盘上，用「占位说明串」的 sha256 让 UNIQUE 可用且可复现 */
function placeholderSha(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 日期 → 带时区的时间戳（created_at / imported_at 用） */
function at(date) {
  return `${date}T00:00:00+08:00`;
}

/** 需要写 records 行的范围：目录/来源/门槛/外部登记数据不算「患者事实」 */
const FACT_TABLES = new Set([
  'line_selections', 'documents', 'candidate_fields', 'pathology_reports', 'pathology_findings',
  'staging_assertions', 'surgery_events', 'instillation_courses', 'instillation_events',
  'contraindication_flags', 'diversion_facts', 'stoma_supplies', 'stoma_logs',
  'followup_schedules', 'cystoscopy_records', 'cystoscopy_experiences', 'urine_cytology',
  'upper_tract_surveillance', 'split_renal_function', 'drainage_events', 'treatment_lines',
  'regimen_drugs', 'cycles', 'responses', 'high_risk_markers', 'questions',
  'trial_bookmarks', 'observations', 'symptom_entries',
]);

function createPlan() {
  const rows = new Map();
  const facts = [];
  return {
    rows,
    facts,
    add(table, row) {
      if (!rows.has(table)) rows.set(table, []);
      rows.get(table).push(row);
    },
    /** 事实行：同时登记一条 records（schema 的应用层不变量①：谁记的） */
    fact(table, row, subjectId, actorId) {
      if (!FACT_TABLES.has(table)) throw new Error(`${table} 不是事实表，不该走 fact()`);
      this.add(table, row);
      facts.push({ table, entity_id: row.id, subject_id: subjectId, actor_id: actorId ?? subjectId });
    },
  };
}

/**
 * 播种演示数据。
 *
 * - 幂等：库里已有 subjects 就**整批跳过**（在生成任何 ID 之前就返回）；
 * - 单事务：BEGIN → 全部 INSERT → COMMIT，任何异常 ROLLBACK 后原样抛出；
 * - 参数化：列名来自本文件写死的对象键，值一律走占位符（没有一处字符串拼 SQL 值）。
 *
 * @returns {{ seeded: boolean, inserted: Record<string, number>, profiles: string[] }}
 */
export function seedDemo(db, { now = () => nowISO() } = {}) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM subjects').get().n;
  if (existing > 0) {
    // 已有档案：整批跳过。注意这里是**先判断再建计划** —— 连 id 都不生成。
    return { seeded: false, inserted: {}, profiles: [] };
  }

  const data = loadPrototypeData();
  const stamp = now();
  const plan = createPlan();

  seedSubjects(plan, stamp);
  seedSources(plan, stamp);
  seedLines(plan, stamp);
  seedDocumentsAndDrafts(plan, data, stamp);
  seedDiversion(plan, data, stamp);
  seedPathology(plan, data, stamp);
  seedSurgery(plan, data, stamp);
  seedInstillation(plan, data, stamp);
  seedFollowup(plan, data, stamp);
  seedRenal(plan, data, stamp);
  seedTreatment(plan, data, stamp);
  seedMetrics(plan, data, stamp);
  seedQuestionsAndTrials(plan, data, stamp);
  seedHighRisk(plan, data, stamp);
  seedRecordsRows(plan, stamp);
  seedDemoMeta(plan, data, stamp);

  db.exec('BEGIN');
  try {
    const inserted = insertAll(db, plan);
    db.exec('COMMIT');
    return { seeded: true, inserted, profiles: PROFILES.map((p) => p.id) };
  } catch (error) {
    // 整批要么全进、要么全不进：半份演示数据比没有更糟（会被当成真实档案读出来）。
    db.exec('ROLLBACK');
    throw error;
  }
}

/** 「有 subjects 就整批跳过」的播种入口（启动时用这个，别自己判断） */
export function seedIfEmpty(db, options) {
  return seedDemo(db, options);
}

/** 逐表执行参数化 INSERT，返回各表行数 */
function insertAll(db, plan) {
  const inserted = {};
  for (const [table, rows] of plan.rows) {
    if (rows.length === 0) continue;
    const cols = Object.keys(rows[0]);
    // 表名与列名都是本文件写死的字面量；值全部走 ? 占位符。
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    const stmt = db.prepare(sql);
    for (const row of rows) {
      stmt.run(...cols.map((c) => (row[c] === undefined ? null : row[c])));
    }
    inserted[table] = rows.length;
  }
  return inserted;
}

/* ------------------------------------------------------------------ *
 * 四、逐块播种（块的划分照原型的块，注释说明为什么这么落）
 * ------------------------------------------------------------------ */

function seedSubjects(plan, stamp) {
  for (const p of PROFILES) {
    plan.add('subjects', {
      id: p.id,
      display_name: p.name,
      relation: p.relation,
      // 原型没有出生年。birth_year 允许 NULL —— 不编一个年龄出来（最小化也不该编）。
      birth_year: null,
      is_self: 1,
      note: `演示档案 ${p.demoLabel}（数据源 prototypes/v0.1/data.js，非真实病历）`,
      created_at: stamp,
      updated_at: stamp,
    });
  }
  // 照护者是一个独立主体：schema 的注释写明「主体是 subject，记录人是 actor」，
  // 没有它就没法表达 RECORDS.facts 里的「照护者代记」。
  plan.add('subjects', {
    id: CARER.id,
    display_name: CARER.name,
    relation: CARER.relation,
    birth_year: null,
    is_self: 0,
    note: `DEMO-1 的代记主体（LIFE.handover.recordBy）`,
    created_at: stamp,
    updated_at: stamp,
  });
}

/**
 * 来源。指南/共识/患者教育/机构类来源与具体患者无关 → subject_id 留空，全库共用；
 * 「本人记录 / 自测 / 自述」是某一档案自己的记录行为 → 按档案各存一份，
 * 否则 DEMO-2 的观察记录会指到 DEMO-1 的「本人记录」上。
 */
const SHARED_SOURCES = [
  ['ref-demo-report', 'hospital_report', '演示报告 · 非真实病历', null],
  ['ref-demo-hospital', 'hospital_report', '演示医院', null],
  ['ref-consensus-2022p', 'consensus', '2022 保膀胱共识', '2022'],
  ['ref-consensus-preserve', 'consensus', '2022 / 2024 中国膀胱癌保膀胱治疗多学科诊治协作共识', '2022 / 2024'],
  ['ref-consensus-2021-inst', 'consensus', '2021 灌注共识', '2021'],
  ['ref-caca', 'patient_edu', 'CACA 膀胱癌问答', null],
  ['ref-demo-data', 'other', '演示数据', null],
];

/** 「来源待补」不是一个来源 —— 它表示查不到出处，此时 source_ref_id 必须留空 */
const SELF_SOURCES = [
  ['ref-self-record', 'self_report', '本人记录'],
  ['ref-self-test', 'self_report', '自测'],
  ['ref-self-report', 'self_report', '自述'],
];

function seedSources(plan, stamp) {
  for (const [id, kind, label, version] of SHARED_SOURCES) {
    plan.add('source_refs', {
      id, subject_id: null, kind, label, version, url: null, accessed_at: null,
      // 「拿到来源」≠「人工核对过来源本身」，所以 verified 一律 0。
      verified: 0, created_at: stamp,
    });
  }
  for (const p of PROFILES) {
    for (const [prefix, kind, label] of SELF_SOURCES) {
      plan.add('source_refs', {
        id: `${prefix}-${p.id}`, subject_id: p.id, kind, label, version: null,
        url: null, accessed_at: null, verified: 0, created_at: stamp,
      });
    }
  }
}

function seedLines(plan, stamp) {
  for (const p of PROFILES) {
    plan.fact('line_selections', {
      id: `${p.id}-line-1`,
      subject_id: p.id,
      line: p.line,
      decided_at: p.decidedAt,
      reason: p.decidedReason,
      supersedes_id: null,
      is_current: 1,
      created_at: stamp,
    }, p.id);
  }
}

/**
 * 资料与待核对草稿。原型的 RECORDS.files 是 4 份展示文件，RECORDS.drafts 是 4 条候选，
 * 但其中「BCG 批号」和「尿比重」两条在文件列表里**找不到对应文件**（原型自己的缺口）。
 * candidate_fields.document_id 是 NOT NULL，所以只能补两份隐含文件：
 *   · 灌注记录（演示）  ← 承载「卡苗 批号 演示-2411」
 *   · 尿常规（演示）    ← 承载「SG 1.0??」
 * 补出来的文件不在原型的资料库列表里，靠 view_hints.documentOrder 指定展示集合，
 * 保证资料库页与原型逐字符一致。这是缺口，交付报告里已列为「需要绕」的第一条。
 */
const DOC_KINDS = { 病理: 'pathology', 化验: 'lab', 手术: 'operative' };

function seedDocumentsAndDrafts(plan, data, stamp) {
  const files = data.RECORDS.files;
  for (const p of PROFILES) {
    files.forEach((f, i) => {
      const id = `${p.id}-doc-${i + 1}`;
      plan.fact('documents', {
        id,
        subject_id: p.id,
        relative_path: `演示/${f.name}.pdf`,
        // 演示文件不在磁盘上：对占位说明串取 sha256，既满足 NOT NULL/UNIQUE 又可复现。
        sha256: placeholderSha(`${p.id}|${f.name}`),
        mime: null,
        bytes: null,
        doc_kind: DOC_KINDS[f.kind] ?? 'other',
        // 原型的 state「已核对/待核对」正好是 confirmed/candidate 两态。
        status: f.state === '已核对' ? 'confirmed' : 'candidate',
        // documents 没有「报告日期」列，只有 imported_at —— 把原型的 on 塞在这里（缺口）。
        imported_at: at(f.on),
      }, p.id);
    });
    // 两份隐含文件：只为让两条孤立的候选有归属文档（见块注释）。
    plan.fact('documents', {
      id: `${p.id}-doc-5`,
      subject_id: p.id,
      relative_path: '演示/灌注记录（演示）.pdf',
      sha256: placeholderSha(`${p.id}|灌注记录（演示）`),
      mime: null, bytes: null, doc_kind: 'other', status: 'candidate',
      imported_at: at(data.INSTILLATION.events[2].actual),
    }, p.id);
    plan.fact('documents', {
      id: `${p.id}-doc-6`,
      subject_id: p.id,
      relative_path: '演示/尿常规（演示）.pdf',
      sha256: placeholderSha(`${p.id}|尿常规（演示）`),
      mime: null, bytes: null, doc_kind: 'other', status: 'candidate',
      imported_at: at('2026-10-22'),
    }, p.id);
  }

  // 草稿：4 条，一条一条对应原型 RECORDS.drafts 的顺序（读模型按 rowid 还原顺序）。
  const draftDoc = {
    尿细胞学结果: (id) => `${id}-doc-3`,
    标本类型: (id) => `${id}-doc-3`,
    'BCG 批号': (id) => `${id}-doc-5`,
    尿比重: (id) => `${id}-doc-6`,
  };
  for (const p of PROFILES) {
    data.RECORDS.drafts.forEach((d, i) => {
      plan.fact('candidate_fields', {
        id: `${p.id}-draft-${i + 1}`,
        document_id: draftDoc[d.field](p.id),
        field_key: d.field,
        // raw_text 是**原文照录**；抄下来的「值」不在这张表里（schema 缺口），
        // 读模型按 field_key 去对应事实表取（见 readmodels 的 FIELD_VALUE）。
        raw_text: d.quote,
        unit_raw: null,
        unit_norm: null,
        page: null,
        status: d.ok ? 'accepted' : 'pending',
        reviewed_at: d.ok ? stamp : null,
        created_at: stamp,
      }, p.id);
    });
  }
}

function seedDiversion(plan, data, stamp) {
  for (const p of PROFILES) {
    if (!p.withDiversion) continue; // NMIBC 档案本来就不做改道，硬造一条就是编数据
    plan.fact('diversion_facts', {
      id: `${p.id}-diversion-1`,
      subject_id: p.id,
      kind: 'ileal_conduit', // 「回肠通道造口 / Bricker」→ ileal_conduit
      performed_on: data.DIVERSION_CASE.operatedOn,
      supersedes_id: null,
      is_current: 1,
      // 术式机构在原型里是 DIVERSION_CASE.hospital，diversion_facts 没有机构列（缺口）
      note: data.DIVERSION_CASE.hospital,
      created_at: stamp,
    }, p.id);
  }
  // 造口耗材与日记：原型是全局常量，但只有做了造口的人才会有 —— 挂给 DEMO-2。
  const demo2 = PROFILES.find((p) => p.withDiversion);
  data.STOMA_SUPPLY.forEach((s) => {
    plan.fact('stoma_supplies', {
      id: `${demo2.id}-supply-${s.id}`,
      subject_id: demo2.id,
      category: s.kind,
      brand: s.brand,
      // 原型只有 size 一栏，schema 只有 model(NOT NULL)/size_note —— 取 size 放 model，
      // size_note 留空；更换周期（interval）没有列，进 view_hints（缺口）。
      model: s.size,
      size_note: null,
      is_default: 0,
      retired_at: null,
      created_at: stamp,
    }, demo2.id);
  });
  data.STOMA_LOG.forEach((l, i) => {
    plan.fact('stoma_logs', {
      id: `${demo2.id}-stoma-log-${i + 1}`,
      subject_id: demo2.id,
      supply_id: `${demo2.id}-supply-${l.supplyId}`,
      batch_date: l.batchOn,
      changes_count: l.changes,
      leak_count: l.leaks,
      skin_state: l.skin,
      odor_note: l.odor,
      night_bag: null,
      // 身体形象相关默认私密（fail-closed），照 schema 默认 1 显式写出来。
      is_private: 1,
      created_at: stamp,
    }, demo2.id);
  });
}

/**
 * 病理与分期。分线：
 *  · DEMO-1 用 PATHOLOGY（一份报告 + 4 条发现 + T1 分期）；
 *  · DEMO-2 从 SURGERY_CASE.mibc 的 TURBT 病理与根治标本字段转写（3 份报告 + 分期）。
 * 所有字符串都照抄 data.js，没有一处是我编的。
 */
function seedPathology(plan, data, stamp) {
  const p1 = PROFILES[0];
  plan.fact('pathology_reports', {
    id: `${p1.id}-path-1`,
    subject_id: p1.id,
    document_id: `${p1.id}-doc-1`,
    reported_on: data.PATHOLOGY.reportDate,
    hospital: '演示医院',
    // 三态：报告写明「未见肌层」→ 无（≠ 未提及）
    muscle_present: data.PATHOLOGY.musclePresent,
    muscle_note: null,
    status: data.PATHOLOGY.reviewState === '已核对' ? 'confirmed' : 'candidate',
    created_at: stamp,
  }, p1.id);
  const f1 = [
    ['病理结论', data.PATHOLOGY.raw, null, null, 0],
    ['分级', data.PATHOLOGY.gradeRaw, data.PATHOLOGY.gradeRaw, data.PATHOLOGY.gradeSchemeRaw || '未注明', 1],
    // 「未提及」是一个**有信息的三态值**（报告没提 ≠ 没有）。病理发现表没有三态列，
    // 只能把它当 value_raw 存下来（缺口，报告里列出）。
    ['合并原位癌（CIS）', '未提及', '未提及', null, 2],
    ['淋巴血管侵犯', data.PATHOLOGY.lvi, data.PATHOLOGY.lvi, null, 3],
  ];
  f1.forEach(([key, raw, norm, gradedBy, ord], i) => {
    plan.fact('pathology_findings', {
      id: `${p1.id}-find-1-${i + 1}`,
      report_id: `${p1.id}-path-1`,
      finding_key: key,
      value_raw: raw,
      value_norm: norm,
      graded_by: gradedBy,
      variant_is_predominant: null,
      // 报告核对状态「待核对」→ verified 0。两套分级不做任何换算。
      verified: 0,
      ord,
    }, p1.id);
  });
  plan.fact('staging_assertions', {
    id: `${p1.id}-stage-1`,
    subject_id: p1.id,
    kind: 'pathological',
    t_stage: 'T1', // 原文「浸润固有层（T1）」
    n_stage: null,
    m_stage: null,
    asserted_on: data.PATHOLOGY.reportDate,
    source_ref_id: 'ref-demo-report',
    supersedes_id: null,
    is_current: 1,
    created_at: stamp,
  }, p1.id);

  const p2 = PROFILES[1];
  const turbt = data.SURGERY_CASE.mibc.turbt;
  turbt.forEach((t, i) => {
    plan.fact('pathology_reports', {
      id: `${p2.id}-path-t${i + 1}`,
      subject_id: p2.id,
      document_id: null,
      reported_on: t.on,
      hospital: t.by,
      muscle_present: t.muscle,
      muscle_note: null,
      status: 'candidate', // 原型没给这两份报告的核对状态，宁可用未核对
      created_at: stamp,
    }, p2.id);
    plan.fact('pathology_findings', {
      id: `${p2.id}-find-t${i + 1}-1`,
      report_id: `${p2.id}-path-t${i + 1}`,
      finding_key: '病理结论',
      value_raw: t.path,
      value_norm: null,
      graded_by: null,
      variant_is_predominant: null,
      verified: 0,
      ord: 0,
    }, p2.id);
  });

  const r = data.SURGERY_CASE.mibc.radical;
  plan.fact('pathology_reports', {
    id: `${p2.id}-path-radical`,
    subject_id: p2.id,
    document_id: null,
    reported_on: r.on,
    hospital: r.by,
    muscle_present: null, // 根治标本不适用「有无肌层」这三态
    muscle_note: null,
    status: 'candidate',
    created_at: stamp,
  }, p2.id);
  [
    ['分期（根治标本）', r.stage],
    ['淋巴结', r.nodes],
    ['切缘', r.margin],
    ['淋巴血管侵犯', r.lvi],
  ].forEach(([key, raw], i) => {
    plan.fact('pathology_findings', {
      id: `${p2.id}-find-radical-${i + 1}`,
      report_id: `${p2.id}-path-radical`,
      finding_key: key,
      value_raw: raw,
      value_norm: null,
      graded_by: null,
      variant_is_predominant: null,
      verified: 0,
      ord: i,
    }, p2.id);
  });
  plan.fact('staging_assertions', {
    id: `${p2.id}-stage-1`,
    subject_id: p2.id,
    kind: 'pathological',
    // 从 'pT2 N1 M0（演示）' 拆成三个字段；原串完整保留在上面那条 finding 的 value_raw 里，
    // 所以这里没有信息丢失（staging_assertions 自己没有原文列）。
    t_stage: 'pT2',
    n_stage: 'N1',
    m_stage: 'M0',
    asserted_on: r.on,
    source_ref_id: null,
    supersedes_id: null,
    is_current: 1,
    created_at: stamp,
  }, p2.id);
}

/**
 * 一图秀「治疗事件」的行 id。
 *
 * 原型把这三条事件写死在 charts.js 里（`ev-turbt` / `ev-bcg` / `ev-cancel`），
 * 并且会把 id 原样渲染到页面上（`app.js:1716` 的 `<code>ev-turbt</code>`）；
 * 逐字符 parity 要求它命中，所以这三个 id 是**演示数据的一部分**，落在行主键上。
 * 刻意不在 readmodels 里再写一份字面量：同一份数据写两处必然漂移
 * （本项目已踩过两次，见 docs/LESSONS.md）。demo2 的事件不参与 parity，用常规前缀 id。
 */
function surgeryEventId(profile, index) {
  return profile.id === 'demo1' && index === 0 ? 'ev-turbt' : `${profile.id}-surg-${index + 1}`;
}

/** 灌注事件的行 id：诱导第 1 次 = 「BCG 诱导开始」，被取消的那次 = 「灌注取消」 */
function instillationEventId(profile, event, index) {
  const fallback = `${profile.id}-inst-ev-${index + 1}`;
  if (profile.id !== 'demo1') return fallback;
  if (event.cancelReason) return 'ev-cancel';
  if (event.phase === '诱导' && event.idx === 1) return 'ev-bcg';
  return fallback;
}

function seedSurgery(plan, data, stamp) {
  PROFILES.forEach((p) => {
    const c = data.SURGERY_CASE[p.line];
    c.turbt.forEach((t, i) => {
      plan.fact('surgery_events', {
        id: surgeryEventId(p, i),
        subject_id: p.id,
        // 第 1 次是 turbt；第 2 次（MIBC 的复核电切）是 re_turbt，共用一张表靠 kind 分。
        kind: i === 0 ? 'turbt' : 're_turbt',
        performed_on: t.on,
        hospital: t.by,
        // schema 的枚举是「完全 / 不完全 / 未记录」，原型写的是「完全切除 / 不完全切除」。
        // 原值直接写会撞 CHECK（运行测试时才暴露）；原文仍在 view_hints 里，没有丢。
        resection_complete: t.complete === '完全切除' ? '完全'
          : t.complete === '不完全切除' ? '不完全' : '未记录',
        re_turbt_reason: null,
        diversion_id: null,
        // 原型的 perforation / cath 没有列（缺口）→ view_hints；
        // muscle / path 分别落 pathology_reports.muscle_present 与病理发现。
        note: null,
        created_at: stamp,
      }, p.id);
    });
    if (c.radical) {
      plan.fact('surgery_events', {
        id: `${p.id}-surg-radical`,
        subject_id: p.id,
        kind: 'radical_cystectomy',
        performed_on: c.radical.on,
        hospital: c.radical.by,
        resection_complete: null,
        re_turbt_reason: null,
        diversion_id: `${p.id}-diversion-1`,
        // scope / organs / stay 没有列（缺口）→ view_hints。
        note: null,
        created_at: stamp,
      }, p.id);
    }
    // 注意：计划中的二次电切（SURGERY_CASE.nmibc.reTurbt）**不落 surgery_events** ——
    // 这张表的 performed_on 是 NOT NULL，它只能记已经发生的手术（缺口，进 view_hints）。
  });
}

function seedInstillation(plan, data, stamp) {
  const PHASE_ORDER = { 即刻: 0, 诱导: 1, 维持: 2 };
  const STATUS = { done: 'done', cancel: 'cancelled', planned: 'planned', skip: 'skipped', delayed: 'delayed' };
  PROFILES.forEach((p) => {
    const courseId = `${p.id}-inst-course-1`;
    const plan3 = data.INSTILLATION.phasePlan.find((x) => x.phase === '诱导');
    plan.fact('instillation_courses', {
      id: courseId,
      subject_id: p.id,
      drug_kind: 'BCG',
      drug_name: data.INSTILLATION.agent,
      dose_raw: data.INSTILLATION.doseRaw,
      started_on: data.INSTILLATION.events[0].actual,
      planned_cycles: plan3.total,
      maintenance_note: data.INSTILLATION.phasePlan.find((x) => x.phase === '维持').note,
      ended_on: null,
      stop_reason: null,
      supply_note: data.INSTILLATION.supplyNote,
      created_at: stamp,
    }, p.id);
    data.INSTILLATION.events.forEach((e, i) => {
      plan.fact('instillation_events', {
        id: instillationEventId(p, e, i),
        course_id: courseId,
        seq: e.idx,
        phase: e.phase,
        planned_on: e.planned,
        performed_on: e.actual,
        status: STATUS[e.st] ?? 'planned',
        cancel_reason: e.cancelReason ?? null,
        retention_minutes: data.INSTILLATION.retentionMinutes, // 来源待补 → 保持 NULL
        urine_output_note: null,
        side_effect: null,
        created_at: stamp,
      // 记录人：RECORDS.facts 写明「灌注 BCG 120 mg · 诱导第 3 次」是**照护者代记**
      // （2026-10-16），所以那一条的 actor 是照护者，其余是本人。
      }, p.id, e.actual === '2026-10-16' && p.id === CARER.of ? CARER.id : p.id);
    });
    // 被取消的那一次在原型里有明确原因「肉眼血尿」，它同时是 2021 灌注共识的禁忌条目。
    const cancelled = data.INSTILLATION.events.findIndex((e) => e.cancelReason);
    plan.fact('contraindication_flags', {
      id: `${p.id}-contra-1`,
      event_id: instillationEventId(p, data.INSTILLATION.events[cancelled], cancelled),
      flag_code: 'gross_hematuria',
      applies_to: 'both', // CONTRA 里「肉眼血尿」属化疗药与 BCG 共有
      observed_on: data.INSTILLATION.events[cancelled].planned,
      source_ref_id: 'ref-consensus-2021-inst',
      note: '2021 灌注共识禁忌条目；本次取消属禁忌保护',
    }, p.id);
  });
}

function seedFollowup(plan, data, stamp) {
  PROFILES.forEach((p) => {
    // 排程：原型的「膀胱镜 + 尿细胞学」是一条，schema 的 modality 是单值 ——
    // 拆成两行（膀胱镜 / 尿细胞学）同日同口径，读到的时候再合并回一条（见 readmodels）。
    // 拆开才能让「下次只做其中一项」这种情况表达得出来。
    data.FOLLOWUP.schedule.forEach((s, i) => {
      const [srcLabel, interval] = splitIntervalSource(s.intervalSource);
      const modalities = s.kind === '膀胱镜 + 尿细胞学' ? ['cystoscopy', 'urine_cytology'] : ['upper_tract'];
      modalities.forEach((m, j) => {
        plan.fact('followup_schedules', {
          id: `${p.id}-fu-${i + 1}-${j + 1}`,
          subject_id: p.id,
          modality: m,
          interval_text: interval,
          source_version: srcLabel,
          source_ref_id: srcLabel.startsWith('2022 保膀胱共识') ? 'ref-consensus-2022p' : null,
          next_due_on: s.planned,
          planned_note: s.kind,
          created_at: stamp,
        }, p.id);
      });
    });

    const e = data.FOLLOWUP.lastExam;
    plan.fact('cystoscopy_records', {
      id: `${p.id}-cyst-1`,
      subject_id: p.id,
      performed_on: e.performedOn,
      scope_kind: 'rigid', // 「硬性膀胱镜 · 腰麻」
      anesthesia: 'spinal',
      finding: e.findingRaw,
      source_ref_id: 'ref-demo-report',
      // conclusionRaw / biopsyTaken 没有列（缺口）→ view_hints
      created_at: stamp,
    }, p.id);
    const x = data.FOLLOWUP.experience;
    plan.fact('cystoscopy_experiences', {
      id: `${p.id}-cyst-exp-1`,
      record_id: `${p.id}-cyst-1`,
      subject_id: p.id,
      pain_score: x.painScore,
      mood_note: x.moodNote,
      worry_note: null, // 原型没记复发恐惧，留空（不是写「无」）
      is_private: 1,
      recorded_at: stamp,
    }, p.id);

    data.FOLLOWUP.cytology.forEach((c, i) => {
      plan.fact('urine_cytology', {
        id: `${p.id}-cyto-${i + 1}`,
        subject_id: p.id,
        collected_on: c.date,
        result_state: c.state, // 四态，不是布尔
        specimen_kind: c.specimen === '膀胱冲洗' ? 'bladder_wash' : 'voided',
        ancillary: null,
        report_text: c.raw,
        source_ref_id: 'ref-demo-report',
        // lab / method 没有列（缺口）：它们落在 observations 上（同一批事实的指标面），
        // 这里不重复存，避免两个事实源。
        created_at: stamp,
      }, p.id);
    });

    data.FOLLOWUP.upperTract.forEach((u, i) => {
      plan.fact('upper_tract_surveillance', {
        id: `${p.id}-ut-${i + 1}`,
        subject_id: p.id,
        d: u.date,
        modality: 'ct_urography', // 「CT 尿路造影」
        finding: u.findingRaw,
        side: null,
        source_ref_id: 'ref-demo-report',
        created_at: stamp,
      }, p.id);
      // hydronephrosis / anastomotic 没有列（缺口）→ view_hints
    });
  });
}

/** 「2022 保膀胱共识（每 3 个月）」→ ['2022 保膀胱共识', '每 3 个月'] */
function splitIntervalSource(text) {
  const m = /^(.*?)（(.*)）$/.exec(text);
  return m ? [m[1], m[2]] : [text, null];
}

function seedRenal(plan, data, stamp) {
  // 门槛是**全库共用**的判读口径（renal_thresholds 没有 subject_id）：
  // 原型写的是「CrCl＜60 或 eGFR ≤60」，拆成两条 —— 两个不同的指标、两种比较符，
  // 合成一行会让「拿哪个数去比」这件事说不清。
  const t = data.RENAL.threshold;
  [
    ['cisplatin_crcl', 'lt', 'CrCl'],
    ['cisplatin_egfr', 'le', 'eGFR'],
  ].forEach(([criterion, op], i) => {
    plan.add('renal_thresholds', {
      id: `renal-thr-${i + 1}`,
      criterion,
      op,
      value: 60,
      unit: 'ml/min',
      source_ref_id: 'ref-consensus-preserve',
      // effective_from 留空：data.js 只写了「2022 / 2024」，没说是哪一版定的门槛。
      effective_from: null,
      note: t.text, // 原文整句留在这里，读模型直接用它当展示文案
    });
  });
  PROFILES.forEach((p) => {
    plan.fact('split_renal_function', {
      id: `${p.id}-split-1`,
      subject_id: p.id,
      d: data.RENAL.split.on,
      left_pct: data.RENAL.split.left,
      right_pct: data.RENAL.split.right,
      method: data.RENAL.split.method,
      gfr_total: null,
      source_ref_id: null, // 原型没给这份核素肾图的出处
      created_at: stamp,
    }, p.id);
    plan.fact('drainage_events', {
      id: `${p.id}-drain-1`,
      subject_id: p.id,
      kind: 'none', // 「无」也是事实：没放支架 ≠ 没记录
      side: null,
      placed_on: null,
      removed_on: null,
      reason: null,
      note: null,
      created_at: stamp,
    }, p.id);
  });
}

function seedTreatment(plan, data, stamp) {
  PROFILES.forEach((p) => {
    const c = data.TREATMENT_CASE[p.line];
    c.lines.forEach((line, i) => {
      const lineId = `${p.id}-tl-${i + 1}`;
      const kind = LINE_KIND(line.regimen);
      plan.fact('treatment_lines', {
        id: lineId,
        subject_id: p.id,
        seq: i + 1,
        line_kind: kind,
        started_on: line.from || null,
        ended_on: line.to || null,
        intent: line.why,
        supersedes_id: null,
        is_current: 1,
        created_at: stamp,
      }, p.id);
      c.drugs.forEach((d, j) => {
        // 用药只挂在**对应的**那条线上：DEMO-1 的 BCG 挂灌注线，DEMO-2 的两种静药挂术前化疗线。
        const belongs = (p.line === 'nmibc' && kind === 'intravesical')
          || (p.line === 'mibc' && kind === 'neoadjuvant');
        if (!belongs) return;
        plan.fact('regimen_drugs', {
          id: `${p.id}-drug-${j + 1}`,
          line_id: lineId,
          drug_name: d.name,
          dose_text: d.dose,
          schedule_text: d.plan,
          is_trial_drug: 0,
          ord: j,
        }, p.id);
      });
      // MIBC 的静脉化疗有「周期」这一层，DEMO-1 的灌注周期由 instillation_events 表达
      // （一次灌注就是一次事件），不再往 cycles 写第二份 —— 两个事实源必然对不上。
      if (p.line === 'mibc' && kind === 'neoadjuvant') {
        for (let k = 1; k <= 4; k += 1) {
          plan.fact('cycles', {
            id: `${p.id}-cycle-${k}`,
            line_id: lineId,
            seq: k,
            planned_on: null,
            performed_on: null,
            status: 'done',
            note: null,
          }, p.id);
        }
      }
    });
    c.evals.forEach((ev, i) => {
      // 疗效评估只挂一线：DEMO-2 的那次评估就是术前化疗线的结果。
      const lineId = `${p.id}-tl-1`;
      plan.fact('responses', {
        id: `${p.id}-resp-${i + 1}`,
        line_id: lineId,
        assessed_on: ev.on,
        value_raw: ev.result, // 原文照录，不套 RECIST
        basis: ev.how,
        source_ref_id: null,
        created_at: stamp,
      }, p.id);
    });
  });
}

/** 方案名 → treatment_lines.line_kind（这一步是归一，原值仍在 line.regimen 之外没有列可存） */
function LINE_KIND(regimen) {
  if (regimen.includes('膀胱灌注')) return 'intravesical';
  if (regimen.includes('GC')) return 'neoadjuvant';
  if (regimen === '待定') return 'systemic_2l';
  return 'other';
}

/**
 * 指标目录 + 观察记录。METRICS 的落点：定义进 metric_definitions，点进 observations。
 * 机构/方法变化 → group_key 变化 → 读模型据此拆「可比组」不跨组连线（肌酐的那两段）。
 * 顺序：metric_definitions 没有 ord 列，插入顺序（rowid）就是原型的数组顺序。
 */
function seedMetrics(plan, data, stamp) {
  for (const m of data.METRICS) {
    plan.add('metric_definitions', {
      code: m.code,
      name: m.name,
      cat: m.cat,
      unit: m.unit,
      dec: 1,
      value_kind: 'num',
      ref_low: m.refLow,
      ref_high: m.refHigh,
      ctcae_grade: m.ctcae?.grade ?? null,
      ctcae_text: m.ctcae?.text ?? null,
      ctcae_range: m.ctcae?.range ?? null,
      version: 1,
      retired_at: null,
      created_at: stamp,
    });
  }
  // 分类指标也建一条 definition（value_kind='categorical'）：指标页与一图秀共用同一目录，
  // 组名/顺序/项数必须一致（M23 ①）。分类项不进折线。
  const cat = data.CATEGORICAL[0];
  plan.add('metric_definitions', {
    code: cat.code,
    name: cat.name,
    cat: cat.cat,
    unit: '', // 分类变量没有单位；列是 NOT NULL，用空串而不是编一个「单位」
    dec: 1,
    value_kind: 'categorical',
    ref_low: null,
    ref_high: null,
    ctcae_grade: null,
    ctcae_text: null,
    ctcae_range: null,
    version: 1,
    retired_at: null,
    created_at: stamp,
  });

  const metricSource = (p, src) => {
    if (src === '自测') return `ref-self-test-${p.id}`;
    if (src === '自述') return `ref-self-report-${p.id}`;
    if (src === '本人记录') return `ref-self-record-${p.id}`;
    return 'ref-demo-data';
  };

  PROFILES.forEach((p) => {
    for (const m of data.METRICS) {
      for (const pt of m.points) {
        // 点级 lab/method 覆盖序列级（肌酐 2026-10-08 换了医院与方法）。
        const lab = pt.lab ?? m.lab ?? null;
        const method = pt.method ?? m.method ?? null;
        plan.fact('observations', {
          id: `${p.id}-obs-${m.code}-${pt.d}`,
          subject_id: p.id,
          metric_code: m.code,
          observed_on: pt.d,
          value_num: pt.v,
          value_text: null,
          // 原型没给原始书写形式（如 $10^9/L$），所以 unit_raw 留空，只存归一后的单位。
          unit_raw: null,
          unit_norm: m.unit,
          lab,
          method,
          group_key: `${lab ?? ''}|${method ?? ''}`,
          source_ref_id: metricSource(p, m.src),
          document_id: null,
          status: 'confirmed',
          absence_state: null, // 缺测才用六态；这里是测到了
          note: null,
          created_at: stamp,
        }, p.id);
      }
    }
    // 分类指标的点：值在 value_text，标本方式在 urine_cytology 里（同一件检查的临床侧）。
    // 机构/方法取 FOLLOWUP.cytology 上的同一次化验（urine_cytology 没有这两列 → 缺口，
    // 所以来源只写一份在 observations 上，不在两个地方各写一遍）。
    const cytoMeta = new Map(data.FOLLOWUP.cytology.map((c) => [c.date, { lab: c.lab, method: c.method }]));
    cat.values.forEach((v) => {
      const meta = cytoMeta.get(v.d) ?? { lab: null, method: null };
      plan.fact('observations', {
        id: `${p.id}-obs-${cat.code}-${v.d}`,
        subject_id: p.id,
        metric_code: cat.code,
        observed_on: v.d,
        value_num: null,
        value_text: v.v,
        unit_raw: null,
        unit_norm: '',
        lab: meta.lab,
        method: meta.method,
        group_key: `${meta.lab ?? ''}|${meta.method ?? ''}`,
        source_ref_id: 'ref-demo-report',
        document_id: `${p.id}-doc-3`,
        status: 'confirmed',
        absence_state: null,
        note: null,
        created_at: stamp,
      }, p.id);
    });

    // 症状自评的「表达面」。M23 要求「感受面」与「指标面」两列并置、不写因果：
    // 同一次自评在 observations 里是指标面（画趋势、对照分级），在 symptom_entries 里
    // 是感受面（受 is_private 与导出开关约束）。两边在播种时来自**同一份** data.js 点，
    // 所以不存在两个事实源对不上的问题。
    const symptomMetric = data.METRICS.find((m) => m.cat === '症状自评');
    if (symptomMetric) {
      for (const pt of symptomMetric.points) {
        plan.fact('symptom_entries', {
          id: `${p.id}-sx-${symptomMetric.code}-${pt.d}`,
          subject_id: p.id,
          d: pt.d,
          name: '疼痛', // schema 的注释给的就是「疼痛 / 排尿困扰 / 乏力」这类短名
          score: pt.v,
          score_max: 10,
          note: null,
          is_private: 1, // 症状与感受默认私密（fail-closed：拿不准就别带出去）
          created_at: stamp,
        }, p.id);
      }
    }
  });
}

function seedQuestionsAndTrials(plan, data, stamp) {
  PROFILES.forEach((p) => {
    data.QUESTIONS.forEach((q, i) => {
      plan.fact('questions', {
        id: `${p.id}-q-${i + 1}`,
        subject_id: p.id,
        text: q.q,
        // 原型给的是「已问/未问」状态，不是日期；asked_on 留空，读模型用
        // 「有答案 or 有日期」判定问过没有（answer 非空 ⇒ 已问）。
        asked_on: null,
        answer_text: q.answer || null,
        origin: 'self',
        confirmed: 0,
        created_at: stamp,
      }, p.id);
    });
    data.TRIAL_QUESTIONS.forEach((q, i) => {
      plan.fact('questions', {
        id: `${p.id}-tq-${i + 1}`,
        subject_id: p.id,
        text: q.q,
        asked_on: null,
        answer_text: null,
        origin: 'self',
        confirmed: 0,
        created_at: stamp,
      }, p.id);
    });
  });

  data.TRIALS.forEach((t) => {
    const source = t.reg.startsWith('ChiCTR') ? 'chictr' : 'ctgov';
    plan.add('trials', {
      id: `trial-${t.reg.toLowerCase()}`,
      source,
      reg_no: t.reg,
      title: t.title,
      // 中文题目（ChiCTR 那两条本身就是中文）→ title_cn 与 title 同值；英文题目不给译名。
      title_cn: /[\u4e00-\u9fa5]/.test(t.title) ? t.title : null,
      status_raw: t.status, // 原值保留
      status_norm: STATUS_NORM[t.status] ?? null,
      phase: null,
      study_type: null,
      scope: t.scope,
      setting: t.setting,
      sponsor: t.sponsor,
      institution: null,
      // 中国注册库的两条确定是中国；ClinicalTrials.gov 的申办方是中国机构 ≠ 研究国别，留空。
      country_cn: source === 'chictr' ? 1 : null,
      first_posted: null,
      updated_at_src: null,
      url: t.url,
      raw_json: null,
    });
  });

  PROFILES.forEach((p) => {
    data.TRIAL_FAVORITES.forEach((f, i) => {
      plan.fact('trial_bookmarks', {
        id: `${p.id}-bm-${i + 1}`,
        subject_id: p.id,
        trial_id: `trial-${f.reg.toLowerCase()}`,
        note: f.why, // 「我为什么收藏它」——收藏不是报名
        created_at: at(f.on),
      }, p.id);
    });
  });
}

/** 登记状态归一（原值保留在 status_raw，这里只是中文标签） */
const STATUS_NORM = {
  RECRUITING: '招募中',
  NOT_YET_RECRUITING: '尚未招募',
  ACTIVE_NOT_RECRUITING: '进行中（不招募）',
  COMPLETED: '已完成',
};

function seedHighRisk(plan, data, stamp) {
  PROFILES.forEach((p) => {
    data.HIGH_RISK_MARKERS.forEach((m, i) => {
      plan.fact('high_risk_markers', {
        id: `${p.id}-hrm-${i + 1}`,
        subject_id: p.id,
        // schema 的枚举是 'BCG无应答'（无空格），原型文案是 'BCG 无应答'（有空格）；
        // 库里存 schema 值，展示时按原型的写法还原（见 readmodels 的 KIND_DISPLAY）。
        kind: m.key === 'BCG 无应答' ? 'BCG无应答' : m.key,
        // 四项都出自 2024 保膀胱共识原文（data.js 块注释），所以回指同一条来源；
        // 但「这一项有没有说过」是医生/报告的事，noted_on 留空 ⇒ 读模型输出 state=null。
        source_ref_id: 'ref-consensus-preserve',
        noted_on: null,
        note_raw: m.note,
        created_at: stamp,
      }, p.id);
    });
  });
}

/**
 * 谁记的。schema 的两条应用层不变量之一：每条事实写入必须同时写一条 records 行
 * （entity_table + entity_id + actor_id）。数据库管不住，只能靠代码守 —— 这里守。
 */
function seedRecordsRows(plan, stamp) {
  plan.facts.forEach((f, i) => {
    plan.add('records', {
      id: `rec-${String(i + 1).padStart(4, '0')}`,
      subject_id: f.subject_id,
      actor_id: f.actor_id,
      entity_table: f.table,
      entity_id: f.entity_id,
      action: 'create',
      at: stamp,
      note: null,
    });
  });
}

/**
 * demo_meta：演示数据集元信息 + 展示属性白名单 + 无表可落的内容块。
 * 冻结 schema 第 14 节就是为这件事留的位置（JSON 扩展要带 schema/version）。
 */
function seedDemoMeta(plan, data, stamp) {
  const hints = buildViewHints(data);
  plan.add('demo_meta', {
    key: META_KEYS.dataset,
    value: JSON.stringify({
      schema: 'uropal.demo.dataset/1',
      source: 'prototypes/v0.1/data.js',
      refDate: DEMO_REF_DATE,
      seededAt: stamp,
      profiles: PROFILES.map((p) => ({ id: p.id, name: p.name, line: p.line, demoLabel: p.demoLabel })),
      note: '演示数据，非真实病历；每条事实的「谁记的」见 records 表。',
    }),
    schema_version: 1,
    updated_at: stamp,
  });
  plan.add('demo_meta', {
    key: META_KEYS.hints,
    value: JSON.stringify(hints),
    schema_version: 1,
    updated_at: stamp,
  });
  // schema 44 张表里没有任何一张能装「生活与照护」这一页（饮水饮食 / 造口社交 /
  // 工作出行 / 照护者交接 / 复诊准备流程）。它不是新事实，但也不是目录 ——
  // 放这里，并在交付报告里作为缺口列出。
  plan.add('demo_meta', {
    key: META_KEYS.free,
    value: JSON.stringify({
      schema: 'uropal.demo.free_blocks/1',
      note: 'schema 里没有对应表的原型内容块（逐档案一份）。',
      blocks: Object.fromEntries(PROFILES.map((p) => [p.id, {
        life: data.LIFE,
        trialsStats: data.TRIALS_STATS,
        // 改道页：原型只有 DIVERSION_CASE 一份，且它的注释写明这是 DEMO-2 档案的记录。
        // 「本档案实际采用的术式」按档案给：DEMO-1 是 NMIBC，没做改道 ⇒ appliesToProfile=false。
        // ⚠️ activeKind 仍保留原型的展示串 —— 原型在非本人档案时会渲染成
        // 「本演示档案采用的是 <activeKind>」，这一句对 DEMO-1 本来就是错的（原型缺陷）；
        // 数据层把「是不是这个档案的」标出来，改不改这句文案由 UI 与 parity 决定。
        diversionCase: {
          activeKind: data.DIVERSION_CASE.activeKind,
          appliesToProfile: p.withDiversion,
          // 只有真做了这个术式的档案才有「记录值」；原型也只在 isMine 时渲染它
          // （data.js 的注释：没做的术式给解释，但不编造数值）。
          values: p.withDiversion ? data.DIVERSION_CASE.values : {},
          explain: data.DIVERSION_CASE.explain,
        },
      }])),
    }),
    schema_version: 1,
    updated_at: stamp,
  });
}

/**
 * 展示属性白名单。每一项都是**原型里有、冻结 schema 里没有列**的东西；
 * 逐条写清缺哪一列，交付报告直接从这份结构里抄。
 */
function buildViewHints(data) {
  const hints = {
    schema: 'uropal.demo.view_hints/1',
    note: '原型里有、schema 没有对应列的展示属性；键是实体 id。读模型只读这里，不回读 data.js 的患者事实。',
    documents: {}, documentOrder: [], documentExtra: {},
    renalPointDates: {}, stomaSupplyInterval: {},
    surgery: {}, plannedReTurbt: {}, upperTract: {}, cystoscopy: {},
    instillation: {}, drafts: {}, drugs: {}, treatmentLines: {}, responses: {},
    pathologySource: {}, questions: {}, bookmarks: {}, recordsFacts: {},
  };

  PROFILES.forEach((p) => {
    // 资料库列表：documents 缺「是否在资料库展示」这一属性；补出来的两份隐含文件
    // 不进列表，靠 documentOrder 指定展示集合与顺序。
    data.RECORDS.files.forEach((f, i) => {
      const id = `${p.id}-doc-${i + 1}`;
      hints.documents[id] = { pages: f.pages, by: f.by, state: f.state, listed: 1 };
      hints.documentOrder.push(id);
    });
    hints.documentExtra[`${p.id}-doc-5`] = '原型文件列表里没有它；为安放「BCG 批号」候选而补（documents 缺「候选来自哪份文件」之外的隐含文件表达）';
    hints.documentExtra[`${p.id}-doc-6`] = '原型文件列表里没有它；为安放「尿比重」候选而补';

    // 肾功能页只展示三段采样。这个「展示哪几段」是演示内容，不是可推导规则
    // （2026-08-20 也有配对数据但原型没列），所以显式记下来。
    hints.renalPointDates[p.id] = data.RENAL.points.map((x) => x.date);
    // pathology_reports 没有来源列（缺口）。只有 DEMO-1 的报告对应 PATHOLOGY.source。
    if (p.line === 'nmibc') hints.pathologySource[`${p.id}-path-1`] = data.PATHOLOGY.source;
    hints.instillation[`${p.id}-inst-course-1`] = {
      phasePlan: data.INSTILLATION.phasePlan, // 即刻/诱导/维持的原文说明与各自总数
      batch: '演示-2411', // 「BCG 批号」候选抄下来的值（instillation_* 没有批号列）
    };
    hints.drafts[`${p.id}-draft-4`] = { why: data.RECORDS.drafts[3].why };
    hints.recordsFacts[p.id] = data.RECORDS.facts;
  });

  const demo2 = PROFILES.find((p) => p.withDiversion);
  data.STOMA_SUPPLY.forEach((s) => {
    hints.stomaSupplyInterval[`${demo2.id}-supply-${s.id}`] = s.interval;
  });
  // 手术：perforation / cath / scope / organs / stay 都没有列
  PROFILES.forEach((p) => {
    const c = data.SURGERY_CASE[p.line];
    c.turbt.forEach((t, i) => {
      hints.surgery[surgeryEventId(p, i)] = {
        complete: t.complete, // 原文（带「切除」二字），表里只装得下枚举
        muscle: t.muscle, // 手术记录里写的「标本含肌层」（与病理报告的 muscle_present 同源，但这里要的是那一次手术的写法）
        path: t.path, // 手术记录里的病理小结；它不等于病理报告的「病理结论原文」（原型两个都渲染）
        perforation: t.perforation,
        cath: t.cath,
      };
    });
    if (c.radical) {
      hints.surgery[`${p.id}-surg-radical`] = {
        // 根治术的这几个字段 schema 里没有列：术式范围 / 切除器官 / 住院天数 /
        // 淋巴结结果 / 切缘 / 脉管侵犯。淋巴结、切缘、脉管侵犯也进了病理发现行，
        // 这里保留是为了让读模型能原样还原原型的手术卡片。
        scope: c.radical.scope, organs: c.radical.organs, stay: c.radical.stay,
        nodes: c.radical.nodes, margin: c.radical.margin, lvi: c.radical.lvi,
      };
    }
    if (c.reTurbt) hints.plannedReTurbt[p.id] = c.reTurbt; // 计划中的手术，surgery_events 装不下
    hints.upperTract[`${p.id}-ut-1`] = {
      hydronephrosis: data.FOLLOWUP.upperTract[0].hydronephrosis,
      anastomotic: data.FOLLOWUP.upperTract[0].anastomotic,
    };
    hints.cystoscopy[`${p.id}-cyst-1`] = {
      conclusionRaw: data.FOLLOWUP.lastExam.conclusionRaw,
      biopsyTaken: data.FOLLOWUP.lastExam.biopsyTaken,
    };
  });
  // 治疗线：no（一线/二线）与 mounted 摘要没有列
  PROFILES.forEach((p) => {
    const c = data.TREATMENT_CASE[p.line];
    c.lines.forEach((line, i) => {
      // treatment_lines 没有「方案原文 / 进行状态」列（只有 line_kind 归一值与 intent），
      // 所以原型的 regimen 与 status 只能进 view_hints；intent 已经落库（why）。
      hints.treatmentLines[`${p.id}-tl-${i + 1}`] = {
        no: line.no, mounted: line.mounted, regimen: line.regimen, status: line.status,
      };
    });
    c.drugs.forEach((d, j) => {
      // regimen_drugs 装了 name/dose/schedule，没有给药途径、完成进度与来源：
      // route / src / done / next 进 view_hints。
      hints.drugs[`${p.id}-drug-${j + 1}`] = {
        route: d.route, src: d.src, done: d.done, next: d.next,
      };
    });
    c.evals.forEach((ev, i) => {
      hints.responses[`${p.id}-resp-${i + 1}`] = { note: ev.note };
    });
    // 问题分组：questions 表没有 group / kind / for 三列
    data.QUESTIONS.forEach((q, i) => {
      hints.questions[`${p.id}-q-${i + 1}`] = { group: q.group, kind: 'visit' };
    });
    data.TRIAL_QUESTIONS.forEach((q, i) => {
      hints.questions[`${p.id}-tq-${i + 1}`] = { group: q.group, kind: 'trial', for: q.for };
    });
    data.TRIAL_FAVORITES.forEach((f, i) => {
      hints.bookmarks[`${p.id}-bm-${i + 1}`] = { next: f.next };
    });
  });

  // 原型没做改道的档案也给每个术式的解释（不编数值）：explain 放 free_blocks，
  // activeKind 按档案给（DEMO-1 是 null）。
  return hints;
}
