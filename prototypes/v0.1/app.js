/* ============================================================
   小泉宝 UroPal · 原型应用 v0.1
   路由 / 12 个一级页 / 分野闸门 / 一图秀 / 3D 卡 / Agent 面板 / 设置
   ⚠️ 原型：数据为演示用；不含真实患者信息；不构成诊断或治疗建议。
   ============================================================ */
'use strict';

const APP_VERSION = '0.1.3';

/* ---------------- 工具 ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toast(msg) {
  const el = $('#wbToast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

/** 用带来源标注的字段 */
/* 只有真的在标来源时才加「来源：」前缀。原先前缀写在 .src 上，
   结果「总记录」「这是计数，不是评价」这类说明也被冠上「来源：」。 */
const src = (t) => `<span class="src src-line">${esc(t)}</span>`;
const verify = (t) => `<span class="verify-tag">${esc(t)}</span>`;
const chipCat = (v) => `<span class="chip chip-cat" data-state="${esc(v)}">${esc(v)}</span>`;

/* 渐进披露：低频说明默认折叠。
   用原生 <details>/<summary>，而不是自己搭 div+aria ——
   自造的折叠十有八九漏掉 aria-expanded 和键盘操作，
   原生元素这两样是白送的。 */
const collapsible = (summary, inner) => `
  <details class="fold">
    <summary>${esc(summary)}</summary>
    <div class="fold-body">${inner}</div>
  </details>`;
const qlist = (items) => `<ul class="qlist">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

/* 登记库给的是英文枚举，原样端给患者等于没翻译。
   中文标签在前，原始值留在 title 里，需要追溯时仍拿得到。 */
const TRIAL_STATUS_ZH = {
  RECRUITING: '招募中', NOT_YET_RECRUITING: '尚未招募', ACTIVE_NOT_RECRUITING: '进行中 · 不招募',
  ENROLLING_BY_INVITATION: '邀请入组', COMPLETED: '已完成', WITHDRAWN: '已撤销',
  TERMINATED: '已终止', SUSPENDED: '已暂停', UNKNOWN: '未标注',
};
const TRIAL_SETTING_ZH = {
  'nmibc-or-intravesical': '非肌层浸润 · 膀胱灌注',
  'mibc-or-perioperative': '肌层浸润 · 围术期',
  'advanced-or-metastatic': '晚期 · 转移',
  unspecified: '未标注',
};
const zhTrial = (map, raw) => {
  const zh = map[raw];
  return `<span title="原始值：${esc(raw)}">${esc(zh || raw)}</span>`;
};

/* ---------------- 设置持久化 ---------------- */
const LS_KEY = 'uropal.prototype.v0.1';
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    Object.assign(STATE, {
      line: s.line ?? null,
      lineHistory: Array.isArray(s.lineHistory) ? s.lineHistory : [],
      textsize: s.textsize || 'normal',
      motion: s.motion || 'auto',
      agentWidth: typeof s.agentWidth === 'number' ? s.agentWidth : 35,
      agentOpen: !!s.agentOpen,
      draftScope: s.draftScope || 'visit',
    });
  } catch { /* 坏数据不覆盖，用默认 */ }
}
function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      line: STATE.line, lineHistory: STATE.lineHistory, textsize: STATE.textsize,
      motion: STATE.motion, agentWidth: STATE.agentWidth, agentOpen: STATE.agentOpen,
      draftScope: STATE.draftScope,
    }));
  } catch { /* 忽略 */ }
}

/* 面板宽度 clamp（唯一来源；真实项目里与 lib/layout.js 同源） */
const clampAgentWidth = (p) => Math.min(45, Math.max(25, Math.round(p)));

/* 让「横幅 + 顶栏」的实测高度成为唯一来源：sticky 偏移与窄屏抽屉都读它 */
function syncChromeHeight() {
  const bar = document.querySelector('.wb-demo-bar');
  const top = document.querySelector('.wb-topbar');
  const d = bar ? bar.offsetHeight : 0;
  const t = top ? top.offsetHeight : 0;
  const root = document.documentElement.style;
  root.setProperty('--demo-h', `${d}px`);
  root.setProperty('--chrome-h', `${d + t}px`);
}

function applyPrefs() {
  document.documentElement.dataset.textsize = STATE.textsize;
  document.documentElement.dataset.motion = STATE.motion === 'reduce' ? 'reduce' : 'auto';
  document.documentElement.style.setProperty('--agent-w', `${STATE.agentWidth}%`);
  $('#versionChip').textContent = `v${APP_VERSION}`;
  $('#footVersion').textContent = APP_VERSION;
  syncChromeHeight();
}

/* ---------------- 左侧导航 ---------------- */
/* 导航分组：与 SPEC §功能范围一致（12 个一级页 + 设置） */
const NAV_GROUPS = [
  { label: '', ids: ['dashboard'] },
  { label: '我的病情', ids: ['records', 'staging', 'surgery', 'instillation', 'diversion', 'treatment', 'followup', 'metrics', 'chart'] },
  { label: '安全与生活', ids: ['urgent', 'life', 'visit'] },
  { label: '其他', ids: ['trials', 'settings'] },
];

/* 演示档案卡：切换它等于重新选择分野（同一个 setLine，只有一份实现） */
function profileHTML() {
  const nmibc = STATE.line === 'nmibc';
  const has = !!STATE.line && STATE.line !== 'undetermined';
  const name = has ? (nmibc ? '张先生（演示）' : '李先生（演示）') : (STATE.line === 'undetermined' ? '保持未定' : '未选择分野');
  const meta = has ? (nmibc ? 'DEMO-1 · NMIBC 保膀胱线' : 'DEMO-2 · MIBC 根治与改道线')
                   : '选定后看板才会长出内容';
  const av = has ? (nmibc ? '张' : '李') : '—';
  return `<div class="nav-profile">
    <div class="np-top">
      <span class="np-avatar" aria-hidden="true">${av}</span>
      <span class="np-txt">
        <span class="np-name">${esc(name)}</span>
        <span class="np-meta">${esc(meta)}</span>
      </span>
    </div>
    <select id="selDemo" aria-label="切换演示档案（等于重新选择分野，改动会留痕）">
      <option value="__none" ${!STATE.line ? 'selected' : ''}>未选择分野</option>
      <option value="nmibc" ${nmibc ? 'selected' : ''}>DEMO-1 · NMIBC 保膀胱线</option>
      <option value="mibc" ${STATE.line === 'mibc' ? 'selected' : ''}>DEMO-2 · MIBC 根治与改道线</option>
      <option value="undetermined" ${STATE.line === 'undetermined' ? 'selected' : ''}>我还不确定</option>
    </select>
  </div>`;
}

/* 分野切换唯一入口：改动留痕，不改写历史，不覆盖旧值 */
function setLine(v) {
  const next = v || null;
  if (STATE.line && next && STATE.line !== next) {
    STATE.lineHistory.unshift(`${STATE.line} → ${next}`);
  }
  STATE.line = next;
  // 「重新选择分野」要回到闸门，而不是原地重渲染当前页
  if (!next) { STATE.route = 'dashboard'; location.hash = '#/dashboard'; }
  saveState(); renderNav(); renderPage();
}

function renderNav() {
  const nav = $('#wbNav');
  const map = {};
  NAV.forEach((n) => { map[n.id] = n; });
  const itemHTML = (n) => `
    <button type="button" class="nav-item" data-route="${n.id}"
            ${STATE.route === n.id ? 'aria-current="page"' : ''}>
      <span class="nav-ico" aria-hidden="true">${n.ico}</span>
      <span class="nav-text">${esc(n.text)}</span>
      ${(n.id === 'instillation' && STATE.line === 'nmibc') ? '<span class="nav-dot">4/7</span>' : ''}
      ${(n.id === 'urgent') ? '<span class="nav-dot">急</span>' : ''}
    </button>`;

  nav.innerHTML = `
    <div class="nav-brand">
      <span class="nav-logo" aria-hidden="true"></span>
      <span class="nav-brand-txt">
        <span class="nav-brand-name">小泉宝 UroPal</span>
        <span class="nav-brand-tag">膀胱癌AI工作台</span>
      </span>
    </div>
    ${profileHTML()}
  ` + NAV_GROUPS.map((g) => (
    (g.label ? `<div class="nav-sec">${esc(g.label)}</div>` : '')
    + g.ids.map((id) => {
      if (id === 'settings') {
        return `<button type="button" class="nav-item" data-act="settings">
          <span class="nav-ico" aria-hidden="true">⚙</span><span class="nav-text">设置</span></button>`;
      }
      return map[id] ? itemHTML(map[id]) : '';
    }).join('')
  )).join('');

  $$('.nav-item', nav).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.act === 'settings') return openSettings();
    STATE.route = b.dataset.route;
    location.hash = `#/${STATE.route}`;
    renderNav();
    renderPage();
  }));

  const sel = $('#selDemo');
  if (sel) sel.addEventListener('change', () => {
    const v = sel.value === '__none' ? null : sel.value;
    setLine(v);
    toast(v === 'undetermined' ? '保持未定：不显示任何一条线的专属内容'
      : v ? '已切换分野，看板与导航一起更新' : '已回到分野闸门');
  });
}

/* 面包屑（顶栏中间那句状态说明之外的第二个「我在哪」） */
function renderCrumb() {
  const def = NAV.find((n) => n.id === STATE.route);
  const { current } = tabsFor(STATE.route);
  const line = STATE.line === 'nmibc' ? 'NMIBC 保膀胱线'
             : STATE.line === 'mibc' ? 'MIBC 根治与改道线'
             : STATE.line === 'undetermined' ? '分野未定' : '未分野';
  $('#wbCrumb').innerHTML = `<span class="crumb-txt">小泉宝工作台 / <b>${esc(def ? def.text : '看板')}</b>`
    + (current ? ` / ${esc(current)}` : '')
    + ` <span class="crumb-note">· 演示档案 ${esc(line)} · 全部为模拟资料</span></span>`
    // 页面级动作：把「当前这一页的处境」压成提示词交给 AI。
    // 放在面包屑里而不是顶栏，是因为它随页面变化；顶栏那组是全局动作。
    + `<button type="button" class="crumb-ai" data-act="toAI" title="把本页场景与关键信息整理成提示词，交给宿主原生 AI 会话（页面内不自建对话窗）">发送到 AI</button>`;
}

/* ---------------- 复用的页面片段 ---------------- */
function tabsFor(route) {
  const def = NAV.find((n) => n.id === route);
  if (!def || !def.tabs) return { tabs: [], current: null };
  const cur = STATE.tab[route] || def.tabs[0];
  return { tabs: def.tabs, current: cur };
}

function tabsHTML(route) {
  const { tabs, current } = tabsFor(route);
  if (!tabs.length) return '';
  return `<div class="tabs" role="tablist">` + tabs.map((t) => `
    <button type="button" class="tab" role="tab" data-tab="${esc(t)}"
            aria-selected="${t === current}">${esc(t)}${t.includes('危险度') || t.includes('B12') || t.includes('性功能') ? ' <span class="verify-tag">来源待补</span>' : ''}</button>
  `).join('') + `</div>`;
}

function bindTabs(route) {
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    STATE.tab[route] = b.dataset.tab;
    renderPage();
  }));
}

const H = (title, lead) => `
  <div class="page-head"><h1>${esc(title)}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div>`;

function card(title, body, extra = '') {
  return `<div class="card">${title ? `<div class="card-title"><h3>${title}</h3>${extra}</div>` : ''}${body}</div>`;
}

/* 顶部小结条：把「排到第几次 / 取消过几次 / 下次哪天」这类一眼要有的事实提上来，
   不让患者去表格里数。 */
function statStrip(items) {
  return `<dl class="stat-strip">${items.map(([k, v, note]) =>
    `<div class="stat-cell"><dt>${esc(k)}</dt><dd>${v}</dd>${note ? `<span class="src">${note}</span>` : ''}</div>`).join('')}</dl>`;
}

/* ================= 1. 看板 ================= */
function pageDashboard() {
  /* 未分野时不再把整页让给闸门 —— 那样首页看着是空的，不像一个能用的产品。
     改为：闸门降级成「第一张卡」，下面照常按演示档案 DEMO-1（NMIBC）渲染，
     并在 hero 上明写「分野未确认」——不假装用户已经选过。 */
  const confirmed = STATE.line === 'nmibc' || STATE.line === 'mibc';
  const nmibc = STATE.line !== 'mibc';
  const gateFirst = confirmed ? '' : gateHTML();

  const lineName = nmibc ? '非肌层浸润（Ta/T1/Tis）· 保膀胱线' : '肌层浸润（T2+）· 根治与改道线';
  const stage = nmibc ? '膀胱灌注诱导期' : '术后待定改道术式';

  const hero = `
    <div class="hero">
      <div class="hero-top">
        <div>
          <div class="hero-eyebrow">UroPal · ${esc(lineName)}</div>
          <h1 class="hero-title">${nmibc ? '这条线的重点：把肿瘤控住，同时保住膀胱。' : '这条线的重点：先活下来，再学会带着改道生活。'}</h1>
          <p class="hero-sub">${nmibc
            ? '你要长期做三件事：把每次灌注记准、把每次膀胱镜排上、把复发恐惧说出来。工作台只帮你记清楚，不替你判断。'
            : '你要面对两个不可逆的选择：膀胱切不切、改道走哪一种。这里把三种术式并排摆出来，不给倾向。'}</p>
        </div>
        <span class="chip chip-brand">当前阶段：${esc(stage)}</span>
        ${confirmed ? '' : '<span class="chip chip-warn">分野未确认 · 按演示档案 DEMO-1 展示</span>'}
      </div>
    </div>`;

  const strip = nmibc ? `
    <div class="strip status-card">
      <div class="strip-main">
        <div class="status-eyebrow">状态卡 · 待初始化 · 距下次灌注</div>
        <div class="status-day">待初始化</div>
        <p class="status-note">未记录锚点日（诱导 D1 / 手术 Day 0），天数无法派生。三步初始化
          （① 分野 ② 录入病理 ③ 记录首个灌注 / 手术日）尚未完成；本原型暂无独立向导页，先在
          <button type="button" class="status-link" data-goto="records">病情整理</button> 录入。</p>
        <div class="strip-head">膀胱灌注 诱导期 · 3 / 6 次已完成</div>
        <div class="strip-note">上次 2026-10-23 因<b>肉眼血尿</b>取消 · 下次：2026-10-30（灌注第 4 次）。
          取消不是恶化，是禁忌在保护你；漏做不做补做建议。</div>
      </div>
      <div class="strip-actions">
        <button type="button" class="btn btn-primary" data-goto="instillation">看灌注周期（按天）→</button>
        <button type="button" class="btn" data-primer-open aria-label="疾病概要：定义、医学资料与指南情况、治疗全景、发展趋势">疾病概要：膀胱癌是什么？</button>
      </div>
    </div>` : `
    <div class="strip status-card">
      <div class="strip-main">
        <div class="status-eyebrow">状态卡 · 待初始化 · 距术式确定</div>
        <div class="status-day">待初始化</div>
        <p class="status-note">未记录锚点日（手术 Day 0 / 诱导 D1），天数无法派生。三步初始化
          （① 分野 ② 录入病理 ③ 记录首个灌注 / 手术日）尚未完成；本原型暂无独立向导页，先在
          <button type="button" class="status-link" data-goto="records">病情整理</button> 录入。</p>
        <div class="strip-head">尿流改道术式 尚未记录</div>
        <div class="strip-note">三种术式<b>各自独立</b>：回肠造口 / 原位新膀胱 / 输尿管皮肤造口。
          选定后改动会留痕，不覆盖旧值。</div>
      </div>
      <div class="strip-actions">
        <button type="button" class="btn btn-primary" data-goto="diversion">三术式对照 →</button>
        <button type="button" class="btn" data-primer-open aria-label="疾病概要：定义、医学资料与指南情况、治疗全景、发展趋势">疾病概要：膀胱癌是什么？</button>
      </div>
    </div>`;

  const entries = nmibc ? [
    { ico: '◍', t: '膀胱灌注', d: '诱导 3/6 次 · 上次取消 · 下次 10-30', go: 'instillation' },
    { ico: '◉', t: '下次膀胱镜', d: '2026-12-16 · 尿细胞学同次送检', go: 'followup' },
    { ico: '◈', t: '病理待澄清', d: '「未见肌层」= 分期可能不完整', go: 'staging' },
  ] : [
    { ico: '⬡', t: '尿流改道与造口', d: '三种术式对照 · 造口日记 · 耗材目录', go: 'diversion' },
    { ico: '⇄', t: '肾功能门槛', d: 'eGFR 66 · 接近顺铂门槛 60', go: 'treatment' },
    { ico: '⚑', t: '急症与安全', d: '无尿 + 腰痛 / 造口发黑 / 高热寒战', go: 'urgent' },
  ];

  const todos = nmibc ? [
    { d: '2026-10-30', t: '膀胱灌注 第 4 次（诱导）', m: '本人安排 · 未预约' },
    { d: '2026-11-06', t: '血常规 + 肝肾功能复查', m: '医院安排 · 灌注前评估' },
    { d: '2026-12-16', t: '膀胱镜复查 + 尿细胞学', m: '医院安排 · 时间以短信为准' },
  ] : [
    { d: '2026-10-28', t: '泌尿外科门诊：谈改道术式', m: '本人安排 · 已预约' },
    { d: '2026-10-30', t: '分肾核素肾图（评估左肾功能）', m: '医院安排 · 待确认' },
    { d: '2026-11-04', t: '把造口护理问题带去造口门诊', m: '本人安排 · 1 项待确认' },
  ];

  const questions = nmibc ? [
    { q: '「未见肌层」是不是意味着分期不完整？需要再做一次电切吗？', s: '病理核对衍生 · 本人想问' },
    { q: '这次因为肉眼血尿取消了灌注，后面需要补做吗？', s: '灌注记录衍生 · 本人想问' },
    { q: '尿细胞学写「非典型」，这个结果要怎么理解？', s: '资料库衍生 · 本人想问' },
  ] : [
    { q: '我的肾功能还能不能用顺铂？如果不能用，替代方案是什么？', s: '肾功能门槛衍生 · 本人想问' },
    { q: '三种改道方式里，哪一种更适合我现在的工作和作息？', s: '三术式对照衍生 · 本人想问' },
    { q: '切除之后还需要复查上尿路吗？多久一次？', s: '复查与膀胱镜衍生 · 本人想问' },
  ];

  const dashCodes = nmibc ? 'hb,pain' : 'egfr,weight';
  const growth = `<div class="chart-block" data-codes="${dashCodes}" data-win="all">
      <div class="chart-wrap"><div class="chart-host"></div></div>
      <div class="legend" data-legend></div>
    </div>`;

  return gateFirst + hero + strip
    + `<div class="entry-grid">` + entries.map((e) => `
        <button type="button" class="entry-card" data-goto="${e.go}">
          <span class="entry-ico" aria-hidden="true">${e.ico}</span>
          <span class="entry-txt"><span class="entry-t">${esc(e.t)}</span><span class="entry-d">${esc(e.d)}</span></span>
          <span class="entry-arrow" aria-hidden="true">→</span>
        </button>`).join('') + `</div>`
    + `<div class="cols-2-wide">
        ${card('最近的变化', growth + `<p class="src" style="margin-top:8px">同一份记录，同时出现在<b>一图秀</b>、<b>指标卡</b>和<b>复诊准备</b>里；每线按各自全期范围归一化，彼此不可比。</p>`,
               `<button type="button" class="btn btn-sm" data-goto="chart">打开一图秀</button>`)}
        <div class="card"><h3>接下来的安排</h3>
          <div class="todo-list">` + todos.map((t) => `
            <div class="todo-item">
              <span class="todo-dot" aria-hidden="true"></span>
              <span class="todo-txt"><span class="todo-date">${esc(t.d)}</span>
                <span class="todo-t">${esc(t.t)}</span>
                <span class="todo-m">${esc(t.m)}</span></span>
            </div>`).join('') + `</div>
        </div>
      </div>`
    + `<div class="cols-2" style="margin-top:16px">
        ${card('就诊前，想问的事', `<div class="q-list">` + questions.map((x) => `
            <div class="q-item"><span class="q-txt"><span class="q-q">${esc(x.q)}</span>
              <span class="q-src">${esc(x.s)}</span></span></div>`).join('') + `</div>`,
          `<button type="button" class="btn btn-sm" data-goto="visit">编辑</button>`)}
        ${card('表达面与指标面（两列并置：不写因果，不写处置）', `
          <table class="tbl">
            <thead><tr><th>表达面（感受）</th><th>指标面</th><th>时间</th></tr></thead>
            <tbody>
              <tr><td>排尿时有灼热感；疼痛自评 2 分</td><td>血红蛋白 124 g/L（较上次 ↑）</td><td>2026-10-22</td></tr>
              <tr><td>容易累，晚上起夜 2 次</td><td>eGFR 66 mL/min/1.73m²（较上次 ↓）</td><td>2026-10-22</td></tr>
            </tbody>
          </table>
          <p class="src" style="margin-top:10px">只有两侧都有记录时才并置；只有一侧时不弹提醒。这里不做因果解释，也不给处置建议。</p>`)}
      </div>`
    // 分野闸门里已经有一份一模一样的急症入口，而且位置更靠上（首屏可达）。
    // 闸门显示时这里不再渲染，否则同一页会出现两组同名按钮（用户实测反馈「重复按钮」）。
    // 闸门隐藏（已确认分野）时才由这里兜住 —— 任何状态下全页都恰好一份。
    + (confirmed ? card('急症入口（不用先分野，30 秒内可达）', `
        <div class="btn-row">
          ${URGENT.map((u) => `<button type="button" class="btn btn-urgent" data-goto="urgent">${esc(u.cat)}</button>`).join('')}
        </div>
        <p class="src" style="margin-top:10px">四类判据的来源在原型阶段<b>尚未取得</b>（见「急症与安全」页），界面不给处置建议，只给联系路径。</p>`) : '');
}

/* 首屏分野闸门（S01）：未选线时不显示任何一条线的专属内容 */
function gateHTML() {
  const undet = STATE.line === 'undetermined';
  return `
  <div class="gate gate-page">
  <div class="hero">
    <div class="hero-top">
      <div>
        <div class="hero-eyebrow">UroPal · 第一步</div>
        <h1 class="hero-title">${undet ? '先保持未定。这一步不着急。' : '第一步不是记录，是先弄清楚你属于哪条线。'}</h1>
        <p class="hero-sub">膀胱癌按<b>有没有长进肌肉层</b>分成两条很不一样的路。
          <b>这一步决定你看到的内容</b>。还没选定的时候，下面先按<b>演示档案 DEMO-1（NMIBC）</b>
          给你看一遍全貌，并在标题旁标出「分野未确认」——不假装你已经选过；选定后整页跟着换。
          不确定也可以选最后一项，随时能改，改动会留痕。</p>
      </div>
      <span class="chip chip-neutral">当前阶段：${undet ? '分野未定' : '未分野'}</span>
    </div>
  </div>

  <div class="gate-choices">
    <button type="button" class="gate-choice" data-line="nmibc" aria-pressed="false">
      <h3>非肌层浸润 · NMIBC</h3>
      <p>病理写着 <b>Ta / T1 / Tis</b>，或写着<b>没有侵犯肌层</b>。<br>
         这条线的主线是：把肿瘤切掉 + 膀胱灌注 + 长期复查，目标是<b>尽量保住膀胱</b>。</p>
      <ul class="gc-list">
        <li>灌注周期与每次记录（含取消与原因）</li>
        <li>膀胱镜复查排程、疼痛与心情</li>
        <li>尿细胞学四态、上尿路监测、肾功能</li>
      </ul>
      <span class="chip chip-brand gc-tag">保膀胱线</span>
    </button>
    <button type="button" class="gate-choice" data-line="mibc" aria-pressed="false">
      <h3>肌层浸润 · MIBC</h3>
      <p>病理写着 <b>T2 或更深</b>，也就是<b>已经长进肌肉层</b>。<br>
         这条线的主线是：根治性膀胱切除 + 尿流改道，或三联保膀胱；要面对<b>膀胱去留</b>。</p>
      <ul class="gc-list">
        <li>三种改道术式的零倾向对照</li>
        <li>造口日记、耗材目录、代谢长期项</li>
        <li>顺铂门槛（eGFR / 分肾核素）</li>
      </ul>
      <span class="chip chip-brand gc-tag">根治与改道线</span>
    </button>
    <button type="button" class="gate-choice" data-line="undetermined" aria-pressed="false">
      <h3>我还不确定</h3>
      <p>报告看不懂、还没拿到，或者医生没说清楚。<br>
         选这个<b>不会替你归类</b>，也不会显示任何一条线的专属内容。</p>
      <ul class="gc-list">
        <li>先把资料整理进来，原样抄录、逐项核对</li>
        <li>看「我的分型与分期」里的原文与待澄清项</li>
        <li>带着「未见肌层」这类词去问医生</li>
      </ul>
      <span class="chip chip-neutral gc-tag">保持未定</span>
    </button>
  </div>

  <p class="gate-note">
    工作台<b>不对「保膀胱还是切除」表达倾向</b>；两条线的内容不做对照排名，也不会因为选了某条线就隐藏另一条。
  </p>
  </div>

  <div class="cols-2" style="margin-top:16px">
    ${card(undet ? '保持未定也能用的两件事' : '还不能分野时，先把这两件事做了', `
      <div class="todo-list">
        <div class="todo-item"><span class="todo-dot" aria-hidden="true"></span>
          <span class="todo-txt"><span class="todo-t">把病理报告原样录进来</span>
            <span class="todo-m">只抄写不判断；「未见肌层」「低级别」这类词会被标成待澄清项</span></span></div>
        <div class="todo-item"><span class="todo-dot" aria-hidden="true"></span>
          <span class="todo-txt"><span class="todo-t">记下这次想问医生的三个问题</span>
            <span class="todo-m">问题清单不依赖分野，随时可增删</span></span></div>
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button type="button" class="btn btn-primary" data-goto="records">去病情整理</button>
        <button type="button" class="btn" data-goto="visit">去复诊准备</button>
      </div>`)}
    ${card('急症入口（不用先分野，30 秒内可达）', `
      <div class="btn-row">
        ${URGENT.map((u) => `<button type="button" class="btn btn-urgent" data-goto="urgent">${esc(u.cat)}</button>`).join('')}
      </div>
      <p class="src" style="margin-top:10px">四类判据的来源在原型阶段<b>尚未取得</b>，界面只给联系路径，不给处置建议。</p>`)}
  </div>`;
}

/* ================= 2. 病情整理 ================= */
/* ================= 记录类视图的 CRUD（添加 / 修改 / 删除） =================
 *
 * 统一口径，避免每个列表各写一套：
 *   - **添加**：表单弹窗，字段清单在 CRUD_KINDS[kind].fields；
 *   - **修改**：先展示「原值 + 来源」，保存时把旧值压进 `_prev`，**原行不覆盖来源**；
 *   - **删除**：**软删（作废标记）**，不移除原行、不覆盖值；其它页零副作用
 *     （作废的行不计入统计、不进复诊摘要、不进 AI 草稿），可随时恢复。
 *
 * 为什么是软删而不是 `splice`：这些行是「原件抄下来的东西」。删掉之后，
 * 「这个数字是从哪份文件的哪一行来的」就答不出来了。作废保留可追溯性。
 */
const CRUD_KINDS = {
  recFile: {
    title: '资料',
    fields: [
      ['name', '资料名称', 'text'], ['kind', '类型', 'text'],
      ['on', '报告日期', 'date'], ['by', '机构', 'text'],
      ['pages', '页数', 'number'], ['state', '核对状态', 'select', ['已核对', '待核对']],
    ],
    label: (r) => r.name,
    summary: (r) => `${r.kind || ''} · ${r.on || ''} · ${r.by || ''}`,
    all: () => RECORDS.files,
    add: () => ({ name: '', kind: '化验', on: '', by: '', pages: 1, state: '待核对' }),
  },
  recDraft: {
    title: '候选',
    fields: [
      ['field', '候选字段', 'text'], ['value', '抽取值', 'text'], ['quote', '原文片段', 'text'],
    ],
    label: (r) => r.field,
    summary: (r) => r.quote || '',
    all: () => RECORDS.drafts,
    add: () => ({ field: '', value: '', quote: '', ok: true }),
  },
  recFact: {
    title: '已确认事实',
    fields: [
      ['item', '项目', 'text'], ['value', '内容', 'text'], ['by', '谁记的', 'text'],
      ['on', '记录日期', 'date'], ['state', '核对状态', 'select', ['已核对', '待核对', '待澄清']],
    ],
    label: (r) => r.item,
    summary: (r) => `${r.value || ''} · ${r.on || ''} · ${r.by || ''}`,
    all: () => RECORDS.facts,
    add: () => ({ item: '', value: '', by: '本人', on: '', state: '待核对' }),
  },
  sideEffect: {
    title: '灌注后不适',
    fields: [
      ['on', '日期', 'date'], ['feel', '感受（自述）', 'text'],
      ['score', '强度（自评 0–10）', 'number'], ['days', '持续', 'text'],
    ],
    label: (r) => `${r.on} · ${r.feel}`,
    summary: (r) => `${r.score} / 10 · ${r.days}`,
    all: () => SIDE_EFFECTS,
    add: () => ({ on: '', feel: '', score: 0, days: '—', by: '本人自述' }),
  },
  question: {
    title: '复诊问题',
    fields: [
      ['group', '场景', 'text'], ['q', '问题', 'text'],
      ['asked', '问了没有', 'select', ['未问', '已问']], ['answer', '医生怎么答（原文）', 'text'],
    ],
    label: (r) => r.q,
    summary: (r) => `${r.group || ''} · ${r.asked || ''}`,
    all: () => QUESTIONS,
    add: () => ({ group: '通用', q: '', asked: '未问', answer: '' }),
  },
  trialFav: {
    title: '收藏线索',
    fields: [
      ['reg', '登记号', 'text'], ['why', '我为什么收藏它', 'text'],
      ['on', '收藏日期', 'date'], ['next', '下一步', 'text'],
    ],
    label: (r) => r.reg,
    summary: (r) => r.why || '',
    all: () => TRIAL_FAVORITES,
    add: () => ({ reg: '', why: '', on: TMATCH_TODAY, next: '待问主诊医生' }),
  },
  trialSaved: {
    title: '匹配收藏',
    fields: [
      ['reg', '登记号', 'text'], ['why', '我为什么收藏它', 'text'],
      ['on', '收藏日期', 'date'], ['state', '状态（手工）', 'select', ['在跟', '准备问', '已归档']],
    ],
    label: (r) => r.reg,
    summary: (r) => r.why || '',
    keyOf: (r) => r.reg,
    all: () => Object.keys(trialMatchState().saved).map((reg) => ({ reg, ...trialMatchState().saved[reg] })),
    add: () => ({ reg: '', why: '', on: TMATCH_TODAY, state: '在跟' }),
    /* saved_trial 存在对象 map 里（不是数组），所以读写要单独给两个钩子；
       否则 `all()` 返回的是副本，改它不会落回状态（试过一次，界面不动也不报错）。 */
    get: (reg) => {
      const s = trialMatchState().saved[reg];
      return s ? { reg, ...s } : null;
    },
    put: (reg, item) => {
      const st = trialMatchState();
      const prev = st.saved[reg] || {};
      if (reg !== item.reg) delete st.saved[reg];
      st.saved[item.reg] = { ...prev, on: item.on, why: item.why, state: item.state };
    },
    newPut: (item) => {
      trialMatchState().saved[item.reg] = { on: item.on, why: item.why, state: item.state };
    },
  },
  stomaLog: {
    title: '造口日记',
    fields: [
      ['batchOn', '批次日期', 'date'], ['supplyId', '耗材编号', 'text'],
      ['changes', '更换次数', 'number'], ['leaks', '渗漏次数', 'number'],
      ['skin', '皮肤状态', 'select', ['无', '红', '破溃', '其他']],
    ],
    label: (r) => `${r.batchOn} · ${r.supplyId}`,
    summary: (r) => `更换 ${r.changes} · 渗漏 ${r.leaks} · 皮肤 ${r.skin}`,
    all: () => STOMA_LOG,
    add: () => ({ batchOn: '', supplyId: STOMA_SELECT(), changes: 0, leaks: 0, skin: '无' }),
  },
};

function STOMA_SELECT() {
  return (STOMA_SUPPLY && STOMA_SUPPLY[0] && STOMA_SUPPLY[0].id) || 's1';
}

function crudIndexOf(kind, rec) {
  const K = CRUD_KINDS[kind];
  return K.keyOf ? K.keyOf(rec) : K.all().indexOf(rec);
}

/** 作废行单独折叠：不是「删除得一干二净」，而是「留在原地、标成作废、可恢复」。 */
function voidedBlock(kind) {
  const K = CRUD_KINDS[kind];
  if (!K) return '';
  const dead = K.all().filter((r) => r.voided);
  if (!dead.length) return '';
  return `<details class="crud-voided"><summary>已作废 ${dead.length} 条（软删 · 原值保留 · 可恢复）</summary>
    <table class="tbl"><thead><tr><th>记录</th><th>原值</th><th>操作</th></tr></thead><tbody>
      ${dead.map((r) => `<tr class="is-voided"><td>${esc(K.label(r))}</td>
        <td class="src">${esc(K.summary ? K.summary(r) : '')}</td>
        <td><button type="button" class="btn btn-sm" data-crud="restore" data-kind="${kind}"
          data-idx="${esc(String(crudIndexOf(kind, r)))}" aria-label="恢复：${esc(K.label(r))}">恢复</button></td>
      </tr>`).join('')}
    </tbody></table></details>`;
}

/** 行内三件按钮：修改 / 删除。删除必须二次确认，说明是软删。 */
function rowActions(kind, rec) {
  const K = CRUD_KINDS[kind];
  const idx = esc(String(crudIndexOf(kind, rec)));
  const label = esc(K.label(rec) || K.title);
  return `<span class="row-actions">
    <button type="button" class="btn btn-sm" data-crud="edit" data-kind="${kind}" data-idx="${idx}"
      aria-label="修改：${label}">修改</button>
    <button type="button" class="btn btn-sm btn-quiet" data-crud="del" data-kind="${kind}" data-idx="${idx}"
      aria-label="删除：${label}（软删，可恢复）">删除</button>
  </span>`;
}

/** 表单取值（数字字段保持数字，其余去空格）。 */
function readCrudForm(mask, fields) {
  const item = {};
  fields.forEach(([key, , type]) => {
    const el = mask.querySelector(`[data-crud-field="${key}"]`);
    if (!el) return;
    const v = el.value;
    item[key] = type === 'number' ? Number(v || 0) : v.trim();
  });
  return item;
}

function openCrudForm(kind, idx) {
  const K = CRUD_KINDS[kind];
  if (!K) return;
  const isNew = idx == null || idx === '' || idx === -1;
  const rec = isNew ? K.add()
    : K.get ? K.get(idx) : K.all().find((r) => String(crudIndexOf(kind, r)) === String(idx));
  if (!rec) return;
  const title = `${isNew ? '添加' : '修改'}${K.title}`;
  const fieldsHTML = K.fields.map(([key, label, type, opts]) => {
    const val = rec[key] == null ? '' : String(rec[key]);
    const id = `crud-${kind}-${key}`;
    if (type === 'select') {
      return `<div class="field"><label for="${id}">${esc(label)}</label>
        <select id="${id}" data-crud-field="${key}" aria-label="${esc(label)}">
          ${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select></div>`;
    }
    return `<div class="field"><label for="${id}">${esc(label)}</label>
      <input id="${id}" type="${type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}"
        data-crud-field="${key}" value="${esc(val)}" aria-label="${esc(label)}"></div>`;
  }).join('');

  const prev = !isNew && Array.isArray(rec._prev) && rec._prev.length
    ? `<div class="notice notice-info"><b>这条改过 ${rec._prev.length} 次，原值都留着：</b>
        <ul class="qlist">${rec._prev.slice(-3).map((p) => `<li>${esc(p.value)} <span class="src">（原记录：${esc(p.src || '来源未写')}）</span></li>`).join('')}</ul></div>`
    : '';

  const { mask, close } = openModal(`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="crudTitle">
      <div class="modal-head"><h3 id="crudTitle">${esc(title)}</h3>
        <button class="ag-close" data-close aria-label="关闭">×</button></div>
      <div class="modal-body">
        ${isNew ? '' : `<p class="src" style="margin-bottom:12px">修改会<b>保留原值与来源</b>：
          旧值记入这条记录的修改历史，界面显示新值；原行不被删除。</p>`}
        ${prev}
        ${fieldsHTML}
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>取消</button>
        <button class="btn btn-primary" data-crud-save>保存</button>
      </div>
    </div>`);

  const saveBtn = mask.querySelector('[data-crud-save]');
  saveBtn.addEventListener('click', () => {
    const item = readCrudForm(mask, K.fields);
    if (!String(item[K.fields[0][0]] || '').trim()) {
      toast(`先填「${K.fields[0][1]}」`); return;
    }
    if (isNew) {
      if (K.newPut) K.newPut(item);
      else K.all().push(item);
    } else {
      const live = K.get ? K.get(idx) : K.all().find((r) => String(crudIndexOf(kind, r)) === String(idx));
      if (!live) return;
      const old = K.fields.map(([k]) => live[k]).join(' / ');
      const prev = Array.isArray(live._prev) ? live._prev.slice() : [];
      prev.push({ value: old, src: [live.by, live.on].filter(Boolean).join(' · ') });
      const next = { ...live, ...item, _prev: prev };
      if (K.put) K.put(idx, next);
      else K.fields.forEach(([k]) => { if (item[k] !== undefined) live[k] = item[k]; });
      if (!K.put) live._prev = prev;
    }
    close(); renderPage();
    toast(isNew ? `已添加${K.title}（本机演示，刷新重置）` : `已保存：原值保留在这条记录的修改历史里`);
  });
}

/** 删除二次确认：必须说清「零副作用 + 原行不覆盖 + 软删」。 */
function confirmCrudDelete(kind, idx) {
  const K = CRUD_KINDS[kind];
  const rec = K && K.all().find((r) => String(crudIndexOf(kind, r)) === String(idx));
  if (!rec) return;
  const { mask, close } = openModal(`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="delTitle">
      <div class="modal-head"><h3 id="delTitle">删除${esc(K.title)}？</h3>
        <button class="ag-close" data-close aria-label="关闭">×</button></div>
      <div class="modal-body">
        <p><b>${esc(K.label(rec))}</b></p>
        <div class="notice notice-warn" style="margin-top:10px">
          <b>这是软删（作废），不是把原行抹掉。</b>原行与来源日期都保留，随时可以恢复；
          对其它页<b>零副作用</b>：不计入统计、不进复诊摘要、不进 AI 草稿。
        </div>
        <p class="src" style="margin-top:10px">删除后仍能在「已作废（软删）」里看到并恢复 ——
          这样「这个数字从哪来」始终答得出来。</p>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>取消</button>
        <button class="btn btn-primary" data-crud-confirm>确认删除（软删）</button>
      </div>
    </div>`);
  mask.querySelector('[data-crud-confirm]').addEventListener('click', () => {
    if (kind === 'trialSaved') {
      const s = trialMatchState().saved[String(idx)];
      if (s) s.voided = true;
    } else {
      rec.voided = true;
    }
    close(); renderPage();
    toast('已作废（软删）：原行与来源保留，可在「已作废」里恢复');
  });
}

function restoreCrud(kind, idx) {
  const K = CRUD_KINDS[kind];
  if (kind === 'trialSaved') {
    const s = trialMatchState().saved[String(idx)];
    if (s) delete s.voided;
  } else {
    const rec = K.all().find((r) => String(crudIndexOf(kind, r)) === String(idx));
    if (rec) delete rec.voided;
  }
  renderPage();
  toast('已恢复这条记录');
}

/** 只显示未作废的行；作废的行由 voidedBlock 折叠展示。 */
const crudLive = (kind) => CRUD_KINDS[kind].all().filter((r) => !r.voided);

/* ================= 29 号：材料导入（嗅探 → 取行 → 闸门 → 抽候选 → 落库） =================
 *
 * 用户的要求是「上传 / 解析 / 确认不要拆散在不同入口」。所以这里是**唯一入口**：
 * 一个「导入材料」按钮打开五步流程，全部在同一个弹窗里完成 —— 不跳页、
 * 不把某一步挪到设置里。步骤条常显，让人知道自己走到哪、还剩几步。
 *
 * 三条不可换的顺序（29 号 §1）：
 *   ① 嗅探只判类型/文本层/sha，不解析数值；
 *   ② 闸门（是不是本病种）**必须在抽候选之前**，reject 时不给抽取按钮；
 *   ③ 抽出来的只是 candidate，逐项确认后才写业务记录（document 与 candidate 先落）。
 *
 * 演示材料是合成的（文件名带「演示」），不读本机任何真实文件；真实选择的文件也
 * 只在本页读名字/大小/sha，不上传、不解析内容 —— 做不到就如实说「无法判定」。
 */
const IMPORT_STEP_DEFS = [
  ['选择 / 上传', '拖拽或选文件；显示文件名、大小、sha 前 8 位'],
  ['嗅探与闸门', '类型 / 有无文本层 / 是否本病种 → accept / needs_review / reject'],
  ['抽候选', '逐条：字段、原文行、置信度、来源'],
  ['逐项确认', '接受 / 改值 / 拒收；「全部确认」要再点一次'],
  ['落库', '写 document + candidate；确认后才写业务记录'],
];

/* 演示材料：三条覆盖三种闸门结论，全部为合成内容。 */
const IMPORT_DEMO_FILES = [
  {
    name: '演示-外院病理报告-2026-10-20.pdf', size: 184320, sha: '9f2c1a7d', kind: 'pdf',
    hasTextLayer: true, route: 'extract', reportDate: '2026-10-20', demo: true, skipped: 2,
    gate: { verdict: 'accept', via: 'primary', reason: '原发灶措辞命中「膀胱」3 次；指标组合命中 2 项（尿细胞学、膀胱镜）' },
    candidates: [
      { field: '血红蛋白', valueText: '124', valueNum: 124, unit: 'g/L', confidence: 0.98, sourceLine: '血红蛋白 124 g/L', measuredOn: '2026-10-20' },
      { field: 'eGFR', valueText: '66', valueNum: 66, unit: 'mL/min/1.73m²', confidence: 0.96, sourceLine: 'eGFR 66 mL/min/1.73m²', measuredOn: '2026-10-20' },
      { field: '肌酐', valueText: '105', valueNum: 105, unit: 'μmol/L', confidence: 0.95, sourceLine: '肌酐 105 μmol/L', measuredOn: '2026-10-20' },
      { field: '尿细胞学', valueText: '非典型', valueNum: null, unit: '', confidence: 0.72, sourceLine: '查见非典型尿路上皮细胞。', measuredOn: '2026-10-20', note: '文本字段：只写候选，不进趋势表' },
      { field: '尿比重', valueText: '', valueNum: null, unit: '', confidence: 0.31, sourceLine: 'SG 1.0??（原件字迹模糊）', measuredOn: '', needsReview: true, note: '数字没看清，留空等你手填 —— 猜一个比空着更糟' },
    ],
  },
  {
    name: '演示-腹部CT报告-扫描件.pdf', size: 912640, sha: '4b7e0c22', kind: 'pdf',
    hasTextLayer: false, route: 'ocr', reportDate: '', demo: true, skipped: 0,
    gate: { verdict: 'needs_review', via: 'panel', reason: 'PDF 无字体资源与文字算子，判定为扫描件；没有文本层就无法判定病种（需要先做 OCR）' },
    candidates: [],
  },
  {
    name: '演示-胆道病理报告-外院.pdf', size: 143360, sha: 'a1d93b55', kind: 'pdf',
    hasTextLayer: true, route: 'extract', reportDate: '2026-10-18', demo: true, skipped: 0,
    gate: { verdict: 'reject', via: 'primary', reason: '文中原发灶为「胆管癌」；虽提到肝，应为转移灶，不属于膀胱癌工作台' },
    candidates: [],
  },
];

function importState() {
  APP.$import = APP.$import || { step: 1, file: null, gate: null, candidates: [], skipped: 0, armBulk: false, done: null, manual: false };
  return APP.$import;
}

const importKB = (n) => `${(Number(n || 0) / 1024).toFixed(1)} KB`;

/** 真实文件的 sha 前 8 位。算不出来就如实写「无法计算」，不编一个。 */
async function importSha8(file) {
  try {
    if (!(window.crypto && window.crypto.subtle)) return '无法计算';
    const buf = await file.arrayBuffer();
    const d = await window.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
  } catch {
    return '无法计算';
  }
}

function importStepper() {
  const st = importState();
  return `<ol class="flow-steps import-steps" aria-label="材料导入流程">${IMPORT_STEP_DEFS.map(([t, d], i) => {
    const n = i + 1;
    const cls = n < st.step ? 'done' : n === st.step ? 'current' : '';
    return `<li class="${cls}" ${n === st.step ? 'aria-current="step"' : ''}>
      <b aria-hidden="true">${n}</b><span><strong>${t}</strong><small>${d}</small></span></li>`;
  }).join('')}</ol>`;
}

function importFileCard() {
  const st = importState();
  if (!st.file) return '';
  return `<div class="import-file">
    <b>${esc(st.file.name)}</b>
    <span>${importKB(st.file.size)} · sha256 前 8 位 <code>${esc(st.file.sha)}</code></span>
    ${st.file.demo ? '<span class="chip chip-neutral">演示材料（合成）</span>' : ''}
  </div>`;
}

function importStep1() {
  const st = importState();
  return `<h4>① 选择 / 上传</h4>
    <p class="src">拖拽到下面，或点「选择文件」。这一步只读文件名、大小与 sha，不解析内容、不上传。</p>
    <div class="import-drop" data-import-drop tabindex="0" role="button" aria-label="拖拽文件到这里，或按回车选择文件">
      <b>把材料拖到这里</b>
      <span>支持 PDF / TXT；扫描件会走 OCR 判定，不会假装读到了字</span>
      <button type="button" class="btn btn-sm btn-primary" data-import-pick>选择文件</button>
      <input type="file" id="impFile" accept=".pdf,.txt,.md" hidden aria-label="选择材料文件">
    </div>
    ${importFileCard()}
    <div class="import-demo">
      <span class="src">没有文件？用一份演示材料走完整条流程（合成内容，不读本机文件）：</span>
      <div class="btn-row">
        ${IMPORT_DEMO_FILES.map((f, i) => `<button type="button" class="btn btn-sm" data-import-demo="${i}"
          aria-label="使用演示材料：${esc(f.name)}">${esc(f.name.replace('演示-', ''))}</button>`).join('')}
      </div>
    </div>
    ${st.file ? '' : '<p class="src">还没选材料时，「下一步」是灰的 —— 这样不会走到闸门才发现什么都没选。</p>'}`;
}

function importStep2() {
  const st = importState();
  const f = st.file;
  const g = st.gate || { verdict: 'needs_review', reason: '还没有做嗅探', via: '—' };
  const verdictMap = {
    accept: ['accept · 收下', 'chip-ok', '可以做下一步：抽候选'],
    needs_review: ['needs_review · 判不了', 'chip-warn', '文件本身是好的，只是判不了病种；需要你确认或补 OCR'],
    reject: ['reject · 拒收', 'chip-stop', '这不是本病种的材料；不抽任何数值'],
  };
  const [zh, cls, tail] = verdictMap[g.verdict] || verdictMap.needs_review;
  return `<h4>② 嗅探与闸门</h4>
    <table class="tbl"><thead><tr><th>项目</th><th>结果</th></tr></thead><tbody>
      <tr><td>文件名</td><td>${esc(f.name)}</td></tr>
      <tr><td>类型 / 字节</td><td>${esc(f.kind)} · ${importKB(f.size)}</td></tr>
      <tr><td>sha256 前 8 位</td><td><code>${esc(f.sha)}</code>（后面做幂等靠它）</td></tr>
      <tr><td>有没有文本层</td><td>${f.hasTextLayer ? '<span class="chip chip-ok">有</span>' : '<span class="chip chip-warn">无（扫描件）</span>'}</td></tr>
      <tr><td>路线 route</td><td><code>${esc(f.route)}</code>${f.route === 'ocr' ? ' · 需要 OCR；本机 OCR 结果未提供' : f.route === 'unsupported' ? ' · 不支持的类型' : ''}</td></tr>
      <tr><td>闸门结论</td><td><span class="chip ${cls}">${zh}</span> <span class="src">via ${esc(g.via)}</span></td></tr>
    </tbody></table>
    <div class="notice ${g.verdict === 'accept' ? 'notice-ok' : g.verdict === 'reject' ? 'notice-stop' : 'notice-warn'}" style="margin-top:12px">
      <b>${zh}</b>：${esc(g.reason)}
    </div>
    <p class="src" style="margin-top:10px">${tail}。闸门在抽候选<b>之前</b>：结论不是 accept 时，一条候选都不会产生。</p>`;
}

function importStep3() {
  const st = importState();
  const cands = st.candidates;
  return `<h4>③ 抽候选（只是候选，不是事实）</h4>
    ${cands.length ? `<table class="tbl"><thead><tr>
        <th>字段</th><th>抽取值</th><th>原文行（可回看）</th><th>置信度</th><th>来源</th>
      </tr></thead><tbody>
        ${cands.map((c) => `<tr class="${c.needsReview ? 'row-muted' : ''}">
          <td>${esc(c.field)}</td>
          <td>${c.valueText ? `<b>${esc(c.valueText)}</b> ${esc(c.unit)}` : '<span class="chip chip-warn">留空待手填</span>'}</td>
          <td class="src">${esc(c.sourceLine)}</td>
          <td>${Math.round(Number(c.confidence) * 100)}%${c.needsReview ? ' <span class="chip chip-warn">需核对</span>' : ''}</td>
          <td class="src">${esc(st.file.name)} · sha ${esc(st.file.sha)}</td>
        </tr>`).join('')}
      </tbody></table>
      <p class="src" style="margin-top:10px">读到但没人认领的行：${st.skipped} 行（不是错误，是排查「OCR 读对了却没匹配上」的入口）。
      没有单位换算、没有改写数值；置信度低的单独标「需核对」。</p>`
      : `<div class="empty"><strong>这份材料没有产生候选</strong>
          <p>可能是扫描件（没有文本层）、或者闸门判不了。可以转手工补录，不用离开这条流程。</p></div>`}`;
}

function importStep4() {
  const st = importState();
  const pending = st.candidates.filter((c) => c.status === 'pending' || c.status === 'editing').length;
  const done = st.candidates.filter((c) => c.status === 'accepted' || c.status === 'accepted_text' || c.status === 'rejected').length;
  return `<h4>④ 逐项确认（${done} / ${st.candidates.length} 已处理）</h4>
    <div class="notice notice-info">
      <b>确认之前，这里一切都还只是候选。</b>只有数值型字段 + 有测量日期 + 同日同指标不重复，才会写成业务记录；
      文本字段只登记候选，不进趋势表。
    </div>
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>字段</th><th>值 / 单位</th><th>原文行</th><th>日期</th><th>状态 / 操作</th>
    </tr></thead><tbody>
      ${st.candidates.map((c, i) => {
        const tag = c.status === 'accepted' ? '<span class="chip chip-ok">已接受 · 将写业务记录</span>'
          : c.status === 'accepted_text' ? '<span class="chip chip-neutral">已接受 · 只写候选</span>'
            : c.status === 'rejected' ? '<span class="chip chip-stop">已拒收</span>'
              : '<span class="chip chip-warn">待确认</span>';
        if (c.status === 'editing') {
          return `<tr data-cand-row="${i}">
            <td>${esc(c.field)}</td>
            <td><input type="text" data-cand-input="${i}" value="${esc(c.valueText)}" aria-label="${esc(c.field)} 改后的值">
              <span class="src">${esc(c.unit)}</span></td>
            <td class="src">${esc(c.sourceLine)}</td>
            <td>${esc(c.measuredOn || '没有日期')}</td>
            <td><div class="cand-actions"><div class="btn-row">
              <button type="button" class="btn btn-sm btn-primary" data-cand-save="${i}" aria-label="保存改后的值并接受">保存并接受</button>
              <button type="button" class="btn btn-sm" data-cand-reject="${i}" aria-label="拒收这条候选">拒收</button>
            </div></div></td>
          </tr>`;
        }
        return `<tr data-cand-row="${i}" class="${c.status === 'rejected' ? 'row-muted' : ''}">
          <td>${esc(c.field)}</td>
          <td>${c.valueText ? `<b>${esc(c.valueText)}</b> ${esc(c.unit)}` : '<span class="chip chip-warn">留空</span>'}</td>
          <td class="src">${esc(c.sourceLine)}</td>
          <td>${esc(c.measuredOn || '没有日期')}</td>
          <td><div class="cand-actions"><span>${tag}</span><div class="btn-row">
            <button type="button" class="btn btn-sm" data-cand-accept="${i}" aria-label="接受：${esc(c.field)}">接受</button>
            <button type="button" class="btn btn-sm" data-cand-edit="${i}" aria-label="改值：${esc(c.field)}">改值</button>
            <button type="button" class="btn btn-sm btn-quiet" data-cand-reject="${i}" aria-label="拒收：${esc(c.field)}">拒收</button>
          </div></div></td>
        </tr>`;
      }).join('')}
    </tbody></table>
    ${st.armBulk ? `<div class="notice notice-warn" style="margin-top:12px">
        <b>再确认一次：</b>把剩下 ${pending} 条全部按「接受」处理？不合法（缺日期 / 同日重复）的会被跳过并写明原因。
        <div class="btn-row" style="margin-top:8px">
          <button type="button" class="btn btn-sm btn-primary" data-cand-bulk-confirm>再次确认全部确认（${pending} 条）</button>
          <button type="button" class="btn btn-sm" data-cand-bulk-cancel>取消</button>
        </div>
      </div>` : ''}`;
}

function importStep5() {
  const st = importState();
  const d = st.done;
  if (!d) return '<h4>⑤ 落库</h4><p class="src">还没有落库。</p>';
  return `<h4>⑤ 落库</h4>
    <div class="notice ${d.reused ? 'notice-warn' : 'notice-ok'}">
      <b>${d.reused ? '这份材料之前导入过（sha256 相同），这次不重复登记。' : '已写 document + candidate。'}</b>
      ${d.reused ? '同一份文件在同一档案下只登记一次；待确认列表不会翻倍。' : ''}
    </div>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>写了什么</th><th>数量</th><th>说明</th></tr></thead><tbody>
      <tr><td>document</td><td>${d.reused ? 0 : 1}</td><td>状态 <code>${esc(d.docStatus)}</code>${d.docStatus === 'parse_failed' ? ' · 拒收理由已留在文件上' : ''}</td></tr>
      <tr><td>candidate</td><td>${d.candidateCount}</td><td>接受 / 拒收都留档；拒收的候选不会被抹掉</td></tr>
      <tr><td>业务记录（指标点）</td><td>${d.readingCount}</td><td>只有「数值 + 有测量日期 + 同日不重复」才写，且都带 <code>source_doc_id</code></td></tr>
    </tbody></table>
    ${d.readings.length ? `<p class="src" style="margin-top:10px">写进去的是：${d.readings.map((r) => `${esc(r.field)} ${esc(r.value)} ${esc(r.unit)}（${esc(r.on)}）`).join('；')}。</p>` : ''}
    <p class="src" style="margin-top:10px">已确认的候选会出现在「病情整理 › 待核对草稿」，去那里还能再改；
      原件（document）在「资料库」，点得回原文行。</p>`;
}

function importFoot() {
  const st = importState();
  const back = st.step > 1 && !st.done
    ? '<button type="button" class="btn" data-import-back>上一步</button>' : '';
  const close = '<button type="button" class="btn" data-close>关闭</button>';
  let next = '';
  if (st.step === 1) next = `<button type="button" class="btn btn-primary" data-import-next ${st.file ? '' : 'disabled'}>下一步：嗅探与闸门</button>`;
  if (st.step === 2) {
    if (st.gate && st.gate.verdict === 'accept') next = '<button type="button" class="btn btn-primary" data-import-next>抽取候选</button>';
    else if (st.gate && st.gate.verdict === 'reject') next = '<button type="button" class="btn" data-import-manual>转手工补录</button><button type="button" class="btn" data-import-back>换一份材料</button>';
    else next = '<button type="button" class="btn btn-primary" data-import-accept-domain>我确认这是本病种材料</button>'
      + '<button type="button" class="btn" data-import-manual>转手工补录</button>';
  }
  if (st.step === 3) {
    next = st.candidates.length
      ? '<button type="button" class="btn btn-primary" data-import-next>下一步：逐项确认</button>'
      : '<button type="button" class="btn" data-import-manual>转手工补录</button>';
  }
  if (st.step === 4) {
    next = `<button type="button" class="btn" data-cand-bulk>全部确认…</button>
      <button type="button" class="btn btn-primary" data-import-commit>落库</button>`;
  }
  if (st.step === 5) next = '<button type="button" class="btn" data-import-again>再导入一份</button><button type="button" class="btn btn-primary" data-import-finish>完成</button>';
  return close + back + next;
}

function renderImport() {
  const mask = APP.$importMask;
  if (!mask) return;
  const body = mask.querySelector('#impBody');
  const foot = mask.querySelector('#impFoot');
  if (!body || !foot) return;
  const st = importState();
  /* 注意要**调用**取到的那一步（第一版漏了括号，把函数源码当 HTML 渲染了出来）。 */
  const stepFn = [importStep1, importStep2, importStep3, importStep4, importStep5][st.step - 1];
  body.innerHTML = importStepper() + (stepFn ? stepFn() : '');
  foot.innerHTML = importFoot();
  bindImport(mask);
}

function importSelectDemo(i) {
  const st = importState();
  const f = IMPORT_DEMO_FILES[Number(i)];
  if (!f) return toast('这份演示材料不存在');
  st.file = { ...f, candidates: (f.candidates || []).map((c) => ({ ...c })) };
  st.gate = { ...f.gate };
  st.candidates = [];
  st.skipped = 0;
  st.done = null;
  renderImport();
}

/** 真实文件：只读名字/大小/sha。读不到文本层就判 needs_review，不假装解析成功。 */
async function importSelectReal(file) {
  const st = importState();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const sha = await importSha8(file);
  const supported = ['pdf', 'txt', 'md'].includes(ext);
  st.file = {
    name: file.name, size: file.size, sha, kind: ext || 'unknown',
    hasTextLayer: ext === 'txt' || ext === 'md',
    route: !supported ? 'unsupported' : ext === 'pdf' ? 'ocr' : 'extract',
    reportDate: '', demo: false, candidates: [], skipped: 0,
  };
  st.gate = !supported
    ? { verdict: 'reject', via: 'sniff', reason: `不支持的类型 .${ext}；不给抽取按钮，也不逐字段猜` }
    : {
      verdict: 'needs_review', via: 'sniff',
      reason: ext === 'pdf'
        ? '本机原型不解析 PDF 内容（不跑 OCR、不读文本层），无法判定是不是膀胱癌材料；扫描件还可能没有文本层'
        : '本机原型不读文件正文，无法自动判定病种；需要你确认或转手工补录',
    };
  st.candidates = [];
  st.done = null;
  renderImport();
}

function importExtract() {
  const st = importState();
  if (!st.gate || st.gate.verdict !== 'accept') return;   // I1：非 accept 时零候选
  st.candidates = (st.file.candidates || []).map((c) => ({ ...c, status: 'pending' }));
  st.skipped = st.file.skipped || 0;
  st.step = 3;
  renderImport();
}

/** 业务记录前置校验：非数值不能进趋势；缺日期不许确认；同日同指标不覆盖。 */
const IMPORT_METRIC_OF = { 血红蛋白: 'hb', eGFR: 'egfr', 肌酐: 'cr' };
function importAcceptCheck(c) {
  /* 空值不能「接受」：原件没看清就留空，不能用空串混进候选表假装处理过。 */
  if (!String(c.valueText || '').trim()) {
    return { ok: false, why: '值为空（原件没看清），不能确认；请手填或拒收' };
  }
  if (c.valueNum == null) {
    return { ok: false, text: true, why: '文本字段只登记候选，不进趋势表（部位/诊断没有单位与可比性）' };
  }
  if (!c.measuredOn) return { ok: false, why: '没有测量日期，不许确认 —— 不拿上传时间顶替' };
  const code = IMPORT_METRIC_OF[c.field];
  const m = code && METRICS.find((x) => x.code === code);
  if (m && m.points.some((p) => p.d === c.measuredOn)) {
    return { ok: false, why: '同一天同指标已有记录；宁可报错让你选，不静默覆盖' };
  }
  return { ok: true };
}

function importAccept(i) {
  const st = importState();
  const c = st.candidates[i];
  if (!c) return;
  if (!String(c.valueText || '').trim()) return toast('先填这一条的值（看不清就留空并拒收，不猜）');
  const chk = importAcceptCheck(c);
  if (chk.ok) { c.status = 'accepted'; toast('已接受：落库时会写一条指标记录（带 source_doc_id）'); }
  else if (chk.text) { c.status = 'accepted_text'; toast('文本字段：只写候选，不进趋势表'); }
  else { toast(`不能确认：${chk.why}`); }
  renderImport();
}

function importCommit() {
  const st = importState();
  const accepted = st.candidates.filter((c) => c.status === 'accepted');
  const acceptedText = st.candidates.filter((c) => c.status === 'accepted_text');
  const rejected = st.candidates.filter((c) => c.status === 'rejected' || c.status === 'pending' || c.status === 'editing');
  const sha = st.file.sha;
  APP.$importedDocs = APP.$importedDocs || [];
  const reused = APP.$importedDocs.some((d) => d.sha === sha);
  const allProcessed = st.candidates.length > 0
    && st.candidates.every((c) => ['accepted', 'accepted_text', 'rejected'].includes(c.status));
  /* §6.3：parsed 的含义是「人已经看过了」，不是「机器解析成功」；
     needs_review / 没抽到候选 不能落 pending_review（点进去会是空列表）。 */
  const docStatus = st.gate.verdict === 'accept'
    ? (allProcessed ? 'parsed' : 'pending_review')
    : st.gate.verdict === 'reject' ? 'parse_failed' : 'pending_parse';
  if (!reused) {
    const doc = {
      name: st.file.name, kind: st.file.kind === 'pdf' ? '报告' : '文本',
      on: st.file.reportDate || '', by: '外院导入（未核对）', pages: 1,
      state: '待核对', sha, docStatus, gateReason: `[gate] ${st.gate.reason}`,
    };
    RECORDS.files.push(doc);
    [...accepted, ...acceptedText, ...rejected].forEach((c) => {
      RECORDS.drafts.push({
        field: c.field, value: c.valueText, quote: c.sourceLine,
        ok: c.status === 'accepted' || c.status === 'accepted_text',
        why: c.status === 'rejected' ? '导入时已拒收（候选留档）' : c.note || '',
      });
    });
    accepted.forEach((c) => {
      const code = IMPORT_METRIC_OF[c.field];
      const m = code && METRICS.find((x) => x.code === code);
      if (m) m.points.push({ d: c.measuredOn, v: c.valueNum, srcDoc: sha });
    });
    APP.$importedDocs.push({ sha, name: st.file.name });
  }
  st.done = {
    reused, docStatus,
    candidateCount: st.candidates.length,
    readingCount: reused ? 0 : accepted.length,
    readings: accepted.map((c) => ({ field: c.field, value: c.valueText, unit: c.unit, on: c.measuredOn })),
  };
  st.step = 5;
  renderImport();
}

function importManualMode() {
  const st = importState();
  st.manual = true;
  st.candidates = [{
    field: '', valueText: '', valueNum: null, unit: '', confidence: 1,
    sourceLine: '手工补录（没有经过抽取）', measuredOn: '', status: 'pending', manual: true,
  }];
  st.step = 3;
  renderImport();
}

function openImportWizard() {
  const st = importState();
  Object.assign(st, { step: 1, file: null, gate: null, candidates: [], skipped: 0, armBulk: false, done: null, manual: false });
  const { mask, close } = openModal(`
    <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="impTitle">
      <div class="modal-head"><h3 id="impTitle">导入材料</h3>
        <button class="ag-close" data-close aria-label="关闭导入">×</button></div>
      <div class="modal-body" id="impBody"></div>
      <div class="modal-foot" id="impFoot"></div>
    </div>`);
  APP.$importMask = mask;
  APP.$importClose = close;
  renderImport();
}

function bindImport(mask) {
  const st = importState();
  const q = (s) => mask.querySelector(s);
  const all = (s) => Array.from(mask.querySelectorAll(s));

  const pick = q('[data-import-pick]');
  if (pick) pick.addEventListener('click', () => { const inp = q('#impFile'); if (inp) inp.click(); });
  const inp = q('#impFile');
  if (inp) inp.addEventListener('change', () => { if (inp.files && inp.files[0]) importSelectReal(inp.files[0]); });
  const drop = q('[data-import-drop]');
  if (drop) {
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('over');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importSelectReal(f);
    });
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const i = q('#impFile'); if (i) i.click(); }
    });
  }
  all('[data-import-demo]').forEach((b) => b.addEventListener('click', () => importSelectDemo(b.getAttribute('data-import-demo'))));
  const next = q('[data-import-next]');
  if (next) next.addEventListener('click', () => {
    if (st.step === 1) { if (!st.file) return toast('先选一份材料'); st.step = 2; renderImport(); return; }
    if (st.step === 2) { importExtract(); return; }
    if (st.step === 3) { st.step = 4; renderImport(); }
  });
  const back = q('[data-import-back]');
  if (back) back.addEventListener('click', () => {
    if (st.step === 2 && st.gate && st.gate.verdict === 'reject') { st.step = 1; st.file = null; st.gate = null; renderImport(); return; }
    st.step = Math.max(1, st.step - 1); renderImport();
  });
  const acceptDomain = q('[data-import-accept-domain]');
  if (acceptDomain) acceptDomain.addEventListener('click', () => {
    st.gate = { verdict: 'accept', via: 'manual', reason: '由你手动确认这是膀胱癌材料（闸门没能自动判定）；下面的候选仍要逐项确认' };
    st.file.candidates = importManualCandidates(st.file);
    renderImport();
  });
  const manual = q('[data-import-manual]');
  if (manual) manual.addEventListener('click', importManualMode);
  all('[data-cand-accept]').forEach((b) => b.addEventListener('click', () => importAccept(Number(b.dataset.candAccept))));
  all('[data-cand-edit]').forEach((b) => b.addEventListener('click', () => {
    st.candidates[Number(b.dataset.candEdit)].status = 'editing'; renderImport();
  }));
  all('[data-cand-reject]').forEach((b) => b.addEventListener('click', () => {
    st.candidates[Number(b.dataset.candReject)].status = 'rejected'; renderImport();
  }));
  all('[data-cand-save]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.candSave);
    const el = q(`[data-cand-input="${i}"]`);
    if (el) {
      const v = el.value.trim();
      st.candidates[i].valueText = v;
      /* 改值不动原文行；能转成数字才把 valueNum 填上，否则保持 null（文本字段）。 */
      st.candidates[i].valueNum = v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
    }
    st.candidates[i].status = 'pending';
    importAccept(i);
  }));
  const bulk = q('[data-cand-bulk]');
  if (bulk) bulk.addEventListener('click', () => { st.armBulk = true; renderImport(); toast('「全部确认」需要再点一次确认'); });
  const bulkCancel = q('[data-cand-bulk-cancel]');
  if (bulkCancel) bulkCancel.addEventListener('click', () => { st.armBulk = false; renderImport(); });
  const bulkConfirm = q('[data-cand-bulk-confirm]');
  if (bulkConfirm) bulkConfirm.addEventListener('click', () => {
    let ok = 0, skipped = 0;
    st.candidates.forEach((c, i) => {
      if (c.status !== 'pending' && c.status !== 'editing') return;
      const chk = importAcceptCheck(c);
      if (chk.ok) { c.status = 'accepted'; ok += 1; }
      else if (chk.text) { c.status = 'accepted_text'; ok += 1; }
      else { skipped += 1; c.note = chk.why; }
    });
    st.armBulk = false;
    renderImport();
    toast(`全部确认：接受 ${ok} 条${skipped ? `，跳过 ${skipped} 条（缺日期 / 同日重复，已写明原因）` : ''}`);
  });
  const commit = q('[data-import-commit]');
  if (commit) commit.addEventListener('click', importCommit);
  const again = q('[data-import-again]');
  if (again) again.addEventListener('click', () => {
    Object.assign(st, { step: 1, file: null, gate: null, candidates: [], skipped: 0, armBulk: false, done: null, manual: false });
    renderImport();
  });
  const finish = q('[data-import-finish]');
  if (finish) finish.addEventListener('click', () => {
    if (APP.$importClose) APP.$importClose();
    APP.$importMask = null;
    renderPage();
    toast('已回到记录页：新资料在「资料库」，候选在「待核对草稿」');
  });
}

/** 手动确认病种后，仍然只给「可结构化的通用候选」；没有原文就留空，不猜。 */
function importManualCandidates(f) {
  if (f && f.candidates && f.candidates.length) return f.candidates;
  return [
    { field: '血红蛋白', valueText: '', valueNum: null, unit: 'g/L', confidence: 1, sourceLine: '手工补录：请对照原件填写', measuredOn: '' },
    { field: 'eGFR', valueText: '', valueNum: null, unit: 'mL/min/1.73m²', confidence: 1, sourceLine: '手工补录：请对照原件填写', measuredOn: '' },
  ];
}

function pageRecords(tab) {
  const F = crudLive('recFile');
  const confirmed = F.filter((f) => f.state === '已核对').length;
  const pending = F.length - confirmed;

  const libBody = () => card('资料库', `
    <div class="notice notice-info">这里放<b>原件抄下来的东西</b>。资料进来只是「有这份东西」，
    不等于里面的数字已经进了病情档案 —— 那要逐项核对。</div>
    ${statStrip([
      ['资料份数', `${F.length} 份`, '按原件计'],
      ['已核对', `${confirmed} 份`, '数字已进病情档案'],
      ['待核对', `${pending} 份`, '只有原件，还没逐项确认'],
      ['最近一份', F.length ? F[F.length - 1].on : '没有', F.length ? F[F.length - 1].by : '—'],
    ])}
    <div class="notice notice-info" style="margin-top:12px">
      <b>材料导入只有一个入口：</b>「导入材料」。选文件 → 嗅探与闸门 → 抽候选 → 逐项确认 → 落库，
      五步在同一条流程里完成，不跳页、也不分散到设置里。
    </div>
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>资料</th><th>类型</th><th>报告日期</th><th>机构</th><th class="num">页数</th><th>核对状态</th><th>操作</th>
    </tr></thead><tbody>
      ${F.map((f) => `<tr>
        <td>${esc(f.name)}${Array.isArray(f._prev) && f._prev.length ? ' <span class="chip chip-neutral">已修改 · 原值保留</span>' : ''}</td><td>${esc(f.kind)}</td><td>${esc(f.on)}</td>
        <td>${esc(f.by)}</td><td class="num">${f.pages}</td>
        <td>${f.state === '已核对' ? `<span class="chip chip-ok">${esc(f.state)}</span>` : `<span class="chip chip-warn">${esc(f.state)}</span>`}</td>
        <td>${rowActions('recFile', f)}</td>
      </tr>`).join('')}
    </tbody></table>
    ${voidedBlock('recFile')}
    ${collapsible('资料可以怎么进来', `
      <table class="tbl"><thead><tr><th>方式</th><th>适合什么</th><th>进来之后</th></tr></thead><tbody>
        <tr><td>手动抄录</td><td>任何东西；最可靠</td><td>直接是「已核对」，因为是你照着原件打的</td></tr>
        <tr><td>拍照 / PDF 自动抽取</td><td>页数多、字清楚</td><td>进「待核对草稿」，要你逐项点确认</td></tr>
        <tr><td>医院公众号 / App 导出</td><td>有电子报告的医院</td><td>同上，仍要逐项确认</td></tr>
      </tbody></table>
      <p class="src">自动抽取把原件送出本机做识别，所以必须由你显式点一下才会发生，不会偷偷上传。
      一期原型<b>不接通</b>这条链路，界面只留位置。</p>`)}
    ${collapsible('为什么要给资料单独一个区', `
      <p>因为「有这份报告」和「报告里的数字是准的」是两件事。转述会走样、复制会漏行、
      同一份报告可能有多个版本。</p>
      <p>把原件和事实分成两层之后，任何时候你都能回答：<b>这个数字是从哪份文件的哪一行来的？</b>
      对不上时也能一眼看到是原件抄错了，还是你记错了。</p>`)}`,
    `<div class="btn-row">
      <button type="button" class="btn btn-sm btn-primary" data-import aria-label="导入材料（五步在同一条流程里完成）">导入材料</button>
      <button type="button" class="btn btn-sm" data-crud="new" data-kind="recFile" aria-label="添加一份资料">+ 添加资料</button>
    </div>`);

  const draftBody = () => card('待核对草稿（未经核对，不算事实）', `
    <div class="notice notice-warn">草稿区的条目<b>不会</b>进入病情档案，也<b>不会</b>进入 AI 草稿的「已确认事实」。
    抽出来的只是候选，逐项点过确认才算数。</div>
    <h3 style="margin-top:16px">抽取规则：只抄写，不判断</h3>
    <table class="tbl"><thead><tr><th>情况</th><th>怎么处理</th><th>为什么</th></tr></thead><tbody>
      <tr><td>数字看得清</td><td>照抄</td><td>—</td></tr>
      <tr><td>数字看不清</td><td><b>留空</b>，标出原文片段</td><td>猜一个比空着更糟</td></tr>
      <tr><td>单位认不出</td><td>单位留空，值照样抄</td><td>单位错会让整条数据失去意义</td></tr>
      <tr><td>「＜」「＞」这类符号</td><td>原样保留</td><td>丢掉符号就把「低于检出限」读成了具体数</td></tr>
      <tr><td>表格行列对不齐</td><td>整行放弃</td><td>宁可少一条，不可错一条</td></tr>
    </tbody></table>
    <table class="tbl" style="margin-top:16px"><thead><tr>
      <th>候选字段</th><th>抽取值</th><th>原文片段</th><th>操作</th>
    </tr></thead><tbody>
      ${crudLive('recDraft').map((d) => `<tr>
        <td>${esc(d.field)}${Array.isArray(d._prev) && d._prev.length ? ' <span class="chip chip-neutral">已修改 · 原值保留</span>' : ''}</td>
        <td>${d.value ? esc(d.value) : '<span class="chip chip-warn">留空待手填</span>'}</td>
        <td class="src">${esc(d.quote)}${d.why ? `<br>${esc(d.why)}` : ''}</td>
        <td><div class="btn-row">
          ${d.ok ? '<button type="button" class="btn btn-sm btn-primary" data-confirm aria-label="确认这条候选">确认</button>' : '<span class="src">需手填</span>'}
          ${rowActions('recDraft', d)}
        </div></td>
      </tr>`).join('')}
    </tbody></table>
    ${voidedBlock('recDraft')}
    ${collapsible('为什么非要逐项确认，不能一键全收', `
      <p>因为自动识别一定会出错 —— 特别是数字和单位。而这类错误不会报错、不会变红，
      只会在几个月后变成一条对不上的曲线。</p>
      <p>逐项确认是<b>你唯一能拦住它的地方</b>。正式导入流程里的「全部确认」也必须再点一次确认，
      不会一键静默收下。</p>`)}`,
    `<button type="button" class="btn btn-sm" data-crud="new" data-kind="recDraft" aria-label="手工添加一条候选">+ 手工添加候选</button>`);

  const fileBody = () => card('病情档案（已确认事实）', `
    <div class="notice notice-info">每条都记了<b>谁记的、记的是谁、什么时候记的</b>。
    换一个照护者接手时，不用问患者也能对上。</div>
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>项目</th><th>内容</th><th>谁记的</th><th>记录日期</th><th>核对状态</th><th>操作</th>
    </tr></thead><tbody>
      ${crudLive('recFact').map((f) => `<tr>
        <td>${esc(f.item)}</td>
        <td>${esc(f.value)}${Array.isArray(f._prev) && f._prev.length ? ' <span class="chip chip-neutral">已修改 · 原值保留</span>' : ''}</td>
        <td class="src">${esc(f.by)}</td>
        <td>${esc(f.on)}</td>
        <td>${f.state === '已核对' ? `<span class="chip chip-ok">${esc(f.state)}</span>` : `<span class="chip chip-warn">${esc(f.state)}</span>`}</td>
        <td>${rowActions('recFact', f)}</td>
      </tr>`).join('')}
    </tbody></table>
    ${voidedBlock('recFact')}
    <p class="src" style="margin-top:10px">「已核对」只表示<b>转录没错</b>，
    <b>不等于医学审核</b>。诊断与处置仍以你的医疗团队为准。</p>
    <dl class="kv" style="margin-top:12px">
      <dt>病理结论原文</dt><dd>${esc(PATHOLOGY.raw)} ${src(PATHOLOGY.source)}</dd>
      <dt>分级（原文）</dt><dd>${esc(PATHOLOGY.gradeRaw)} <span class="src">报告未写分级体系名；不做换算</span></dd>
      <dt>有无肌层组织</dt><dd>${esc(PATHOLOGY.musclePresent)} <span class="chip chip-warn">分期可能不完整</span></dd>
    </dl>`,
    `<button type="button" class="btn btn-sm" data-crud="new" data-kind="recFact" aria-label="添加一条已确认事实">+ 添加事实</button>`);

  const summaryBody = () => {
    const bySource = ['医生记录', '本人自述', '照护者代记', '待核对草稿'];
    return card('病情汇总', `
      ${statStrip([
        ['已确认事实', `${crudLive('recFact').filter((f) => f.state === '已核对').length} 条`, `共 ${crudLive('recFact').length} 条（不含已作废）`],
        ['资料', `${crudLive('recFile').length} 份`, `${crudLive('recFile').filter((f) => f.state === '待核对').length} 份待核对`],
        ['待核对草稿', `${crudLive('recDraft').filter((d) => d.ok).length} 条`, '不参与汇总'],
        ['时间范围', '2026-06-11 ～ 2026-10-22', '最早 / 最近一条事实'],
      ])}
      <h3 style="margin-top:16px">来源分布</h3>
      <table class="tbl"><thead><tr><th>来源</th><th class="num">条数</th><th>说明</th></tr></thead><tbody>
        <tr><td>医生记录</td><td class="num">3</td><td>报告或门诊记录上的原文</td></tr>
        <tr><td>本人自述</td><td class="num">3</td><td>自己记的症状、感受、复查安排</td></tr>
        <tr><td>照护者代记</td><td class="num">1</td><td>记录人与当事人不是同一个</td></tr>
        <tr><td>待核对草稿</td><td class="num">${RECORDS.drafts.length}</td><td><b>不计入</b>已确认事实</td></tr>
      </tbody></table>
      ${collapsible('汇总里缺的东西，会怎么写', `
        <p>缺项一律写「<b>没有</b>」，不补、不推测、不留空白让人以为是忘了写。</p>
        <table class="tbl"><thead><tr><th>情况</th><th>写法</th></tr></thead><tbody>
          <tr><td>问过但没这项检查</td><td>没有</td></tr>
          <tr><td>做过但报告还没拿到</td><td>结果未出</td></tr>
          <tr><td>报告上有但没看懂</td><td>照抄原文 + 标「待与医生确认」</td></tr>
          <tr><td>属于私密项且未勾选带入</td><td>本次未带入（不写具体内容）</td></tr>
        </tbody></table>
        <p class="src">四种「没有」不是一回事，所以不能都写成一个「无」。</p>`)}
      <div class="btn-row" style="margin-top:16px">
        <button type="button" class="btn btn-primary" data-goto="visit">去生成复诊摘要</button>
        <button type="button" class="btn" data-export>导出（原型占位）</button>
      </div>
      <p class="src" style="margin-top:8px">导出会得到格式真实的文件（原型阶段为占位），
      <b>私密项默认不进导出</b>，除非你在导出前显式勾选。</p>`);
  };

  const body = {
    '资料库': libBody,
    '待核对草稿': draftBody,
    '病情档案': fileBody,
    '指标检测': metricsTable,
    '病情汇总': summaryBody,
  }[tab] || (() => '<div class="empty"><strong>该页签还没有内容</strong></div>');
  return H('病情整理', '事实与草稿分区；草稿不算事实；每条都记谁记的。') + tabsHTML('records') + body();
}

function metricsTable() {
  const rows = METRICS.map((m) => {
    const pts = m.points;
    const last = pts[pts.length - 1];
    const groups = new Set(pts.map((x) => `${x.lab || m.lab || ''}|${x.method || m.method || ''}`)).size;
    return { m, last, n: pts.length, groups };
  });
  const totalPoints = rows.reduce((a, r) => a + r.n, 0);
  const splitGroups = rows.filter((r) => r.groups > 1).length;
  return card('指标记录', `
    <div class="notice notice-info">同一份检测记录，同时出现在指标卡、一图秀和复诊摘要里 ——
    只录一次，三处共用。这里看的是<b>原始记录</b>，不做趋势判断。</div>
    ${statStrip([
      ['指标项', `${rows.length} 项`, `共 ${totalPoints} 条检测记录`],
      ['可比组被拆开', `${splitGroups} 项`, '机构或方法变过，不能连成一条线'],
      ['最近一次', rows.map((r) => r.last.date).sort().slice(-1)[0], '全部指标里最新的'],
      ['单位口径', '存原样 + 归一值', '先剥掉 $…$ 外壳再归一'],
    ])}
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>指标</th><th class="num">最近值</th><th>单位</th><th>日期</th><th>机构</th><th>方法</th><th class="num">记录数</th><th>可比组</th>
    </tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td>${esc(r.m.name)}</td>
        <td class="num">${esc(String(r.last.v))}</td>
        <td>${esc(r.m.unit || '')}</td>
        <td>${esc(r.last.date)}</td>
        <td class="src">${esc(r.last.lab || r.m.lab || '演示检验科')}</td>
        <td class="src">${esc(r.last.method || r.m.method || '—')}</td>
        <td class="num">${r.n}</td>
        <td>${r.groups > 1 ? `<span class="chip chip-warn">${r.groups} 组</span>` : '<span class="src">1 组</span>'}</td>
      </tr>`).join('')}
    </tbody></table>
    ${collapsible('「可比组」是什么，为什么同一项指标会被拆开', `
      <p>同一个指标在不同医院、不同检测方法下测出来的数，<b>不能直接连成一条线</b>。</p>
      <p>比如肌酐：换医院之后从酶法变成苦味酸法，两个数之间差一点是方法带来的，不是病情带来的。
      如果硬连起来，你会看到一条不存在的「变化」。</p>
      <p>所以工作台按「机构 + 方法」自动分组：<b>组内连线，组与组之间断开</b>。
      这不是数据缺失，是刻意不连。</p>
      <p class="src">演示档案里肌酐在 2026-10-08 换了医院，所以它被拆成两组。</p>`)}
    ${collapsible('为什么值要存两份（原样 + 归一）', `
      <table class="tbl"><thead><tr><th>字段</th><th>举例</th><th>用途</th></tr></thead><tbody>
        <tr><td>原样值</td><td><code>$10^9/L$</code></td><td>回看报告时能一字对上</td></tr>
        <tr><td>归一值</td><td><code>10⁹/L</code></td><td>排序、比较、画图时用</td></tr>
      </tbody></table>
      <p class="src">归一之前先剥掉 LaTeX 外壳（报告导出常见 <code>$…$</code>），
      否则同一个单位会被当成两种，白白多出一个可比组。</p>`)}`);
}

function pageStaging(tab) {
  const p = PATHOLOGY;
  const lineName = STATE.line === 'nmibc' ? '非肌层浸润（NMIBC）' : STATE.line === 'mibc' ? '肌层浸润（MIBC）' : '未定';
  const muscleCell = p.musclePresent === '有'
    ? '<b>有</b>'
    : p.musclePresent === '无'
      ? '<b style="color:var(--wb-accent-ink)">无</b> <span class="chip chip-warn">分期可能不完整</span>'
      : '<span class="src">报告未提及（≠「无」）</span>';
  const body = {
    '分野与分型': () => card('当前分野', `
      <dl class="kv">
        <dt>派生分野</dt><dd><b>${lineName}</b>
          <span class="src">派生值；原文缺失就回到「未定」</span></dd>
        <dt>原始依据</dt><dd>${esc(p.raw)}</dd>
        <dt>报告日期</dt><dd>${esc(p.reportDate)} <span class="src">${esc(p.source)}</span></dd>
        <dt>改动留痕</dt><dd>${STATE.lineHistory.length ? STATE.lineHistory.map((h) => `<span class="chip">${esc(h)}</span>`).join(' ') : '<span class="src">暂无改动</span>'}</dd>
      </dl>
      ${/未见肌层|未见肌肉/.test(p.raw) ? `<div class="notice notice-warn">
        <b>报告里写了「未见肌层」。</b>这表示这次取材<b>没有取到肌肉层</b>，于是无法判断到底是 T1 还是 T2——
        也就是<b>分期可能不完整</b>。它不是「没有浸润」的意思，也不是好消息。
        是否要再做一次电切（二次电切）把肌肉层取到，<b>需要问医生</b>。
        <span class="verify-tag">来源待补</span></div>` : ''}
      <div class="btn-row" style="margin-top:12px"><button class="btn" data-act="changeLine">重新选择分野</button></div>`)
      + card('分野为什么是第一件事', `
        <p>膀胱癌按<b>有没有长进肌肉层</b>分成两条路，这两条路的治疗目标不一样：</p>
        <table class="tbl" style="margin-top:10px"><thead><tr><th>分野</th><th>病理写法</th><th>这条线在做什么</th></tr></thead><tbody>
          <tr><td><b>非肌层浸润</b></td><td>Ta / T1 / Tis，或写「没有侵犯肌层」</td><td>把肿瘤切掉 + 膀胱灌注 + 长期复查，目标是<b>尽量保住膀胱</b></td></tr>
          <tr><td><b>肌层浸润</b></td><td>T2 或更深，也就是已经长进肌肉层</td><td>根治性膀胱切除 + 尿流改道，或三联保膀胱；要面对<b>膀胱去留</b></td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">工作台不对「保膀胱还是切除」表达倾向。这里只帮你确认自己在哪条线上。</p>`)
      + card('这一步做完你应该能回答', `
        <ul class="plain"><li>我属于哪条线</li><li>我的分期是不是完整的</li>
        <li>下次复诊我要问哪三个问题</li></ul>
        <p class="src" style="margin-top:8px">如果三条都答不上来，回到上一张卡把报告原文抄完再来看。</p>`),
    '病理与分级': () => card('报告原文（照录，不改写）', `
      <div class="notice notice-info">报告上可能同时出现「G2」这样的写法与「高级别」这样的写法。
        <b>本工作台只并列保存原文，不做换算，也不判断两者是否等价。</b>
        <span class="src">依据：已精读的 11 份中文共识中未出现 G1/G2/G3，只有「低级别/高级别」</span></div>
      <blockquote class="raw-quote">${esc(p.raw)}</blockquote>
      <p class="src">认不出的词照录，并标「未核实」——不替你猜它是什么意思。</p>`)
      + card('逐项拆开看', `
        <table class="tbl"><thead><tr><th>项目</th><th>报告里怎么写的</th><th>怎么理解</th></tr></thead><tbody>
          <tr><td>分级</td><td><b>${esc(p.gradeRaw)}</b></td><td class="src">原文照录；体系名报告未写</td></tr>
          <tr><td>另一套写法</td><td>${p.otherGradeRaw ? esc(p.otherGradeRaw) : '<span class="src">报告未出现</span>'}</td><td class="src">出现了也并列保存，不做换算</td></tr>
          <tr><td>浸润深度</td><td>浸润固有层（T1）</td><td class="src">固有层在黏膜和肌肉层之间</td></tr>
          <tr><td>有没有取到肌层</td><td>${muscleCell}</td><td class="src">这一项决定分期完不完整</td></tr>
          <tr><td>伴随原位癌（CIS）</td><td>${p.concurrentCis === '未提及' ? '<span class="src">报告未提及</span>' : esc(p.concurrentCis)}</td><td class="src">未提及 ≠ 没有</td></tr>
          <tr><td>淋巴血管侵犯</td><td>${p.lvi === '未提及' ? '<span class="src">报告未提及</span>' : esc(p.lvi)}</td><td class="src">未提及 ≠ 没有</td></tr>
          <tr><td>组织学变异型</td><td>${p.variantRaw ? esc(p.variantRaw) : '<span class="src">报告未提及</span>'}</td><td class="src">${p.variantRaw ? '这几个字要单独拿去问医生' : '未提及 ≠ 没有；也<b>不要自己写成「无」</b>'}</td></tr>
          <tr><td>核对状态</td><td><span class="chip chip-warn">${esc(p.reviewState)}</span></td><td class="src">「已核对」只表示抄录无误，不是医学审核</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">报告原文里没有的项，这里一律写「未提及」，<b>不写成「无」</b>。</p>`)
      + card('报告里出现「微乳头」这类词时', `
        <p>尿路上皮癌除了最常见的类型，还有几种写法叫<b>组织学变异型</b>——比如微乳头、腺样、鳞状、巢状分化。
        病理报告里可能写成「伴微乳头分化」这样的形式。</p>
        <p style="margin-top:8px">这几个字值得单独拎出来问医生，原因是权威共识把它列进了<b>极高危的构成</b>：
        2024 版保膀胱共识原文写「<b>BCG 无应答、血管淋巴管侵犯、变异组织类型、前列腺尿道侵犯患者，应首选根治性膀胱切除术</b>」。
        也就是说它和另外三项一起，属于「要专门讨论是否做根治手术」的那一档。</p>
        <blockquote class="raw-quote">2024 版保膀胱共识：BCG 无应答、血管淋巴管侵犯、变异组织类型、前列腺尿道侵犯患者，应首选根治性膀胱切除术。</blockquote>
        <p class="src" style="margin-top:10px">本工作台只做两件事：<b>把报告原文照录下来</b>，<b>提醒你它需要单独问医生</b>。
        这里不说它严不严重、也不替你判断要不要手术——那是医生要跟你谈的事。</p>
        <div class="btn-row" style="margin-top:12px"><button class="btn" data-act="toVisit">把它加进要问的问题</button></div>`),
    '分期断言': () => card('分期（多条并列，不覆盖）', `
      <table class="tbl"><thead><tr><th>类型</th><th>原文</th><th>日期</th><th>状态</th></tr></thead><tbody>
        <tr><td>病理分期</td><td>浸润固有层（T1）</td><td>2026-09-18</td><td><span class="chip chip-ok">现行</span></td></tr>
        <tr><td>临床分期</td><td><span class="src">还没有记录</span></td><td>—</td><td>—</td></tr>
        <tr><td>影像所见</td><td><span class="src">还没有记录</span></td><td>—</td><td>—</td></tr>
        <tr><td>淋巴结</td><td><span class="src">还没有记录</span></td><td>—</td><td>—</td></tr>
      </tbody></table>
      <p class="src" style="margin-top:10px">同一患者可能同时存在临床分期与病理分期，两者并列保存。</p>`)
      + card('改了会怎样', `
        <p>分期不是一行可以被覆盖的字段。新结论进来时<b>旧结论保留</b>，标成「已被替代」，并留下日期与来源——
        这样你回看时能说清「什么时候、根据什么改的口径」。</p>
        <p class="src" style="margin-top:8px">原型阶段这里只展示结构，改动留痕的完整实现放在数据库阶段。</p>`),
    '危险度': () => card('危险度分组', `
      <div class="notice notice-warn">
        危险度分组的<b>各条判据原文是图片</b>，本次未能取得文字。
        因此这里<b>不做任何分层判断</b>，只保留位置。${
          '<span class="verify-tag">来源待补</span>'}
      </div>
      <table class="tbl" style="margin-top:12px"><thead><tr><th>分组</th><th>判据</th><th>来源</th><th>状态</th></tr></thead><tbody>
        <tr><td>低危</td><td rowspan="3" class="src">判据原文未取得，<b>不填任何条件</b></td><td rowspan="3" class="src">2021 灌注共识 表1<br>2024 保膀胱共识 表5 / 表6</td><td rowspan="3"><span class="chip chip-warn">待补</span></td></tr>
        <tr><td>中危</td></tr>
        <tr><td>高危</td></tr>
      </tbody></table>
      <p class="src" style="margin-top:10px">为什么宁可空着：分组直接决定灌注方案与复查频率。
        判据没拿全就自动算一个分组，等于用猜的数字去影响治疗决策。</p>`)
      + card('补齐来源之后会长成什么样', `
        <p>拿到判据原文后，这里会按「条件 → 是否命中」逐条列出，命中的条目高亮，
        并在底部写明 <b>依据哪一版共识、第几张表</b>，以及分组是由谁在什么时候确认的。</p>`),
  }[tab] || (() => '');
  return H('我的分型与分期', '原文优先；分级并列不换算；「未见肌层」不是好消息。')
    + tabsHTML('staging') + body();
}

/* ================= 4. 手术与 TURBT ================= */
function pageSurgery(tab) {
  /* 两条线的手术史不是同一件事：NMIBC 只有 TURBT（可能加一次二次电切），
     MIBC 通常是 TURBT → 二次电切 → 根治性切除。必须按分野取数据集，
     否则切到 MIBC 只看得到 NMIBC 的那一次 TURBT。 */
  const C = SURGERY_CASE[STATE.line === 'mibc' ? 'mibc' : 'nmibc'];
  const rd = C.radical;

  const turbtBody = () => {
    const last = C.turbt[C.turbt.length - 1];
    const noMuscle = C.turbt.filter((t) => t.muscle === '无').length;
    return card('TURBT（经尿道膀胱肿瘤切除术）', `
      <div class="notice notice-info">TURBT 是<b>切除</b>肿瘤，不是「取一点组织去化验」。同一条手术线上的多次操作记成一条序列，不新建档案。</div>
      ${statStrip([
        ['已做次数', `${C.turbt.length} 次`, C.turbt.length > 1 ? '含二次电切' : '单次'],
        ['最近一次', last.on, last.by],
        ['完全切除', last.complete === '完全切除' ? '是' : '否', '取自手术记录原文'],
        ['标本是否含肌层', last.muscle, noMuscle ? '有一次没取到肌肉' : '两次都有'],
      ])}
      <table class="tbl" style="margin-top:12px"><thead><tr>
        <th>次序</th><th>日期</th><th>完全切除</th><th>标本含肌层</th><th>穿孔</th><th>术后导尿</th><th>病理结论（原文）</th>
      </tr></thead><tbody>
        ${C.turbt.map((t) => `<tr>
          <td>第 ${t.seq} 次${t.seq > 1 ? '（二次电切）' : ''}</td>
          <td>${esc(t.on)}</td>
          <td>${t.complete === '完全切除' ? esc(t.complete) : chipCat(t.complete)}</td>
          <td>${t.muscle === '有' ? esc(t.muscle) : `<span class="chip chip-warn">${esc(t.muscle)}</span>`}</td>
          <td>${esc(t.perforation)}</td>
          <td>${esc(t.cath)}</td>
          <td>${esc(t.path)}</td>
        </tr>`).join('')}
      </tbody></table>
      ${noMuscle ? `<div class="notice notice-warn" style="margin-top:12px">
        <b>「标本含肌层：无」不等于「没有浸润」。</b>它的意思是这一次切下来的组织里没有包含肌肉，
        所以<b>分期可能不完整</b>——看不出肿瘤到底有没有长进肌肉层。这是需要带去问医生的一条，
        不是可以放下的结论。</div>` : ''}
      ${collapsible('「完全切除」和「不完全切除」差在哪', `
        <p>医生说「切干净了」和「切得不完全」，指的是<b>这一次能不能用肉眼把肿瘤都拿掉</b>，不是指治好了。</p>
        <ul>
          <li><b>完全切除</b>：这次手术把所有看得见的肿瘤都拿掉了。</li>
          <li><b>不完全切除</b>：还有看得见的残留，或者肿瘤太大、位置不好切，通常会安排再做一次。</li>
        </ul>
        <p class="src">两者的区别会影响下一步安排，但都不代表「好了」或「没救了」。</p>`)}
      ${collapsible('这一次手术具体做了什么', `
        <table class="tbl"><thead><tr><th>项目</th><th>说明</th></tr></thead><tbody>
          <tr><td>麻醉</td><td>通常需要麻醉，方式由麻醉医生决定</td></tr>
          <tr><td>是否取肌层</td><td>标准做法要切到肌肉层，取到肌肉才能判断分期</td></tr>
          <tr><td>术后导尿</td><td>多数会短暂留置导尿管，冲走血块</td></tr>
          <tr><td>术后血尿</td><td>术后一段时间尿里有血是常见的，量多少要记</td></tr>
        </tbody></table>
        <p class="src">来源：演示档案 · 未核对。具体做法以你的手术记录为准。</p>`)}`);
  };

  const reBody = () => {
    const hasRe = !!C.reTurbt;
    return card('二次电切', hasRe ? `
      <div class="notice notice-info">这是<b>同一条手术线的下一事件</b>，不新建一份档案。第 1 次标本没取到肌肉层，所以需要再来一次。</div>
      ${statStrip([
        ['是否已安排', hasRe ? '已计划' : '未记录', hasRe ? esc(C.reTurbt.plannedOn) : ''],
        ['原因', hasRe ? C.reTurbt.reason : '—', '取自手术记录'],
        ['这次的目标', '切得更深、拿到肌肉层', '用来判断有没有浸润'],
      ])}
      ${collapsible('为什么非要再切一次', `
        <p>第一次取材没有肌肉层，就没办法回答「肿瘤到底长进肌肉了没有」。
        而这个问题的答案，直接决定后面走保膀胱还是根治——所以医生宁可再做一次把它问清楚。</p>
        <p class="src">这是「同一手术线的下一事件」，不会新建一份患者档案，也不用重新录一遍基本资料。</p>`)}
      <h3 style="margin-top:16px">这次要问医生的问题</h3>
      <ul class="qlist">
        <li>这一次取到肌肉层的把握有多大？</li>
        <li>两次之间隔多久做，为什么是这个时间？</li>
        <li>如果这次还是没取到肌肉，下一步怎么办？</li>
        <li>做完之后多久能知道结果？</li>
      </ul>
      <p class="src" style="margin-top:8px">工作台只帮你把问题记下来，不替你判断该不该做。</p>` : `
      <div class="empty"><strong>本档案没有二次电切记录</strong>
      这条线只在「第一次标本没取到肌肉层」时才会出现。本演示档案的两次取材都含肌层，所以这里空着。</div>`);
  };

  const radicalBody = () => {
    if (!rd) {
      return card('根治性膀胱切除', `
        <div class="empty"><strong>本档案没有这一项</strong>
        这条线属于<b>肌层浸润（MIBC）</b>。当前演示档案在保膀胱线上，所以没有根治性切除的记录。
        把左上角档案切换到「DEMO-2 · MIBC 根治与改道线」，这里会长出完整记录。</div>
        ${collapsible('什么情况下会走到这一步', `
          <p>当肿瘤已经长进肌肉层（分期到了 T2 或更深），医生会和你讨论要不要把整个膀胱切掉。
          这是<b>需要你和医生一起决定的</b>——工作台不替你判断该不该切，只帮你把这件事记清楚。</p>
          <p class="src">切除范围、要不要保留神经、淋巴结清扫到什么程度，都因人而异，以你的手术记录为准。</p>`)}`);
    }
    return card('根治性膀胱切除', `
      <div class="notice notice-info">手术记录是<b>不可逆事实</b>：改动只追加新版本、不覆盖旧版本，这样回看时才说得清「什么时候改的口径」。</div>
      ${statStrip([
        ['手术日期', esc(rd.on), esc(rd.by)],
        ['切除范围', esc(rd.scope), esc(rd.organs)],
        ['淋巴结', esc(rd.nodes), '取自病理报告'],
        ['切缘', esc(rd.margin), rd.lvi],
      ])}
      <h3 style="margin-top:16px">病理要点</h3>
      <table class="tbl"><thead><tr><th>项目</th><th>结果</th><th>这是什么</th></tr></thead><tbody>
        <tr><td>分期</td><td>${esc(rd.stage)}</td><td>p 表示来自切下来的标本；N1 表示淋巴结里查到癌细胞</td></tr>
        <tr><td>淋巴结</td><td>${esc(rd.nodes)}</td><td>切下来的淋巴结里，有几枚查到癌细胞</td></tr>
        <tr><td>切缘</td><td>${esc(rd.margin)}</td><td>切下来的边缘有没有癌细胞。阴性表示边缘干净</td></tr>
        <tr><td>脉管侵犯</td><td>${esc(rd.lvi)}</td><td>有没有在血管或淋巴管里看到癌细胞</td></tr>
      </tbody></table>
      <p class="src" style="margin-top:8px">来源：演示档案 · 未核对。以上只是把报告原文抄下来，<b>不等于医学结论</b>。</p>
      ${collapsible('切掉的范围包含什么', `
        <p>根治性膀胱切除不只是把膀胱拿掉，通常还包括：</p>
        <ul>
          <li><b>膀胱</b>——整个器官</li>
          <li><b>盆腔淋巴结</b>——取下来做病理，看有没有转移</li>
          <li><b>相邻器官</b>——男性常含前列腺，女性常含子宫与部分阴道；具体范围因人而异</li>
          <li><b>尿流改道</b>——膀胱没了，尿要另找出路，这就是改道术式</li>
        </ul>
        <p class="src">切除范围以你的手术记录为准。手术当天切了什么，这里应该能逐条对上。</p>`)}
      ${collapsible('手术后住院那段要记什么', `
        <table class="tbl"><thead><tr><th>项目</th><th>为什么要记</th></tr></thead><tbody>
          <tr><td>住院天数</td><td>${esc(rd.stay)}（演示）。后续复诊时医生会问</td></tr>
          <tr><td>引流管与支架管</td><td>什么时候拔、拔的时候有没有问题</td></tr>
          <tr><td>造口或新膀胱的第一次使用</td><td>什么时候开始排尿/排便，顺不顺</td></tr>
          <tr><td>出院时的交代</td><td>出院记录里的注意事项，原样抄下来</td></tr>
        </tbody></table>`)}
      <div class="notice notice-warn" style="margin-top:12px">
        尿流改道术式是<b>不可逆事实</b>，记录在「尿流改道与造口」页。本档案采用的是
        <b>${esc(rd.diversion)}</b>。改动只追加版本、不覆盖。</div>`);
  };

  const body = { 'TURBT 序列': turbtBody, '二次电切': reBody, '根治性切除': radicalBody }[tab] || (() => '');
  return H('手术与 TURBT', 'TURBT 是切除不是活检；二次电切是同一手术线的下一事件；根治性切除不可逆。')
    + tabsHTML('surgery') + body();
}

/* ================= 5. 膀胱灌注 ================= */
function pageInstillation(tab) {
  const segRows = INSTILLATION.phasePlan.map((p) => {
    const evs = INSTILLATION.events.filter((e) => e.phase === p.phase);
    return `<div class="seg-row">
      <span class="seg-name">${esc(p.phase)}</span>
      <span class="dots">${evs.map((e) => `<span class="dot" data-st="${e.st}" title="${esc(e.phase)} 第 ${e.idx} 次 · 计划 ${esc(e.planned)}${e.cancelReason ? ' · 取消原因：' + esc(e.cancelReason) : ''}">${e.idx}</span>`).join('')}
        ${Array.from({ length: Math.max(0, p.total - evs.length) }, (_, i) => `<span class="dot" data-st="todo" title="尚未排程">${evs.length + i + 1}</span>`).join('')}</span>
      <span class="src">${esc(p.note)}</span>
    </div>`;
  }).join('');

  const done = INSTILLATION.events.filter((e) => e.st === 'done').length;
  const cancelled = INSTILLATION.events.filter((e) => e.st === 'cancel').length;
  const nextEv = INSTILLATION.events.find((e) => e.st === 'planned');
  const totalPlanned = INSTILLATION.phasePlan.reduce((n, p) => n + p.total, 0);
  const evRow = (e) => `<tr>
      <td>${esc(e.phase)}</td><td class="num">第 ${e.idx} 次</td><td>${esc(e.planned)}</td>
      <td>${e.actual ? esc(e.actual) : '<span class="src">—</span>'}</td>
      <td>${e.st === 'done' ? '<span class="chip chip-ok">已完成</span>'
        : e.st === 'cancel' ? '<span class="chip chip-warn">取消</span>'
        : e.st === 'miss' ? '<span class="chip chip-warn">漏做</span>'
        : '<span class="chip chip-neutral">计划中</span>'}</td>
      <td>${e.cancelReason ? esc(e.cancelReason) : '<span class="src">—</span>'}</td></tr>`;

  const body = {
    '周期总览': () => statStrip([
      ['方案', esc(INSTILLATION.agent) + ' ' + esc(INSTILLATION.doseRaw), '来源：2021 灌注共识'],
      ['已完成', `${done} 次`, `全疗程计划 ${totalPlanned} 次`],
      ['已取消', `${cancelled} 次`, cancelled ? '<span class="chip chip-warn">取消不是病情变坏</span>' : '—'],
      ['下一次', nextEv ? esc(nextEv.planned) : '<span class="src">未排程</span>', nextEv ? `计划：${esc(nextEv.phase)} 第 ${nextEv.idx} 次` : ''],
    ]) + card(`${INSTILLATION.agent} · 两段结构`, `
      <div class="course-seg">${segRows}</div>
      <div class="kv" style="margin-top:14px">
        <dt>剂量（原文）</dt><dd>${esc(INSTILLATION.doseRaw)} ${src('2021 灌注共识')}</dd>
        <dt>两次灌注间隔</dt><dd>${INSTILLATION.retentionMinutes ?? '<span class="verify-tag">来源待补</span>'}
          <span class="src">灌注后膀胱内保留时间：原文为图片，未取得，不给建议值</span></dd>
        <dt>BCG 供货</dt><dd>${INSTILLATION.supplyNote ? esc(INSTILLATION.supplyNote) : '<span class="src">本期无断供记录</span>'}</dd>
      </div>
      <p class="src" style="margin-top:10px">为什么分成两段：诱导期是<b>每周一次连续做</b>，维持期是<b>拉长间隔长期做</b>。
        这两段的节奏不一样，所以不能画成一串等距的点。</p>`)
      + card('全疗程事件', `
        <table class="tbl"><thead><tr><th>阶段</th><th>次序</th><th>计划日</th><th>实际日</th><th>结果</th><th>取消原因</th></tr></thead>
        <tbody>${INSTILLATION.events.map(evRow).join('')}</tbody></table>
        <p class="src" style="margin-top:10px">「计划中」表示还没到日子，不是已经定了。</p>`),
    '本次记录': () => card('最近一次：2026-10-23（取消）', `
      <div class="notice notice-info">
        <b>这次没做，是禁忌在保护你，不是病情变坏了。</b>
        记录到的原因：<b>肉眼血尿</b>。
      </div>
      <table class="tbl" style="margin-top:12px"><thead><tr><th>计划日</th><th>实际日</th><th>结果</th><th>取消原因</th><th>命中的禁忌条目</th></tr></thead><tbody>
        <tr><td>2026-10-23</td><td>—</td><td><span class="chip chip-warn">取消</span></td><td>肉眼血尿</td>
        <td>${(() => { const c = CONTRA.find((x) => x.kind === '肉眼血尿'); return c ? `<span class="chip chip-neutral">${esc(c.kind)}</span> <span class="src">${esc(c.group)}</span>` : '<span class="src">—</span>'; })()}</td></tr>
      </tbody></table>
      <p class="src" style="margin-top:10px">漏做一次之后<b>怎么补</b>，原始资料没有统一口径，因此这里不给任何建议。</p>`)
      + card('一次灌注要记的东西', `
        <table class="tbl"><thead><tr><th>时点</th><th>记什么</th><th>为什么</th></tr></thead><tbody>
          <tr><td>灌注前</td><td>今天的核对项：有没有肉眼血尿、有没有尿路感染症状、距上次手术多少天</td><td class="src">命中的话当天就不会做，提前知道比到了医院才知道好</td></tr>
          <tr><td>灌注中</td><td>药物名与剂量、灌注开始时间</td><td class="src">换药或换剂量时，后面看趋势才知道是从哪次变的</td></tr>
          <tr><td>灌注后</td><td>憋了多久、当天和接下来几天的排尿感受</td><td class="src">感受是你自己最清楚的部分，医生问诊时会用到</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">原型阶段这些是结构示例；正式版会按字段录入，并跟「副作用」页共用同一份记录。</p>`),
    '禁忌与中断': () => card('禁忌（原文条目）', `
      <table class="tbl"><thead><tr><th>条目</th><th>适用范围</th></tr></thead><tbody>
        ${CONTRA.map((c) => `<tr><td>${esc(c.kind)}</td><td><span class="chip ${c.group === '仅 BCG' ? 'chip-brand' : 'chip-neutral'}">${esc(c.group)}</span></td></tr>`).join('')}
      </tbody></table>
      <p class="src" style="margin-top:10px">${src('2021 非肌层浸润性膀胱癌膀胱灌注治疗专家共识')}。BCG 比化疗药多两条。</p>
      <div class="notice notice-info" style="margin-top:12px">命中禁忌条目时，这次灌注<b>不做</b>。
        工作台把它显示成「保护」而不是「失败」——同一个事实，两种说法对患者的感受完全不同。</div>`)
      + card('中断记录', `
        <table class="tbl"><thead><tr><th>日期</th><th>阶段 / 次序</th><th>原因</th><th>是否补做</th></tr></thead><tbody>
          <tr><td>2026-10-23</td><td>诱导 第 4 次</td><td>肉眼血尿</td><td><span class="src">未记录</span></td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">中断原因是一个可复用的目录（禁忌条目、感染、自行未到、供货问题、其他），
          这样统计「为什么老是做不完」才有可能，而不是一句自由文本。</p>`)
      + card('如果遇到 BCG 断供', `
        <p>BCG 的供应问题在共识里被明确提到过。这里会记录<b>从哪一次开始断、断了多久、医生给的替代安排</b>——
          它属于「疗程被打断」的事实，不该混进副作用里。</p>
        <p class="src" style="margin-top:8px">本演示档案没有断供记录，所以这家医院那条时间线上是空的。</p>`),
    '副作用': () => card('灌注后不适（自述）', `
      <table class="tbl"><thead><tr><th>日期</th><th>感受</th><th>强度（自评）</th><th>持续</th><th>操作</th></tr></thead><tbody>
        ${crudLive('sideEffect').map((s) => `<tr>
          <td>${esc(s.on)}</td><td>${esc(s.feel)}${Array.isArray(s._prev) && s._prev.length ? ' <span class="chip chip-neutral">已修改 · 原值保留</span>' : ''}</td>
          <td class="num">${esc(String(s.score))} / 10</td><td>${esc(s.days)}</td>
          <td>${rowActions('sideEffect', s)}</td>
        </tr>`).join('')}
      </tbody></table>
      ${voidedBlock('sideEffect')}
      <p class="src" style="margin-top:10px">分级判据原文为图片未取得，此处<b>不做分级</b>，只记自评强度。<span class="verify-tag">来源待补</span></p>`,
      `<button type="button" class="btn btn-sm" data-crud="new" data-kind="sideEffect" aria-label="记录一次灌注后不适">+ 记录一次</button>`)
      + card('这类不适，什么时候需要找人', `
        <div class="notice notice-warn">
          灌注后出现<b>发热寒战、并且持续不缓解</b>，或伴明显乏力、血压偏低 ——
          下面这几条是共识列出的<b>固定情形</b>，不是工作台替你判断出来的。
          工作台不给用药或自行处理的建议，只做转接：把这类情形指到「急症与安全」页的
          <b>BCG 全身感染</b>入口，由那里给出联系路径。
          <span class="verify-tag">判据来源待补</span>
        </div>
        <p class="src" style="margin-top:10px">原型阶段只给联系路径，不判断你的具体情况，也不给处置建议。
          分级表原文补齐后，这里会显示「对照哪一版共识 · 第几级」。</p>`),
    '应答与极高危': () => card('BCG 应答状态', `
      <div class="notice notice-info">
        「无应答」这四个字<b>是医生给出的判断</b>，不是你哪里没做好，也不是一句治疗评价。
        因此在工作台里，它<b>必须有医生原话才能存成这个状态</b>；没有原话时，这里只能停在「未判定」。
      </div>
      <dl class="kv" style="margin-top:12px">
        <dt>当前状态</dt><dd><span class="chip chip-warn">${esc(BCG_RESPONSE.status)}</span>
          <span class="src">未判定 ≠ 有应答，也 ≠ 无应答</span></dd>
        <dt>判定日期</dt><dd>${BCG_RESPONSE.judgedOn ? esc(BCG_RESPONSE.judgedOn) : '<span class="src">还没有记录</span>'}</dd>
        <dt>医生原话</dt><dd>${BCG_RESPONSE.doctorQuote ? esc(BCG_RESPONSE.doctorQuote) : '<span class="src">还没有记录</span>'}</dd>
        <dt>历史判定</dt><dd>${BCG_RESPONSE.history.length ? BCG_RESPONSE.history.map((h) => `<span class="chip">${esc(h)}</span>`).join(' ') : '<span class="src">暂无（判定会逐次追加，旧判定标「已被替代」，不删除）</span>'}</dd>
      </dl>
      <p class="src" style="margin-top:10px">这里<b>没有「设为无应答」的按钮</b>：判定不是患者能自己勾的选项。
        录入时只做一件事——把医生说的话照录下来，然后由医生确认这个状态。</p>`)
      + card('为什么要把这件事单独记一栏', `
        <p>因为「BCG 无应答」在权威共识里不是一句感慨，它<b>属于极高危的构成之一</b>，
        会直接影响后面怎么跟你谈（详见下一张卡）。</p>
        <p style="margin-top:8px">把它单独记下来，下一次复诊时你能说清三件事：
        什么时候医生说的、原话是什么、当时的复查结果是什么。这三件事实说清楚了，讨论才不用从头再问一遍。</p>
        <p class="src" style="margin-top:10px">工作台不判断「我还有多少保膀胱空间」——
        这要医生结合你的复查结果与病理来谈。</p>`)
      + card('极高危的构成（共识原文四项）', `
        <p>2024 版保膀胱共识在正文里直白列出了一组情形。原文照录：</p>
        <blockquote class="raw-quote">BCG 无应答、血管淋巴管侵犯、变异组织类型、前列腺尿道侵犯患者，应首选根治性膀胱切除术。</blockquote>
        <table class="tbl" style="margin-top:12px"><thead><tr><th>构成项</th><th>报告 / 医生有没有说过</th><th>一般在哪找</th></tr></thead><tbody>
          ${HIGH_RISK_MARKERS.map((m) => `<tr><td>${esc(m.key)}</td><td><span class="src">还没有记录</span></td><td class="src">${esc(m.note)}</td></tr>`).join('')}
        </tbody></table>
        <p class="src" style="margin-top:10px">
          ${src('2024 膀胱癌保膀胱治疗多学科诊治协作专家共识')}。这四项<b>一个都没有少</b>。
        </p>
        <div class="notice notice-warn" style="margin-top:12px">
          上表里的「还没有记录」<b>不等于「没有命中」</b>。没查过、和查过没有，是两件不同的事。
          工作台不会替你判断你命中了几项——那是医生看完报告要下的结论。
        </div>`),
  }[tab] || (() => '');
  return H('膀胱灌注', '两段结构（即刻 → 诱导 → 维持）；取消＝禁忌保护；漏做不给建议。')
    + tabsHTML('instillation') + body();
}

/* ================= 6. 尿流改道与造口 ================= */
function pageDiversion(tab) {
  /* 页签名与 DIVERSION.kind 不是同一套写法：页签叫「回肠造口」，
     资料里写的是「回肠通道造口（Bricker 术）」。这里显式映射，
     不做字符串包含判断 —— 否则换个写法就静默失配（曾经就踩过：
     MIBC 档案下反而显示「这里没有属于你的记录」）。 */
  const KIND_OF_TAB = {
    '回肠造口': '回肠通道造口',
    '原位新膀胱': '原位新膀胱',
    '输尿管皮肤造口': '输尿管皮肤造口',
  };
  const isMine = STATE.line === 'mibc' && DIVERSION_CASE.activeKind === tab;
  const caseInfo = DIVERSION_CASE.explain[tab];
  const sourceKind = KIND_OF_TAB[tab];

  const dailyCompare = `
    <table class="tbl">
      <thead><tr><th>术式</th><th>怎么排尿</th><th>要不要带袋子</th><th>要不要自己导尿</th><th>夜里</th></tr></thead>
      <tbody>
        <tr><td><b>回肠通道造口</b></td><td>腹壁造口，尿持续流到集尿袋</td><td>要，持续佩戴</td><td>一般不用</td><td>需要接夜间集尿器</td></tr>
        <tr><td><b>原位新膀胱</b></td><td>靠自己的尿道排</td><td>不用</td><td>排不干净时可能要用</td><td>可能漏尿，用尿垫</td></tr>
        <tr><td><b>输尿管皮肤造口</b></td><td>腹壁造口，尿流到集尿装置</td><td>要，持续佩戴</td><td>一般不用</td><td>需要接夜间集尿器</td></tr>
      </tbody>
    </table>
    <p class="src" style="margin-top:10px">这张表只描述「日常怎么过」，<b>不含任何优劣排序</b>。
      哪一种适合你，取决于病变范围、肾功能、身体条件和你自己的取舍，需要和医生按具体情况讨论。</p>`;

  const mineBlock = (kind) => {
    const rows = (DIVERSION_CASE.values[kind] || []);
    return statStrip([
      ['我的术式', esc(kind), '改动留痕，不覆盖'],
      ['手术日期', esc(DIVERSION_CASE.operatedOn), esc(DIVERSION_CASE.hospital)],
      ['已记录字段', `${rows.length} 项`, '按术式字段集'],
    ]) + card(`${kind} · 我的记录`, `
      <div class="notice notice-info">术式是<b>不可逆事实</b>：记成「我的术式」之后改动只追加版本、不覆盖，
        这样回看时才说得清「什么时候改的口径」。</div>
      <table class="tbl" style="margin-top:12px">
        <thead><tr><th>项目</th><th>现在的值</th><th>来源 / 备注</th></tr></thead>
        <tbody>${rows.map(([k, v, n]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td><td class="src">${esc(n)}</td></tr>`).join('')}</tbody>
      </table>
      <p class="src" style="margin-top:10px">来源：本人记录 · 未核对。字段集依据
        中国膀胱癌规范诊疗质量控制指标（2022 版）BT-16-01/02/03。</p>`);
  };

  const explainBlock = (kind) => card(`${kind} · 这个术式下会记什么`, `
    <div class="notice notice-info">
      ${isMine ? '' : `本演示档案采用的是 <b>${esc(DIVERSION_CASE.activeKind)}</b>，所以这里没有属于你的记录。<br>`}
      选择不同术式后，记录的字段<b>会跟着变</b>：新膀胱会长出控尿与残余尿，造口会长出底盘与渗漏。
    </div>
    <table class="tbl" style="margin-top:12px">
      <thead><tr><th>要记的字段</th><th>这是什么、为什么要记</th></tr></thead>
      <tbody>${(caseInfo || []).map(([k, why]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(why)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="btn-row" style="margin-top:14px">
      <button class="btn" data-act="setDiversion">把「${esc(kind)}」记录为我的术式（不可逆，改动留痕）</button>
    </div>
    <p class="src" style="margin-top:10px">来源：中国膀胱癌规范诊疗质量控制指标（2022 版）BT-16-01/02/03。</p>`);

  const perKindBody = () => {
    if (isMine) return mineBlock(tab) + card('换术式？', `
      <p>术式一旦记录，工作台不会让你「改一下」就当没发生过。要走的是
      <b>追加一条新版本并说明原因</b>，旧版本保留可查。</p>
      <p class="src" style="margin-top:8px">这是为极少数情况准备的（例如记录写错、或确实做了二次手术）。</p>`);
    return explainBlock(tab)
      + card('如果选了这一种，接下来会面对什么', `
        <p>${esc((DIVERSION.find((d) => d.kind === sourceKind) || {}).daily || '')}</p>
        <p class="src" style="margin-top:8px">这里只描述日常怎么过，不评价哪一种更好。
          需要比较时用「三术式对照」页，那里同样不排序、不推荐。</p>`);
  };

  let body;
  if (tab === '三术式对照') {
    body = card('三种术式对照', `
      <div class="notice notice-info"><b>这里不排序、不推荐、不用倾向色，也不预选任何一项。</b>哪一种更适合，需要你和医生按具体情况讨论。</div>
      <div style="margin-top:14px">${dailyCompare}</div>`)
      + card('各自的字段集（记录时长的不是一回事）', `
        <div class="compare" style="margin-top:4px">
          ${DIVERSION.map((d) => `
            <div class="compare-col">
              <div class="cc-head"><h3>${esc(d.kind)}</h3><span class="chip chip-neutral">${esc(d.aka)}</span></div>
              <p style="font-size:var(--fs-md);color:var(--wb-muted);margin-bottom:8px">${esc(d.daily)}</p>
              <ul>${d.fields.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
            </div>`).join('')}
        </div>`)
      + card('术式讨论记录（零倾向）', `
        <div class="notice notice-info">这里只记「医生和你讨论过哪几种术式、你当时问了什么」，<b>不记「你倾向哪一种」</b>，也不打分。</div>
        <table class="tbl" style="margin-top:14px">
          <thead><tr><th>术式</th><th>门诊讨论过</th><th>当时的问题</th><th>日期</th></tr></thead>
          <tbody>
            ${DIVERSION.map((d, i) => `<tr>
              <td>${esc(d.kind)}</td>
              <td><label class="chip chip-neutral" style="cursor:pointer">
                <input type="checkbox" ${i === 0 ? 'checked' : ''} aria-label="${esc(d.kind)} 是否讨论过">讨论过</label></td>
              <td>${i === 0 ? '造口以后还能不能回去上班、要不要一直带着袋子？' : '<span style="color:var(--wb-ghost)">还没有写下问题</span>'}</td>
              <td>${i === 0 ? '2026-10-15' : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <p class="src" style="margin-top:10px">来源：本人的门诊经过 · 未核对。术式一旦记成「我的术式」按<b>不可逆事实</b>处理，之后改动只追加版本、不覆盖（见 docs/SCHEMA.md ADR-03）。</p>`);
  } else if (tab === '造口日记') {
    const liveLog = crudLive('stomaLog');
    body = statStrip([
      ['近 30 天更换底盘', `${liveLog.reduce((a, l) => a + Number(l.changes || 0), 0)} 次`, '按批次加总'],
      ['近 30 天渗漏', `${liveLog.reduce((a, l) => a + Number(l.leaks || 0), 0)} 次`, '次数 ≠ 严重程度'],
      ['皮肤发红批次', `${liveLog.filter((l) => l.skin === '红').length} 批`, '按批次算'],
      ['记法', '一次录一批', '不需要每天打卡'],
    ]) + card('造口日记（一次录一批）', `
      <div class="notice notice-info">按<b>一批</b>记录，不需要每天打卡。耗材型号从目录里选，不用每次重打。</div>
      <div class="batch-row" style="margin-top:14px">
        <label class="bf"><span>批次日期</span><input type="date" id="stomaOn" value="2026-10-23" aria-label="批次日期"></label>
        <label class="bf"><span>耗材</span><select id="stomaSupply" aria-label="耗材">${STOMA_SUPPLY.map((s) => `<option value="${esc(s.id)}">${esc(s.kind)} · ${esc(s.brand)}</option>`).join('')}</select></label>
        <label class="bf"><span>更换次数</span><input type="number" id="stomaChanges" value="2" min="0" aria-label="更换次数"></label>
        <label class="bf"><span>渗漏次数</span><input type="number" id="stomaLeaks" value="1" min="0" aria-label="渗漏次数"></label>
        <label class="bf"><span>皮肤状态</span><select id="stomaSkin" aria-label="皮肤状态"><option>无</option><option selected>红</option><option>破溃</option><option>其他</option></select></label>
        <button class="btn btn-primary" data-act="batchAdd" aria-label="把这一批加入造口日记">加入本批</button>
      </div>
      <table class="tbl" style="margin-top:14px"><thead><tr><th>批次</th><th>耗材</th><th class="num">更换</th><th class="num">渗漏</th><th>皮肤</th><th>操作</th></tr></thead><tbody>
        ${liveLog.map((l) => `<tr><td>${esc(l.batchOn)}${Array.isArray(l._prev) && l._prev.length ? ' <span class="chip chip-neutral">已修改 · 原值保留</span>' : ''}</td><td>${esc(l.supplyId === 's1' ? '底盘 · 演示A' : l.supplyId)}</td>
          <td class="num">${l.changes}</td><td class="num">${l.leaks}</td><td>${esc(l.skin)}</td>
          <td>${rowActions('stomaLog', l)}</td></tr>`).join('')}
      </tbody></table>
      ${voidedBlock('stomaLog')}`)
    + `<div class="cols-2" style="margin-top:16px">
        ${card('最近 30 天小结（只数次数，不判断好坏）', `
          <table class="tbl">
            <thead><tr><th>项目</th><th class="num">次数</th><th>怎么来的</th></tr></thead>
            <tbody>
              <tr><td>更换底盘</td><td class="num">${liveLog.reduce((a, l) => a + Number(l.changes || 0), 0)}</td><td>把上面每一批的次数加总</td></tr>
              <tr><td>发生渗漏</td><td class="num">${liveLog.reduce((a, l) => a + Number(l.leaks || 0), 0)}</td><td>同上；渗漏<b>次数</b>不等于严重程度</td></tr>
              <tr><td>皮肤发红</td><td class="num">${liveLog.filter((l) => l.skin === '红').length}</td><td>按批次数到「红」的批数</td></tr>
            </tbody>
          </table>
          <p class="src" style="margin-top:10px">这是<b>计数</b>，不是评价。什么算「多」要问造口治疗师，工作台不设阈值。</p>`)}
        ${card('造口对生活的影响（只记事实）', `
          <table class="tbl">
            <thead><tr><th>场景</th><th>现在的情况</th><th>下次想问 / 想解决</th></tr></thead>
            <tbody>
              <tr><td>洗澡</td><td>可以直接冲，底盘不揭</td><td><input type="text" placeholder="还没有写" aria-label="洗澡想解决的问题"></td></tr>
              <tr><td>穿衣</td><td>宽松上衣看不出来</td><td><input type="text" placeholder="还没有写" aria-label="穿衣想解决的问题"></td></tr>
              <tr><td>出门 / 过安检</td><td>还没有试过</td><td><input type="text" placeholder="还没有写" aria-label="出门想解决的问题"></td></tr>
              <tr><td>夜间集尿</td><td>起夜 2 次</td><td><input type="text" placeholder="还没有写" aria-label="夜间集尿想解决的问题"></td></tr>
              <tr><td>气味</td><td>换袋后基本没有</td><td><input type="text" placeholder="还没有写" aria-label="气味想解决的问题"></td></tr>
            </tbody>
          </table>
          <p class="src" style="margin-top:10px">来源：本人的记录 · 未核对。饮食与气味的具体忌口<b>原文未取得</b>，本页不写。</p>`)}
      </div>`;
  } else if (tab === '耗材目录') {
    body = card('可复用耗材目录', `
      <div class="notice notice-info">型号在这里维护一次，之后每次记录<b>从目录里选</b>，不用重复打字。
        名称与型号用演示占位，正式版由你自己填。</div>
      <table class="tbl" style="margin-top:12px"><thead><tr><th>类别</th><th>品牌 / 型号</th><th>规格</th><th class="num">常用更换周期（天）</th><th>状态</th></tr></thead><tbody>
        ${STOMA_SUPPLY.map((s) => `<tr><td>${esc(s.kind)}</td><td>${esc(s.brand)}</td><td>${esc(s.size)}</td><td class="num">${s.interval}</td>
          <td><span class="chip chip-ok">在用</span></td></tr>`).join('')}
      </tbody></table>`)
      + card('尺寸为什么会变', `
        <p>造口不是一开始多大就一直是多大。术后一段时间内尺寸会变，所以这里记的是
        <b>每次量到的尺寸</b>，而不是给一个固定值——用旧的尺寸裁底盘，就会出现渗漏和皮肤发红。</p>
        <table class="tbl" style="margin-top:12px"><thead><tr><th>日期</th><th>量到的尺寸</th><th>当时用的底盘</th><th>备注</th></tr></thead><tbody>
          <tr><td>2026-06-25</td><td>52 mm</td><td>演示A · 55 mm</td><td class="src">术后早期</td></tr>
          <tr><td>2026-07-02</td><td>42 mm</td><td>演示A · 45 mm</td><td class="src">换小一号后渗漏减少</td></tr>
          <tr><td>2026-09-30</td><td>42 mm</td><td>演示A · 45 mm</td><td class="src">近一次</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">来源：本人记录 · 未核对。多久量一次、用什么量，
          以造口治疗师给你的做法为准，工作台不给标准。</p>`)
      + card('更换与库存记录', `
        <table class="tbl"><thead><tr><th>日期</th><th>动作</th><th>耗材</th><th class="num">数量</th><th>备注</th></tr></thead><tbody>
          <tr><td>2026-10-20</td><td>更换底盘</td><td>底盘 · 演示A 45 mm</td><td class="num">2</td><td class="src">当批渗漏 1 次</td></tr>
          <tr><td>2026-10-13</td><td>更换底盘</td><td>底盘 · 演示A 45 mm</td><td class="num">2</td><td class="src">皮肤无异常</td></tr>
          <tr><td>2026-10-06</td><td>领用</td><td>造口袋 · 演示A 标准</td><td class="num">30</td><td class="src">一个月量</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">库存与领用放在一起记，是为了在「快用完了」之前有准备，
          避免临时换型号又带来一轮皮肤问题。预警阈值由你自己设，工作台不预设。</p>`);
  } else {
    body = perKindBody();
  }

  const priv = (tab === '造口日记' || tab === '回肠造口')
    ? `<div class="private-zone" style="margin-top:16px">
         <span class="pz-tag">默认私密（fail-closed）：身体形象相关记录默认不进导出、不进 AI 草稿。</span>
       </div>` : '';

  return H('尿流改道与造口', '三术式各自独立；不可逆事实改动留痕；对照页零倾向。')
    + tabsHTML('diversion') + body + priv;
}

/* ================= 7. 治疗历程 ================= */
function pageTreatment(tab) {
  const C = TREATMENT_CASE[STATE.line === 'mibc' ? 'mibc' : 'nmibc'];
  const running = C.lines.filter((l) => l.status === '进行中').length;

  const linesBody = () => card('治疗线（是一个容器，不是属性）', `
    <div class="notice notice-info">「一线、二线」说的是<b>第几套方案</b>，不是病情轻重。
    换线时上一线的周期、疗效、不良事件<b>整体留在原地</b>，不会被覆盖。</div>
    ${statStrip([
      ['已记录线数', `${C.lines.length} 线`, running ? `${running} 线进行中` : '暂无进行中'],
      ['当前方案', (C.lines.find((l) => l.status === '进行中') || {}).regimen || C.lines[C.lines.length - 1].regimen,
       (C.lines.find((l) => l.status === '进行中') || {}).from || ''],
      ['挂载记录', C.lines.map((l) => l.mounted).filter((m) => m !== '—').length + ' 组', '周期 / 疗效 / 不良事件'],
    ])}
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>线次</th><th>方案</th><th>开始</th><th>结束</th><th>状态</th><th>为什么这样安排</th><th>挂载</th>
    </tr></thead><tbody>
      ${C.lines.map((l) => `<tr>
        <td>${esc(l.no)}</td><td>${esc(l.regimen)}</td>
        <td>${l.from ? esc(l.from) : '<span class="src">—</span>'}</td>
        <td>${l.to ? esc(l.to) : '<span class="src">—</span>'}</td>
        <td>${l.status === '进行中' ? `<span class="chip chip-brand">${esc(l.status)}</span>` : chipCat(l.status)}</td>
        <td>${esc(l.why)}</td><td class="src">${esc(l.mounted)}</td>
      </tr>`).join('')}
    </tbody></table>
    ${collapsible('为什么「线」要单独做成一层', `
      <p>因为治疗会换方案，但每一次换都发生在<b>上一次的结果之上</b>。如果直接把方案当患者属性，
      换线时旧数据要么被覆盖，要么散落各处对不上。</p>
      <p>做成容器之后：切到二线，一线的灌注记录、当时的疗效评估、出现过的不良事件都还在原来那条线上，
      回看时能说清「为什么换」。</p>`)}`);

  const drugsBody = () => card('用药与周期', `
    <table class="tbl"><thead><tr>
      <th>药物</th><th>单次剂量</th><th>途径</th><th>计划节奏</th><th>已完成</th><th>下次</th><th>剂量来源</th>
    </tr></thead><tbody>
      ${C.drugs.map((d) => `<tr>
        <td>${esc(d.name)}</td><td>${esc(d.dose)}</td><td>${esc(d.route)}</td>
        <td>${esc(d.plan)}</td><td class="num">${esc(d.done)}</td>
        <td>${d.next === '已结束' ? '<span class="src">已结束</span>' : esc(d.next)}</td>
        <td class="src">${esc(d.src)}</td>
      </tr>`).join('')}
    </tbody></table>
    <p class="src" style="margin-top:10px">写「待核验」的剂量，表示本机资料里没有查到原文出处。
    <b>没有出处就不编一个数字。</b>实际剂量一律以医嘱与方案原文为准。</p>
    ${collapsible('膀胱灌注和静脉化疗不是一回事', `
      <table class="tbl"><thead><tr><th></th><th>膀胱灌注</th><th>静脉化疗</th></tr></thead><tbody>
        <tr><td>药到哪里</td><td>只进膀胱，靠憋尿让药泡着膀胱壁</td><td>进全身血流</td></tr>
        <tr><td>常见感受</td><td>尿频、尿急、尿痛、血尿；BCG 还可能发烧</td><td>乏力、恶心、血象下降</td></tr>
        <tr><td>记录重点</td><td>憋了多久、有没有尿出去、灌注后当天的情况</td><td>第几天打、打之前的血象与肾功能</td></tr>
      </tbody></table>
      <p class="src">所以这两类在界面上用<b>不同的记录模板</b>：字段集不一样，不能共用一张表单。</p>`)}`);

  const evalBody = () => card('疗效评估', `
    <div class="notice notice-info">评估结论<b>照抄医生给的原文</b>，工作台不做换算、不推算变化趋势。</div>
    ${C.evals.length ? `
      <table class="tbl" style="margin-top:12px"><thead><tr><th>日期</th><th>怎么评的</th><th>结论（原文）</th><th>备注</th></tr></thead><tbody>
        ${C.evals.map((e) => `<tr><td>${esc(e.on)}</td><td>${esc(e.how)}</td><td>${esc(e.result)}</td><td class="src">${esc(e.note)}</td></tr>`).join('')}
      </tbody></table>` : `
      <div class="empty" style="margin-top:12px"><strong>还没有评估记录</strong>
      等复查之后，把医生给的结论原文记进来。这里不会替你推算「有效没效」。</div>`}
    ${collapsible('「有没有效」是靠哪几件事看出来的', `
      <table class="tbl"><thead><tr><th>方式</th><th>能看到什么</th><th>看不到什么</th></tr></thead><tbody>
        <tr><td>膀胱镜</td><td>膀胱内壁有没有长东西、原来的位置怎么样了</td><td>肌肉层里面、膀胱外面</td></tr>
        <tr><td>尿细胞学</td><td>尿里有没有异常的细胞</td><td>异常细胞从哪来、有多少</td></tr>
        <tr><td>影像</td><td>膀胱壁厚度、上尿路、淋巴结、远处器官</td><td>细胞层面的变化</td></tr>
        <tr><td>取组织做病理</td><td>到底是不是癌、有没有浸润肌层</td><td>需要先取到组织才能做</td></tr>
      </tbody></table>
      <p class="src">四件事各答一半的问题，所以医生通常不会只靠一件。这也是为什么复查页把它们排在一起。</p>`)}`);

  const renalBody = () => {
    const pts = RENAL.points;
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : null;
    const delta = prev ? last.egfr - prev.egfr : null;
    return card('肾功能与顺铂门槛', `
      ${statStrip([
        ['最近 eGFR', `${last.egfr} ml/min/1.73m²`, `${esc(last.date)} · ${esc(last.method)}`],
        ['与上次比', delta == null ? '—' : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)}`,
         prev ? `上次 ${prev.egfr}（${esc(prev.date)}）` : ''],
        ['顺铂门槛', 'CrCl＜60 或 eGFR ≤60', '见下方出处'],
        ['分肾核素肾图', RENAL.split ? `左 ${RENAL.split.left}% / 右 ${RENAL.split.right}%` : '未记录',
         RENAL.split ? `${esc(RENAL.split.on)} · ${esc(RENAL.split.method)}` : ''],
      ])}
      <h3 style="margin-top:16px">肾功能趋势</h3>
      <table class="tbl"><thead><tr><th>日期</th><th class="num">eGFR</th><th class="num">肌酐</th><th>方法</th><th>与门槛的位置</th></tr></thead><tbody>
        ${pts.map((p) => `<tr><td>${esc(p.date)}</td><td class="num">${p.egfr}</td><td class="num">${p.creatinine}</td>
          <td>${esc(p.method)}</td>
          <td>${p.egfr > 60 ? `高于门槛 ${(p.egfr - 60).toFixed(0)}` : `低于门槛 ${(60 - p.egfr).toFixed(0)}`}</td></tr>`).join('')}
      </tbody></table>
      <div class="notice notice-warn" style="margin-top:12px">
        门槛：<b>${esc(RENAL.threshold.text)}</b> ${src(RENAL.threshold.source)}
        <div style="margin-top:6px" class="src">这里只显示门槛与出处，<b>不判断你应该用或不应该用哪个方案</b>。
        这条线划在哪里、要不要换药，是医生结合全部情况定的。</div>
      </div>
      ${collapsible('为什么膀胱癌要一直盯着肾功能', `
        <p>三件事都跟肾有关：</p>
        <ul>
          <li><b>有些药要靠肾排出去</b>——肾功能不够就上不了，比如顺铂。</li>
          <li><b>尿路可能被堵住</b>——肿瘤压到或治疗后狭窄，尿排不出去会反过来伤肾。</li>
          <li><b>改道之后肾更辛苦</b>——尿的出路变了，长期要盯着电解质和肾功能。</li>
        </ul>
        <p class="src">所以肾功能不是「顺便查一下」，它是决定后面能走哪条路的硬门槛。</p>`)}
      ${collapsible('分肾核素肾图是干什么的', `
        <p>普通的血肌酐和 eGFR 只能告诉你<b>两个肾加起来</b>的总体水平，看不出是哪一侧在拖后腿。</p>
        <p>核素肾图分别测左右两肾各自的功能占比。一侧明显偏低时，
        「要不要放支架、能不能做某些治疗」的判断依据就完全不同。</p>
        <p class="src">本演示档案：${RENAL.split ? `左 ${RENAL.split.left}% / 右 ${RENAL.split.right}%（${esc(RENAL.split.on)} · 演示值）` : '未记录'}。</p>`)}
      <h3 style="margin-top:16px">可以问医生的问题</h3>
      ${qlist([
        '现在的肾功能，还能不能用顺铂？',
        '如果不能用顺铂，替代方案对效果影响有多大？',
        '肾功能往下走，是治疗引起的还是别的原因？',
        '要不要做一次分肾核素肾图？',
      ])}`);
  };

  const body = { '治疗线': linesBody, '用药与周期': drugsBody, '疗效评估': evalBody, '肾功能门槛': renalBody }[tab] || (() => '');
  return H('治疗历程', '治疗线是容器不是属性；换线不覆盖旧数据；评估结论照抄不换算。')
    + tabsHTML('treatment') + body();
}

/* ================= 8. 复查与膀胱镜 ================= */
function pageFollowup(tab) {
  const f = FOLLOWUP;
  const lastCx = f.cytology[0];
  const body = {
    '复查排程': () => statStrip([
      ['下次膀胱镜', esc(f.lastExam.nextPlannedOn), '尿细胞学同次送检'],
      ['上次结果', 'T1', '高级别尿路上皮癌'],
      ['间隔口径', '每 3 个月', '2022 版共识'],
      ['上尿路影像', '每 6～12 个月', '另排一次'],
    ]) + card('复查排程', `
      <table class="tbl"><thead><tr><th>项目</th><th>计划日期</th><th>间隔口径（带版本）</th></tr></thead><tbody>
        ${f.schedule.map((s) => `<tr><td>${esc(s.kind)}</td><td>${esc(s.planned)}</td><td>${esc(s.intervalSource)}</td></tr>`).join('')}
      </tbody></table>
      <div class="notice notice-info" style="margin-top:12px">
        间隔数字来自 <b>2022 版</b>共识；<b>2024 版不再复述</b>具体间隔。本工作台<b>不写「终身」</b>——
        已精读的 11 份中文共识中未出现该表述。
      </div>`)
      + card('复查节奏分三段看', `
        <table class="tbl"><thead><tr><th>术后时间</th><th>建议间隔</th><th>大致包含什么</th></tr></thead><tbody>
          <tr><td>2 年以内</td><td><b>每 3 个月</b></td><td>B 超 + 胸片 + 膀胱镜</td></tr>
          <tr><td>2 ～ 5 年</td><td><b>每 6 个月</b></td><td>同上</td></tr>
          <tr><td>5 年以后</td><td><b>每年</b></td><td>同上</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">来源：患者科普问答原文。这段节奏是<b>术后按年数分段的</b>，
          所以工作台按你手术日期自动落在哪一段，而不是给一个统一频率。</p>`),
    '本次记录': () => card('最近一次膀胱镜：2026-09-18', `
      <dl class="kv">
        <dt>日期</dt><dd>${esc(f.lastExam.performedOn)}</dd>
        <dt>方式</dt><dd>${esc(f.lastExam.modality)}</dd>
        <dt>发现（原文）</dt><dd>${esc(f.lastExam.findingRaw)}</dd>
        <dt>结论（原文）</dt><dd>${esc(f.lastExam.conclusionRaw)}</dd>
        <dt>是否取活检</dt><dd>${esc(f.lastExam.biopsyTaken)}</dd>
        <dt>下次计划</dt><dd>${esc(f.lastExam.nextPlannedOn)}</dd>
      </dl>
      <blockquote class="raw-quote">${esc(f.lastExam.conclusionRaw)}</blockquote>
      <p class="src" style="margin-top:10px">检查结论与病理结论分开放：膀胱镜下看到什么，和切下来化验出什么，
        是两件事，可能不一致。</p>`)
      + card('和上一次比', `
        <table class="tbl"><thead><tr><th>日期</th><th>镜下发现</th><th>取活检</th><th>当时的结论</th></tr></thead><tbody>
          <tr><td>2026-09-18</td><td>右侧壁乳头状新生物，已电切</td><td>是</td><td>高级别尿路上皮癌，T1，未见肌层组织</td></tr>
          <tr><td>2026-06-12</td><td class="src">未见明确新生物</td><td>否</td><td class="src">未见瘤细胞</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">把两次并排看，是为了在门诊能说清「这次和上次有什么不一样」，
          而不是替医生判断变化意味着什么。</p>`),
    '方式与麻醉': () => card('方式与麻醉（本次）', `
      <dl class="kv">
        <dt>镜体</dt><dd>硬性膀胱镜</dd>
        <dt>麻醉</dt><dd>腰麻</dd>
        <dt>日期</dt><dd>${esc(f.lastExam.performedOn)}</dd>
      </dl>`)
      + card('这些选项各是什么意思', `
        <table class="tbl"><thead><tr><th>项目</th><th>可选值</th><th>影响什么</th></tr></thead><tbody>
          <tr><td>镜体</td><td>硬性 / 柔性</td><td class="src">柔性镜通常更细，检查过程的不适感往往更轻</td></tr>
          <tr><td>麻醉</td><td>局部 / 腰麻 / 全身</td><td class="src">决定当天能不能自己回家、多久能恢复</td></tr>
          <tr><td>荧光膀胱镜</td><td>用 / 不用</td><td class="src">一种辅助看清病变的方式，是否使用由医院条件与医生判断决定</td></tr>
          <tr><td>是否取活检</td><td>是 / 否</td><td class="src">取了活检就要等病理，结论会晚几天出来</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">记录方式与麻醉，是为了下次能提前知道自己会经历什么，
          也方便和医生讨论能不能换成更舒服的做法。</p>`),
    '疼痛与心情': () => card('疼痛与心情（与临床结论分区）', `
      <div class="notice notice-info">这一块是<b>你的感受</b>，和临床结论分开存放，不会混进结论区，
        也不会被当成「病情变化」。</div>
      <table class="tbl" style="margin-top:12px"><thead><tr><th>日期</th><th class="num">疼痛自评</th><th>心情记录</th></tr></thead><tbody>
        <tr><td>2026-09-18</td><td class="num">6 / 10</td><td>检查前一周睡不好；这次麻醉后恢复比上次快</td></tr>
        <tr><td>2026-06-12</td><td class="num">4 / 10</td><td>检查前一晚没睡好</td></tr>
      </tbody></table>
      <p class="src" style="margin-top:10px">为什么把它放在复查页而不是「心理」页：
        检查本身就是一个会被记住的事件，下次检查前的紧张会受上一次体验影响，记下来才有对照。</p>
      <div class="private-zone" style="margin-top:14px"><span class="pz-tag">默认私密：本块默认不带入导出与 AI 草稿。</span></div>`),
    '尿细胞学': () => card('尿细胞学（四态四个值）', `
      <div class="notice notice-info">
        <b>阴性 / 非典型 / 可疑 / 阳性</b> 是四个不同的值。<b>「非典型」既不等于阳性，也不等于阴性。</b>
        这四态都不带「好/坏」颜色。
      </div>
      <table class="tbl" style="margin-top:12px"><thead><tr><th>日期</th><th>标本类型</th><th>结果</th><th>报告原文</th><th>方法</th></tr></thead><tbody>
        ${f.cytology.map((c) => `<tr><td>${esc(c.date)}</td><td>${esc(c.specimen)}</td><td>${chipCat(c.state)}</td>
          <td>${esc(c.raw)}</td><td>${esc(c.method)}</td></tr>`).join('')}
      </tbody></table>
      <p class="src" style="margin-top:10px">标本类型（自然尿 / 膀胱冲洗）不同时，结果不直接可比。
        四态的权威分级口径<b>尚未取得</b>。<span class="verify-tag">来源待补</span></p>`)
      + card('四个值分别是什么意思', `
        <table class="tbl"><thead><tr><th>结果</th><th>字面意思</th><th>它不表示什么</th></tr></thead><tbody>
          <tr><td>${chipCat('阴性')}</td><td>这次标本里没有查到瘤细胞</td><td class="src">不等于「一定没有病」</td></tr>
          <tr><td>${chipCat('非典型')}</td><td>细胞长得不太典型，但看不出明确是瘤细胞</td><td class="src"><b>既不是阳性也不是阴性</b>，常需要复查或进一步检查</td></tr>
          <tr><td>${chipCat('可疑')}</td><td>有倾向但不确凿</td><td class="src">不等于确诊</td></tr>
          <tr><td>${chipCat('阳性')}</td><td>查到考虑为瘤细胞</td><td class="src">仍需结合膀胱镜与病理</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">为什么要分成四个值：如果只写成「有 / 没有」，
          「非典型」这种最让人焦虑、也最需要复查的结果就会被压成一句话，患者看不懂自己处在哪一档。</p>`)
      + card('其他尿检标志物', `
        <table class="tbl"><thead><tr><th>项目</th><th>状态</th><th>说明</th></tr></thead><tbody>
          <tr><td>尿细胞学</td><td><span class="chip chip-ok">已记录</span></td><td class="src">本页上方</td></tr>
          <tr><td>FISH</td><td><span class="chip chip-neutral">还没有记录</span></td><td class="src">位置已留</td></tr>
          <tr><td>NMP22 / BTA</td><td><span class="chip chip-neutral">还没有记录</span></td><td class="src">位置已留</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">这些检查各自的判读口径与适用条件<b>原文未取得</b>，
          所以只留位置，不写参考值，也不解释「高了代表什么」。<span class="verify-tag">来源待补</span></p>`),
    '上尿路监测': () => card('上尿路监测（第二原发监测）', `
      <div class="notice notice-info">这是对<b>另一个器官</b>的长期监测，不是「转移」。两者分开呈现。</div>
      <table class="tbl" style="margin-top:12px"><thead><tr><th>日期</th><th>方式</th><th>发现（原文）</th><th>肾积水</th></tr></thead><tbody>
        ${f.upperTract.map((u) => `<tr><td>${esc(u.date)}</td><td>${esc(u.modality)}</td><td>${esc(u.findingRaw)}</td><td>${esc(u.hydronephrosis)}</td></tr>`).join('')}
      </tbody></table>
      <p class="src" style="margin-top:10px">我国尿路上皮癌来自肾盂及输尿管的比例可达 20%～30%。
        ${src('中国尿路上皮癌 HER2 检测临床病理专家共识（2021 版）')}</p>`)
      + card('为什么要盯着另外两个器官', `
        <p>膀胱、肾盂、输尿管的内壁是同一层细胞（尿路上皮）。所以这条线要盯的不只是膀胱，
        还有<b>上尿路</b>——这也是膀胱癌和大多数癌种不一样的地方：治完一处，还要长期看另一处。</p>
        <table class="tbl" style="margin-top:12px"><thead><tr><th>看什么</th><th>怎么看</th><th>多久一次</th></tr></thead><tbody>
          <tr><td>上尿路形态</td><td>CT 尿路造影 / 超声等影像</td><td>每 6～12 个月</td></tr>
          <tr><td>有没有肾积水</td><td>随影像一起看</td><td>同上</td></tr>
          <tr><td>肾功能</td><td>血肌酐 / eGFR</td><td>随复查一起验</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">间隔数字来自 2022 版共识口径。这里只记事实，
          不判断影像上的变化是好是坏——那是医生的事。</p>`),
  }[tab] || (() => '');
  return H('复查与膀胱镜', '检查即心理事件；尿细胞学四态；上尿路是第二原发监测。')
    + tabsHTML('followup') + body;
}

/* ================= 9. 检查与指标 ================= */
function pageMetrics(tab) {
  const cats = [...new Set(METRICS.map((m) => m.cat))];
  const total = METRICS.reduce((a, m) => a + m.points.length, 0);

  const overviewBody = () => card('指标总览（与一图秀同源）', `
    <div class="notice notice-info">同一份指标目录供<b>指标卡、一图秀、复诊摘要</b>共用。
    分组名、顺序、项数在指标页与一图秀必须完全一致 —— 对不上说明有人各写了一套。</div>
    ${statStrip([
      ['指标项', `${METRICS.length} 项`, `${cats.length} 个分组`],
      ['检测记录', `${total} 条`, `最近 ${esc(METRICS.flatMap((m) => m.points.map((p) => p.d)).sort().pop())}`],
      ['启用分级', `${METRICS.filter((m) => m.ctcae).length} 项`, '对照 CTCAE v5.0'],
      ['未启用分级', `${METRICS.filter((m) => !m.ctcae).length} 项`, '「×ULN」型等，不近似'],
    ])}
    <div class="btn-row" style="margin:12px 0">
      ${cats.map((c) => `<span class="chip chip-cat">${esc(c)} · ${METRICS.filter((m) => m.cat === c).length} 项</span>`).join('')}
    </div>
    <table class="tbl"><thead><tr>
      <th>分组</th><th>指标</th><th class="num">最近值</th><th>单位</th><th>日期</th><th>分级（对照，不是诊断）</th>
    </tr></thead><tbody>
      ${METRICS.map((m) => {
        const last = m.points[m.points.length - 1];
        return `<tr><td><span class="chip chip-cat">${esc(m.cat)}</span></td><td>${esc(m.name)}</td>
          <td class="num">${CHART.fmt(last.v)}</td><td>${esc(m.unit)}</td><td>${esc(last.d)}</td>
          <td>${m.ctcae ? `<span class="chip chip-warn">${esc(m.ctcae.text)}</span>` : '<span class="src">未启用</span>'}</td></tr>`;
      }).join('')}
    </tbody></table>
    ${collapsible('「分级」为什么写「对照」而不是「诊断」', `
      <p>因为工作台只做一件事：把报告上的数字，跟 CTCAE v5.0 里写死的阈值比一下，然后告诉你落在第几级。</p>
      <p>它<b>不知道</b>你为什么是这个数、有没有别的病、医生会不会按这个处理。所以徽章写的是
      「对照 CTCAE v5.0 · N 级」，并且必须同时给出<b>区间与出处</b>。</p>
      <p class="src">分级结果是<b>派生值</b>：读取时现算，<b>不落库</b>。标准换版本时，
      旧记录会自动按新标准重算 —— 不会出现「库里存着一份算好的旧结果」。</p>`)}
    ${collapsible('只对有绝对数值界限的项目启用分级', `
      <table class="tbl"><thead><tr><th>标准里的写法</th><th>能不能用</th><th>为什么</th></tr></thead><tbody>
        <tr><td>「＜ 3.0 ×10⁹/L」</td><td><b>能用</b></td><td>有绝对数值和单位，直接比</td></tr>
        <tr><td>「＞ 3 × ULN」</td><td><b>不用</b></td><td>要先拿到该机构的结构化参考范围上限。没拿到就不启用，也不拿 3 倍去凑</td></tr>
        <tr><td>「轻度 / 中度」这类</td><td><b>不用</b></td><td>标准里没有数值界限，靠描述会各人各判</td></tr>
      </tbody></table>
      <p class="src">标准原文随包放在 <code>assets/reference/ctcae/</code>，界面给普通链接，不做内嵌预览。</p>`)}
    ${collapsible('同一项指标，「没有」有六种，不能混', `
      <table class="tbl"><thead><tr><th>状态</th><th>含义</th></tr></thead><tbody>
        <tr><td>未检测</td><td>这次没做这项检查</td></tr>
        <tr><td>未检出</td><td>做了，但没测到（可能低于检出限）</td></tr>
        <tr><td>阴性</td><td>做了，结果是正常范围</td></tr>
        <tr><td>失败</td><td>做了，但标本或仪器出问题，结果不用</td></tr>
        <tr><td>待出</td><td>做了，报告还没拿到</td></tr>
        <tr><td>意义未明</td><td>出了结果，但结论不能定性</td></tr>
      </tbody></table>
      <p class="src">这六种在界面和数据库里都是<b>独立的值</b>。
      混成一个「无」，等于把「没查」读成了「正常」。</p>`)}
    ${collapsible('单位为什么要存两份', `
      <p>报告导出的单位常带 LaTeX 外壳，比如 <code>$10^9/L$</code>。
      如果直接拿它当键去比较，同一个单位会变成两种，白白多出一个「可比组」。</p>
      <p>所以先剥外壳得到 <code>10⁹/L</code> 作为归一值用于比较，
      <b>原样值仍然保留</b>，回看时能跟报告一字对上。</p>`)}`);

  const cardBody = () => {
    const lastD = METRICS.flatMap((m) => m.points.map((p) => p.d)).sort().pop();
    const split = METRICS.filter((m) => CHART.groupsOf && CHART.groupsOf(m).length > 1);
    return `<div class="strip" style="margin-bottom:16px">
        <div class="strip-main">
          <div class="strip-head">${METRICS.length} 项指标 · ${cats.length} 个分组 · ${total} 条记录 · 最近更新 ${esc(lastD)}</div>
          <div class="strip-note">分组顺序与「病情一图秀」同一来源，两页一致。
            ${split.length ? `其中 <b>${split.map((m) => esc(m.name)).join('、')}</b> 的机构或方法中途变过，已拆成不同<b>可比组</b>，不跨组连线。`
              : '全部指标机构与方法一致。'}</div>
        </div>
        <div class="strip-actions"><button type="button" class="btn" data-goto="chart">打开一图秀</button></div>
      </div>
      ${cats.map((c) => {
        const inCat = METRICS.filter((m) => m.cat === c);
        return `<section class="metric-group" data-group="${esc(c)}">
          <h3 class="mg-title">${esc(c)}<span class="mg-count">${inCat.length} 项</span></h3>
          <div class="metric-grid" data-metric-grid>${inCat.map((m) => metricCardHTML(m, METRICS.indexOf(m))).join('')}</div>
        </section>`;
      }).join('')}
      <p class="src" style="margin-top:12px">按类别分组，组顺序与「病情一图秀」同一来源。
        卡背面是<b>固定高度 3D 翻转</b>，不是向下展开。
        点卡片或按回车/空格翻转；≥700px 两列，窄屏一列，不做三列以上。</p>`;
  };

  const electrolyteBody = () => card('电解质与代谢（长期）', `
    <div class="notice notice-warn">
      B12、碳酸氢盐、氯、尿路感染与结石这几项，在已精读的 11 份中文共识里<b>查不到原文出处</b>。
      字段位置先留出来，但<b>不填数字、不给阈值、不做解释</b>。<span class="verify-tag">来源待补</span>
    </div>
    <h3 style="margin-top:16px">要盯的项目（只留位置，不给值）</h3>
    <table class="tbl"><thead><tr>
      <th>项目</th><th>为什么要盯</th><th>记录内容</th><th>状态</th>
    </tr></thead><tbody>
      <tr><td>碳酸氢盐（HCO₃⁻）</td><td>用肠管做尿路通道后，酸碱平衡可能长期偏移</td><td>每次化验的值与日期</td><td><span class="chip chip-warn">来源待补</span></td></tr>
      <tr><td>氯（Cl⁻）</td><td>同上，与酸碱状态一起看</td><td>值与日期</td><td><span class="chip chip-warn">来源待补</span></td></tr>
      <tr><td>钾（K⁺）</td><td>改道后可能偏高或偏低</td><td>值与日期</td><td><span class="chip chip-warn">来源待补</span></td></tr>
      <tr><td>维生素 B12</td><td>用到末端回肠的术式可能影响吸收</td><td>值、日期、是否在补充</td><td><span class="chip chip-warn">来源待补</span></td></tr>
      <tr><td>尿路感染</td><td>造口或新膀胱的感染表现与普通人不同</td><td>发作日期、症状、培养结果</td><td><span class="chip chip-warn">来源待补</span></td></tr>
      <tr><td>结石</td><td>长期随访中的常见问题</td><td>影像发现与日期</td><td><span class="chip chip-warn">来源待补</span></td></tr>
    </tbody></table>
    <p class="src" style="margin-top:10px">「为什么要盯」这一列是通行的机制解释，
    本机资料里<b>没有中文原文出处</b>，所以标为待补 —— 不拿它当依据。</p>
    ${collapsible('为什么这一页宁可空着，也不给数字', `
      <p>因为一旦写了具体阈值，它就会被当成标准来用。</p>
      <p>而电解质这块的「正常范围」跟<b>术式、术后时间、有没有在补碱、当地检验科的方法</b>都有关，
      拿一个通用数字套上去，比不写更糟。</p>
      <p>这一页的设计是：<b>结构先立住、来源补齐再开放</b>。补来源这件事记在 SPEC 的「未核实清单」里。</p>`)}
    <h3 style="margin-top:16px">可以问医生的问题（现在就能问）</h3>
    ${qlist([
      '我用的是哪段肠管做通道，对电解质有什么长期影响？',
      '碳酸氢盐偏低要不要补？补多久？',
      '维生素 B12 需要定期查吗，多久一次？',
      '造口或新膀胱的尿路感染，和普通尿路感染表现一样吗？',
    ])}`);

  const renalBody = () => {
    const pts = RENAL.points;
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : null;
    const delta = prev ? last.egfr - prev.egfr : null;
    return card('肾功能', `
      ${statStrip([
        ['最近 eGFR', `${last.egfr} ml/min/1.73m²`, `${esc(last.date)} · ${esc(last.method)}`],
        ['与上次比', delta == null ? '—' : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)}`,
         prev ? `上次 ${prev.egfr}（${esc(prev.date)}）` : ''],
        ['分肾功能', RENAL.split ? `左 ${RENAL.split.left}% / 右 ${RENAL.split.right}%` : '未记录',
         RENAL.split ? `${esc(RENAL.split.on)} · ${esc(RENAL.split.method)}` : ''],
        ['肾积水与引流', RENAL.drainage.kind, RENAL.drainage.placedOn || '未放置'],
      ])}
      <h3 style="margin-top:16px">肾功能趋势</h3>
      <table class="tbl"><thead><tr>
        <th>日期</th><th class="num">eGFR</th><th class="num">肌酐</th><th>方法</th><th>机构</th><th>与门槛的位置</th>
      </tr></thead><tbody>
        ${pts.map((p) => `<tr><td>${esc(p.date)}</td><td class="num">${p.egfr}</td><td class="num">${p.creatinine}</td>
          <td>${esc(p.method)}</td><td>${esc(p.lab)}</td>
          <td>${p.egfr > 60 ? `高于门槛 ${(p.egfr - 60).toFixed(0)}` : `低于门槛 ${(60 - p.egfr).toFixed(0)}`}</td></tr>`).join('')}
      </tbody></table>
      <div class="notice notice-warn" style="margin-top:12px">
        门槛：<b>${esc(RENAL.threshold.text)}</b> ${src(RENAL.threshold.source)}
        <div style="margin-top:6px" class="src">这里只显示门槛与出处，<b>不判断你应该用或不应该用哪个方案</b>。</div>
      </div>
      ${collapsible('一次血肌酐看不出「是哪一侧的肾在拖后腿」', `
        <p>血肌酐和 eGFR 反映的是<b>两个肾加在一起</b>的总体水平。</p>
        <p>核素肾图分别测左右两肾各自的功能占比。一侧明显偏低时，
        「要不要放支架、能不能做某些治疗」的判断依据就不同了。</p>
        <table class="tbl" style="margin-top:8px"><thead><tr><th>项目</th><th>本演示档案</th><th>说明</th></tr></thead><tbody>
          <tr><td>左肾 / 右肾占比</td><td>${RENAL.split ? `左 ${RENAL.split.left}% / 右 ${RENAL.split.right}%` : '未记录'}</td><td>${RENAL.split ? esc(RENAL.split.on) + ' · ' + esc(RENAL.split.method) : '—'}</td></tr>
          <tr><td>肾积水</td><td>${esc(RENAL.drainage.kind)}</td><td>尿排不出去会反过来伤肾</td></tr>
          <tr><td>引流（DJ 管 / 肾造瘘）</td><td>${esc(RENAL.drainage.kind)}</td><td>${RENAL.drainage.placedOn ? esc(RENAL.drainage.placedOn) : '未放置'}</td></tr>
        </tbody></table>`)}
      ${collapsible('为什么膀胱癌要一直盯着肾', `
        <ul>
          <li><b>有些药要靠肾排出去</b>——肾功能不够就上不了，比如顺铂。</li>
          <li><b>尿路可能被堵住</b>——肿瘤压到或治疗后狭窄，尿排不出去会反过来伤肾。</li>
          <li><b>改道之后肾更辛苦</b>——尿的出路变了，长期要盯着电解质和肾功能。</li>
        </ul>
        <p class="src">所以肾功能不是「顺便查一下」，它是决定后面能走哪条路的硬门槛。</p>`)}
      <h3 style="margin-top:16px">可以问医生的问题</h3>
      ${qlist([
        '现在的肾功能，还能不能用顺铂？',
        '如果不能用顺铂，替代方案对效果影响有多大？',
        '肾功能往下走，是治疗引起的还是别的原因？',
        '要不要做一次分肾核素肾图？',
      ])}`);
  };

  const body = {
    '指标总览': overviewBody,
    '分类指标卡': cardBody,
    '电解质与 B12': electrolyteBody,
    '肾功能': renalBody,
  }[tab] || (() => '<div class="empty"><strong>该页签还没有内容</strong></div>');
  return H('检查与指标', '同一份目录供指标卡与一图秀共用；分级是对照不是诊断。') + tabsHTML('metrics') + body();
}

function rulerNote(m, last) {
  const v = `竖线 = 最近值 ${CHART.fmt(last)}${m.unit ? ' ' + m.unit : ''}`;
  if (m.refLow != null && m.refHigh != null) {
    return `浅色区 = 报告给出的参考范围（不做好坏判断）；${v}`;
  }
  if (m.refLow != null) return `浅色区 = 报告只给了下限（≥ ${CHART.fmt(m.refLow)}），未给上限；${v}`;
  return `浅色区 = 报告只给了上限（≤ ${CHART.fmt(m.refHigh)}），未给下限；${v}`;
}

function rulerHTML(m) {
  if (m.refLow == null && m.refHigh == null) return '';
  const vs = m.points.map((p) => p.v);
  const lo = Math.min(...vs, m.refLow != null ? m.refLow : Infinity);
  const hi = Math.max(...vs, m.refHigh != null ? m.refHigh : -Infinity);
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return '';
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const last = vs[vs.length - 1];
  const a = m.refLow != null ? pos(m.refLow) : 0;
  const b = m.refHigh != null ? pos(m.refHigh) : 100;
  return `<div class="m-ruler">
    <div class="m-ruler-bar">
      <div class="m-ruler-in" style="left:${a.toFixed(1)}%;right:${(100 - b).toFixed(1)}%"></div>
      <div class="m-ruler-mark" style="left:${pos(last).toFixed(1)}%" title="最近值 ${CHART.fmt(last)} ${m.unit}"></div>
    </div>
    <div class="m-ruler-cap">
      <span>${m.refLow != null ? CHART.fmt(m.refLow) : ''}</span>
      <span>${m.refHigh != null ? CHART.fmt(m.refHigh) : ''}</span>
    </div>
    <p class="m-ruler-note">${rulerNote(m, last)}</p>
  </div>`;
}

/* 可比组：机构或方法变了就不该连成一条线。多于一组时明写出来，少一组就不啰嗦。 */
function groupsHTML(m) {
  if (!CHART.groupsOf) return '';
  const gs = CHART.groupsOf(m);
  if (gs.length < 2) return '';
  return `<span class="mc-groups">可比组 ${gs.length} 个（不跨组连线）：`
    + gs.map((g) => `${esc(g.label)} ${g.n} 次`).join(' / ') + `</span>`;
}

function metricCardHTML(m, i) {
  const last = m.points[m.points.length - 1];
  const prev = m.points[m.points.length - 2];
  const delta = prev ? last.v - prev.v : null;
  const dir = delta == null ? '' : delta > 0 ? 'up' : delta < 0 ? 'down' : '';
  return `
  <div class="metric-card" data-flipped="false" data-metric="${esc(m.code)}" role="group" tabindex="0"
       aria-pressed="false"
       aria-label="${esc(m.name)} 最近值 ${CHART.fmt(last.v)} ${esc(m.unit)}，按回车翻转查看趋势">
    <div class="metric-inner">
      <div class="metric-face metric-front">
        <div class="mc-head"><span class="mc-name">${esc(m.name)}</span><span class="mc-cat">${esc(m.cat)}</span></div>
        <div class="mc-value">${CHART.fmt(last.v)}<span class="mc-unit">${esc(m.unit)}</span></div>
        <div class="mc-delta" data-dir="${dir}">
          ${delta == null ? '<span class="src">仅一次记录，无法比较</span>'
            : `${CHART.fmt(Math.abs(delta))} ${esc(m.unit)} · 上次 ${CHART.fmt(prev.v)}（${prev.d}）`}
        </div>
        ${rulerHTML(m)}
        ${m.ctcae ? `<span class="chip chip-warn mc-badge">${esc(m.ctcae.text)}</span>` : ''}
        <div class="mc-meta">
          <span>共 ${m.points.length} 次记录 · 最近 ${esc(last.d)}</span>
          <span>来源：${esc(m.src)}${m.lab ? ' · ' + esc(m.lab) : ''}</span>
          ${groupsHTML(m)}
          <span>${m.refLow != null && m.refHigh != null ? `参考范围 ${CHART.fmt(m.refLow)} ~ ${CHART.fmt(m.refHigh)} ${esc(m.unit)}`
            : m.refLow != null ? `参考范围 ≥ ${CHART.fmt(m.refLow)} ${esc(m.unit)}（报告未给上限）`
            : m.refHigh != null ? `参考范围 ≤ ${CHART.fmt(m.refHigh)} ${esc(m.unit)}（报告未给下限）`
            : '参考范围：未取得'}</span>
        </div>
        <span class="mc-flip-hint">翻转看趋势 ⟳</span>
      </div>
      <div class="metric-face metric-back" aria-hidden="true" inert>
        <div class="mc-back-title">${esc(m.name)} · 趋势</div>
        <div class="mb-chart" data-spark="${esc(m.code)}"></div>
        <div class="mc-meta">
          <span>全期范围 ${CHART.fmt(m.min ?? Math.min(...m.points.map(p => p.v)))} ～ ${CHART.fmt(m.max ?? Math.max(...m.points.map(p => p.v)))} ${esc(m.unit)}</span>
          <span>${groupsHTML(m) || (m.lab ? `机构 ${esc(m.lab)} · 方法 ${esc(m.method || '—')}` : '自测')}</span>
          ${m.ctcae ? `<span>${esc(m.ctcae.range || '')}｜来源：CTCAE v5.0</span>` : '<span>未启用分级对照</span>'}
        </div>
        <span class="mc-flip-hint">翻回正面 ⟳</span>
      </div>
    </div>
  </div>`;
}

/* ================= 10. 病情一图秀 ================= */
function pageChart() {
  const state = APP.$chart = APP.$chart || { codes: ['egfr', 'hb'], win: 'all' };
  const opts = METRICS.map((m) => `
    <label class="chip" style="cursor:pointer">
      <input type="checkbox" data-code="${esc(m.code)}" ${state.codes.includes(m.code) ? 'checked' : ''}>
      ${esc(m.name)}
    </label>`).join('');

  const wins = [['3', '近 3 个月'], ['6', '近 6 个月'], ['12', '近 12 个月'], ['all', '全部']];
  const plotBlock = `<div class="chart-block" data-codes="${state.codes.join(',')}" data-win="${state.win}">
      <div class="chart-wrap"><div class="chart-host"></div></div>
      <div class="legend" data-legend></div>
    </div>`;

  const winLabel = (wins.find(([v]) => v === state.win) || ['all', '全部'])[1];
  return H('病情一图秀', '每条线按该指标<b>全部记录范围</b>缩放，<b>不代表不同指标数值可比</b>；治疗条单独一层。')
    + card('选择指标（最多 6 条）', `<div class="btn-row">${opts}</div>
        <p class="src" style="margin-top:10px">分类变量（${CATEGORICAL.map((c) => esc(c.name)).join('、')}）不进折线图。</p>`)
    + card('时间轴', `
      <div class="chart-toolbar">
        ${wins.map(([v, t]) => `<button class="btn btn-sm ${state.win === v ? 'btn-primary' : ''}" data-win="${v}"
          aria-pressed="${state.win === v}" aria-label="时间窗：${t}">${t}</button>`).join('')}
        <button type="button" class="btn btn-sm" data-replay-chart aria-label="重播趋势动画">重播动画</button>
        <span class="src" style="margin-left:auto">治疗事件：${CHART.TREATMENTS.length} 个 ·
          <span role="status" aria-live="polite">当前时间窗：${winLabel}</span></span>
      </div>
      ${plotBlock}
      <p class="chart-watermark">↑ 每条线按该指标全部记录范围缩放，不代表不同指标数值可比。</p>
      <p class="legend-note">
        单点不连线；空窗口给空态；末点每序列只标一次。鼠标停在点上（或键盘 Tab 到点）可看到日期、值、机构与方法；
        治疗节点可点，说明它来自档案里的哪条事件。
      </p>
      <p class="legend-note">动画：<code>pathLength=1</code> + <code>stroke-dashoffset</code>（进场描线），
        点按 45ms 递增延迟淡入，切时间窗有淡入过渡；减少动效时直接给终态。</p>`)
    + card('治疗事件（与节点同 ID 联动）', `
      <table class="tbl"><thead><tr><th>日期</th><th>事件</th><th>ID</th></tr></thead><tbody>
        ${CHART.TREATMENTS.map((t) => `<tr><td>${esc(t.d)}</td><td>${esc(t.label)}</td><td><code>${esc(t.id)}</code></td></tr>`).join('')}
      </tbody></table>`);
}

/* ================= 11. 急症与安全 ================= */
function pageUrgent() {
  return H('急症与安全', '四类情况各自有入口。本页<b>不解释原因、不给用药或自行处理的建议</b>，只做一件事：把需要找人的情形指出来。')
    + `<div class="notice notice-stop" style="margin-bottom:16px">
         下面四类里的条目，是<b>共识原文列出的固定情形</b>，不是工作台按你的情况算出来的。
         属于其中任何一类时，联系路径在每张卡的下方。本页不判断「你这算几级」，也不建议用什么药、能不能等。
       </div>`
    + `<div class="urgent-grid">` + URGENT.map((u) => `
        <div class="urgent-card" data-src="${u.src}">
          <h3>${esc(u.cat)}</h3>
          <ul>${u.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
          ${u.src === 'missing' ? `<span class="verify-tag">判据来源待补</span>
            <p class="src" style="margin-top:6px">原文分级表为图片，本次未取得，以上为保守表述。</p>` : ''}
          <div class="uc-contact">联系入口：<b>你的主诊医生 / 医院总机</b>（原型占位，未接通）</div>
        </div>`).join('') + `</div>`
    + card('为什么这里没有「怎么办」', `
      <p>工作台不判断病情，也不给处置建议 —— 不写用什么药、不写能不能等、不写要不要去医院。
        它只做两件事：帮你把情况说清楚，帮你更快找到人。</p>
      <p class="src" style="margin-top:10px">「帮你找到人」是转接，不是处置：转接告诉你去哪儿问，
        处置会替医生回答。前者是工作台的职责，后者不是。</p>`)
    + `<div class="cols-2" style="margin-top:16px">
        ${card('我的联系入口', `
          <div class="notice notice-info">急的时候不该再去翻通讯录。把号码写在这里一次，之后不用再找。</div>
          <table class="tbl" style="margin-top:12px">
            <thead><tr><th>要联系谁</th><th>号码 / 地点</th><th>什么时候打</th></tr></thead>
            <tbody>
              <tr><td>主诊医生 · 泌尿外科门诊</td><td><input type="text" placeholder="还没有填" aria-label="主诊医生电话"></td><td>灌注后发热、血尿加重</td></tr>
              <tr><td>造口治疗师（ET 护士）</td><td><input type="text" placeholder="还没有填" aria-label="造口治疗师电话"></td><td>造口颜色、渗漏、皮肤问题</td></tr>
              <tr><td>医院总机 / 急诊</td><td><input type="text" placeholder="还没有填" aria-label="医院急诊电话"></td><td>说不清该找谁时</td></tr>
              <tr><td>就近可去的急诊</td><td><input type="text" placeholder="还没有填" aria-label="就近急诊"></td><td>夜间、外地、来不及回原医院</td></tr>
            </tbody>
          </table>
          <div class="private-zone" style="margin-top:12px">
            <span class="pz-tag">默认私密（fail-closed）：这四条只存本机，不进导出、不进 AI 草稿，除非你这次勾选带入。</span>
          </div>`)}
        ${card('这次出现过什么', `
          <div class="notice notice-info">只记<b>发生过的事实</b>，不判断严重程度，也不写「后来怎么好的」——那是医生的记录。</div>
          <table class="tbl" style="margin-top:12px">
            <thead><tr><th>出现过</th><th>发生时间</th><th>当时有没有联系</th></tr></thead>
            <tbody>
              <tr><td>灌注后发热寒战</td><td>2026-10-09</td><td>已联系门诊 · 当日回复</td></tr>
              <tr><td>排出血块</td><td>2026-10-23</td><td>已联系门诊 · 取消当次灌注</td></tr>
              <tr><td>造口颜色变化</td><td>还没有</td><td>—</td></tr>
              <tr><td>尿量明显减少</td><td>还没有</td><td>—</td></tr>
            </tbody>
          </table>
          <p class="src" style="margin-top:10px">来源：本人的记录 · 未核对。不含因果判断，也不含处置建议。</p>`)}
      </div>`;
}

/* ================= 12. 生活与照护 ================= */
function pageLife(tab) {
  const H2 = LIFE.handover;

  const intakeBody = () => card('饮水与饮食', `
    <div class="notice notice-info">这里只记两件事：<b>医生怎么交代的</b>、<b>你自己试出来的</b>。
    不写「应该多吃什么」这类换任何病都成立的话。</div>
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>这一条</th><th>谁说的</th><th>具体内容</th><th>来源</th>
    </tr></thead><tbody>
      ${LIFE.intake.map((r) => `<tr>
        <td>${esc(r.item)}</td>
        <td>${r.who === '—' ? '<span class="src">—</span>' : esc(r.who)}</td>
        <td>${esc(r.detail)}</td>
        <td>${r.src === '来源待补' ? '<span class="chip chip-warn">来源待补</span>' : `<span class="src">${esc(r.src)}</span>`}</td>
      </tr>`).join('')}
    </tbody></table>
    <div class="notice notice-warn" style="margin-top:12px">
      「灌注后当天喝多少水、憋多久」本机资料里是<b>图片</b>，没拿到原文，
      所以这里<b>不填数字</b>。等你从医生那里问到，抄进「医生交代」这一栏。</div>
    ${collapsible('为什么这一页不写「多喝水有益健康」', `
      <p>因为对这条线的人来说，喝水的意义不是养生，而是<b>具体某一天的具体安排</b>：
      检查后要靠尿把血块冲出去，灌注当天又要按医生的要求控制。</p>
      <p>这两种情况下「多喝水」的含义完全相反。写一句笼统的好话，
      既帮不上忙，还可能正好帮倒忙。</p>`)}`);

  const socialBody = () => card('造口与社交', `
    <div class="notice notice-info">先说一句事实：造口的黏膜<b>没有痛觉神经</b>，
    所以碰它、擦它本身不疼。真正麻烦的是底盘松了、皮肤红了、气味控制不住。</div>
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>场景</th><th>现在的情况</th><th>下次想问 / 想解决</th>
    </tr></thead><tbody>
      ${LIFE.social.map((r) => `<tr>
        <td>${esc(r.scene)}</td>
        <td>${esc(r.now)}</td>
        <td class="src">${esc(r.ask)}</td>
      </tr>`).join('')}
    </tbody></table>
    <p class="src" style="margin-top:10px">「现在的情况」来自本人记录 · 未核对。
    这里只记事实和要问的问题，<b>不给处置建议</b>。</p>
    ${collapsible('造口长什么样，为什么这样设计', `
      <ul>
        <li>通常位于<b>右下腹</b>，直径约 2–2.5 cm，高出皮肤约 2–3 cm。</li>
        <li>表面是肠黏膜，<b>没有痛觉神经</b>——所以不疼，但也意味着扎到、磨到你不一定马上知道。</li>
        <li>多数造口袋带<b>抗反流装置</b>，防止尿液回流泡到造口周围皮肤。</li>
        <li>提重物要当心，长期腹压高可能造成<b>造口疝</b>。</li>
      </ul>
      <p class="src">来源：CACA 膀胱癌问答（患者教育材料）。这是科普口径，具体以你的造口治疗师意见为准。</p>`)}`);

  const sexBody = () => card('性功能与亲密（默认私密）', `
    <div class="private-zone">
      <p><b>这一页默认私密。</b>不勾选就不会进入导出，也不会进入 AI 草稿。</p>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn" data-act="toggleShare">本次已勾选带入 ▢</button>
      </div>
      <h3 style="margin-top:16px">可以记什么</h3>
      <table class="tbl"><thead><tr><th>项目</th><th>为什么单独放这里</th></tr></thead><tbody>
        <tr><td>勃起功能变化</td><td>根治性切除后可能出现，与手术范围有关</td></tr>
        <tr><td>射精变化</td><td>同上</td></tr>
        <tr><td>阴道前壁切除后的不适</td><td>女性根治术可能涉及</td></tr>
        <tr><td>卵巢切除后更年期症状</td><td>女性根治术可能涉及</td></tr>
        <tr><td>亲密关系里的顾虑</td><td>患者与伴侣各自的感受可以分开记</td></tr>
      </tbody></table>
      <h3 style="margin-top:16px">可以问医生的问题</h3>
      ${qlist([
        '这次手术对我性功能的影响有多大？',
        '有没有办法在手术时尽量保留？',
        '出现变化之后，多久算「稳定下来」？',
        '如果我想恢复，可以找谁看？',
      ])}
      <p class="src" style="margin-top:10px">
        只记事实与要问的问题，<b>不给处置建议</b>。<span class="verify-tag">来源待补</span>
        这一页的字段来源在本机资料里没有查到原文，字段集先按泌尿族通用需要搭，
        与前列腺癌工作台<b>共享待回填</b>。</p>
    </div>`);

  const workBody = () => card('工作与出行', `
    <table class="tbl"><thead><tr>
      <th>场景</th><th>现在的情况</th><th>下次想问 / 想解决</th>
    </tr></thead><tbody>
      ${LIFE.work.map((r) => `<tr>
        <td>${esc(r.scene)}</td><td>${esc(r.now)}</td><td class="src">${esc(r.ask)}</td>
      </tr>`).join('')}
    </tbody></table>
    ${collapsible('出门这天，耗材怎么带', `
      <table class="tbl"><thead><tr><th>带什么</th><th>带多少</th><th>为什么</th></tr></thead><tbody>
        <tr><td>整套更换耗材</td><td>至少 1 套</td><td>底盘意外松脱时能当场换</td></tr>
        <tr><td>造口袋</td><td>按在外时长算</td><td>—</td></tr>
        <tr><td>擦手纸 / 小镜子</td><td>1 份</td><td>在外面换的时候用得上</td></tr>
        <tr><td>备用药与联系卡</td><td>1 份</td><td>急症时让别人能替你说话</td></tr>
      </tbody></table>
      <p class="src">本机资料里没有查到「耗材携带」的权威原文，
      以上是按日常照护需要列的结构，具体以你的造口治疗师建议为准。</p>`)}`);

  const handoverBody = () => card('照护者交接', `
    <div class="notice notice-ok">
      <b>换一个人来照顾，不问患者也能接手。</b>
      下面这些是接手当天就要知道的，不用等患者清醒或有力气再问。
    </div>
    ${statStrip([
      ['当前阶段', H2.stage, '一眼看清走到哪了'],
      ['下次灌注', H2.nextInstillation, '本人安排 · 未预约'],
      ['下次膀胱镜', H2.nextCystoscopy, '医院安排 · 时间以短信为准'],
      ['耗材存量', H2.supply, '低于 2 片要提前补'],
    ])}
    <table class="tbl" style="margin-top:12px"><thead><tr><th>接手要知道的</th><th>内容</th></tr></thead><tbody>
      <tr><td>最近一次变动</td><td>${esc(H2.cancelled)}</td></tr>
      <tr><td>急症入口</td><td>${esc(H2.urgent)}</td></tr>
      <tr><td>本页记录人</td><td>${esc(H2.recordBy)}</td></tr>
      <tr><td>记录的是谁</td><td>${esc(H2.subject)}</td></tr>
    </tbody></table>
    <p class="src" style="margin-top:10px">「记录人」和「当事人」是<b>两个不同的字段</b>。
    照护者代记的内容，回看时能一眼区分出「这是谁记的」。</p>
    ${collapsible('为什么照护者不是「次要用户」', `
      <p>因为真正每天在录入的人常常是家属，不是患者本人。如果按「患者自己记」来设计：</p>
      <ul>
        <li>一次只能记一天 → 家属要连着补好几天，很累，最后就不记了。</li>
        <li>没有「代记」标识 → 回看时分不清哪些是患者说的、哪些是家属估的。</li>
        <li>患者端和照护者端看到一样的东西 → 患者想少看，家属想多看，谁都别扭。</li>
      </ul>
      <p>所以这一页的设计目标是：<b>换人不问患者，也能说出「排到第几周、下次哪天」</b>。</p>`)}`);

  const body = {
    '饮水与饮食': intakeBody,
    '造口与社交': socialBody,
    '性功能与亲密': sexBody,
    '工作与出行': workBody,
    '照护者交接': handoverBody,
  }[tab] || (() => '<div class="empty"><strong>该页签还没有内容</strong></div>');
  return H('生活与照护', '只记医生交代的和你自己试出来的；照护者是主要录入者。')
    + tabsHTML('life') + body();
}

function pageVisit(tab) {
  const asked = crudLive('question').filter((q) => q.asked === '已问').length;

  const qBody = () => card('要问医生的问题', `
    <div class="notice notice-info">问题问完要<b>当场把答案记下来</b>，
    否则下次门诊还会问同一句。没问到的不删，留着下次接着问。</div>
    ${statStrip([
      ['问题总数', `${crudLive('question').length} 条`, '按场景分组'],
      ['已问', `${asked} 条`, '已记下医生的回答'],
      ['还没问', `${crudLive('question').length - asked} 条`, '下次门诊带上'],
      ['分组', `${new Set(crudLive('question').map((q) => q.group)).size} 组`, '病理 / 灌注 / 复查 / 肾功能 / 急症'],
    ])}
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>场景</th><th>问题</th><th>问了没有</th><th>医生怎么答（原文）</th><th>操作</th>
    </tr></thead><tbody>
      ${crudLive('question').map((q) => `<tr>
        <td class="src">${esc(q.group)}</td>
        <td>${esc(q.q)}${Array.isArray(q._prev) && q._prev.length ? ' <span class="chip chip-neutral">已修改 · 原值保留</span>' : ''}</td>
        <td>${q.asked === '已问' ? `<span class="chip chip-ok">${esc(q.asked)}</span>` : `<span class="chip chip-warn">${esc(q.asked)}</span>`}</td>
        <td>${q.answer ? esc(q.answer) : '<span class="src">—</span>'}</td>
        <td>${rowActions('question', q)}</td>
      </tr>`).join('')}
    </tbody></table>
    ${voidedBlock('question')}
    <div class="btn-row" style="margin-top:14px">
      <button type="button" class="btn btn-primary" data-crud="new" data-kind="question" aria-label="添加一个要问医生的问题">+ 加一个问题</button>
      <button type="button" class="btn" data-goto="visit" data-tab="复诊摘要">生成复诊摘要</button>
    </div>
    ${collapsible('问题该怎么问，医生才答得上', `
      <table class="tbl"><thead><tr><th>这样问</th><th>比这样问好</th></tr></thead><tbody>
        <tr><td>「报告上写『未见肌层』，是这次没取到，还是确实没有？」</td><td>「我这个严重吗？」</td></tr>
        <tr><td>「下次膀胱镜为什么排在 12 月？」</td><td>「我什么时候能好？」</td></tr>
        <tr><td>「这次取消灌注，下次要不要补？」</td><td>「漏一次要紧吗？」</td></tr>
      </tbody></table>
      <p class="src">左边这类问法带<b>具体的时间、数字或报告原话</b>，
      医生能直接对着答；右边那种只能得到一句安慰。</p>`)}`);

  const sumBody = () => card('复诊摘要', `
    <div class="notice notice-info">摘要<b>只抄记录</b>。记录里没有的，写「没有」，
    不补、不推测、不替你下结论。</div>
    ${statStrip([
      ['本次目的', '复查 + 讨论二次电切', '自己填，一句话'],
      ['最近变化', '灌注第 3 次后取消（血尿）', '取自灌注记录'],
      ['要问的问题', `${QUESTIONS.length} 条`, `${asked} 条已问`],
      ['私密项', '未带入', '默认 fail-closed'],
    ])}
    <h3 style="margin-top:16px">摘要由这五块拼成</h3>
    <table class="tbl"><thead><tr><th>块</th><th>内容来源</th><th>缺的时候怎么写</th></tr></thead><tbody>
      <tr><td>① 就诊目的</td><td>你自己填的一句话</td><td>没填就写「未填写」</td></tr>
      <tr><td>② 最近变化</td><td>灌注 / 复查 / 指标记录</td><td>没有就写「没有」</td></tr>
      <tr><td>③ 用药与灌注进度</td><td>治疗线与灌注记录</td><td>没有就写「没有」</td></tr>
      <tr><td>④ 待办与下次安排</td><td>待办清单</td><td>没有就写「没有」</td></tr>
      <tr><td>⑤ 要问的问题</td><td>问题清单</td><td>没有就写「没有」</td></tr>
    </tbody></table>
    <h3 style="margin-top:16px">预览</h3>
    <div class="preview-doc">
      <p><b>就诊目的</b>：复查，并问清楚「未见肌层」要不要做二次电切。</p>
      <p><b>最近变化</b>：2026-10-23 灌注因肉眼血尿取消（属禁忌保护）。eGFR 66 ml/min/1.73m²。</p>
      <p><b>用药与灌注</b>：BCG 120 mg，诱导期已完成 3 / 6 次，下次 2026-10-30。</p>
      <p><b>下次安排</b>：2026-11-06 血常规 + 肝肾功能；2026-12-16 膀胱镜 + 尿细胞学。</p>
      <p><b>要问的问题</b>：见问题清单（${QUESTIONS.length} 条）。</p>
      <p class="src">私密项：本次未带入。<br>
      「已确认」只表示转录核对，不等于医学审核。</p>
    </div>
    <div class="btn-row" style="margin-top:14px">
      <button type="button" class="btn btn-primary" data-export>导出摘要（原型占位）</button>
      <button type="button" class="btn" data-copy>复制文本</button>
      <button type="button" class="btn" data-act="toAI" data-to-ai="draft">带入 AI 对话</button>
    </div>
    <p class="src" style="margin-top:8px">
      导出会得到格式真实的文件。带入 AI 对话会把这一页的摘要提示词交给宿主原生会话
      （嵌入式填草稿；独立打开只复制），<b>不替你发送、不替你下判断</b>；提示词不含本机资料目录路径。</p>`);

  const prepBody = () => card('就诊准备', `
    <h3>去之前要带什么</h3>
    <ul class="qlist">
      ${LIFE.visitPrep.bring.map((x) => `<li>${esc(x)}</li>`).join('')}
    </ul>
    <h3 style="margin-top:16px">到了之后大概是这样</h3>
    <table class="tbl"><thead><tr><th>环节</th><th>要做的事</th></tr></thead><tbody>
      ${LIFE.visitPrep.flow.map(([step, what]) => `<tr><td>${esc(step)}</td><td>${esc(what)}</td></tr>`).join('')}
    </tbody></table>
    ${collapsible('为什么要把「医生的回答」当场记下来', `
      <p>门诊时间通常很短，出来以后记得的往往只剩一个情绪感受，而不是具体结论。
      下次再想问同一件事时，还得重新挂号。</p>
      <p>当场照抄原文还有第二个用处：如果几个月的说法不一致，
      你能看到是<b>情况变了</b>，还是当时<b>听岔了</b>。</p>`)}
    <p class="src" style="margin-top:12px">这一页不判断病情，也不给处置建议，只帮你把话带到、把答案带回来。</p>`);

  const body = { '问题清单': qBody, '复诊摘要': sumBody, '就诊准备': prepBody }[tab] || (() => '');
  return H('复诊准备', '把话带到，把答案带回来。摘要只抄记录，缺项写「没有」。')
    + tabsHTML('visit') + body();
}

/* ================= 35 号：临床试验匹配（建档 → 检索 → 匹配结果） =================
 *
 * 这一屏回答一个问题：**我这份档案，哪些登记能对上？**
 * 三段必须在同一屏里依次看见，缺一段就是假功能：
 *   ① 建档：把参与匹配的字段摆出来，并明确「只有已确认入库的字段参与」；
 *   ② 检索：本地快照（带日期、带「会过期」）+ 在线通道逐来源状态；
 *   ③ 匹配：四档分层 + 每条试验的粗筛符合度 + 逐条证据链。
 *
 * 三条语义纪律（35 号 §二）：
 *   - pct = 符合项 ÷ 已对照项，**待确认按 0 计**，所以只会偏低、不会偏高；
 *   - 四档里「硬性条件不满足」单列，不参与 pct 排序首位；
 *   - 每条试验的 pct 旁固定写「这不是入组资格，也不代表效果」。
 *
 * 演示条目一律 DEMO- 前缀（数据在 data.js 的 TRIAL_DEMO_MATCH），页面逐处声明。
 * 工作台不替研究团队判断谁符合；缺字段写「无法自动匹配」，不写一个阴性结论。
 */
const TMATCH_BAND = {
  high: ['字段都对得上', 'chip-ok'],
  partial: ['部分对得上', 'chip-warn'],
  needs_info: ['需补充信息', 'chip-neutral'],
  ineligible: ['硬性条件不满足', 'chip-stop'],
};
const TMATCH_CAT = {
  diagnosis: '诊断', pathology: '病理类型', stage: '分期', organ: '器官功能',
  bcg: '既往治疗', age: '年龄', performance: '体能状态', other: '其他',
};
const TMATCH_STATE = {
  met: ['符合', 'tms-ok', '✓'],
  unmet: ['不符合', 'tms-no', '✕'],
  unknown: ['待确认', 'tms-q', '?'],
};
/** 演示基准日：收藏日期用固定值，避免每次刷新都变（也让两侧渲染可逐字符比对）。 */
const TMATCH_TODAY = '2026-10-24';

function trialMatchState() {
  APP.$trialMatch = APP.$trialMatch || { saved: {}, rejected: {} };
  return APP.$trialMatch;
}

/**
 * 参与匹配的档案字段。
 *
 * 规则只有一条：**只有「已确认入库」的字段参与**。来源一律来自 RECORDS.facts
 * （每条都带「谁记的 / 什么时候记的」），没有建档的字段写「未建档」，
 * 既不算符合也不算不符合 —— 它会落到「无法自动匹配 / 待确认」。
 */
function trialMatchFields() {
  const factOf = (item) => (RECORDS.facts || []).find((f) => f.item === item) || null;
  const line = factOf('所在分野');
  const path = factOf('病理结论');
  const muscle = factOf('有无肌层组织');
  const egfr = factOf('肾功能');
  const confirmed = (f) => !!f && f.state === '已核对';
  const srcOf = (f) => (f ? `${f.on} · ${f.by}` : '档案里没有这一项');
  const stateOf = (f) => (confirmed(f) ? 'confirmed' : f ? 'candidate' : 'missing');

  const r = RENAL.points && RENAL.points.length ? RENAL.points[RENAL.points.length - 1] : null;
  const out = [];
  const add = (key, label, value, source, state, note) => out.push({ key, label, value, source, state, note });

  add('diag_urothelial', '组织学诊断',
    path && /尿路上皮癌/.test(path.value) ? '尿路上皮癌' : '未建档',
    srcOf(path), stateOf(path), '来自病理结论原文');
  add('line', '分野',
    line ? line.value : '未建档', srcOf(line), stateOf(line), '决定是否肌层浸润');
  add('grade_high', '分级',
    path && /高级别/.test(path.value) ? '高级别' : '未建档',
    srcOf(path), stateOf(path), '病理报告原文');
  add('egfr', 'eGFR',
    r ? `${r.egfr} mL/min/1.73m²` : '未建档',
    r ? `${r.date} · 演示检验科（已核对）` : '档案里没有这一项', r && confirmed(egfr) ? 'confirmed' : 'candidate',
    '用于器官功能类条件');
  add('bcg_response', 'BCG 应答状态',
    BCG_RESPONSE.status, BCG_RESPONSE.doctorQuote ? '有医生原话' : '未判定：缺医生原话', 'missing',
    '没有医生原话只能停在「未判定」');
  add('muscle', '肌层取材',
    muscle ? muscle.value : '未建档', srcOf(muscle), stateOf(muscle),
    '「未见肌层」不等于「已确认无肌层浸润」');
  add('variant', '组织学变异型',
    PATHOLOGY.variantRaw ? PATHOLOGY.variantRaw : '报告未提及',
    `${PATHOLOGY.reportDate} 病理报告`, 'missing', '「没提」不等于「没有」');
  add('age', '年龄', '未建档', '档案里没有这个字段', 'missing', '不按身份证推算');
  add('ecog', 'ECOG 体能', '未建档', '档案里没有这个字段', 'missing', '门诊常写，但本工作台没有这个字段');
  add('metastatic', '转移 / 晚期状态', '未记录', '影像结论未结构化', 'missing', '不按文字描述猜');
  add('prior_systemic', '既往系统治疗', '记录里没有', '治疗记录只有膀胱灌注', 'missing',
    '「没有记录」不等于「确认没用过」');
  return out;
}

/** 把字段整理成求值用的快照；未确认的字段一律不进（值保持 null）。 */
function trialMatchFacts() {
  const fields = trialMatchFields();
  const conf = (k) => {
    const f = fields.find((x) => x.key === k);
    return f && f.state === 'confirmed' ? f : null;
  };
  const diag = conf('diag_urothelial');
  const line = conf('line');
  const grade = conf('grade_high');
  const egfr = conf('egfr');
  return {
    fields,
    src: {
      diag: diag ? diag.source : '档案里没有这一项',
      line: line ? line.source : '档案里没有这一项',
      grade: grade ? grade.source : '档案里没有这一项',
      egfr: egfr ? egfr.source : '档案里没有这一项',
    },
    diagUrothelial: !!diag,
    /* 注意顺序：先判 NMIBC，再判 MIBC —— "NMIBC" 里包含子串 "MIBC"，
       反过来写会把保膀胱线判成肌层浸润（真踩过）。 */
    line: line ? (/NMIBC/.test(line.value) ? 'nmibc' : /MIBC/.test(line.value) ? 'mibc' : null) : null,
    lineRaw: line ? line.value : null,
    gradeHigh: !!grade,
    egfr: egfr ? Number(String(egfr.value).match(/[\d.]+/)?.[0]) : null,
    bcgResponse: BCG_RESPONSE.status,
    variantReported: PATHOLOGY.variantRaw,
    muscleSampled: muscleState(),
  };
}

/** 「未见肌层组织」不是阴性结论：只有明确写了取材含肌层才算 true。 */
function muscleState() {
  const f = (RECORDS.facts || []).find((x) => x.item === '有无肌层组织');
  if (!f || f.state !== '已核对') return null;
  return /有肌层|见肌层/.test(f.value) && !/未见/.test(f.value) ? true : false;
}

/**
 * 单条条件的求值。三态 + 一个必填的「记录里是 / 条件要求」。
 * 这里的 unknown 是**诚实**：档案里没有就是没有，不用阴性去填。
 */
function evalTrialCriterion(c, facts) {
  const need = c.need;
  const mk = (state, actual, src) => ({ state, actual, src, need });
  const unknown = (actual, src) => mk('unknown', actual, src || '档案里没有这一项');
  switch (c.field) {
    case 'diag_urothelial':
      return facts.diagUrothelial
        ? mk('met', '尿路上皮癌', facts.src.diag)
        : unknown('组织学诊断未建档');
    case 'line': {
      if (!facts.line) return unknown('分野未建档');
      const label = facts.lineRaw || facts.line;
      return facts.line === c.value
        ? mk('met', label, facts.src.line)
        : mk('unmet', label, facts.src.line);
    }
    case 'grade_high':
      return facts.gradeHigh
        ? mk('met', '高级别', facts.src.grade)
        : unknown('分级未建档');
    case 'egfr_min':
      return facts.egfr == null
        ? unknown('eGFR 未建档')
        : mk(facts.egfr >= Number(c.value) ? 'met' : 'unmet',
          `eGFR ${facts.egfr} mL/min/1.73m²`, facts.src.egfr);
    case 'bcg_failure':
      if (facts.bcgResponse === '无应答') return mk('met', 'BCG 无应答（医生判定）', '医生原话');
      if (facts.bcgResponse === '有应答') return mk('unmet', 'BCG 有应答（医生判定）', '医生原话');
      return unknown('BCG 应答：未判定（要有医生原话才能记成无应答）', '未判定，缺医生原话');
    case 'variant_absent':
      if (facts.variantReported == null) {
        return unknown('病理报告未提及组织学变异型（「没提」不等于「没有」）', `${PATHOLOGY.reportDate} 病理报告`);
      }
      return /微乳头|腺样|鳞状|巢状/.test(String(facts.variantReported))
        ? mk('unmet', `报告写有：${facts.variantReported}`, `${PATHOLOGY.reportDate} 病理报告`)
        : mk('met', '报告写明无变异型', `${PATHOLOGY.reportDate} 病理报告`);
    case 'age_min':
      return unknown('档案里没有年龄字段，无法自动匹配');
    case 'ecog_max':
      return unknown('本地未建档 ECOG 评分，无法自动匹配');
    case 'metastatic':
      return unknown('影像结论没有结构化的转移状态，无法自动匹配');
    case 'prior_systemic_naive':
      return unknown('记录里只有膀胱灌注；「没有记录」不等于「确认未用过」');
    case 'unstructured':
      return unknown('条目无法结构化，需人工核对', '登记原文为综合判断');
    default:
      return unknown('这一条暂无对应字段，无法自动匹配');
  }
}

function matchOneTrial(t) {
  const facts = trialMatchFacts();
  const evals = (t.criteria || []).map((c) => ({ c, r: evalTrialCriterion(c, facts) }));
  const count = (s) => evals.filter((e) => e.r.state === s).length;
  const met = count('met'), unmet = count('unmet'), unknown = count('unknown');
  const compared = met + unmet + unknown;
  const thin = compared < 2;                       // 35 号 §七.3：不足 2 条不给百分数
  const pct = thin ? null : Math.round((met / Math.max(1, compared)) * 100);
  const hardUnmet = evals.filter((e) => e.r.state === 'unmet' && e.c.hard);
  const band = hardUnmet.length ? 'ineligible'
    : thin ? 'needs_info'
      : (pct >= 80 && unknown <= 1) ? 'high'
        : pct >= 55 ? 'partial' : 'needs_info';
  return { trial: t, evals, met, unmet, unknown, compared, pct, thin, band, hardUnmet };
}

function matchAllTrials() {
  return (TRIAL_DEMO_MATCH || []).map(matchOneTrial);
}

/** 证据链的一行：三态 + 条件类别 + 硬性标记 + 「记录里是… · 条件要求…」 */
function trialCritLine(e) {
  const [zh, cls, mark] = TMATCH_STATE[e.r.state];
  const c = e.c;
  return `<li class="crit ${e.r.state}">
    <div class="crit-line">
      <span class="crit-mark ${cls}" aria-hidden="true">${mark}</span>
      <b>${c.kind === 'exclude' ? '排除' : '入组'} · ${esc(TMATCH_CAT[c.cat] || c.cat)}</b>
      ${c.hard ? '<span class="muted">硬性</span>' : '<span class="muted">非硬性</span>'}
      <span class="chip chip-sm ${cls === 'tms-ok' ? 'chip-ok' : cls === 'tms-no' ? 'chip-stop' : 'chip-warn'}">${zh}</span>
    </div>
    <p class="crit-text">${esc(c.text)}</p>
    <p class="crit-evi">记录里是：${esc(e.r.actual)}（${esc(e.r.src)}）· 条件要求：${esc(e.r.need)}</p>
  </li>`;
}

/** 单张匹配卡：分数方块 + 分母 + 固定声明 + 证据链（不符合/待确认先展示）。 */
function trialMatchCard(m) {
  const st = trialMatchState();
  const saved = st.saved[m.trial.reg];
  const [bandZh, bandCls] = TMATCH_BAND[m.band];
  const open = m.evals.filter((e) => e.r.state !== 'met');
  const folded = m.evals.filter((e) => e.r.state === 'met');
  const showOpen = open.length ? open : folded.slice(0, 2);
  const rest = open.length ? folded : folded.slice(2);
  const score = m.thin ? '—' : String(m.pct);
  return `<article class="trial-card ${m.band === 'ineligible' ? 'ineligible' : ''}" data-reg="${esc(m.trial.reg)}">
    <div class="trial-top">
      <div class="trial-main">
        <div class="trial-tags">
          <span class="chip chip-warn">未核验</span>
          <span class="chip chip-neutral">${esc(m.trial.phase)}</span>
          <span class="chip chip-cat">${esc(m.trial.scope === 'mibc' ? 'MIBC' : m.trial.scope === 'advanced' ? '晚期 / 转移' : 'NMIBC')}</span>
        </div>
        <h3>${esc(m.trial.short)}</h3>
        <p class="src"><code>${esc(m.trial.reg)}</code> · ${esc(m.trial.sponsor)} · ${esc(m.trial.poolNote)}</p>
      </div>
      <div class="fit ${bandCls}">
        <b>${score}<small>${m.thin ? '' : '%'}</small></b>
        <span>粗筛符合度</span>
        <em>${bandZh}</em>
        <i class="fit-disclaimer">这不是入组资格，也不代表效果</i>
      </div>
    </div>
    <p class="fit-note">
      ${m.thin
        ? '可对照项不足 2 条，不给百分数 —— 只给「需补充信息」。'
        : `${m.met} / ${m.compared} 项对得上 · ${m.unknown} 项待确认。pct = 符合项 ÷ 已对照项，待确认按 0 计，所以只会偏低。`}
    </p>
    ${m.hardUnmet.length
      ? `<p class="fit-hard">挡住了这条的硬性条件：${m.hardUnmet.map((e) => esc(e.c.text)).join('；')}</p>`
      : ''}
    <ul class="crit-list">${showOpen.map(trialCritLine).join('')}</ul>
    ${rest.length ? `<details class="crit-more"><summary>其余 ${rest.length} 条条件（多为已符合项）</summary>
      <ul class="crit-list">${rest.map(trialCritLine).join('')}</ul></details>` : ''}
    <div class="trial-actions">
      <button type="button" class="btn btn-sm ${saved ? '' : 'btn-primary'}" data-trial-save="${esc(m.trial.reg)}"
        aria-label="${saved ? '取消收藏' : '收藏'} ${esc(m.trial.short)}">${saved ? `已收藏（${esc(saved.state)}）` : '收藏到 saved_trial'}</button>
      <button type="button" class="btn btn-sm" data-trial-reject="${esc(m.trial.reg)}"
        aria-label="拒收 ${esc(m.trial.short)}（仅本次视图隐藏）">拒收（零副作用）</button>
      <span class="src">收藏只落 <code>saved_trial(trial_key, saved_at)</code>，不改档案、不写判定列。</span>
    </div>
  </article>`;
}

/** 三段步骤条：不是跳转锚点，而是「现在这条流程走到哪」的可见说明。 */
function trialFlowSteps() {
  const steps = [
    ['①', '建档', '只列参与匹配的字段；未核对候选不参与'],
    ['②', '检索', '本地快照 + 在线通道；快照会过期'],
    ['③', '匹配结果', '四档分层 + 逐条证据链'],
  ];
  return `<ol class="flow-steps" aria-label="临床试验匹配流程">${steps.map(([n, t, d]) => `
    <li class="done"><b aria-hidden="true">${n}</b><span><strong>${t}</strong><small>${d}</small></span></li>`).join('')}</ol>`;
}

function trialMatchFlow() {
  const fields = trialMatchFields();
  const confirmed = fields.filter((f) => f.state === 'confirmed');
  const st = trialMatchState();
  const all = matchAllTrials().filter((m) => !st.rejected[m.trial.reg]);
  const ranked = all.filter((m) => m.band !== 'ineligible')
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const bad = all.filter((m) => m.band === 'ineligible');
  const groups = ['high', 'partial', 'needs_info'].map((band) => [band, ranked.filter((m) => m.band === band)]);
  const savedCount = Object.keys(st.saved).length;
  const rejectedCount = Object.keys(st.rejected).length;

  const fieldRow = (f) => {
    const tag = f.state === 'confirmed'
      ? '<span class="chip chip-ok">已确认入库 · 参与</span>'
      : f.state === 'candidate'
        ? '<span class="chip chip-warn">未核对候选 · 不参与</span>'
        : '<span class="chip chip-neutral">未建档 · 不参与</span>';
    return `<tr class="${f.state === 'confirmed' ? '' : 'row-muted'}">
      <td>${esc(f.label)}<div class="src">${esc(f.note || '')}</div></td>
      <td><b>${esc(f.value)}</b></td>
      <td class="src">${esc(f.source)}</td>
      <td>${tag}</td>
    </tr>`;
  };

  const step1 = `<section class="card match-step" aria-labelledby="ms1">
    <div class="card-title"><h3 id="ms1">① 建档 · 参与匹配的字段</h3>
      <span class="chip chip-ok">${confirmed.length} / ${fields.length} 项已确认</span></div>
    <div class="notice notice-info">只有「<b>已确认入库</b>」的字段参与匹配。未核对候选、未建档的字段一律不参与 ——
      它们不会被写成一个阴性结论，只会让对应条件落到「无法自动匹配 / 待确认」。</div>
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>字段</th><th>记录里是</th><th>来源（日期 · 谁记的）</th><th>是否参与匹配</th>
    </tr></thead><tbody>${fields.map(fieldRow).join('')}</tbody></table>
  </section>`;

  const step2 = `<section class="card match-step" aria-labelledby="ms2">
    <div class="card-title"><h3 id="ms2">② 检索 · 本地快照 + 在线通道</h3>
      <span class="chip chip-warn">快照会过期</span></div>
    <div class="grid grid-4" style="margin-bottom:12px">
      <div><div class="src">本地快照日期</div><div class="bc-main num">${esc(TRIALS_STATS.fetchedAt)}</div></div>
      <div><div class="src">快照内登记记录</div><div class="bc-main num">${TRIALS_STATS.total}</div></div>
      <div><div class="src">本次候选池</div><div class="bc-main num">${(TRIAL_DEMO_MATCH || []).length} / ${TRIALS_STATS.total}</div></div>
      <div><div class="src">在线通道</div><div class="bc-main">未连接</div></div>
    </div>
    <table class="tbl"><thead><tr><th>通道</th><th>状态</th><th>这一轮实际发生了什么</th></tr></thead><tbody>
      <tr><td>本地快照</td><td><span class="chip chip-ok">可用</span></td>
        <td>读本机 2026-10-23 抓取的快照；候选池是「已载 ${(TRIAL_DEMO_MATCH || []).length} / ${TRIALS_STATS.total}」的演示子集，<b>不是全库扫描</b>。</td></tr>
      <tr><td>ClinicalTrials.gov（在线）</td><td><span class="chip chip-warn">未查询</span></td>
        <td>本机演示未连 unified-trial-mcp。<b>未查询 ≠ 没有匹配</b>；FAILED / DENIED 也不算「查过」，不计覆盖率。</td></tr>
      <tr><td>ChiCTR（在线）</td><td><span class="chip chip-warn">未查询</span></td>
        <td>同上；ChinaDrugTrials（CDE）本轮未采集，未命中不能解释为不存在。</td></tr>
    </tbody></table>
    <div class="notice notice-warn" style="margin-top:12px">
      <b>快照会过期。</b>登记状态、中心与入排标准以官方登记页为准；本页没有核验日期的条目只显示「<b>未核验</b>」，
      不显示「招募中」。
    </div>
  </section>`;

  const groupBlock = ([band, list]) => (list.length ? `<div class="match-group" data-band="${band}">
      <h4 class="match-group-title">${TMATCH_BAND[band][0]} <span class="src">${list.length} 条</span></h4>
      ${list.map(trialMatchCard).join('')}
    </div>` : '');

  const step3 = `<section class="match-step" aria-labelledby="ms3">
    <div class="card-title" style="margin-bottom:10px"><h3 id="ms3">③ 匹配结果</h3>
      <span class="src">共 ${all.length} 条候选 · 已收藏 ${savedCount} · 已拒收 ${rejectedCount}</span></div>
    <div class="notice notice-stop" style="margin-bottom:14px">
      <b>本页 ${(TRIAL_DEMO_MATCH || []).length} 条匹配条目都是合成演示数据（登记号 DEMO- 开头），不是真实在招试验。</b>
      真实版本必须接 ClinicalTrials.gov / ChiCTR，逐条显示登记号、状态与核验日期。
      工作台不写「你能入组」，也不替研究团队判断谁符合；能不能参加由研究团队判断。
    </div>
    ${groups.map(groupBlock).join('') || '<div class="empty"><strong>当前没有可对照的条目</strong><p>已拒收的条目只在本次视图隐藏，不改任何记录。</p></div>'}
    ${bad.length ? `<details class="bad-trials">
      <summary>硬性条件不满足的 ${bad.length} 条（单列，不参与上面的排序）</summary>
      ${bad.map(trialMatchCard).join('')}
    </details>` : ''}
    ${Object.keys(st.rejected).length ? `<details class="bad-trials">
      <summary>已拒收 ${Object.keys(st.rejected).length} 条（只在本次视图隐藏，可恢复）</summary>
      <div class="btn-row" style="padding:8px 0">
        ${Object.keys(st.rejected).map((reg) => `<button type="button" class="btn btn-sm" data-trial-restore="${esc(reg)}"
          aria-label="恢复 ${esc(reg)}">恢复 ${esc(reg)}</button>`).join('')}
      </div>
      <p class="src">拒收不改任何记录、不写档案、不影响其它页 —— 它只是让你这次先别看。</p>
    </details>` : ''}
  </section>`;

  return `<div class="notice notice-info" style="margin-bottom:14px">
      <b>这里是「带证据链的检索线索 + 粗筛符合度」，不是入组资格结论。</b>
      判定归医生与研究中心；pct 只是登记字段对上了几项。
    </div>`
    + trialFlowSteps() + step1 + step2 + step3;
}

function pageTrials(tab) {
  let body;
  if (tab === '匹配') {
    body = trialMatchFlow();
  } else if (tab === '登记快照') {
    body = card(`2026 年登记数据：共 ${TRIALS_STATS.total} 条（抓取于 ${TRIALS_STATS.fetchedAt}）`, `
      <div class="grid grid-4" style="margin-bottom:14px">
        <div><div class="src">总记录</div><div class="bc-main num">${TRIALS_STATS.total}</div></div>
        <div><div class="src">ClinicalTrials.gov</div><div class="bc-main num">${TRIALS_STATS.ct}</div></div>
        <div><div class="src">ChiCTR</div><div class="bc-main num">${TRIALS_STATS.chictr}</div></div>
        <div><div class="src">含中国中心/注册</div><div class="bc-main num">${TRIALS_STATS.china}</div></div>
      </div>
      <div class="notice notice-warn">
        <b>登记状态不等于入组资格。</b>能否参加要以研究方案与医生判断为准。
        本页<b>不构成方案推荐</b>。
      </div>
      <table class="tbl tbl-trials" style="margin-top:14px"><thead><tr><th>登记号</th><th>标题（原文）</th><th>状态</th><th>处境</th></tr></thead><tbody>
        ${TRIALS.map((t) => `<tr>
          <td><code>${esc(t.reg)}</code></td>
          <td><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)}</a>
              <div class="src">${esc(t.sponsor)}</div></td>
          <td><span class="chip chip-neutral">${zhTrial(TRIAL_STATUS_ZH, t.status)}</span></td>
          <td><span class="chip chip-cat">${zhTrial(TRIAL_SETTING_ZH, t.setting)}</span></td>
        </tr>`).join('')}
      </tbody></table>
      <p class="src" style="margin-top:10px">
        「处境」= 该研究面向的病程阶段，来自抓取时的<b>自动分类</b>，<b>未逐条核对</b>，不代表入组资格。
        鼠标停在标签上可看原始值。
      </p>
      <p class="src" style="margin-top:10px">
        视图计数：膀胱癌视角 ${TRIALS_STATS.views.v_bladder_only} · 干预性 ${TRIALS_STATS.views.v_interventional}
        · 膀胱癌×干预性 ${TRIALS_STATS.views.v_bladder_interventional} · 含中国 ${TRIALS_STATS.views.v_china}。
        <code>utuc</code>（上尿路尿路上皮癌）与 <code>urothelial-unspecified</code>（尿路上皮癌未特指）是不同口径，已单独标注。
        ChinaDrugTrials（CDE）本轮<b>未采集</b>，未命中不能解释为不存在。
      </p>`);
  } else if (tab === '收藏与跟踪') {
    const F = TRIAL_FAVORITES;
    const withQ = F.filter((f) => /已转成/.test(f.next)).length;
    const st = trialMatchState();
    const demo = Object.keys(st.saved).map((reg) => ({ reg, ...st.saved[reg] }));
    body = card('收藏与跟踪', `
      <div class="notice notice-info"><b>收藏不等于报名</b>，也不代表你符合条件。
      收藏之后的动作只有两个：<b>转成问题</b>、<b>带去门诊</b>。</div>
      ${statStrip([
        ['本次匹配收藏', `${demo.length} 条`, '只落 saved_trial，不进档案'],
        ['手工收藏的线索', `${F.length} 条`, '来自「登记快照」页'],
        ['已转成问题', `${withQ} 条`, '可在「入组问题」页看到'],
        ['数据日期', TRIALS_STATS.fetchedAt, `共 ${TRIALS_STATS.total} 条登记记录`],
      ])}`)
    + card('本次匹配收藏（saved_trial：只存 trial_key / saved_at / 手工状态）', `
      ${demo.length ? `<table class="tbl"><thead><tr>
          <th>登记号</th><th>我为什么收藏它</th><th>收藏日期</th><th>状态（手工）</th><th>操作</th>
        </tr></thead><tbody>
          ${demo.map((d) => `<tr>
            <td><code>${esc(d.reg)}</code></td>
            <td>${esc(d.why || '（还没写理由，可以点修改补一句）')}</td>
            <td>${esc(d.on)}</td>
            <td><span class="chip chip-neutral">${esc(d.state)}</span></td>
            <td><div class="btn-row">
              <button class="btn btn-sm" data-crud="edit" data-kind="trialSaved" data-idx="${esc(d.reg)}"
                aria-label="修改收藏：${esc(d.reg)}">修改</button>
              <button class="btn btn-sm" data-crud="del" data-kind="trialSaved" data-idx="${esc(d.reg)}"
                aria-label="删除收藏：${esc(d.reg)}">删除</button>
            </div></td>
          </tr>`).join('')}
        </tbody></table>` : `<div class="empty"><strong>还没有从匹配结果里收藏的条目</strong>
          <p>去「匹配」页点「收藏到 saved_trial」；收藏只在本机留一行 key 与日期，不改档案、不写判定列。</p></div>`}
      <p class="src" style="margin-top:10px">收藏日期由本机记录；状态（在跟 / 准备问 / 已归档）是<b>手工标记</b>。
      快照没有变更历史时，这里不画进度条，也不推测结果。</p>`)
    + card('手工收藏的登记线索', `
      <table class="tbl"><thead><tr>
        <th>登记号</th><th>我为什么收藏它</th><th>收藏日期</th><th>下一步</th><th>操作</th>
      </tr></thead><tbody>
        ${F.filter((f) => !f.voided).map((f) => {
          const i = F.indexOf(f);
          return `<tr>
          <td><code>${esc(f.reg)}</code></td>
          <td>${esc(f.why)}</td>
          <td>${esc(f.on)}</td>
          <td class="src">${esc(f.next)}</td>
          <td><div class="btn-row">
            <button class="btn btn-sm" data-goto="trials" data-tab="入组问题">转成问题</button>
            <button class="btn btn-sm" data-crud="edit" data-kind="trialFav" data-idx="${i}"
              aria-label="修改收藏：${esc(f.reg)}">修改</button>
            <button class="btn btn-sm" data-crud="del" data-kind="trialFav" data-idx="${i}"
              aria-label="删除收藏：${esc(f.reg)}">删除</button>
          </div></td>
        </tr>`;
        }).join('')}
      </tbody></table>
      ${voidedBlock('trialFav', F)}
      ${collapsible('为什么收藏时要写一句「我为什么收藏它」', `
        <p>因为过两周你只会看到一串登记号，想不起来当初为什么点的那颗心。</p>
        <p>写一句话之后，即便最后不去，你也能说清自己当时在关心什么 ——
        这往往就是下次门诊最该问的那个问题。</p>`)}
      ${collapsible('收藏之后还能做什么', `
        <table class="tbl"><thead><tr><th>动作</th><th>会得到什么</th><th>不会得到什么</th></tr></thead><tbody>
          <tr><td>转成问题</td><td>进「入组问题」清单，门诊时逐条问</td><td>不会替你判断符合不符合</td></tr>
          <tr><td>带去门诊</td><td>打印或复制成一段文字</td><td>不会自动联系研究团队</td></tr>
          <tr><td>自己联系研究团队</td><td>登记页上通常有联系方式</td><td>工作台不代发、不代约</td></tr>
        </tbody></table>`)}`,
      `<button type="button" class="btn btn-sm btn-primary" data-crud="new" data-kind="trialFav">+ 手工收藏一条</button>`);
  } else {
    const Q = TRIAL_QUESTIONS;
    const studies = new Set(Q.map((q) => q.for).filter((x) => x !== '—')).size;
    const groups = [...new Set(Q.map((q) => q.group))];
    body = card('入组问题', `
      <div class="notice notice-warn"><b>能不能参加由研究团队判断，工作台不判断资格。</b>
      这一页只做一件事：把该问的问题列清楚，让你在门诊上一条不漏。</div>
      ${statStrip([
        ['问题总数', `${Q.length} 条`, `${groups.length} 组`],
        ['涉及具体研究', `${studies} 项`, '另外几条是通用问题'],
        ['还没问', `${Q.filter((q) => !q.asked).length} 条`, '下次门诊带上'],
        ['收藏的线索', `${TRIAL_FAVORITES.length} 条`, '来自「收藏与跟踪」'],
      ])}
      <table class="tbl" style="margin-top:12px"><thead><tr>
        <th>分组</th><th>问题</th><th>针对哪项研究</th><th>问了没有</th>
      </tr></thead><tbody>
        ${Q.map((q) => `<tr>
          <td class="src">${esc(q.group)}</td>
          <td>${esc(q.q)}</td>
          <td>${q.for === '—' ? '<span class="src">通用</span>' : `<code>${esc(q.for)}</code>`}</td>
          <td>${q.asked ? '<span class="chip chip-ok">已问</span>' : '<span class="chip chip-warn">未问</span>'}</td>
        </tr>`).join('')}
      </tbody></table>
      ${collapsible('登记页上的状态词，各自是什么意思', `
        <table class="tbl"><thead><tr><th>原文状态</th><th>中文</th><th>说明</th></tr></thead><tbody>
          <tr><td><code>RECRUITING</code></td><td>招募中</td><td>正在招人，可以联系问</td></tr>
          <tr><td><code>NOT_YET_RECRUITING</code></td><td>尚未招募</td><td>还没开始招，可以关注</td></tr>
          <tr><td><code>ACTIVE_NOT_RECRUITING</code></td><td>进行中但不再招募</td><td>已经招满了</td></tr>
          <tr><td><code>ENROLLING_BY_INVITATION</code></td><td>受邀入组</td><td>不公开招募，通常进不去</td></tr>
          <tr><td><code>COMPLETED</code></td><td>已完成</td><td>结束了</td></tr>
          <tr><td><code>TERMINATED</code> / <code>WITHDRAWN</code></td><td>已终止 / 已撤回</td><td>因故停止</td></tr>
        </tbody></table>
        <p class="src"><b>每一个状态都不等于「你能进」。</b>
        状态说的是这个研究招不招人，不说明你符不符合条件 —— 那是入排标准管的事。</p>`)}
      ${collapsible('这些问题该问谁', `
        <table class="tbl"><thead><tr><th>问题类型</th><th>适合问谁</th></tr></thead><tbody>
          <tr><td>我符不符合入排标准</td><td>研究团队（协调员/研究者），或你的主诊医生</td></tr>
          <tr><td>参加研究会不会打乱现在的治疗</td><td>你的主诊医生</td></tr>
          <tr><td>检查、路费、时间成本</td><td>研究团队</td></tr>
          <tr><td>知情同意书里的条款</td><td>研究团队，必要时问伦理委员会</td></tr>
        </tbody></table>
        <p class="src">工作台不替你联系任何人，也不代发消息。</p>`)}
      ${collapsible('为什么「处境」标签要标「未逐条核对」', `
        <p>「处境」是按标题文本自动分出来的（NMIBC / MIBC / 晚期 / 未特指），
        它只是一条<b>线索</b>，不是入组资格。</p>
        <p>标题里没写清楚的，自动分类只能给「未特指」。所以标签旁边永远标着
        「未逐条核对」，鼠标停上去能看到原始值 —— 让你知道这只是个入口，不是结论。</p>`)}`);
  }

  return H('临床试验', '先建档，再检索，最后才看匹配结果。粗筛符合度不是入组资格，也不代表效果；'
    + '缺字段一律写「无法自动匹配」。')
    + tabsHTML('trials') + body;
}

/* ================= 弹窗助手 =================
   统一三件事：同一时刻只允许一个弹窗；点遮罩或 [data-close] 关闭；
   document 级 Esc 关闭（焦点在哪都能退出，不依赖弹窗内聚焦）。
   长内容弹窗用固定外壳：标题与关闭常显，只有内容区滚动。 */
function openModal(html) {
  $$('.modal-mask').forEach((m) => m.remove());
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = html;
  document.body.appendChild(mask);

  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  function close() { mask.remove(); document.removeEventListener('keydown', onKey); }
  mask.addEventListener('click', (e) => { if (e.target === mask || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);

  const box = mask.querySelector('.modal');
  if (box) { box.setAttribute('tabindex', '-1'); box.focus(); }
  return { mask, close };
}

/* ================= 设置（弹窗） ================= */
function openSettings() {
  const { mask, close } = openModal(`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="setTitle">
      <div class="modal-head"><h3 id="setTitle">设置</h3>
        <button class="ag-close" data-close aria-label="关闭设置">×</button></div>
      <div class="modal-body">
        <h4 style="margin-bottom:8px">患者资料目录</h4>
        <div class="notice notice-warn">
          未接入。真实接入后这里显示：<code>~/Documents/UroPal</code> 与就绪状态；
          切换目录会使旧快照失效。<b>卸载不删除业务数据。</b>
        </div>

        <h4 style="margin:16px 0 8px">材料导入</h4>
        <div class="notice notice-info">
          导入只有一个入口：<b>病情整理 › 资料库 › 「导入材料」</b>。
          选文件、嗅探与闸门、抽候选、逐项确认、落库，五步都在同一条流程里完成 ——
          设置里不再单独配置解析，也不把某一步拆到别的页。
        </div>

        <h4 style="margin:16px 0 8px">字号</h4>
        <div class="btn-row">
          ${[['normal', '标准'], ['large', '大字'], ['xlarge', '特大']].map(([v, t]) =>
            `<button class="btn btn-sm ${STATE.textsize === v ? 'btn-primary' : ''}" data-ts="${v}">${t}</button>`).join('')}
        </div>
        <p class="src" style="margin-top:6px">大字模式下 3D 指标卡正面与背面一起升到 340px（保持一致）。</p>

        <h4 style="margin:16px 0 8px">动效</h4>
        <div class="btn-row">
          <button class="btn btn-sm ${STATE.motion === 'auto' ? 'btn-primary' : ''}" data-mo="auto">跟随系统</button>
          <button class="btn btn-sm ${STATE.motion === 'reduce' ? 'btn-primary' : ''}" data-mo="reduce">减少动效</button>
        </div>

        <h4 style="margin:16px 0 8px">指南与数据包来源</h4>
        <table class="tbl"><tbody>
          <tr><td>2026 临床试验快照</td><td>CT.gov + ChiCTR · ${TRIALS_STATS.total} 条 · ${TRIALS_STATS.fetchedAt}</td></tr>
          <tr><td>中文共识事实</td><td>11 份 · 见 docs/research/</td></tr>
          <tr><td>CTCAE</td><td>v5.0 · 随包分发</td></tr>
        </tbody></table>

        <h4 style="margin:16px 0 8px">关于</h4>
        <dl class="kv">
          <dt>版本</dt><dd><b>v${APP_VERSION}</b>（与 VERSION / package.json 一致；<b>workbench.json 尚未建立</b>，本原型为手工同步、无构建注入）</dd>
          <dt>性质</dt><dd>设计原型，数据为演示用；<b>不构成诊断或治疗建议</b></dd>
          <dt>Agent 面板</dt><dd>未接入 DSH（未验证）</dd>
        </dl>
      </div>
      <div class="modal-foot"><button class="btn" data-close>关闭</button></div>
    </div>`);
  $$('[data-ts]', mask).forEach((b) => b.addEventListener('click', () => {
    STATE.textsize = b.dataset.ts; applyPrefs(); saveState(); close(); openSettings();
  }));
  $$('[data-mo]', mask).forEach((b) => b.addEventListener('click', () => {
    STATE.motion = b.dataset.mo; applyPrefs(); saveState(); close(); openSettings();
  }));
  $$('[data-act]', mask).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.act === 'saveToken') { toast('原型不联网：令牌未写入（此处会写本机密钥文件）'); $('#mToken').value = ''; }
    if (b.dataset.act === 'clearToken') toast('已模拟清除：只删 token 键，不动环境变量');
  }));
}

/* ================= 文案红线自检 ================= */
function wordingCheck() {
  const text = $('#wbPage').innerText;
  const hits = WORDING_REDLINES.filter((w) => text.includes(w));
  openModal(`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="wdTitle">
      <div class="modal-head"><h3 id="wdTitle">文案红线自检（当前页）</h3>
        <button class="ag-close" data-close aria-label="关闭">×</button></div>
      <div class="modal-body">
        <p>检查词表：${WORDING_REDLINES.map((w) => `<code>${esc(w)}</code>`).join(' ')}</p>
        ${hits.length
          ? `<div class="notice notice-stop" style="margin-top:12px">命中 ${hits.length} 处：<b>${hits.map(esc).join('、')}</b></div>
             <ul class="wording-list" style="margin-top:10px">${hits.map((h) => `<li class="hit">${esc(h)}</li>`).join('')}</ul>`
          : `<div class="notice notice-ok" style="margin-top:12px">当前页零命中 ✅</div>`}
        <p class="src" style="margin-top:12px">正式项目由 <code>scripts/check-wording.mjs</code> 在 CI 检查。</p>
      </div>
      <div class="modal-foot"><button class="btn" data-close>关闭</button></div>
    </div>`);
}

/* ================= 事件绑定 ================= */
const APP = {};

function bindPage() {
  /* 只绑定页面内容区的元素。
     坑：不能写成 $$('[data-act]')——左侧导航的「设置」按钮也带 data-act，
     会和 renderNav 里的处理器重复触发，导致弹两个设置窗。 */
  const scope = $('#wbPage');

  // 分野闸门
  $$('[data-line]', scope).forEach((b) => b.addEventListener('click', () => {
    $$('[data-line]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    const v = b.dataset.line;
    setLine(v);
    toast(v === 'undetermined' ? '保持未定：不显示任何一条线的专属内容' : '已选定分野，看板已切换');
  }));

  // 3D 卡翻转（点击 + 键盘）
  $$('.metric-card', scope).forEach((c) => {
    const flip = () => {
      const on = c.dataset.flipped !== 'true';
      c.dataset.flipped = String(on);
      /* 视觉上翻了，读屏也要知道翻了 —— 只改 aria-hidden 不够，
         卡片自身的状态要用 aria-pressed 说出来。 */
      c.setAttribute('aria-pressed', String(on));
      const back = $('.metric-back', c), front = $('.metric-front', c);
      back.setAttribute('aria-hidden', String(!on));
      front.setAttribute('aria-hidden', String(on));
      if (on) { back.removeAttribute('inert'); front.setAttribute('inert', ''); }
      else { front.removeAttribute('inert'); back.setAttribute('inert', ''); }
    };
    c.addEventListener('click', (ev) => {
      /* 点迷你折线上的点 = 「看这个点的来源」，不是翻卡（docs/24 MT09）。
         不拦住的话，一次点击会同时弹来源又把卡片翻回正面，两件事互相抵消：
         用户点完发现卡回到正面了，却以为来源没打开。 */
      const dot = ev.target.closest && ev.target.closest('.mb-chart svg circle');
      if (dot) {
        const tip = dot.querySelector('title')?.textContent || dot.getAttribute('data-tip') || '';
        if (tip) toast(tip);
        ev.stopPropagation();
        return;
      }
      flip();
    });
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
  });

  // 一图秀：指标选择与时间窗
  $$('[data-code]', scope).forEach((cb) => cb.addEventListener('change', () => {
    const cur = new Set(APP.$chart.codes);
    if (cb.checked) { if (cur.size >= 6) { cb.checked = false; toast('最多选 6 条线'); return; } cur.add(cb.dataset.code); }
    else cur.delete(cb.dataset.code);
    APP.$chart.codes = [...cur];
    renderPage();
  }));
  $$('[data-win]', scope).forEach((b) => b.addEventListener('click', () => {
    APP.$chart.win = b.dataset.win;
    renderPage();                       // 重绘触发进场动画，切窗口有淡入过渡
    toast(`时间窗：${b.textContent.trim()}（曲线按该指标全部记录范围缩放，不因换窗口变形）`);
  }));
  $$('[data-replay-chart]', scope).forEach((b) => b.addEventListener('click', () => {
    paintCharts();                      // 只重绘图表容器，不整页重渲染（不丢滚动与焦点）
    toast('已重播趋势动画');
  }));

  // 问题清单
  $$('[data-delq]', scope).forEach((b) => b.addEventListener('click', () => {
    APP.$qs.splice(Number(b.dataset.delq), 1); renderPage();
  }));
  const addq = $('[data-addq]', scope);
  if (addq) addq.addEventListener('click', () => {
    const v = $('#newq').value.trim();
    if (!v) return toast('先写一个问题');
    APP.$qs.push(v); renderPage(); toast('已加入清单');
  });

  // 通用动作
  $$('[data-act]', scope).forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'settings') openSettings();
    else if (a === 'changeLine') {
      /* 回到分野闸门（setLine(null) 会把路由切到 dashboard） */
      /* 坑：只清 line 而不改路由，页面还停在「我的分型与分期」，闸门永远不出现 */
      STATE.line = null; STATE.route = 'dashboard'; location.hash = '#/dashboard';
      saveState(); renderNav(); renderPage(); toast('已回到分野选择，可以重新选');
    }
    else if (a === 'batchAdd') {
      /* 造口日记：一次录一批。真写进 STOMA_LOG（本机演示列表），否则「添加」只是句 toast。 */
      const on = ($('#stomaOn') || {}).value;
      if (!on) return toast('先填批次日期');
      const supply = $('#stomaSupply');
      STOMA_LOG.push({
        batchOn: on,
        supplyId: (supply && supply.value) || STOMA_SELECT(),
        changes: Number(($('#stomaChanges') || {}).value || 0),
        leaks: Number(($('#stomaLeaks') || {}).value || 0),
        skin: ($('#stomaSkin') || {}).value || '无',
      });
      renderPage();
      toast('已加入本批（本机演示，刷新重置）');
    }
    else if (a === 'toVisit') {
      /* 把「这个词要问医生」变成一条待问项：跳到复诊准备的问题清单。
         注意 hash 只带路由，不带页签 —— 页签走 STATE.tab。 */
      STATE.route = 'visit'; STATE.tab = '问题清单';
      location.hash = '#/visit';
      saveState(); renderNav(); renderPage();
      toast('已跳到「复诊准备 › 问题清单」，可以把它写成一条要问的问题');
    }
    else if (a === 'setDiversion') toast('术式是不可逆事实：改动会留痕，不覆盖旧值');
    else if (a === 'toggleShare') {
      b.dataset.on = b.dataset.on === '1' ? '0' : '1';
      b.textContent = b.dataset.on === '1' ? '本次已勾选带入 ☑' : '本次已勾选带入 ▢';
    }
  }));
  $$('[data-confirm]', scope).forEach((b) => b.addEventListener('click', () => toast('已确认（候选才进入事实层）')));

  /* 29 号：材料导入的**唯一入口**。所有页面的这个按钮都打开同一条五步流程。 */
  $$('[data-import]', scope).forEach((b) => b.addEventListener('click', () => openImportWizard()));

  /* 记录类视图的三件按钮：添加 / 修改 / 删除（软删）/ 恢复。 */
  $$('[data-crud]', scope).forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.crud;
    const kind = b.dataset.kind;
    const idx = b.dataset.idx;
    if (act === 'new') openCrudForm(kind, -1);
    else if (act === 'edit') openCrudForm(kind, idx);
    else if (act === 'del') confirmCrudDelete(kind, idx);
    else if (act === 'restore') restoreCrud(kind, idx);
  }));

  /* 35 号：匹配结果可收藏（saved_trial）/ 拒收（只在本次视图隐藏，零副作用）。 */
  $$('[data-trial-save]', scope).forEach((b) => b.addEventListener('click', () => {
    const reg = b.dataset.trialSave;
    const st = trialMatchState();
    if (st.saved[reg]) { delete st.saved[reg]; toast('已取消收藏（本机演示，不写档案）'); }
    else { st.saved[reg] = { on: TMATCH_TODAY, why: '', state: '在跟' }; toast('已收藏到 saved_trial（本机演示，不写档案）'); }
    renderPage();
  }));
  $$('[data-trial-reject]', scope).forEach((b) => b.addEventListener('click', () => {
    trialMatchState().rejected[b.dataset.trialReject] = true;
    renderPage();
    toast('已拒收：只在本次视图隐藏，不改任何记录（零副作用）');
  }));
  $$('[data-trial-restore]', scope).forEach((b) => b.addEventListener('click', () => {
    delete trialMatchState().rejected[b.dataset.trialRestore];
    renderPage();
    toast('已恢复这条候选');
  }));

  $$('[data-goto]', scope).forEach((b) => b.addEventListener('click', () => {
    const route = PAGE_FN[b.dataset.goto] ? b.dataset.goto : 'urgent';
    STATE.route = route;
    if (b.dataset.tab) STATE.tab[route] = b.dataset.tab;
    location.hash = `#/${route}`;
    renderNav(); renderPage();
  }));
}

/* ============================================================
   发送到 AI：把「当前页的处境」压成一段可以直接发出去的提示词
   ------------------------------------------------------------
   为什么要有这个按钮：患者在页面上看到的是**事实**，但到了 AI 对话框里常常
   说不清上下文 —— 每次都要重新讲一遍「我是哪条线、现在走到哪一步」。
   这个按钮把当前页的关键信息 + 想问的事 + 已知缺项 + 边界压成一段。

   三条纪律（与急症页同一套口径）：
   1) **不自建对话**：嵌入式只 postMessage bladder:agent-draft 给宿主原生会话；
      独立打开时复制到剪贴板并说明没有会话面板，页面里不出现聊天窗/输入框/发送键。
   2) **私密项默认不带**：性功能、造口日记明细、症状自评明细一律不进提示词，
      并在文末如实写出「没有带入什么」——不然 AI 会把「没说」当成「没有」。
   3) **不编造**：取不到的项写「没有」，不推测、不补全。
   ============================================================ */

/** 每页一句：我在看什么、想让 AI 做什么。键与路由 id 一致。 */
const SCENARIO = {
  dashboard: { scene: '我在看板，想先弄清接下来该做什么', ask: '请按优先级帮我排一下接下来一个月最该做的三件事，并指出哪些必须先问医生、哪些我可以自己先准备。' },
  records: { scene: '我在整理资料', ask: '帮我看看这些资料还缺什么、哪些数值需要先核对来源，以及哪些属于「没有」而不是「正常」。' },
  staging: { scene: '我在看分型与分期', ask: '帮我用患者能懂的话解释这几个词，并明确指出报告里还没说清的地方。' },
  surgery: { scene: '我在看手术记录', ask: '帮我把这几次手术按时间排清楚，并指出哪些病理信息还缺、缺了会影响什么判断。' },
  instillation: { scene: '我在看膀胱灌注', ask: '帮我理清灌注进行到哪一步、为什么中断、下次要注意什么。' },
  diversion: { scene: '我在了解尿流改道', ask: '帮我对比这几种术式在日常生活上的差别，并列出我该问医生的问题。' },
  treatment: { scene: '我在看治疗历程', ask: '帮我按线理清用过哪些方案、各自效果如何、为什么换线。' },
  followup: { scene: '我在看复查安排', ask: '帮我确认下次复查该做什么、间隔多久、有没有漏掉的，以及这次复查我要提前准备什么。' },
  metrics: { scene: '我在看检查指标', ask: '帮我看看这些指标的变化趋势，哪些需要跟医生讨论，以及哪些点之间不能直接比较。' },
  chart: { scene: '我在看病情一图秀', ask: '帮我把这几条曲线的变化讲清楚，并指出哪些点因为换机构或换方法而不可比。' },
  urgent: { scene: '我在看急症与安全', ask: '帮我确认这些情况里哪些需要马上找人、该找谁；不要给我用药或「能不能等」的判断。' },
  life: { scene: '我在记录生活与照护', ask: '帮我把这些日常记录整理成复诊时能说清楚的一段话。' },
  visit: { scene: '我在准备复诊', ask: '帮我把这些问题排个优先级，并补充我可能没想到要问的。' },
  trials: { scene: '我在看临床试验', ask: '帮我看这些试验的入组条件里，哪些我需要先确认自己是否符合。' },
};

function lineLabel() {
  return STATE.line === 'nmibc' ? '非肌层浸润（NMIBC，保膀胱线）'
    : STATE.line === 'mibc' ? '肌层浸润（MIBC，根治与改道线）'
    : STATE.line === 'undetermined' ? '分野未定（报告还没看清）'
    : '尚未分野';
}

/** 本页的关键信息：按路由取真值；取不到就跳过，不写「正常」。 */
function keyFacts() {
  const out = [`当前分野：${lineLabel()}`];
  const p = PATHOLOGY || {};
  if (p.raw) out.push(`病理原文：${p.raw}`);
  if (p.gradeRaw) out.push(`分级：${p.gradeRaw}`);
  if (p.musclePresent) out.push(`肌层：${p.musclePresent}`);
  if (p.reviewState) out.push(`核对状态：${p.reviewState}`);

  const route = STATE.route;
  if (route === 'instillation' || route === 'dashboard') {
    const ev = (INSTILLATION && INSTILLATION.events) || [];
    const done = ev.filter((e) => e.st === 'done').length;
    const next = ev.find((e) => e.st === 'planned');
    const cancelled = ev.filter((e) => e.st === 'cancelled');
    if (INSTILLATION && INSTILLATION.agent) {
      out.push(`灌注药物：${INSTILLATION.agent}${INSTILLATION.doseRaw ? ` ${INSTILLATION.doseRaw}` : ''}`);
    }
    if (ev.length) out.push(`灌注进度：已完成 ${done} 次 / 计划 ${ev.length} 次`);
    if (cancelled.length) out.push(`已取消 ${cancelled.length} 次`);
    if (next) out.push(`下一次灌注计划：${next.planned}（${next.phase}第 ${next.idx} 次）`);
  }
  if (route === 'followup' || route === 'dashboard' || route === 'visit') {
    const sc = (FOLLOWUP && FOLLOWUP.schedule) || [];
    const nxt = sc[0];
    if (nxt) out.push(`下次复查：${nxt.kind} · ${nxt.planned}（依据：${nxt.intervalSource}）`);
    if (sc.length > 1) out.push(`再往后：${sc.slice(1, 3).map((x) => `${x.kind} ${x.planned}`).join('；')}`);
  }
  if (route === 'treatment' || route === 'metrics' || route === 'chart' || route === 'visit') {
    const pts = (RENAL && RENAL.points) || [];
    const last = pts[pts.length - 1];
    if (last) out.push(`最近一次肾功能：eGFR ${last.egfr} mL/min/1.73m²、肌酐 ${last.creatinine} μmol/L（${last.date}，${last.lab}·${last.method}）`);
    if (RENAL && RENAL.threshold && RENAL.threshold.text) out.push(`顺铂门槛：${RENAL.threshold.text}`);
  }
  if (route === 'metrics' || route === 'chart') {
    const picked = (STATE.codes && STATE.codes.length ? STATE.codes : ['egfr']).slice(0, 6);
    picked.forEach((code) => {
      const m = (METRICS || []).find((x) => x.code === code);
      if (!m || !m.points || !m.points.length) return;
      const vals = m.points.map((x) => x.v);
      out.push(`${m.name}：${vals[0]} → ${vals[vals.length - 1]} ${m.unit}（共 ${vals.length} 次）`);
    });
  }
  if (route === 'surgery') {
    const c = SURGERY_CASE && SURGERY_CASE[STATE.line === 'mibc' ? 'mibc' : 'nmibc'];
    if (c) {
      (c.turbt || []).forEach((t) => out.push(`第 ${t.seq} 次 TURBT：${t.on} · ${t.complete || ''} · 肌层 ${t.muscle || '—'}`));
      if (c.reTurbt && c.reTurbt.reason) out.push(`二次电切：${c.reTurbt.plannedOn || '计划中'}（原因：${c.reTurbt.reason}）`);
      if (c.radical) out.push(`根治性切除：${c.radical.on || '—'} · ${c.radical.kind || ''}`);
    }
  }
  if (route === 'treatment') {
    const c = TREATMENT_CASE && TREATMENT_CASE[STATE.line === 'mibc' ? 'mibc' : 'nmibc'];
    if (c && c.lines) c.lines.forEach((l) => out.push(`${l.no}：${l.regimen}（${l.from || '—'} → ${l.to || '至今'}）· ${l.status}`));
  }
  if (route === 'diversion' && DIVERSION_CASE) {
    if (DIVERSION_CASE.activeKind) out.push(`当前改道方式：${DIVERSION_CASE.activeKind}`);
    if (DIVERSION_CASE.operatedOn) out.push(`手术日期：${DIVERSION_CASE.operatedOn}`);
  }
  if (route === 'visit' || route === 'dashboard') {
    const qs = (QUESTIONS || []).filter((q) => q.asked !== '已问');
    if (qs.length) {
      // 不写成「前三条：」再嵌套一层「·」——外层 map 已经加了一个「- 」，
      // 嵌套会渲染成「-   · xxx」双项目符号，复制到对话框里很难看。
      out.push(`还没问的问题 ${qs.length} 个`);
      qs.slice(0, 3).forEach((q) => out.push(`待问：${q.q}`));
    }
  }
  if (route === 'records' && RECORDS && RECORDS.files) {
    const f = RECORDS.files;
    out.push(`资料 ${f.length} 份，其中已核对 ${f.filter((x) => x.state === '已核对').length} 份、待核对 ${f.filter((x) => x.state !== '已核对').length} 份`);
  }
  return out;
}

/** 本页已知缺项：写清「没有」而不是留空（空会被 AI 读成「正常」）。 */
function gapsFor() {
  const common = ['危险度分组：来源待补（原文为图片）'];
  const byRoute = {
    instillation: ['灌注后膀胱内保留时间：来源待补'],
    followup: ['2024 随访表原文：未取到'],
    metrics: ['电解质与 B12：来源待补'],
    diversion: ['三种术式的日常生活对比：属设计假设，非指南原文'],
    urgent: ['四类急症判据的原文来源：尚未取得'],
    chart: ['肌酐与 eGFR 的方法变更未逐点标注'],
  };
  return (byRoute[STATE.route] || []).concat(common);
}

/** 组装提示词。顺序固定：要做什么 → 我这边的事实 → 缺什么 → 没带什么 → 边界。 */
function buildAIPrompt() {
  const sc = SCENARIO[STATE.route] || { scene: `我在「${STATE.route}」这一页`, ask: '帮我把这一页的信息理一理。' };
  const tabs = tabsFor(STATE.route);
  const where = tabs.current ? `${sc.scene}（当前页签：${tabs.current}）` : sc.scene;
  const lines = [
    '【我想让 AI 帮我做的事】',
    `${where}。${sc.ask}`,
    '',
    '【我这边的关键信息】',
    ...keyFacts().map((f) => `- ${f}`),
    '',
    '【已知缺项（没有就说没有，不要补）】',
    ...(gapsFor().length ? gapsFor().map((g) => `- ${g}`) : ['- 无']),
    '',
    '【没有带入的内容】',
    '- 性功能与亲密记录（默认私密）',
    '- 造口日记明细、控尿记录明细（默认私密）',
    '- 症状自评明细（默认私密）',
    '',
    '【边界】',
    '- 以上是我的记录，不是诊断，请基于这些信息回答。',
    '- 凡是要改药、改方案、判断能不能等的，请明确说「需要我的医生确认」，不要替我决定。',
  ];
  return lines.join('\n');
}

/** 页内「发送到 AI」只把提示词交给宿主原生会话，不自建聊天窗口、不代按发送键。
    嵌入式（宿主 iframe）走 bladder:agent-draft；独立打开时复制草稿并明确说明没有会话面板。 */
function sendToAI(asDraft = false) {
  const text = buildAIPrompt();
  const embedded = (() => { try { return window.parent && window.parent !== window } catch { return false } })();
  if (embedded) {
    try {
      window.parent.postMessage({ type: 'bladder:agent-draft', prompt: text, send: !asDraft }, location.origin);
      toast(asDraft ? '已把摘要提示词填入 AI 对话草稿' : '已把场景提示词交给 AI 对话');
      return;
    } catch { /* postMessage 不可用：退回复制 */ }
  }
  const done = () => toast(asDraft ? '已复制摘要提示词；此处没有页面内 AI 会话面板' : '已复制场景提示词；此处没有页面内 AI 会话面板');
  const fail = () => toast('此环境没有 AI 会话面板，也不能自动复制，请手动选择');
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fail);
  else fail();
}

/* ================= 路由与渲染 ================= */
const PAGE_FN = {
  dashboard: () => pageDashboard(),
  records: (t) => pageRecords(t),
  staging: (t) => pageStaging(t),
  surgery: (t) => pageSurgery(t),
  instillation: (t) => pageInstillation(t),
  diversion: (t) => pageDiversion(t),
  treatment: (t) => pageTreatment(t),
  followup: (t) => pageFollowup(t),
  metrics: (t) => pageMetrics(t),
  chart: () => pageChart(),
  urgent: () => pageUrgent(),
  life: (t) => pageLife(t),
  visit: (t) => pageVisit(t),
  trials: (t) => pageTrials(t),
};

const STATUS_TEXT = {
  dashboard: '看板 · 原型模式 · 数据为演示用',
  instillation: '膀胱灌注 · 周期与禁忌',
  followup: '复查与膀胱镜 · 检查即心理事件',
  urgent: '急症与安全 · 不判断病情，不给处置建议',
  trials: `临床试验 · 2026 登记数据 ${TRIALS_STATS.total} 条 · 抓取于 ${TRIALS_STATS.fetchedAt}`,
};

/* ================= 图表宿主：按容器真实宽度 1:1 渲染 =================
   勿改回「固定 viewBox 再让 CSS 拉满」：那会 letterbox，
   绘图区被缩窄而治疗条是满宽 HTML 层，两者必然对不齐。 */
function paintCharts() {
  $$('.chart-block').forEach((block) => {
    const host = block.querySelector('.chart-host');
    if (!host) return;
    const leg = block.querySelector('[data-legend]');
    const codes = (block.getAttribute('data-codes') || '').split(',').map((x) => x.trim()).filter(Boolean);
    const win = block.getAttribute('data-win') || 'all';
    const w = Math.max(360, Math.round(host.clientWidth));
    const r = CHART.render(codes, win, w);
    host.innerHTML = r.empty
      ? `<div class="treat-lane"></div><div class="plot"><div class="plot-empty">${esc(r.reason || '所选时间窗内没有记录')}</div></div>`
      : `<div class="treat-lane" style="height:${r.laneH || 30}px">${r.treatLane}</div><div class="plot">${r.svg}</div>`;
    if (leg) leg.innerHTML = r.legend || '';
    /* 悬停提示：一个可见的浮层（不是只有 <title>）。放在 .chart-block 里，
       位置按「点相对 block」计算，所以 chart-wrap 横滚时也不会飘。 */
    if (!block.querySelector('.chart-tip')) {
      const tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.setAttribute('role', 'status');
      tip.setAttribute('aria-live', 'polite');
      tip.hidden = true;
      block.appendChild(tip);
    }
  });
  paintSparklines();
  bindChartInteractions();
}

/** 一图秀的悬停 / 聚焦 / 点击（小巢宝同款交互：点悬停提示 + 治疗节点可点）。 */
function bindChartInteractions() {
  $$('.chart-block').forEach((block) => {
    if (block.dataset.tipBound === '1') return;
    block.dataset.tipBound = '1';
    const tip = block.querySelector('.chart-tip');
    if (!tip) return;

    const showAt = (text, clientX, clientY) => {
      if (!text) return;
      const box = block.getBoundingClientRect();
      tip.textContent = text;
      tip.hidden = false;
      const tw = 240;
      const left = Math.min(Math.max(8, clientX - box.left + 12), Math.max(8, box.width - tw));
      const top = Math.max(8, clientY - box.top - 14);
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };
    const hide = () => { tip.hidden = true; };

    block.addEventListener('pointermove', (e) => {
      const dot = e.target.closest && e.target.closest('.series-dot');
      if (dot) { showAt(dot.getAttribute('data-tip') || '', e.clientX, e.clientY); return; }
      const mark = e.target.closest && e.target.closest('.treat-mark');
      if (mark) { showAt(mark.getAttribute('data-tip') || '', e.clientX, e.clientY); return; }
      hide();
    });
    block.addEventListener('pointerleave', hide);
    /* 键盘：Tab 到点/治疗节点时同样能看到提示（R12：键盘能到、内容可读）。 */
    block.addEventListener('focusin', (e) => {
      const el = e.target.closest && e.target.closest('.series-dot, .treat-mark');
      if (!el) return;
      const r = el.getBoundingClientRect();
      showAt(el.getAttribute('data-tip') || el.getAttribute('aria-label') || '', r.left + r.width / 2, r.top);
    });
    block.addEventListener('focusout', hide);
    block.addEventListener('click', (e) => {
      const mark = e.target.closest && e.target.closest('.treat-mark');
      if (mark) toast(`${mark.getAttribute('data-tip') || mark.getAttribute('aria-label')}｜这条事件不影响曲线坐标`);
    });
  });
}

/* 3D 卡背面的迷你折线按容器实测尺寸重绘 —— 尺寸随卡片宽度/字号档变化，
   必须跟一图秀走同一套重绘路径（否则停在某个旧尺寸上又会被拉伸）。 */
function paintSparklines() {
  $$('.mb-chart[data-spark]').forEach((host) => {
    const m = METRICS.find((x) => x.code === host.dataset.spark);
    if (!m) return;
    const w = Math.max(80, Math.round(host.clientWidth));
    const h = Math.max(50, Math.round(host.clientHeight));
    host.innerHTML = CHART.sparkline(m, w, h);
  });
}
/* 面板宽度、字号、窗口变化都会改宿主宽度 —— 都要重绘，否则图表停在旧宽度 */
let chartTimer = null;
function scheduleCharts() {
  clearTimeout(chartTimer);
  chartTimer = setTimeout(paintCharts, 90);
}

function renderPage() {
  const { current } = tabsFor(STATE.route);
  const fn = PAGE_FN[STATE.route] || (() => '<div class="empty"><strong>页面不存在</strong></div>');
  $('#wbPage').innerHTML = fn(current);
  renderCrumb();
  $('#tbStatus').textContent = STATUS_TEXT[STATE.route] || `小泉宝 UroPal · ${NAV.find((n) => n.id === STATE.route)?.text || ''} · 原型模式`;
  bindTabs(STATE.route);
  bindPage();
  paintCharts();
}

function routeFromHash() {
  const r = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  STATE.route = PAGE_FN[r] ? r : 'dashboard';
}

/* ================= 启动 ================= */
function boot() {
  loadState();
  applyPrefs();
  routeFromHash();
  renderNav();
  renderPage();

  // 「发送到 AI」的按钮渲染在面包屑里，在 .wb-page 作用域之外，所以用 document 级代理。
  // 它只把提示词 postMessage 给宿主原生会话，页面里没有自建聊天窗。
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!t || !t.closest) return;
    const btn = t.closest('[data-act="toAI"]');
    if (btn) { ev.preventDefault(); sendToAI(btn.dataset.toAi === 'draft'); }
  });
  $('#btnWording').addEventListener('click', wordingCheck);
  const btnTs = $('#btnTextSize');
  const cycle = { normal: 'large', large: 'xlarge', xlarge: 'normal' };
  const syncTs = () => {
    const big = STATE.textsize !== 'normal';
    btnTs.setAttribute('aria-pressed', String(big));
    btnTs.title = big ? `当前：${STATE.textsize === 'xlarge' ? '巨大字' : '大字'}，点击切换` : '切换大字模式';
  };
  btnTs.addEventListener('click', () => {
    STATE.textsize = cycle[STATE.textsize] || 'normal';
    applyPrefs(); syncTs(); saveState();
    toast(`字号：${{ normal: '标准', large: '大字', xlarge: '巨大字' }[STATE.textsize]}`);
  });
  syncTs();

  window.addEventListener('hashchange', () => { routeFromHash(); renderNav(); renderPage(); });
  /* 换行/字号变化都会改顶栏高度，抽屉与 sticky 偏移必须跟着重算 */
  window.addEventListener('resize', () => { syncChromeHeight(); scheduleCharts(); });
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => syncChromeHeight());
    ro.observe(document.querySelector('.wb-topbar'));
    ro.observe(document.querySelector('.wb-demo-bar'));
  }
}

document.addEventListener('DOMContentLoaded', boot);
