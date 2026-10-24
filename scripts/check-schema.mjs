#!/usr/bin/env node
/**
 * schema/*.sql 约束探针 + 冻结合同校验
 * 用法：node scripts/check-schema.mjs
 *
 * G3 签认后本脚本有两个职责：
 *   A. 约束探针 —— 一条一条插非法值，看 CHECK 是不是真在拦人。
 *   B. 冻结合同 —— 逐个迁移文件比对 sha256，并对未登记在 freeze-contract.md
 *      里的 *.sql 直接失败。理由是：迁移一旦被改过，就没人能判断线上库是哪一版。
 *      **失败即停，不许警告放行。**
 *
 * 为什么要有这个脚本：
 *   草案 DDL 里那些 CHECK 不是装饰 —— 它们就是 docs/SPEC.md 里「不许换算」
 *   「四态不可混」「缺测留 NULL」这些医学纪律的**机器可执行版本**。
 *   光看 SQL 看不出约束真的生效，所以一条一条插非法值看它是不是真被拦。
 *
 * 纪律：只用内存库（:memory:），不落盘、不依赖 os.tmpdir()、不用固定路径。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const SCHEMA_DIR = join(ROOT, 'schema');
const CONTRACT = join(SCHEMA_DIR, 'freeze-contract.md');

// ---- A. 约束探针：用第一个迁移（0001_initial.sql）建库
const MIGRATIONS = readdirSync(SCHEMA_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
if (MIGRATIONS.length === 0) { console.error('❌ schema/ 下没有迁移文件'); process.exit(1); }
const DDL_PATH = join(SCHEMA_DIR, MIGRATIONS[0]);
const DDL = readFileSync(DDL_PATH, 'utf8');

// ---- B. 冻结合同校验（先跑，最便宜且最该 fail-closed）
const contractText = readFileSync(CONTRACT, 'utf8');
const frozen = new Map();
for (const line of contractText.split('\n')) {
  const m = line.match(/^\|\s*`(\d{4}_[^`]+\.sql)`\s*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|\s*`([0-9a-f]{64})`\s*\|/);
  if (m) frozen.set(m[1], m[2]);
}
const contractFails = [];
if (frozen.size === 0) contractFails.push('freeze-contract.md 里没有解析到任何已冻结迁移');
for (const [file, want] of frozen) {
  let got;
  try { got = createHash('sha256').update(readFileSync(join(SCHEMA_DIR, file))).digest('hex'); }
  catch { contractFails.push(`${file} 在合同里登记了但文件不存在`); continue; }
  if (got !== want) contractFails.push(`${file} 内容已被改动（合同 ${want.slice(0, 16)}… / 实际 ${got.slice(0, 16)}…）`);
}
for (const file of MIGRATIONS) {
  if (!frozen.has(file)) contractFails.push(`${file} 未登记在 freeze-contract.md（新增迁移必须同时登记 sha256）`);
}
if (contractFails.length) {
  console.log('== 冻结合同校验 ==');
  contractFails.forEach((f) => console.log(`  ❌ ${f}`));
  console.log('\n失败即停：冻结后的迁移只增不改。要改 schema 请新增 0002_*.sql。');
  process.exit(1);
}
console.log(`== 冻结合同校验 ==  ${frozen.size} 个迁移 sha256 全部匹配 ✅`);

/* 每条探针：往内存库灌 DDL + 前置数据 + 这条 SQL，看它是通过还是被拦。
   期望 error 的，说明约束真的在拦人；期望 ok 的，说明合法值没被误伤。 */
const SEED = `
INSERT INTO subjects(id,display_name,relation,birth_year,is_self,created_at,updated_at)
  VALUES('s1','张先生','本人',1958,1,'2026-10-01','2026-10-01');
INSERT INTO pathology_reports(id,subject_id,reported_on,muscle_present,status,created_at)
  VALUES('pr1','s1','2026-09-20','无','confirmed','2026-10-01');
INSERT INTO instillation_courses(id,subject_id,drug_kind,drug_name,started_on,created_at)
  VALUES('ic1','s1','BCG','卡介苗','2026-10-02','2026-10-01');
INSERT INTO instillation_events(id,course_id,phase,planned_on,status,created_at)
  VALUES('ie1','ic1','诱导','2026-10-30','planned','2026-10-01');
INSERT INTO diversion_facts(id,subject_id,kind,performed_on,created_at)
  VALUES('dv1','s1','ileal_conduit','2026-08-01','2026-10-01');
INSERT INTO metric_definitions(code,name,cat,unit,dec,value_kind,created_at)
  VALUES('egfr','eGFR','肾功能','mL/min/1.73m²',0,'num','2026-10-01');
INSERT INTO source_refs(id,subject_id,kind,label,version,created_at)
  VALUES('sr1','s1','consensus','2024 版保膀胱共识','2024','2026-10-01');
`;

const probes = [
  // —— 维度 2：膀胱镜复查「未见肌层」是分期不完整，三态必须可区分 ——
  { name: '病理肌肉层三态「无」可写', expect: 'ok',
    sql: `INSERT INTO pathology_reports(id,subject_id,muscle_present,status,created_at)
          VALUES('pr2','s1','无','candidate','2026-10-01')` },
  { name: '病理肌肉层三态「未提及」可写', expect: 'ok',
    sql: `INSERT INTO pathology_reports(id,subject_id,muscle_present,status,created_at)
          VALUES('pr3','s1','未提及','candidate','2026-10-01')` },
  { name: '病理肌肉层不许写「未见」等自造值', expect: 'error',
    sql: `INSERT INTO pathology_reports(id,subject_id,muscle_present,status,created_at)
          VALUES('pr4','s1','未见','candidate','2026-10-01')` },
  { name: '病理肌肉层不许写英文 no', expect: 'error',
    sql: `INSERT INTO pathology_reports(id,subject_id,muscle_present,status,created_at)
          VALUES('pr5','s1','no','candidate','2026-10-01')` },

  // —— 维度 5：尿细胞学四态，不是布尔 ——
  { name: '尿细胞学「非典型」可写', expect: 'ok',
    sql: `INSERT INTO urine_cytology(id,subject_id,collected_on,result_state,specimen_kind,created_at)
          VALUES('u1','s1','2026-09-18','非典型','bladder_wash','2026-10-01')` },
  { name: '尿细胞学不许写「不确定」', expect: 'error',
    sql: `INSERT INTO urine_cytology(id,subject_id,collected_on,result_state,created_at)
          VALUES('u2','s1','2026-09-18','不确定','2026-10-01')` },
  { name: '尿细胞学不许用布尔阳性/1', expect: 'error',
    sql: `INSERT INTO urine_cytology(id,subject_id,collected_on,result_state,created_at)
          VALUES('u3','s1','2026-09-18','1','2026-10-01')` },

  // —— 维度 3：灌注三段是「即刻/诱导/维持」，不是等距序列 ——
  { name: '灌注 phase「即刻」可写', expect: 'ok',
    sql: `INSERT INTO instillation_events(id,course_id,phase,status,created_at)
          VALUES('ie2','ic1','即刻','done','2026-10-01')` },
  { name: '灌注 phase 不许写「第 3 次」', expect: 'error',
    sql: `INSERT INTO instillation_events(id,course_id,phase,status,created_at)
          VALUES('ie3','ic1','第3次','done','2026-10-01')` },
  { name: '灌注取消必须能记原因（取消状态合法）', expect: 'ok',
    sql: `INSERT INTO instillation_events(id,course_id,phase,status,cancel_reason,created_at)
          VALUES('ie4','ic1','诱导','cancelled','因肉眼血尿取消','2026-10-23')` },
  /* 反向探针：只验「带原因的取消能写」是恒真的 —— 它根本没碰约束。
     必须再验「不带原因写不进去」，否则这条 CHECK 等于没加。 */
  { name: '取消但不写原因必须被拒（反向探针）', expect: 'error',
    sql: `INSERT INTO instillation_events(id,course_id,phase,status,created_at)
          VALUES('ie5','ic1','诱导','cancelled','2026-10-23')` },
  { name: '取消原因全是空白必须被拒（反向探针）', expect: 'error',
    sql: `INSERT INTO instillation_events(id,course_id,phase,status,cancel_reason,created_at)
          VALUES('ie6','ic1','诱导','cancelled','   ','2026-10-23')` },
  { name: '非取消状态不必填原因（不能误伤正常记录）', expect: 'ok',
    sql: `INSERT INTO instillation_events(id,course_id,phase,status,created_at)
          VALUES('ie7','ic1','诱导','done','2026-10-02')` },

  // —— 私密 fail-closed：默认必须是私密，而且只能 0/1 ——
  { name: '造口日记默认私密（不写 is_private 时值为 1）', expect: 'value', want: '1',
    sql: `INSERT INTO stoma_logs(id,subject_id,batch_date,created_at)
          VALUES('sl1','s1','2026-10-20','2026-10-20');
          SELECT is_private FROM stoma_logs WHERE id='sl1'` },
  { name: '复查感受默认私密', expect: 'value', want: '1',
    sql: `INSERT INTO cystoscopy_experiences(id,subject_id,recorded_at)
          VALUES('cx1','s1','2026-10-22');
          SELECT is_private FROM cystoscopy_experiences WHERE id='cx1'` },
  { name: '症状自评默认私密', expect: 'value', want: '1',
    sql: `INSERT INTO symptom_entries(id,subject_id,d,name,created_at)
          VALUES('sy1','s1','2026-10-22','乏力','2026-10-22');
          SELECT is_private FROM symptom_entries WHERE id='sy1'` },
  { name: '控尿记录默认私密', expect: 'value', want: '1',
    sql: `INSERT INTO continence_logs(id,subject_id,d,created_at)
          VALUES('cl1','s1','2026-10-22','2026-10-22');
          SELECT is_private FROM continence_logs WHERE id='cl1'` },
  { name: '私密标记不许写 2（只能 0/1）', expect: 'error',
    sql: `INSERT INTO stoma_logs(id,subject_id,batch_date,is_private,created_at)
          VALUES('sl2','s1','2026-10-21',2,'2026-10-21')` },
  { name: 'stoma_logs 不再有自由文本 actor 列（谁记的只有 records.actor_id 一层）', expect: 'value', want: '0',
    sql: `SELECT count(*) FROM pragma_table_info('stoma_logs') WHERE name='actor'` },

  // —— 维度 8：三种改道三选一，不许合并成一个值 ——
  { name: '改道「原位新膀胱」可写', expect: 'ok',
    sql: `INSERT INTO diversion_facts(id,subject_id,kind,created_at)
          VALUES('dv2','s1','orthotopic_neobladder','2026-10-01')` },
  { name: '改道不许写笼统的「尿流改道」', expect: 'error',
    sql: `INSERT INTO diversion_facts(id,subject_id,kind,created_at)
          VALUES('dv3','s1','尿流改道','2026-10-01')` },

  // —— 指标：缺测留 NULL，绝不写 0 ——
  { name: '观察记录三项全空必须被拒（缺测≠0）', expect: 'error',
    sql: `INSERT INTO observations(id,subject_id,metric_code,observed_on,status,created_at)
          VALUES('o1','s1','egfr','2026-10-22','confirmed','2026-10-01')` },
  { name: '观察记录「未检测」是合法缺测状态', expect: 'ok',
    sql: `INSERT INTO observations(id,subject_id,metric_code,observed_on,status,absence_state,created_at)
          VALUES('o2','s1','egfr','2026-10-22','confirmed','not_tested','2026-10-01')` },
  { name: '观察记录不许自造 absence_state', expect: 'error',
    sql: `INSERT INTO observations(id,subject_id,metric_code,observed_on,status,absence_state,created_at)
          VALUES('o3','s1','egfr','2026-10-22','confirmed','没做','2026-10-01')` },

  // —— 私密默认 fail-closed ——
  { name: '私密记录默认 is_private=1（fail-closed）', expect: 'value',
    sql: `INSERT INTO viewpoints(id,subject_id,topic,text,recorded_at)
          VALUES('v1','s1','性功能与亲密','（未写）','2026-10-22');
          SELECT is_private FROM viewpoints WHERE id='v1'`, want: '1' },

  // —— 试验：scope 是派生分类，值域受控 ——
  { name: '试验 scope「utuc」可写（不属膀胱癌但保留打标）', expect: 'ok',
    sql: `INSERT INTO trials(id,source,reg_no,scope,study_type) VALUES('t1','ctgov','NCT1','utuc','interventional')` },
  { name: '试验 scope 不许写自由文本', expect: 'error',
    sql: `INSERT INTO trials(id,source,reg_no,scope,study_type) VALUES('t2','ctgov','NCT2','可能是膀胱','interventional')` },

  // —— S17：BCG「无应答」是医生给的判断，不是工作台算的 ——
  { name: 'BCG「初治」可不带判定日与医生原话', expect: 'ok',
    sql: `INSERT INTO bcg_responses(id,subject_id,course_id,status,recorded_at)
          VALUES('br1','s1','ic1','初治','2026-10-02')` },
  { name: 'BCG「无应答」缺判定日与医生原话必须被拒', expect: 'error',
    sql: `INSERT INTO bcg_responses(id,subject_id,course_id,status,recorded_at)
          VALUES('br2','s1','ic1','无应答','2026-10-24')` },
  { name: 'BCG「无应答」带判定日与医生原话原文可写', expect: 'ok',
    sql: `INSERT INTO bcg_responses(id,subject_id,course_id,status,decided_on,decided_by_raw,doctor_words_raw,recorded_at)
          VALUES('br3','s1','ic1','无应答','2026-10-24','主诊医生','这次属于 BCG 无应答，考虑下一步','2026-10-24')` },
  { name: 'BCG 应答状态不许自造值（不得写「可能失败」）', expect: 'error',
    sql: `INSERT INTO bcg_responses(id,subject_id,status,decided_on,doctor_words_raw,recorded_at)
          VALUES('br4','s1','可能失败','2026-10-24','x','2026-10-24')` },

  // —— S17：极高危四项与共识原文一一对应，不许增补删减 ——
  { name: '极高危标志「变异组织类型」可写', expect: 'ok',
    sql: `INSERT INTO high_risk_markers(id,subject_id,kind,source_ref_id,noted_on,created_at)
          VALUES('hr1','s1','变异组织类型','sr1','2026-10-24','2026-10-24')` },
  { name: '极高危标志「BCG无应答」可写', expect: 'ok',
    sql: `INSERT INTO high_risk_markers(id,subject_id,kind,source_ref_id,created_at)
          VALUES('hr2','s1','BCG无应答','sr1','2026-10-24')` },
  { name: '极高危标志不许自造第五项', expect: 'error',
    sql: `INSERT INTO high_risk_markers(id,subject_id,kind,created_at)
          VALUES('hr3','s1','年龄大于七十','2026-10-24')` },

  // —— S18：组织学变异型只做原文保留 ——
  { name: '病理变异型按原文照录可写', expect: 'ok',
    sql: `INSERT INTO pathology_findings(id,report_id,finding_key,value_raw,verified)
          VALUES('pf1','pr1','组织学变异类型','伴微乳头分化',0)` },
  { name: '变异型是否主要类型三态「未提及」可写', expect: 'ok',
    sql: `INSERT INTO pathology_findings(id,report_id,finding_key,value_raw,variant_is_predominant)
          VALUES('pf2','pr1','变异型是否主要类型','报告未提及','未提及')` },
  { name: '变异型是否主要类型不许写自造值', expect: 'error',
    sql: `INSERT INTO pathology_findings(id,report_id,finding_key,value_raw,variant_is_predominant)
          VALUES('pf3','pr1','变异型是否主要类型','大部分是','mostly')` },
];

let pass = 0;
const fails = [];
for (const p of probes) {
  const script = DDL + '\nPRAGMA foreign_keys=ON;\n' + SEED + '\n' + p.sql + ';\n';
  let out = '', err = '';
  try {
    out = execFileSync('sqlite3', [':memory:'], { input: script, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    err = (e.stderr || e.message || '').toString().trim();
  }
  let ok;
  if (p.expect === 'ok') ok = !err;
  else if (p.expect === 'error') ok = !!err && /CHECK constraint failed|NOT NULL constraint failed|FOREIGN KEY/.test(err);
  else ok = !err && out === p.want;
  if (ok) { pass += 1; console.log(`✅ ${p.name}`); }
  else {
    fails.push(p.name);
    console.log(`❌ ${p.name}\n     期望 ${p.expect}${p.want ? `=${p.want}` : ''}，实际 ${err ? 'error: ' + err.split('\n')[0] : 'ok, out=' + JSON.stringify(out)}`);
  }
}

/* 结构规模 —— 写进 docs/SCHEMA.md，所以顺带回读一次 */
const stats = execFileSync('sqlite3', [':memory:'],
  { input: DDL + "\nSELECT (SELECT count(*) FROM sqlite_master WHERE type='table'), (SELECT count(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%');\n", encoding: 'utf8' })
  .trim().split('|');

console.log(`\n${'='.repeat(64)}`);
console.log(`约束探针：通过 ${pass} / ${probes.length}`);
console.log(`结构规模：${stats[0]} 张表 · ${stats[1]} 个索引`);
console.log(`${'='.repeat(64)}`);
process.exit(fails.length === 0 ? 0 : 1);
