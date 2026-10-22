#!/usr/bin/env node
/**
 * 采集「膀胱癌 / 尿路上皮癌（膀胱来源）」2026 年新登记临床试验，双源合并产出本地资料包。
 *
 * 用法：
 *   node scripts/fetch-bladder-trials-2026.mjs                 # 双源采集，写出资料包
 *   node scripts/fetch-bladder-trials-2026.mjs --dry-run       # 只打印命中数，不写文件
 *   node scripts/fetch-bladder-trials-2026.mjs --no-chictr     # 只采 ClinicalTrials.gov
 *
 * 两个来源（方法与胃癌/结直肠癌资料包同源，检索词与 scope 判据按膀胱癌重做）：
 *
 *   [CT]  ClinicalTrials.gov API v2
 *         query.cond 三组并集：bladder cancer / urothelial carcinoma / transitional cell carcinoma
 *         filter.advanced = AREA[StudyFirstPostDate]RANGE[2026-01-01,MAX]
 *         再经本地疾病术语过滤（命中标题或 conditions 任一）
 *
 *   [CN]  ChiCTR（中国临床试验注册中心），经本机 sidecar 的只读 HTTP 接口
 *         GET http://127.0.0.1:8848/search?title=<词>&createyear=2026&page=N&pages=1
 *         GET http://127.0.0.1:8848/detail?proj=<project_id>
 *         检索词：膀胱 / 尿路上皮癌；再经本地中文疾病术语过滤
 *         sidecar 未运行时**不静默降级**：该来源记为未采集并写进 manifest.limitations
 *
 * 与胃癌/结直肠癌资料包的**实质差异（本癌种特有，勿删）**：
 *   1. 「尿路上皮癌」不等于「膀胱癌」。上尿路尿路上皮癌（UTUC，肾盂/输尿管）生物学与治疗
 *      路径不同，若不分档，膀胱癌资料包里会混进 UTUC 研究，患者看到的"可用试验"就错了。
 *      因此每条记录除 category 外还判 scope：
 *        bladder                = 命中膀胱相关词（本研究的目标人群）
 *        urothelial-unspecified = 只命中尿路上皮词、未指明部位（多为转移性 mUC，通常含膀胱来源）
 *        utuc                   = 只命中上尿路词（肾盂/输尿管/上尿路），**不是膀胱癌**，仅留档备查
 *      记录不删，只打标；查询用 v_bladder_only 视图。
 *   2. ChiCTR 详情页含**研究者姓名、手机、邮箱、通讯地址、伦理联系人**等 PII。
 *      患者工作台不需要这些，且一旦入库就有泄露风险 → 统一由 PII_FIELDS 剥离，
 *      **剥除发生在写盘之前**，JSON 与 sqlite 里都不会出现。
 *   3. ChiCTR 有"注册号状态=补注册"（先开展后补登记）。补注册的试验其研究实施时间常早于
 *      注册时间，与 CT.gov「首次公示在 2026 年」不是同一件事，故单独存 registration_note
 *      字段供核对，并写进 limitations。
 *
 * 坑（勿改回，来自胃癌/结直肠癌包）：
 *   1. filter.advanced 是单值参数，两个 AREA 必须用 AND 拼成一个值，传两次会 400。
 *   2. pageToken 为空串会 400 —— 只有拿到非空 token 才带上。
 *   3. pageSize 上限 1000，取 200 稳。
 *   4. DatabaseSync 没有 transaction()（node:sqlite 22.x），必须显式 BEGIN/COMMIT。
 *
 * 口径变更记录（相对胃癌/结直肠癌模板）：
 *   模板只收 INTERVENTIONAL。膀胱癌 2026 单靠干预性双源合计不足 300 条，
 *   故本轮**两个来源都收干预性 + 观察性**，用 study_type_norm 分档并给 v_interventional 视图。
 *   若只要干预性，查 v_interventional，不要改脚本。
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, '..');
// 默认写在**本项目内**（资料包跟仓库走）。在项目外跑时用 env 覆盖。
const OUT_DIR = process.env.BLADDER_RESEARCH_DIR
  || join(PROJECT_ROOT, 'research', 'bladder-cancer');

const API = 'https://clinicaltrials.gov/api/v2/studies';
const YEAR_FROM = '2026-01-01';
const PAGE_SIZE = 200;

const CHICTR_BASE = process.env.CHICTR_SIDECAR_URL || 'http://127.0.0.1:8848';
const CHICTR_YEAR = '2026';

/** ─────────────── CT.gov 配置 ─────────────── */

/** 三组检索词：单一词会漏。第三组接的是旧命名 TCC（膀胱尿路上皮癌曾用名） */
const CT_QUERIES = [
  'bladder cancer',
  'urothelial carcinoma',
  'transitional cell carcinoma',
];

/**
 * 膀胱部位词：命中即认为本研究明确涉及膀胱。
 * ⚠️ 'nmibc' / 'mibc' 必须在内：实测 NCT07445308 的 conditions 只写 "NMIBC"，
 * 没有 "bladder" 字样，漏掉缩写会把真实的膀胱癌试验误杀。
 */
const BLADDER_TERMS = [
  'bladder', 'vesical', 'nmibc', 'mibc',
  'non-muscle invasive bladder', 'nonmuscle invasive bladder',
  'muscle-invasive bladder', 'muscle invasive bladder',
  'urinary bladder', 'urothelial bladder',
  'neoplasm of bladder', 'neoplasm of the bladder', 'cancer of the bladder',
  'carcinoma of the bladder', 'tumor of the bladder', 'tumour of the bladder',
  'bladder urothelial', 'urothelial carcinoma of the bladder',
];

/** 上尿路词：只有这些、没有膀胱词 → 判 UTUC（不是膀胱癌） */
const UTUC_TERMS = [
  'renal pelvis', 'renal pelvic', 'ureter', 'ureteral', 'ureteric',
  'upper tract', 'upper urinary tract', 'pyelocaliceal', 'calyceal',
  'nephroureterectomy', 'utuc',
];

/** 尿路上皮谱系词（含膀胱但未指明部位时用） */
const UROTHELIAL_TERMS = ['urothelial', 'transitional cell', 'urothelium'];

const DISEASE_TERMS = [...BLADDER_TERMS, ...UTUC_TERMS, ...UROTHELIAL_TERMS];

const BASKET_TERMS = [
  'solid tumor', 'solid tumour', 'solid neoplasm', 'advanced cancer', 'advanced solid',
  'advanced malignant', 'metastatic solid',
];

/**
 * 膀胱/尿路上皮以外的瘤种词。注意：
 * - prostate 算「其它瘤种」：前列腺癌是独立瘤种，与膀胱癌同属泌尿但治疗路径不同；
 * - renal / kidney / ureteral / transitional / urothelial **不算**其它瘤种——上尿路与膀胱同谱系；
 * - 'urologic neoplasms' 是泛化泌尿词，也不算。
 */
const OTHER_CANCER_TERMS = [
  'lung cancer', 'non-small cell lung', 'small cell lung', 'nsclc', 'sclc',
  'breast cancer', 'triple negative breast', 'colorectal', 'colon cancer', 'rectal cancer',
  'pancreatic', 'ovarian', 'prostate', 'liver cancer', 'hepatocellular',
  'head and neck', 'endometrial', 'biliary', 'cholangiocarcinoma', 'melanoma', 'sarcoma',
  'gastric', 'esophageal', 'cervical', 'thyroid', 'glioma', 'glioblastoma',
  'leukemia', 'leukaemia', 'lymphoma', 'myeloma', 'uterine', 'testicular', 'penile',
];

/** ─────────────── ChiCTR 配置 ─────────────── */

/**
 * 中文检索词。'膀胱' 已覆盖 膀胱癌/膀胱尿路上皮/膀胱肿瘤；
 * 单列 '尿路上皮癌' 是为了捞到未写"膀胱"二字的尿路上皮研究。
 * （实测 '肾盂癌'/'输尿管癌' 在 2026 年命中 0 条，故不列入，避免无谓请求。）
 */
const CN_TERMS = ['膀胱', '尿路上皮癌'];

/** 中文部位词 */
const CN_BLADDER_TERMS = ['膀胱', '脐尿'];
const CN_UTUC_TERMS = ['肾盂', '输尿管', '上尿路', '肾盏'];
const CN_UROTHELIAL_TERMS = ['尿路上皮', '移行细胞'];

/** 中文肿瘤词：必须同时有部位词 + 肿瘤词才算肿瘤研究（挡掉膀胱炎/尿失禁/结石等） */
const CN_CANCER_TERMS = ['癌', '肿瘤', '瘤', '尿路上皮', '移行细胞', 'neoplas', 'carcinom'];

/**
 * ChiCTR 详情页的 PII 字段（**写盘前剥除**）。
 *
 * ⚠️ 必须按**字段名模式**匹配，不能用精确名单。
 * 实测教训：最初写成精确 Set，里面只有「伦理委员会联系人」，
 * 而真实字段名是「伦理委员会联系人邮箱」——精确匹配漏掉，邮箱直接落盘。
 * ChiCTR 的字段名有大量同前缀变体（联系人 / 联系人电话 / 联系人邮箱 / 联系地址 …），
 * 精确枚举必然漏。故改为：先白名单豁免机构名，再用模式判 PII。
 */
const PII_KEEP = new Set([
  '研究负责人所在单位', // 机构名，非个人信息，且是重要归属信息
]);

const PII_PATTERN = /联系人|联系电话|电话|手机|邮箱|电子邮件|e-?mail|通讯地址|联系地址|具体地址|注册人|伦理委员会批件附件|上传文件|^研究负责人$/i;

function isPiiField(key) {
  return !PII_KEEP.has(key) && PII_PATTERN.test(key);
}

/** 实际剥除过的字段名（写进 manifest，作为"剥了哪些"的证据） */
const strippedPiiKeys = new Set();

/** ChiCTR 详情里要保留并映射到公共列的字段 */
const CN_FIELD_MAP = {
  disease: '研究疾病',
  studyType: '研究类型',
  design: '研究设计',
  stage: '研究所处阶段',
  funding: '经费或物资来源',
  ethics: '是否获伦理委员会批准',
  purpose: '研究目的',
  inclusion: '纳入标准',
  exclusion: '排除标准',
  period: '研究实施时间',
  recruitPeriod: '征募观察对象时间',
  enrollment: '样本量',
  institutionLevel: '单位级别',
  outcome: '指标中文名',
  outcomeType: '指标类型',
  recruitState: '征募研究对象情况',
  ageRange: '年龄范围',
  sex: '性别',
  country: '国家',
  province: '省(直辖市)',
  hospital: '单位(医院)',
  sponsor: '申请人所在单位',
  site: '研究实施负责（组长）单位',
  registrationStatus: '注册号状态',
  blinding: '盲法',
  randomization: '随机方法（请说明由何人用什么方法产生随机序列）',
  ipdShare: '是否共享原始数据',
  lastUpdate: '最近更新日期',
  registeredAt: '注册时间',
  officialTitle: '研究课题的正式科学名称',
};

/** ─────────────── 共用 ─────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const txt = (v) => (typeof v === 'string' ? v.trim() : '');
const dateOf = (s) => txt(s && s.date);

function normStudyType(raw) {
  const s = txt(raw).toLowerCase();
  if (/interventional|干预/.test(s)) return 'interventional';
  if (/observational|观察/.test(s)) return 'observational';
  if (/expanded/.test(s)) return 'expanded-access';
  return s ? 'other' : 'unknown';
}

/** scope 判定（本癌种特有，勿简化成一脚 bool）：见文件头说明 1 */
function classifyScopeEn(hay) {
  if (BLADDER_TERMS.some((t) => hay.includes(t))) return 'bladder';
  if (UTUC_TERMS.some((t) => hay.includes(t))) return 'utuc';
  if (UROTHELIAL_TERMS.some((t) => hay.includes(t))) return 'urothelial-unspecified';
  return 'other';
}

function classifyScopeZh(title) {
  if (CN_BLADDER_TERMS.some((t) => title.includes(t))) return 'bladder';
  if (CN_UTUC_TERMS.some((t) => title.includes(t))) return 'utuc';
  if (CN_UROTHELIAL_TERMS.some((t) => title.includes(t))) return 'urothelial-unspecified';
  return 'other';
}

/** 分期/线数线索，仅作检索辅助字段，**不代表入组资格** */
function classifySetting(hay) {
  if (/non-?muscle[- ]invasive|nmibc|\bcis\b|carcinoma in situ|bcg|intravesical|bladder instillation|非肌层浸润|膀胱灌注|卡介苗|经尿道|原位癌|电切/.test(hay)) {
    return 'nmibc-or-intravesical';
  }
  if (/muscle[- ]invasive|mibc|neoadjuvant|adjuvant|perioperative|cystectomy|radical cystectomy|肌层浸润|根治性膀胱切除|新辅助|辅助治疗|围术期|膀胱切除/.test(hay)) {
    return 'mibc-or-perioperative';
  }
  if (/metastatic|advanced|unresectable|locally advanced|palliative|first[- ]line|second[- ]line|晚期|转移|一线|二线|复发|不可切除/.test(hay)) {
    return 'advanced-or-metastatic';
  }
  return 'unspecified';
}

/** ─────────────── 来源一：ClinicalTrials.gov ─────────────── */

// 注意：这里**不再带** AREA[StudyType]，study_type_norm 分档由本地做（见文件头口径变更记录）
const CT_ADVANCED = `AREA[StudyFirstPostDate]RANGE[${YEAR_FROM},MAX]`;

async function ctFetchPage(cond, pageToken) {
  const url = new URL(API);
  url.searchParams.set('query.cond', cond);
  url.searchParams.set('filter.advanced', CT_ADVANCED);
  url.searchParams.set('pageSize', String(PAGE_SIZE));
  url.searchParams.set('countTotal', 'true');
  // pageToken 为空串会 400 —— 只在有值时带上
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => '')}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(800 * (attempt + 1));
    }
  }
  throw new Error(`检索失败 cond="${cond}": ${lastErr && lastErr.message}`);
}

function ctFlatten(study) {
  const p = (study && study.protocolSection) || {};
  const id = (p.identificationModule || {}).nctId;
  if (!id) return null;

  const status = p.statusModule || {};
  const design = p.designModule || {};
  const conds = ((p.conditionsModule || {}).conditions || []).filter(Boolean);
  const ivs = ((p.armsInterventionsModule || {}).interventions || []);
  const locs = ((p.contactsLocationsModule || {}).locations || []);
  const desc = p.descriptionModule || {};
  const elig = p.eligibilityModule || {};

  const title = txt((p.identificationModule || {}).briefTitle);
  const conditions = conds.join('; ');

  const interventions = ivs
    .map((i) => [txt(i.type), txt(i.name)].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('; ');

  const countryList = [...new Set(locs.map((l) => txt(l.country)).filter(Boolean))];
  const countries = countryList.join('; ');
  const isChina = countryList.some((c) => /china|hong kong|taiwan/i.test(c));

  const hay = `${title} ${conditions}`.toLowerCase();
  const hitsDisease = DISEASE_TERMS.some((t) => hay.includes(t));
  const condLower = conditions.toLowerCase();
  const isBasket = BASKET_TERMS.some((t) => condLower.includes(t))
    && OTHER_CANCER_TERMS.some((t) => condLower.includes(t));
  const rawStudyType = txt(design.studyType);

  return {
    registry: 'ClinicalTrials.gov',
    registry_id: id,
    title,
    official_title: txt((p.identificationModule || {}).officialTitle),
    first_posted: dateOf(status.studyFirstPostDateStruct),
    start_date: dateOf(status.startDateStruct),
    primary_completion: dateOf(status.primaryCompletionDateStruct),
    last_update: dateOf(status.lastUpdatePostDateStruct),
    overall_status: txt(status.overallStatus),
    study_type: rawStudyType,
    study_type_norm: normStudyType(rawStudyType),
    phases: ((design.phases || []).join('; ')).toUpperCase().replace(/ /g, ''),
    conditions,
    interventions,
    lead_sponsor: txt(((p.sponsorCollaboratorsModule || {}).leadSponsor || {}).name),
    countries,
    is_china: isChina ? 1 : 0,
    enrollment: Number.isFinite(design.enrollmentInfo && design.enrollmentInfo.count)
      ? design.enrollmentInfo.count
      : null,
    summary: txt(desc.briefSummary),
    eligibility: txt(elig.eligibilityCriteria),
    exclusion: '',
    category: isBasket ? 'basket' : 'disease-specific',
    scope: classifyScopeEn(hay),
    setting: classifySetting(hay),
    registration_note: '',
    design: '',
    stage: '',
    age_range: txt(elig.minimumAge) || '',
    sex: txt(elig.sex) || '',
    institution_level: '',
    sites: '',
    funding: '',
    ethics_approved: '',
    primary_outcome: ((p.outcomesModule || {}).primaryOutcomes || [])
      .map((o) => txt(o.measure)).filter(Boolean).join('; '),
    recruitment_state: txt(status.overallStatus),
    source_url: `https://clinicaltrials.gov/study/${id}`,
    fetched_at: new Date().toISOString(),
    _hitsDisease: hitsDisease,
    _raw: null,
  };
}

async function collectCt(dryRun) {
  const byId = new Map();
  const rawCounts = {};

  for (const cond of CT_QUERIES) {
    let token = '';
    let pages = 0;
    let raw = 0;
    for (;;) {
      const data = await ctFetchPage(cond, token);
      raw = Number(data.totalCount) || raw;
      const studies = data.studies || [];
      for (const s of studies) {
        const rec = ctFlatten(s);
        if (rec) byId.set(rec.registry_id, rec);
      }
      pages += 1;
      if (dryRun && pages >= 1) break;
      token = txt(data.nextPageToken);
      if (!token || studies.length === 0) break;
      await sleep(120);
    }
    rawCounts[cond] = raw;
    console.log(`  [CT] ${cond}: 原始 ${raw} 条，已翻 ${pages} 页`);
  }
  return { byId, rawCounts };
}

/** ─────────────── 来源二：ChiCTR（经本机 sidecar） ─────────────── */

async function chictrGet(path, params, timeoutMs = 60000) {
  const url = new URL(path, CHICTR_BASE);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, String(v));
  const ctrl = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
  const res = await fetch(url, { signal: ctrl });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

async function chictrHealth() {
  try {
    const d = await chictrGet('/health', {}, 5000);
    return d && d.ok === true;
  } catch {
    return false;
  }
}

/** 中文疾病术语过滤：必须同时有部位词与肿瘤词（挡掉膀胱炎/尿失禁/结石） */
function cnHitsDisease(title) {
  const hasSite = [...CN_BLADDER_TERMS, ...CN_UTUC_TERMS, ...CN_UROTHELIAL_TERMS]
    .some((t) => title.includes(t));
  const hasCancer = CN_CANCER_TERMS.some((t) => title.toLowerCase().includes(t));
  return hasSite && hasCancer;
}

function stripPii(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (isPiiField(k)) {
      strippedPiiKeys.add(k);
      continue;
    }
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/**
 * 写盘前自检：detail 里不允许再出现任何 PII 字段名。
 * 这是 fail-closed：一旦命中就中止，宁可不产出，也不静默带着 PII 落盘。
 */
function assertNoPii(detailRows) {
  const leaks = new Set();
  for (const r of detailRows) {
    for (const k of Object.keys(r.fields || {})) {
      if (isPiiField(k)) leaks.add(k);
    }
  }
  if (leaks.size) {
    throw new Error(`PII 自检失败，以下字段未剥除：${[...leaks].join('、')}`);
  }
}

async function chictrDetail(projectId) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const d = await chictrGet('/detail', { proj: projectId }, 90000);
      if (d && d.ok !== false) return stripPii(d.fields);
      throw new Error(d && d.error ? d.error : 'detail not ok');
    } catch (err) {
      lastErr = err;
      await sleep(1200 * (attempt + 1));
    }
  }
  throw new Error(`详情失败 proj=${projectId}: ${lastErr && lastErr.message}`);
}

function cnFlatten(detail, listRow) {
  const f = detail || {};
  const g = (key) => txt(f[CN_FIELD_MAP[key]]);
  const title = txt(listRow.title) || g('officialTitle');
  const disease = g('disease');
  const hay = `${title} ${disease}`;
  const rawStudyType = g('studyType') || txt(listRow.study_type);
  const enrollRaw = g('enrollment');
  const enrollNum = Number.parseInt(enrollRaw.replace(/[^\d]/g, ''), 10);

  const sites = [g('site'), g('hospital')].filter(Boolean).join('; ');

  return {
    registry: 'ChiCTR',
    registry_id: txt(listRow.registration_number),
    title,
    official_title: g('officialTitle') || title,
    first_posted: normaliseCnDate(g('registeredAt') || listRow.registration_date),
    start_date: extractFirstDate(g('period')),
    primary_completion: extractLastDate(g('period')),
    last_update: normaliseCnDate(g('lastUpdate')),
    overall_status: normCnStatus(g('recruitState')),
    study_type: rawStudyType,
    study_type_norm: normStudyType(rawStudyType),
    phases: '',
    conditions: disease,
    interventions: g('purpose').slice(0, 500),
    lead_sponsor: g('sponsor') || txt(listRow.institution),
    countries: [g('country') || '中国', g('province')].filter(Boolean).join('; '),
    is_china: 1,
    enrollment: Number.isFinite(enrollNum) ? enrollNum : null,
    summary: g('purpose'),
    eligibility: g('inclusion'),
    exclusion: g('exclusion'),
    category: 'disease-specific',
    scope: classifyScopeZh(hay),
    setting: classifySetting(hay),
    registration_note: g('registrationStatus'),
    design: g('design'),
    stage: g('stage'),
    age_range: g('ageRange'),
    sex: g('sex'),
    institution_level: g('institutionLevel'),
    sites,
    funding: g('funding'),
    ethics_approved: g('ethics'),
    primary_outcome: [g('outcomeType'), g('outcome')].filter(Boolean).join(': '),
    recruitment_state: g('recruitState'),
    source_url: txt(listRow.detail_url)
      || `https://www.chictr.org.cn/showproj.html?proj=${txt(listRow.project_id)}`,
    fetched_at: new Date().toISOString(),
    _hitsDisease: true,
    _raw: f,
  };
}

/**
 * ChiCTR 的征募状态是带换行的中英混排（如 "尚未开始\n Not yet\n recruiting"），
 * 直接入库会让状态分布碎成一堆脏值、也没法和 CT.gov 的状态并列展示。
 * 故归一成与 CT.gov 同一套词表；原始串保留在 recruitment_state 字段里（不丢信息）。
 */
function normCnStatus(raw) {
  const s = txt(raw).replace(/\s+/g, ' ').toLowerCase();
  if (!s) return 'UNKNOWN';
  if (/尚未开始|not yet/.test(s)) return 'NOT_YET_RECRUITING';
  if (/正在进行|recruiting/.test(s) && !/not yet/.test(s)) return 'RECRUITING';
  if (/结束|completed/.test(s)) return 'COMPLETED';
  if (/暂停|中止|终止|suspend|terminat|withdraw/.test(s)) return 'SUSPENDED_OR_TERMINATED';
  return 'UNKNOWN';
}

/** "2026-10-15 00:00:00" → "2026-10-15"；"2026/10/15" → "2026-10-15" */
function normaliseCnDate(s) {
  const t = txt(s);
  const m = t.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function allDates(s) {
  const out = [];
  const re = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/g;
  let m;
  while ((m = re.exec(txt(s))) !== null) {
    out.push(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
  }
  return out;
}
const extractFirstDate = (s) => allDates(s)[0] || '';
const extractLastDate = (s) => {
  const a = allDates(s);
  return a.length ? a[a.length - 1] : '';
};

async function collectChictr(dryRun) {
  const byProject = new Map();
  const rawCounts = {};

  for (const term of CN_TERMS) {
    const first = await chictrGet('/search', { title: term, createyear: CHICTR_YEAR, page: 1, pages: 1 });
    const total = Number(first.total) || 0;
    const totalPages = Number(first.total_pages) || 0;
    rawCounts[term] = total;
    console.log(`  [CN] ${term}: 原始 ${total} 条，共 ${totalPages} 页`);

    const push = (rows) => {
      for (const r of rows || []) {
        if (r && r.project_id) byProject.set(String(r.project_id), r);
      }
    };
    push(first.results);
    if (dryRun) continue;

    for (let page = 2; page <= totalPages; page += 1) {
      const d = await chictrGet('/search', { title: term, createyear: CHICTR_YEAR, page, pages: 1 });
      push(d.results);
      await sleep(150);
    }
  }
  return { byProject, rawCounts };
}

/** ─────────────── 过滤与合并 ─────────────── */

function applyFilters(ctById, cnByProject) {
  const kept = [];
  const droppedCt = [];
  const droppedCn = [];

  for (const rec of ctById.values()) {
    if (rec._hitsDisease) {
      const { _hitsDisease, _raw, ...clean } = rec; // eslint-disable-line no-unused-vars
      kept.push(clean);
    } else {
      droppedCt.push(rec);
    }
  }
  for (const rec of cnByProject.values()) {
    if (cnHitsDisease(txt(rec.title))) kept.push(rec);
    else droppedCn.push(rec);
  }

  kept.sort((a, b) => (a.first_posted < b.first_posted ? 1 : a.first_posted > b.first_posted ? -1
    : a.registry_id < b.registry_id ? -1 : 1));
  return { kept, droppedCt, droppedCn };
}

/** ─────────────── 落盘 ─────────────── */

const RECORD_COLUMNS = [
  'registry', 'registry_id', 'title', 'official_title', 'first_posted', 'start_date',
  'primary_completion', 'last_update', 'overall_status', 'study_type', 'study_type_norm',
  'phases', 'conditions', 'interventions', 'lead_sponsor', 'countries', 'is_china',
  'enrollment', 'summary', 'eligibility', 'exclusion', 'category', 'scope', 'setting',
  'registration_note', 'design', 'stage', 'age_range', 'sex', 'institution_level', 'sites',
  'funding', 'ethics_approved', 'primary_outcome', 'recruitment_state', 'source_url',
  'fetched_at',
];

function writeSqlite(file, rows) {
  // 重跑要能覆盖，不能因表已存在而失败
  rmSync(file, { force: true });
  const db = new DatabaseSync(file);
  // enrollment / is_china 单独以 INTEGER 声明（要能按数值排序），故从 TEXT 列里排除，
  // 否则 CREATE TABLE 里会出现重复列名（SQL logic error: duplicate column name）。
  const textCols = RECORD_COLUMNS
    .filter((c) => c !== 'enrollment' && c !== 'is_china')
    .map((c) => `${c} TEXT`)
    .join(', ');
  db.exec(`
    CREATE TABLE trial_records (
      id INTEGER PRIMARY KEY,
      ${textCols},
      enrollment INTEGER,
      is_china INTEGER DEFAULT 0,
      UNIQUE(registry, registry_id)
    );
    CREATE TABLE record_detail (
      registry TEXT NOT NULL, registry_id TEXT NOT NULL, field_json TEXT NOT NULL,
      PRIMARY KEY (registry, registry_id)
    );
    CREATE TABLE source_coverage (
      source TEXT PRIMARY KEY, included INTEGER, record_count INTEGER, coverage_note TEXT
    );
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT);
    CREATE INDEX idx_records_status ON trial_records(overall_status);
    CREATE INDEX idx_records_category ON trial_records(category);
    CREATE INDEX idx_records_scope ON trial_records(scope);
    CREATE INDEX idx_records_setting ON trial_records(setting);
    CREATE INDEX idx_records_studytype ON trial_records(study_type_norm);
    CREATE INDEX idx_records_registry ON trial_records(registry);
    CREATE INDEX idx_records_china ON trial_records(is_china);
    -- 膀胱癌视角：排除 UTUC 档（scope 判据见脚本头部说明 1）
    CREATE VIEW v_bladder_only AS
      SELECT * FROM trial_records WHERE scope IN ('bladder', 'urothelial-unspecified');
    -- 只要干预性研究（与胃癌/结直肠癌包原口径一致）
    CREATE VIEW v_interventional AS
      SELECT * FROM trial_records WHERE study_type_norm = 'interventional';
    -- 膀胱癌 + 干预性 = 患者最关心的那批
    CREATE VIEW v_bladder_interventional AS
      SELECT * FROM trial_records
      WHERE scope IN ('bladder', 'urothelial-unspecified') AND study_type_norm = 'interventional';
    -- 中国中心/中国注册
    CREATE VIEW v_china AS SELECT * FROM trial_records WHERE is_china = 1;
  `);

  const placeholders = RECORD_COLUMNS.map(() => '?').join(',');
  const ins = db.prepare(`INSERT OR REPLACE INTO trial_records (${RECORD_COLUMNS.join(',')})
    VALUES (${placeholders})`);
  const insDetail = db.prepare('INSERT OR REPLACE INTO record_detail VALUES (?,?,?)');

  // DatabaseSync 没有 transaction()（node:sqlite 22.x），显式 BEGIN/COMMIT
  db.exec('BEGIN');
  for (const r of rows) {
    ins.run(...RECORD_COLUMNS.map((c) => (r[c] === null || r[c] === undefined ? null : String(r[c]))));
    if (r._raw && Object.keys(r._raw).length) {
      insDetail.run(r.registry, r.registry_id, JSON.stringify(r._raw));
    }
  }
  db.exec('COMMIT');

  const meta = db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)');
  meta.run('year_filter', `CT.gov: StudyFirstPostDate >= ${YEAR_FROM}；ChiCTR: createyear=${CHICTR_YEAR}`);
  meta.run('queries_ct', CT_QUERIES.join(' | '));
  meta.run('queries_cn', CN_TERMS.join(' | '));
  meta.run('scope_rule',
    'bladder=命中膀胱词；utuc=无膀胱词但有上尿路词（肾盂/输尿管/上尿路，非膀胱癌）；'
    + 'urothelial-unspecified=只有尿路上皮谱系词未指明部位。查询请用 v_bladder_only');
  meta.run('study_type_rule',
    '两个来源都收干预性+观察性，用 study_type_norm 分档；只要干预性查 v_interventional');
  meta.run('pii_policy',
    'ChiCTR 详情写盘前按字段名模式剥除研究者/伦理联系人 PII（联系人|电话|手机|邮箱|邮件|地址|注册人…），'
    + '并执行 assertNoPii 失败即中止；剥除发生在写盘之前');
  meta.run('raw_total_before_filter', String(rows.length));
  db.close();
}

const sha256Of = async (file) => {
  const buf = await import('node:fs').then((fs) => fs.promises.readFile(file));
  return createHash('sha256').update(buf).digest('hex');
};

/** rawCounts 是 { 查询词: 命中数 } 的对象，求和得"过滤前的原始命中量" */
const sumCounts = (obj) =>
  Object.values(obj || {}).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);

function tally(rows, key) {
  const out = {};
  for (const r of rows) {
    const v = r[key] === '' || r[key] === null || r[key] === undefined ? '(空)' : String(r[key]);
    out[v] = (out[v] || 0) + 1;
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const noChictr = process.argv.includes('--no-chictr');
  console.log(`膀胱癌 2026 试验采集 · ${dryRun ? '试跑（不写文件）' : '正式采集'}`);
  console.log(`CT 口径：${CT_ADVANCED}`);

  const { byId: ctById, rawCounts: ctRaw } = await collectCt(dryRun);
  const { kept: keptCt, droppedCt } = applyFilters(ctById, new Map());

  let cnByProject = new Map();
  let cnRaw = {};
  let cnAvailable = false;
  let cnError = '';
  if (!noChictr) {
    cnAvailable = await chictrHealth();
    if (cnAvailable) {
      console.log(`\nChiCTR sidecar 就绪（${CHICTR_BASE}）`);
      const r = await collectChictr(dryRun);
      cnByProject = r.byProject;
      cnRaw = r.rawCounts;
    } else {
      cnError = `sidecar 未运行或不可达（${CHICTR_BASE}/health 失败）`;
      console.log(`\n⚠️  ChiCTR 未采集：${cnError}`);
      console.log('   启动方式：cd /Users/qinxiaoqiang/Downloads/chictr_trials && node dist/cli/setup-cli.js sidecar');
    }
  } else {
    cnError = '命令行指定 --no-chictr';
    console.log('\n（--no-chictr：跳过 ChiCTR）');
  }

  // ChiCTR 逐条取详情（只对通过术语过滤的，省请求）
  const cnKeptRaw = [...cnByProject.values()].filter((r) => cnHitsDisease(txt(r.title)));
  const cnDropped = [...cnByProject.values()].filter((r) => !cnHitsDisease(txt(r.title)));
  console.log(`\n  [CN] 术语过滤保留 ${cnKeptRaw.length} 条，剔除 ${cnDropped.length} 条（非肿瘤或非本部位）`);

  const cnRows = [];
  if (!dryRun && cnKeptRaw.length) {
    console.log(`  [CN] 逐条取详情（${cnKeptRaw.length} 条，含 PII 剥除）…`);
    for (let i = 0; i < cnKeptRaw.length; i += 1) {
      const row = cnKeptRaw[i];
      try {
        const fields = await chictrDetail(row.project_id);
        cnRows.push(cnFlatten(fields, row));
      } catch (err) {
        console.log(`    ! proj=${row.project_id} ${err.message}（降级为列表级字段）`);
        cnRows.push(cnFlatten({}, row));
      }
      if ((i + 1) % 20 === 0) console.log(`      … ${i + 1}/${cnKeptRaw.length}`);
      await sleep(200);
    }
  }

  const kept = [...keptCt, ...cnRows]
    .sort((a, b) => (a.first_posted < b.first_posted ? 1 : a.first_posted > b.first_posted ? -1
      : a.registry_id < b.registry_id ? -1 : 1));

  const byStatus = tally(kept, 'overall_status');
  const byCategory = tally(kept, 'category');
  const byScope = tally(kept, 'scope');
  const bySetting = tally(kept, 'setting');
  const byStudyType = tally(kept, 'study_type_norm');
  const byRegistry = tally(kept, 'registry');
  const china = kept.filter((r) => r.is_china).length;
  const bladderInterventional = kept.filter((r) => r.scope !== 'utuc' && r.study_type_norm === 'interventional').length;

  console.log(`\n去重/过滤后合计 ${kept.length} 条（CT ${keptCt.length} + ChiCTR ${cnRows.length}）`);
  console.log('  来源分布：', byRegistry);
  console.log('  研究类型：', byStudyType);
  console.log('  状态分布：', byStatus);
  console.log('  scope 分布：', byScope, '← utuc 档不是膀胱癌');
  console.log('  setting 分布：', bySetting);
  console.log(`  含中国中心/中国注册：${china} 条`);
  console.log(`  膀胱癌视角 × 干预性（v_bladder_interventional）：${bladderInterventional} 条`);

  if (droppedCt.length) {
    console.log('\n[CT] 被术语过滤剔除的样本（前 8 条，核对是否误杀）：');
    for (const r of droppedCt.slice(0, 8)) {
      console.log(`  - ${r.registry_id} | ${(r.title || '').slice(0, 66)} | cond: ${(r.conditions || '').slice(0, 60)}`);
    }
  }
  if (cnDropped.length) {
    console.log('\n[CN] 被术语过滤剔除的样本（前 8 条，核对是否误杀）：');
    for (const r of cnDropped.slice(0, 8)) {
      console.log(`  - ${r.registration_number} | ${(r.title || '').slice(0, 66)}`);
    }
  }

  if (dryRun) {
    console.log('\n（试跑结束，未写文件）');
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const jsonlPath = join(OUT_DIR, 'trials-2026.jsonl');
  const dbPath = join(OUT_DIR, 'bladder_cancer_trials_2026.sqlite');
  const manifestPath = join(OUT_DIR, 'manifest.json');

  // 写盘前最后一道闸：任一 ChiCTR detail 里还有 PII 字段名就中止（fail-closed）
  assertNoPii(cnRows.map((r) => ({ fields: r._raw })));
  console.log(`\nPII 自检通过。实际剥除字段 ${strippedPiiKeys.size} 个：${[...strippedPiiKeys].join('、') || '（无）'}`);

  // 落盘前剥掉内部字段（_raw 进 record_detail，不进 jsonl）
  await writeFile(
    jsonlPath,
    kept.map(({ _raw, ...r }) => JSON.stringify(r)).join('\n') + '\n', // eslint-disable-line no-unused-vars
    'utf8',
  );
  writeSqlite(dbPath, kept);

  const dbStat = await stat(dbPath);
  const manifest = {
    disease: 'bladder-cancer',
    year: 2026,
    generated_at: new Date().toISOString(),
    total_records: kept.length,
    raw_studies: sumCounts(ctRaw) + sumCounts(cnRaw),
    by_registry: byRegistry,
    by_study_type: byStudyType,
    by_status: byStatus,
    by_category: byCategory,
    by_scope: byScope,
    by_setting: bySetting,
    china_sites: china,
    bladder_interventional: bladderInterventional,
    sources: {
      ClinicalTrials: {
        included: true,
        count: keptCt.length,
        method: `ClinicalTrials.gov API v2, query.cond 三组并集（${CT_QUERIES.join(' / ')}）, ${CT_ADVANCED}, 本地疾病术语过滤`,
        raw_by_query: ctRaw,
      },
      ChiCTR: {
        included: cnAvailable && !noChictr,
        count: cnRows.length,
        method: `ChiCTR 本机 sidecar 只读 HTTP（/search?title=&createyear=${CHICTR_YEAR} → /detail），检索词 ${CN_TERMS.join(' / ')}，中文部位+肿瘤术语过滤`,
        raw_by_query: cnRaw,
        sidecar: CHICTR_BASE,
        note: cnError || '详情页 PII 字段已在写盘前剥除',
      },
      ChinaDrugTrials: {
        included: false,
        count: 0,
        note: '本轮未采集（需人工 Cookie 的受控通道），覆盖未知',
      },
    },
    views: {
      v_bladder_only: '排除 scope=utuc（上尿路尿路上皮癌，非膀胱癌）',
      v_interventional: '只要研究类型=干预性',
      v_bladder_interventional: '膀胱癌视角 × 干预性，患者最关心的那批',
      v_china: '含中国中心或中国注册',
    },
    pii_stripped_fields: [...strippedPiiKeys],
    files: {
      'trials-2026.jsonl': {
        lines: kept.length,
        bytes: (await stat(jsonlPath)).size,
        sha256: await sha256Of(jsonlPath),
      },
      'bladder_cancer_trials_2026.sqlite': {
        bytes: dbStat.size,
        sha256: await sha256Of(dbPath),
      },
      'manifest.json': { note: '本文件自身不入 sha256（写入后才定稿）' },
    },
    limitations: [
      '年份口径不一致：CT.gov 按"首次公示在 2026 年"，ChiCTR 按 createyear=2026（注册年）；两者不是同一口径',
      'ChiCTR 存在"补注册"（先开展后补登记），其研究实施时间常早于注册时间，registration_note 字段标注',
      '本包同时收干预性与观察性研究；只要干预性请查 v_interventional 视图',
      'scope=utuc 的记录是上尿路尿路上皮癌，不属于膀胱癌，查询请用 v_bladder_only 视图',
      'scope=urothelial-unspecified 多为转移性尿路上皮癌，通常含膀胱来源但未逐条核对',
      'setting 是按标题/病名文本推断的线索字段，不代表入组资格；纳排标准须回原登记页核对',
      'ChiCTR 详情页的研究者/伦理联系人 PII 已在写盘前剥除，故本包不含联系人信息',
      'ClinicalTrials.gov 覆盖仅限所记录查询词、日期与术语过滤；ChiCTR 仅限所记录检索词',
      'ChinaDrugTrials（CDE）未采集，未命中不能解释为不存在',
      '登记状态不是入组资格；不构成方案推荐',
    ],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\n已写出：\n  ${jsonlPath}\n  ${dbPath}\n  ${manifestPath}`);
  console.log(`sqlite sha256 = ${manifest.files['bladder_cancer_trials_2026.sqlite'].sha256}`);
  console.log('（采集脚本位置：' + join(PROJECT_ROOT, 'scripts', 'fetch-bladder-trials-2026.mjs') + '）');
}

main().catch((err) => {
  console.error('采集失败：', err);
  process.exit(1);
});
