#!/usr/bin/env node
/**
 * check-wording.mjs — 文案红线检查（SPEC §文案红线 / AC-24 / ACC-32）
 *
 * 为什么要有这个脚本：
 *   SPEC 写了「全站禁止『终身』」这类红线，但红线一旦只写在文档里，
 *   就会像 docs/CORE-MODULES.md 那样——下游文档把已纠正的无来源表述又写回去。
 *   红线必须可执行，否则它是建议，不是约束。
 *
 * 两个扫描面，口径不同（这是刻意的）：
 *   A. 界面面（prototypes/）——零容忍。患者看得见的字不能有任何一条红线。
 *   B. 文档面（docs/）——按文件豁免。有些文件的工作就是"陈述这条规则"
 *      （例如 DIFF-MATRIX 写「不得用于界面文案」），不能把它们判违规。
 *      豁免是显式白名单，不是正则绕过；新增豁免必须写理由。
 *
 * 用法：
 *   node scripts/check-wording.mjs            # 全量，违规即退出码 1
 *   node scripts/check-wording.mjs --json     # 机器可读
 *   node scripts/check-wording.mjs --ui-only  # 只查界面面
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();

// ---------------------------------------------------------------- 红线表
// 每条：pattern（正则源）+ why（为什么禁）。
// 注意顺序：长词在前，避免「终身随访」被「终身」先吃掉后重复计数。
const RULES = [
  { pattern: '终身随访', why: '原文只写「长期密切随访」，从未出现「终身」（docs/DIFF-MATRIX.md:80）' },
  { pattern: '终身', why: '同上；AC-24 要求全站 grep 不到' },
  { pattern: '一辈子', why: '「终身」的口语等价说法，同样越界' },
  { pattern: '建议治疗', why: '工作台不做诊断与处置（组织四条不可让步）' },
  { pattern: '可以停药', why: '同上' },
  { pattern: '无需就医', why: '同上；急症页只给判据给联系入口' },
  { pattern: '应该用', why: '不得对方案表达倾向（SPEC AC-30）' },
  { pattern: '不应该用', why: '同上' },
  { pattern: '预后良好', why: '不做预后判断' },
  { pattern: '治愈', why: '不做预后判断' },
  { pattern: '可能复发', why: '不做复发预测' },
  { pattern: '复发率\\s*\\d', why: '带具体百分比的复发率无来源，不得进文案' },
  { pattern: '2[–\\-～]5%', why: '「2–5% 会得 UTUC」无来源，已纠正（docs/DIFF-MATRIX.md:81）' },
  { pattern: '50[–\\-～]70%', why: '「复发率 50–70%」无来源，已纠正' },
];

// 文档面豁免：这些文件的工作是"陈述规则本身"或"记录研究原文"。
// 每条豁免都要能说清理由，不许写「先放着」。
const DOC_EXEMPT = {
  'docs/DIFF-MATRIX.md': '本文件就是「已纠正清单」，必须能写出被禁的原文才能说明禁的是什么',
  'docs/SCENARIOS.md': 'S04/S11 的验收锚点写「不得写终身」「不是 2–5%」，是规则陈述',
  'docs/SPEC.md': 'AC-24 与文案红线清单本身',
  'docs/SCENARIO-PATHS.md': '路径红线写「全站禁终身」「不是 2–5%」',
  'docs/USER-RESEARCH.md': 'A5 记录「早期提案误写，已纠正」的纠错过程',
  'docs/HVT-REVIEW.md': '本审核报告必须引用被禁原文作为证据',
  'docs/DESIGN-SESSION.md': '决策留痕：DESIGN-26 必须能写出"被改掉的是哪一处"，否则无从追溯',
  'docs/ACCEPTANCE.md': '验收合同：AC-24/AC-30/AC-48 的判据就是"搜不到某个词"，不写出该词就无法验收',
  'docs/PROTOTYPE-REVIEW.md': '原型审查记录，需引用反馈原话与被改文案',
  'docs/research/中文权威共识-事实提取.md': '研究原文摘录：记录「原文没有出现终身二字」这一事实',
  'prompts/NEW-CANCER-WORKBENCH.md': '脚手架提示词，规则来源',
  'AGENTS.md': '项目宪法，规则来源',
};

// 「规则陈述」判据：同一行里，被禁词出现在一个否定/约束语境中。
// 例：「这里只显示门槛与出处，不判断你应该用或不应该用哪个方案」——
// 这句话的作用恰恰是声明不做这件事，判它违规是假阳性。
//
// 为什么用通用判据而不是逐行白名单：白名单要人一直维护，一旦漏加，
// 下一个实现者会以为"那就加进白名单吧"，把真违规也豁免掉。
// 通用判据只挡"正在说不要这么做"的句子，挡不住"正在这么做"的句子。
const NEGATION_MARKERS = [
  '不得', '禁止', '禁用', '全站禁', '不写', '不判断', '不做', '不表达', '不出现', '不推断', '不推荐',
  '没出现', '没有出现', '未出现', '已纠正', '无来源', '待核验', '待补',
  '不算', '不是', '不构成', '不用', '无需', '不予', '不评价',
  // 引用标记：研究文件里"照抄原文"是本职，不是违规。
  '原文表述', '原文写', '原文用语', '原文：', '照录', '原文摘录',
];

// 界面面零容忍，但仍需豁免"文案自检"这个功能自己的红线词表——
// data.js 的 BANNED 数组就是这张表，它必须包含这些词才能检出违规。
const UI_LINE_EXEMPT = [
  { file: 'prototypes/v0.1/data.js', match: /BANNED|'终身'|"终身"|建议治疗|可能复发|可以停药|无需就医|应该用|不应该用|预后良好|治愈/, why: '文案自检功能的红线词表本身' },
  { file: 'prototypes/v0.1/app.js', match: /BANNED|不写「终身」|不得写/, why: '自检逻辑与"本工作台不写终身"的说明文案' },
];

/** 该行是否在"陈述规则"而不是"违反规则" */
function isRuleStatement(line) {
  return NEGATION_MARKERS.some((m) => line.includes(m));
}

// ---------------------------------------------------------------- 扫描
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '_archived' || e === '_shots' || e.startsWith('.')) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (['.html', '.js', '.css', '.json', '.md', '.csv'].includes(extname(p))) out.push(p);
  }
  return out;
}

function scan(files, { uiFacing }) {
  const hits = [];
  for (const abs of files) {
    const rel = relative(ROOT, abs);
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        const re = new RegExp(rule.pattern);
        if (!re.test(line)) continue;
        // 豁免判定 —— 顺序：先通用判据（规则陈述），再文件/行白名单
        if (isRuleStatement(line)) continue;
        if (uiFacing) {
          const ex = UI_LINE_EXEMPT.find((x) => rel === x.file && x.match.test(line));
          if (ex) continue;
        } else if (DOC_EXEMPT[rel]) continue;
        hits.push({ file: rel, line: i + 1, term: rule.pattern, why: rule.why, text: line.trim().slice(0, 110) });
      }
    });
  }
  return hits;
}

// ---------------------------------------------------------------- 主流程
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const uiOnly = args.includes('--ui-only');

const uiFiles = walk(join(ROOT, 'prototypes'));
const docFiles = uiOnly ? [] : walk(join(ROOT, 'docs'));

const uiHits = scan(uiFiles, { uiFacing: true });
const docHits = scan(docFiles, { uiFacing: false });

const result = {
  checkedAt: new Date().toISOString(),
  uiFiles: uiFiles.length,
  docFiles: docFiles.length,
  uiViolations: uiHits.length,
  docViolations: docHits.length,
  uiHits,
  docHits,
  exemptedDocs: Object.keys(DOC_EXEMPT),
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('== 文案红线检查 ==');
  console.log(`界面面：${uiFiles.length} 份文件 → 违规 ${uiHits.length} 条${uiHits.length === 0 ? ' ✅' : ' ❌'}`);
  for (const h of uiHits) console.log(`  ❌ ${h.file}:${h.line}「${h.term}」 — ${h.text}`);
  if (!uiOnly) {
    console.log(`\n文档面：${docFiles.length} 份文件（豁免 ${Object.keys(DOC_EXEMPT).length} 份）→ 违规 ${docHits.length} 条${docHits.length === 0 ? ' ✅' : ' ⚠️'}`);
    for (const h of docHits) console.log(`  ⚠️  ${h.file}:${h.line}「${h.term}」 — ${h.text}`);
    if (docHits.length) {
      console.log('\n  文档面违规需人工判断：');
      console.log('   · 若该文件的工作是"陈述这条规则"，把文件加进 DOC_EXEMPT 并写明理由');
      console.log('   · 若是下游文档把已纠正的表述写回去了（HVT-REVIEW §4 G4 就是这种），改文档，不要豁免');
    }
  }
  console.log(`\n结论：界面面${uiHits.length === 0 ? '通过' : '不通过'}${uiOnly ? '' : `；文档面${docHits.length === 0 ? '通过' : '有待处理项'}`}`);
}

// 界面面违规即失败；文档面单独汇报（不阻断，但会在报告里出现）
process.exit(uiHits.length > 0 ? 1 : 0);
