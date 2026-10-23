/* ============================================================
   小泉宝 UroPal · 原型应用 v0.1
   路由 / 12 个一级页 / 分野闸门 / 一图秀 / 3D 卡 / Agent 面板 / 设置
   ⚠️ 原型：数据为演示用；不含真实患者信息；不构成诊断或治疗建议。
   ============================================================ */
'use strict';

const APP_VERSION = '0.1.0';

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
        <span class="nav-brand-tag">陪你把两条路走清楚</span>
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
  $('#wbCrumb').innerHTML = `小泉宝工作台 / <b>${esc(def ? def.text : '看板')}</b>`
    + (current ? ` / ${esc(current)}` : '')
    + ` <span class="crumb-note">· 演示档案 ${esc(line)} · 全部为模拟资料</span>`;
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
    <div class="strip">
      <div class="strip-main">
        <div class="strip-head">膀胱灌注 诱导 3 / 6 次已完成</div>
        <div class="strip-note">2026-10-23 因<b>肉眼血尿</b>取消这一次 · 下一次计划 2026-10-30。
          取消不是恶化，是禁忌在保护你；漏做不做补做建议。</div>
      </div>
      <div class="strip-actions">
        <button type="button" class="btn btn-primary" data-goto="instillation">看灌注周期</button>
        <button type="button" class="btn" data-goto="visit">带去复诊的问题</button>
      </div>
    </div>` : `
    <div class="strip">
      <div class="strip-main">
        <div class="strip-head">尿流改道术式 尚未记录</div>
        <div class="strip-note">三种术式<b>各自独立</b>：回肠造口 / 原位新膀胱 / 输尿管皮肤造口。
          选定后改动会留痕，不覆盖旧值。</div>
      </div>
      <div class="strip-actions">
        <button type="button" class="btn btn-primary" data-goto="diversion">三术式对照</button>
        <button type="button" class="btn" data-goto="treatment">肾功能门槛</button>
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
    + card('急症入口（不用先分野，30 秒内可达）', `
        <div class="btn-row">
          ${URGENT.map((u) => `<button type="button" class="btn btn-urgent" data-goto="urgent">${esc(u.cat)}</button>`).join('')}
        </div>
        <p class="src" style="margin-top:10px">四类判据的来源在原型阶段<b>尚未取得</b>（见「急症与安全」页），界面不给处置建议，只给联系路径。</p>`);
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
function pageRecords(tab) {
  const F = RECORDS.files;
  const confirmed = F.filter((f) => f.state === '已核对').length;
  const pending = F.length - confirmed;

  const libBody = () => card('资料库', `
    <div class="notice notice-info">这里放<b>原件抄下来的东西</b>。资料进来只是「有这份东西」，
    不等于里面的数字已经进了病情档案 —— 那要逐项核对。</div>
    ${statStrip([
      ['资料份数', `${F.length} 份`, '按原件计'],
      ['已核对', `${confirmed} 份`, '数字已进病情档案'],
      ['待核对', `${pending} 份`, '只有原件，还没逐项确认'],
      ['最近一份', F[F.length - 1].on, F[F.length - 1].by],
    ])}
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>资料</th><th>类型</th><th>报告日期</th><th>机构</th><th class="num">页数</th><th>核对状态</th>
    </tr></thead><tbody>
      ${F.map((f) => `<tr>
        <td>${esc(f.name)}</td><td>${esc(f.kind)}</td><td>${esc(f.on)}</td>
        <td>${esc(f.by)}</td><td class="num">${f.pages}</td>
        <td>${f.state === '已核对' ? `<span class="chip chip-ok">${esc(f.state)}</span>` : `<span class="chip chip-warn">${esc(f.state)}</span>`}</td>
      </tr>`).join('')}
    </tbody></table>
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
      对不上时也能一眼看到是原件抄错了，还是你记错了。</p>`)}`);

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
      ${RECORDS.drafts.map((d) => `<tr>
        <td>${esc(d.field)}</td>
        <td>${d.value ? esc(d.value) : '<span class="chip chip-warn">留空待手填</span>'}</td>
        <td class="src">${esc(d.quote)}${d.why ? `<br>${esc(d.why)}` : ''}</td>
        <td>${d.ok ? '<div class="btn-row"><button class="btn btn-sm btn-primary" data-confirm>确认</button><button class="btn btn-sm">忽略</button></div>' : '<span class="src">需手填</span>'}</td>
      </tr>`).join('')}
    </tbody></table>
    ${collapsible('为什么非要逐项确认，不能一键全收', `
      <p>因为自动识别一定会出错 —— 特别是数字和单位。而这类错误不会报错、不会变红，
      只会在几个月后变成一条对不上的曲线。</p>
      <p>逐项确认是<b>你唯一能拦住它的地方</b>。所以这一步不做「全部确认」按钮，只能一条一条点。</p>`)}`);

  const fileBody = () => card('病情档案（已确认事实）', `
    <div class="notice notice-info">每条都记了<b>谁记的、记的是谁、什么时候记的</b>。
    换一个照护者接手时，不用问患者也能对上。</div>
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>项目</th><th>内容</th><th>谁记的</th><th>记录日期</th><th>核对状态</th>
    </tr></thead><tbody>
      ${RECORDS.facts.map((f) => `<tr>
        <td>${esc(f.item)}</td>
        <td>${esc(f.value)}</td>
        <td class="src">${esc(f.by)}</td>
        <td>${esc(f.on)}</td>
        <td>${f.state === '已核对' ? `<span class="chip chip-ok">${esc(f.state)}</span>` : `<span class="chip chip-warn">${esc(f.state)}</span>`}</td>
      </tr>`).join('')}
    </tbody></table>
    <p class="src" style="margin-top:10px">「已核对」只表示<b>转录没错</b>，
    <b>不等于医学审核</b>。诊断与处置仍以你的医疗团队为准。</p>
    <dl class="kv" style="margin-top:12px">
      <dt>病理结论原文</dt><dd>${esc(PATHOLOGY.raw)} ${src(PATHOLOGY.source)}</dd>
      <dt>分级（原文）</dt><dd>${esc(PATHOLOGY.gradeRaw)} <span class="src">报告未写分级体系名；不做换算</span></dd>
      <dt>有无肌层组织</dt><dd>${esc(PATHOLOGY.musclePresent)} <span class="chip chip-warn">分期可能不完整</span></dd>
    </dl>`);

  const summaryBody = () => {
    const bySource = ['医生记录', '本人自述', '照护者代记', '待核对草稿'];
    return card('病情汇总', `
      ${statStrip([
        ['已确认事实', `${RECORDS.facts.filter((f) => f.state === '已核对').length} 条`, `共 ${RECORDS.facts.length} 条`],
        ['资料', `${RECORDS.files.length} 份`, `${RECORDS.files.filter((f) => f.state === '待核对').length} 份待核对`],
        ['待核对草稿', `${RECORDS.drafts.filter((d) => d.ok).length} 条`, '不参与汇总'],
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
          <tr><td>核对状态</td><td><span class="chip chip-warn">${esc(p.reviewState)}</span></td><td class="src">「已核对」只表示抄录无误，不是医学审核</td></tr>
        </tbody></table>
        <p class="src" style="margin-top:10px">报告原文里没有的项，这里一律写「未提及」，<b>不写成「无」</b>。</p>`),
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
      <table class="tbl"><thead><tr><th>日期</th><th>感受</th><th>强度（自评）</th><th>持续</th></tr></thead><tbody>
        <tr><td>2026-10-16</td><td>尿频、尿急，排尿时灼热</td><td class="num">4 / 10</td><td>约 2 天</td></tr>
        <tr><td>2026-10-09</td><td>当天乏力，第二天好转</td><td class="num">2 / 10</td><td>1 天</td></tr>
        <tr><td>2026-10-02</td><td>无明显不适</td><td class="num">0 / 10</td><td>—</td></tr>
      </tbody></table>
      <p class="src" style="margin-top:10px">分级判据原文为图片未取得，此处<b>不做分级</b>，只记自评强度。<span class="verify-tag">来源待补</span></p>`)
      + card('这类不适，什么时候必须联系医生', `
        <div class="notice notice-warn">
          灌注后出现<b>发热寒战、并且持续不缓解</b>，或伴明显乏力、血压偏低 —— 属于需要立刻联系医疗团队的情况，
          不要等到下次门诊。详见「急症与安全」页的 <b>BCG 全身感染</b>入口。
          <span class="verify-tag">判据来源待补</span>
        </div>
        <p class="src" style="margin-top:10px">原型阶段只给联系路径，不判断你的具体情况，也不给处置建议。
          分级表原文补齐后，这里会显示「对照哪一版共识 · 第几级」。</p>`),
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
    body = statStrip([
      ['近 30 天更换底盘', `${STOMA_LOG.reduce((a, l) => a + l.changes, 0)} 次`, '按批次加总'],
      ['近 30 天渗漏', `${STOMA_LOG.reduce((a, l) => a + l.leaks, 0)} 次`, '次数 ≠ 严重程度'],
      ['皮肤发红批次', `${STOMA_LOG.filter((l) => l.skin === '红').length} 批`, '按批次算'],
      ['记法', '一次录一批', '不需要每天打卡'],
    ]) + card('造口日记（一次录一批）', `
      <div class="notice notice-info">按<b>一批</b>记录，不需要每天打卡。耗材型号从目录里选，不用每次重打。</div>
      <div class="batch-row" style="margin-top:14px">
        <label class="bf"><span>批次日期</span><input type="date" value="2026-10-23"></label>
        <label class="bf"><span>耗材</span><select>${STOMA_SUPPLY.map((s) => `<option>${esc(s.kind)} · ${esc(s.brand)}</option>`).join('')}</select></label>
        <label class="bf"><span>更换次数</span><input type="number" value="2" min="0"></label>
        <label class="bf"><span>渗漏次数</span><input type="number" value="1" min="0"></label>
        <label class="bf"><span>皮肤状态</span><select><option>无</option><option selected>红</option><option>破溃</option><option>其他</option></select></label>
        <button class="btn btn-primary" data-act="batchAdd">加入本批</button>
      </div>
      <table class="tbl" style="margin-top:14px"><thead><tr><th>批次</th><th>耗材</th><th class="num">更换</th><th class="num">渗漏</th><th>皮肤</th></tr></thead><tbody>
        ${STOMA_LOG.map((l) => `<tr><td>${esc(l.batchOn)}</td><td>${esc(l.supplyId === 's1' ? '底盘 · 演示A' : l.supplyId)}</td>
          <td class="num">${l.changes}</td><td class="num">${l.leaks}</td><td>${esc(l.skin)}</td></tr>`).join('')}
      </tbody></table>`)
    + `<div class="cols-2" style="margin-top:16px">
        ${card('最近 30 天小结（只数次数，不判断好坏）', `
          <table class="tbl">
            <thead><tr><th>项目</th><th class="num">次数</th><th>怎么来的</th></tr></thead>
            <tbody>
              <tr><td>更换底盘</td><td class="num">${STOMA_LOG.reduce((a, l) => a + l.changes, 0)}</td><td>把上面每一批的次数加总</td></tr>
              <tr><td>发生渗漏</td><td class="num">${STOMA_LOG.reduce((a, l) => a + l.leaks, 0)}</td><td>同上；渗漏<b>次数</b>不等于严重程度</td></tr>
              <tr><td>皮肤发红</td><td class="num">${STOMA_LOG.filter((l) => l.skin === '红').length}</td><td>按批次数到「红」的批数</td></tr>
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
  let body;
  if (tab === '分类指标卡') {
    const cats = [...new Set(METRICS.map((m) => m.cat))];
    const total = METRICS.reduce((a, m) => a + m.points.length, 0);
    const lastD = METRICS.flatMap((m) => m.points.map((p) => p.d)).sort().pop();
    const split = METRICS.filter((m) => CHART.groupsOf && CHART.groupsOf(m).length > 1);
    body = `<div class="strip" style="margin-bottom:16px">
        <div class="strip-main">
          <div class="strip-head">${METRICS.length} 项指标 · ${cats.length} 个分组 · ${total} 条记录 · 最近更新 ${esc(lastD)}</div>
          <div class="strip-note">分组顺序与「病情一图秀」同一来源，两页一致。
            ${split.length ? `其中 <b>${split.map((m) => esc(m.name)).join('、')}</b> 的机构或方法中途变过，已拆成不同<b>可比组</b>，不跨组连线。`
              : '全部指标机构与方法一致。'}</div>
        </div>
        <div class="strip-actions"><button type="button" class="btn" data-goto="chart">打开一图秀</button></div>
      </div>
      <div class="metric-grid" data-metric-grid>${METRICS.map((m, i) => metricCardHTML(m, i)).join('')}</div>
      <p class="src" style="margin-top:12px">卡背面是<b>固定高度 3D 翻转</b>，不是向下展开。
        点卡片或按回车/空格翻转；≥700px 两列，窄屏一列，不做三列以上。</p>`;
  } else if (tab === '电解质与 B12') {
    body = card('电解质与代谢（长期）', `
      <div class="notice notice-warn">
        B12、碳酸氢盐、氯、尿路感染与结石这几项，在已精读的 11 份中文共识里<b>查不到原文出处</b>。
        字段位置先留出来，但<b>不填数字、不做解释</b>。<span class="verify-tag">来源待补</span>
      </div>
      <div class="empty" style="margin-top:12px"><strong>还没有记录</strong>来源补齐后再开放</div>`);
  } else if (tab === '肾功能') {
    body = card('肾功能', `
      <table class="tbl"><thead><tr><th>日期</th><th class="num">eGFR</th><th class="num">肌酐</th><th>方法</th><th>机构</th></tr></thead><tbody>
        ${RENAL.points.map((p) => `<tr><td>${esc(p.date)}</td><td class="num">${p.egfr}</td><td class="num">${p.creatinine}</td><td>${esc(p.method)}</td><td>${esc(p.lab)}</td></tr>`).join('')}
      </tbody></table>
      <div class="kv" style="margin-top:14px">
        <dt>分肾功能</dt><dd><span class="src">还没有记录（核素肾图等）</span></dd>
        <dt>肾积水与引流</dt><dd>${esc(RENAL.drainage.kind)}</dd>
        <dt>顺铂门槛</dt><dd>${esc(RENAL.threshold.text)} ${src(RENAL.threshold.source)}</dd>
      </div>`);
  } else {
    const cats2 = [...new Set(METRICS.map((m) => m.cat))];
    body = card('指标总览（与一图秀同源）', `
      <div class="btn-row" style="margin-bottom:12px">
        ${cats2.map((c) => `<span class="chip chip-cat">${esc(c)} · ${METRICS.filter((m) => m.cat === c).length} 项</span>`).join('')}
      </div>
      <table class="tbl"><thead><tr><th>分组</th><th>指标</th><th class="num">最近值</th><th>单位</th><th>日期</th><th>分级</th></tr></thead><tbody>
        ${METRICS.map((m) => {
          const last = m.points[m.points.length - 1];
          return `<tr><td><span class="chip chip-cat">${esc(m.cat)}</span></td><td>${esc(m.name)}</td>
            <td class="num">${CHART.fmt(last.v)}</td><td>${esc(m.unit)}</td><td>${esc(last.d)}</td>
            <td>${m.ctcae ? `<span class="chip chip-warn">${esc(m.ctcae.text)}</span>` : '<span class="src">未启用</span>'}</td></tr>`;
        }).join('')}
      </tbody></table>
      <p class="src" style="margin-top:10px">
        分级只对 CTCAE v5.0 中有<b>绝对数值界限</b>的项启用；「×ULN」型未拿到结构化参考上限前不启用、不近似。
        分级是<b>对照不是诊断</b>，读取时计算，不落库。原文见 assets/reference/ctcae/。
      </p>
      <p class="src" style="margin-top:6px">分类指标（${CATEGORICAL.map((c) => esc(c.name)).join('、')}）不进折线图。</p>`);
  }
  return H('检查与指标', '同一指标目录供指标页与一图秀共用；分组顺序两页一致。')
    + tabsHTML('metrics') + body;
}

/* 参考范围尺：只标「最近值落在哪」，不做好坏着色、不做判断 */
/* 参考范围说明另起一行。原先夹在上下限中间，窄屏读起来像一句话
   （「90 浅色区 = … —」）。单侧范围也不再用「—」冒充上限。 */
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

  return H('病情一图秀', '每条线按该指标<b>全期</b> min/max 归一化，所以不同线之间<b>不可比</b>；治疗条单独一层。')
    + card('选择指标（最多 6 条）', `<div class="btn-row">${opts}</div>
        <p class="src" style="margin-top:10px">分类变量（${CATEGORICAL.map((c) => esc(c.name)).join('、')}）不进折线图。</p>`)
    + card('时间轴', `
      <div class="chart-toolbar">
        ${wins.map(([v, t]) => `<button class="btn btn-sm ${state.win === v ? 'btn-primary' : ''}" data-win="${v}">${t}</button>`).join('')}
        <span class="src" style="margin-left:auto">治疗事件：${CHART.TREATMENTS.length} 个</span>
      </div>
      ${plotBlock}
      <p class="legend-note">
        单点不连线；空窗口给空态；末点每序列只标一次。点数据点可看到日期、值、机构与方法。
      </p>
      <p class="legend-note">动画：<code>pathLength=1</code> + <code>stroke-dashoffset</code>，点按 45ms 递增延迟；减少动效时直接给终态。</p>`)
    + card('治疗事件（与节点同 ID 联动）', `
      <table class="tbl"><thead><tr><th>日期</th><th>事件</th><th>ID</th></tr></thead><tbody>
        ${CHART.TREATMENTS.map((t) => `<tr><td>${esc(t.d)}</td><td>${esc(t.label)}</td><td><code>${esc(t.id)}</code></td></tr>`).join('')}
      </tbody></table>`);
}

/* ================= 11. 急症与安全 ================= */
function pageUrgent() {
  return H('急症与安全', '四类情况各自有入口。<b>这里不解释原因，也不告诉你怎么处理</b>——请联系你的医疗团队。')
    + `<div class="notice notice-stop" style="margin-bottom:16px">
         出现下面任何一类情况，请<b>尽快联系你的医疗团队或就近急诊</b>。本页只帮你判断「这算不算需要马上处理」。
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
      <p>工作台不判断病情，也不给处置建议。它只做两件事：帮你把情况说清楚，帮你更快找到人。</p>`)
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
  const asked = QUESTIONS.filter((q) => q.asked === '已问').length;

  const qBody = () => card('要问医生的问题', `
    <div class="notice notice-info">问题问完要<b>当场把答案记下来</b>，
    否则下次门诊还会问同一句。没问到的不删，留着下次接着问。</div>
    ${statStrip([
      ['问题总数', `${QUESTIONS.length} 条`, '按场景分组'],
      ['已问', `${asked} 条`, '已记下医生的回答'],
      ['还没问', `${QUESTIONS.length - asked} 条`, '下次门诊带上'],
      ['分组', `${new Set(QUESTIONS.map((q) => q.group)).size} 组`, '病理 / 灌注 / 复查 / 肾功能 / 急症'],
    ])}
    <table class="tbl" style="margin-top:12px"><thead><tr>
      <th>场景</th><th>问题</th><th>问了没有</th><th>医生怎么答（原文）</th>
    </tr></thead><tbody>
      ${QUESTIONS.map((q) => `<tr>
        <td class="src">${esc(q.group)}</td>
        <td>${esc(q.q)}</td>
        <td>${q.asked === '已问' ? `<span class="chip chip-ok">${esc(q.asked)}</span>` : `<span class="chip chip-warn">${esc(q.asked)}</span>`}</td>
        <td>${q.answer ? esc(q.answer) : '<span class="src">—</span>'}</td>
      </tr>`).join('')}
    </tbody></table>
    <div class="btn-row" style="margin-top:14px">
      <button type="button" class="btn btn-primary">+ 加一个问题</button>
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
      <button type="button" class="btn">带入 AI 对话</button>
    </div>
    <p class="src" style="margin-top:8px">
      导出会得到格式真实的文件。带入 AI 对话只会把摘要放进草稿框，
      <b>不会自动发送</b>；草稿里不含本机资料目录路径。</p>`);

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

function pageTrials(tab) {
  let body;
  if (tab === '线索') {
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
  } else if (tab === '已收藏') {
    body = card('已收藏', `<div class="empty"><strong>还没有收藏</strong>在「线索」里点选后可收藏，并转成入组问题。</div>`);
  } else {
    body = card('入组问题', `
      <ul style="font-size:var(--fs-md)">
        <li>这个研究在招的是不是我这一类（NMIBC / MIBC / 晚期）？</li>
        <li>我之前做过 BCG 并且失败，算不算符合条件？</li>
        <li>eGFR 66 会不会影响入组？</li>
      </ul>
      <p class="src" style="margin-top:10px">问题的答案由研究团队判断，工作台不判断资格。</p>`);
  }
  return H('临床试验', '2026 年真实登记数据；登记状态 ≠ 入组资格；不构成推荐。')
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

        <h4 style="margin:16px 0 8px">文档解析（PDF 报告导入）</h4>
        <dl class="kv">
          <dt>状态</dt><dd><span class="chip chip-neutral">未配置</span></dd>
          <dt>令牌来源</dt><dd>无（优先级：显式 &gt; 文件 &gt; 环境变量）</dd>
          <dt>密钥文件</dt><dd><code>~/.uropal/secrets/mineru.json</code>（<span class="src">当前不存在</span>）</dd>
        </dl>
        <div class="field" style="margin-top:12px">
          <label for="mToken">MinerU 令牌</label>
          <input type="password" id="mToken" autocomplete="new-password" placeholder="粘贴令牌后点保存">
          <span class="hint">令牌只写入本机密钥文件（权限 600）；界面与日志只显示掩码，永不回显原文。</span>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-act="saveToken">保存</button>
          <button class="btn" data-act="clearToken">清除</button>
          <a class="btn" href="https://mineru.net" target="_blank" rel="noopener">申请地址</a>
        </div>
        <p class="src" style="margin-top:8px">本原型<b>不联网</b>，以上为接口与界面骨架。</p>

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
          <dt>版本</dt><dd><b>v${APP_VERSION}</b>（与 package.json / VERSION / workbench.json 同源）</dd>
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

/* ================= Agent 面板 ================= */
function renderAgent() {
  const pane = $('#agentPane'), sp = $('#splitter'), btn = $('#btnAgent');
  pane.hidden = !STATE.agentOpen;
  sp.hidden = !STATE.agentOpen;
  btn.setAttribute('aria-expanded', String(STATE.agentOpen));
  btn.textContent = STATE.agentOpen ? '收起 AI 对话' : '打开 AI 对话';
  $('#agState').dataset.state = STATE.agentOpen ? 'ready' : 'idle';
  $('#agState').textContent = STATE.agentOpen ? '已连接（原型）' : '未连接';
  if (!STATE.agentOpen) return;

  const d = DRAFT_SCOPES[STATE.draftScope];
  $('#agDraft').innerHTML = `
    <div class="ag-block"><h4>范围：${esc(d.label)}</h4></div>
    ${d.blocks.map((b) => `<div class="ag-block"><h4>${esc(b.label)}</h4>
      <ul>${b.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')}
    <div class="ag-block ag-gap"><h4>缺项（写「没有」，不补不推测）</h4>
      <ul>${d.gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
    <div class="ag-block ag-excl"><h4>已排除</h4>
      <ul>${d.excluded.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
    <p class="src">「已确认」只表示转录核对，<b>不等于医学审核</b>。</p>`;
  sp.setAttribute('aria-valuenow', String(STATE.agentWidth));
  scheduleCharts();
}

/* 拖动分隔器（按容器 rect 夹取） */
function initSplitter() {
  const sp = $('#splitter');
  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const bodyW = $('.wb-body').getBoundingClientRect().width;
    const pct = ((e.clientX - $('.wb-body').getBoundingClientRect().left) / bodyW) * 100;
    STATE.agentWidth = clampAgentWidth(100 - pct);   // 面板在右
    applyPrefs(); scheduleCharts();
  };
  sp.addEventListener('pointerdown', (e) => { dragging = true; sp.setPointerCapture(e.pointerId); });
  sp.addEventListener('pointermove', onMove);
  sp.addEventListener('pointerup', () => { dragging = false; saveState(); scheduleCharts(); });
  sp.addEventListener('keydown', (e) => {
    const step = 2;
    if (e.key === 'ArrowLeft')  { STATE.agentWidth = clampAgentWidth(STATE.agentWidth + step); }
    else if (e.key === 'ArrowRight') { STATE.agentWidth = clampAgentWidth(STATE.agentWidth - step); }
    else if (e.key === 'Home') { STATE.agentWidth = 25; }
    else if (e.key === 'End')  { STATE.agentWidth = 45; }
    else return;
    e.preventDefault(); applyPrefs(); sp.setAttribute('aria-valuenow', String(STATE.agentWidth));
    saveState(); scheduleCharts();
  });
}

/* ================= 文案红线自检 ================= */
function wordingCheck() {
  const text = $('#wbPage').innerText + ' ' + ($('#agentPane').hidden ? '' : $('#agentPane').innerText);
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
      const back = $('.metric-back', c), front = $('.metric-front', c);
      back.setAttribute('aria-hidden', String(!on));
      front.setAttribute('aria-hidden', String(on));
      if (on) { back.removeAttribute('inert'); front.setAttribute('inert', ''); }
      else { front.removeAttribute('inert'); back.setAttribute('inert', ''); }
    };
    c.addEventListener('click', flip);
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
    APP.$chart.win = b.dataset.win; renderPage();
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
    else if (a === 'batchAdd') toast('已加入本批（原型不写入）');
    else if (a === 'setDiversion') toast('术式是不可逆事实：改动会留痕，不覆盖旧值');
    else if (a === 'copyDraft') copyDraft();
    else if (a === 'toggleShare') {
      b.dataset.on = b.dataset.on === '1' ? '0' : '1';
      b.textContent = b.dataset.on === '1' ? '本次已勾选带入 ☑' : '本次已勾选带入 ▢';
    }
  }));
  $$('[data-confirm]', scope).forEach((b) => b.addEventListener('click', () => toast('已确认（候选才进入事实层）')));
  $$('[data-goto]', scope).forEach((b) => b.addEventListener('click', () => {
    STATE.route = 'urgent'; location.hash = '#/urgent'; renderNav(); renderPage();
  }));
}

function copyDraft() {
  const d = DRAFT_SCOPES[STATE.draftScope];
  const text = [`范围：${d.label}`,
    ...d.blocks.map((b) => `${b.label}\n` + b.lines.map((l) => `- ${l}`).join('\n')),
    `缺项\n` + d.gaps.map((g) => `- ${g}`).join('\n'),
    `已排除\n` + d.excluded.map((g) => `- ${g}`).join('\n')].join('\n\n');
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('草稿已复制'), () => toast('复制失败，可手动选择文本'));
  else toast('此环境不支持自动复制');
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
  });
  paintSparklines();
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
  renderAgent();
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
  initSplitter();

  $('#btnAgent').addEventListener('click', () => {
    STATE.agentOpen = !STATE.agentOpen; saveState(); renderAgent();
  });
  $('#btnAgentClose').addEventListener('click', () => {
    STATE.agentOpen = false; saveState(); renderAgent();
  });
  $('#btnDraftScope').addEventListener('click', () => {
    const keys = Object.keys(DRAFT_SCOPES);
    STATE.draftScope = keys[(keys.indexOf(STATE.draftScope) + 1) % keys.length];
    saveState(); renderAgent();
  });
  $('#btnCopyDraft').addEventListener('click', copyDraft);
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
