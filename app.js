/* Fundamentalist UI (product name: fr.PRODUCT_NAME). Vanilla JS; all data comes from the local /api endpoints. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (v) => (v == null ? "—" : "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v, d = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(d) + "%");
const dirCls = (v) => (v == null ? "muted" : v >= 0 ? "up" : "down");
const big = (v) => (v == null ? "—" : Math.abs(v) >= 1e12 ? "$" + (v / 1e12).toFixed(2) + "T" : Math.abs(v) >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : "$" + (v / 1e6).toFixed(0) + "M");
const CAT = {
  "STRONG RESEARCH CANDIDATE": ["BUY", "▲"], "RESEARCH CANDIDATE": ["BUY", "▲"], "BEARISH RESEARCH SETUP": ["BEARISH", "▼"], "SETUP DEVELOPING": ["DEV", "◔"], "FUNDAMENTALLY STRONG": ["WAIT", "◆"],
  "TACTICAL ONLY": ["WAIT", "↗"], "WATCH": ["EVENT", "◷"], "EVENT RISK": ["EVENT", "⚑"], "INSUFFICIENT DATA": ["NODATA", "?"], "NO EDGE": ["NOEDGE", "–"], "AVOID": ["AVOID", "✕"],
  BUY: ["BUY", "▲"], WAIT: ["WAIT", "◷"], BEARISH: ["BEARISH", "▼"],
};
/* Capitalisation rule (docs/DESIGN.md): sentence case for every label; tickers and real acronyms stay upper case. */
const ACRONYMS = new Set(["SPY", "QQQ", "VIX", "RSI", "MACD", "CPI", "PPI", "PCE", "GDP", "ATR", "EPS", "ETF", "FOMC", "SEC", "FRED", "YoY", "AI", "US", "USD", "ETFs", "IV", "DCF", "P/E", "P/S", "HY", "BLS", "BEA", "JOLTS", "TTM", "QoQ"]);
const sc = (v) => {
  if (v == null) return v;
  const t = String(v);
  if (t !== t.toUpperCase() || !/[A-Z]{2}/.test(t)) return t;                 // already mixed case: leave it
  const out = t.split(/(\s+)/).map((w) => (ACRONYMS.has(w) ? w : w.toLowerCase())).join("");
  return out.charAt(0).toUpperCase() + out.slice(1);
};
const badge = (v) => { const [cls, ic] = CAT[v] || ["WAIT", ""]; return `<span class="badge ${cls}" aria-label="Verdict ${esc(sc(v))}">${ic} ${esc(sc(v) || "—")}</span>`; };
const GLOSS = {
  "price vs sales": "Company value divided by a year of sales. Higher means you pay more for each dollar the company sells.",
  "free cash": "Cash left after running the business and paying for new equipment. It can fund dividends, buybacks or growth.",
  "50-day average": "The average closing price over the last 50 trading days — a common gauge of the recent trend.",
  "200-day average": "The average closing price over the last 200 trading days — a common gauge of the longer-term trend.",
  "P/E": "Price divided by a year of profit per share. Higher means investors pay more for each dollar of profit.",
};
const gloss = (t) => { let h = esc(t); for (const [k, v] of Object.entries(GLOSS)) { const i = h.indexOf(k); if (i >= 0) h = h.slice(0, i) + `<abbr title="${esc(v)}" tabindex="0">${k}</abbr>` + h.slice(i + k.length); } return h; };
const TAG = (t) => t ? `<span class="etag ${esc(t)}" title="${t === "FACT" ? "From SEC filings or price history" : t === "ESTIMATE" ? "From estimates, consensus or a model" : "A conclusion the system draws"}">${esc(sc(t))}</span>` : "";
const GRADE_CLS = { A: "BUY", B: "BUY", C: "WAIT", D: "AVOID", F: "AVOID" };
const gradeBadge = (f) => f.kind === "etf" ? `<span class="badge DEV" aria-label="Market fund">◎ Fund</span>` :
  `<span class="badge ${GRADE_CLS[f.grade] || "NODATA"}" aria-label="Business grade ${esc(f.grade || "not available")}">${esc(f.grade || "?")}</span>`;
const dateFmt = (iso, opts = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) => (iso ? new Date(iso).toLocaleString(undefined, opts) : "—");

const state = { home: null, cache: {}, chart: null };

// Read-only snapshot (export-static): the API is pre-dumped as JSON files next to the page.
const STATIC = window.FR_STATIC || null;
function staticPath(path) {
  const u = new URL(path, "http://x"), t = (u.searchParams.get("t") || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  if (u.pathname === "/api/stock") return `data/stock/${t}.json`;
  if (u.pathname === "/api/brief") return `data/brief/${t}.json`;
  if (u.pathname === "/api/report") return `data/report/${(u.searchParams.get("id") || "").replace(/[^a-z0-9_-]/gi, "")}.json`;
  if (u.pathname.startsWith("/api/prices/")) return `data/prices/${u.pathname.split("/").pop().toUpperCase().replace(/[^A-Z0-9.-]/g, "")}.json`;
  return `data/${u.pathname.replace("/api/", "")}.json`;
}
async function api(path, opts) {
  if (STATIC) {
    if (opts && opts.method === "POST") throw new Error("This is a read-only snapshot.");
    const r = await fetch(staticPath(path) + "?v=" + encodeURIComponent(STATIC.asof || ""));   // a new snapshot never reads cached old data
    if (!r.ok) throw new Error("Not included in this snapshot.");
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  }
  const r = await fetch(path, opts);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
}
async function load(path, force = false) {
  if (!force && state.cache[path]) return state.cache[path];
  state.cache[path] = await api(path);
  return state.cache[path];
}

function spark(vals, w = 110, h = 30) {
  if (!vals || vals.length < 2) return `<span class="faint">no data</span>`;
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - mn) / rng) * (h - 4)).toFixed(1)}`).join(" ");
  const col = vals[vals.length - 1] >= vals[0] ? "var(--up)" : "var(--down)";
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="30-day price trend ${vals[vals.length - 1] >= vals[0] ? "up" : "down"}">
    <polyline fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" points="${pts}"/></svg>`;
}
const scoreBars = (c) => c.kind === "etf" ? `<div class="bars"><span class="faint">Market ETF</span></div>` : `<div class="bars">
  <div class="bar" title="Fundamentals score (6-18 months)"><b>F</b><div class="track"><div class="fill" style="width:${c.fscore ?? 0}%"></div></div><span class="num">${c.fscore == null ? "—" : Math.round(c.fscore)}</span></div>
  <div class="bar" title="Swing setup score (3-20 days)"><b>S</b><div class="track"><div class="fill" style="width:${c.sscore ?? 0}%"></div></div><span class="num">${c.sscore == null ? "—" : Math.round(c.sscore)}</span></div></div>`;

/* ------------------------------------------------------------------ chrome */
function renderChrome(h) {
  $("#mood-pill").innerHTML = `<span aria-hidden="true">●</span> ${esc(h.regime || "—")}`;
  $("#mood-pill").title = h.mood;
  $("#updated").textContent = "Updated " + dateFmt(h.updated);
  $("#disclaimer").textContent = h.disclaimer;
  $("#strip").innerHTML = h.mine.map((c) => `<button class="tick" data-t="${esc(c.ticker)}" aria-label="${esc(c.ticker)} ${money(c.price)} ${pct(c.change_1d)}">
    <span class="t">${esc(c.ticker)}</span><span class="p num">${money(c.price)}</span><span class="c num ${dirCls(c.change_1d)}">${pct(c.change_1d)}</span>${spark(c.spark, 56, 18)}</button>`).join("");
  document.querySelectorAll(".tick").forEach((b) => b.addEventListener("click", () => openStock(b.dataset.t)));
}
function tickCountdown() {
  const h = state.home; if (!h) return;
  const ms = new Date(h.next_refresh) - new Date();
  const el = $("#countdown");
  if (ms <= 0) { el.textContent = "Research run due"; return; }
  const hh = Math.floor(ms / 3.6e6), mm = Math.floor((ms % 3.6e6) / 6e4), ss = Math.floor((ms % 6e4) / 1e3);
  el.textContent = `Next run in ${hh}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
}

/* ------------------------------------------------------------------ views */
function rowHtml(c) {
  const f = c.fundamental;
  return `<button class="row" data-t="${esc(c.ticker)}" aria-label="${esc(c.ticker)}: ${esc(c.summary)}">
    <div class="c-tk"><div class="tk">${esc(c.ticker)}</div><div class="nm">${esc(c.name)}</div></div>
    <div class="c-px"><div class="px num">${money(c.price)}</div><div class="chg num ${dirCls(c.change_1d)}">${pct(c.change_1d)} 1D</div></div>
    <div class="c-spark">${spark(c.spark)}</div>
    <div class="c-badge"><div class="biz">${gradeBadge(f)} <span class="hl">${esc(f.headline)}</span></div></div>
    <div class="todo">${esc((() => { const t = (c.summary.split("; ")[1] || ""); return t.charAt(0).toUpperCase() + t.slice(1); })())}<div class="blk matter-line" title="${esc(c.impact && c.impact.main[0] ? "What would change this: " + c.impact.main[0].change : "No medium or high-impact finding right now")}">${c.impact && c.impact.main[0] ? `${itemHead(c.impact.main[0])} ${esc(c.impact.main[0].short)}` : `<span class="faint">Nothing material changed</span>`}</div>${c.quality && c.quality.level !== "OK" ? `<div class="dq">Data: ${esc(c.quality.level.toLowerCase())} · ${esc(c.quality.notes.join("; "))}</div>` : ""}</div>
    <div class="chev" aria-hidden="true">›</div></button>`;
}
const colhead = `<div class="colhead" aria-hidden="true"><span>Stock</span><span>Price</span><span>30 days</span><span>The business</span><span>In short</span><span></span></div>`;

function todayHtml(h) {
  const d = h.digest, di = h.digest_impact;
  const items = di && di.items.length ? `<ul class="glance">${di.items.map((i) => `<li><b class="tk">${esc(i.ticker)}</b> ${itemHead(i)}<span class="so">${esc(i.so_what)}</span></li>`).join("")}${di.more ? `<li class="faint">${di.more} more in the stock rows below.</li>` : ""}</ul>` : "";
  const none = di && !di.items.length ? `<p class="faint">${di.baseline ? "No new high-impact items since yesterday." : "Nothing high-impact right now."}</p>` : "";
  const chips = (label, xs, empty) => `<p><span class="lbl">${label}</span> ${xs.length ? xs.map(esc).join("; ") : `<span class="faint">${empty}</span>`}</p>`;
  return `<section class="today" aria-label="Today">
    <h2>Today</h2>
    ${h.quiet ? `<p class="quiet" role="status">${esc(h.quiet)}</p>` : ""}
    ${di ? `<p class="sub">${di.baseline ? "New high-impact items since yesterday" : "High-impact items now (no yesterday to compare yet)"}</p>` : ""}
    ${items}${none}
    ${d ? `<details class="more"><summary>Changes, upcoming events and one line per stock</summary>
      ${chips("Verdict changes:", h.changes || [], "none since the last run")}
      ${chips("Next 7 days:", h.attention || [], "nothing urgent")}
      ${chips("Next 3 events:", d.next_events || [], "none scheduled")}
      <ul>${d.lines.map((l) => `<li><b>${esc(l.ticker)}</b> ${esc(l.verdict)}${l.blocker ? ": " + esc(l.blocker) : ""}</li>`).join("")}</ul>
    </details>` : ""}
  </section>`;
}


async function viewStocks(main) {
  // Order follows docs/DESIGN.md: what matters today, then the stocks; reading aids move to the footer.
  const h = state.home;
  const crit = (h.health || []).filter((i) => i.severity === "critical");
  const warn = (h.health || []).filter((i) => i.severity !== "critical");
  main.innerHTML = `
  <div class="head"><div><h1>My stocks</h1><p class="sub">${esc(h.mood)}</p></div></div>
  ${crit.length ? `<div class="notice crit" role="alert"><b>System problem:</b> ${crit.map((i) => esc(i.message)).join("<br>")} <span class="faint">Last good data is still shown.</span></div>` : ""}
  ${todayHtml(h)}
  ${moversHtml(h.movers)}
  <div class="list" role="list">${colhead}${h.mine.map(rowHtml).join("")}</div>
  <h2>Other opportunities found</h2><p class="sub">Best-ranked tech companies outside your list.</p>
  <div class="list">${colhead}${h.others.map(rowHtml).join("") || `<div class="empty">None qualify right now.</div>`}</div>
  <footer class="page-foot">
    <details><summary>How to read this page</summary><div class="howto">
      <div><b>Start with what matters.</b> Each row's last line is the stock's biggest driver right now: ↑ helps, ↓ hurts, ? could go either way, with how big and how soon.</div>
      <div><b>Then the business.</b> The grade (A–F) is how healthy the business is; the headline says whether it's cheap, fair or expensive.</div>
      <div><b>Tap a stock</b> for the bottom line and up to three things that matter, each with the fact behind it. Everything else is under "More detail". Updated 4 times a day.</div>
    </div></details>
    <p class="preamble" role="note">${esc(h.preamble || "")}</p>
    ${warn.length ? `<p class="faint">System notes: ${warn.map((i) => esc(i.message)).join(" ")}</p>` : ""}
  </footer>`;
  main.querySelectorAll(".row, .mover").forEach((r) => r.addEventListener("click", () => openStock(r.dataset.t)));
}

async function viewEarnings(main) {
  main.innerHTML = skel();
  const w = await load("/api/earnings");
  const mon = new Date(w.this_range[0] + "T12:00:00");
  const days = [...Array(5)].map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d.toISOString().slice(0, 10); });
  const today = new Date().toLocaleDateString("en-CA");
  const ecard = (r) => `<button class="ecard ${r.importance[0] === 0 ? "mine" : ""}" data-t="${esc(r.ticker)}" aria-label="${esc(r.ticker)} earnings ${esc(r.weekday)} ${esc(r.timing)}">
      <div><span class="t">${r.importance[0] === 0 ? "★ " : ""}${esc(r.ticker)}</span> ${r.status === "reported" ? `<span class="pill" style="font-size:10px;padding:1px 6px">✓ Reported</span>` : ""}</div>
      <div class="s">${r.avg_move == null ? "No past-move history" : `Usual move ±${r.avg_move}% · up ${r.ups}/${r.n_moves}`}</div><div class="s">Verdict ${esc(r.verdict)}</div></button>`;
  const slot = (rows, label) => rows.length ? `<div class="slot"><div class="sl">${label}</div>${rows.map(ecard).join("")}</div>` : "";
  main.innerHTML = `<div class="head"><div><h1>Earnings</h1>
    <p class="sub">This week ${esc(w.this_range[0])} → ${esc(w.this_range[1])}. Your stocks first (★), then other tech/AI names by size. Dates are Yahoo estimates; past moves use actual closes.</p></div></div>
    <div class="week">${days.map((d) => {
      const rows = w.this_week.filter((r) => r.date === d);
      const dl = new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      return `<section class="day ${d === today ? "today" : ""}" aria-label="${dl}"><div class="dhd"><span>${dl}</span><span class="faint">${rows.length || ""}</span></div>
        ${slot(rows.filter((r) => r.timing === "before open"), "Before open")}${slot(rows.filter((r) => r.timing === "after close"), "After close")}
        ${slot(rows.filter((r) => !["before open", "after close"].includes(r.timing)), "Time TBA")}${rows.length ? "" : `<div class="empty" style="padding:16px">—</div>`}</section>`;
    }).join("")}</div>
    <details class="box"><summary>Next week · ${esc(w.next_range[0])} → ${esc(w.next_range[1])} (${w.next_week.length})</summary>
      <div class="next" style="margin-top:12px">${w.next_week.map((r) => `<button class="ecard ${r.importance[0] === 0 ? "mine" : ""}" style="width:auto" data-t="${esc(r.ticker)}">
        <span class="t">${r.importance[0] === 0 ? "★ " : ""}${esc(r.ticker)}</span> <span class="s">${esc(r.weekday)} · ${esc(r.timing)}</span></button>`).join("") || `<span class="faint">No tracked company reports next week.</span>`}</div></details>`;
  const all = [...w.this_week, ...w.next_week];
  main.querySelectorAll(".ecard").forEach((b) => b.addEventListener("click", () => openStock(b.dataset.t)));
}

function intelMarketHtml(i, cio) {
  if (!i) return "";
  const col = { RED: "down", YELLOW: "either", GREEN: "up", EXCEPTIONAL: "up", UNKNOWN: "none" }[i.regime.state] || "none";
  return `<section class="mkt-intel" aria-label="Market conditions"><p class="bl bl-${col}">${esc(i.regime_text)}</p>
    ${(i.drivers || []).length ? `<h4>What's driving the market</h4><ul>${i.drivers.map((d) => `<li>${esc(d.text)} ${TAG(d.tag)}</li>`).join("")}</ul>` : ""}
    <details><summary>Detail: checks, sectors, same-risk groups, event days</summary>
      <ul>${i.regime.checks.map((c) => `<li>${c.ok === true ? "✓" : c.ok === false ? "✗" : "?"} ${esc(c.text)}</li>`).join("")}</ul>
      <p class="faint">Sectors vs SPY (20 sessions): ${(i.rotation || []).map((r) => `${esc(r.sector)} ${r.rel20 > 0 ? "+" : ""}${r.rel20}`).join(" · ")}</p>
      ${(i.clusters || []).length ? `<p class="faint">Moving as one risk (60-day correlation ≥ 0.7): ${i.clusters.map((g) => esc(g.join(", "))).join(" | ")}</p>` : ""}
      ${Object.values(i.catalysts || {}).flat().map((t) => `<p class="faint">${esc(t)}</p>`).join("")}
      <p class="faint">As of the ${esc(i.asof)} close. The state is a permission label, never a buy or sell signal.</p></details>
    ${cio ? `<p class="faint" style="margin:8px 0 0">${esc(cio.statement)}</p>` : ""}</section>`;
}
async function viewMarket(main) {
  main.innerHTML = skel();
  const m = await load("/api/market");
  const ms = m.macro || {};
  const tile = (k, l, u) => { const x = ms[k]; return `<div class="tile"><span>${l}</span><b class="num">${x ? x.value.toFixed(2) + u : "—"}</b>
    <small>${x && x.change_4w != null ? (x.change_4w >= 0 ? "+" : "") + x.change_4w.toFixed(2) + " in 4w · " : ""}${x ? "as of " + esc(x.date) : "not available"}</small></div>`; };
  const now = new Date();
  main.innerHTML = `<div class="head"><div><h1>Market</h1><p class="sub">${esc(state.home.mood)}</p></div>
    <div class="controls"><span class="faint">Heatmap colour:</span><button class="btn on" data-hm="change_1d">1 day</button><button class="btn" data-hm="ret_5d">5 days</button></div></div>
    ${intelMarketHtml(m.intel, m.market_cio)}
    <div class="card"><h4>Tech &amp; AI heatmap · size = market value</h4><div id="treemap" style="height:440px" role="img" aria-label="Treemap of tracked stocks by market value coloured by price change"></div></div>
    <div class="two" style="margin-top:16px">
      <div class="card"><h4>QQQ vs SPY · last 12 months (rebased to 100)</h4><div id="bench" style="height:300px"></div></div>
      <div class="card"><h4>Upcoming macro events</h4><div class="timeline">${m.macro_events.map((e) => {
        const dd = Math.ceil((new Date(e.event_date + "T" + (e.event_time || "08:30") + ":00-05:00") - now) / 864e5);
        return `<div class="tl"><div class="cd num">${dd <= 0 ? "Today" : dd + "d"}<small>${esc(e.event_date.slice(5))}</small></div>
          <div><b>${esc(e.title)}</b><div class="faint" style="font-size:12px">${esc(e.event_time ? e.event_time + " ET" : "time n/a")} · ${esc(e.source)}</div></div>
          <span class="pill">${e.importance >= 90 ? "High" : e.importance >= 75 ? "Med" : "Low"}</span></div>`; }).join("") || `<div class="empty">No events stored.</div>`}</div></div>
    </div>
    <h2>Rates &amp; risk</h2><div class="tiles">${tile("DGS10", "10Y yield", "%")}${tile("DGS2", "2Y yield", "%")}${tile("T10Y2Y", "10Y – 2Y", "pp")}${tile("DFF", "Fed funds", "%")}
      ${tile("VIXCLS", "VIX", "")}${tile("BAMLH0A0HYM2", "High-yield spread", "pp")}${tile("cpi_yoy", "CPI YoY", "%")}${tile("core_pce_yoy", "Core PCE YoY", "%")}</div>`;
  const draw = (field) => whenPlotly(() => {
    const t = m.tiles.filter((x) => x[field] != null);
    const sectors = [...new Set(t.map((x) => x.sector))];
    const css = getComputedStyle(document.documentElement);
    Plotly.react("treemap", [{
      type: "treemap", branchvalues: "total",
      ids: [...sectors, ...t.map((x) => x.ticker)], labels: [...sectors, ...t.map((x) => x.ticker)],
      parents: [...sectors.map(() => ""), ...t.map((x) => x.sector)],
      values: [...sectors.map((s) => t.filter((x) => x.sector === s).reduce((a, x) => a + x.market_cap, 0)), ...t.map((x) => x.market_cap)],
      marker: { colors: [...sectors.map(() => 0), ...t.map((x) => x[field])], colorscale: [[0, "#d63c45"], [0.5, "#2a313d"], [1, "#16a34a"]], cmid: 0, cmin: -6, cmax: 6,
        line: { width: 1, color: css.getPropertyValue("--bg").trim() } },
      customdata: [...sectors.map(() => ["", "", ""]), ...t.map((x) => [x.name, (x[field] >= 0 ? "+" : "") + x[field].toFixed(2) + "%", x.verdict])],
      texttemplate: "<b>%{label}</b><br>%{customdata[1]}", hovertemplate: "<b>%{label}</b> %{customdata[0]}<br>%{customdata[1]} · verdict %{customdata[2]}<extra></extra>",
      textfont: { family: "Inter", color: "#fff" }, pathbar: { visible: false },
    }], { margin: { l: 0, r: 0, t: 0, b: 0 }, paper_bgcolor: "rgba(0,0,0,0)" }, { displayModeBar: false, responsive: true });
  });
  draw("change_1d");
  main.querySelectorAll("[data-hm]").forEach((b) => b.addEventListener("click", () => {
    main.querySelectorAll("[data-hm]").forEach((x) => x.classList.toggle("on", x === b)); draw(b.dataset.hm);
  }));
  benchChart(m.qqq, m.spy);
}

function benchChart(qqq, spy) {
  const el = $("#bench"); if (!el || !window.LightweightCharts || !qqq.length) { if (el) el.innerHTML = `<div class="empty">Chart unavailable.</div>`; return; }
  const ch = LightweightCharts.createChart(el, chartOpts(el));
  const rebase = (b) => b.map((x) => ({ time: x.time, value: (x.close / b[0].close) * 100 }));
  ch.addLineSeries({ color: "#5b8cff", lineWidth: 2, title: "QQQ" }).setData(rebase(qqq));
  ch.addLineSeries({ color: "#a78bfa", lineWidth: 2, title: "SPY" }).setData(rebase(spy));
  ch.timeScale().fitContent();
  new ResizeObserver(() => ch.applyOptions({ width: el.clientWidth })).observe(el);
}

function pipelineHtml(pl) {
  if (!pl) return "";
  const KIND = { scenario_bull: "breakout setup", scenario_bear: "breakdown setup", rec_long: "buy call", rec_short: "bearish call" };
  const rows = pl.opportunities || [];
  const counts = Object.entries(pl.by_state || {}).map(([k, n]) => `${n} ${esc(k)}`).join(" · ");
  return `<section class="pipe" aria-label="Opportunities pipeline"><h2>Opportunities pipeline</h2>
    <p class="sub">Every live setup moves through 11 checks. Each row shows how far it got and the single thing blocking it. ${rows.length ? counts : "No live setups today."}</p>
    ${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Stock</th><th>Setup</th><th>Reached</th><th>Blocked by</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><a href="#" data-open="${esc(r.subject)}"><b>${esc(r.subject)}</b></a></td><td>${esc(KIND[r.kind] || r.kind)}</td><td>${r.state}/11 ${esc(r.state_name)}</td>
      <td>${esc(r.blocker || "—")}</td><td>${r.state === 10 && !STATIC ? `<button class="btn" data-dec="approved" data-opp="${esc(r.opp_id)}">Approve</button> <button class="btn ghost" data-dec="rejected" data-opp="${esc(r.opp_id)}">Reject</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${(pl.unproven || []).length ? `<h3 style="margin-top:14px">Unproven setups</h3><p class="sub">These pass every check except one: the setup type has no track record yet. Shown for information, never eligible, and scored in the forecast ledger like every scenario.</p>
      <ul class="unproven">${pl.unproven.map((u) => `<li><a href="#" data-open="${esc(u.subject)}"><b>${esc(u.subject)}</b></a> ${esc(KIND[u.kind] || u.kind)}: <span class="arw-two">${esc(u.label)}</span>${u.options_check ? ` · Options: ${esc(u.options_check)}` : ""}</li>`).join("")}</ul>` : ""}
    <p class="faint" style="font-size:12px">"Quantitative validation" blocks setups until a signal type has passed its pre-registered test and 30+ live results: none has yet. Approving only records your decision; nothing is traded (there is no broker connection).</p></section>`;
}
async function decide(oppId, decision) {
  try { await api("/api/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opp_id: oppId, decision }) }); state.cache = {}; route(); }
  catch (e) { alert("Not recorded: " + e.message); }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-dec]");
  if (b) { e.preventDefault(); decide(b.dataset.opp, b.dataset.dec); return; }
  const a = e.target.closest && e.target.closest(".pipe [data-open]");
  if (a) { e.preventDefault(); openStock(a.dataset.open); }
});
async function viewOpps(main) {
  main.innerHTML = skel();
  const o = await load("/api/opportunities");
  let sortKey = "fscore", asc = false, q = "", status = "ranked";
  const cols = [["ticker", "Ticker"], ["verdict", "Verdict"], ["fscore", "F"], ["sscore", "S"], ["price", "Price"], ["change_1d", "Day"], ["todo", "What to do"], ["signals", "Why it's on the radar"]];
  main.innerHTML = `${pipelineHtml(o.pipeline)}<div class="head"><div><h1>Opportunities</h1><p class="sub">Companies outside your list. <b>Ranked</b> names have enough verified data to score; <b>observation</b> names don't yet.</p>
    <p class="preamble" role="note">${esc(state.home.preamble || "")}</p></div>
    <div class="controls"><input type="search" id="q" placeholder="Filter ticker, name, signal…" aria-label="Filter"><select id="st" aria-label="Status filter">
    <option value="ranked">Ranked</option><option value="observation">Observation</option><option value="all">All</option></select></div></div>
    <div class="tbl-wrap"><table><thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" scope="col" tabindex="0">${l}</th>`).join("")}</tr></thead><tbody id="tb"></tbody></table></div>`;
  const draw = () => {
    let rows = o.rows.filter((r) => (status === "all" || r.status === status) && (!q || JSON.stringify([r.ticker, r.name, r.industry, r.signals]).toLowerCase().includes(q)));
    rows.sort((a, b) => { const x = a[sortKey], y = b[sortKey]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); });
    $("#tb").innerHTML = rows.map((r) => `<tr data-t="${esc(r.ticker)}" data-ranked="${r.status === "ranked"}"><td><b>${esc(r.ticker)}</b><div class="faint" style="font-size:11px">${esc(r.name || "")}</div></td>
      <td>${r.verdict ? badge(r.verdict) : `<span class="faint">observation</span>`}</td><td class="num">${r.fscore == null ? "—" : Math.round(r.fscore)}</td>
      <td class="num">${r.sscore == null ? "—" : Math.round(r.sscore)}</td><td class="num">${money(r.price)}</td><td class="num ${dirCls(r.change_1d)}">${pct(r.change_1d)}</td>
      <td style="min-width:220px">${esc(r.todo)}</td><td style="min-width:200px" class="muted">${esc(r.signals.join("; ") || "no active signal")}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">No matches.</td></tr>`;
    main.querySelectorAll("th").forEach((th) => { th.classList.toggle("sorted", th.dataset.k === sortKey); th.classList.toggle("asc", th.dataset.k === sortKey && asc); });
    main.querySelectorAll("tr[data-ranked=true]").forEach((tr) => tr.addEventListener("click", () => openStock(tr.dataset.t)));
  };
  main.querySelectorAll("th").forEach((th) => { const f = () => { asc = sortKey === th.dataset.k ? !asc : false; sortKey = th.dataset.k; draw(); };
    th.addEventListener("click", f); th.addEventListener("keydown", (e) => e.key === "Enter" && f()); });
  $("#q").addEventListener("input", (e) => { q = e.target.value.toLowerCase(); draw(); });
  $("#st").addEventListener("change", (e) => { status = e.target.value; draw(); });
  draw();
}

function ledgerHtml(l, minSample) {
  if (!l) return "";
  return `<h2>Forecast ledger: hit vs benchmark (new)</h2>
    <p class="sub">From ${esc((l.first || "now").slice(0, 10))}, every new buy or bearish call is also written to the forecast ledger before its window opens: beat QQQ (or underperform it, for bearish calls) over 15 trading days, entry at the next session's close. QQQ is judged against SPY. Same hit definition as the live table above (beat the benchmark); this ledger also records the entry rule before the window opens.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Recorded</th><th>Scored</th><th>Beat benchmark</th><th>Hit rate</th><th>Mean excess</th><th>Waiting</th></tr></thead><tbody>
    <tr><td class="num">${l.recorded}</td><td class="num">${l.scored}</td><td class="num">${l.hits}</td><td class="num">${l.hit_rate == null ? "—" : l.hit_rate + "%"}</td>
      <td class="num ${dirCls(l.mean_excess)}">${l.mean_excess == null ? "—" : pct(l.mean_excess)}</td><td class="num">${l.pending}</td></tr></tbody></table></div>
    ${l.scored < minSample ? `<p class="faint" style="font-size:12px">${l.scored} scored so far: too few to judge (needs ${minSample}+). Signal status: experimental, so no probability is shown.</p>` : ""}`;
}
/* Reports (platform Phase 6): latest weekly / premarket / post-market, verdict first, detail folded; archive. */
function reportHtml(r, label) {
  if (!r) return `<div class="rep"><h3>${esc(label)}</h3><p class="faint">Not generated yet.</p></div>`;
  const items = (xs) => `<ul>${xs.map((x) => `<li>${esc(x.text)} ${TAG(x.tag)}</li>`).join("")}</ul>`;
  const dl = (r.daily || []).length ? `<details open><summary>Today's charts: the read and tomorrow's watch</summary><div class="rp-daily">${r.daily.map((d) => `
      <figure class="rp-fig"><figcaption><b>${esc(d.ticker)}</b> <span class="num ${dirCls(d.change_1d)}">${pct(d.change_1d)}</span></figcaption>
      <div class="rp-chart" data-t="${esc(d.ticker)}" data-i="${r.daily.indexOf(d)}"></div>${dailyHtml(d)}</figure>`).join("")}</div></details>` : "";
  setTimeout(() => document.querySelectorAll(".rp-chart").forEach((el) => drawMini(el, r.daily[+el.dataset.i])), 0);
  return `<div class="rep"><h3>${esc(r.title)}</h3>${r.headline ? `<p class="rep-h">${esc(r.headline)}</p>` : ""}<p class="rep-v">${esc(r.verdict.text)} ${TAG(r.verdict.tag)}</p>
    ${dl}
    ${r.sections.map((s, i) => `<details${i === 0 ? " open" : ""}><summary>${esc(s.title)}</summary>${items(s.items)}</details>`).join("")}
    ${(r.stocks || []).length ? `<details><summary>Priority stocks: ${r.stocks.map((s) => esc(s.subject)).join(", ")}</summary>${r.stocks.map((s) => `<h4>${esc(s.subject)}</h4>${items(s.items)}`).join("")}<p class="faint">${esc(r.stocks_note || "")}</p></details>` : ""}
    <p class="faint" style="font-size:11px;margin:6px 0 0">Saved ${esc(dateFmt(r.created_at))}. Built by fixed rules from stored records; saved reports are never edited.</p></div>`;
}
async function viewReports(main) {
  main.innerHTML = skel();
  const d = await load("/api/reports");
  main.innerHTML = `<div class="head"><div><h1>Reports</h1><p class="sub">The weekly outlook sets the frame (Sundays); the premarket plan (about 8:45 ET) and the post-market review (about 4:35 ET) follow each trading day.</p></div></div>
    <div class="reps">${reportHtml(d.premarket, "Premarket plan")}${reportHtml(d.postmarket, "Post-market review")}${reportHtml(d.weekly, "Weekly outlook")}</div>
    <h2>Archive</h2><div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Report</th><th></th></tr></thead><tbody>
    ${(d.archive || []).map((a) => `<tr><td class="num">${esc(a.report_date)}</td><td>${esc({ weekly: "Weekly outlook", premarket: "Premarket plan", postmarket: "Post-market review" }[a.kind])}</td>
      <td><button class="btn ghost" data-rep="${esc(a.report_id)}">Open</button></td></tr>`).join("") || `<tr><td colspan="3" class="empty">No reports yet.</td></tr>`}</tbody></table></div>
    <div id="rep-open"></div>`;
  main.querySelectorAll("[data-rep]").forEach((b) => b.addEventListener("click", async () => {
    try { const r = await load(`/api/report?id=${encodeURIComponent(b.dataset.rep)}`); $("#rep-open").innerHTML = reportHtml(r, ""); $("#rep-open").scrollIntoView(); }
    catch (e) { $("#rep-open").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }));
}
/* Forecast performance (platform Phase 7): honest counts, "too few" until 30 results, proposals never applied. */
function perfHtml(pf) {
  if (!pf) return "";
  const rate = (r) => esc(r.text);
  return `<h2>Forecast performance by type</h2><p class="sub">${esc(pf.evidence)}</p>
    <div class="tbl-wrap"><table><thead><tr><th>Forecast type</th><th>Status</th><th>Recorded</th><th>Triggered</th><th>Not triggered</th><th>Matured</th><th>Hit vs benchmark</th><th>Worst drawdown</th><th>Calibration</th></tr></thead><tbody>
    ${pf.by_type.map((r) => `<tr><td>${esc(r.signal)}</td><td>${esc(r.status)}</td><td class="num">${r.recorded}</td><td class="num">${r.triggered}</td><td class="num">${r.not_triggered}</td>
      <td class="num">${r.matured}</td><td>${rate(r.hit_vs_benchmark)}</td><td class="num">${r.worst_drawdown == null ? "—" : pct(r.worst_drawdown)}</td><td class="faint">${esc(r.calibration.note || ("Brier " + r.calibration.brier))}</td></tr>`).join("")}</tbody></table></div>
    <details><summary>By department, analysts, live attribution, revisions and proposals</summary>
      <h4>By department</h4><ul>${pf.by_department.map((d) => `<li>${esc(d.department)}: ${d.recorded} recorded, ${d.matured} matured, hit vs benchmark ${rate(d.hit_vs_benchmark)}</li>`).join("")}</ul>
      <h4>Analyst scorecards</h4><ul>${pf.scorecards.map((a) => `<li>${esc(a.analyst)}: ${esc(a.result)}</li>`).join("")}</ul>
      <h4>Does each layer help? (live, accumulating)</h4><ul>${pf.attribution_live.map((a) => `<li>${esc(a.feature)}: ${a.note ? esc(a.note) : a.groups.map((g) => `${esc(String(g.value))} → ${esc(g.text)}`).join("; ")}</li>`).join("")}</ul>
      <p class="faint">${esc(pf.ablation_note)}</p>
      <h4>Proposals (suggestions only; nothing changes without your approval)</h4><ul>${pf.proposals.map((p) => `<li>${esc(p.proposal)}: <span class="faint">${esc(p.evidence)}</span></li>`).join("")}</ul></details>`;
}
async function viewDiscovery(main) {
  main.innerHTML = skel();
  const d = await load("/api/discovery");
  const card = (t) => `<div class="disc"><h3><a href="#" data-open="${esc(t.subject)}">${esc(t.subject)}</a> <span class="faint">${esc(t.universe)}${(d.new_last_30_days || []).includes(t.subject) ? " · new" : ""}</span></h3>
    ${labelsHtml(t.labels)}<p class="lt-v">${esc(t.valuation.summary ? "Value range " + t.valuation.summary : "No valuation range")} ${TAG("ESTIMATE")}</p>
    <p class="faint">Quality: grade ${esc(t.quality.grade || "?")}; sales growth ${t.quality.rev_growth_pct != null ? t.quality.rev_growth_pct.toFixed(0) + "%" : "—"}; operating margin ${t.quality.operating_margin_pct != null ? t.quality.operating_margin_pct.toFixed(0) + "%" : "—"}. Catalysts: ${esc(t.catalysts.map((c) => c.text).join("; "))}. Risks: ${esc(t.risks.map((r) => r.text).slice(0, 2).join("; ") || "none flagged")}. Research status: ${esc(t.research_status)}.</p></div>`;
  main.innerHTML = `<div class="head"><div><h1>Investment discovery</h1><p class="sub">Names beyond your list, each with a long-term thesis built from stored data. A strong business, an attractive valuation, an attractive investment and a short-term trade are separate questions. Ranges are estimates under stated assumptions; no probabilities.</p></div></div>
    ${(d.top || []).map(card).join("") || `<p class="faint">No theses yet: they are built after the next refresh.</p>`}
    ${(d.rest || []).length ? `<details><summary>${d.rest.length} more</summary><ul>${d.rest.map((r) => `<li><a href="#" data-open="${esc(r.subject)}"><b>${esc(r.subject)}</b></a>: business ${esc(r.labels.strong_business.answer)}, valuation ${esc(r.labels.attractive_valuation.answer)}, investment ${esc(r.labels.attractive_investment.answer)}${r.valuation ? " · " + esc(r.valuation) : ""}</li>`).join("")}</ul></details>` : ""}`;
  main.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openStock(a.dataset.open); }));
}
async function viewOps(main) {
  if (STATIC) { main.innerHTML = `<div class="head"><h1>Research operations</h1></div><p class="faint">Not included in the shared snapshot.</p>`; return; }
  main.innerHTML = skel();
  const o = await api("/api/ops");
  const tbl = (rows, cols) => `<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c[1])}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(String(r[c[0]] ?? "—"))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}" class="empty">none</td></tr>`}</tbody></table></div>`;
  main.innerHTML = `<div class="head"><div><h1>Research operations</h1><p class="sub">System state: jobs, data freshness, schedules, open questions, signal registry. Generated ${esc(dateFmt(o.generated_at))}.</p></div></div>
    <h2>System issues</h2>${o.issues.length ? `<ul>${o.issues.map((i) => `<li><b>${esc(i.severity)}</b> ${esc(i.area)}: ${esc(i.message)}</li>`).join("")}</ul>` : `<p class="faint">None: all checks pass.</p>`}
    <h2>Data freshness</h2>${tbl(o.staleness, [["data", "Data"], ["latest", "Latest"]])}
    <h2>Scheduled reports</h2>${tbl(o.schedule.map((s) => ({ ...s, last: s.last ? s.last.report_date : "—" })), [["report", "Report"], ["when", "When"], ["last", "Last saved"]])}
    <h2>Signal registry</h2>${tbl(o.signals, [["signal_id", "Signal"], ["status", "Status"], ["updated_at", "Updated"]])}
    <h2>Forward-only research</h2>${tbl(o.research_signals, [["signal", "Signal"], ["status", "Status"], ["cases", "Live cases"], ["text", "Progress"], ["prereg", "Pre-registration"]])}
    <details><summary>Jobs, failures (48 h), blocked forecasts, open questions</summary>
      <h3>Recent jobs</h3>${tbl(o.runs, [["kind", "Kind"], ["started_at", "Started"], ["finished_at", "Finished"], ["status", "Status"]])}
      <h3>Source problems (48 h)</h3>${tbl(o.problems_48h, [["source", "Source"], ["status", "Status"], ["finished_at", "When"], ["error", "Detail"]])}
      <h3>Blocked forecasts</h3>${tbl(o.blocked, [["subject", "Subject"], ["on_date", "Date"], ["kind", "Kind"], ["reason", "Reason"]])}
      <h3>Open research questions</h3>${tbl(o.investigations, [["subject", "Subject"], ["question", "Question"], ["reason", "Why"]])}</details>`;
}
async function viewSettings(main) {
  if (STATIC) { main.innerHTML = `<div class="head"><h1>Settings</h1></div><p class="faint">Not included in the shared snapshot.</p>`; return; }
  main.innerHTML = skel();
  const h = await api("/api/holdings");
  const rows = (h.holdings || []).concat([{}, {}, {}]);
  const e = h.exposure || {};
  main.innerHTML = `<div class="head"><div><h1>Settings</h1><p class="sub">Your holdings stay on this Mac (data/holdings.yaml). They are never committed, pushed or included in the shared snapshot.</p></div></div>
    <h2>Holdings</h2><p class="sub">Enter shares, or a percent of your portfolio (use one or the other for all rows). Used only for exposure facts and the 40% sector check. No position sizes are suggested.</p>
    <form id="hold-form"><div class="tbl-wrap"><table><thead><tr><th>Ticker</th><th>Shares</th><th>or % of portfolio</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><input name="t" value="${esc(r.ticker || "")}" maxlength="10" aria-label="Ticker"></td><td><input name="s" value="${esc(r.shares ?? "")}" inputmode="decimal" aria-label="Shares"></td><td><input name="p" value="${esc(r.pct ?? "")}" inputmode="decimal" aria-label="Percent"></td></tr>`).join("")}
    </tbody></table></div><button class="btn" type="submit">Save holdings</button> <span id="hold-msg" class="faint"></span></form>
    <h2>Exposure</h2>${!e.entered ? `<p class="faint">${esc(e.note || "No holdings entered.")}</p>` : `
      <p>By sector fund: ${Object.entries(e.by_sector).map(([k, v]) => `${esc(k)} ${v}%`).join(" · ")}</p>
      ${Object.keys(e.by_group || {}).length ? `<p>Same-risk groups: ${Object.entries(e.by_group).map(([k, v]) => `${esc(k)} ${v}%`).join(" · ")}</p>` : ""}
      ${(e.warnings || []).length ? `<ul>${e.warnings.map((w) => `<li class="arw-down">${esc(w)}</li>`).join("")}</ul>` : `<p class="faint">No concentration warnings.</p>`}
      <p class="faint">${esc(e.note)}</p>`}`;
  $("#hold-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const trs = [...document.querySelectorAll("#hold-form tbody tr")];
    const holdings = trs.map((tr) => ({ ticker: tr.querySelector("[name=t]").value, shares: tr.querySelector("[name=s]").value, pct: tr.querySelector("[name=p]").value })).filter((x) => x.ticker.trim());
    try { const r = await api("/api/holdings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdings }) }); $("#hold-msg").textContent = `Saved ${r.saved}.`; state.cache = {}; viewSettings(main); }
    catch (err) { $("#hold-msg").textContent = "Not saved: " + err.message; }
  });
}
async function viewTrack(main) {
  main.innerHTML = skel();
  const t = await load("/api/track");
  let pf = null;
  try { pf = await load("/api/performance"); } catch (e) { pf = null; }
  const bt = t.backtest || {};
  const btRows = Object.entries(bt).filter(([, v]) => v && v.excess_return_by_bucket);
  const evaluated = t.independent_evaluated;
  const ev = t.evidence || {};
  const hr = ev.hit_rates || [];
  const ruleTable = bt.evaluation ? `<h2>Is the score better than simple rules?</h2><p class="sub">Rank correlation with 15-day excess return (90% CI from a block bootstrap). "Inconclusive" when the interval includes 0. Simulation: top fifth every 15 days, next-close entry, ${bt.evaluation.cost_bps_round_trip} bps costs.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Signal</th><th>Mean IC</th><th>90% CI</th><th>Verdict</th><th>Sim. excess / period</th><th>Hit vs QQQ</th></tr></thead><tbody>
    ${Object.entries(bt.evaluation.ranking_ic_15d).map(([n, v]) => { const sm = (bt.evaluation.simulation_top_quintile || {})[n];
      return `<tr><td><b>${esc(n)}</b></td><td class="num">${v.mean_ic ?? "—"}</td><td class="num">${v.ci90 ? v.ci90.join(" to ") : "—"}</td>
      <td>${v.conclusive ? (v.mean_ic > 0 ? "positive" : "negative") : "inconclusive"}</td><td class="num">${sm && sm.periods ? pct(sm.avg_excess_pct) : "—"}</td>
      <td class="num">${sm && sm.periods ? Math.round(sm.hit_rate_vs_qqq * 100) + "%" : "—"}</td></tr>`; }).join("")}</tbody></table></div>
    <p class="faint" style="font-size:12px">Only ${Math.round((bt.evaluation.buy_eligible_share || 0) * 1000) / 10}% of stock-weeks passed both buy thresholds (F≥60 and S≥60) before reward/risk and risk caps.</p>` : "";
  const pc = (x) => Math.round(x * 100) + "%";
  main.innerHTML = `<div class="evidence ev-${esc(ev.state || "none")}" role="alert" aria-live="polite"><b>Evidence: </b>${esc(ev.banner || "Evidence state unavailable.")}${(ev.details || []).map((d) => `<div>${esc(d)}</div>`).join("")}</div>
    <div class="head"><div><h1>Track record</h1><p class="sub">Hypothetical research performance — no trades are executed. Original calls are locked and never edited.</p></div></div>
    ${ruleTable}
    <h2>Live hit rate vs QQQ (matured calls)</h2><p class="sub">Independent buy/bearish calls whose horizon has passed. A hit = the stock beat QQQ (for a bearish call: lagged QQQ), the same test as the back-test and the forecast ledger; QQQ itself is judged against SPY. 95% Wilson interval. The last column is the older raw measure (did the price move the called way), kept for reference only.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Horizon</th><th>Calls</th><th>Beat QQQ</th><th>Hit rate vs QQQ</th><th>95% CI</th><th>Reading</th><th>Raw direction hit (secondary)</th></tr></thead><tbody>
    ${hr.map((r) => `<tr><td>${r.horizon_days} days</td><td class="num">${r.n}</td><td class="num">${r.hits}</td><td class="num">${pc(r.hit_rate)}</td>
      <td class="num">${pc(r.ci95[0])}–${pc(r.ci95[1])}</td><td>${r.direction === "inconclusive" ? "includes 50%: not demonstrated" : r.direction === "positive" ? "above 50%" : "below 50%"}</td>
      <td class="num faint">${r.raw_hit_rate == null ? "—" : pc(r.raw_hit_rate) + " (" + r.raw_hits + "/" + r.raw_n + ")"}</td></tr>`).join("")
      || `<tr><td colspan="7" class="empty">No matured buy or bearish calls yet.</td></tr>`}</tbody></table></div>
    <p class="faint" style="font-size:12px">Evidence gate v${esc(ev.gate_version || "2")}: since 2026-11-10 a live hit means beating QQQ. Stored outcomes are unchanged; only the headline measure moved.</p>
    ${ledgerHtml(t.ledger, t.min_sample)}
    ${perfHtml(pf)}
    <h2>Max drawdown per call</h2><p class="sub">Worst move against each evaluated call before its horizon ended (longest matured horizon).</p>
    <div class="tbl-wrap"><table><thead><tr><th>When</th><th>Ticker</th><th>Call</th><th>Horizon</th><th>Return</th><th>vs QQQ</th><th>Max drawdown</th><th>Beat QQQ</th><th>Raw direction</th></tr></thead><tbody>
    ${(t.drawdowns || []).map((r) => `<tr><td class="num">${esc(dateFmt(r.created_at))}</td><td><b>${esc(r.ticker)}</b></td><td>${esc(sc(r.classification))}</td><td>${r.horizon_days}d</td>
      <td class="num ${dirCls(r.ret)}">${pct(r.ret)}</td><td class="num ${dirCls(r.excess_qqq)}">${pct(r.excess_qqq)}</td><td class="num ${dirCls(r.max_drawdown_pct)}">${pct(r.max_drawdown_pct)}</td><td>${r.hit_vs_qqq == null ? "—" : r.hit_vs_qqq ? "yes" : "no"}</td><td class="faint">${r.hit == null ? "—" : r.hit ? "yes" : "no"}</td></tr>`).join("")
      || `<tr><td colspan="9" class="empty">No evaluated buy or bearish calls yet.</td></tr>`}</tbody></table></div>
    ${evaluated < t.min_sample ? `<div class="notice">Small sample: ${evaluated} call(s) evaluated so far. No performance claim is made until at least ${t.min_sample} independent calls have results.</div>` : ""}
    <div class="tiles"><div class="tile"><span>Calls recorded (raw)</span><b class="num">${t.n_recs}</b><small>since ${esc((t.first || "").slice(0, 10))}</small></div>
      <div class="tile"><span>Independent calls</span><b class="num">${t.n_independent ?? "—"}</b><small>new verdict/agreement, or 10+ trading days apart</small></div>
      <div class="tile"><span>Independent calls with results</span><b class="num">${evaluated}</b><small>verdict changes only; daily repeats excluded</small></div>
      <div class="tile"><span>Independent signals</span><b class="num">${t.calibration.n_independent_signals ?? 0}</b><small>verdict changes only</small></div>
      <div class="tile"><span>Scoring version</span><b class="num">${esc(t.scoring_version)}</b><small>weights fixed, human-approved</small></div></div>
    <p class="faint" style="font-size:12px">Live tracking is hypothetical paper tracking of the system's own calls. The table below is a historical back-test — a different thing. Neither is realised trading profit.</p>
    <h2>Back-test (point-in-time, ${esc(t.backtest_params ? t.backtest_params.start + " → " + t.backtest_params.end : "not run")})</h2>
    <p class="sub">Weekly decisions using only data public at the time. Average excess return vs QQQ over the next 10/15 trading days, by score bucket.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Score · horizon</th><th>Rank IC</th><th>Dates IC&gt;0</th><th>&lt;45</th><th>45–55</th><th>55–65</th><th>≥65</th></tr></thead><tbody>
    ${btRows.map(([k, v]) => { const b = Object.fromEntries(v.excess_return_by_bucket.map((x) => [x.bucket, x]));
      const cell = (n) => b[n] ? `<span class="num ${dirCls(b[n].avg_excess_pct)}">${pct(b[n].avg_excess_pct)}</span> <span class="faint">n=${b[n].n}</span>` : "—";
      return `<tr><td><b>${k.replace("fscore", "Fundamentals").replace("sscore", "Swing setup").replace("_h", " · ")}d</b></td><td class="num">${v.mean_daily_rank_ic ?? "—"}</td>
        <td class="num">${v.ic_positive_share == null ? "—" : Math.round(v.ic_positive_share * 100) + "%"}</td><td>${cell("<45")}</td><td>${cell("45-55")}</td><td>${cell("55-65")}</td><td>${cell(">=65")}</td></tr>`; }).join("")
      || `<tr><td colspan="7" class="empty">No back-test yet.</td></tr>`}</tbody></table></div>
    <p class="faint" style="font-size:12px">Weak, not validated: overlapping horizons and today's universe (survivorship). News and social inputs are not available historically.</p>
    <h2>Recent calls</h2><div class="tbl-wrap"><table><thead><tr><th>When</th><th>Ticker</th><th>Call</th><th>Price</th><th>F</th><th>S</th><th>Signal agreement</th></tr></thead><tbody>
    ${t.recent.map((r) => `<tr><td class="num">${esc(dateFmt(r.created_at))}</td><td><b>${esc(r.ticker)}</b></td><td>${esc(sc(r.classification))}</td><td class="num">${money(r.price)}</td>
      <td class="num">${r.fscore == null ? "—" : Math.round(r.fscore)}</td><td class="num">${r.sscore == null ? "—" : Math.round(r.sscore)}</td><td>${esc(r.signal_agreement)}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ------------------------------------------------------------------ stock brief */
const safeUrl = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);
const CONF = { clear: "Clear", partial: "Partial", unclear: "Unclear" };
const fmtDay = (iso) => (iso ? new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

function reasonHtml(r) {
  const u = safeUrl(r.url);
  const src = u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(r.source || "source")} ↗</a>` : `Data: ${esc(r.source || "not recorded")}`;
  return `<li class="reason ${esc(r.role)}">${TAG(r.tag)}
    <span class="rtext">${r.role === "offset" ? `<b class="off">Offset:</b> ` : ""}${esc(r.text)}<span class="rsrc">${src}</span></span></li>`;
}

function briefHtml(b) {
  if (!b || b.error) return `<section class="brief"><p class="muted">Brief not available yet${b && b.error ? ": " + esc(b.error) : ""}. It is built on the next research run.</p></section>`;
  const ev = b.event || {}, d = b.decomposition;
  const shown = (b.reasons || []).filter((r) => r.role !== "context" || r.score >= 20).slice(0, 8);
  const part = (lbl, v) => `<span class="dpart"><span>${lbl}</span><b class="num ${dirCls(v)}">${pct(v, 1)}</b></span>`;
  return `<section class="brief" aria-label="Stock brief">
    <div class="bhead"><span class="blabel">Brief</span>
      <span class="conf-pill ${esc(b.confidence)}" title="${esc(b.confidence_note || "")}">Explanation: ${esc(CONF[b.confidence] || b.confidence || "—")}</span>
      ${b.intraday && ev.d1 === b.price_date ? `<span class="faint" style="font-size:11px" title="The reaction day is still trading">intraday price</span>` : ""}</div>
    <p class="headline">${esc(b.headline)}</p>
    ${["earnings", "move"].includes(ev.kind) ? `<div class="sec"><h3>Why it moved · ${esc(fmtDay(ev.d0))} → ${esc(fmtDay(ev.d1))}</h3>
      ${d ? `<div class="decomp" aria-label="Move split">${part("Move", d.stock)}${part("Market", d.market)}${part("Sector", d.sector)}${part("Stock-specific", d.specific)}</div>` : ""}
      <ul class="reasons">${shown.map(reasonHtml).join("") || `<li class="muted">No reason found in the stored data.</li>`}</ul>
      ${(b.data_gaps || []).length ? `<p class="gaps">Not available: ${esc(b.data_gaps.join("; "))}.</p>` : ""}</div>` : ""}
    <div class="sec"><h3>At a glance</h3><dl class="glance">${(b.glance || []).map((g) => `<div><dt>${esc(g.label)}</dt><dd>${esc(g.text)}</dd></div>`).join("")}
      ${b.what_changes ? `<div><dt>What would change the view</dt><dd>${esc(b.what_changes)}</dd></div>` : ""}</dl></div>
    <div class="bottom"><span class="blabel">Bottom line</span> ${TAG("INFERENCE")}<p>${esc(b.bottom_line)}</p></div>
  </section>`;
}

async function fillBrief(t) {
  const box = $("#brief-box"); if (!box) return;
  let html;
  try { html = briefHtml(await load(`/api/brief?t=${encodeURIComponent(t)}`)); } catch (e) { html = briefHtml({ error: e.message }); }
  if ($("#brief-box") === box) box.innerHTML = html;
}
const briefSlot = `<div id="brief-box"><section class="brief"><div class="skeleton" style="height:110px;border-radius:8px"></div></section></div>`;

function moversHtml(list) {
  if (!list || !list.length) return "";
  const kindTxt = (m) => (m.kind === "earnings" ? "earnings · " : m.kind === "pending" ? "reported · " : "");
  return `<section class="movers-wrap" aria-label="Why they moved"><div class="mv-h"><h2>Why they moved</h2>
    <span class="faint">Recent earnings reactions and big moves · tap for the brief</span></div>
    <div class="movers">${list.slice(0, 4).map((m) => `<button class="mover" data-t="${esc(m.ticker)}" aria-label="${esc(m.ticker)}: ${esc(m.headline)}">
      <div class="mtop"><span class="tk">${esc(m.ticker)}</span><span class="num ${dirCls(m.move)}">${m.kind === "pending" ? "" : pct(m.move, 1)}</span>
        <span class="faint">${kindTxt(m)}${esc(fmtDay(m.date))}</span></div>
      <div class="mhead" title="${esc(m.headline)}">${esc(m.why || m.headline)}</div></button>`).join("")}</div>
    ${list.length > 4 ? `<p class="faint mv-more">+${list.length - 4} more: ${list.slice(4).map((m) => esc(m.ticker)).join(", ")}</p>` : ""}</section>`;
}

/* ------------------------------------------------------------------ drawer */
function openDrawer(html) {
  $("#drawer-body").innerHTML = html;
  $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false"); $("#scrim").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#drawer-close").focus(), 50);
}
function closeDrawer() {
  if (location.search.includes("open=")) history.replaceState(null, "", location.pathname + location.hash);
  $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); $("#scrim").hidden = true; document.body.style.overflow = "";
  if (state.chart) { state.chart.remove(); state.chart = null; }
}

function findCard(t) {
  const h = state.home; return [...h.mine, ...h.others].find((c) => c.ticker === t);
}
const SIZE_CLS = { HIGH: "sz-high", MEDIUM: "sz-med", LOW: "sz-low" };
function itemHead(i) {
  const word = { up: "helps", down: "hurts", "two-sided": "could go either way" }[i.direction] || i.direction;
  const size = i.size_label.charAt(0) + i.size_label.slice(1).toLowerCase();
  return `<span class="ichip"><span class="arw ${i.direction === "up" ? "arw-up" : i.direction === "down" ? "arw-down" : "arw-two"}" aria-label="${word}">${esc(i.arrow)}</span> <b class="${SIZE_CLS[i.size_label] || ""}">${esc(size)}</b> <span class="faint">${esc(i.horizon)}</span></span>`;
}
function mattersHtml(im) {
  if (!im) return "";
  const items = im.main.length ? `<ol class="matters-list">${im.main.map((i) => `<li><details><summary>${itemHead(i)} — ${esc(i.so_what)} ${TAG("INFERENCE")}</summary>
      <div class="why"><div><b>Fact:</b> ${esc(i.fact)} ${TAG(i.fact_tag)}</div><div><b>What would change this:</b> ${esc(i.change)}</div></div></details></li>`).join("")}</ol>`
    : `<p class="faint">Nothing material right now. The full picture is under “More detail”.</p>`;
  // The rule follows the top-ranked item, which is also what the bottom-line sentence leads with.
  const dom = !im.main.length ? "none" : { up: "up", down: "down" }[im.main[0].direction] || "either";
  return `<section class="matters" aria-label="What matters"><p class="bl bl-${dom}">${esc(im.bottom_line)}</p>${items}
    <p class="faint" style="font-size:11px;margin:6px 0 0">Ranked by possible impact (↑ helps · ↓ hurts · ? either way). Tap an item for the fact behind it. Information only — never changes the scores or verdict.</p></section>`;
}

/* Mentor: pros, cons, what to watch, what connects (display-only, templates; no LLM). */
const CONN_DIR = { positive: ["up", "↑", "good news"], negative: ["down", "↓", "bad news"], mixed: ["either", "?", "could go either way"],
  event: ["event", "•", "event coming"] };
const MACRO_LABEL = { ai_capex: "AI capex", rates: "Rates", consumer: "Consumer", ad_market: "Ad market", usd: "Dollar", china: "China",
  export_controls: "Export rules", memory_cycle: "Memory cycle", ev_demand: "EV demand" };
function connMap(t, items) {
  const nodes = items.slice(0, 8), n = nodes.length;
  if (!n) return "";
  const w = 320, h = 220, cx = w / 2, cy = h / 2, rx = 118, ry = 78;
  const parts = nodes.map((x, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2, nx = cx + rx * Math.cos(a), ny = cy + ry * Math.sin(a);
    const d = CONN_DIR[x.direction] || ["none", "", "no recent news"];
    // arrow runs from the connected name toward this stock, stopping short of both labels
    const dx = cx - nx, dy = cy - ny, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const x1 = nx + ux * 22, y1 = ny + uy * 14, x2 = cx - ux * 34, y2 = cy - uy * 16;
    const label = x.role === "macro" ? (MACRO_LABEL[x.ticker] || x.ticker) : x.ticker;
    return `<g><title>${esc(label)}: ${esc(d[2])}</title><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="cm-l cm-${d[0]}" marker-end="url(#cm-a-${d[0]})"/>
      <text x="${nx.toFixed(1)}" y="${(ny + 4).toFixed(1)}" text-anchor="middle" class="cm-n${x.role === "macro" ? " cm-macro" : ""}">${esc(label)}</text></g>`;
  }).join("");
  const mk = ["up", "down", "either", "event", "none"].map((k) => `<marker id="cm-a-${k}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="cm-h cm-${k}"/></marker>`).join("");
  const desc = nodes.map((x) => `${x.role === "macro" ? (MACRO_LABEL[x.ticker] || x.ticker) : x.ticker}: ${(CONN_DIR[x.direction] || [0, 0, "no recent news"])[2]}`).join("; ");
  return `<svg class="cmap" viewBox="0 0 ${w} ${h}" role="img" aria-label="Connections to ${esc(t)}. ${esc(desc)}"><defs>${mk}</defs>${parts}
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" class="cm-c">${esc(t)}</text></svg>
    <p class="cm-key faint"><span class="arw arw-up">↑</span> good news <span class="arw arw-down">↓</span> bad news <span class="arw arw-two">?</span> either way <span class="cm-ev">•</span> report coming · grey: no recent news</p>`;
}
function mentorHtml(t, m) {
  if (!m) return "";
  const li = (x) => `<li>${esc(x.text)} ${TAG(x.tag)}${x.evidence ? `<div class="mt-ev">${esc(x.evidence)}</div>` : ""}</li>`;
  const col = (title, cls, xs, none) => `<div class="mt-col ${cls}"><h4>${title}</h4>${xs.length ? `<ul>${xs.map(li).join("")}</ul>` : `<p class="faint">${none}</p>`}</div>`;
  const conn = (x) => {
    const d = CONN_DIR[x.direction];
    const arw = d ? `<span class="arw ${d[0] === "up" ? "arw-up" : d[0] === "down" ? "arw-down" : d[0] === "either" ? "arw-two" : "cm-ev"}" aria-label="${d[2]}">${d[1]}</span>` : `<span class="faint" aria-hidden="true">–</span>`;
    return `<li>${arw}<span>${esc(x.text)} ${TAG(x.tag)}</span></li>`;
  };
  const all = [...m.connects, ...(m.connects_more || [])];
  return `<section class="mentor" aria-label="Mentor"><h3>Mentor</h3>
    <div class="mt-pc">${col("Pros", "mt-pro", m.pros, "No clear positives right now.")}${col("Cons", "mt-con", m.cons, "No clear risks flagged right now.")}</div>
    <div class="mt-row"><div class="mt-watch"><h4>What to watch</h4>${m.watch.length ? `<ul>${m.watch.map((w) => `<li>${esc(w.text)} ${TAG(w.tag)}</li>`).join("")}</ul>` : `<p class="faint">Nothing dated or close to a threshold.</p>`}</div></div>
    <div class="mt-conn"><div><h4>What connects</h4>${m.connects.length ? `<ul class="mt-cl">${m.connects.map(conn).join("")}</ul>` : `<p class="faint">No mapped connections.</p>`}
      ${(m.connects_more || []).length ? `<details class="mt-more"><summary>${m.connects_more.length} more connection${m.connects_more.length === 1 ? "" : "s"}</summary><ul class="mt-cl">${m.connects_more.map(conn).join("")}</ul></details>` : ""}</div>
      <div class="mt-map">${connMap(t, all)}</div></div>
    <p class="mt-take">${esc(m.take)} ${TAG(m.take_tag)}</p>
    <div class="mt-q"><h4>Ask the mentor</h4>${m.questions.map((q) => `<details class="mq"><summary>${esc(q.q)}</summary><p>${esc(q.a)} ${TAG(q.tag)}</p></details>`).join("")}</div>
    <p class="faint" style="font-size:11px;margin:8px 0 0">Built from the same filings, estimates, news and relationship map as the rest of this page, using fixed rules (no AI writing). Information only — never changes the scores or verdict, and not a buy or sell call.</p></section>`;
}

/* Scenarios (platform 2c): bull / base / bear with what confirms it and what would change our mind. Display-only. */
/* Key levels + "moves with" (platform 3a/3d). Short, plain English, display-only. */
/* Challenge (platform Phase 4, rule-based): max 3 items up front, the rest folded. Display-only. */
/* Options check (platform 5a): appears only while a scenario is live. Verdict first. Research only. */
/* Long-term view: four separate answers, valuation range (ESTIMATE) with every assumption; rest folded. */
const ANS = { yes: ["arw-up", "yes"], no: ["arw-down", "no"], unclear: ["arw-two", "unclear"] };
const LBL = { strong_business: "Strong business?", attractive_valuation: "Attractive valuation?", attractive_investment: "Attractive investment?", attractive_short_term_trade: "Attractive short-term trade?" };
function labelsHtml(l) {
  return `<ul class="lt-labels">${Object.entries(l).map(([k, v]) => `<li><b>${esc(LBL[k] || k)}</b> <span class="${ANS[v.answer][0]}">${ANS[v.answer][1]}</span> <span class="faint">${esc(v.reason)}</span></li>`).join("")}</ul>`;
}
function thesisHtml(t) {
  if (!t) return "";
  const v = t.valuation || {};
  const rng = (d, a, b, c) => d ? `${a} ${money(d[a === "bear" ? "bear" : "low"])} · ${b} ${money(d[b === "base" ? "base" : "mid"])} · ${c} ${money(d[c === "bull" ? "bull" : "high"])}` : "not available";
  return `<section class="lt" aria-label="Long-term view"><h3>Long-term view (12 months)</h3>${labelsHtml(t.labels)}
    <p class="lt-v">${v.summary ? esc("Value range " + v.summary) : "No valuation range (see assumptions)."} ${TAG("ESTIMATE")}</p>
    <details><summary>Range, catalysts, risks, what would invalidate it, assumptions</summary>
      <p class="faint">Cash-flow value: ${rng(v.dcf, "bear", "base", "bull")}. Own price/sales history: ${rng(v.own_history_ps, "low", "mid", "high")}.</p>
      <h4>Catalysts</h4><ul>${t.catalysts.map((c) => `<li>${esc(c.text)} ${TAG(c.tag)}</li>`).join("")}</ul>
      <h4>Risks</h4><ul>${t.risks.map((c) => `<li>${esc(c.text)} ${TAG(c.tag)}</li>`).join("") || "<li class='faint'>none flagged</li>"}</ul>
      <h4>Invalidated by</h4><ul>${t.invalidation.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      <h4>Assumptions</h4><ul>${(v.assumptions || []).map((c) => `<li class="faint">${esc(c)}</li>`).join("")}</ul>
      <p class="faint">Benchmark: ${esc(t.benchmark_note)}. ${t.forecast_id ? "Logged in the forecast ledger (250 sessions)." : "Not logged (the answer is unclear, or a recent one is still open)."} ${esc(t.label)}.</p></details></section>`;
}
function optionsCheckHtml(o) {
  if (!o || !o.headline) return "";
  const ok = o.verdict === "evaluate";
  const st = (x) => `<li><b>${esc(x.name)}</b>: entry ${x.entry >= 0 ? "debit" : "credit"} $${Math.abs(x.entry).toFixed(2)}, max loss ${x.max_loss == null ? "—" : "$" + x.max_loss.toFixed(2)}, max profit ${x.max_profit == null ? "open-ended" : "$" + x.max_profit.toFixed(2)}, breakeven ${money(x.breakeven)}, theta ${x.theta_day.toFixed(2)}/day <span class="faint">(per share; ×100 per contract)</span></li>`;
  return `<section class="ocheck ${ok ? "oc-ok" : "oc-no"}" aria-label="Options check"><h3>Options check: ${o.direction === "bull" ? "bullish" : "bearish"} setup</h3>
    <p class="oc-head">${esc(o.headline)} ${TAG("INFERENCE")}</p>
    <details><summary>The numbers (expiry ${esc(o.expiry || "")}, ${esc(o.label || "")})</summary>
      <p class="faint">Implied volatility ${o.atm_iv ? (o.atm_iv * 100).toFixed(0) + "%" : "—"} vs ${o.realized_vol_20d ? (o.realized_vol_20d * 100).toFixed(0) + "%" : "—"} realised over 20 days. Market-priced move to expiry: ${o.expected_move_pct != null ? "±" + o.expected_move_pct + "%" : "—"}. ${esc(o.iv_rank || "")}.</p>
      <ul>${(o.structures || []).map(st).join("")}</ul>
      ${(o.skipped || []).length ? `<p class="faint">Not priced: ${esc(o.skipped.join("; "))}</p>` : ""}
      <p class="faint">Delayed quotes from ${esc(o.check_date || "")}; buys at the ask, sells at the bid. No options idea is validated.</p></details></section>`;
}
function challengeHtml(ch) {
  if (!ch || (!ch.top.length && !ch.cio)) return "";
  const SEVC = { high: "arw-down", medium: "arw-two", low: "faint", info: "faint" };
  const item = (x) => `<li><b>${esc(x.label)}:</b> ${esc(x.statement)} ${TAG(x.tag)}</li>`;
  const KIND = { red_team: "Red Team", advocate: "Investor Advocate", bull: "Bull case", bear: "Bear case", disagreement: "Disagreement" };
  const rest = Object.entries(ch.all || {}).filter(([k]) => k !== "cio").map(([k, xs]) => `<h4>${esc(KIND[k] || k)}</h4><ul>${xs.map((x) =>
    `<li><span class="${SEVC[x.severity] || ""}">${esc(x.severity)}</span> ${esc(x.statement)} ${TAG(x.tag)}</li>`).join("")}</ul>`).join("");
  return `<section class="chal" aria-label="Challenge"><h3>Challenge</h3>
    ${ch.cio ? `<p class="chal-cio">${esc(ch.cio.statement)} ${TAG("INFERENCE")}</p>` : ""}
    <ul class="chal-top">${ch.top.map(item).join("")}</ul>
    <details><summary>All challenge points${(ch.open_questions || []).length ? ` and ${ch.open_questions.length} open question${ch.open_questions.length === 1 ? "" : "s"}` : ""}</summary>${rest}
      ${(ch.open_questions || []).length ? `<h4>Open research questions</h4><ul>${ch.open_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}</details>
    <p class="faint" style="font-size:11px;margin:6px 0 0">Fixed rules over the evidence on this page (no AI writing). It can say "no action" or "hold off", but never upgrades the verdict or lifts a risk limit.</p></section>`;
}
function tiesHtml(x) {
  const lv = x && x.levels, mv = x && x.moves;
  if (!lv && !mv) return "";
  const row = (l) => `<li><b class="num">${money(l.price)}</b> ${esc(l.label)} <span class="faint">(${l.distance_pct > 0 ? "+" : ""}${l.distance_pct}%${l.status === "tested" ? ", tested" : ""})</span></li>`;
  return `<section class="ties" aria-label="Key levels and what it moves with"><h3>Key levels</h3>
    ${lv ? `<div class="ties-g"><div><h4>Above</h4><ul>${lv.above.map(row).join("") || '<li class="faint">none nearby</li>'}</ul></div>
      <div><h4>Below</h4><ul>${lv.below.map(row).join("") || '<li class="faint">none nearby</li>'}</ul></div></div>` : ""}
    ${mv ? `<p class="ties-m">${esc(mv.text)} ${TAG(mv.tag)}</p>` : ""}
    <p class="faint" style="font-size:11px;margin:6px 0 0">${lv ? esc(lv.note) + " " : ""}Correlation describes the past, not cause. Information only.</p></section>`;
}
function scenariosHtml(s) {
  if (!s || !(s.scenarios || []).length) return "";
  const ARW = { bull: ["arw-up", "↑", "bullish"], base: ["arw-two", "↔", "range"], bear: ["arw-down", "↓", "bearish"] };
  return `<section class="scen" aria-label="Scenarios"><h3>Scenarios: next ${s.horizon_days} sessions</h3>
    <p class="faint" style="font-size:12px;margin:0 0 8px">From the close on ${esc(s.asof)} (${money(s.last_close)}). Today: ${esc((s.context || []).join("; ") || "no market context available")}.</p>
    <div class="scen-grid">${s.scenarios.slice(0, 3).map((x) => `<div class="scen-c scen-${esc(x.name)}">
      <h4><span class="arw ${ARW[x.name][0]}" aria-label="${ARW[x.name][2]}">${ARW[x.name][1]}</span> ${esc(x.title)}</h4>
      <p>${esc(x.what)}</p>
      <div class="scen-l"><b>What would confirm it</b> <span class="faint">(common convention; not shown to improve results)</span><ul>${x.confirms.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
      <div class="scen-l"><b>What would change our mind</b><ul>${x.change_mind.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
      <p class="scen-a">${esc(x.analogue_text)} ${TAG("FACT")}</p></div>`).join("")}</div>
    <p class="faint" style="font-size:11px;margin:8px 0 0">${esc(s.note)} Each bull and bear case is logged before the next session and scored later on Track record. Information only: never changes the scores or verdict.</p></section>`;
}

function asofHtml(c, kn) {
  const a = (kn && kn.asof) || {};
  const parts = [`prices ${esc(c.price_date || a.prices || "n/a")}`];
  if (a.filings) parts.push(`latest filing ${esc(a.filings)}`);
  if (a.estimates) parts.push(`estimates ${esc(a.estimates)}`);
  return `<p class="asof">Data as of: ${parts.join(", ")}</p>`;
}
function beatBars(vals, labels) {
  const w = 280, h = 92, pad = 16, n = vals.length, bw = Math.min(26, (w - 8) / n - 6);
  const mx = Math.max(1, ...vals.map((v) => Math.abs(v)));
  const allUp = vals.every((v) => v >= 0), allDown = vals.every((v) => v <= 0);
  const y0 = allUp ? h - 6 : allDown ? 6 : h / 2;                 // one-sided data uses the full height
  const sc = ((allUp || allDown) ? h - 6 - pad : h / 2 - pad) / mx;
  const bars = vals.map((v, i) => {
    const x = 4 + i * ((w - 8) / n) + ((w - 8) / n - bw) / 2, bh = Math.max(2, Math.abs(v) * sc);
    const y = v >= 0 ? y0 - bh : y0;
    const ly = v >= 0 ? y - 4 : y + bh + 11;
    return `<g><title>${esc(labels[i] || "")}</title><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" class="${v >= 0 ? "bar-up" : "bar-down"}"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" class="bar-l">${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}%</text></g>`;
  }).join("");
  return `<svg class="kn-bars" viewBox="0 0 ${w} ${h}" role="img" aria-label="Earnings surprise in the last ${n} reports: ${esc(vals.map((v) => v.toFixed(0) + "%").join(", "))}">
    <line x1="0" x2="${w}" y1="${y0}" y2="${y0}" class="bar-axis"/>${bars}</svg>`;
}
function knSpark(vals) {
  if (!vals || vals.length < 2) return "";
  const w = 280, h = 40, mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 4 - ((v - mn) / rng) * (h - 8)).toFixed(1)}`);
  return `<svg class="kn-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="history: ${esc(vals.join(", "))}"><polyline points="${pts.join(" ")}"/>
    <circle cx="${pts[pts.length - 1].split(",")[0]}" cy="${pts[pts.length - 1].split(",")[1]}" r="3"/></svg>`;
}
function keyNumbersHtml(kn) {
  if (!kn || !(kn.tiles || []).length) return "";
  return `<section class="keynums" aria-label="Key numbers"><h3>Key numbers</h3><div class="kn-grid">${kn.tiles.map((x) => `
    <div class="kn"><div class="kn-h"><span class="kn-t" title="${esc(x.explain || "")}" tabindex="0">${esc(x.title)}${x.explain ? ' <span class="kn-i" aria-hidden="true">ⓘ</span>' : ""}</span>${TAG(x.tag)}</div>
      <div class="kn-v num">${esc(x.value)}</div>${x.sub ? `<div class="kn-sub">${esc(x.sub)}</div>` : ""}
      ${x.kind === "bars" ? beatBars(x.series, x.labels) : x.kind === "spark" ? knSpark(x.series) : ""}
      <p class="kn-read">${esc(x.read)}</p></div>`).join("")}</div></section>`;
}
function rememberOrder(t) {
  const seen = [];
  document.querySelectorAll("#main [data-t], #main [data-open]").forEach((el) => {
    const v = (el.dataset.t || el.dataset.open || "").toUpperCase();
    if (v && !seen.includes(v)) seen.push(v);
  });
  if (seen.includes(t)) state.order = seen;
  state.current = t;
}
function stepStock(dir) {
  const o = state.order || [], i = o.indexOf(state.current);
  if (i < 0 || !o.length) return;
  openStock(o[(i + dir + o.length) % o.length]);
}

/* Small daily chart with the levels to watch (post-market review). Daily closes only. */
async function drawMini(el, d) {
  if (!window.LightweightCharts || !el || !d || el.dataset.done) return;
  el.dataset.done = 1;
  const p = await load(`/api/prices/${d.ticker}?days=90`);
  const css = getComputedStyle(document.documentElement), v = (k) => css.getPropertyValue(k).trim();
  const x = d.expect || {};
  levelChart(el, p.bars, (x.above || []).concat(x.below || []).map((l) => ({ name: l.label, price: l.price })),
    { color: v("--series-1"), averages: [["sma50", v("--series-1")], ["sma200", v("--series-2")]] });
}

/* Daily analysis: the read and next session's watch list, beside the chart (fr/daily.py rules). */
function dailyHtml(d) {
  if (!d || d.error) return "";
  const x = d.expect || {};
  return `<section class="daily" aria-label="Daily analysis"><div class="daily-read"><h3>The read</h3>
      <ul>${(d.read || []).map((r) => `<li><b>${esc(r.what)}.</b> ${esc(r.means)} ${TAG(r.tag)}</li>`).join("") || `<li class="faint">Nothing stands out in the daily technicals.</li>`}</ul></div>
    <div class="daily-next"><h3>Next session</h3>
      ${x.range ? `<p class="rng"><b>±${x.range.pct}%</b> typical day <span class="faint">($${x.range.low.toFixed(2)} to $${x.range.high.toFixed(2)})</span></p>` : ""}
      <ul>${(x.if || []).map((l) => `<li>${esc(l)}</li>`).join("")}${(x.events || []).map((e) => `<li><b>Scheduled:</b> ${esc(e)}</li>`).join("")}</ul>
      <p class="dir">${esc(x.direction_note || "")}</p></div>
    <p class="faint small daily-note">${esc(d.note)} As of the ${esc(d.asof || "")} close.</p></section>`;
}

/* Redesign: detail sections start collapsed under a plain title; an empty section is left out. */
function fold(title, html, open) {
  return html && html.trim() ? `<details class="fold"${open ? " open" : ""}><summary>${esc(title)}</summary>${html}</details>` : "";
}

async function openStock(t) {
  t = String(t || "").toUpperCase().trim();
  if (!t) return;
  rememberOrder(t);
  history.replaceState(null, "", `?open=${encodeURIComponent(t)}${location.hash}`);
  let c = findCard(t), kn = null, mentor = null, scen = null, extra = {};
  if (!c) openDrawer(`<div class="dh"><span class="tk" id="drawer-title">${esc(t)}</span></div><div class="skeleton" style="height:220px;border-radius:10px;margin-top:12px"></div>`);
  try {
    const d = await load(`/api/stock?t=${encodeURIComponent(t)}`);
    if (d.error && !c) {
      openDrawer(`<div class="dh"><span class="tk" id="drawer-title">${esc(t)}</span></div><p class="muted" style="margin-top:12px">${esc(d.error)}</p>`);
      return;
    }
    c = c || d.card; kn = d.keynums; mentor = d.mentor; scen = d.scenarios; extra = { levels: d.levels, moves: d.moves_with, challenge: d.challenge, oc: d.options_check, thesis: d.thesis, daily: d.daily };
  } catch (e) {
    if (!c) { openDrawer(`<div class="dh"><span class="tk" id="drawer-title">${esc(t)}</span></div><div class="err">Could not load this stock: ${esc(e.message)}</div>`); return; }
  }
  const lv = c.play.levels, f = c.fundamental;
  openDrawer(`<div class="dh"><span class="tk" id="drawer-title">${esc(c.ticker)}</span><span class="muted">${esc(c.name)}</span></div>
    <div class="dh"><span class="px num">${money(c.price)}</span><span class="num ${dirCls(c.change_1d)}">${pct(c.change_1d)} last session</span></div>
    ${asofHtml(c, kn)}
    <section class="verdict-box" aria-label="Verdict"><div class="biz">${gradeBadge(f)} <span class="hl">${esc(f.headline)}</span></div>
      ${c.todo ? `<p class="todo-line"><b>What to do:</b> ${esc(c.todo)}</p>` : ""}
      <p class="faint" style="font-size:12px">Default is no action: nothing here has a proven edge.</p></section>
    ${mattersHtml(c.impact)}
    <div id="chart-box"></div>
    ${dailyHtml(extra.daily)}
    ${fold("Pros, cons and questions (Mentor)", mentorHtml(c.ticker, mentor))}
    ${fold("The case against (Challenge)", challengeHtml(extra.challenge))}
    ${fold("Long-term view and value range", thesisHtml(extra.thesis))}
    ${fold("Options check", optionsCheckHtml(extra.oc), true)}
    ${fold("Key levels and what it moves with", tiesHtml(extra))}
    ${fold("Scenarios: breakout, range, breakdown", scenariosHtml(scen))}
    ${fold("Key numbers and earnings story", keyNumbersHtml(kn) + (kn && kn.story ? `<section class="story" aria-label="Earnings story"><h3>Earnings story</h3><p>${esc(kn.story)} ${TAG("INFERENCE")}</p></section>` : ""))}
    <details class="all-details" id="all-details"><summary>All details${c.impact && c.impact.n_rest ? `: ${c.impact.n_rest} smaller finding${c.impact.n_rest === 1 ? "" : "s"} and the full analysis` : ": the full analysis"}</summary>
    ${briefSlot}
    <div class="todo-big"><div class="biz">${gradeBadge(f)} <span class="hl">${esc(f.headline)}</span></div>
      <div class="blk" style="margin-top:6px">Short-term label: ${esc(c.category)} · Signal agreement: ${esc(c.signal_agreement)}</div>
      ${c.disagrees ? `<div class="disagree" title="The largest disagreement between this stock's score components. Information only; it does not change the verdict."><b>What disagrees:</b> ${esc(c.disagrees.text)}</div>` : ""}</div>
    <section class="sec plain" aria-label="The business in plain English"><h3>The business in plain English</h3>
      <dl>
        <dt>${f.kind === "etf" ? "What it is" : "Health"} ${f.grade ? `<span class="faint">(grade ${esc(f.grade)})</span>` : ""}</dt><dd>${TAG(f.tags && f.tags.health)} ${gloss(f.health)}</dd>
        <dt>Price</dt><dd>${TAG(f.tags && f.tags.price_text)} ${gloss(f.price_text)}</dd>
        <dt>What's driving it</dt><dd>${TAG(f.tags && f.tags.drivers)} ${f.drivers.map(gloss).join(" ")}</dd>
        ${f.news.length ? `<dt>What the recent news means</dt><dd>${TAG(f.tags && f.tags.news)} ${f.news.map(gloss).join(" ")}</dd>` : ""}
        ${c.attention ? `<dt>Public attention</dt><dd>${TAG("INFERENCE")} ${esc(c.attention.text)} <span class="faint">Display only: never changes the scores or verdict.</span></dd>` : ""}
        ${c.reddit ? `<dt>Reddit buzz</dt><dd>${TAG("INFERENCE")} ${esc(c.reddit.text)} <span class="faint">Display only: Reddit never changes the scores or verdict.</span></dd>` : ""}
        ${(c.news_impact || []).length ? `<dt>News impact</dt><dd><ul class="impact">${c.news_impact.map((x) => `<li>${TAG("INFERENCE")} ${gloss(x)}</li>`).join("")}</ul></dd>` : ""}
        <dt>Our take (6–18 months)</dt><dd class="take">${TAG(f.tags && f.tags.take)} ${gloss(f.take)}</dd>
      </dl></section>
    ${(c.deeper || []).length ? `<section class="sec deeper" aria-label="Deeper fundamentals"><h3>Deeper fundamentals</h3>
      <p class="faint" style="font-size:12px">Extra checks from the company's filings. Information only — they don't change the grade, scores or verdict.</p>
      <dl>${c.deeper.map((d) => `<dt>${esc(d.title)}</dt><dd>${TAG(d.tag)} ${d.flags ? `<ul class="impact">${d.flags.map((x) => `<li>${gloss(x)}</li>`).join("")}</ul>` : gloss(d.text)}</dd>`).join("")}</dl></section>` : ""}
    <section class="sec timing" aria-label="Timing"><h3>Timing (next 2–3 weeks) · ${esc(c.timing.label)}</h3>
      ${c.window ? `<p class="muted" title="The thesis window names the horizon that matters for this stock right now. It does not change the fundamental (6–18 month) or swing (3–20 day) score horizons.">Thesis window: <b>${esc(c.window.window_label)}</b> · driver: ${esc(c.window.driver)} · confidence ${esc(c.window.confidence)} <span class="faint">(rule ${esc(c.window.rule)}; ${esc(c.window.source)})</span></p>` : ""}
      <p>${TAG(c.timing.tag)} ${gloss(c.timing.text)}</p>
      ${lv ? `<h3 style="margin-top:10px">Levels that would invalidate or confirm the thesis</h3><div class="kv"><div><span>Buy zone</span><b class="num">${money(lv.entry_low)}–${money(lv.entry_high)}</b></div><div><span>Exit if below</span><b class="num">${money(lv.invalidation)}</b></div>
        <div><span>First target</span><b class="num">${money(lv.target1)}</b></div><div><span>Gain vs risk</span><b class="num">${lv.risk_reward ?? "—"}×</b></div></div>` : ""}
      
      <details class="more"><summary>More timing detail</summary>
        <p class="muted">Short-term label: ${esc(c.category)}. ${c.blocker ? "Blocker: " + gloss(c.blocker) : ""}</p>
        <p>${gloss(c.play.summary)}</p>
        <p><b>Options</b><br>${gloss(c.options.text)}</p>
        <p><b>Watch for</b></p><ul>${c.watch.map((x, i) => `<li>${TAG((c.watch_tags || [])[i])} ${gloss(x)}</li>`).join("")}</ul>
        <p class="muted">Scores: ${c.kind === "etf" ? "market fund (no company score)" : `business ${c.fscore == null ? "—" : Math.round(c.fscore)}/100, timing ${c.sscore == null ? "—" : Math.round(c.sscore)}/100`}.</p>
      </details></section>
    <div class="sec"><h3>Data quality · ${esc(c.quality.level)}</h3><p class="muted">${c.quality.notes.length ? esc(c.quality.notes.join("; ")) : "Prices and filings are current."} Prices use completed trading days only (last close ${esc(c.price_date)}).</p></div>
    ${(c.impact && c.impact.rest.length) ? `<div class="sec"><h3>Smaller findings</h3><ul class="impact">${c.impact.rest.map((i) => `<li title="What would change this: ${esc(i.change)}">${itemHead(i)} ${esc(i.so_what)}</li>`).join("")}</ul></div>` : ""}
    </details>`);
  fillBrief(c.ticker);
  drawChart(c.ticker, lv, extra.daily);
}

function openEarnings(r) {
  if (!r) return;
  openDrawer(`<div class="dh"><span class="tk" id="drawer-title">${r.importance[0] === 0 ? "★ " : ""}${esc(r.ticker)}</span><span class="muted">${esc(r.name)}</span></div>
    <div class="dh"><span class="pill">${esc(r.weekday)} · ${esc(r.timing)}</span>${r.verdict !== "—" ? badge(r.verdict) : ""}<span class="faint" style="font-size:12px">Estimated date · ${esc(r.source)}</span></div>
    ${r.reported ? `<div class="todo-big">${esc(r.reported)}</div>` : `<div class="todo-big">${esc(r.plan)}</div>`}
    <div class="sec"><h3>What's expected</h3><p>${esc(r.expect)} ${esc(r.priced_in)}</p></div>
    <div class="sec"><h3>Key thing to watch</h3><p>${esc(r.watch)}</p></div>
    <div class="sec"><h3>How it usually trades on earnings</h3><p>${esc(r.history)}</p></div>
    ${r.related ? `<div class="sec"><h3>Knock-on</h3><p>${esc(r.related)}</p></div>` : ""}
    ${r.reported ? `<div class="sec"><h3>Plan</h3><p>${esc(r.plan)}</p></div>` : ""}<div id="chart-box"></div>`);
  drawChart(r.ticker, null);
}

function chartOpts(el) {
  const css = getComputedStyle(document.documentElement), v = (k) => css.getPropertyValue(k).trim();
  return { width: el.clientWidth, height: el.clientHeight, layout: { background: { color: "transparent" }, textColor: v("--muted"), fontFamily: "Source Sans 3, -apple-system, sans-serif", fontSize: 12 },
    grid: { vertLines: { color: v("--line") }, horzLines: { color: v("--line") } }, rightPriceScale: { borderColor: v("--line") },
    timeScale: { borderColor: v("--line") }, crosshair: { mode: 0 } };
}
async function drawChart(t, lv, daily) {
  const box = $("#chart-box"); if (!box) return;
  box.innerHTML = `<div class="sec"><h3>Price</h3><div class="ranges" role="group" aria-label="Chart range">${["1M", "3M", "6M", "1Y"].map((r) => `<button class="btn ${r === "6M" ? "on" : ""}" data-r="${r}">${r}</button>`).join("")}</div>
    <div class="chart" id="chart" role="img" aria-label="${esc(t)} daily candles with volume, moving averages and levels to watch"></div>
    <div class="legend"><span><i style="background:var(--series-3)"></i>20-day</span><span><i style="background:var(--series-1)"></i>50-day</span><span><i style="background:var(--series-2)"></i>200-day</span><span><i class="dash"></i>levels to watch (named at the right)</span></div>
    <div class="lvl-host"></div></div>`;
  if (!window.LightweightCharts) { $("#chart").innerHTML = `<div class="empty">Chart library unavailable (offline?).</div>`; return; }
  let d; try { d = await load(`/api/prices/${t}?days=260`); } catch (e) { $("#chart").innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  if (!d.bars.length) { $("#chart").innerHTML = `<div class="empty">No price data.</div>`; return; }
  const css = getComputedStyle(document.documentElement), v = (k) => css.getPropertyValue(k).trim();
  const x = (daily && daily.expect) || {};
  const levels = (x.above || []).concat(x.below || []).map((l) => ({ name: l.label, price: l.price, explain: l.explain }));
  const defs = (daily && daily.definitions) || {};
  if (lv) [["buy zone", lv.entry_high], ["exit if below", lv.invalidation], ["first target", lv.target1]].forEach(([n, p]) => p != null && levels.push({ name: n, price: p,
    explain: `${n.charAt(0).toUpperCase() + n.slice(1)}, $${Number(p).toFixed(2)}: ${defs[n] || "a reference level"}. A fixed price from the rules, recalculated when the setup changes.` }));
  const last = d.bars[d.bars.length - 1].close;
  const setRange = (ch, r = "6M") => { const n = { "1M": 21, "3M": 63, "6M": 126, "1Y": 252 }[r]; const bars = d.bars;
    ch.timeScale().setVisibleRange({ from: bars[Math.max(0, bars.length - n)].time, to: bars[bars.length - 1].time }); };
  if (state.chart) { try { state.chart.remove(); } catch (e) { /* already gone */ } }
  const { ch } = levelChart($("#chart"), d.bars, levels, { candles: true, volume: true, interactive: true, range: (c) => setRange(c),
    averages: [["sma20", v("--series-3")], ["sma50", v("--series-1")], ["sma200", v("--series-2")]] });
  state.chart = ch;
  box.querySelector(".lvl-host").innerHTML = levelList(levels, last) + (x.range ? `<p class="faint small">Typical one-day range: ${x.range.low.toFixed(2)} to ${x.range.high.toFixed(2)} (±${x.range.pct}%).</p>` : "");
  box.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => { box.querySelectorAll("[data-r]").forEach((y) => y.classList.toggle("on", y === b)); setRange(ch, b.dataset.r); }));
}

/* ------------------------------------------------------------------ boot */
async function viewOversold(main) {
  main.innerHTML = skel();
  const o = await load("/api/oversold");
  const arrow = (d) => ({ up: "↑", down: "↓" }[d] || "?");
  const cls = (d) => (d === "up" ? "arw-up" : d === "down" ? "arw-down" : "arw-two");
  const fund = (f) => `${esc(f.ticker)} ${f.oversold ? `is technically oversold (${f.count} of 4 signs)` : "is not oversold"}${f.dd52 != null ? `, ${Math.abs(f.dd52).toFixed(0)}% below its 52-week high` : ""}`;
  const row = (i) => `<li class="os-item"><details><summary>
      <span class="tk">${esc(i.ticker)}</span>${i.grade ? ` <span class="grade-chip">${esc(i.grade)}</span>` : ""}
      <span class="ichip"><span class="arw ${cls(i.direction)}" aria-label="${esc(i.verdict_label)}">${arrow(i.direction)}</span> <b>${esc(i.verdict_label)}</b> <span class="faint">${esc(i.horizon)}</span></span>
      <span class="so">${esc(i.so_what)}</span></summary>
      <div class="why">
        <div><b>Oversold because:</b> ${esc(i.conditions.join("; "))}. ${TAG("FACT")}</div>
        ${i.decomposition && i.decomposition.stock != null ? `<div><b>Last month's move:</b> ${i.decomposition.stock.toFixed(0)}% = market ${i.decomposition.market.toFixed(0)}% + peers ${i.decomposition.sector.toFixed(0)}% + its own ${i.decomposition.specific.toFixed(0)}%${i.decomposition.with_market_share != null ? ` (share of the drop: market ${Math.round(i.decomposition.with_market_share * 100)}%, peers ${Math.round(i.decomposition.with_peers_share * 100)}%, own ${Math.round(i.decomposition.own_share * 100)}%; parts that moved the other way count as 0)` : ""}. ${TAG("INFERENCE")}</div>` : ""}
        <div><b>Company-specific bad news on record:</b> ${(i.bad_news || []).length ? esc(i.bad_news.join(", ")) : "none"}. ${TAG("FACT")}</div>
        ${i.headline ? `<div><b>The business:</b> ${esc(i.headline)}.</div>` : ""}
        <div><b>What would change this:</b> ${esc(i.change)}</div>
        <div><a href="#" data-open="${esc(i.ticker)}">Open the full stock view</a></div>
      </div></details></li>`;
  main.innerHTML = `<div class="evidence ev-${o.status === "proven edge" ? "positive" : o.status === "proven negative" ? "negative" : "inconclusive"}" role="note"><b>Evidence: </b>${esc(o.banner)}</div>
    <div class="head"><div><h1>Oversold</h1><p class="sub">Stocks that fell unusually far, unusually fast. That's a price condition, not a sign the stock is cheap or good.</p></div></div>
    ${(o.funds || []).length ? `<p class="os-funds">${o.funds.map(fund).join(". ")}.</p>` : ""}
    <section class="today"><h2>Worth looking into</h2>
      <p class="sub">Oversold, with a grade of C or better, no high-impact red flag, no critical news and enough trading volume. Ranked by how many oversold signs hold. Whether a drop is an overreaction or deserved is not judged.</p>
      ${o.worth.length ? `<ol class="os-list">${o.worth.map(row).join("")}</ol>` : `<p class="faint">No oversold stock passes the quality checks today.</p>`}
      ${o.more_worth ? `<p class="faint">${o.more_worth} more pass the checks; shown are the ${o.worth.length} with the clearest case.</p>` : ""}
    </section>
    ${(o.warnings || []).length ? `<section class="today"><h2>Your stocks: mostly their own drop, with bad news on record</h2><ol class="os-list">${o.warnings.map(row).join("")}</ol></section>` : ""}
    <details class="more"><summary>All other oversold names (${o.others.length}) and why they were left out</summary>
      <ul class="os-others">${o.others.map((i) => `<li><b>${esc(i.ticker)}</b> <span class="faint">${Math.abs(i.dd52 || 0).toFixed(0)}% below its high, ${i.count} of 4 signs</span>: ${esc(i.fails.join("; "))}</li>`).join("") || `<li class="faint">None.</li>`}</ul></details>
    <details class="more"><summary>How "oversold" is defined</summary><div class="os-def">
      <p>A stock counts as oversold when at least ${o.min_conditions} of these four are true on its latest close:</p>
      <ul>${o.definition.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
      <p class="faint">Each name shows how the past month's drop splits between the market (QQQ, adjusted for how much the stock usually moves with it), its peers and the stock itself, plus any company-specific bad news on record (estimate or guidance cuts, a revenue miss). The earlier "possible overreaction / falling for a reason" verdict was retired on 2026-11-10: an audit found it mostly reflected whether QQQ had fallen, and it couldn't tell an overreaction from a deserved, sector-wide repricing. Scanned ${o.scanned} stocks, including tech index members we don't track yet. Updated after each research run.</p>
    </div></details>
    <p class="preamble">${esc(o.disclaimer || "")}</p>`;
  main.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openStock(a.dataset.open); }));
}

/* ------------------------------------------------------------------ overview (market first) */
/* A market cockpit, not a document: each widget shows the state, says what it means and what to watch.
   Rules live in fr/overview.py (trend vs 50/200-day, VIX bands, levels the existing checks already use). */
const sgn = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);
function sparkSvg(v, w = 120, h = 34) {
  if (!v || v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (x - lo) / r * (h - 4)).toFixed(1)}`).join(" ");
  return `<svg class="spk ${v[v.length - 1] >= v[0] ? "up" : "dn"}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
/* Level rail: the price among the levels that matter, each with its distance. Replaces a levels table. */
function railHtml(s) {
  if (!s) return "";
  const lv = [["1-month low", s.low20], ["200-day average", s.sma200], ["50-day average", s.sma50], ["1-month high", s.high20]].filter(([, x]) => x != null);
  const all = lv.map(([, x]) => x).concat(s.close), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.06 || 1;
  const pos = (x) => ((x - lo + pad) / (hi - lo + 2 * pad) * 100).toFixed(2);
  const ticks = lv.map(([n, x], i) => { const d = (x / s.close - 1) * 100;
    return `<div class="rk ${i % 2 ? "b" : "t"}" style="left:${pos(x)}%"><span class="tn">${esc(n)}</span><span class="tv">${money(x)}</span><span class="td ${d >= 0 ? "arw-up" : "arw-down"}">${sgn(d)}%</span></div>`; }).join("");
  return `<div class="rail rail-${esc(s.trend || "none")}" role="img" aria-label="${esc(s.ticker)} at ${money(s.close)} against its 20-day low and high and 50- and 200-day averages">
    <div class="track"></div>${ticks}<div class="dot" style="left:${pos(s.close)}%"><span>${money(s.close)}</span></div></div>`;
}
function vixHtml(v) {
  if (!v) return `<p class="faint">VIX not available.</p>`;
  const lo = 10, hi = 40, pos = (x) => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
  const bands = v.bands.map(([a, b, n]) => `<div class="band band-${n}" style="left:${pos(Math.max(a, lo))}%;width:${pos(Math.min(b, hi)) - pos(Math.max(a, lo))}%"><span>${n}</span></div>`).join("");
  return `<div class="gauge-head"><b class="big">${v.value.toFixed(1)}</b><span class="chip chip-${esc(v.label)}">${esc(v.label)}</span></div>
    <div class="fearbar" role="img" aria-label="VIX ${v.value} on a scale from 10 to 40; past-year range ${v.min} to ${v.max}">${bands}
      <div class="yr" style="left:${pos(v.min)}%;width:${pos(v.max) - pos(v.min)}%" title="Past year: ${v.min}–${v.max}"></div><div class="mk" style="left:${pos(v.value)}%"></div></div>
    <p class="means">${v.chg5 >= 2 ? "Up" : v.chg5 <= -2 ? "Down" : "Little changed"}${Math.abs(v.chg5) >= 2 ? ` ${Math.abs(v.chg5).toFixed(1)} points in a week` : " this week"}. Higher than ${v.pct}% of the past year's readings${v.label === "elevated" || v.label === "high" ? ": investors are paying up for protection." : "."}</p>
    <p class="faint small">${esc(v.rule)}. FRED, ${esc(v.date)}.</p>`;
}
/* Level labels live in a gutter beside the plot, never on it (dataviz: selective direct labels, no
   collisions). Nearby levels (within 0.3%) merge into one label; labels are nudged apart (min 18px) and joined
   to their true price by a short leader. Lines on the plot are thin and muted so price stays the strongest mark.
   The distance and meaning of every level go in the list under the chart. */
const LABEL_GAP = 18;
function mergeLevels(levels, last) {
  const xs = levels.filter((l) => l.price != null).sort((a, b) => b.price - a.price), out = [];
  xs.forEach((l) => { const p = out[out.length - 1];
    if (p && Math.abs(p.price / l.price - 1) < 0.003) { p.name += " / " + l.name; p.price = (p.price + l.price) / 2; }
    else out.push({ ...l }); });
  return out.map((l) => ({ ...l, dist: (l.price / last - 1) * 100 }));
}
function pickLevels(levels, last, perSide) {
  const up = levels.filter((l) => l.price >= last).sort((a, b) => a.price - b.price).slice(0, perSide);
  const dn = levels.filter((l) => l.price < last).sort((a, b) => b.price - a.price).slice(0, perSide);
  return up.concat(dn);
}
function placeLabels(items, height) {             // items: [{y}] -> adds ly (label y), no two closer than LABEL_GAP
  const xs = items.filter((i) => i.y != null).sort((a, b) => a.y - b.y);
  xs.forEach((it, i) => { it.ly = Math.max(it.y, i ? xs[i - 1].ly + LABEL_GAP : 9); });
  for (let i = xs.length - 1; i >= 0; i--) { const max = i === xs.length - 1 ? height - 9 : xs[i + 1].ly - LABEL_GAP; if (xs[i].ly > max) xs[i].ly = max; }
  return xs;
}
function levelChart(host, bars, levels, opts = {}) {
  host.innerHTML = `<div class="lc"><div class="lc-plot"></div><div class="lc-gutter"><svg class="lc-lead"></svg></div></div>`;
  const plot = host.querySelector(".lc-plot"), gut = host.querySelector(".lc-gutter"), svg = gut.querySelector("svg");
  const css = getComputedStyle(document.documentElement), v = (k) => css.getPropertyValue(k).trim();
  const ch = LightweightCharts.createChart(plot, { ...chartOpts(plot), handleScroll: !!opts.interactive, handleScale: !!opts.interactive,
    rightPriceScale: { borderColor: v("--line"), scaleMargins: { top: 0.1, bottom: opts.volume ? 0.22 : 0.08 } } });
  const last = bars[bars.length - 1].close;
  let ser;
  if (opts.candles) {
    ser = ch.addCandlestickSeries({ upColor: v("--up"), downColor: v("--down"), wickUpColor: v("--up"), wickDownColor: v("--down"), borderVisible: false });
    ser.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
  } else {
    ser = ch.addAreaSeries({ lineColor: opts.color || v("--accent"), topColor: "rgba(122,167,255,.14)", bottomColor: "rgba(122,167,255,0)", lineWidth: 2, priceLineVisible: false });
    ser.setData(bars.map((b) => ({ time: b.time, value: b.close })));
  }
  if (opts.volume) {
    const vol = ch.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    ch.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    vol.setData(bars.filter((b) => b.volume != null).map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? v("--up-soft") : v("--down-soft") })));
  }
  (opts.averages || []).forEach(([k, col]) => ch.addLineSeries({ color: col, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    .setData(bars.filter((b) => b[k] != null).map((b) => ({ time: b.time, value: b[k] }))));
  const shown = pickLevels(mergeLevels(levels, last), last, innerWidth < 600 ? 1 : 2);
  shown.forEach((l) => ser.createPriceLine({ price: l.price, color: v("--line2"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" }));
  const draw = () => {
    const h = plot.clientHeight;
    const items = placeLabels(shown.map((l) => ({ ...l, y: ser.priceToCoordinate(l.price) })), h);
    gut.querySelectorAll(".lc-l").forEach((e) => e.remove());
    svg.setAttribute("viewBox", `0 0 14 ${h}`); svg.setAttribute("height", h);
    svg.innerHTML = items.map((i) => `<path d="M0 ${i.y.toFixed(1)} L6 ${i.y.toFixed(1)} L12 ${i.ly.toFixed(1)}" />`).join("");
    items.forEach((i) => { const e = document.createElement("div"); e.className = "lc-l " + (i.price >= last ? "a" : "b"); e.style.top = `${i.ly}px`;
      e.textContent = innerWidth < 600 ? i.name : `${i.name} ${i.price.toFixed(2)}`; e.title = `${i.name}: ${i.price.toFixed(2)} (${i.dist >= 0 ? "+" : ""}${i.dist.toFixed(2)}% from the last close)`; gut.appendChild(e); });
  };
  ch.timeScale().fitContent();
  if (opts.range) opts.range(ch);
  requestAnimationFrame(draw);
  ch.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(draw));
  new ResizeObserver(() => { ch.applyOptions({ width: plot.clientWidth, height: plot.clientHeight }); requestAnimationFrame(draw); }).observe(plot);
  host.__labels = () => [...gut.querySelectorAll(".lc-l")].map((e) => e.getBoundingClientRect());
  return { ch, ser, shown };
}
/* List under a chart: every level with its distance and meaning (the chart only carries short labels). */
function levelList(levels, last) {
  const xs = mergeLevels(levels, last);
  return `<ul class="lvl-list">${xs.map((l) => `<li class="${l.price >= last ? "a" : "b"}"><span class="nm">${esc(l.name)}</span><span class="pr">${l.price.toFixed(2)}</span>
    <span class="ds ${l.dist >= 0 ? "arw-up" : "arw-down"}">${l.dist >= 0 ? "+" : "−"}${Math.abs(l.dist).toFixed(2)}%</span>${l.explain || l.means ? `<span class="mn">${esc(l.explain || l.means)}</span>` : ""}</li>`).join("")}</ul>`;
}
async function drawIndexChart(host, t, s, gates) {
  if (!window.LightweightCharts || !host) return;
  const d = await load(`/api/prices/${t}?days=180`);
  const css = getComputedStyle(document.documentElement), v = (k) => css.getPropertyValue(k).trim();
  const levels = (gates || []).filter((g) => g.ticker === t).map((g) => ({ name: g.name, price: g.level, explain: g.explain }));
  levelChart(host.querySelector(".cbox"), d.bars, levels, { color: s.trend === "downtrend" ? v("--down") : s.trend === "uptrend" ? v("--up") : v("--warn") });
  host.querySelector(".lvl-host").innerHTML = levelList(levels, s.close);
}
const STATE_GLYPH = { uptrend: "↗", downtrend: "↘", sideways: "→", calm: "○", normal: "◔", elevated: "◑", high: "●" };
async function viewOverview(main) {
  main.innerHTML = skel();
  const o = await load("/api/overview");
  const ix = o.indices || {}, t = o.today || {}, reg = o.register || { rows: [] }, acc = o.accountability || {}, st = o.stocks || [];
  const mine = st.filter((r) => r.mine), others = st.filter((r) => !r.mine);
  const tone = /downtrend/.test(o.verdict.text) ? "dn" : /sideways/.test(o.verdict.text) ? "mid" : "up";
  const idxCard = (k) => { const s = ix[k]; if (!s) return "";
    return `<article class="ix ix-${esc(s.trend || "none")}"><header><b class="tk">${k}</b><span class="px">${money(s.close)}</span>
      <span class="num ${dirCls(s.chg)}">${pct(s.chg)}</span><span class="chip chip-${esc(s.trend)}">${esc(s.trend || "—")}</span></header>
      ${railHtml(s)}<p class="means">${esc(s.means || "")}</p></article>`; };
  const maxAbs = Math.max(1, ...(o.sectors || []).map((x) => Math.abs(x.rel20)));
  main.innerHTML = `
  <section class="cockpit ck-${tone}">
    <div class="ck-head">
      <h1 class="sr-only">${esc(o.verdict.text)}</h1>
      <div class="states" aria-hidden="true">${(o.verdict.states || []).map((x) => `<div class="st st-${esc(x.state)}">
        <span class="st-l">${esc(x.label)}</span><span class="st-v">${esc(STATE_GLYPH[x.state] || "")} ${esc(x.state.charAt(0).toUpperCase() + x.state.slice(1))}</span>
        ${x.kind === "fear" && x.value != null ? `<span class="st-n">VIX ${x.value.toFixed(1)}${x.stale ? `, as of ${esc(fmtDay(x.date))} (latest not stored yet)` : `, ${esc(fmtDay(x.date))} close`}</span>` : `<span class="st-n">${esc(fmtDay(o.asof))} close</span>`}</div>`).join("")}</div>
      <p class="ck-sub">${esc(o.conclusion[0])}</p>
      <div class="ck-todo"><span class="k">What to do</span><span class="v">${esc(o.todo)}</span></div>
      <details class="ck-rules"><summary>How this is worked out</summary><p>${o.verdict.rules.map(esc).join(" ")} Descriptive, not a forecast.</p></details>
    </div>
    <div class="ck-grid">
      ${idxCard("SPY")}${idxCard("QQQ")}
      <article class="gauge"><h2>Fear (VIX)</h2>${vixHtml(o.vix)}</article>
      <article class="gauge"><h2>Breadth</h2>${o.breadth ? `<div class="gauge-head"><b class="big">${o.breadth.value}%</b><span class="faint">of tracked tech above its 50-day</span></div>
        <div class="meter" role="img" aria-label="${o.breadth.value} percent"><i style="width:${o.breadth.value}%"></i><b style="left:50%"></b></div>
        <p class="explain"><b>What it is:</b> the share of the ~50 tech stocks we track that closed above their 50-day average. High means most stocks are rising together; low means a few names carry the market.</p><p class="means">${esc(o.breadth.means)}</p>` : `<p class="faint">Not available.</p>`}
        ${o.rates && o.rates.y10 ? `<div class="mini"><span>10-year yield <b>${o.rates.y10.value.toFixed(2)}%</b></span><p class="means">${esc(o.rates.y10_means || "")}</p></div>` : ""}
        ${o.rates && o.rates.credit ? `<div class="mini"><span>Credit spread <b>${o.rates.credit.value.toFixed(2)}%</b></span><p class="means">${esc(o.rates.credit_means || "")}</p></div>` : ""}</article>
    </div>
    <div class="heat" aria-label="Sectors over 20 sessions versus SPY">${(o.sectors || []).map((x) => { const a = Math.min(1, Math.abs(x.rel20) / maxAbs);
      return `<div class="cell" style="--a:${(0.15 + a * 0.75).toFixed(2)}" data-dir="${x.rel20 >= 0 ? "up" : "dn"}" title="${esc(x.sector)} ${sgn(x.rel20, 1)} points vs SPY over 20 sessions"><b>${esc(x.sector)}</b><span>${sgn(x.rel20, 1)}</span></div>`; }).join("")}</div>
    <p class="heat-cap faint small">Sector funds against SPY over 20 sessions. ${(o.drivers || []).slice(0, 1).map((d) => esc(d.means)).join("")}</p>
  </section>

  <section class="charts">
    ${["SPY", "QQQ"].filter((k) => ix[k]).map((k) => `<figure class="ixchart" id="ixc-${k}"><figcaption><b>${k}</b>: the levels that would change the read</figcaption><div class="cbox"></div><div class="lvl-host"></div></figure>`).join("")}
  </section>

  <section class="today2">
    <div class="t-col">
      <h2>Today</h2>
      <p class="faint small">${esc(t.data_note || "")}</p>
      <ul class="movers">${(t.movers || []).map((m) => `<li><button class="lnk" data-open="${esc(m.ticker)}"><b>${esc(m.ticker)}</b></button> <span class="num ${dirCls(m.chg)}">${pct(m.chg)}</span><span class="why">${esc(m.why)}</span></li>`).join("")}</ul>
      ${t.report ? `<p class="small"><a href="#/reports">${esc(t.report.title)}</a>: ${esc(t.report.verdict)}</p>` : ""}
    </div>
    <div class="t-col">
      <h2>Coming up</h2>
      <ol class="timeline">${(o.next || []).map((e) => `<li class="ev-${esc(e.kind)}"><div><time>${esc(fmtDay(e.date))}${e.time ? `<small>${esc(e.time)}</small>` : ""}</time><b>${esc(e.what)}</b><p>${esc(e.why)}</p></div></li>`).join("") || `<li class="faint">Nothing major scheduled in the next 10 days.</li>`}</ol>
    </div>
  </section>

  <section class="stocks2">
    <h2>Your stocks</h2>
    <div class="sgrid">${mine.map((r) => `<button class="scard" data-open="${esc(r.ticker)}">
      <span class="row1"><b class="tk">${esc(r.ticker)}</b>${r.grade ? `<span class="grade-chip">${esc(r.grade)}</span>` : ""}<span class="px">${money(r.price)}</span><span class="num ${dirCls(r.chg)}">${pct(r.chg)}</span></span>
      ${sparkSvg(r.spark)}
      <span class="read">${esc(r.read || r.line || "")}</span>
      ${r.watch ? `<span class="watch">Watch: ${esc(r.watch)}</span>` : ""}</button>`).join("")}</div>
    ${others.length ? `<p class="faint small">Also worth a look: ${others.map((r) => `<button class="lnk" data-open="${esc(r.ticker)}">${esc(r.ticker)}</button>`).join(", ")}</p>` : ""}
  </section>

  <section class="setups2">
    <h2>Live setups <span class="faint">${esc(reg.line)}</span></h2>
    ${reg.rows.length ? `<ul class="setups">${reg.rows.map((r) => `<li><button class="lnk" data-open="${esc(r.name)}"><b>${esc(r.name)}</b></button> <span class="chip">${esc(r.setup)}</span>
      <span>${esc(r.latest)}.</span> <span class="next">Needs next: ${esc(r.next)}.</span></li>`).join("")}</ul>` : `<p class="faint">No live setups.</p>`}
    <p class="faint small">${esc(reg.note)} <a href="#/opportunities">Full pipeline</a></p>
  </section>

  <details class="more ov-more"><summary>More context: what changed, drivers, evidence, accountability</summary>
    <div class="ov-more-grid">
      <div><h3>What changed</h3><ul>${o.changed.map((c) => `<li><span class="faint">${esc(fmtDay(c.date))}</span> ${esc(c.text)}</li>`).join("")}</ul></div>
      <div><h3>What's driving the market</h3><ul>${(o.drivers || []).map((d) => `<li>${esc(d.text)} <b>${esc(d.means)}</b></li>`).join("")}</ul></div>
      <div><h3>Where the evidence disagrees</h3><ul>${(o.evidence || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><h3>Our record</h3><ul><li>${esc(acc.positions)}</li><li>${esc(acc.results)} ${esc(acc.ledger)}</li><li>${esc(acc.runs)}</li></ul><a href="#/track">Track record</a></div>
      <div><h3>Not available from free sources</h3><ul>${(o.not_available || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div></details>
  <p class="preamble">Research, not advice. Nothing is traded; every decision is yours.</p>`;
  main.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openStock(a.dataset.open); }));
  ["SPY", "QQQ"].forEach((k) => { if (ix[k]) drawIndexChart($(`#ixc-${k}`), k, ix[k], o.gates).catch(() => {}); });
}

const VIEWS = { overview: viewOverview, stocks: viewStocks, earnings: viewEarnings, market: viewMarket, opportunities: viewOpps, oversold: viewOversold, reports: viewReports, track: viewTrack, discovery: viewDiscovery, ops: viewOps, settings: viewSettings };
const skel = () => `<div class="list">${'<div class="skeleton"></div>'.repeat(6)}</div>`;
function whenPlotly(fn, tries = 0) { if (window.Plotly) fn(); else if (tries < 60) setTimeout(() => whenPlotly(fn, tries + 1), 100); else { const e = $("#treemap"); if (e) e.innerHTML = `<div class="empty">Heatmap library unavailable (offline?).</div>`; } }

async function route() {
  const v = (location.hash.replace("#/", "") || "overview").split("?")[0];
  const view = VIEWS[v] ? v : "overview";
  document.querySelectorAll(".tabs a").forEach((a) => { a.classList.toggle("active", a.dataset.view === view); a.setAttribute("aria-current", a.dataset.view === view ? "page" : "false"); });
  const more = document.querySelector(".more-nav");
  if (more) { more.classList.toggle("active", !!more.querySelector(`a[data-view="${view}"]`)); more.open = false; }
  closeDrawer();
  const main = $("#main");
  try { await VIEWS[view](main); } catch (e) { main.innerHTML = `<div class="err">Could not load this view: ${esc(e.message)}</div>`; }
}

document.addEventListener("click", (e) => {               // close the More menu on any click outside it, or on a choice
  const m = document.querySelector(".more-nav");
  if (m && m.open && (!m.contains(e.target) || e.target.closest(".more-menu a"))) m.open = false;
});

async function boot(force = false) {
  const main = $("#main");
  if (!state.home) main.innerHTML = skel();
  try {
    if (force) { await api("/api/refresh", { method: "POST" }); state.cache = {}; }
    state.home = await load("/api/home", force);
    renderChrome(state.home);
    // Deep link: ?open=NVDA opens that stock's panel (shareable; also used for screenshots).
    // Read it before route(): route() closes the drawer, which clears ?open from the address.
    const open = new URLSearchParams(location.search).get("open");
    await route();
    if (open && !force) openStock(open.toUpperCase());
  } catch (e) { main.innerHTML = `<div class="err">Could not load research data: ${esc(e.message)}. The research database may still be building — try Refresh in a minute.</div>`; }
}

window.addEventListener("hashchange", route);
$("#drawer-close").addEventListener("click", closeDrawer);
$("#scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "");
  if (e.key === "Escape") { if (typing) e.target.blur(); closeDrawer(); return; }
  if (typing) return;
  if (e.key === "/") { e.preventDefault(); const j = $("#jump"); if (j) j.focus(); return; }
  const open = $("#drawer") && $("#drawer").classList.contains("open");
  if (open && e.key === "ArrowRight") { e.preventDefault(); stepStock(1); }
  if (open && e.key === "ArrowLeft") { e.preventDefault(); stepStock(-1); }
});
(async () => {
  const j = $("#jump");
  if (!j) return;
  try {
    const d = await load("/api/tickers");
    $("#jump-list").innerHTML = d.tickers.map((x) => `<option value="${esc(x.t)}">${esc(x.n)}</option>`).join("");
  } catch (e) {}
  const go = () => { const v = j.value.trim().toUpperCase().split(/\s/)[0]; if (v) { openStock(v); j.value = ""; j.blur(); } };
  j.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  j.addEventListener("change", go);
})();
if ($("#refresh")) $("#refresh").addEventListener("click", () => boot(true));
$("#theme").addEventListener("click", () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t; try { localStorage.setItem("fr-theme", t); } catch (e) {}
  route();
});
setInterval(tickCountdown, 1000);
setInterval(() => boot(true), 5 * 60 * 1000);   // pick up new research runs automatically
boot();

/* Label self-check (scripts/check_chart_labels.py): with ?selfcheck=1 the page measures every chart label and writes
   the result into <pre id="selfcheck">. Fails on a label overlapping another label or sitting on a plot. */
if (new URLSearchParams(location.search).get("selfcheck")) {
  setTimeout(() => {
    const out = { charts: 0, labels: 0, overlaps: [], on_plot: [] };
    document.querySelectorAll(".lc").forEach((lc, ci) => {
      out.charts++;
      const plot = lc.querySelector(".lc-plot").getBoundingClientRect();
      const ls = [...lc.querySelectorAll(".lc-l")].map((e) => ({ t: e.textContent, r: e.getBoundingClientRect() }));
      out.labels += ls.length;
      ls.forEach((a, i) => {
        if (a.r.left < plot.right - 0.5 && a.r.right > plot.left && a.r.top < plot.bottom && a.r.bottom > plot.top) out.on_plot.push(`${ci}:${a.t}`);
        ls.slice(i + 1).forEach((b) => { if (a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5) out.overlaps.push(`${ci}:${a.t} | ${b.t}`); });
      });
    });
    const pre = document.createElement("pre"); pre.id = "selfcheck"; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
  }, 9000);
}
