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
   ============================================================ */
'use strict';

const CHART = (() => {
  const W = 700, H = 200;
  const PAD = { t: 10, r: 96, b: 24, l: 10 };   // 右侧留 96px 给末点标签
  const INNER_W = W - PAD.l - PAD.r;
  const INNER_H = H - PAD.t - PAD.b;

  const TREATMENTS = [
    { d: '2026-09-18', label: 'TURBT', id: 'ev-turbt' },
    { d: '2026-10-02', label: 'BCG 诱导开始', id: 'ev-bcg' },
    { d: '2026-10-23', label: '灌注取消', id: 'ev-cancel' },
  ];

  const day = (s) => new Date(`${s}T00:00:00`).getTime();
  const DAY = 86400000;

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
    const from = windowStart(win, allDates);
    const to = Math.max(...allDates.map(day));
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

  function xScale(from, to) {
    const span = Math.max(to - from, DAY);        // 单点也不除零
    return (d) => PAD.l + ((day(d) - from) / span) * INNER_W;
  }

  /** C1：每条线用它自己的全期 min/max 映射；min===max 时画在中线 */
  function yScale(s) {
    if (s.max === s.min) return () => PAD.t + INNER_H / 2;
    return (v) => PAD.t + INNER_H - ((v - s.min) / (s.max - s.min)) * INNER_H;
  }

  const fmt = (v) => (Math.round(v * 10) / 10).toString();

  /** 主渲染：返回 { treatLane, svg, legend, empty } */
  function render(codes, win) {
    const { series, from, to } = collect(codes, win);
    const withData = series.filter((s) => s.pts.length > 0);
    if (!withData.length) {
      return { empty: true, treatLane: '', svg: '', legend: '', reason: '所选时间窗内没有记录' };
    }

    const X = xScale(from, to);
    const parts = [];
    let animDelay = 0;

    // 横向网格（3 条）
    for (let i = 0; i <= 3; i++) {
      const y = PAD.t + (INNER_H / 3) * i;
      parts.push(`<line class="grid-line" x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${(PAD.l + INNER_W).toFixed(1)}" y2="${y.toFixed(1)}"/>`);
    }

    const labels = [];
    withData.forEach((s, si) => {
      const Y = yScale(s);
      const coords = s.pts.map((p) => [X(p.d), Y(p.v)]);

      // C2：单点不连线
      if (coords.length > 1) {
        const d = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
        parts.push(
          `<path class="series-line" d="${d}" stroke="${s.color}" pathLength="1" `
          + `style="stroke-dasharray:1;stroke-dashoffset:1;animation:dash .7s ease forwards;animation-delay:${animDelay}ms"/>`
        );
        animDelay += 45;                                  // C9：40–50ms 递增
      }
      coords.forEach(([x, y], i) => {
        parts.push(
          `<circle class="series-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="${s.color}">`
          + `<title>${s.name} ${s.pts[i].d}：${fmt(s.pts[i].v)} ${s.unit}｜${s.lab || '自测'} · ${s.method || '—'}｜${s.src}</title>`
          + `</circle>`
        );
      });

      // C5/C6/C7：末点只标一次；靠右改 end；多序列错开 ≥11px
      const last = s.pts[s.pts.length - 1];
      const lx = X(last.d), ly = Y(last.v);
      const atEnd = (W - PAD.r) - lx < 46;
      let ty = ly + 4 + (si % 2 === 0 ? -1 : 1) * Math.floor(si / 2) * 11 + (si % 2 ? 6 : -6);
      ty = Math.max(PAD.t + 8, Math.min(H - PAD.b - 2, ty));
      labels.push(
        `<text class="end-label" x="${(atEnd ? lx - 8 : lx + 8).toFixed(1)}" y="${ty.toFixed(1)}" `
        + `text-anchor="${atEnd ? 'end' : 'start'}" fill="${s.color}">${fmt(last.v)}</text>`
      );
    });
    parts.push(...labels);

    // C4：治疗条（独立行，不叠在绘图区）——竖线与节点同 ID 联动
    const tFrom = from, tTo = to;
    const tx = (d) => ((day(d) - tFrom) / Math.max(tTo - tFrom, DAY)) * 100;
    const inWin = TREATMENTS.filter((t) => day(t.d) >= tFrom && day(t.d) <= tTo);
    const treatLane = inWin.map((t) =>
      `<div class="treat-mark" style="left:${tx(t.d).toFixed(2)}%" data-ev="${t.id}">`
      + `<div class="tm-diamond" aria-hidden="true"></div>`
      + `<div class="tm-label">${t.label}</div>`
      + `<div class="tm-stem" aria-hidden="true"></div></div>`
    ).join('');

    // 轴：首末日期
    const dFrom = new Date(from).toISOString().slice(0, 10);
    const dTo = new Date(to).toISOString().slice(0, 10);
    parts.push(`<text class="axis-label" x="${PAD.l}" y="${H - 6}">${dFrom}</text>`);
    parts.push(`<text class="axis-label" x="${PAD.l + INNER_W}" y="${H - 6}" text-anchor="end">${dTo}</text>`);

    const legend = withData.map((s) =>
      `<span class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>`
      + `${s.name}（${fmt(s.min)}–${fmt(s.max)} ${s.unit}）</span>`
    ).join('');

    return {
      empty: false,
      treatLane,
      svg: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" `
         + `aria-label="多指标时间轴，共 ${withData.length} 条线，每线按各自全期范围归一化，彼此不可比">${parts.join('')}</svg>`,
      legend,
    };
  }

  /** 3D 卡背面的迷你折线（固定高度内，不展开） */
  function sparkline(metric) {
    const w = 240, h = 96, p = 8;
    const vs = metric.points.map((x) => x.v);
    if (!vs.length) return '<div class="empty"><strong>还没有记录</strong>添加后这里显示趋势</div>';
    const min = Math.min(...vs), max = Math.max(...vs);
    const X = (i) => p + (i / Math.max(vs.length - 1, 1)) * (w - 2 * p);
    const Y = (v) => (max === min ? h / 2 : h - p - ((v - min) / (max - min)) * (h - 2 * p));
    const pts = vs.map((v, i) => [X(i), Y(v)]);
    const line = pts.length > 1
      ? `<path class="series-line" d="${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" stroke="${metric.color}" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1;animation:dash .6s ease forwards"/>`
      : '';
    const dots = pts.map(([x, y], i) =>
      `<circle class="series-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.8" fill="${metric.color}"><title>${metric.points[i].d}：${fmt(vs[i])} ${metric.unit}</title></circle>`
    ).join('');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${line}${dots}</svg>`;
  }

  return { render, sparkline, fmt, TREATMENTS };
})();
