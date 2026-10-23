/* ============================================================
   小泉宝 UroPal · 原型演示数据 v0.1
   ⚠️ 全部为演示数据，不含任何真实患者信息。
   有出处的医学事实标注来源；无出处的字段标「来源待补」。
   真实试验记录来自 research/bladder-cancer/（2026 快照，295 条）。
   ============================================================ */
'use strict';

/* ---------- 左侧导航（12 个一级页；设置走顶栏齿轮） ---------- */
const NAV = [
  { id: 'dashboard',    text: '看板',            ico: '◎' },
  { id: 'records',      text: '病情整理',        ico: '▤',
    tabs: ['资料库', '待核对草稿', '病情档案', '指标检测', '病情汇总'] },
  { id: 'staging',      text: '我的分型与分期',  ico: '◈', tabs: ['分野与分型', '病理与分级', '分期断言', '危险度'] },
  { id: 'surgery',      text: '手术与 TURBT',    ico: '✚', tabs: ['TURBT 序列', '二次电切', '根治性切除'] },
  { id: 'instillation', text: '膀胱灌注',        ico: '◍', tabs: ['周期总览', '本次记录', '禁忌与中断', '副作用'] },
  { id: 'diversion',    text: '尿流改道与造口',  ico: '⬡', tabs: ['三术式对照', '回肠造口', '原位新膀胱', '输尿管皮肤造口', '造口日记', '耗材目录'] },
  { id: 'treatment',    text: '治疗历程',        ico: '⇄', tabs: ['治疗线', '用药与周期', '疗效评估', '肾功能门槛'] },
  { id: 'followup',     text: '复查与膀胱镜',    ico: '◉', tabs: ['复查排程', '本次记录', '方式与麻醉', '疼痛与心情', '尿细胞学', '上尿路监测'] },
  { id: 'metrics',      text: '检查与指标',      ico: '▦', tabs: ['分类指标卡', '指标总览', '电解质与 B12', '肾功能'] },
  { id: 'chart',        text: '病情一图秀',      ico: '∿' },
  { id: 'urgent',       text: '急症与安全',      ico: '⚑' },
  { id: 'life',         text: '生活与照护',      ico: '☘', tabs: ['饮水与饮食', '造口与社交', '性功能与亲密', '工作与出行', '照护者交接'] },
  { id: 'visit',        text: '复诊准备',        ico: '✎', tabs: ['问题清单', '复诊摘要', '就诊准备'] },
  { id: 'trials',       text: '临床试验',        ico: '⌕', tabs: ['线索', '已收藏', '入组问题'] },
];

/* ---------- 全局状态 ---------- */
const STATE = {
  line: null,              // null | 'nmibc' | 'mibc' | 'undetermined'
  lineHistory: [],         // 改线留痕
  route: 'dashboard',
  tab: {},                 // 每页当前二级页签
  textsize: 'normal',      // normal | large | xlarge
  motion: 'auto',          // auto | reduce
  agentOpen: false,
  agentWidth: 35,          // 25–45
  draftScope: 'visit',     // visit | chart | verify
  verifiedOnly: true,
};

/* ---------- 演示：病理与分期（原文优先） ---------- */
const PATHOLOGY = {
  reportDate: '2026-09-18',
  raw: '膀胱高级别尿路上皮癌，浸润固有层（T1），未见肌层组织。',
  gradeRaw: '高级别',          // 原文
  gradeSchemeRaw: '',          // 报告未写体系名
  otherGradeRaw: null,         // 报告未出现 G1/G2/G3
  musclePresent: '无',         // 有 | 无 | 未提及
  concurrentCis: '未提及',
  lvi: '未提及',
  reviewState: '待核对',
  source: '演示报告 · 非真实病历',
};

/* ---------- 演示：灌注疗程（两段结构） ---------- */
const INSTILLATION = {
  agent: 'BCG（卡介苗）',
  phasePlan: [
    { phase: '即刻', note: '术后 24 小时内', total: 1 },
    { phase: '诱导', note: '每周 1 次 × 6～8 次；BCG 须术后 ≥2 周', total: 6 },
    { phase: '维持', note: '每 2～4 周 1 次', total: 9 },
  ],
  events: [
    { phase: '即刻', idx: 1, planned: '2026-09-18', actual: '2026-09-18', st: 'done' },
    { phase: '诱导', idx: 1, planned: '2026-10-02', actual: '2026-10-02', st: 'done' },
    { phase: '诱导', idx: 2, planned: '2026-10-09', actual: '2026-10-09', st: 'done' },
    { phase: '诱导', idx: 3, planned: '2026-10-16', actual: '2026-10-16', st: 'done' },
    { phase: '诱导', idx: 4, planned: '2026-10-23', actual: null, st: 'cancel', cancelReason: '肉眼血尿' },
    { phase: '诱导', idx: 5, planned: '2026-10-30', actual: null, st: 'planned' },
    { phase: '诱导', idx: 6, planned: '2026-11-06', actual: null, st: 'planned' },
  ],
  doseRaw: '120 mg',
  supplyNote: null,
  retentionMinutes: null,     // ⚠️ 来源待补：原文为图片
};

/* 禁忌（E1：2021 灌注共识） */
const CONTRA = [
  { kind: '膀胱穿孔', group: '化疗药与 BCG 共有' },
  { kind: '肉眼血尿', group: '化疗药与 BCG 共有' },
  { kind: '严重化学性膀胱炎', group: '化疗药与 BCG 共有' },
  { kind: '急性尿路感染', group: '化疗药与 BCG 共有' },
  { kind: '术后 2 周内', group: '仅 BCG' },
  { kind: '创伤性导尿', group: '仅 BCG' },
];

/* ---------- 演示：复查与膀胱镜 ---------- */
const FOLLOWUP = {
  schedule: [
    { kind: '膀胱镜 + 尿细胞学', planned: '2026-12-16', intervalSource: '2022 保膀胱共识（每 3 个月）' },
    { kind: '上尿路影像', planned: '2027-04-08', intervalSource: '2022 保膀胱共识（每 6～12 个月）' },
  ],
  lastExam: {
    performedOn: '2026-09-18',
    modality: '硬性膀胱镜 · 腰麻',
    findingRaw: '膀胱右侧壁见乳头状新生物，已电切。',
    conclusionRaw: '高级别尿路上皮癌，T1，未见肌层组织。',
    biopsyTaken: '是',
    nextPlannedOn: '2026-12-16',
  },
  experience: { painScore: 6, moodNote: '检查前一周睡不好；这次麻醉后恢复比上次快。' },
  cytology: [
    { date: '2026-09-18', specimen: '膀胱冲洗', state: '非典型', raw: '查见非典型尿路上皮细胞。', lab: '演示检验科', method: '液基' },
    { date: '2026-06-12', specimen: '自然尿',   state: '阴性',   raw: '未见瘤细胞。',             lab: '演示检验科', method: '液基' },
  ],
  upperTract: [
    { date: '2026-09-18', modality: 'CT 尿路造影', findingRaw: '双肾及输尿管未见明确异常。', hydronephrosis: '无', anastomotic: null },
  ],
};

/* ---------- 演示：肾功能 ---------- */
const RENAL = {
  points: [
    { date: '2026-06-12', egfr: 88, creatinine: 82, lab: '演示检验科', method: 'CKD-EPI' },
    { date: '2026-09-18', egfr: 74, creatinine: 96, lab: '演示检验科', method: 'CKD-EPI' },
    { date: '2026-10-22', egfr: 66, creatinine: 105, lab: '演示检验科', method: 'CKD-EPI' },
  ],
  threshold: { text: 'CrCl＜60 ml/min 或 eGFR ≤60 ml/min（顺铂不耐受门槛）', source: '2022 / 2024 中国膀胱癌保膀胱治疗多学科诊治协作共识' },
  split: null,
  drainage: { kind: '无', placedOn: null, note: null },
};

/* ---------- 演示：指标（一图秀 + 3D 卡共用同一目录） ---------- */
/* 指标序列。点级可带 lab/method —— 机构或方法一变就拆「可比组」，不跨组连线（C11）。
   演示档案跨越 2025-06 → 2026-10；肌酐在 2026-10-08 换了医院（酶法 → 苦味酸法），
   这两点与之前不同组，不能直接连成一条线。 */
const METRICS = [
  {
    code: 'egfr', name: 'eGFR', cat: '肾功能', unit: 'mL/min/1.73m²', color: 'var(--d-renal)',
    points: [
      { d: '2025-06-20', v: 95 }, { d: '2025-12-12', v: 93 }, { d: '2026-03-10', v: 92 },
      { d: '2026-06-12', v: 88 }, { d: '2026-08-20', v: 84 }, { d: '2026-09-18', v: 74 },
      { d: '2026-10-08', v: 70 }, { d: '2026-10-22', v: 66 },
    ],
    refLow: 90, refHigh: null, lab: '演示检验科', method: 'CKD-EPI', src: '演示数据',
    ctcae: null,
  },
  {
    code: 'hb', name: '血红蛋白', cat: '血常规', unit: 'g/L', color: 'var(--d-blood)',
    points: [
      { d: '2025-06-20', v: 148 }, { d: '2025-12-12', v: 145 }, { d: '2026-03-10', v: 138 },
      { d: '2026-06-12', v: 131 }, { d: '2026-08-20', v: 126 }, { d: '2026-09-18', v: 118 },
      { d: '2026-10-08', v: 121 }, { d: '2026-10-22', v: 124 },
    ],
    refLow: 130, refHigh: 175, lab: '演示检验科', method: '血细胞分析', src: '演示数据',
    ctcae: { grade: 1, text: '对照 CTCAE v5.0 · 1 级', range: 'Hb 100–129 g/L（贫血 1 级，通用下限）' },
  },
  {
    code: 'anc', name: '中性粒细胞绝对值', cat: '血常规', unit: '10⁹/L', color: 'var(--d-blood)',
    points: [
      { d: '2025-12-12', v: 3.6 }, { d: '2026-03-10', v: 3.4 }, { d: '2026-08-20', v: 3.3 },
      { d: '2026-09-18', v: 3.1 }, { d: '2026-10-08', v: 2.7 }, { d: '2026-10-22', v: 2.4 },
    ],
    refLow: 1.8, refHigh: 6.3, lab: '演示检验科', method: '血细胞分析', src: '演示数据',
    ctcae: null,
  },
  {
    code: 'cr', name: '肌酐', cat: '肾功能', unit: 'μmol/L', color: 'var(--d-renal)',
    points: [
      { d: '2025-06-20', v: 78 }, { d: '2025-12-12', v: 79 }, { d: '2026-06-12', v: 82 },
      { d: '2026-08-20', v: 88 }, { d: '2026-09-18', v: 96 },
      { d: '2026-10-08', v: 101, lab: '演示社区医院', method: '苦味酸法' },
      { d: '2026-10-22', v: 105, lab: '演示社区医院', method: '苦味酸法' },
    ],
    refLow: 41, refHigh: 111, lab: '演示检验科', method: '酶法', src: '演示数据',
    ctcae: null,
  },
  {
    code: 'alt', name: 'ALT', cat: '肝功能', unit: 'U/L', color: 'var(--d-lyte)',
    points: [
      { d: '2026-03-10', v: 19 }, { d: '2026-06-12', v: 21 }, { d: '2026-08-20', v: 24 },
      { d: '2026-09-18', v: 22 }, { d: '2026-10-08', v: 27 }, { d: '2026-10-22', v: 31 },
    ],
    refLow: 7, refHigh: 40, lab: '演示检验科', method: '速率法', src: '演示数据',
    ctcae: null,
  },
  {
    code: 'weight', name: '体重', cat: '营养', unit: 'kg', color: 'var(--d-nutrition)',
    points: [
      { d: '2026-06-12', v: 71.5 }, { d: '2026-07-15', v: 70.8 }, { d: '2026-08-20', v: 70.1 },
      { d: '2026-09-18', v: 69.4 }, { d: '2026-10-08', v: 69.2 }, { d: '2026-10-22', v: 69.0 },
    ],
    refLow: null, refHigh: null, lab: null, method: '家用体重秤', src: '自测',
    ctcae: null,
  },
  {
    code: 'pain', name: '疼痛自评', cat: '症状自评', unit: '分（0–10）', color: 'var(--d-symptom)',
    points: [
      { d: '2026-09-19', v: 6 }, { d: '2026-09-26', v: 3 }, { d: '2026-10-05', v: 2 },
      { d: '2026-10-15', v: 3 }, { d: '2026-10-22', v: 2 },
    ],
    refLow: null, refHigh: null, lab: null, method: '本人自评', src: '自述',
    ctcae: null,
  },
];

/* 分类指标：不进折线 */
const CATEGORICAL = [
  { code: 'cytology', name: '尿细胞学', cat: '尿检', values: [
    { d: '2026-06-12', v: '阴性', specimen: '自然尿' },
    { d: '2026-09-18', v: '非典型', specimen: '膀胱冲洗' },
  ] },
];

/* ---------- 演示：尿流改道三术式（零倾向对照） ---------- */
const DIVERSION = [
  {
    kind: '回肠通道造口', aka: 'Bricker 术',
    fields: ['底盘型号与更换周期', '皮肤并发症', '渗漏次数', '气味管理', '夜间集尿器', '耗材目录'],
    daily: '腹壁造口，持续佩戴集尿装置。',
  },
  {
    kind: '原位新膀胱', aka: '新膀胱',
    fields: ['控尿训练', '间歇导尿', '残余尿量', '排尿方式', '夜间尿垫'],
    daily: '经尿道排尿，可能需要间歇导尿排空。',
  },
  {
    kind: '输尿管皮肤造口', aka: '输尿管造口',
    fields: ['支架管护理', '吻合口观察', '造口周围皮肤', '更换周期'],
    daily: '腹壁造口，通常有输尿管支架管。',
  },
];

/* ---------- 演示：MIBC 根治与改道（DEMO-2 档案） ----------
   为什么需要这一块：DEMO-1 是 NMIBC 保膀胱线，本来就不做改道，
   于是「尿流改道与造口」整页在演示里永远只有空表 —— 看起来像没做完。
   这里给 DEMO-2 一份真实形状的改道记录，MIBC 侧才有东西可看。
   全部为演示数据，非真实病历。 */
const DIVERSION_CASE = {
  activeKind: '回肠造口',
  operatedOn: '2026-06-11',
  hospital: '演示医院 · 泌尿外科',
  /* 本档案实际采用的术式下的记录值 */
  values: {
    '回肠造口': [
      ['底盘型号', '演示A · 45 mm', '2026-07-02 从 55 mm 换过来'],
      ['更换周期', '每 3 天 1 次', '本人记录'],
      ['渗漏次数（近 30 天）', '1 次', '按批次加总，不是严重程度'],
      ['皮肤状态', '红（造口周围 2 点方向）', '2026-10-20 记录'],
      ['气味管理', '换袋后基本没有', '本人记录'],
      ['夜间集尿器', '起夜 2 次', '本人记录'],
    ],
  },
  /* 每种术式下「会记什么、为什么要记」——本档案没做的术式也给解释，
     但不编造数值。 */
  explain: {
    '回肠造口': [
      ['底盘型号与更换周期', '底盘是贴在皮肤上、造口袋卡在上面的那一片。换型号通常是为了解决渗漏或皮肤问题。'],
      ['造口周围皮肤并发症', '发红、破溃是最常见的麻烦，多数和底盘裁剪、更换节奏有关。'],
      ['渗漏次数', '记次数是为了看出「是不是某个型号、某段时间总漏」，不是评价护理得好不好。'],
      ['气味管理', '记录用过什么方式、有没有效，方便下次门诊直接说。'],
      ['夜间集尿器', '夜里怎么接尿、起夜几次，直接影响睡眠，值得单独记。'],
      ['耗材目录', '型号从目录里选，不用每次重新打字。'],
    ],
    '原位新膀胱': [
      ['控尿训练进度', '新膀胱没有原来那套括约肌配合，要重新练憋尿与排尿，进度按周记。'],
      ['间歇导尿次数', '排不干净时自己插导尿管排空，记每天几次。'],
      ['残余尿量', '排完尿后还剩多少，是决定要不要继续导尿的依据。'],
      ['排尿方式', '靠肚子用力、靠导尿，还是两者都有。'],
      ['夜间尿垫', '夜里会不会漏、要用几片。'],
    ],
    '输尿管皮肤造口': [
      ['支架管护理与更换', '输尿管直接接到皮肤上，常放支架管防狭窄，记更换日期。'],
      ['吻合口观察', '输尿管与造口连接处的情况。'],
      ['造口周围皮肤', '与回肠造口类似，发红破溃要记。'],
      ['集尿装置更换周期', '多久换一次装置。'],
    ],
  },
};

const STOMA_SUPPLY = [
  { id: 's1', kind: '底盘', brand: '演示A', size: '45 mm', interval: 3 },
  { id: 's2', kind: '造口袋', brand: '演示A', size: '标准', interval: 1 },
  { id: 's3', kind: '防漏环', brand: '演示B', size: '中', interval: 3 },
];

const STOMA_LOG = [
  { batchOn: '2026-10-20', supplyId: 's1', changes: 2, leaks: 1, skin: '红', odor: '未使用除味剂' },
  { batchOn: '2026-10-13', supplyId: 's1', changes: 2, leaks: 0, skin: '无', odor: '—' },
];

/* ---------- 演示：急症四类 ---------- */
const URGENT = [
  { cat: '血块与尿潴留', items: ['排出大量血块或尿液带血块', '有尿意但排不出', '下腹持续胀痛'], src: 'missing' },
  { cat: 'BCG 全身感染', items: ['灌注后发热寒战', '症状持续不缓解', '伴明显乏力或血压偏低'], src: 'missing' },
  { cat: '造口缺血 / 梗阻', items: ['造口颜色变暗、发黑', '造口明显肿胀', '长时间不排气排便'], src: 'missing' },
  { cat: '无尿与腰痛', items: ['尿量明显减少或无尿', '一侧腰部持续疼痛', '伴发热'], src: 'missing' },
];

/* ---------- 演示：试验（真实 2026 记录，标题照抄） ---------- */
const TRIALS = [
  { reg: 'ChiCTR2600134528', scope: 'bladder', setting: 'nmibc-or-intravesical', status: 'RECRUITING',
    title: '卡介苗（BCG）灌注治疗失败的非肌层浸润性膀胱癌NMIBC 患者予RC48 联合anti-PD-1 单抗全身治疗的临床研究',
    sponsor: '天津医科大学第二医院', url: 'https://www.chictr.org.cn/showproj.html?proj=234867' },
  { reg: 'NCT07879469', scope: 'bladder', setting: 'nmibc-or-intravesical', status: 'NOT_YET_RECRUITING',
    title: 'Antibody-Drug Conjugate Plus Immunotherapy Versus Immunotherapy Plus Chemotherapy in Bladder Cancer',
    sponsor: 'Tianjin Medical University Second Hospital', url: 'https://clinicaltrials.gov/study/NCT07879469' },
  { reg: 'NCT07865611', scope: 'bladder', setting: 'mibc-or-perioperative', status: 'NOT_YET_RECRUITING',
    title: 'Response-Guided Bladder Preservation With Trastuzumab Rezetecan, Adebrelimab in MIBC',
    sponsor: 'Tongji Hospital', url: 'https://clinicaltrials.gov/study/NCT07865611' },
  { reg: 'NCT07853053', scope: 'bladder', setting: 'advanced-or-metastatic', status: 'NOT_YET_RECRUITING',
    title: 'DV Plus Toripalimab With Cetirizine and Mecobalamin Pretreatment in Patients With Advanced Bladder Cancer',
    sponsor: 'Sun Yat-Sen Memorial Hospital', url: 'https://clinicaltrials.gov/study/NCT07853053' },
  { reg: 'ChiCTR2600134270', scope: 'bladder', setting: 'unspecified', status: 'NOT_YET_RECRUITING',
    title: '靶向TROP2的放射性药物在膀胱癌诊疗中的研发和应用研究',
    sponsor: '暨南大学附属第一医院核医学科', url: 'https://www.chictr.org.cn/showproj.html?proj=347045' },
  { reg: 'NCT07848854', scope: 'bladder', setting: 'unspecified', status: 'RECRUITING',
    title: 'Trop2-Targeted NIR-II Fluorescent Probe for Identifying Bladder Cancer',
    sponsor: 'Yunnan Cancer Hospital', url: 'https://clinicaltrials.gov/study/NCT07848854' },
];

const TRIALS_STATS = {
  total: 295, ct: 212, chictr: 83,
  interventional: 195, bladderInterventional: 180, china: 158,
  raw: 511,
  views: { v_bladder_only: 272, v_interventional: 195, v_bladder_interventional: 180, v_china: 158 },
  fetchedAt: '2026-10-23',
};

/* ---------- 文案红线（scripts/check-wording.mjs 同口径） ---------- */
const WORDING_REDLINES = [
  '建议治疗', '可能复发', '可以停药', '无需就医', '终身随访',
  '终身', '应该用', '不应该用', '预后良好', '治愈',
];

/* ---------- Agent 上下文草稿（按 scope 生成） ---------- */
const DRAFT_SCOPES = {
  visit: {
    label: '复诊准备（默认不带私密项）',
    blocks: [
      { label: '当前处境', lines: ['分野：非肌层浸润（Ta/T1/Tis）', '病理原文：膀胱高级别尿路上皮癌，浸润固有层（T1），未见肌层组织。', '核对状态：待核对'] },
      { label: '灌注视疗', lines: ['药物：BCG（卡介苗）120 mg', '已完成：即刻 1 次、诱导 3 次', '2026-10-23 取消，原因：肉眼血尿', '下次计划：2026-10-30'] },
      { label: '下次复查', lines: ['膀胱镜 + 尿细胞学：2026-12-16（2022 保膀胱共识口径，每 3 个月）'] },
      { label: '要问医生的问题', lines: ['「未见肌层」是不是意味着分期不完整？', '这次因血尿取消，要不要补做？', 'eGFR 降到 66，会不会影响后续方案？'] },
    ],
    gaps: ['危险度分组：来源待补（原文为图片）', '灌注后膀胱内保留时间：来源待补'],
    excluded: ['性功能与亲密记录（私密，未勾选带入）', '疼痛自评明细（默认不带入）'],
  },
  chart: {
    label: '一图秀（仅带当前选中序列）',
    blocks: [
      { label: '选中序列', lines: ['eGFR：92 → 88 → 74 → 66 mL/min/1.73m²', '血红蛋白：138 → 131 → 118 → 124 g/L'] },
    ],
    gaps: ['肌酐与 eGFR 方法变更未标注', '2026-03-10 之前的记录：没有'],
    excluded: ['未选中的其他指标', '症状自评明细'],
  },
  verify: {
    label: '资料核对（仅已确认入库的事实）',
    blocks: [
      { label: '已确认事实', lines: ['病理报告 2026-09-18（已核对）', '尿细胞学 2026-06-12 阴性（已核对）'] },
    ],
    gaps: ['待核对草稿：2 条未确认候选（不展示内容）'],
    excluded: ['未确认候选的正文内容'],
  },
};
