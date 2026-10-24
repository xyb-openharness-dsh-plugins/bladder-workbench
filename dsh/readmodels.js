/**
 * dsh/readmodels.js —— 演示档案的读模型（只读，不写库、不改 schema）。
 *
 * 为什么要有这一层：
 * 原型（prototypes/v0.1/data.js）把演示档案写成一堆全局常量，切分野只影响看板和
 * 手术 / 治疗 / 改道三块；schema/0001_initial.sql 是事实层。两者形状不同，中间必须有
 * 一层「把行还原成原型形状」，否则界面只有两条路：把 Tab 布局焊进事实层，或者继续读
 * 原型常量（于是演示与真实变成两套数据）。这一层就是那条灰线。
 *
 * 三条纪律：
 * 1. 只读。空库（没有 subjects）返回 `{ meta, catalogs, profiles: [] }`，不抛异常、不造数据。
 * 2. 静态目录（NAV / CATEGORICAL / … ）不入库，按 demo.js 的决定直接从 data.js 读，
 *    避免同一份目录在两个文件里各写一遍。患者事实一律从库里读，不回读 data.js。
 * 3. 原型里「schema 没有对应列」的展示属性，只从 demo_meta 的两个 JSON 键取
 *    （demo.js 播种时写入的 view_hints / free_blocks）。本文件不另写一份字面量，
 *    否则库改一个字、这里改一个字，两边必然漂移。
 *
 * 关于「共享数据」：原型对两个分野共用同一份病理 / 灌注 / 复查 / 肾功 / 指标 / 资料 /
 * 生活 / 问题 / 试验数据，只有手术 / 治疗 / 改道按分野不同。所以这两个 profile 的共享块
 * 值必须完全相同（验收要拿开发版和原型逐字符比），readmodels 就照这个事实还原：
 * 共享块各档案各读自己的行（demo.js 播的是同值独立行），病理块取共享的那一份报告。
 */
import { readFileSync } from 'node:fs';
import { loadPrototypeData } from './demo.js';
import { todayISO } from './store.js';

const PACKAGE_NAME = '@xyb-community/bladder-cancer-workbench';

/** 静态目录键：这些不是患者事实，不入库。 */
const CATALOG_KEYS = ['NAV', 'CATEGORICAL', 'DIVERSION', 'CONTRA', 'URGENT', 'DRAFT_SCOPES', 'WORDING_REDLINES'];

/** demo_meta 的三个演示元信息键（与 dsh/demo.js 的 META_KEYS 一致）。 */
const META_KEYS = {
  dataset: 'uropal.demo.dataset',
  hints: 'uropal.demo.view_hints',
  free: 'uropal.demo.free_blocks',
};

/**
 * 指标类别的展示色。为什么在这里：颜色是展示 token，不是患者事实，
 * metric_definitions 也没有 color 列；原型里「类别 → 颜色」是一对一的，所以按类别映射。
 */
const CAT_COLOR = {
  肾功能: 'var(--d-renal)',
  血常规: 'var(--d-blood)',
  肝功能: 'var(--d-lyte)',
  营养: 'var(--d-nutrition)',
  症状自评: 'var(--d-symptom)',
};

/** 枚举 → 原型文案。库里的枚举是给约束用的，界面上说的是人话，一一对应、不做推断。 */
const DOC_KIND = { pathology: '病理', cytology: '化验', lab: '化验', imaging: '影像', operative: '手术', discharge: '出院', cystoscopy: '检查', other: '其它' };
const SPECIMEN = { voided: '自然尿', bladder_wash: '膀胱冲洗', catheterized: '导尿标本', unknown: '未记录' };
const SCOPE = { flexible: '软性膀胱镜', rigid: '硬性膀胱镜', fluorescence: '荧光膀胱镜', unknown: '膀胱镜' };
const ANESTHESIA = { none: '无麻醉', local: '局麻', spinal: '腰麻', general: '全麻', unknown: '麻醉方式未记录' };
const UPPER_MODALITY = { ct_urography: 'CT 尿路造影', mru: '磁共振尿路成像', ultrasound: '超声', ureteroscopy: '输尿管镜', cytology: '尿细胞学', other: '其它' };
const DRAINAGE = { none: '无', dj_stent: '双J管', nephrostomy: '肾造瘘' };
const DIVERSION = { ileal_conduit: '回肠通道造口', orthotopic_neobladder: '原位新膀胱', cutaneous_ureterostomy: '输尿管皮肤造口', other: '其它' };
const HRM = { BCG无应答: 'BCG 无应答', 血管淋巴管侵犯: '血管淋巴管侵犯', 变异组织类型: '变异组织类型', 前列腺尿道侵犯: '前列腺尿道侵犯' };
const REVIEW_STATE = { confirmed: '已核对', candidate: '待核对', rejected: '已作废' };
/**
 * 灌注事件状态：schema 有五态（planned/done/cancelled/skipped/delayed），
 * 原型的泳道只画三种（done / cancel / planned）。这里只做合并，不改写事实：
 * skipped / delayed 仍按「计划过但没做」显示成 planned —— 演示数据里没出现这两种。
 */
const INST_STATUS = { done: 'done', cancelled: 'cancel', planned: 'planned', skipped: 'planned', delayed: 'planned' };

/**
 * 一图秀的「治疗事件」泳道节点：**两条线共用同一份**。
 *
 * 为什么不按档案从库里推：原型的 `prototypes/v0.1/charts.js:30` 里 `const TREATMENTS = [...]`
 * 是一份**全局单份常量**，不随分野（STATE.line）切换 —— 原型的一图秀页、治疗事件表、
 * 以及「治疗事件：3 个」那行说明，两条线看到的都是这 3 条。
 * M5 的验收标准是「与原型逐字符一致」，所以两个 profile 都给这一份、`id` 也逐字相同。
 *
 * 「按分野给不同的治疗时间线」是对原型的**改进**：那要先改原型并重新过 G2，不在 M5 范围内。
 * 为了让 DEMO-2 显得更真实而在这里多塞「二次电切 / 根治性膀胱切除」，会让 parity 挂掉，
 * 而且挂的原因会被记成「readmodels 写错了」——那是拿数据迁就想象。
 */
const TREATMENT_TIMELINE = [
  { d: '2026-09-18', label: 'TURBT', id: 'ev-turbt' },
  { d: '2026-10-02', label: 'BCG 诱导开始', id: 'ev-bcg' },
  { d: '2026-10-23', label: '灌注取消', id: 'ev-cancel' },
];

/** 读根目录 VERSION；文件缺失时返回 null，不让读模型因此崩掉。 */
function readVersion() {
  try {
    return readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim() || null;
  } catch {
    return null;
  }
}
const VERSION = readVersion();

/** demo_meta.value 是 JSON 文本；解析失败当没有，不抛。 */
function readJson(row) {
  if (!row || typeof row.value !== 'string') return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

/** 归一 optional 文本：空字符串与 undefined 都当作「没写」，还原成 null（D3）。 */
const orNull = (v) => (v === undefined || v === null || v === '' ? null : v);

/**
 * 把一行行数据还原成原型形状。返回 `{ meta, catalogs, profiles }`。
 * `today` 只用于 meta（读取时算，不落库）。
 */
export function buildBootstrap(db, { today = todayISO() } = {}) {
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args) ?? null;

  // 静态目录：直接取自 data.js（不入库）。
  const data = loadPrototypeData();
  const catalogs = {};
  for (const key of CATALOG_KEYS) catalogs[key] = data[key];

  const dataset = readJson(one('SELECT value FROM demo_meta WHERE key = ?', META_KEYS.dataset));
  const hints = readJson(one('SELECT value FROM demo_meta WHERE key = ?', META_KEYS.hints)) ?? {};
  const freeBlocks = readJson(one('SELECT value FROM demo_meta WHERE key = ?', META_KEYS.free))?.blocks ?? {};
  const refLabel = new Map(all('SELECT id, label FROM source_refs').map((r) => [r.id, r.label]));

  const meta = {
    today,
    packageName: PACKAGE_NAME,
    version: VERSION,
    disclaimer: '演示数据：仅用于功能演示，不构成诊断或治疗建议。',
    dataset: dataset ? { source: dataset.source, refDate: dataset.refDate, seededAt: dataset.seededAt } : null,
    profileCount: 0,
  };

  // 只有患者本人的档案才是 profile；照护者（is_self = 0）是「谁记的」里的记录人。
  const subjects = all('SELECT * FROM subjects WHERE is_self = 1 ORDER BY rowid');
  meta.profileCount = subjects.length;
  // 空库：目录照给（界面仍要会渲染导航），档案给空数组，不造演示数据。
  if (subjects.length === 0) return { meta, catalogs, profiles: [] };

  // 判定「本档案是哪一个分野」。is_current 优先，没有就退回最早那条。
  const lineOf = (pid) =>
    one('SELECT * FROM line_selections WHERE subject_id = ? AND is_current = 1 ORDER BY rowid', pid) ??
    one('SELECT * FROM line_selections WHERE subject_id = ? ORDER BY rowid', pid);

  /**
   * 病理块。原型把病理做成**跨分野共享**的一份（只有一份 PATHOLOGY），
   * view_hints.pathologySource 记的就是那一份报告 id，所以两个 profile 取同一份。
   * 为什么不做成「每档案各取自己的报告」：那样 DEMO-2 会显示自己那份根治病理，
   * 而原型在 MIBC 下渲染的是共享的那份 —— 验收是逐字符比对，必须跟原型一致。
   */
  const sharedReportId = Object.keys(hints.pathologySource ?? {})[0] ?? null;
  const pathologyBlock = () => {
    const report = sharedReportId ? one('SELECT * FROM pathology_reports WHERE id = ?', sharedReportId) : null;
    if (!report) return null;
    const fs = all('SELECT * FROM pathology_findings WHERE report_id = ? ORDER BY ord, rowid', report.id);
    const pick = (key) => fs.find((f) => f.finding_key === key) ?? null;
    const raw = pick('病理结论');
    const grade = pick('分级');
    const cis = pick('合并原位癌（CIS）');
    const lvi = pick('淋巴血管侵犯');
    const variant = pick('组织学变异类型');
    return {
      reportDate: report.reported_on,
      raw: raw ? raw.value_raw : '',
      gradeRaw: grade ? grade.value_raw : null,
      // 原型里没写体系名时是空字符串（不是 null）；「未注明」是库里的写法，这里还原回去。
      gradeSchemeRaw: grade && grade.graded_by && grade.graded_by !== '未注明' ? grade.graded_by : '',
      otherGradeRaw: pick('其他分级体系')?.value_raw ?? null,
      musclePresent: report.muscle_present,
      concurrentCis: cis ? cis.value_raw : null,
      lvi: lvi ? lvi.value_raw : null,
      variantRaw: variant ? variant.value_raw : null,
      variantIsMain: variant ? (variant.variant_is_predominant === '是' ? true : variant.variant_is_predominant === '否' ? false : null) : null,
      reviewState: REVIEW_STATE[report.status] ?? report.status,
      source: hints.pathologySource?.[report.id] ?? null,
    };
  };

  const profiles = subjects.map((s) => {
    const pid = s.id;
    const line = lineOf(pid);
    const fb = freeBlocks[pid] ?? {};

    const surgery = all('SELECT * FROM surgery_events WHERE subject_id = ? ORDER BY performed_on, rowid', pid);
    const courses = all('SELECT * FROM instillation_courses WHERE subject_id = ? ORDER BY rowid', pid);
    const instEvents = courses.flatMap((c) => all('SELECT * FROM instillation_events WHERE course_id = ? ORDER BY rowid', c.id));
    const schedules = all('SELECT * FROM followup_schedules WHERE subject_id = ? ORDER BY rowid', pid);
    const cyst = all('SELECT * FROM cystoscopy_records WHERE subject_id = ? ORDER BY performed_on, rowid', pid);
    const experiences = all('SELECT * FROM cystoscopy_experiences WHERE subject_id = ? ORDER BY rowid', pid);
    const cyt = all('SELECT * FROM urine_cytology WHERE subject_id = ? ORDER BY collected_on DESC, rowid', pid);
    const upper = all('SELECT * FROM upper_tract_surveillance WHERE subject_id = ? ORDER BY d, rowid', pid);
    const obs = all('SELECT * FROM observations WHERE subject_id = ? ORDER BY rowid', pid);
    const definitions = all('SELECT * FROM metric_definitions ORDER BY rowid');
    const lines = all('SELECT * FROM treatment_lines WHERE subject_id = ? ORDER BY seq, rowid', pid);
    const lineIds = lines.map((l) => l.id);
    const drugs = lineIds.flatMap((id) => all('SELECT * FROM regimen_drugs WHERE line_id = ? ORDER BY ord, rowid', id));
    const evals_ = lineIds.flatMap((id) => all('SELECT * FROM responses WHERE line_id = ? ORDER BY rowid', id));
    const hrm = all('SELECT * FROM high_risk_markers WHERE subject_id = ? ORDER BY rowid', pid);
    const qs = all('SELECT * FROM questions WHERE subject_id = ? ORDER BY rowid', pid);
    const bms = all('SELECT * FROM trial_bookmarks WHERE subject_id = ? ORDER BY rowid', pid);
    // 造口耗材/日记：原型里这是**全局一份**常量 —— app.js 的「造口日记」「耗材目录」两个页签
    // 直接读 STOMA_LOG / STOMA_SUPPLY，既不按分野取、也不看 isMine（实测两条线都会画出这套
    // 数字），只有「属于我的记录」那块才按分野收起来。
    // 而库里造口事实只挂在真的做了改道的主体上（NMIBC 患者不该有造口袋，不能给他造一行假事实）。
    // 折中：只在**演示库**（demo_meta 带演示标记）里把这份全局常量也发给没有造口行的档案，
    // 好让逐字符 parity 通过；真实库严格按 subject_id 取，绝不串档案。
    // ⚠️ 原型把这两个页签按「有没有改道」收起来之后，这个演示专用分支就该删掉。
    const supplies = all('SELECT * FROM stoma_supplies WHERE subject_id = ? ORDER BY rowid', pid);
    const logs = all('SELECT * FROM stoma_logs WHERE subject_id = ? ORDER BY batch_date DESC, rowid', pid);
    const stomaFallback = dataset && supplies.length === 0
      ? {
          supplies: all('SELECT * FROM stoma_supplies ORDER BY rowid'),
          logs: all('SELECT * FROM stoma_logs ORDER BY batch_date DESC, rowid'),
        }
      : null;
    const docs = all('SELECT * FROM documents WHERE subject_id = ? ORDER BY rowid', pid);
    const fields = all(
      'SELECT * FROM candidate_fields WHERE document_id IN (SELECT id FROM documents WHERE subject_id = ?) ORDER BY rowid',
      pid,
    );
    const diversion = one('SELECT * FROM diversion_facts WHERE subject_id = ? AND is_current = 1 ORDER BY rowid', pid);
    const bcgRows = all('SELECT * FROM bcg_responses WHERE subject_id = ? ORDER BY rowid', pid);
    const thresholds = all('SELECT * FROM renal_thresholds ORDER BY rowid');

    // ── 观测点按指标分组：rowid 顺序 = 播种顺序，按观察日期排序才是原型的点序 ──
    const obsOf = (code) => obs.filter((o) => o.metric_code === code).sort((a, b) => (a.observed_on < b.observed_on ? -1 : 1));
    const valueOf = (o) => (o.value_num !== null && o.value_num !== undefined ? o.value_num : o.value_text);

    // ── 指标序列 ──
    // 只出数值型指标：分类指标（尿细胞学）在原型里属于 CATEGORICAL 目录、不进折线，
    // 它的观测点仍会用到（尿细胞学记录的 lab/method 就存在分类观测点上）。
    const metrics = definitions.filter((d) => d.value_kind !== 'categorical').map((d) => {
      const pts = obsOf(d.code);
      const first = pts[0] ?? null;
      const seriesLab = first ? orNull(first.lab) : null;
      const seriesMethod = first ? orNull(first.method) : null;
      const points = pts.map((p) => {
        const point = { d: p.observed_on, v: valueOf(p) };
        // 点级 lab/method 只在**换了可比组**时输出：同一家实验室同一方法就不重复写，
        // 否则原型每个点都会多出两个键（形状不一致）。肌酐在 2026-10-08 换成社区医院苦味酸法，
        // 这两个点因此各自带组信息，前端才不会跨组连线。
        const lab = orNull(p.lab);
        const method = orNull(p.method);
        if (lab !== seriesLab) point.lab = lab;
        if (method !== seriesMethod) point.method = method;
        return point;
      });
      return {
        code: d.code,
        name: d.name,
        cat: d.cat,
        unit: d.unit,
        color: CAT_COLOR[d.cat] ?? null,
        points,
        refLow: d.ref_low,
        refHigh: d.ref_high,
        lab: seriesLab,
        method: seriesMethod,
        src: first ? (refLabel.get(first.source_ref_id) ?? null) : null,
        ctcae: d.ctcae_grade === null || d.ctcae_grade === undefined ? null : { grade: d.ctcae_grade, text: d.ctcae_text, range: d.ctcae_range },
      };
    });

    // ── 灌注：课程 + 事件（阶段计划与批号在 view_hints 里，表没有这些列）──
    const course = courses[0] ?? null;
    const courseHints = course ? hints.instillation?.[course.id] ?? {} : {};
    const instillation = course
      ? {
          agent: course.drug_name,
          phasePlan: courseHints.phasePlan ?? [],
          events: instEvents.map((e) => {
            const ev = { phase: e.phase, idx: e.seq, planned: e.planned_on };
            ev.actual = e.performed_on ?? null; // 没做就是 null（原型保留这个键）
            ev.st = INST_STATUS[e.status] ?? 'planned';
            if (e.cancel_reason) ev.cancelReason = e.cancel_reason;
            return ev;
          }),
          doseRaw: course.dose_raw,
          supplyNote: course.supply_note,
          // 保留时长的列在事件行上（instillation_events.retention_minutes），课程层没有，
          // 原型这一格现在也是 null。
          retentionMinutes: null,
        }
      : null;

    // ── 复查：排程按「同一天、同一来源口径」合并（膀胱镜 + 尿细胞学是两条行、一条展示）──
    const grouped = new Map();
    for (const r of schedules) {
      const key = `${r.next_due_on}|${r.planned_note ?? ''}|${r.source_version ?? ''}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    }
    const schedule = [...grouped.values()]
      .sort((a, b) => (a[0].next_due_on < b[0].next_due_on ? -1 : 1))
      .map((group) => {
        const r = group[0];
        const kind = r.planned_note ?? UPPER_MODALITY[r.modality] ?? r.modality;
        const intervalSource = [r.source_version, r.interval_text].filter(Boolean).join('（') + (r.interval_text ? '）' : '');
        return { kind, planned: r.next_due_on, intervalSource };
      });

    const lastCyst = cyst[cyst.length - 1] ?? null;
    const cystHints = lastCyst ? hints.cystoscopy?.[lastCyst.id] ?? {} : {};
    const exp = experiences[experiences.length - 1] ?? null;
    const nextDue = schedules.map((r) => r.next_due_on).filter(Boolean).sort()[0] ?? null;
    // 尿细胞学的 lab/method 不在 urine_cytology 表里（没有这两列），它同时是指标序列，
    // 所以从同一天的分类观测点上取。
    const cytObs = (d) => obs.find((o) => o.metric_code === 'cytology' && o.observed_on === d) ?? null;
    const followup = {
      schedule,
      lastExam: lastCyst
        ? {
            performedOn: lastCyst.performed_on,
            modality: [SCOPE[lastCyst.scope_kind], ANESTHESIA[lastCyst.anesthesia]].filter(Boolean).join(' · '),
            findingRaw: lastCyst.finding,
            conclusionRaw: cystHints.conclusionRaw ?? null,
            biopsyTaken: cystHints.biopsyTaken ?? null,
            nextPlannedOn: nextDue,
          }
        : null,
      experience: exp ? { painScore: exp.pain_score, moodNote: exp.mood_note } : null,
      cytology: cyt.map((c) => {
        const o = cytObs(c.collected_on);
        return {
          date: c.collected_on,
          specimen: SPECIMEN[c.specimen_kind] ?? c.specimen_kind,
          state: c.result_state,
          raw: c.report_text,
          lab: o ? orNull(o.lab) : null,
          method: o ? orNull(o.method) : null,
        };
      }),
      upperTract: upper.map((u) => ({
        date: u.d,
        modality: UPPER_MODALITY[u.modality] ?? u.modality,
        findingRaw: u.finding,
        // 肾积水与吻合口在 upper_tract_surveillance 里没有列 → view_hints
        hydronephrosis: hints.upperTract?.[u.id]?.hydronephrosis ?? null,
        anastomotic: hints.upperTract?.[u.id]?.anastomotic ?? null,
      })),
    };

    // ── 肾功能：门槛原文（全库共用表）、分肾功能、引流、最近三段配对 ──
    const egfrObs = obsOf('egfr');
    const crObs = obsOf('cr');
    const renal = {
      // 肾功能页只列三段配对采样；这个选择是演示内容、不是可推导规则（2026-08-20 同样配对却没列），
      // 所以日期清单放在 view_hints.renalPointDates。
      points: (hints.renalPointDates?.[pid] ?? []).map((d) => {
        const e = egfrObs.find((o) => o.observed_on === d) ?? null;
        const c = crObs.find((o) => o.observed_on === d) ?? null;
        return {
          date: d,
          egfr: e ? valueOf(e) : null,
          creatinine: c ? valueOf(c) : null,
          lab: e ? orNull(e.lab) : null,
          method: e ? orNull(e.method) : null,
        };
      }),
      threshold: thresholds.length
        ? { text: thresholds[0].note, source: refLabel.get(thresholds[0].source_ref_id) ?? null }
        : null,
      split: one('SELECT * FROM split_renal_function WHERE subject_id = ? ORDER BY rowid', pid)
        ? (() => {
            const sp = one('SELECT * FROM split_renal_function WHERE subject_id = ? ORDER BY rowid', pid);
            return { on: sp.d, left: sp.left_pct, right: sp.right_pct, method: sp.method };
          })()
        : null,
      drainage: (() => {
        const dr = one('SELECT * FROM drainage_events WHERE subject_id = ? ORDER BY rowid', pid);
        return dr ? { kind: DRAINAGE[dr.kind] ?? dr.kind, placedOn: dr.placed_on, note: dr.note } : null;
      })(),
    };

    // ── 手术（按分野取，这是原型里真正分档案的三块之一）──
    const turbtEvents = surgery.filter((e) => e.kind === 'turbt' || e.kind === 're_turbt');
    const reportAt = (d) => one('SELECT * FROM pathology_reports WHERE subject_id = ? AND reported_on = ? ORDER BY rowid', pid, d);
    const findingAt = (d, key) => {
      const r = reportAt(d);
      return r ? one('SELECT * FROM pathology_findings WHERE report_id = ? AND finding_key = ? ORDER BY rowid', r.id, key) : null;
    };
    const radicalEvent = surgery.find((e) => e.kind === 'radical_cystectomy' || e.kind === 'partial_cystectomy') ?? null;
    const surgeryCase = {
      turbt: turbtEvents.map((e, i) => {
        const h = hints.surgery?.[e.id] ?? {};
        return {
          seq: i + 1,
          on: e.performed_on,
          by: e.hospital,
          complete: h.complete ?? e.resection_complete,
          muscle: h.muscle ?? reportAt(e.performed_on)?.muscle_present ?? null,
          perforation: h.perforation ?? null,
          cath: h.cath ?? null,
          path: h.path ?? findingAt(e.performed_on, '病理结论')?.value_raw ?? null,
        };
      }),
      // 计划中的二次电切：surgery_events.performed_on 是 NOT NULL，装不下「计划中」。
      reTurbt: hints.plannedReTurbt?.[pid] ?? null,
      radical: radicalEvent
        ? (() => {
            const h = hints.surgery?.[radicalEvent.id] ?? {};
            return {
              on: radicalEvent.performed_on,
              by: radicalEvent.hospital,
              scope: h.scope ?? null,
              organs: h.organs ?? null,
              diversion: diversion ? (DIVERSION[diversion.kind] ?? diversion.kind) : null,
              nodes: h.nodes ?? null,
              margin: h.margin ?? null,
              lvi: h.lvi ?? null,
              // 根治标本的分期原串（含「（演示）」这类标注）在病理发现里，结构化字段在
              // staging_assertions；手术卡片要的是原串，所以取发现行。
              stage: findingAt(radicalEvent.performed_on, '分期（根治标本）')?.value_raw ?? null,
              stay: h.stay ?? null,
            };
          })()
        : null,
    };

    // ── 治疗（另一块分档案的数据）──
    const treatmentCase = {
      lines: lines.map((l) => {
        const h = hints.treatmentLines?.[l.id] ?? {};
        return {
          no: h.no ?? null,
          regimen: h.regimen ?? null,
          from: l.started_on ?? '',
          to: l.ended_on ?? '',
          status: h.status ?? null,
          why: l.intent ?? '',
          mounted: h.mounted ?? '—',
        };
      }),
      drugs: drugs.map((d) => {
        const h = hints.drugs?.[d.id] ?? {};
        return {
          name: d.drug_name,
          dose: d.dose_text,
          route: h.route ?? null,
          plan: d.schedule_text,
          done: h.done ?? null,
          next: h.next ?? null,
          src: h.src ?? null,
        };
      }),
      evals: evals_.map((e) => ({
        on: e.assessed_on,
        how: e.basis,
        result: e.value_raw,
        note: hints.responses?.[e.id]?.note ?? null,
      })),
    };

    // ── 资料库 / 候选 / 已确认事实 ──
    // candidate_fields 没有「抄下来的值」这一列：候选被采纳后，值就等于那条事实的值，
    // 所以这里按 field_key 回指事实（尿细胞学结果 / 标本类型 / BCG 批号）；
    // 还没核对的「尿比重」本来就是空值（原件字迹模糊，留空等手填）。
    const draftValue = {
      尿细胞学结果: () => cyt[0]?.result_state ?? '',
      标本类型: () => SPECIMEN[cyt[0]?.specimen_kind] ?? '',
      'BCG 批号': () => hints.instillation?.[course?.id]?.batch ?? '',
      尿比重: () => '',
    };
    const records = {
      files: (hints.documentOrder ?? [])
        .filter((id) => id.startsWith(`${pid}-doc-`))
        .map((id) => {
          const doc = docs.find((d) => d.id === id);
          const h = hints.documents?.[id] ?? {};
          return {
            name: (doc?.relative_path ?? '').split('/').pop().replace(/\.pdf$/i, ''),
            kind: DOC_KIND[doc?.doc_kind] ?? doc?.doc_kind ?? null,
            on: (doc?.imported_at ?? '').slice(0, 10),
            by: h.by ?? null,
            pages: h.pages ?? null,
            state: h.state ?? REVIEW_STATE[doc?.status] ?? null,
          };
        }),
      drafts: fields.map((f) => {
        const draft = {
          field: f.field_key,
          value: (draftValue[f.field_key] ?? (() => ''))(),
          quote: f.raw_text,
          ok: f.status === 'accepted' || f.status === 'edited',
        };
        const why = hints.drafts?.[f.id]?.why;
        if (why) draft.why = why; // 只有留空待填的那条有 why（原型如此）
        return draft;
      }),
      facts: hints.recordsFacts?.[pid] ?? [],
    };

    // ── 改道（第三块分档案的数据）：有的档案没做改道，用 appliesToProfile 标出来 ──
    const dc = fb.diversionCase ?? null;
    const diversionCase = dc
      ? {
          activeKind: dc.activeKind,
          appliesToProfile: dc.appliesToProfile,
          operatedOn: diversion?.performed_on ?? null,
          hospital: diversion?.note ?? null, // diversion_facts 没有机构列 → 播种时写进 note
          values: dc.values ?? {},
          explain: dc.explain ?? {},
        }
      : null;

    // ── 造口耗材与日记：id 还原成原型的短号（s1/s2/s3）──
    // 剥前缀不认当前 pid：演示库里没有造口行的档案会拿到另一主体的行（见上面的折中说明），
    // 只按 pid 剥会得到 `demo2-supply-s1`，而原型渲染的是 `s1`（日志里 `supplyId === 's1'`
    // 决定显示「底盘 · 演示A」），两边就对不上了。
    const shortSupplyId = (id) => String(id).replace(/^.*-supply-/, '');
    const stomaSupply = (stomaFallback?.supplies ?? supplies).map((s) => ({
      id: shortSupplyId(s.id),
      kind: s.category,
      brand: s.brand,
      size: s.model, // 原型只有一个尺寸栏；表里 model 是 NOT NULL、size_note 是备注，尺寸落在 model
      interval: hints.stomaSupplyInterval?.[s.id] ?? null,
    }));
    const stomaLog = (stomaFallback?.logs ?? logs).map((l) => ({
      batchOn: l.batch_date,
      supplyId: l.supply_id ? shortSupplyId(l.supply_id) : null,
      changes: l.changes_count,
      leaks: l.leak_count,
      skin: l.skin_state,
      odor: l.odor_note,
    }));

    // ── 问题清单：原型分「复诊问题」（asked 是「已问/未问」）与「试验问题」（asked 是布尔）──
    // 表里只有 asked_on（日期）与 answer_text；原型没给「已问」的日期，
    // 所以这里用「有没有答案」判「已问」。若将来出现「问了但没记答案」，需要补 asked_on。
    const askedOf = (row) => Boolean(row.asked_on || (row.answer_text && String(row.answer_text).trim()));
    const visitQs = qs.filter((r) => hints.questions?.[r.id]?.kind === 'visit');
    const trialQs = qs.filter((r) => hints.questions?.[r.id]?.kind === 'trial');

    // ── 治疗事件泳道：两条线共用原型 charts.js 的那 3 个节点（理由见 TREATMENT_TIMELINE 注释）──
    const treatments = TREATMENT_TIMELINE.map((t) => ({ ...t }));

    return {
      id: pid,
      name: s.display_name,
      relation: s.relation,
      line: line ? line.line : null, // 'nmibc' | 'mibc'：前端靠它把分野映射到档案
      lineDecidedAt: line ? line.decided_at : null,
      treatments,
      pathology: pathologyBlock(),
      bcgResponse: (() => {
        const current = bcgRows.find((r) => r.is_current) ?? bcgRows[bcgRows.length - 1] ?? null;
        // bcg_responses 的表级 CHECK 要求「无应答/不耐受」必须同时有判定日期与医生原话，
        // 原型的 {status:'未判定', judgedOn:null, doctorQuote:null} 因此装不进表 → 不插行，
        // 读模型用「没有当前行」表达未判定。
        if (!current) return { status: '未判定', judgedOn: null, doctorQuote: null, history: [] };
        const shape = (r) => ({ status: r.status, judgedOn: r.decided_on, doctorQuote: r.doctor_words_raw });
        return { ...shape(current), history: bcgRows.filter((r) => r.id !== current.id).map(shape) };
      })(),
      highRiskMarkers: hrm.map((m) => ({
        key: HRM[m.kind] ?? m.kind,
        // 表里没有「是否命中」列：有 noted_on 就是有记录；演示数据四项都没标日期 → null。
        state: m.noted_on ? '已记录' : null,
        note: m.note_raw,
      })),
      instillation,
      followup,
      renal,
      metrics,
      diversionCase,
      surgeryCase,
      treatmentCase,
      records,
      // 生活与照护、试验统计这些整块内容在 schema 里没有对应表 → view_hints 里的 free_blocks 原样带出
      life: fb.life ?? null,
      questions: visitQs.map((r) => ({
        group: hints.questions[r.id].group,
        q: r.text,
        asked: askedOf(r) ? '已问' : '未问',
        answer: r.answer_text ?? '',
      })),
      trialFavorites: bms.map((b) => {
        const t = one('SELECT * FROM trials WHERE id = ?', b.trial_id);
        return {
          reg: t ? t.reg_no : null,
          why: b.note,
          on: (b.created_at ?? '').slice(0, 10),
          next: hints.bookmarks?.[b.id]?.next ?? null,
        };
      }),
      trialQuestions: trialQs.map((r) => ({
        group: hints.questions[r.id].group,
        q: r.text,
        for: hints.questions[r.id].for ?? '—',
        asked: askedOf(r),
      })),
      stomaSupply,
      stomaLog,
      trials: all('SELECT * FROM trials ORDER BY rowid').map((t) => ({
        reg: t.reg_no,
        scope: t.scope,
        setting: t.setting,
        status: t.status_raw,
        title: t.title,
        sponsor: t.sponsor,
        url: t.url,
      })),
      trialsStats: fb.trialsStats ?? null,
    };
  });

  return { meta, catalogs, profiles };
}
