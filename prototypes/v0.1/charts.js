/* ============================================================
   小泉宝 UroPal · 图表 v0.1
   一图秀严格按 docs/16-ONE-CHART-SPEC.md（C1–C12）：
     C1 每线按该指标「全期」min/max 归一化（不是全图统一刻度）
     C2 单点不连线（只画点）
     C3 空窗口给空态
     C4 治疗条与数据区分层（独立行，在绘图区上方）
     C5 末点每序列只标一次
     C6 距右边界 <46px 改 text-anchor=end
     C7 多序列末点标签奇偶错开 ≥11px
     C8 网格轨道一律 minmax(0,1fr)（见 shell.css）
     C9 动画 pathLength=1 + stroke-dashoffset，点 40–50ms 递增延迟
     C10 分类变量不进折线
     C11 lab/method 不同不连线（拆可比组）
     C12 点值可回来源

   重要（勿改回）：图形按调用方量到的容器真实宽度 1:1 渲染。
   早期版本把 viewBox 固定成 700 宽再让 CSS 拉满，浏览器按
   preserveAspectRatio 居中留白（letterbox），绘图区被缩窄、而治疗条
   是满宽的 HTML 层 —— 两者必然对不齐，末点标签也会飘在空处。
   现在由 app.js 传入 width，viewBox 宽度 == 容器宽度，1 用户单位 = 1px。
   ============================================================ */
'use strict';

const CHART = (() => {
  const H = 200;                                  // 绘图区高度（固定，文字不缩放）
  const DEFAULT_W = 700;
  const PAD = { t: 10, r: 96, b: 24, l: 10 };     // 右侧留 96px 给末点标签

  const TREATMENTS = [
    { d: '2026-09-18', label: 'TURBT', id: 'ev-turbt' },
    { d: '2026-10-02', label: 'BCG 诱导开始', id: 'ev-bcg' },
    { d: '2026-10-23', label: '灌注取消', id: 'ev-cancel' },
  ];

  const day = (s) => new Date(`${s}T00:00:00`).getTime();
  const DAY = 86400000;
  const pad2 = (n) => String(n).padStart(2, '0');
  /* 本地日期格式化。勿改回 toISOString()：东八区零点会退到前一天，
     轴标签会整整差一天（曾把 10-22 显示成 10-21）。 */
  const iso = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  function windowStart(win, allDates) {
    if (win === 'all') return Math.min(...allDates.map(day));
    const months = Number(win);
    return Math.max(...allDates.map(day)) - months * 30.44 * DAY;
  }

  /** 选中指标 → 按窗口过滤，并按 (lab + method) 拆可比组 */
  function collect(codes, win) {
    const picked = METRICS.filter((m) => codes.includes(m.code));
    const allDates = picked.flatMap((m) => m.points.map((p) => p.d));
    if (!allDates.length) return { series: [], from: 0, to: 0 };
    /* 窗口边界要把治疗事件算进去：否则「最近一次治疗」只要晚于最后一次
       化验就会从「全部」里消失（曾把 2026-10-23 灌注取消吞掉）。 */
    const spans = allDates.concat(TREATMENTS.map((t) => t.d));
    const from = windowStart(win, spans);
    const to = Math.max(...spans.map(day));
    const series = picked.map((m) => {
      const pts = m.points.filter((p) => day(p.d) >= from && day(p.d) <= to)
        .sort((a, b) => day(a.d) - day(b.d));
      const vs = pts.map((p) => p.v);
      return {
        ...m, pts,
        min: vs.length ? Math.min(...vs) : 0,
        max: vs.length ? Math.max(...vs) : 0,
      };
    });
    return { series, from, to };
  }

  const fmt = (v) => (Math.round(v * 10) / 10).toString();
  const esc = (v) => String(v == null ? '' : v)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* C11：机构或方法一变就拆「可比组」。
     数值随机构/方法漂移是真实的（酶法与苦味酸法测同一份血可以差一截），
     把两组连成一条线等于凭空造出一段趋势。点级 lab/method 优先，回退到指标级。 */
  const labOf = (m, pt) => (pt && pt.lab) || m.lab || '自测';
  const methodOf = (m, pt) => (pt && pt.method) || m.method || '—';
  const groupKey = (m, pt) => `${labOf(m, pt)}|${methodOf(m, pt)}`;
  /** 供卡片与图例复用：全部记录按可比组归并，返回 [{key,label,lab,method,n}] */
  const groupsOf = (m) => {
    const out = [];
    m.points.forEach((pt) => {
      const key = groupKey(m, pt);
      const hit = out.find((g) => g.key === key);
      if (hit) hit.n++;
      else out.push({ key, lab: labOf(m, pt), method: methodOf(m, pt),
                      label: `${labOf(m, pt)} · ${methodOf(m, pt)}`, n: 1 });
    });
    return out;
  };

  /** 主渲染：返回 { treatLane, svg, legend, empty, reason } */
  function render(codes, win, width) {
    const W = Math.max(360, Math.round(width || DEFAULT_W));
    const INNER_W = W - PAD.l - PAD.r;
    const INNER_H = H - PAD.t - PAD.b;

    const { series, from, to } = collect(codes, win);
    const withData = series.filter((s) => s.pts.length > 0);
    if (!withData.length) {
      return { empty: true, treatLane: '', svg: '', legend: '', reason: '所选时间窗内没有记录' };
    }

    // C1 的坐标函数：与绘图区同宽，1 用户单位 = 1px
    const span = Math.max(to - from, DAY);          // 单点也不除零
    const X = (d) => PAD.l + ((day(d) - from) / span) * INNER_W;
    const Y = (s) => (s.max === s.min
      ? () => PAD.t + INNER_H / 2
      : (v) => PAD.t + INNER_H - ((v - s.min) / (s.max - s.min)) * INNER_H);

    const parts = [];
    let animDelay = 0;

    // 横向网格（3 条）
    for (let i = 0; i <= 3; i++) {
      const y = PAD.t + (INNER_H / 3) * i;
      parts.push(`<line class="grid-line" x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${(PAD.l + INNER_W).toFixed(1)}" y2="${y.toFixed(1)}"/>`);
    }

    const labels = [];
    withData.forEach((s, si) => {
      const ys = Y(s);
      const coords = s.pts.map((p) => [X(p.d), ys(p.v)]);

      // C11 + C2：拆可比组；一组里只有一个点就不连线（只画点）
      const runs = [];
      s.pts.forEach((pt, i) => {
        const k = groupKey(s, pt);
        const tail = runs[runs.length - 1];
        if (tail && tail.k === k) tail.idx.push(i);
        else runs.push({ k, idx: [i] });
      });
      runs.forEach((run) => {
        if (run.idx.length < 2) return;
        const d = run.idx
          .map((i, n) => `${n ? 'L' : 'M'}${coords[i][0].toFixed(1)} ${coords[i][1].toFixed(1)}`).join(' ');
        parts.push(
          /* 进场描线：pathLength=1 + dashoffset，按序列递延 45ms。
             缓动用 cubic-bezier(.3,.7,.3,1)（与小巢宝一致）——比 ease 收尾更干净，
             长短线的视觉速度差也更小。 */
          `<path class="series-line" d="${d}" stroke="${s.color}" pathLength="1" `
          + `style="stroke-dasharray:1;stroke-dashoffset:1;animation:dash .72s cubic-bezier(.3,.7,.3,1) forwards;animation-delay:${animDelay}ms"/>`
        );
        animDelay += 45;                                  // C9：40–50ms 递增
      });
      coords.forEach(([x, y], i) => {
        const pt = s.pts[i];
        const tip = `${s.name} ${pt.d}：${fmt(pt.v)} ${s.unit}｜${labOf(s, pt)} · ${methodOf(s, pt)}｜${s.src}`;
        parts.push(
          /* 点按序淡入 + 轻微放大；同时挂 data-* 供悬停提示与固定详情读。
             读屏仍走 <title>，data-tip 只给鼠标/触控的可见提示用。 */
          `<circle class="series-dot dot-in" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="${s.color}" `
          + `style="animation-delay:${i * 45}ms" tabindex="0" role="img" `
          + `data-tip="${esc(tip)}" data-code="${esc(s.code)}" data-date="${esc(pt.d)}" `
          + `data-value="${esc(String(pt.v))}" data-unit="${esc(s.unit)}" `
          + `aria-label="${esc(tip)}">`
          + `<title>${esc(tip)}</title>`
          + `</circle>`
        );
      });

      // C5/C6/C7：末点只标一次；靠右改 end；多序列错开 ≥11px
      const last = s.pts[s.pts.length - 1];
      const lx = X(last.d), ly = ys(last.v);
      const atEnd = (PAD.l + INNER_W) - lx < 46;
      let ty = ly + 4 + (si % 2 === 0 ? -1 : 1) * Math.floor(si / 2) * 11 + (si % 2 ? 6 : -6);
      ty = Math.max(PAD.t + 8, Math.min(H - PAD.b - 2, ty));
      labels.push(
        `<text class="end-label" x="${(atEnd ? lx - 8 : lx + 8).toFixed(1)}" y="${ty.toFixed(1)}" `
        + `text-anchor="${atEnd ? 'end' : 'start'}" fill="${s.color}">${fmt(last.v)}</text>`
      );
    });
    parts.push(...labels);

    // C4：治疗条（独立行，不叠在绘图区）—— 与绘图区同宽同位，竖线与节点同 ID 联动
    /* 事件靠得近时标签会挤成一串（曾出现「TURBTBCG 诱导开始灌注取消」）。
       按 px 贪心分行：同一行里两个标签间距不足 78px 就落到下一行。
       行数决定泳道高度，竖线照样从各自行位贯到绘图区。 */
    const marks = TREATMENTS
      .filter((t) => day(t.d) >= from && day(t.d) <= to)
      .map((t) => ({ ...t, x: PAD.l + ((day(t.d) - from) / span) * INNER_W }));
    /* 行距必须大于标签行高：11px 字号 line-height 1.4 ≈ 15.4px，
       用 13px 时相邻两行在垂直方向必然相交（长窗口把三个事件挤到 70px 内就暴露了）。 */
    const ROW_PITCH = 17;
    const rowRight = [];
    const rows = marks.map((m) => {
      let r = 0;
      while (rowRight[r] != null && m.x - rowRight[r] < 78) r++;
      rowRight[r] = m.x;
      return r;
    });
    const maxRow = rows.reduce((a, b) => Math.max(a, b), 0);
    const treatLane = marks.map((m, i) =>
      /* 治疗节点：可聚焦、可悬停、可点击。节点是「档案里的治疗事件」，
         不是从指标曲线推断出来的；点一下只说明它是什么，不改任何值。 */
      `<div class="treat-mark" style="left:${(m.x / W * 100).toFixed(3)}%;top:${4 + rows[i] * ROW_PITCH}px" `
      + `data-ev="${m.id}" data-tip="${esc(`${m.d} · ${m.label}（治疗事件，来自档案）`)}" `
      + `tabindex="0" role="button" aria-label="${esc(`${m.d} ${m.label}，治疗事件，来自档案`)}" `
      + `title="${esc(`${m.d} · ${m.label}`)}">`
      + `<div class="tm-diamond" aria-hidden="true"></div>`
      + `<div class="tm-label">${m.label}</div>`
      + `<div class="tm-stem" aria-hidden="true"></div></div>`
    ).join('');
    const laneH = 30 + maxRow * ROW_PITCH;

    // 轴：首末日期
    parts.push(`<text class="axis-label" x="${PAD.l}" y="${H - 6}">${iso(from)}</text>`);
    parts.push(`<text class="axis-label" x="${PAD.l + INNER_W}" y="${H - 6}" text-anchor="end">${iso(to)}</text>`);

    const legend = withData.map((s) => {
      const gs = groupsOf(s);
      const gnote = gs.length > 1
        ? `<span class="legend-group">${gs.length} 个可比组，不跨组连线：`
          + gs.map((g) => `${esc(g.label)}（${g.n} 次）`).join(' / ') + `</span>`
        : '';
      return `<span class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>`
        + `${esc(s.name)}（${fmt(s.min)}–${fmt(s.max)} ${esc(s.unit)}）</span>${gnote}`;
    }).join('');

    return {
      empty: false,
      treatLane,
      laneH,
      svg: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" `
         + `aria-label="多指标时间轴，共 ${withData.length} 条线，每线按各自全期范围归一化，彼此不可比">${parts.join('')}</svg>`,
      legend,
    };
  }

  /**
   * 3D 卡背面的迷你折线（固定高度内，不展开）。
   *
   * ⚠️ 必须按调用方量到的真实尺寸渲染，viewBox 与容器完全一致 ——
   * 此前用固定 240×96 + preserveAspectRatio="none"，容器是 537×144 时
   * 横向被拉长 30%，曲线明显变形（用户反馈「曲线变形」）。
   * 与一图秀同一套「1 用户单位 = 1px」口径。
   */
  function sparkline(metric, w, h) {
    const W = Math.max(80, Math.round(w || 240));
    const H = Math.max(50, Math.round(h || 96));
    const p = Math.round(Math.min(W, H) / 12);       // 内边距随尺寸走
    const vs = metric.points.map((x) => x.v);
    if (!vs.length) return '<div class="empty"><strong>还没有记录</strong>添加后这里显示趋势</div>';
    const min = Math.min(...vs), max = Math.max(...vs);
    const X = (i) => p + (i / Math.max(vs.length - 1, 1)) * (W - 2 * p);
    const Y = (v) => (max === min ? H / 2 : H - p - ((v - min) / (max - min)) * (H - 2 * p));
    const pts = vs.map((v, i) => [X(i), Y(v)]);
    const line = pts.length > 1
      ? `<path class="series-line" d="${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" stroke="${metric.color}" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:dash .6s ease forwards"/>`
      : '';
    const r = Math.max(2.4, Math.round(Math.min(W, H) / 110));   // 点随尺寸缩放，否则 537px 宽下圆点看不见
    const dots = pts.map(([x, y], i) =>
      `<circle class="series-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${metric.color}"><title>${esc(metric.points[i].d)}：${fmt(vs[i])} ${esc(metric.unit)}</title></circle>`
    ).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${line}${dots}</svg>`;
  }

  return { render, sparkline, fmt, groupsOf, TREATMENTS };
})();
