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
  if (u.pathname === "/api/ta") return `data/ta/${t}.json`;
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
  $("#disclaimer").textContent = "Research only, not advice.";
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
  let sy = null;
  try { sy = await load("/api/synthesis"); } catch (e) { sy = null; }
  const repRow = (r, label) => !r ? `<li class="rp3"><b>${esc(label)}</b><span class="faint">Not generated yet.</span></li>` :
    `<li class="rp3"><details><summary><b>${esc(label)}</b><span class="faint">${esc(fmtDay(r.report_date || ""))}</span><span class="one">${esc((r.verdict || {}).text || r.headline || "")}</span></summary>${reportHtml(r, label)}</details></li>`;
  main.innerHTML = pageHead("Reports", "Daily reports and every Committee Conclusion. Open one to read it; saved reports never change.") +
    `<h2 class="h3s">Latest</h2><ul class="rp3s">${repRow(d.premarket, "Premarket Plan")}${repRow(d.postmarket, "Post-Market Review")}${repRow(d.weekly, "Weekly Outlook")}</ul>` +
    `${sy ? `<h2 class="h3s">Committee Conclusions</h2><p class="sub">${esc(sy.label)}. One a weekday after the close; saved reports never change.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Data Date</th><th>Written</th><th>Source</th><th></th></tr></thead><tbody>
    ${(sy.archive || []).map((a, i) => `<tr><td class="num">${esc(a.asof)}</td><td>${esc((a.created_at || "").slice(0, 16).replace("T", " "))} UTC</td><td>${esc(a.source)}${a.note ? `<div class="faint small">${esc(a.note)}</div>` : ""}</td>
      <td><button class="btn ghost" data-syn="${i}">Open</button></td></tr>`).join("") || `<tr><td colspan="4" class="empty">No conclusions yet.</td></tr>`}</tbody></table></div><div id="syn-open"></div>` : ""}
    <h2 class="h3s">Report Archive</h2><div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Report</th><th></th></tr></thead><tbody>
    ${(d.archive || []).map((a) => `<tr><td class="num">${esc(a.report_date)}</td><td>${esc({ weekly: "Weekly outlook", premarket: "Premarket plan", postmarket: "Post-market review" }[a.kind])}</td>
      <td><button class="btn ghost" data-rep="${esc(a.report_id)}">Open</button></td></tr>`).join("") || `<tr><td colspan="3" class="empty">No reports yet.</td></tr>`}</tbody></table></div>
    <div id="rep-open"></div>`;
  main.querySelectorAll("[data-syn]").forEach((b) => b.addEventListener("click", () => {
    const a = sy.archive[+b.dataset.syn]; $("#syn-open").innerHTML = synthesisHtml({ ...a, label: sy.label }, null); $("#syn-open").scrollIntoView();
  }));
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
  let K = null; try { K = await load("/api/committee"); } catch (e) { K = null; }
  const agentHealth = K ? `<section class="cc-sec"><h2>Agent Health</h2><div class="tbl-wrap"><table><thead><tr><th>Agent</th><th>Runs On</th><th>Latest Input</th><th>Status</th></tr></thead><tbody>
    ${[["Fundamental", "SEC filings, quality grade, valuation", (o.staleness || []).find((s) => /SEC/.test(s.data))],
       ["Macro", "QQQ/SPY trend, VIX, FRED series", (o.staleness || []).find((s) => /VIX/.test(s.data))],
       ["Quant", "Signal registry, forecast ledger", null],
       ["Technical", "Daily bars, level registry", (o.staleness || []).find((s) => /QQQ/.test(s.data))],
       ["Risk", "Risk controller, calendars", (o.staleness || []).find((s) => /Levels/.test(s.data))]].map(([n, src, st]) =>
       `<tr><td>${n}</td><td>${esc(src)}</td><td>${st ? esc(st.latest) : "—"}</td><td>${st && st.missing ? "Missing input" : "Running"}</td></tr>`).join("")}
    <tr><td>CIO (AI note)</td><td>Claude Code on your plan login, once a day</td><td>${esc(((K.ai_status || {}).last_run || {}).detail || "never run")}</td><td>${(K.ai_status || {}).available_today ? "Ran today" : esc(((K.ai_status || {}).last_run || {}).status || "Not run today")}</td></tr>
    </tbody></table></div></section>` : "";
  const tbl = (rows, cols) => `<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c[1])}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(String(r[c[0]] ?? "—"))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}" class="empty">none</td></tr>`}</tbody></table></div>`;
  main.innerHTML = agentHealth + `<div class="head"><div><h1>Research operations</h1><p class="sub">System state: jobs, data freshness, schedules, open questions, signal registry. Generated ${esc(dateFmt(o.generated_at))}.</p></div></div>
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
  if (h.disabled) { main.innerHTML = `<div class="head"><div><h1>Settings</h1><p class="sub">${esc(h.note)}</p></div></div>`; return; }
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
function synCompareHtml(sy) {
  if (!sy || !sy.comparison) return "";
  const C = sy.comparison, w = C.waits || [];
  const cell = (o) => (o.status === "scored" ? `${o.excess >= 0 ? "+" : ""}${o.excess.toFixed(2)} pts` : esc(o.status));
  return `<h2>Synthesis vs Rule Vote vs AI Note</h2><p class="sub">${esc(C.note)}</p>
    <div class="tbl-wrap"><table class="sortable"><thead><tr><th>Source</th><th class="num">Calls</th><th class="num">Matured</th><th class="num">Hit Rate vs Benchmark</th><th class="num">Avg Excess In Call Direction</th></tr></thead><tbody>
    ${C.rows.map((r) => `<tr><td><b>${esc(r.source)}</b></td><td class="num">${r.calls}</td><td class="num">${r.matured}</td><td class="num">${r.hit_rate_pct != null ? r.hit_rate_pct + "%" : "—"}</td><td class="num">${r.avg_excess_in_call_direction_pct != null ? r.avg_excess_in_call_direction_pct + " pts" : "—"}</td></tr>`).join("")}</tbody></table></div>
    ${w.length ? `<h3>Was Waiting Right?</h3><p class="sub">Return of each Wait or Hold name vs its benchmark from the next open, at 20 and 60 sessions.</p>
    <div class="tbl-wrap"><table class="sortable"><thead><tr><th>Stock</th><th>Decision</th><th>Report</th><th>From</th><th class="num">20 Sessions</th><th class="num">60 Sessions</th></tr></thead><tbody>
    ${w.map((x) => `<tr><td><b>${esc(x.ticker)}</b></td><td>${esc(x.decision)}${x.waits_for ? `<div class="faint small">${esc(x.waits_for)}</div>` : ""}</td><td>${esc(x.report_id.endsWith("_thread") ? "thread (midday)" : "evening")}</td><td>${esc(x.window_start)}</td><td class="num">${cell(x.h20)}</td><td class="num">${cell(x.h60)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
}
async function viewTrack(main) {
  main.innerHTML = skel();
  const t = await load("/api/track");
  let pf = null, sy = null;
  try { pf = await load("/api/performance"); } catch (e) { pf = null; }
  try { sy = await load("/api/synthesis"); } catch (e) { sy = null; }
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
    ${synCompareHtml(sy)}
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

/* ------------------------------------------------------------------ interactive analysis chart (fr/ta.py) */
/* Candles or line, volume, 20/50/200-day averages, support/resistance zones as shaded bands, regression channel,
   Bollinger bands, markers (earnings, big news, structure breaks), and RSI / MACD / relative-strength panes.
   Daily or weekly bars, 1M to 5Y. Choices persist per browser. Zone labels sit in the gutter, never on the plot. */
const TA_DEFAULT = { tf: "6M", bars: "D", style: "candles", ma: true, zones: true, channel: false, bb: false, marks: true, vol: true, rsi: false, macd: false, rs: false };
function taPrefs() {
  if (TA_ALL) return { ...TA_DEFAULT, channel: true, bb: true, rsi: true, macd: true, rs: true };   // for screenshots; not saved
  try { return { ...TA_DEFAULT, ...JSON.parse(localStorage.getItem("fr-chart") || "{}") }; } catch (e) { return { ...TA_DEFAULT }; }
}
function taSave(p) { try { localStorage.setItem("fr-chart", JSON.stringify(p)); } catch (e) { /* private mode */ } }
const TA_ALL = new URLSearchParams(location.search).get("ta") === "all";   // read at load: the stock page rewrites the address
const TF_DAYS = { "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "5Y": 1300 };

function taRows(a, weekly) {
  if (weekly) return (a.weekly_bars || []).map((b) => ({ ...b, volume: b.vol }));
  const s = a.series, out = [];
  for (let i = 0; i < s.time.length; i++) out.push({ time: s.time[i], open: s.open[i], high: s.high[i], low: s.low[i], close: s.close[i], volume: s.vol[i],
    sma20: s.sma20[i], sma50: s.sma50[i], sma200: s.sma200[i], bbu: s.bb_upper[i], bbl: s.bb_lower[i], rsi: s.rsi[i], macd: s.macd[i], sig: s.macd_signal[i], hist: s.macd_hist[i] });
  return out;
}
function smaArr(rows, n) { let sum = 0; return rows.map((r, i) => { sum += r.close; if (i >= n) sum -= rows[i - n].close; return i >= n - 1 ? sum / n : null; }); }

async function taChart(host, t, extraLevels) {
  if (!window.LightweightCharts) { host.innerHTML = `<div class="empty">Chart library unavailable (offline?).</div>`; return null; }
  host.innerHTML = `<div class="ta"><div class="skeleton" style="height:360px;border-radius:10px"></div></div>`;
  let a;
  try { a = await load(`/api/ta?t=${encodeURIComponent(t)}`); } catch (e) { return null; }
  if (!a || a.error || !a.series) return null;
  const P = taPrefs(), css = getComputedStyle(document.documentElement), v = (k) => css.getPropertyValue(k).trim();
  const tog = (k, label) => `<button class="tg ${P[k] ? "on" : ""}" data-k="${k}" aria-pressed="${!!P[k]}">${label}</button>`;
  host.innerHTML = `<div class="ta">
    <div class="ta-bar" role="toolbar" aria-label="Chart controls">
      <span class="grp">${Object.keys(TF_DAYS).map((r) => `<button class="tf ${P.tf === r ? "on" : ""}" data-tf="${r}">${r}</button>`).join("")}</span>
      <span class="grp"><button class="tf ${P.bars === "D" ? "on" : ""}" data-bars="D">Daily</button><button class="tf ${P.bars === "W" ? "on" : ""}" data-bars="W">Weekly</button></span>
      <span class="grp"><button class="tf ${P.style === "candles" ? "on" : ""}" data-style="candles">Candles</button><button class="tf ${P.style === "line" ? "on" : ""}" data-style="line">Line</button></span>
      <button class="tf" data-reset="1" title="Reset zoom">Reset</button>
    </div>
    <div class="ta-bar small" role="toolbar" aria-label="Overlays and panes">${tog("ma", "Averages")}${tog("zones", "Zones")}${tog("channel", "Channel")}${tog("bb", "Bollinger")}${tog("marks", "Markers")}
      <span class="sep"></span>${tog("vol", "Volume")}${tog("rsi", "RSI")}${tog("macd", "MACD")}${tog("rs", "Relative strength")}</div>
    <div class="ta-readout" aria-live="polite"></div>
    <div class="ta-main"><div class="lc"><div class="lc-plot"><div class="ta-bands"></div></div><div class="lc-gutter"><svg class="lc-lead"></svg></div></div></div>
    <div class="ta-panes"></div>
    <div class="ta-explain" hidden></div>
    <p class="faint small">Daily bars from stored end-of-day prices (no intraday data). Drawn with lightweight-charts (TradingView).</p></div>`;
  const root = host.querySelector(".ta"), plot = root.querySelector(".lc-plot"), gut = root.querySelector(".lc-gutter"), svg = gut.querySelector("svg"),
    bands = root.querySelector(".ta-bands"), panes = root.querySelector(".ta-panes"), readout = root.querySelector(".ta-readout"), explain = root.querySelector(".ta-explain");
  let charts = [], main = null, ser = null, rows = [], zoneItems = [];
  const fmtV = (x) => x >= 1e9 ? (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? (x / 1e6).toFixed(1) + "M" : x >= 1e3 ? (x / 1e3).toFixed(0) + "K" : String(x);
  const zoneExplain = (z) => `${z.side === "above" ? "Resistance" : z.side === "below" ? "Support" : "Zone at the price"}, $${z.low.toFixed(2)}–$${z.high.toFixed(2)}: price turned here ${z.touches} times, most recently on ${fmtDay(z.last_touch)}${z.flipped ? "; it has acted as both support and resistance (a flipped level)" : ""}. ${z.side === "above" ? `A close above $${z.high.toFixed(2)} would clear it.` : z.side === "below" ? `A close below $${z.low.toFixed(2)} would break it.` : "Price is trading inside it now."}`;

  function build() {
    charts.forEach((c) => c.remove()); charts = [];
    panes.innerHTML = ""; bands.innerHTML = "";
    const weekly = P.bars === "W";
    rows = taRows(a, weekly);
    if (weekly) { const m10 = smaArr(rows, 10), m40 = smaArr(rows, 40); rows.forEach((r, i) => { r.sma50 = m10[i]; r.sma200 = m40[i]; r.sma20 = null; }); }
    main = LightweightCharts.createChart(plot, { ...chartOpts(plot), height: 380, rightPriceScale: { borderColor: v("--line"), minimumWidth: 72, scaleMargins: { top: 0.08, bottom: P.vol ? 0.24 : 0.06 } },
      timeScale: { borderColor: v("--line"), rightOffset: 4 }, crosshair: { mode: 1 } });
    main.__el = plot; charts.push(main);
    if (P.style === "line") { ser = main.addLineSeries({ color: v("--series-1"), lineWidth: 2, priceLineVisible: false }); ser.setData(rows.map((r) => ({ time: r.time, value: r.close }))); }
    else { ser = main.addCandlestickSeries({ upColor: v("--up"), downColor: v("--down"), wickUpColor: v("--up"), wickDownColor: v("--down"), borderVisible: false, priceLineVisible: false });
      ser.setData(rows.map((r) => ({ time: r.time, open: r.open, high: r.high, low: r.low, close: r.close }))); }
    valueBand(t, main, ser, plot, v);
    if (P.vol) { const vs = main.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
      main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vs.setData(rows.map((r) => ({ time: r.time, value: r.volume, color: r.close >= r.open ? v("--up-soft") : v("--down-soft") }))); }
    if (P.ma) [[weekly ? null : "sma20", v("--series-3")], ["sma50", v("--series-1")], ["sma200", v("--series-2")]].forEach(([k, c]) => k &&
      main.addLineSeries({ color: c, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(rows.filter((r) => r[k] != null).map((r) => ({ time: r.time, value: r[k] }))));
    if (P.bb && !weekly) ["bbu", "bbl"].forEach((k) => main.addLineSeries({ color: v("--muted"), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      .setData(rows.filter((r) => r[k] != null).map((r) => ({ time: r.time, value: r[k] }))));
    const ch = a.series.channel;
    if (P.channel && ch && !weekly) { const idx0 = rows.findIndex((r) => r.time === ch.start), n = rows.length - 1 - idx0;
      if (idx0 >= 0) [0, 1, -1].forEach((k) => main.addLineSeries({ color: k ? v("--muted") : v("--accent"), lineWidth: 1, lineStyle: k ? 2 : 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        .setData(rows.slice(idx0).map((r, i) => ({ time: r.time, value: ch.mid_start + (ch.mid_end - ch.mid_start) * (i / Math.max(1, n)) + k * ch.band })))); }
    if (P.marks) {
      const shape = { earnings: ["circle", v("--accent"), "E"], news: ["square", v("--warn"), "N"], break: ["arrowDown", v("--down"), "Break"] };
      const tset = new Set(rows.map((r) => r.time)), snap = (d) => { if (tset.has(d)) return d; const r = rows.find((x) => x.time >= d); return r ? r.time : null; };
      const mk = (a.markers || []).map((m) => { const tm = snap(m.time), sh = shape[m.kind] || shape.news;
        return tm && { time: tm, position: m.kind === "break" ? "aboveBar" : "belowBar", shape: m.kind === "break" && /up/.test(m.text) ? "arrowUp" : sh[0], color: m.kind === "break" && /up/.test(m.text) ? v("--up") : sh[1], text: sh[2] }; }).filter(Boolean);
      const seen = new Set(); ser.setMarkers(mk.filter((m) => { const k = m.time + m.text; if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => (x.time < y.time ? -1 : 1)));
    }
    // panes
    const pane = (label, fill) => { const d = document.createElement("div"); d.className = "ta-pane"; d.innerHTML = `<span class="pl">${label}</span><div class="pc"></div>`; panes.appendChild(d);
      const el = d.querySelector(".pc");
      const c = LightweightCharts.createChart(el, { ...chartOpts(el), height: 120, rightPriceScale: { borderColor: v("--line"), minimumWidth: 72 }, timeScale: { visible: false }, crosshair: { mode: 1 } });
      c.__el = el; charts.push(c); fill(c); return c; };
    if (P.rsi && !weekly) pane("RSI (14): above 70 stretched up, below 30 stretched down", (c) => { const s = c.addLineSeries({ color: v("--series-2"), lineWidth: 1.5, priceLineVisible: false });
      s.setData(rows.filter((r) => r.rsi != null).map((r) => ({ time: r.time, value: r.rsi })));
      [70, 30].forEach((y) => s.createPriceLine({ price: y, color: v("--line2"), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" })); });
    if (P.macd && !weekly) pane("MACD: line vs signal; bars show the gap", (c) => {
      c.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }).setData(rows.filter((r) => r.hist != null).map((r) => ({ time: r.time, value: r.hist, color: r.hist >= 0 ? v("--up-soft") : v("--down-soft") })));
      c.addLineSeries({ color: v("--series-1"), lineWidth: 1.5, priceLineVisible: false }).setData(rows.filter((r) => r.macd != null).map((r) => ({ time: r.time, value: r.macd })));
      c.addLineSeries({ color: v("--series-3"), lineWidth: 1, priceLineVisible: false }).setData(rows.filter((r) => r.sig != null).map((r) => ({ time: r.time, value: r.sig }))); });
    if (P.rs && a.rs && !weekly) pane(`Relative strength vs ${a.rs.vs} (rising = outperforming)`, (c) => c.addLineSeries({ color: v("--accent"), lineWidth: 1.5, priceLineVisible: false })
      .setData(a.rs.series.filter((x) => x.time >= rows[0].time)));
    // sync time scales and crosshairs
    let syncing = false;                                              // panes follow the main chart by time (their series start on different bars)
    main.timeScale().subscribeVisibleTimeRangeChange((r) => { if (!r || syncing) return; syncing = true; charts.forEach((o) => o !== main && o.timeScale().setVisibleRange(r)); syncing = false; });
    main.subscribeCrosshairMove((pm) => {
      const r = pm && pm.time ? rows.find((x) => x.time === pm.time) : null;
      charts.forEach((o) => o !== main && pm && pm.time && o.setCrosshairPosition && o.setCrosshairPosition(NaN, pm.time, o.__s || null));
      readout.innerHTML = r ? readoutHtml(r) : readoutHtml(rows[rows.length - 1]);
    });
    readout.innerHTML = readoutHtml(rows[rows.length - 1]);
    setTf(P.tf);
    main.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(drawZones));
    new ResizeObserver(() => { charts.forEach((c) => c.applyOptions({ width: c.__el.clientWidth })); requestAnimationFrame(drawZones); }).observe(plot);
    requestAnimationFrame(drawZones);
  }
  function readoutHtml(r) {
    const i = rows.indexOf(r), prev = i > 0 ? rows[i - 1].close : null, chg = prev ? (r.close / prev - 1) * 100 : null;
    const zs = a.zones || [], near = zs.length ? zs.reduce((b, z) => (Math.abs(z.mid - r.close) < Math.abs(b.mid - r.close) ? z : b)) : null;
    return `<b>${esc(fmtDay(r.time))}</b> <span>O ${r.open.toFixed(2)}</span> <span>H ${r.high.toFixed(2)}</span> <span>L ${r.low.toFixed(2)}</span> <span>C ${r.close.toFixed(2)}</span>
      ${chg != null ? `<span class="${dirCls(chg)}">${pct(chg)}</span>` : ""} <span>Vol ${fmtV(r.volume)}</span>${near ? ` <span class="faint">nearest zone ${near.low.toFixed(2)}–${near.high.toFixed(2)} (${((near.mid / r.close - 1) * 100).toFixed(1)}%)</span>` : ""}`;
  }
  function drawZones() {
    bands.innerHTML = ""; gut.querySelectorAll(".lc-l").forEach((e) => e.remove()); svg.innerHTML = "";
    if (!ser) return;
    const h = plot.clientHeight, last = a.last;
    const items = [];
    if (P.zones) (a.zones || []).forEach((z, zi) => { const y1 = ser.priceToCoordinate(z.high), y2 = ser.priceToCoordinate(z.low); if (y1 == null || y2 == null) return;
      const b = document.createElement("div"); b.className = `band ${z.side}`; b.dataset.z = zi; b.style.top = `${Math.min(y1, y2)}px`; b.style.height = `${Math.max(3, Math.abs(y2 - y1))}px`; bands.appendChild(b);
      items.push({ y: (y1 + y2) / 2, name: `${z.side === "above" ? "Resistance" : z.side === "below" ? "Support" : "Zone"} ${z.mid.toFixed(2)}`, price: z.mid, zi, z }); });
    (extraLevels || []).forEach((l) => { const y = ser.priceToCoordinate(l.price); if (y != null) items.push({ y, name: `${l.name} ${l.price.toFixed(2)}`, price: l.price, l }); });
    const placed = placeLabels(items.slice(0, innerWidth < 600 ? 4 : 6), h);
    svg.setAttribute("viewBox", `0 0 14 ${h}`); svg.setAttribute("height", h);
    svg.innerHTML = placed.map((i) => `<path d="M0 ${i.y.toFixed(1)} L6 ${i.y.toFixed(1)} L12 ${i.ly.toFixed(1)}" />`).join("");
    placed.forEach((i) => { const e = document.createElement("button"); e.className = "lc-l " + (i.price >= last ? "a" : "b"); e.style.top = `${i.ly}px`; e.textContent = innerWidth < 600 ? i.name.replace(/ [\d.]+$/, "") : i.name;
      e.addEventListener("click", () => showExplain(i.z ? zoneExplain(i.z) : i.l.explain || i.name, i.zi)); gut.appendChild(e); });
  }
  function showExplain(text, zi) {
    explain.hidden = false; explain.innerHTML = `<p>${esc(text)}</p><button class="tf" data-close="1">Close</button>`;
    bands.querySelectorAll(".band").forEach((b) => b.classList.toggle("hl", zi != null && b.dataset.z === String(zi)));
    explain.querySelector("[data-close]").addEventListener("click", () => { explain.hidden = true; bands.querySelectorAll(".band").forEach((b) => b.classList.remove("hl")); });
  }
  function setTf(tf) { const n = Math.ceil(TF_DAYS[tf] / (P.bars === "W" ? 5 : 1)); main.timeScale().setVisibleLogicalRange({ from: Math.max(0, rows.length - n), to: rows.length + 3 }); }
  root.querySelectorAll("[data-tf]").forEach((b) => b.addEventListener("click", () => { P.tf = b.dataset.tf; taSave(P); root.querySelectorAll("[data-tf]").forEach((x) => x.classList.toggle("on", x === b)); setTf(P.tf); }));
  root.querySelectorAll("[data-bars],[data-style]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.bars) P.bars = b.dataset.bars; else P.style = b.dataset.style; taSave(P);
    root.querySelectorAll(b.dataset.bars ? "[data-bars]" : "[data-style]").forEach((x) => x.classList.toggle("on", x === b)); build(); }));
  root.querySelector("[data-reset]").addEventListener("click", () => setTf(P.tf));
  root.querySelectorAll(".tg").forEach((b) => b.addEventListener("click", () => { P[b.dataset.k] = !P[b.dataset.k]; taSave(P); b.classList.toggle("on", P[b.dataset.k]); b.setAttribute("aria-pressed", String(P[b.dataset.k])); build(); }));
  build();
  host.__labels = () => [...gut.querySelectorAll(".lc-l")].map((e) => e.getBoundingClientRect());
  return { a, focus: (ref) => {
    const want = { zones: "zones", channel: "channel", momentum: "rsi", volume: "vol", structure: "marks" }[ref];
    if (want && !P[want]) { P[want] = true; taSave(P); root.querySelector(`.tg[data-k="${want}"]`)?.classList.add("on"); build(); }
    root.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    if (ref === "zones") bands.querySelectorAll(".band").forEach((b) => { b.classList.add("hl"); setTimeout(() => b.classList.remove("hl"), 1600); });
  } };
}
function taReadHtml(a) {
  if (!a || !a.read) return "";
  const wk = a.weekly || {}, v = a.volatility || {}, m = a.momentum || {}, an = a.analogues || {};
  return `<section class="ta-read" aria-label="Technical read"><h3>The technical read</h3>
    <ul>${a.read.map((r) => `<li><span class="lnk" role="button" tabindex="0" data-ref="${esc(r.ref)}" title="Show this on the chart">${esc(r.text)}</span></li>`).join("")}</ul>
    <dl class="ta-facts">
      <div><dt>Typical move</dt><dd>median ±${v.typical_day}% a day and ±${v.typical_week}% a week over the last 60 sessions; average daily range (ATR) ${v.atr_pct}%${v.atr_trend ? `; daily range ${v.atr_trend} (ATR ${v.atr_change_50d > 0 ? "+" : ""}${v.atr_change_50d}% vs 50 sessions ago)` : ""}${v.squeeze ? "; Bollinger bands in a squeeze (narrowest 10% of the past year): a quiet spell that often ends in a bigger move, either way" : ""}.</dd></div>
      <div><dt>Averages</dt><dd>${(a.averages || []).map((x) => `${x.n}-day ${x.value.toFixed(2)} (${x.slope}, ${x.dist_atr > 0 ? "+" : ""}${x.dist_atr} ATR away${x.stretched ? ", stretched" : ""})`).join("; ")}${a.ma_cross ? `. Last crossover: ${esc(a.ma_cross.kind)} on ${esc(fmtDay(a.ma_cross.date))}` : ""}.</dd></div>
      <div><dt>Momentum</dt><dd>RSI ${m.rsi} (${m.rsi_zone}); 10-day change ${m.roc10 > 0 ? "+" : ""}${m.roc10}%, 20-day ${m.roc20 > 0 ? "+" : ""}${m.roc20}%.</dd></div>
      ${a.rs ? `<div><dt>Relative strength</dt><dd>${esc(a.rs.text)}${a.rs_sector ? `; ${esc(a.rs_sector.text)}` : ""}.</dd></div>` : ""}
      ${(a.candles || []).length ? `<div><dt>Recent candles</dt><dd>${a.candles.map((c) => `${esc(fmtDay(c.date))}: ${esc(c.text)}`).join("; ")}.</dd></div>` : ""}
      ${(a.gaps || []).length ? `<div><dt>Open gaps</dt><dd>${a.gaps.map((g) => `${esc(fmtDay(g.date))} gap ${g.dir} between ${g.from}–${g.to}, not yet filled`).join("; ")}.</dd></div>` : ""}
      ${Object.keys(an).length ? `<div><dt>What followed before</dt><dd>${Object.entries(an).map(([k, x]) => `${esc(k.replace(/_/g, " "))}: ${esc(x.text)}`).join("; ")}. Past cases from this stock's own history; not a forecast.</dd></div>` : ""}
    </dl></section>`;
}

/* Daily analysis: the read and next session's watch list, beside the chart (fr/daily.py rules). */
function dailyHtml(d) {
  if (!d || d.error) return "";
  const x = d.expect || {};
  return `<section class="daily" aria-label="Next session"><div class="daily-next"><h3>Next session</h3>
      ${x.range ? `<p class="rng"><b>±${x.range.pct}%</b> typical day <span class="faint">($${x.range.low.toFixed(2)} to $${x.range.high.toFixed(2)})</span></p>` : ""}
      <ul>${(x.if || []).map((l) => `<li>${esc(l)}</li>`).join("")}${(x.events || []).map((e) => `<li><b>Scheduled:</b> ${esc(e)}</li>`).join("")}</ul>
      <p class="dir">${esc(x.direction_note || "")}</p></div>
    <p class="faint small daily-note">${esc(d.note)} As of the ${esc(d.asof || "")} close.</p></section>`;
}

/* Redesign: detail sections start collapsed under a plain title; an empty section is left out. */
function fold(title, html, open) {
  return html && html.trim() ? `<details class="fold"${open ? " open" : ""}><summary>${esc(title)}</summary>${html}</details>` : "";
}

/* Company Research: the page ends in (and opens with) the committee's call; the evidence follows. */
const bigMoney = (x) => (x == null ? "—" : x >= 1e12 ? `$${(x / 1e12).toFixed(2)}T` : x >= 1e9 ? `$${(x / 1e9).toFixed(1)}B` : `$${(x / 1e6).toFixed(0)}M`);
function profileHtml(p, c) {
  if (!p) return "";
  return `<p class="prof">${[p.sector, p.industry].filter(Boolean).map(esc).join(", ")}${p.market_cap ? `. Market cap ${bigMoney(p.market_cap)}` : ""}. <span class="faint">Profile ${esc(p.source || "")}, ${esc(p.as_of || "")}.</span></p>`;
}
/* Intelligence profile (fr/monitor_profile.py): what changed since the last assessment, across 12 dimensions. */
function monitorHtml(m) {
  if (!m) return "";
  if (!m.available) return `<section class="ccall mon"><h3>What Changed</h3><p class="faint">${esc(m.note)}</p></section>`;
  const ch = m.dimensions.filter((d) => d.changed), same = m.dimensions.filter((d) => !d.changed);
  const row = (d) => `<li class="${d.changed ? "mon-ch" : d.gap ? "mon-gap" : ""}"><b>${esc(d.dimension)}</b>${d.as_of ? ` <span class="faint small">${esc(fmtDay(d.as_of.slice(0, 10)))}</span>` : ""}
    <div>${esc(d.text)}</div><div class="faint small">${esc(d.source)}${d.limits ? `. ${esc(d.limits)}` : ""}</div></li>`;
  return `<section class="ccall mon" aria-label="What changed">
    <div class="ccall-h"><h3>What Changed</h3><span class="cv">${m.changed} of ${m.dimensions.length} dimensions</span></div>
    <p class="faint small">Across the 12 monitoring dimensions, ${esc(m.basis)}. Meaningful means beyond normal fluctuation (rules in docs/coverage).</p>
    ${ch.length ? `<ul class="mon-list">${ch.map(row).join("")}</ul>` : `<p>No meaningful change in any dimension.</p>`}
    ${same.length ? `<details class="fold"><summary>No Meaningful Change (${same.length})</summary><ul class="mon-list">${same.map(row).join("")}</ul></details>` : ""}
  </section>`;
}
function committeeCallHtml(k, th) {
  if (!k) return `<section class="ccall"><h3>Committee Call</h3><p class="faint">No committee card for this stock (outside the focus list).</p></section>`;
  const v = (th && th.valuation) || {}, dcf = v.dcf || {};
  return `<section class="ccall" aria-label="Committee call">
    <div class="ccall-h"><h3>Committee Call</h3>${callPill(k)}<span class="cv">${esc(convText(k))}</span></div>
    ${k.veto ? `<p class="veto">Risk veto: ${esc(k.veto.join("; "))}.</p>` : ""}
    ${synCardHtml(k)}
    <p class="hl">${k.synthesis && k.synthesis.shown === "synthesis" ? `<span class="faint small">Rule vote:</span> ` : ""}${esc(k.headline)}</p>
    <dl class="rec-f">
      <div><dt>Invalidation</dt><dd>${esc(k.invalidation_text)}</dd></div>
      <div><dt>Entry</dt><dd>${k.entry != null ? money2(k.entry) : "No entry: not a buying call."}</dd></div>
      <div><dt>Reference Target</dt><dd>${k.target != null ? money2(k.target) + " (a reference, not a forecast)" : "None."}</dd></div>
      <div><dt>Horizon</dt><dd>${k.horizon} trading days</dd></div>
      <div><dt>What Changes Our Mind</dt><dd>${esc(k.change_mind)}</dd></div>
      ${k.size ? `<div><dt>Paper Size</dt><dd>${k.size.paper_pct}%, <b>${esc(k.size.status)}</b></dd></div>` : ""}
    </dl>
    ${(k.dissent || []).length ? `<p class="dissent"><b>Dissent:</b> ${k.dissent.map((d) => `${esc(d.agent)}: ${esc(d.reason)}`).join(" ")}</p>` : `<p class="faint small">No agent dissents.</p>`}
    ${dcf.base ? `<div class="bbb" aria-label="Bull, base and bear values"><div><span>Bear</span><b>${money2(dcf.bear)}</b></div><div class="base"><span>Base</span><b>${money2(dcf.base)}</b></div><div><span>Bull</span><b>${money2(dcf.bull)}</b></div>
      <p class="faint small">Cash-flow value per share (fading DCF; assumptions in Long-Term View). Own price/sales history range ${money2((v.own_history_ps || {}).low)}–${money2((v.own_history_ps || {}).high)}. Estimates, not forecasts.</p></div>` : ""}
    <details class="fold"><summary>Agent Views</summary><table class="agents"><thead><tr><th>Agent</th><th>Stance</th><th>Why</th></tr></thead><tbody>
      ${AGENT_ORDER.map(([key, n]) => { const a = k.agents[key]; return `<tr><td>${n}</td><td class="s${a.veto ? "v" : a.stance}">${stanceGlyph(a)} ${esc(stanceWord(a))}</td><td>${esc(a.reason)} <span class="faint">(${esc(EVID[a.evidence] || a.evidence || "")})</span></td></tr>`; }).join("")}
      </tbody></table></details>
    ${aiBox(k.ai_note)}
  </section>`;
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
    c = c || d.card; kn = d.keynums; mentor = d.mentor; scen = d.scenarios; extra = { levels: d.levels, moves: d.moves_with, challenge: d.challenge, oc: d.options_check, thesis: d.thesis, daily: d.daily, committee: d.committee, profile: d.profile, monitor: d.monitor, scorecard: d.scorecard, qa: d.qa, analyst: d.analyst };
    if (d.scorecard && d.scorecard.range) (state.scorecards = state.scorecards || {})[t] = d.scorecard.range;
    try { state.board = state.board || await load("/api/board"); } catch (e) { state.board = null; }
  } catch (e) {
    if (!c) { openDrawer(`<div class="dh"><span class="tk" id="drawer-title">${esc(t)}</span></div><div class="err">Could not load this stock: ${esc(e.message)}</div>`); return; }
  }
  const lv = c.play.levels, f = c.fundamental;
  openDrawer(`<div class="dh"><span class="tk" id="drawer-title">${esc(c.ticker)}</span><span class="muted">${esc(c.name)}</span></div>
    <div class="dh"><span class="px num">${money(c.price)}</span><span class="num ${dirCls(c.change_1d)}">${pct(c.change_1d)} last session</span></div>
    ${stockHeadV3(c, boardRow(c.ticker), extra.scorecard)}
    <div id="chart-box"></div>
    ${analystNoteHtml(extra.analyst)}
    ${qaHtml(extra.qa)}
    <details class="fold v3-more"><summary>Committee Explanation And What Changed</summary>
    ${profileHtml(extra.profile, c)}
    ${committeeCallHtml(extra.committee, extra.thesis)}
    ${monitorHtml(extra.monitor)}
    </details>
    ${asofHtml(c, kn)}
    <section class="verdict-box" aria-label="Business"><div class="biz">${gradeBadge(f)} <span class="hl">${esc(f.headline)}</span></div>
      ${c.todo ? `<p class="todo-line"><b>What to do:</b> ${esc(c.todo)}</p>` : ""}
      <p class="faint" style="font-size:12px">Default is no action: nothing here has a proven edge.</p></section>
    ${mattersHtml(c.impact)}
    <div id="ta-read-slot"></div>
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
  const box = $("#chart-box"), x = (extra.daily && extra.daily.expect) || {};
  const extraLv = (x.above || []).concat(x.below || []).map((l) => ({ name: l.label, price: l.price, explain: l.explain }));
  taChart(box, c.ticker, extraLv).then((tc) => {
    if (!tc) { drawChart(c.ticker, lv, extra.daily); return; }
    const slot = $("#ta-read-slot"); if (slot) { slot.innerHTML = taReadHtml(tc.a); slot.querySelectorAll("[data-ref]").forEach((b) => { b.addEventListener("click", () => tc.focus(b.dataset.ref)); b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tc.focus(b.dataset.ref); } }); }); }
  });
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
  return { width: el.clientWidth, height: el.clientHeight, layout: { background: { color: "transparent" }, textColor: v("--muted"), fontFamily: "Inter, -apple-system, sans-serif", fontSize: 12 },
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
const LABEL_GAP = 19;
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
/* ------------------------------------------------------------------ investment committee (fr/committee.py) */
/* The unit of content is a decision: each card leads with the call, carries conviction (a stated rule), an
   invalidation, the six agents' stances with reasons, and any dissent or veto. Hypothetical research only. */
const CALL_CLS = { Buy: "c-buy", Accumulate: "c-acc", Hold: "c-hold", Reduce: "c-red", Avoid: "c-avoid", "No Call": "c-none" };
const AGENT_ORDER = [["fundamental", "Fundamental"], ["macro", "Macro"], ["quant", "Quant"], ["technical", "Technical"], ["risk", "Risk"]];
const stanceGlyph = (a) => (a.veto ? "⛔" : a.stance > 0 ? "▲" : a.stance < 0 ? "▼" : "●");
const stanceWord = (a) => (a.veto ? "Veto" : a.stance > 0 ? "Supports" : a.stance < 0 ? "Against" : "Neutral");
const money2 = (x) => (x == null ? "—" : "$" + Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const disclosure = (d) => `<p class="disclosure">${esc(d || "Hypothetical research. Not investment advice. Nothing is traded.")}</p>`;
function stanceDots(c) {
  return `<span class="dots" aria-label="Agent stances">${AGENT_ORDER.map(([k, n]) => { const a = c.agents[k];
    return `<span class="dot s${a.veto ? "v" : a.stance}" title="${esc(n)}: ${esc(stanceWord(a))}. ${esc(a.reason)}"><b>${n[0]}</b>${stanceGlyph(a)}</span>`; }).join("")}</span>`;
}
function callPill(c) { return `<span class="call ${CALL_CLS[c.call] || ""}">${esc(c.call)}</span>`; }
function convText(c) { return c.conviction.level ? `${c.conviction.level} Conviction` : "No Conviction (not a directional call)"; }

const aiBox = (n, cls = "") => n ? `<div class="ai ${cls}"><span class="ai-l">CIO Note: AI-written opinion, not a proven forecast</span><p>${esc(n.text)}</p><span class="ai-m">Written ${esc(dateFmt(n.created_at))} from the ${esc(fmtDay(n.asof))} data${n.lean ? `; lean: ${esc(n.lean)} (logged to the Decision Log)` : ""}.</span></div>` : `<div class="ai off ${cls}"><span class="ai-l">CIO Note</span><p class="faint">AI note not available today; the rule-based synthesis above stands alone.</p></div>`;
function watchHtml(w) {
  if (!w) return "";
  const h = w.headlines || { top: [], more: [] };
  const hl = (x) => `<li><span class="hd">${esc(x.headline)}</span><span class="hm">${esc(x.source)}, ${esc(dateFmt(x.time))}. Affects ${esc(x.tickers.join(", "))}. <span class="st-${esc(x.status)}">${esc(x.status.charAt(0).toUpperCase() + x.status.slice(1))}</span></span><span class="sw">${esc(x.so_what)}</span></li>`;
  return `<section class="cc-sec watch"><h2>What to Watch Tomorrow</h2><p class="sub">${esc(w.for_label)}. Ranked by impact on our calls; times are Eastern.</p>
      <ol class="wl">${(w.items || []).map((i) => `<li class="wk-${esc(i.kind)}"><div class="wh"><b>${esc(i.what)}</b><span class="when">${esc(i.when)}</span></div><p>${esc(i.why)}</p><p class="trig"><b>Trigger:</b> ${esc(i.trigger)}</p></li>`).join("") || `<li class="faint">Nothing scheduled or close to a trigger.</li>`}</ol>
      ${w.more ? `<p class="faint small">${w.more} smaller items not shown.</p>` : ""}</section>
    <section class="cc-sec heads"><h2>Important Headlines</h2><p class="sub">Ranked by our news engine's importance, focus list and market only. Headlines are data: nothing in them changes a call by itself.</p>
      <ul class="hl-list">${h.top.map(hl).join("") || `<li class="faint">No important headlines in the last three days.</li>`}</ul>
      ${h.more.length ? `<details class="more"><summary>More Headlines (${h.more.length})</summary><ul class="hl-list">${h.more.map(hl).join("")}</ul></details>` : ""}</section>`;
}

/* Evening synthesis ("Committee Conclusion", fr/synthesis.py): AI-written judgment over the analysts' findings. */
const SYN_CLS = { Act: "c-buy", Enter: "c-buy", Wait: "c-hold", Hold: "c-hold", Avoid: "c-avoid", Reduce: "c-red", "No view": "",
  "Buy now": "c-buy", "Buy below": "c-acc", "Too expensive": "c-avoid", "Not judged": "", "Not recorded": "" };
const synPill = (d) => `<span class="call ${SYN_CLS[d] || ""}">${esc(d)}</span>`;
const ltText = (lt) => (!lt ? "—" : lt.verdict === "Buy below" && lt.level != null ? `Buy below ${money2(lt.level)}`
  : lt.verdict === "Not judged" && lt.lean ? `Leans ${lt.lean}` : lt.verdict);
const ltPill = (lt) => `<span class="call ${SYN_CLS[(lt || {}).verdict] || ""}">${esc(ltText(lt))}</span>`;
const swingOf = (r) => r.swing || r.decision;
function synthesisHtml(rep, st, full = true) {
  if (!rep) return `<section class="cc-sec syn"><h2>Committee Conclusion</h2><p class="faint">Synthesis not available today. The rule vote below stands on its own.</p></section>`;
  const P = rep.payload || {}, M = P.market || {}, D = P.deep_dive || {}, T = P.table || [];
  const stale = st && !st.available_today;
  const diff = T.filter((r) => r.differs);
  return `<section class="cc-sec syn" aria-label="Committee conclusion">
    <h2>Committee Conclusion</h2>
    <p class="ai-label">${esc(rep.label)}. Written ${esc((rep.created_at || "").slice(0, 16).replace("T", " "))} UTC from the ${esc(fmtDay(rep.asof))} data${rep.model ? `; model ${esc(rep.model)}` : ""}.${stale ? ` <b>Synthesis not available today; this is the latest report.</b>` : ""}</p>
    ${P.headline_short ? `<p class="vl-text">${esc(P.headline_short)}</p>${(P.lines || []).length ? `<ul class="vl-lines">${P.lines.map((l) => `<li><a href="#" data-open="${esc(l.ticker)}" class="vl-t">${esc(l.ticker)}</a>${vBadge(l.verdict || "—", (l.verdict || "").startsWith("Buy below") ? "Buy below" : l.verdict)}<span class="vl-r">${esc(l.reason)}</span></li>`).join("")}</ul>` : ""}` :
      (P.bottom_line || []).length ? `<ol class="syn-bl">${P.bottom_line.map((b) => `<li>${esc(b)}</li>`).join("")}</ol>` : ""}
    ${full && M.conclusion ? `<h3>Market</h3><p>${esc(M.conclusion)}</p>${(M.arguments || []).length ? `<ul>${M.arguments.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}${M.change_mind ? `<p><b>What would change it:</b> ${esc(M.change_mind)}</p>` : ""}` : ""}
    ${full && D.ticker ? `<h3>Deep Dive: ${esc(D.ticker)}</h3><dl class="rec-f"><div><dt>Case For</dt><dd>${esc(D.case_for)}</dd></div><div><dt>Case Against</dt><dd>${esc(D.case_against)}</dd></div><div><dt>What Decides It</dt><dd>${esc(D.decides)}</dd></div></dl>` : ""}
    <div class="tbl-wrap"><table class="sortable syn-tbl"><thead><tr><th>Stock</th><th>Long-Term</th><th>Swing</th><th>Why</th><th>What Would Change It</th><th>Rule Vote</th></tr></thead><tbody>
      ${T.map((r) => `<tr><td><a href="#" data-open="${esc(r.ticker)}"><b>${esc(r.ticker)}</b></a></td>
        <td data-v="${esc(ltText(r.longterm))}">${ltPill(r.longterm)}${r.longterm_note ? `<div class="faint small">${esc(r.longterm_note)}</div>` : r.longterm && r.longterm.why ? `<div class="faint small">${esc(r.longterm.why)}</div>` : ""}</td>
        <td data-v="${esc(swingOf(r))}">${synPill(swingOf(r))}${r.waits_for ? `<div class="small">${esc(r.waits_for)}</div>` : ""}</td><td>${esc(r.why || "—")}</td><td>${esc(r.change || "—")}</td>
        <td>${r.vote ? esc(r.vote) : "—"}${r.differs ? `<div class="faint small">${r.reason ? "differs: " + esc(r.reason) : "differs, no reason given: cards show the vote"}</div>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
    ${full && diff.length ? `<h3>Where The Swing Call Differs From The Vote</h3><ul>${diff.map((r) => `<li><b>${esc(r.ticker)}</b>: vote ${esc(r.vote)}, swing ${esc(swingOf(r))}. ${r.reason ? esc(r.reason) : "No reason given, so the stock card keeps the vote."}</li>`).join("")}</ul>` : ""}
    ${full && (P.limits || []).length ? `<h3>Limits</h3><ul class="faint">${P.limits.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  </section>`;
}
/* A stock card's headline: the synthesis decision where it may overrule the vote, the rule vote beneath. Veto first. */
function synCardHtml(c) {
  const s = c.synthesis;
  if (!s) return "";
  const lt = `<div class="syn-v"><span class="faint small">Long-term</span> ${ltPill(s.longterm)}<p class="small">${esc(s.longterm_note || (s.longterm || {}).why || "")}</p></div>`;
  const sw = s.shown === "synthesis"
    ? `<div class="syn-v"><span class="faint small">Swing</span> ${synPill(s.swing)} <span class="faint small">${s.differs ? `overrules the vote (${esc(s.vote)})` : `agrees with the vote (${esc(s.vote)})`}</span>
        ${s.waits_for ? `<p class="small"><b>${esc(s.waits_for)}</b></p>` : ""}<p class="small">${esc(s.why || "")}${s.differs && s.reason ? ` <b>Why it differs:</b> ${esc(s.reason)}` : ""}</p></div>`
    : `<div class="syn-v"><span class="faint small">Swing</span> <span class="faint small">${esc(s.why_vote || "")} The rule vote below stands.</span></div>`;
  return `<div class="syn-card"><div class="syn-two">${lt}${sw}</div><p class="faint small">${esc(s.label)}. Risk vetoes and the earnings cap apply to the swing call only.</p></div>`;
}

/* ======================================================================== v3: Verdict Board (visual first) */
const VB = { "Buy now": "good", "Buy below": "good-soft", "Too expensive": "bad", "Not judged": "neutral", "Not recorded": "neutral",
  Enter: "good", Wait: "warn", Avoid: "bad", "No view": "neutral", Hold: "warn", Reduce: "bad", Buy: "good", Accumulate: "good-soft", "No Call": "neutral" };
const vBadge = (label, key, tip) => `<span class="vb vb-${VB[key || label] || "neutral"}"${tip ? ` title="${esc(tip)}"` : ""}>${esc(label)}</span>`;
const ltLabel = (lt) => (!lt ? "—" : lt.verdict === "Buy below" && lt.level != null ? `Buy below ${money2(lt.level)}`
  : lt.verdict === "Not judged" && lt.lean ? `Leans ${lt.lean}` : lt.verdict);
/* The reason as a tooltip where the badge alone can't say it (no buy level: what each value measure says). */
const ltBadge = (lt) => vBadge(ltLabel(lt), (lt || {}).verdict, lt && lt.reads ? lt.why : null);       // neutral colour: a lean is not a verdict
/* Data check (fr/integrity.py): nothing when the data passed; a mark with the reasons as its tooltip otherwise. */
const chkMark = (c) => (!c || !["warn", "fail"].includes(c.status) ? "" :
  ` <span class="vb vb-${c.status === "fail" ? "bad" : "warn"}" title="${esc([...(c.issues || []), ...(c.warnings || [])].join("; "))}">${c.status === "fail" ? "Data issue" : "Data note"}</span>`);
const chkLine = (d) => { const k = (d || {}).counts; return k ? ` Data check: ${k.ok} passed${k.warn ? `, ${k.warn} with a note` : ""}${k.fail ? `, ${k.fail} with an issue (not judged)` : ""}.${d.note ? " " + d.note : ""}` : " Data not checked yet."; };
const daysTo = (iso) => (iso ? Math.round((new Date(iso + "T12:00:00") - new Date(new Date().toDateString() + " 12:00")) / 864e5) : null);
function earnChip(iso) {
  if (!iso) return `<span class="faint">—</span>`;
  const d = daysTo(iso);
  return `<span class="chip-e${d != null && d <= 21 ? " soon" : ""}" title="Next earnings ${esc(iso)}">${esc(fmtDay(iso))}${d != null && d >= 0 && d <= 21 ? ` · ${d}d` : ""}</span>`;
}
/* Distance to the Buy-below level (the value range's middle), as a bar: left of centre = below it (green), right = above. */
function distBar(r) {
  const v = r.dist_to_buy_pct, lt = r.longterm || {};
  if (v == null || !["Buy now", "Buy below", "Too expensive"].includes(lt.verdict)) return `<span class="faint">—</span>`;
  const w = Math.min(50, Math.abs(v) / 2);                 // ±100% spans the half-width
  return `<div class="dist" title="${v <= 0 ? `${Math.abs(v)}% below` : `${v}% above`} the Buy-below level ${money2(lt.mid)}">
    <div class="dist-track"><span class="dist-mid"></span><span class="dist-fill ${v <= 0 ? "below" : "above"}" style="${v <= 0 ? `right:50%` : `left:50%`};width:${w}%"></span></div>
    <span class="num dist-v">${v > 0 ? "+" : ""}${v.toFixed(0)}%</span></div>`;
}
/* The signature element: the value range as a ribbon, low to high, with the Buy-below tick and the price dot. */
function valueRibbon(range, price) {
  if (!range || price == null) return "";
  const lo = Math.min(range.low, price), hi = Math.max(range.high, price), span = hi - lo || 1;
  const x = (v) => ((v - lo) / span * 100).toFixed(2);
  return `<figure class="ribbon" aria-label="Value range ${money2(range.low)} to ${money2(range.high)}, buy below ${money2(range.mid)}, price ${money2(price)}">
    <div class="rb-track"><span class="rb-band" style="left:${x(range.low)}%;width:${(x(range.high) - x(range.low)).toFixed(2)}%"></span>
      <span class="rb-buy" style="left:${x(range.low)}%;width:${(x(range.mid) - x(range.low)).toFixed(2)}%"></span>
      <span class="rb-mid" style="left:${x(range.mid)}%"></span><span class="rb-px" style="left:${x(price)}%"></span></div>
    <figcaption class="rb-labels"><span style="left:${x(range.low)}%">${money2(range.low)}</span><span class="rb-l-mid" style="left:${x(range.mid)}%">Buy below ${money2(range.mid)}</span>
      <span style="left:${x(range.high)}%">${money2(range.high)}</span></figcaption>
    <p class="rb-px-l">Price ${money2(price)}: ${price <= range.mid ? `${((1 - price / range.mid) * 100).toFixed(0)}% below the Buy-below level` : `${((price / range.mid - 1) * 100).toFixed(0)}% above it`}</p></figure>`;
}
function vixGauge(v) {
  if (!v) return "";
  const p = Math.max(0, Math.min(100, (v.value / 40) * 100));
  return `<div class="gauge-v" title="VIX bands: under 15 calm, 15–20 normal, 20–30 elevated, 30+ high">
    <div class="gv-track"><span style="width:37.5%" class="gv-calm"></span><span style="width:12.5%" class="gv-norm"></span><span style="width:25%" class="gv-elev"></span><span style="width:25%" class="gv-high"></span><i style="left:${p}%"></i></div></div>`;
}
function boardHtml(rows) {
  return `<div class="tbl-wrap board-tbl"><table class="sortable vtable"><thead><tr><th>Stock</th><th class="num">Price</th><th class="num">Day</th><th>1 Month</th><th>Long-Term</th><th>To Buy-Below</th><th>Swing</th><th>Trigger</th><th>Earnings</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-open="${esc(r.ticker)}" tabindex="0"><td><b class="tk">${esc(r.ticker)}</b>${r.veto ? ` <span class="vb vb-bad" title="${esc(r.veto.join("; "))}">Veto</span>` : ""}</td>
      <td class="num">${money2(r.price)}${r.intraday ? `<div class="intra">${money2(r.intraday.price)} ${esc(r.intraday.label)}</div>` : ""}</td><td class="num ${dirCls(r.day_pct)}" data-v="${r.day_pct ?? -999}">${pct(r.day_pct)}</td><td>${spark(r.spark, 96, 26)}</td>
      <td data-v="${esc(ltLabel(r.longterm))}">${ltBadge(r.longterm)}${chkMark(r.check)}</td><td data-v="${r.dist_to_buy_pct ?? 999}">${distBar(r)}</td>
      <td data-v="${esc(r.swing)}">${vBadge(r.swing)}</td><td class="trig">${esc((r.trigger || "").replace(/^Wait for /, "").replace(/\.$/, "")) || "—"}</td><td data-v="${esc(r.earnings || "9999")}">${earnChip(r.earnings)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="board-cards">${rows.map((r) => `<button class="bcard" data-open="${esc(r.ticker)}"><div class="bc-top"><b class="tk">${esc(r.ticker)}</b><span class="num">${money2(r.price)}${r.intraday ? `<span class="intra">${money2(r.intraday.price)} ${esc(r.intraday.label)}</span>` : ""}</span><span class="num ${dirCls(r.day_pct)}">${pct(r.day_pct)}</span>${spark(r.spark, 84, 24)}</div>
      <div class="bc-badges"><div><span class="bc-l">Long-term</span>${ltBadge(r.longterm)}${chkMark(r.check)}</div><div><span class="bc-l">Swing</span>${vBadge(r.swing)}</div></div>
      ${r.trigger || r.earnings ? `<div class="bc-trig">${r.trigger ? esc(r.trigger.replace(/\.$/, "")) : ""}${r.earnings ? ` ${earnChip(r.earnings)}` : ""}</div>` : ""}</button>`).join("")}</div>`;
}
function wireOpen(root) {
  root.querySelectorAll("[data-open]").forEach((x) => {
    if (x.__wired) return; x.__wired = true;
    const go = (e) => { e.preventDefault(); openStock(x.dataset.open); };
    x.addEventListener("click", go);
    if (x.tagName === "TR") x.addEventListener("keydown", (e) => { if (e.key === "Enter") go(e); });
  });
}
/* A fold that renders an older, detailed page inside it only when opened (detail stays out of the way). */
function lazyFold(title, render, id) {
  return `<details class="fold v3-fold" data-lazy="${esc(id)}"><summary>${esc(title)}</summary><div class="lazy-body"></div></details>`;
}
function wireLazy(root, renders) {
  root.querySelectorAll("details[data-lazy]").forEach((d) => d.addEventListener("toggle", async () => {
    if (!d.open || d.__done) return; d.__done = true;
    const body = d.querySelector(".lazy-body"); body.innerHTML = skel();
    try { await renders[d.dataset.lazy](body); } catch (e) { body.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }));
}
const hashParam = (k) => new URLSearchParams(location.hash.split("?")[1] || "").get(k);
const segCtl = (view, key, opts, cur) => `<nav class="seg" aria-label="Views">${opts.map(([v, n]) => `<a href="#/${view}?${key}=${v}" class="${v === cur ? "on" : ""}" aria-current="${v === cur ? "page" : "false"}">${esc(n)}</a>`).join("")}</nav>`;
const pageHead = (title, sub) => `<div class="p3-head"><h1>${esc(title)}</h1>${sub ? `<p class="faint">${esc(sub)}</p>` : ""}</div>`;

/* Tonight's verdict, structured: a kicker, one plain sentence, then one line per key stock. */
function verdictBlock(v, report) {
  if (!v) return "";
  const kind = (l) => (l.startsWith("Buy below") ? "Buy below" : l);
  return `<section class="verdict-line" aria-label="Tonight's verdict">
    <p class="vl-kicker">${esc(v.kicker)}</p>
    <p class="vl-text">${esc(v.sentence)}</p>
    <ul class="vl-lines">${(v.lines || []).map((l) => `<li><a href="#" data-open="${esc(l.ticker)}" class="vl-t">${esc(l.ticker)}</a>${vBadge(l.label, kind(l.label))}<span class="vl-r">${esc(l.reason)}</span></li>`).join("")}</ul>
    ${report ? `<p class="vl-src">${esc(report.label)}. <a href="#/reports">Full report</a></p>` : ""}
  </section>`;
}
/* Tomorrow card (fr/tomorrow.py): the next session at a glance, above everything else on Home. The full What to
   watch list stays below. */
function tomorrowHtml(T) {
  if (!T) return "";
  const day = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const act = (a) => `<li><button type="button" class="tm-tk" data-open="${esc(a.ticker)}">${esc(a.ticker)}</button><span class="faint num">${money2(a.price)}</span><span class="tm-m">${esc(a.line)}</span></li>`;
  const M = T.master;
  const plan = T.lead ? `<p class="tm-lead">${esc(T.lead)}</p>
      ${M ? `<p class="tm-master"><b>${esc(M.line)}</b> <span class="faint">QQQ is ${M.dist_pct != null ? `${M.dist_pct.toFixed(1)}%` : ""} below it.</span></p>
        <ul class="tm-tr">${(T.unlocked || []).map(act).join("") || `<li class="faint tm-none">${esc(T.unlocked_none || "")}</li>`}</ul>` : ""}`
    : `<ul class="tm-tr">${(T.actions || []).map(act).join("") || `<li class="faint tm-none">No level gives a definite action tomorrow.</li>`}</ul>`;
  return `<section class="tm-card" aria-label="Tomorrow"><div class="tm-h"><h2>${esc(T.heading || "Tomorrow")}: ${esc(T.label)}</h2><span class="faint">${esc(T.label_note || "")} From the ${esc(fmtDay(T.asof))} close.</span></div>
    ${T.note ? `<p class="tm-note">${esc(T.note)}</p>` : ""}
    <div class="tm-grid">
      <div class="tm-plan"><h3 class="tm-l">What to do</h3>${plan}</div>
      <div><h3 class="tm-l">Events</h3><ul class="tm-ev">${(T.events || []).map((e) => `<li>${esc(e.what)}${e.when ? ` <span class="faint">${esc(e.when)}</span>` : ""}</li>`).join("")}</ul>
        ${(T.earnings || []).length ? `<h3 class="tm-l">Earnings, next 7 days</h3><div class="tm-chips">${T.earnings.map((e) => `<button type="button" class="tm-chip${e.focus ? " tm-focus" : ""}" data-open="${esc(e.ticker)}" title="${e.focus ? "Focus name" : "Read-across for focus names"}"><b>${esc(e.ticker)}</b> ${esc(day(e.date))}</button>`).join("")}</div>` : ""}</div>
    </div></section>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".tm-card [data-open]");
  if (b) { e.preventDefault(); openStock(b.dataset.open); }
});

/* AI analyst notes (fr/analyst.py): written by the system each evening and on major news, from stored data only;
   every number checked against that data. Home shows three lines per stock; the stock page shows the full note. */
const anWhen = (n) => `${n.trigger === "news" ? "Updated on news" : "Written"} ${esc(dateFmt(n.created_at))}, from the ${esc(fmtDay(n.asof))} close`;
const anAction = (d) => { const a = ((d || {}).longterm || {}).action || ""; return vBadge(a ? a[0].toUpperCase() + a.slice(1) : "—", { buy: "Enter", add: "Enter", avoid: "Avoid", trim: "Avoid", hold: "Wait", wait: "Wait" }[a] || "No view"); };
function analystListHtml(A) {
  const notes = (A && A.notes) || [];
  if (!notes.length) return "";
  return `<section class="an-list" aria-label="Analyst view"><div class="tm-h"><h2>Analyst View</h2><span class="faint">${esc(A.label)} Written by the AI analyst from our data; every number is checked against it.</span></div>
    <ul class="db-list">${notes.map((n) => { const N = n.note || {}, S = N.summary || {}, mk = n.ticker === "MARKET";
      return `<li class="db-item"><div class="db-h">${mk ? `<b>Market</b>` : `<button type="button" class="tm-tk" data-open="${esc(n.ticker)}">${esc(n.ticker)}</button>`}${mk ? "" : anAction(N.decision)}<span class="an-hl">${esc(N.headline || "")}</span></div>
        <p class="db-l"><span class="db-k">Thesis</span>${esc(S.thesis || "")}</p><p class="db-l"><span class="db-k">Decision</span>${esc(S.decision || "")}</p>
        ${S.act_at ? `<p class="db-l"><span class="db-k">Act at</span><b>${esc(S.act_at)}</b></p>` : ""}</li>`; }).join("")}</ul></section>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".an-list [data-open]");
  if (b) { e.preventDefault(); openStock(b.dataset.open); }
});
function analystNoteHtml(A) {
  if (!A || !A.note) return "";
  const N = A.note, W = N.worth || {}, D = N.decision || {}, L = D.longterm || {}, S = D.swing || {};
  const ul = (xs) => `<ul class="qa-ul">${(xs || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return `<section class="an-note" id="an-note" aria-label="Analyst note"><div class="tm-h"><h3 class="h3s">Analyst Note</h3><span class="faint">${anWhen(A)}. ${esc(N.label || "")}</span></div>
    <p class="an-head"><b>${esc(N.headline || "")}</b></p>
    <dl class="qa-dl">
      <dt>Decision</dt><dd>${anAction(D)} ${esc(L.why || "")}${(L.levels || []).length ? `<ul class="qa-ul">${L.levels.map((l) => `<li><b class="num">${money2(l.price)}</b>: ${esc(l.what)}</li>`).join("")}</ul>` : ""}</dd>
      <dt>Swing / options</dt><dd>${esc((S.action || "").replace(/^./, (c) => c.toUpperCase()))}${S.entry ? `: entry ${money2(S.entry)}` : ""}${S.stop ? `, stop ${money2(S.stop)}` : ""}${S.target ? `, target ${money2(S.target)}` : ""}. ${esc(S.why || "")}</dd>
      ${D.timing ? `<dt>Timing</dt><dd>${esc(D.timing)}</dd>` : ""}
      <dt>What's happening</dt><dd>${esc(N.happening || "")}</dd>
      <dt>The business</dt><dd>${esc(N.business || "")}</dd>
      <dt>What it's worth</dt><dd>${esc(W.text || "")}${W.low != null && W.high != null ? ` <b>Fair value ${money2(W.low)}–${money2(W.high)}.</b>` : ""}${W.key_assumption ? ` <span class="faint">Key assumption: ${esc(W.key_assumption)}</span>` : ""}</dd>
      <dt>Bull case</dt><dd>${ul(N.bull)}</dd><dt>Bear case</dt><dd>${ul(N.bear)}</dd>
      <dt>What would change the view</dt><dd>${ul(N.change_mind)}</dd>
      ${N.what_changed ? `<dt>Since the last note</dt><dd>${esc(N.what_changed)}</dd>` : ""}
    </dl>${A.removed ? `<p class="faint small">${A.removed} sentence${A.removed === 1 ? "" : "s"} removed by the number check.</p>` : ""}</section>`;
}

/* Release-day notes (fr/releases.py): for each major macro release in the next few days, what it has done to QQQ and
   SPY before (code-computed) and the strategist's hot / in-line / cool plan. Lines are labelled History or Judgment. */
function releaseHtml(R) {
  const notes = (R && R.notes) || [];
  if (!notes.length) return "";
  const p2 = (x) => x == null ? "—" : `${x > 0 ? "+" : ""}${Number(x).toFixed(2)}%`;
  const ymd = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const day = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const CASE = { hot: "Hot", "in-line": "In line", cool: "Cool" };
  return notes.map((n, k) => { const N = n.note || {}, D = N.data || {}, H = D.reaction_history || {}, rel = D.release || {};
    const plans = N.plans || [], first = (plans.find((p) => p.case === "in-line") || plans[0] || {}).case;
    const fact = (t) => { const h = H[t]; return h ? `<div class="rl-fact"><b>${t}</b><span>Moves <span class="num">${h.median_size_pct.toFixed(2)}%</span></span>
      <span class="faint">Normal day <span class="num">${h.normal_day_size_pct.toFixed(2)}%</span></span><span>Up <span class="num">${h.up_days_pct}%</span> of the time</span></div>` : ""; };
    const row = (t) => { const h = H[t]; return h ? `<tr><th scope="row">${t}</th><td class="num">${h.median_size_pct.toFixed(2)}%</td><td class="num">${h.normal_day_size_pct.toFixed(2)}%</td>
      <td class="num">${h.up_days_pct}%</td><td class="num"><span class="down">${p2(h.worst.move_pct)}</span><br><span class="faint">${esc(ymd(h.worst.date))}</span></td>
      <td class="num"><span class="up">${p2(h.best.move_pct)}</span><br><span class="faint">${esc(ymd(h.best.date))}</span></td></tr>` : ""; };
    const last = (t) => H[t] ? `<p class="rl-last"><b>${t}, last 6:</b> ${H[t].last_6.map((x) => `<span class="num ${x.move_pct >= 0 ? "up" : "down"}" title="${esc(x.date)}">${p2(x.move_pct)}</span>`).join(" ")}</p>` : "";
    const any = H.QQQ || H.SPY;
    return `<section class="rl-card" data-case="${esc(first || "")}" aria-label="${esc(n.name)} note">
      <p class="rl-when">${esc(day(n.release_date))}${rel.time_et ? `, ${esc(rel.time_et)} ET` : ""}</p>
      <h2 class="rl-title">${esc(n.name)}</h2>
      ${N.bottom_line ? `<p class="rl-bl">${esc(N.bottom_line)}</p>` : ""}
      ${any ? `<p class="rl-sub">On the past ${esc(String(any.releases))} release days</p><div class="rl-facts">${fact("QQQ")}${fact("SPY")}</div>` : ""}
      <p class="rl-sub">The plan for each outcome</p>
      <div class="rl-seg" role="tablist" aria-label="Outcome">${plans.map((p) => `<button type="button" role="tab" class="rl-tab rl-t-${esc(p.case.replace("-", ""))}" data-case="${esc(p.case)}" aria-selected="${p.case === first}">${esc(CASE[p.case] || p.case)}</button>`).join("")}</div>
      <div class="rl-plans">${plans.map((p) => `<div class="rl-plan rl-${esc(p.case.replace("-", ""))}" data-case="${esc(p.case)}" role="tabpanel"><h3>${esc(CASE[p.case] || p.case)}</h3>
        <p class="rl-if">${esc(p.if)}</p><p class="rl-then">${esc(p.then)}</p></div>`).join("")}</div>
      <details class="rl-more"><summary>Why: the history and the reasoning</summary>
        ${any ? `<div class="tbl-wrap"><table class="rl-tbl"><caption class="faint">Release-day move, previous close to that day's close, ${esc(String(any.releases))} releases since ${esc(ymd(any.since))}</caption>
          <thead><tr><th></th><th class="num">Typical</th><th class="num">Normal day</th><th class="num">Up days</th><th class="num">Worst</th><th class="num">Best</th></tr></thead>
          <tbody>${row("QQQ")}${row("SPY")}</tbody></table></div>${last("QQQ")}${last("SPY")}` : ""}
        <ul class="rl-lines">${(N.lines || []).map((l) => `<li><span class="rl-lab rl-${esc(l.label)}">${l.label === "history" ? "History" : "Judgment"}</span>${esc(l.text)}</li>`).join("")}</ul>
        ${(D.limits || []).length ? `<p class="faint small">Limits: ${esc(D.limits.join(" "))}</p>` : ""}
        ${n.removed ? `<p class="faint small">${n.removed} sentence${n.removed === 1 ? "" : "s"} removed by the number check.</p>` : ""}
      </details>
      <p class="faint small rl-foot">${esc(N.label || "")} Written ${esc(dateFmt(n.created_at))}. History is computed from stored closes; the plans are the AI strategist's judgment.</p></section>`; }).join("");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".rl-tab");
  if (!b) return;
  const card = b.closest(".rl-card");
  card.dataset.case = b.dataset.case;
  card.querySelectorAll(".rl-tab").forEach((t) => t.setAttribute("aria-selected", String(t === b)));
});
/* Late-price label (fr/freshness.py): shown at the top of every page while stored prices are behind the latest close. */
async function freshBanner(main) {
  try {
    const f = await api("/api/freshness");
    if (f && f.late && f.text) main.insertAdjacentHTML("afterbegin", `<div class="fresh-banner" role="status">${esc(f.text)}</div>`);
  } catch (e) { /* the label is optional */ }
}

async function viewHome(main) {
  main.innerHTML = skel();
  const [d, AN, RL] = await Promise.all([load("/api/board"), load("/api/analyst").catch(() => null), load("/api/releases").catch(() => null)]);
  const M = d.market, rows = d.rows || [];
  const trendBadge = (t) => vBadge(t ? t[0].toUpperCase() + t.slice(1) : "—", t === "uptrend" ? "Enter" : t === "downtrend" ? "Avoid" : "Wait");
  main.innerHTML = `
  ${releaseHtml(RL)}
  ${analystListHtml(AN)}
  ${tomorrowHtml(d.tomorrow)}
  <section class="mk-strip" aria-label="Market">
    ${M.indices.map((i) => `<div class="mk-tile"><div class="mk-h"><b>${esc(i.ticker)}</b>${trendBadge(i.trend)}</div>
      <div class="mk-v"><span class="num">${money2(i.close)}</span><span class="num ${dirCls(i.chg)}">${pct(i.chg)}</span></div>${spark(i.spark, 180, 36)}</div>`).join("")}
    ${M.vix ? `<div class="mk-tile"><div class="mk-h"><b>Fear (VIX)</b>${vBadge(M.vix.label[0].toUpperCase() + M.vix.label.slice(1), M.vix.label === "calm" || M.vix.label === "normal" ? "Enter" : M.vix.label === "high" ? "Avoid" : "Wait")}</div>
      <div class="mk-v"><span class="num">${M.vix.value.toFixed(2)}</span><span class="faint">${M.vix.pct != null ? `${M.vix.pct}th pct of year` : ""}</span></div>${vixGauge(M.vix)}</div>` : ""}
    ${M.breadth != null ? `<div class="mk-tile"><div class="mk-h"><b>Breadth</b>${vBadge(M.breadth >= 60 ? "Broad" : M.breadth >= 40 ? "Mixed" : "Narrow", M.breadth >= 60 ? "Enter" : M.breadth >= 40 ? "Wait" : "Avoid")}</div>
      <div class="mk-v"><span class="num">${M.breadth}%</span><span class="faint">above 50-day</span></div><div class="br-track"><span style="width:${M.breadth}%"></span></div></div>` : ""}
  </section>
  ${verdictBlock(d.verdict, d.report)}
  <section class="board" aria-label="Verdict Board">
    <div class="board-h"><h2>Verdict Board</h2><span class="faint">Long-term: is it a good business at a good price? Swing: the next few weeks. Data from the ${esc(fmtDay(d.asof))} close.${esc(chkLine(d.data_check))}</span></div>
    ${boardHtml(rows)}
  </section>
  <div class="home-two">
    <section class="watch" aria-label="What to watch"><h2>What To Watch</h2><span class="faint">${esc((d.watch || {}).for || "")}</span>
      <ol class="tl2">${((d.watch || {}).items || []).map((i) => { const m = i.kind === "level" && /^([A-Z.]{1,6}) near /.exec(i.what || ""), A = m && ((d.tomorrow || {}).watch_actions || {})[m[1]], R = m && rows.find((r) => r.ticker === m[1]);
        return A ? `<li class="tl2-level"><span class="tl2-when">${esc(i.when)}</span><b>${esc(m[1])}${R ? ` <span class="faint num">${money2(R.price)}</span>` : ""}</b><span class="tl2-act">${esc(A)}</span></li>`
          : m ? "" : `<li class="tl2-${esc(i.kind)}"><span class="tl2-when">${esc(i.when)}</span><b>${esc(i.what)}</b></li>`; }).join("") || `<li class="faint">Nothing scheduled.</li>`}</ol></section>
    <section class="heads" aria-label="Headlines"><h2>Headlines</h2>
      <ul class="hl2">${(d.headlines || []).map((h) => `<li><span class="imp imp-${esc(h.impact)}" title="Importance ${h.importance} of 100">${h.importance}</span><span class="hl2-t">${esc(h.headline)}</span><span class="faint hl2-m">${esc(h.tickers.join(", "))}</span></li>`).join("")}</ul></section>
  </div>
  ${lazyFold("Full Briefing: The Committee Conclusion, Decisions, Risks And Notes", null, "briefing")}
  ${disclosure("Research, not advice. Long-term verdicts follow a fixed rule over the value range and business quality; swing calls are AI-written judgment. Nothing is traded.")}`;
  wireOpen(main); enableSort(main); wireLazy(main, { briefing: viewCommand });
}

/* ------------------------------------------------------------------ Stocks: Focus / All covered / By category */
async function viewStocks3(main) {
  const v = hashParam("v") || "focus";
  main.innerHTML = skel();
  const head = pageHead("Stocks", "The 19 focus names, every covered stock, and where each one sits in its research lifecycle.") +
    segCtl("stocks", "v", [["focus", "Focus"], ["covered", "All Covered"], ["category", "By Category"]], v);
  if (v === "focus") {
    const d = await load("/api/board");
    main.innerHTML = head + boardHtml(d.rows || []) + lazyFold("Recommendation Cards: Levels, Conviction And Agent Views", null, "recs");
    wireOpen(main); enableSort(main); wireLazy(main, { recs: viewRecs }); return;
  }
  const c = await load("/api/coverage");
  const live = c.stocks.filter((x) => !x.removed_at);
  const CAT = { "Core Coverage": "Wait", "Watchlist": "No view", "Active Opportunities": "Buy below", "Approaching Entry": "Buy below", "Active Recommendations": "Enter",
    "High-Risk Monitoring": "Avoid", "Thesis Deteriorating": "Avoid", "Archived Opportunities": "No view" };
  const catBadge = (k) => vBadge(k, CAT[k]);
  const a = (x) => x.assessment || {};
  if (v === "covered") {
    main.innerHTML = head + `<div class="tbl-wrap"><table class="sortable vtable"><thead><tr><th>Stock</th><th>Category</th><th>Stage</th><th>Call</th><th class="num">Alerts</th><th>Analysts</th><th>Priority</th><th>Sector</th></tr></thead><tbody>
      ${live.sort((p, q) => c.categories.indexOf(q.category) - c.categories.indexOf(p.category) || p.ticker.localeCompare(q.ticker)).map((x) => `<tr data-open="${esc(x.ticker)}" tabindex="0">
        <td><b class="tk">${esc(x.ticker)}</b></td><td data-v="${c.categories.indexOf(x.category)}">${catBadge(x.category)}</td><td>${esc(x.lifecycle)}</td>
        <td>${a(x).insufficient ? `<span class="faint">No data yet</span>` : vBadge(a(x).call || "—", a(x).call)}</td><td class="num">${x.open_alerts || "—"}</td><td>${esc(x.analysts.join(", ") || "—")}</td>
        <td>${esc(x.priority)}</td><td class="faint">${esc(x.sector || "—")}</td></tr>`).join("")}</tbody></table></div>
      <div class="board-cards">${live.map((x) => `<button class="bcard" data-open="${esc(x.ticker)}"><div class="bc-top"><b class="tk">${esc(x.ticker)}</b><span></span><span class="faint">${esc(x.priority)}</span></div>
        <div class="bc-badges"><div><span class="bc-l">Category</span>${catBadge(x.category)}</div><div><span class="bc-l">Stage</span><span class="vb vb-neutral">${esc(x.lifecycle)}</span></div></div></button>`).join("")}</div>
      ${lazyFold("Manage Coverage: Alerts, Assignments, History And Controls", null, "coverage")}`;
    wireOpen(main); enableSort(main); wireLazy(main, { coverage: viewCoverage }); return;
  }
  main.innerHTML = head + `<div class="cats">${c.categories.filter((k) => live.some((x) => x.category === k)).map((k) => {
      const xs = live.filter((x) => x.category === k);
      return `<section class="cat"><div class="cat-h">${catBadge(k)}<span class="num faint">${xs.length}</span></div>
        <div class="cat-list">${xs.map((x) => `<a href="#" data-open="${esc(x.ticker)}" class="cat-t" title="${esc(x.lifecycle)}"><b>${esc(x.ticker)}</b><span class="faint">${esc(x.lifecycle)}</span></a>`).join("")}</div></section>`; }).join("")}</div>`;
  wireOpen(main);
}

/* ------------------------------------------------------------------ Ideas: one ranked list, a source chip on each */
async function viewIdeas(main) {
  main.innerHTML = skel();
  const [k, o, os, dc] = await Promise.all([load("/api/committee"), load("/api/opportunities").catch(() => ({})), load("/api/oversold").catch(() => ({})), load("/api/discovery").catch(() => ({}))]);
  const ideas = [];
  ((o.pipeline || {}).opportunities || []).forEach((p) => ideas.push({ t: p.subject, src: "Setup", rank: 40 + p.state, what: `${p.kind.includes("bull") ? "Breakout" : "Breakdown"} setup, ${p.state_name}`,
    wait: p.blocker || "", by: p.window_end, badge: p.kind.includes("bull") ? "Enter" : "Avoid", badgeText: p.kind.includes("bull") ? "Bullish" : "Bearish" }));
  ((k.briefing || {}).emerging || []).forEach((e) => ideas.push({ t: e.what.split(" ")[0], src: "Committee", rank: 50, what: e.what, wait: e.waiting_for, by: null, badge: "Wait", badgeText: "Emerging" }));
  (os.worth || []).forEach((x) => ideas.push({ t: x.ticker, src: "Oversold", rank: 20 + x.count * 5, what: `${x.count} oversold signs, ${x.dd52}% from its 52-week high`, wait: (x.conditions || [])[0] || "",
    by: null, badge: x.verdict === "buy" ? "Enter" : "Wait", badgeText: x.verdict_label || "Not judged" }));
  (dc.top || []).forEach((x) => ideas.push({ t: x.subject, src: "Discovery", rank: 10 + (((x.labels || {}).attractive_investment || {}).answer === "yes" ? 30 : 0),
    what: `Grade ${(x.quality || {}).grade || "?"}; value ${((x.valuation || {}).summary || "").split(";")[0]}`, wait: ((x.labels || {}).attractive_investment || {}).reason || "", by: null,
    badge: ((x.labels || {}).attractive_investment || {}).answer === "yes" ? "Buy below" : "No view", badgeText: ((x.labels || {}).attractive_investment || {}).answer === "yes" ? "Attractive" : "Unclear" }));
  ideas.sort((a, b) => b.rank - a.rank);
  const srcCls = { Setup: "src-setup", Committee: "src-cmte", Oversold: "src-os", Discovery: "src-disc" };
  main.innerHTML = pageHead("Ideas", "Everything that might become a call, from four sources, ranked. None has a proven edge yet.") +
    `<div class="tbl-wrap board-tbl"><table class="sortable vtable"><thead><tr><th>Stock</th><th>Source</th><th>Status</th><th>Idea</th><th>Waiting For</th><th>Decide By</th></tr></thead><tbody>
    ${ideas.map((i) => `<tr data-open="${esc(i.t)}" tabindex="0"><td><b class="tk">${esc(i.t)}</b></td><td><span class="src ${srcCls[i.src]}">${esc(i.src)}</span></td><td>${vBadge(i.badgeText, i.badge)}</td>
      <td class="one">${esc(i.what)}</td><td class="one faint">${esc(i.wait || "—")}</td><td>${i.by ? esc(fmtDay(i.by)) : "—"}</td></tr>`).join("") || `<tr><td colspan="6" class="faint">No ideas today.</td></tr>`}</tbody></table></div>
    <div class="board-cards">${ideas.map((i) => `<button class="bcard" data-open="${esc(i.t)}"><div class="bc-top"><b class="tk">${esc(i.t)}</b><span></span><span class="src ${srcCls[i.src]}">${esc(i.src)}</span></div>
      <div class="bc-badges"><div>${vBadge(i.badgeText, i.badge)}</div></div><div class="bc-trig">${esc(i.what)}</div></button>`).join("")}</div>
    ${lazyFold("Setup Pipeline Detail", null, "pipe")}${lazyFold("Oversold Screen Detail", null, "os")}${lazyFold("Discovery Detail", null, "disc")}`;
  wireOpen(main); enableSort(main); wireLazy(main, { pipe: viewOpps, os: viewOversold, disc: viewDiscovery });
}

/* ------------------------------------------------------------------ Market: the market, with Earnings as a sub-tab */
async function viewMarket3(main) {
  const tab = hashParam("tab") || "market";
  main.innerHTML = skel();
  const head = pageHead("Market", null) + segCtl("market", "tab", [["market", "Market"], ["earnings", "Earnings"]], tab);
  if (tab === "earnings") {
    const e = await load("/api/earnings");
    const rows = (e.this_week || []).concat(e.next_week || []);
    const vmap = { "EVENT RISK": "Wait", BUY: "Enter", AVOID: "Avoid" };
    main.innerHTML = head + `<div class="tbl-wrap board-tbl"><table class="sortable vtable"><thead><tr><th>Date</th><th>Stock</th><th>When</th><th>Verdict</th><th class="num">Avg Move</th><th>Expectation</th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-open="${esc(r.ticker)}" tabindex="0"><td data-v="${esc(r.date)}">${earnChip(r.date)}</td><td><b class="tk">${esc(r.ticker)}</b></td><td>${esc(r.timing || "—")}</td>
        <td>${vBadge((r.verdict || "—").toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase()), vmap[r.verdict])}</td><td class="num">${r.avg_move != null ? "±" + r.avg_move + "%" : "—"}</td><td class="one faint">${esc(r.expect || "")}</td></tr>`).join("") || `<tr><td colspan="6" class="faint">No reports in the next two weeks.</td></tr>`}</tbody></table></div>
      <div class="board-cards">${rows.map((r) => `<button class="bcard" data-open="${esc(r.ticker)}"><div class="bc-top"><b class="tk">${esc(r.ticker)}</b><span></span>${earnChip(r.date)}</div><div class="bc-trig">${esc(r.timing || "")}${r.avg_move != null ? ` · past moves ±${r.avg_move}%` : ""}</div></button>`).join("")}</div>
      ${lazyFold("Earnings Intelligence: Before And After Each Report", null, "earnc")}${lazyFold("Full Earnings Calendar", null, "earn")}`;
    wireOpen(main); enableSort(main); wireLazy(main, { earnc: viewEarnC, earn: viewEarnings }); return;
  }
  const [d, ov, RL] = await Promise.all([load("/api/board"), load("/api/overview"), load("/api/releases").catch(() => null)]);
  const M = d.market, sec = ov.sectors || [], mx = Math.max(1, ...sec.map((x) => Math.abs(x.rel20)));
  main.innerHTML = head + `<p class="vl-text p3-verdict">${esc(ov.verdict.text)}</p>
    ${releaseHtml(RL)}
    ${stripHtml(d)}
    <div class="m3-two">
      <section><h2 class="h3s">Sectors vs SPY, 20 Days</h2><div class="secbars">${sec.map((x) => `<div class="sb"><span class="sb-n">${esc(x.sector)}</span>
        <div class="sb-track"><span class="sb-mid"></span><span class="sb-fill ${x.rel20 >= 0 ? "pos" : "neg"}" style="${x.rel20 >= 0 ? "left:50%" : "right:50%"};width:${(Math.abs(x.rel20) / mx * 50).toFixed(1)}%"></span></div>
        <span class="num sb-v">${x.rel20 > 0 ? "+" : ""}${x.rel20.toFixed(1)}</span></div>`).join("")}</div></section>
      <section><h2 class="h3s">Levels That Matter</h2><ul class="lv3">${(ov.gates || []).map((g) => `<li><b>${esc(g.ticker)}</b><span>${esc(g.name)}</span><span class="num">${money2(g.level)}</span>
        <span class="num faint">${g.gap_pct > 0 ? "+" : ""}${g.gap_pct}%</span></li>`).join("")}</ul>
        <h2 class="h3s">Coming Up</h2><ol class="tl2">${(ov.next || []).map((e) => `<li class="tl2-${esc(e.kind)}"><span class="tl2-when">${esc(fmtDay(e.date))}${e.time ? `, ${esc(e.time)}` : ""}</span><b>${esc(e.what)}</b></li>`).join("")}</ol></section>
    </div>
    ${lazyFold("Market Intelligence: The Full Read", null, "ov")}${lazyFold("Market Detail: Heatmap, Rates And Sector Table", null, "md")}`;
  wireOpen(main); wireLazy(main, { ov: viewOverview, md: viewMarket });
}
function stripHtml(d) {
  const M = d.market;
  const trendBadge = (t) => vBadge(t ? t[0].toUpperCase() + t.slice(1) : "—", t === "uptrend" ? "Enter" : t === "downtrend" ? "Avoid" : "Wait");
  return `<section class="mk-strip" aria-label="Market">
    ${M.indices.map((i) => `<div class="mk-tile"><div class="mk-h"><b>${esc(i.ticker)}</b>${trendBadge(i.trend)}</div>
      <div class="mk-v"><span class="num">${money2(i.close)}</span><span class="num ${dirCls(i.chg)}">${pct(i.chg)}</span></div>${spark(i.spark, 180, 36)}</div>`).join("")}
    ${M.vix ? `<div class="mk-tile"><div class="mk-h"><b>Fear (VIX)</b>${vBadge(M.vix.label[0].toUpperCase() + M.vix.label.slice(1), M.vix.label === "calm" || M.vix.label === "normal" ? "Enter" : M.vix.label === "high" ? "Avoid" : "Wait")}</div>
      <div class="mk-v"><span class="num">${M.vix.value.toFixed(2)}</span><span class="faint">${M.vix.pct != null ? `${M.vix.pct}th pct of year` : ""}</span></div>${vixGauge(M.vix)}</div>` : ""}
    ${M.breadth != null ? `<div class="mk-tile"><div class="mk-h"><b>Breadth</b>${vBadge(M.breadth >= 60 ? "Broad" : M.breadth >= 40 ? "Mixed" : "Narrow", M.breadth >= 60 ? "Enter" : M.breadth >= 40 ? "Wait" : "Avoid")}</div>
      <div class="mk-v"><span class="num">${M.breadth}%</span><span class="faint">above 50-day</span></div><div class="br-track"><span style="width:${M.breadth}%"></span></div></div>` : ""}
  </section>`;
}

/* ------------------------------------------------------------------ Record: how the calls did */
async function viewRecord(main) {
  main.innerHTML = skel();
  const [sy, k] = await Promise.all([load("/api/synthesis").catch(() => null), load("/api/committee")]);
  const C = (sy || {}).comparison || { rows: [] }, log = k.log || [];
  main.innerHTML = pageHead("Record", "How each source's calls have done against the benchmark. Calls are written before their window and never edited.") +
    `<div class="rec3">${C.rows.map((r) => `<div class="sct ${r.matured ? (r.hit_rate_pct >= 50 ? "s-good" : "s-bad") : "s-none"}"><span>${esc(r.source)}</span><b class="num">${r.hit_rate_pct != null ? r.hit_rate_pct + "%" : "—"}</b>
      <small class="faint">${r.calls} calls, ${r.matured} matured${r.avg_excess_in_call_direction_pct != null ? `, ${r.avg_excess_in_call_direction_pct > 0 ? "+" : ""}${r.avg_excess_in_call_direction_pct} pts` : ""}</small></div>`).join("")}</div>
    <p class="faint one">Hit rate vs the benchmark once a call matures. Nothing has a proven edge yet; a handful of calls proves nothing.</p>
    <h2 class="h3s">Committee Calls</h2>
    <div class="tbl-wrap"><table class="sortable vtable"><thead><tr><th>Stock</th><th>Call</th><th>Written</th><th>From</th><th class="num">Days</th><th>Status</th><th class="num">Vs Benchmark</th></tr></thead><tbody>
      ${log.map((r) => `<tr data-open="${esc(r.subject)}" tabindex="0"><td><b class="tk">${esc(r.subject)}</b></td><td>${vBadge(r.direction === "outperform" ? "Beat" : "Lag", r.direction === "outperform" ? "Enter" : "Avoid")} <span class="faint">vs ${esc(r.benchmark)}</span></td>
        <td>${esc(fmtDay((r.created_at || "").slice(0, 10)))}</td><td>${esc(fmtDay(r.window_start))}</td><td class="num">${r.horizon_days}</td><td>${vBadge(r.status || "pending", r.status === "scored" ? (r.hit ? "Enter" : "Avoid") : "No view")}</td>
        <td class="num">${r.excess != null ? (r.excess > 0 ? "+" : "") + r.excess.toFixed(2) + " pts" : "—"}</td></tr>`).join("") || `<tr><td colspan="7" class="faint">No calls yet.</td></tr>`}</tbody></table></div>
    ${lazyFold("Full Track Record: Synthesis, Backtests And Forecast Scoring", null, "track")}${lazyFold("Decision Log Detail", null, "log")}`;
  wireOpen(main); enableSort(main); wireLazy(main, { track: viewTrack, log: viewLog });
}
if (STATIC) document.querySelectorAll(".local-only").forEach((e) => e.remove());     // Mac-only links never on the public page
const REDIRECT = { briefing: "command", recs: "stocks?v=focus", coverage: "stocks?v=covered", book: "stocks", opps: "ideas", opportunities: "ideas", oversold: "ideas",
  discovery: "ideas", overview: "market", earnings: "market?tab=earnings", earnings2: "market?tab=earnings", log: "record", track: "record" };
/* Value range on the price chart: lines at its low, Buy-below level (middle) and high, with the lower half shaded so
   "buy below $X" is visible against the candles. Redrawn when the chart scrolls or resizes. */
function valueBand(t, chart, series, plot, v) {
  const r = boardRow(t), rg = (state.scorecards || {})[t];
  const range = rg || (r && r.longterm && r.longterm.mid ? { low: r.longterm.low, mid: r.longterm.mid, high: r.longterm.high } : null);
  if (!range || range.low == null) return;
  series.createPriceLine({ price: range.mid, color: v("--good"), lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: "Buy below" });
  [["low", "Value low"], ["high", "Value high"]].forEach(([k, n]) => series.createPriceLine({ price: range[k], color: v("--good-line"), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: n }));
  let band = plot.querySelector(".vband");
  if (!band) { band = document.createElement("div"); band.className = "vband"; band.setAttribute("aria-hidden", "true"); plot.appendChild(band); }
  const draw = () => {
    const y1 = series.priceToCoordinate(range.mid), y2 = series.priceToCoordinate(range.low);
    if (y1 == null || y2 == null) { band.style.display = "none"; return; }
    const top = Math.max(0, Math.min(y1, y2)), bot = Math.min(plot.clientHeight, Math.max(y1, y2));
    band.style.display = bot > top ? "block" : "none"; band.style.top = top + "px"; band.style.height = Math.max(0, bot - top) + "px";
  };
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(draw));
  setTimeout(draw, 60); window.addEventListener("resize", () => requestAnimationFrame(draw));
}
/* Questions the owner asks, answered by code from existing data (fr/qa.py): analyst stances, the forced calls-or-puts
   pick (a fixed rule; research, not a recorded call) and the options read. Plus the questions already asked about this
   stock (private; absent from the public snapshot). */
function qaHtml(Q) {
  if (!Q) return "";
  const S = Q.stances, F = Q.forced || {}, O = Q.options || {};
  const sw = (a) => (a.veto ? ["Veto", "Avoid"] : a.stance > 0 ? ["Bullish", "Enter"] : a.stance < 0 ? ["Bearish", "Avoid"] : ["Neutral", "No view"]);
  const jump = (to, label) => `<button type="button" class="linkish qa-jump" data-to="${esc(to)}">${esc(label)}</button>`;
  const where = { forced: ["qa-forced", "If forced: calls or puts"], stances: ["qa-stances", "Analyst stances"], options: ["qa-options", "Options read"], levels: ["chart-box", "Chart and levels"] };
  const qs = (Q.questions || []).map((q) => { const w = where[q.answered_in]; return `<li><span class="faint">${esc(q.asked_on)}</span> ${esc(q.question)} ${w ? jump(w[0], w[1]) : ""}</li>`; }).join("");
  const stances = S ? `<section class="qa3" id="qa-stances" aria-label="Analyst stances"><h3 class="h3s">Analyst Stances</h3>
    <div class="tbl-wrap"><table class="vtable"><thead><tr><th>Analyst</th><th>Stance</th><th>Key number</th></tr></thead><tbody>
      ${S.rows.map((a) => { const [w, k] = sw(a); return `<tr><td>${esc(a.agent)}</td><td>${a.agent === "CIO" ? vBadge(a.key.replace("Call: ", "")) : vBadge(w, k)}</td><td>${esc(a.agent === "CIO" ? ((x) => x.charAt(0).toUpperCase() + x.slice(1))(a.reason.replace(/^[^:]+: /, "")) : a.key)}</td></tr>`; }).join("")}
      ${S.longterm ? `<tr><td>Long-term rule</td><td>${vBadge(S.longterm.label || "—", S.longterm.verdict)}</td><td>${esc(S.longterm.key || "")}${S.longterm.data_check === "fail" ? " <b>Data check failed.</b>" : ""}</td></tr>` : ""}</tbody></table></div>
    <p class="faint small">Stances from the committee card${S.card_price ? ` (priced at ${money2(S.card_price)})` : ""}; key numbers as of ${esc(S.asof || "")}.</p></section>` : "";
  const st = F.structure, em = F.expected_move;
  const pickKey = { Calls: "Buy below", Puts: "Avoid", Neither: "No view" };
  const C = F.compare;
  const betLabel = F.pick === "Calls" ? "Calls, on trigger" : F.pick === "Puts" ? "Puts, on trigger" : "Neither";
  const side = C ? `<section class="qa3 qa-side" aria-label="Owning the shares and an options bet"><h3 class="h3s">Owning The Shares Or An Options Bet</h3>
    <div class="qa-two"><div class="qa-col"><span class="bc-l">Owning the shares (long-term)</span>${ltBadge(F.longterm || { verdict: C.longterm })}
        <p class="faint small">${esc((F.longterm || {}).why || "")}</p></div>
      <div class="qa-col"><span class="bc-l">Options bet (short-term)</span>${vBadge(betLabel, pickKey[F.pick] || "No view")}
        <p class="faint small">${esc(F.reason || "")}</p></div></div>
    <p class="qa-why"><b>${C.disagree ? "Why they differ" : "Why they agree"}:</b> ${esc(C.why_differ)}</p></section>` : "";
  const forced = `<details class="fold v3-fold qa3" id="qa-forced"><summary>If Forced: Calls Or Puts</summary>
    ${C && C.disagree ? `<p class="qa-why">This differs from the long-term view (${esc(ltLabel(F.longterm || { verdict: C.longterm }))}). ${esc(C.why_differ)}</p>` : ""}
    <div class="ema-top">${vBadge(betLabel, pickKey[F.pick] || "No view")}<span>${esc(F.reason || "")}</span></div>
    ${F.earnings_label ? `<p class="qa-warn">${esc(F.earnings_label)}</p>` : ""}
    <dl class="qa-dl">
      ${F.trigger ? `<dt>Entry trigger</dt><dd>A close ${F.pick === "Puts" ? "below" : "above"} ${money2(F.trigger)}</dd>` : ""}
      ${F.wrong ? `<dt>Proven wrong</dt><dd>A close ${F.pick === "Puts" ? "above" : "below"} ${money2(F.wrong)}</dd>` : ""}
      ${em ? `<dt>Expected move</dt><dd>±${em.move_pct}% to ${esc(em.expiry)} (at-the-money straddle ${money2(em.cost)})</dd>` : ""}
      ${st ? `<dt>Defined-risk structure</dt><dd>${esc(st.name)}, ${esc(st.expiry)}: cost ${money2(st.cost)} (the most it can lose), most it can make ${money2(st.max_gain)}, breakeven ${money2(st.breakeven)} (${st.breakeven_pct > 0 ? "+" : ""}${st.breakeven_pct}% from the close). <span class="faint">${esc(st.units)}.</span></dd>`
        : F.pick !== "Neither" ? `<dt>Defined-risk structure</dt><dd class="faint">No stored chain for this stock yet.</dd>` : ""}
      <dt>Rule</dt><dd class="faint">Calls only when the long-term view is Buy now or Buy below and a close above resistance sets the entry; puts only when the short-side analyst flags the stock (${esc(F.shortside || "")}); otherwise neither. Earnings within 7 days: wait for the report.</dd>
    </dl>
    <p class="faint small">${esc(F.label || "")}${F.chain_date ? ` Chain as of ${esc(F.chain_date)} close (Yahoo, delayed).` : ""}</p></details>`;
  const mv = (O.moves || []).map((m) => `<li>${esc(m.expiry)}: ±${m.move_pct}%${m.after_earnings ? " <span class=\"faint\">(includes earnings)</span>" : ""}</li>`).join("");
  const B = O.busiest || {};
  const oi = (k) => (B[k] || []).map((x) => `${money2(x.strike)} <span class="faint">(${Number(x.oi).toLocaleString()})</span>`).join(", ") || "—";
  const opts = `<details class="fold v3-fold qa3" id="qa-options"><summary>Options Read</summary>
    ${O.chain_date || mv ? `<dl class="qa-dl">
      ${O.longterm ? `<dt>Long-term view</dt><dd>${ltBadge(O.longterm)} <span class="faint">${esc((O.longterm.reads || []).map((r) => `${r.measure}: ${r.level}`).join("; "))}</span></dd>` : ""}
      ${mv ? `<dt>Expected move</dt><dd><ul class="qa-ul">${mv}</ul></dd>` : ""}
      <dt>Implied vs realised</dt><dd>${O.iv != null ? `${O.iv}% implied (nearest monthly) vs ${O.rv ?? "—"}% realised over 20 sessions${O.iv_vs_rv ? ` (${O.iv_vs_rv}×)` : ""}` : "—"}</dd>
      ${B.expiry ? `<dt>Busiest strikes, ${esc(B.expiry)}</dt><dd>Calls ${oi("C")}<br>Puts ${oi("P")}</dd>` : ""}
      ${O.put_call_oi != null ? `<dt>Put/call open interest</dt><dd>${O.put_call_oi} <span class="faint">${esc(O.oi_note || "")}</span></dd>` : ""}
    </dl><p class="faint small">${esc(O.source || "")}${O.chain_date ? `, ${esc(O.chain_date)} close` : ""}. Open interest updates the next morning, so new positions from a session show a day later.</p>`
    : `<p class="faint">No options data stored for this stock yet.</p>`}</details>`;
  const ask = qs ? `<aside class="qa-ask" aria-label="Questions already answered"><b>You asked about this stock</b><ul>${qs}</ul></aside>` : "";
  return ask + side + stances + forced + opts;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".qa-jump");
  if (!b) return;
  const el = document.getElementById(b.dataset.to);
  if (!el) return;
  if (el.tagName === "DETAILS") el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* Stock page header (v3): price, both verdicts, the trigger, the value ribbon, a scorecard and the committee as chips. */
const boardRow = (t) => ((state.board || {}).rows || []).find((r) => r.ticker === t) || null;
function stockHeadV3(c, row, sc) {
  if (!row && !sc) return "";
  const st = { good: "s-good", mixed: "s-mixed", bad: "s-bad", none: "s-none" };
  const glyph = (a) => (a.veto ? "⊘" : a.stance > 0 ? "▲" : a.stance < 0 ? "▼" : "●");
  return `<section class="sh3" aria-label="Verdicts">
    ${row && row.intraday ? `<p class="intra">Last close ${money2(row.price)}; ${money2(row.intraday.price)} ${esc(row.intraday.label)} (not a close: scores and levels use the last close).</p>` : ""}
    ${row ? `<div class="sh3-badges"><div><span class="bc-l">Long-term</span>${ltBadge(row.longterm)}</div><div><span class="bc-l">Swing</span>${vBadge(row.swing)}</div>
      ${row.trigger ? `<div class="sh3-trig"><span class="bc-l">Trigger</span><b>${esc(row.trigger.replace(/^Wait for /, "").replace(/\.$/, ""))}</b></div>` : ""}
      ${row.earnings ? `<div><span class="bc-l">Earnings</span>${earnChip(row.earnings)}</div>` : ""}</div>` : ""}
    ${sc && sc.range ? valueRibbon(sc.range, c.price) : ""}
    ${sc ? `<div class="scg">${sc.tiles.map((t) => `<div class="sct ${st[t.state]}" title="${esc(t.note)}"><span>${esc(t.label)}</span><b class="num">${esc(t.value)}</b></div>`).join("")}</div>
      <div class="agc" aria-label="Committee">${sc.agents.map((a) => `<span class="ag-chip ${a.veto ? "s-bad" : a.stance > 0 ? "s-good" : a.stance < 0 ? "s-bad" : "s-none"}" title="${esc(a.reason)}"><i aria-hidden="true">${glyph(a)}</i>${esc(a.agent)}${a.call ? `: ${esc(a.call)}` : ""}</span>`).join("")}</div>` : ""}
  </section>`;
}
async function viewCommand(main) {
  main.innerHTML = skel();
  const k = await load("/api/committee");
  const B = k.briefing || {}, rc = B.regime || {}, cards = k.cards || [];
  const decisions = cards.filter((c) => c.call !== "Hold").concat(cards.filter((c) => c.call === "Hold"));
  const now = new Date();
  main.innerHTML = `
  <section class="cc-strip" aria-label="Session">
    <span>${esc(now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</span>
    <span class="rc rc-${esc((rc.call || "").toLowerCase().replace(/[^a-z]/g, ""))}"><b>${esc(rc.call || "—")}</b>: ${esc(rc.why || "")}</span>
    <span class="faint">Data from the ${esc(fmtDay(k.asof))} close; prices end-of-day</span>
  </section>
  ${synthesisHtml(k.synthesis, k.synthesis_status)}
  <section class="cc-hero">
    <h1 class="cc-title">CIO Briefing</h1>
    <ol class="brief-list">${(B.bullets || []).map((x) => `<li><span class="ag">${esc(x.agent)}</span> ${esc(x.text)}</li>`).join("")}</ol>
    ${aiBox(k.ai_market, "cc-ai")}
  </section>
  <section class="cc-sec"><h2>Today's Decisions</h2>
    <p class="sub">${B.has_prev ? (B.changes.length ? `Changed since the last briefing: ${B.changes.map((x) => `${esc(x.ticker)} ${esc(x.from)} to ${esc(x.to)}`).join(", ")}.` : "No call changed since the last briefing.") : "First briefing on record: today's calls are the starting book."}</p>
    <div class="tbl-wrap"><table class="sortable" data-sort><thead><tr><th>Ticker</th><th>Action</th><th>Conviction</th>${k.sizes_shown ? `<th class="num">Paper Size</th>` : ""}<th>Reason</th><th>Invalidation</th></tr></thead><tbody>
      ${decisions.map((c) => `<tr><td><a href="#/recs?t=${esc(c.ticker)}"><b>${esc(c.ticker)}</b></a></td><td data-v="${esc(c.call)}">${callPill(c)}</td><td>${esc(c.conviction.level || "None")}</td>
        ${k.sizes_shown ? `<td class="num">${c.size ? `${c.size.paper_pct}% <span class="faint">pending</span>` : "—"}</td>` : ""}<td>${esc(c.headline.replace(/^[^:]+: /, ""))}</td><td>${c.invalidation != null ? money2(c.invalidation) : "—"}</td></tr>`).join("")}
    </tbody></table></div></section>
  ${watchHtml(k.watch)}
  ${k.portfolio_enabled ? `<section class="cc-sec"><h2>Active Book</h2>
    <p>No positions recorded, so there is no live book to mark. ${k.sizes_shown ? `The committee's hypothetical paper book is on <a href="#/book">Position Book</a> (sizes pending your approval).` : ""}</p></section>` : ""}
  <section class="cc-sec"><h2>Emerging Calls</h2><p class="sub">What could become a call, what we are waiting for, and when it is decided.</p>
    ${(B.emerging || []).length ? `<div class="tbl-wrap"><table class="sortable"><thead><tr><th>Idea</th><th>Waiting For</th><th>Decision By</th></tr></thead><tbody>
      ${B.emerging.map((e) => `<tr><td><b>${esc(e.what)}</b></td><td>${esc(e.waiting_for)}</td><td>${esc(e.decision_by)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="faint">Nothing close to becoming a call.</p>`}</section>
  <div class="cc-two">
    <section class="cc-sec"><h2>Top Risks</h2>
      ${(B.risks || []).length ? `<ol>${B.risks.map((r) => `<li><b>${esc(r.risk)}</b>. Threatens ${esc(r.threatens)}. <span class="faint">${esc(r.detail)}</span></li>`).join("")}</ol>` : `<p class="faint">No ranked risks today.</p>`}</section>
    <section class="cc-sec"><h2>Committee Notes</h2>
      ${(B.notes || []).length ? `<ul>${B.notes.map((n) => `<li class="note-${esc(n.kind)}">${esc(n.text)}</li>`).join("")}</ul>` : `<p class="faint">No dissent, vetoes or open debates.</p>`}</section>
  </div>
  <section class="cc-sec"><h2>PM Sign-off</h2><p class="sub">Nothing is executed: there is no broker connection. These need your decision.</p>
    <ul>${(B.signoff || []).map((s) => `<li><b>${esc(s.item)}</b>: ${esc(s.detail)}</li>`).join("")}</ul></section>
  ${disclosure(k.disclosure)}`;
  main.querySelectorAll(".syn [data-open]").forEach((x) => x.addEventListener("click", (e) => { e.preventDefault(); openStock(x.dataset.open); }));
  enableSort(main);
}

/* Sortable tables: click a header to sort (numbers numerically), again to reverse. Keyboard: Enter on a header. */
function enableSort(root) {
  root.querySelectorAll("table.sortable").forEach((t) => t.querySelectorAll("thead th").forEach((th, i) => {
    th.tabIndex = 0; th.setAttribute("role", "button"); th.title = "Sort";
    const go = () => { const tb = t.tBodies[0], rows = [...tb.rows], dir = th.dataset.dir === "asc" ? "desc" : "asc";
      t.querySelectorAll("th").forEach((x) => { delete x.dataset.dir; x.removeAttribute("aria-sort"); }); th.dataset.dir = dir; th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
      const val = (r) => { const c = r.cells[i]; const v = c.dataset.v ?? c.innerText.trim(); const n = parseFloat(v.replace(/[$,%+]/g, "")); return isNaN(n) ? v.toLowerCase() : n; };
      rows.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * (dir === "asc" ? 1 : -1); }); rows.forEach((r) => tb.appendChild(r)); };
    th.addEventListener("click", go); th.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }));
}

function recCardHtml(c) {
  const up = c.target != null && c.price ? (c.target / c.price - 1) * 100 : null;
  return `<article class="rec" id="rec-${esc(c.ticker)}">
      <header><b class="tk">${esc(c.ticker)}</b> <span class="faint">${esc(c.name || "")}</span>${callPill(c)}<span class="cv">${esc(convText(c))}</span><span class="px">${money2(c.price)}</span></header>
      ${c.veto ? `<p class="veto">Risk veto: ${esc(c.veto.join("; "))}. No call is made while it stands.</p>` : ""}
      ${synCardHtml(c)}
      <p class="hl">${c.synthesis && c.synthesis.shown === "synthesis" ? `<span class="faint small">Rule vote:</span> ` : ""}${esc(c.headline)}</p>
      <dl class="rec-f">
        <div><dt>Invalidation</dt><dd>${esc(c.invalidation_text)}</dd></div>
        <div><dt>Entry</dt><dd>${c.entry != null ? `${money2(c.entry)} (top of the nearest support zone)` : "No entry: not a buying call."}</dd></div>
        <div><dt>Reference Target</dt><dd>${c.target != null ? `${money2(c.target)}${up != null ? ` (${up >= 0 ? "+" : ""}${up.toFixed(1)}%)` : ""}; ${c.horizon_kind === "fundamental" ? "thesis base value" : "nearest zone"}, a reference, not a forecast` : "None."}</dd></div>
        <div><dt>Horizon</dt><dd>${c.horizon} trading days (${esc(c.horizon_kind)})</dd></div>
        <div><dt>Conviction</dt><dd>${esc(c.conviction.level || "None")}: ${esc(c.conviction.rule)}</dd></div>
        <div><dt>What Changes Our Mind</dt><dd>${esc(c.change_mind)}</dd></div>
        ${c.size ? `<div><dt>Paper Size</dt><dd>${c.size.paper_pct}% of a hypothetical paper book. <b>${esc(c.size.status)}</b>. ${esc(c.size.note)}</dd></div>` : ""}
        <div><dt>Freshness</dt><dd>Data from the ${esc(fmtDay(c.asof))} close${c.stale ? "; stale" : ""}.</dd></div>
      </dl>
      ${(c.dissent || []).length ? `<p class="dissent"><b>Dissent:</b> ${c.dissent.map((d) => `${esc(d.agent)}: ${esc(d.reason)}`).join(" ")}</p>` : `<p class="faint small">No agent dissents from this call.</p>`}
      <details class="fold"><summary>Agent Views And Evidence</summary>
      <table class="agents"><thead><tr><th>Agent</th><th>Stance</th><th>Why</th><th>Evidence</th></tr></thead><tbody>
        ${AGENT_ORDER.map(([key, n]) => { const a = c.agents[key]; return `<tr><td>${n}</td><td class="s${a.veto ? "v" : a.stance}">${stanceGlyph(a)} ${esc(stanceWord(a))}</td><td>${esc(a.reason)}</td><td class="faint">${esc(EVID[a.evidence] || a.evidence || "")}</td></tr>`; }).join("")}
        <tr><td>CIO</td><td>${callPill(c)}</td><td>Call by the stated rule; the CIO note is opinion and never changes it.</td><td class="faint">docs/committee/PHASE2_SPEC.md</td></tr></tbody></table>
      ${(c.ta_read || []).length ? `<p class="small"><b>Technical read:</b> ${esc(c.ta_read.map((x) => x.text).join(" "))}</p>` : ""}
      </details>
      ${aiBox(c.ai_note)}
      <p><a href="#" data-open="${esc(c.ticker)}">Open the company research</a></p></article>`;
}
const EVID = { fundamentals: "Quality grade from SEC filings; valuation verdict (own history, peers, reverse DCF)", overview: "QQQ trend vs 50/200-day; VIX band", signals: "Signal registry: all experimental",
  ta: "Swing structure and 50-day average from daily closes", risk: "Risk controller vetoes", events: "Earnings calendar" };
const CONV_RANK = { High: 3, Medium: 2, Low: 1 };

async function viewRecs(main) {
  main.innerHTML = skel();
  const k = await load("/api/committee");
  const want = new URLSearchParams(location.hash.split("?")[1] || "").get("t");
  const all = k.cards || [];
  main.innerHTML = `<div class="head"><div><h1>Recommendations</h1><p class="sub">The committee's active book of calls: each with conviction, where it is wrong, and every agent's view. Data from the ${esc(fmtDay(k.asof))} close.</p></div></div>
    <div class="filters" role="group" aria-label="Filter and sort">
      <label>Action <select id="f-act"><option value="">All</option>${CALLS_LIST.map((c) => `<option>${c}</option>`).join("")}</select></label>
      <label>Conviction <select id="f-conv"><option value="">All</option><option>Medium</option><option>Low</option><option value="none">None</option></select></label>
      <label>Horizon <select id="f-hor"><option value="">All</option><option value="technical">20 days</option><option value="fundamental">250 days</option></select></label>
      <label>Sort <select id="f-sort"><option value="conv">Conviction</option><option value="up">Reference upside</option><option value="ticker">Ticker</option></select></label>
      <span id="f-n" class="faint"></span></div>
    <div class="rec-list" id="rec-list"></div>${disclosure(k.disclosure)}`;
  const draw = () => {
    const act = $("#f-act").value, conv = $("#f-conv").value, hor = $("#f-hor").value, srt = $("#f-sort").value;
    let xs = all.filter((c) => (!act || c.call === act) && (!conv || (conv === "none" ? !c.conviction.level : c.conviction.level === conv)) && (!hor || c.horizon_kind === hor));
    const upv = (c) => (c.target != null && c.price ? c.target / c.price - 1 : -9);
    xs.sort(srt === "ticker" ? (a, b) => a.ticker.localeCompare(b.ticker) : srt === "up" ? (a, b) => upv(b) - upv(a) : (a, b) => (CONV_RANK[b.conviction.level] || 0) - (CONV_RANK[a.conviction.level] || 0));
    if (want) xs = xs.sort((a, b) => (a.ticker === want ? -1 : b.ticker === want ? 1 : 0));
    $("#rec-list").innerHTML = xs.map(recCardHtml).join("") || `<div class="empty-state"><h2>No Calls Match</h2><p>Change the filters to see more of the book.</p></div>`;
    $("#f-n").textContent = `${xs.length} of ${all.length}`;
    $("#rec-list").querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openStock(a.dataset.open); }));
  };
  ["#f-act", "#f-conv", "#f-hor", "#f-sort"].forEach((s) => $(s).addEventListener("change", draw));
  draw();
  if (want) { const el = document.getElementById("rec-" + want); if (el) el.scrollIntoView({ block: "start" }); }
}
const CALLS_LIST = ["Buy", "Accumulate", "Hold", "Reduce", "Avoid", "No Call"];

async function viewOppsC(main) {
  main.innerHTML = skel();
  const [k, o] = await Promise.all([load("/api/committee"), load("/api/opportunities").catch(() => ({}))]);
  const B = k.briefing || {}, cards = Object.fromEntries((k.cards || []).map((c) => [c.ticker, c]));
  const rows = [];
  ((o.pipeline || {}).opportunities || []).forEach((p) => rows.push({ name: p.subject, why: `A ${p.kind.includes("bull") ? "breakout" : "breakdown"} setup triggered (${(p.checks.find((x) => x.state === 5) || {}).reason || "price level"}).`,
    waiting: `${p.blocker}; and a validated edge for this setup type (none yet).`, by: `${fmtDay(p.window_end)} (the setup's window ends)`, call: cards[p.subject] && cards[p.subject].call, rank: 2 }));
  (B.emerging || []).forEach((e) => { const t = e.what.split(" ")[0]; rows.push({ name: e.what, why: cards[t] ? `${t} is ${cards[t].call} today; this trigger would change it.` : "Close to a level that matters.",
    waiting: e.waiting_for, by: e.decision_by, call: cards[t] && cards[t].call, rank: 1 }); });
  main.innerHTML = `<div class="head"><div><h1>Opportunities</h1><p class="sub">Ideas the committee is evaluating. Each has why it surfaced, what we are waiting for, and when it is decided. No idea appears without a path to a decision.</p></div></div>
    ${rows.length ? `<div class="tbl-wrap"><table class="sortable"><thead><tr><th>Idea</th><th>Today's Call</th><th>Why It Surfaced</th><th>Waiting For</th><th>Decision By</th></tr></thead><tbody>
      ${rows.sort((a, b) => b.rank - a.rank).map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${r.call ? callPill({ call: r.call }) : "—"}</td><td>${esc(r.why)}</td><td>${esc(r.waiting)}</td><td>${esc(r.by)}</td></tr>`).join("")}</tbody></table></div>` :
      `<div class="empty-state"><h2>Nothing Under Evaluation</h2><p>No setup has triggered and no call is near a level that would change it.</p></div>`}
    <p class="faint small">The full eleven-check pipeline is under More, Setup Pipeline.</p>${disclosure(k.disclosure)}`;
  enableSort(main);
}

async function viewEarnC(main) {
  main.innerHTML = skel();
  const [k, e] = await Promise.all([load("/api/committee"), load("/api/earnings")]);
  const cards = Object.fromEntries((k.cards || []).map((c) => [c.ticker, c]));
  const all = (e.this_week || []).concat(e.next_week || []);
  const focus = all.filter((r) => cards[r.ticker] || ["CRWV", "AMAT", "CSCO", "NBIS"].includes(r.ticker));
  const pre = focus.filter((r) => r.status !== "reported"), post = focus.filter((r) => r.status === "reported");
  const preRow = (r) => { const c = cards[r.ticker]; return `<article class="rec"><header><b class="tk">${esc(r.ticker)}</b> <span class="faint">${esc(r.weekday)}, ${esc(r.timing)}${r.estimated === true || r.estimated === "True" ? " (estimated date)" : ""}</span>${c ? callPill(c) : ""}</header>
    <p><b>What is expected:</b> ${esc(r.expect)}</p><p><b>Going in:</b> ${esc(r.priced_in || "")}</p>
    <p><b>Our position:</b> ${c ? `${esc(c.call)}. ${esc(c.headline.replace(/^[^:]+: /, ""))} ${c.call === "Hold" && (c.agents.risk || {}).earnings ? "The report caps any buying until it is out." : ""}` : "No committee card (read-across name)."}</p>
    <p><b>What would change the call:</b> ${c ? esc(c.change_mind) : esc(r.watch || "")}</p>
    <p class="faint small">${esc(r.history || "")} Source: ${esc(r.source)}.</p></article>`; };
  main.innerHTML = `<div class="head"><div><h1>Earnings Intelligence</h1><p class="sub">Pre-earnings calls (what is expected and where we stand) and post-earnings verdicts for the focus list and the names that read across to it. ${esc(e.this_range ? `${e.this_range[0]} to ${(e.next_range || e.this_range)[1]}` : "")}.</p></div></div>
    <h2 class="sec-h">Before The Report</h2>${pre.map(preRow).join("") || `<div class="empty-state"><p>No focus-list reports in the next two weeks.</p></div>`}
    <h2 class="sec-h">After The Report</h2>${post.map((r) => `<article class="rec"><header><b class="tk">${esc(r.ticker)}</b><span class="faint">${esc(r.weekday)}</span>${cards[r.ticker] ? callPill(cards[r.ticker]) : ""}</header><p>${esc(r.reported)}</p>
      <p><b>Did it change the thesis?</b> The agents re-read the filing at the next refresh; today's call is ${cards[r.ticker] ? esc(cards[r.ticker].call) : "not on a card"}.</p></article>`).join("") || `<div class="empty-state"><p>No focus-list reports in the last few days.</p></div>`}
    ${disclosure(k.disclosure)}`;
}

async function viewBook(main) {
  main.innerHTML = skel();
  const k = await load("/api/committee");
  if (!k.portfolio_enabled) { location.hash = "#/coverage"; return; }       // portfolio features off: the page is retired
  const paper = (k.cards || []).filter((c) => c.size);
  main.innerHTML = `<div class="head"><div><h1>Position Book</h1><p class="sub">Your real positions, and separately a hypothetical paper book of the committee's calls.</p></div></div>
    <section class="cc-sec"><h2>Your Positions</h2><p>No positions recorded. You can enter holdings under Settings (kept on this Mac only); the committee never trades and has no broker connection.</p></section>
${k.sizes_shown ? `    <section class="cc-sec"><h2>Paper Book (Hypothetical)</h2>
      ${!k.sizes_shown ? `<p class="faint">Paper sizes are hidden here until you approve how sizing works.</p>` :
        paper.length ? `<p class="sub">Sizes are illustrative bands by conviction (Low 1%, Medium 2%, High 3%). <b>Pending your approval.</b> Not advice, never traded.</p>
        <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Call</th><th>Conviction</th><th class="num">Paper Size</th><th class="num">Entry</th><th class="num">Invalidation</th></tr></thead><tbody>
        ${paper.map((c) => `<tr><td><b>${esc(c.ticker)}</b></td><td>${callPill(c)}</td><td>${esc(c.conviction.level)}</td><td class="num">${c.size.paper_pct}%</td><td class="num">${money2(c.entry)}</td><td class="num">${money2(c.invalidation)}</td></tr>`).join("")}</tbody></table></div>` :
        `<p>No paper positions: the committee has no buying calls today.</p>`}
    </section>` : ""}${disclosure(k.disclosure)}`;
}

async function viewLog(main) {
  main.innerHTML = skel();
  const k = await load("/api/committee");
  const log = k.log || [];
  main.innerHTML = `<div class="head"><div><h1>Decision Log</h1><p class="sub">Every directional committee call, written to the forecast ledger before its window and scored against the benchmark when its horizon ends. Hypothetical research performance: there are no executed returns.</p></div></div>
    ${log.length ? `<div class="tbl-wrap"><table><thead><tr><th>Recorded</th><th>Name</th><th>Call</th><th>Benchmark</th><th>Horizon</th><th>Result</th></tr></thead><tbody>
      ${log.map((r) => `<tr><td class="num">${esc(dateFmt(r.created_at))}</td><td><b>${esc(r.subject)}</b></td><td>${esc(r.source_ref || r.direction)}</td><td>${esc(r.benchmark)}</td><td>${r.horizon_days} days from ${esc(fmtDay(r.window_start))}</td>
        <td>${r.status === "scored" ? `${r.hit ? "Beat" : "Lagged"} the benchmark by ${Math.abs(r.excess).toFixed(2)} pts` : "Waiting for the horizon to end"}</td></tr>`).join("")}</tbody></table></div>` :
      `<div class="empty-state"><h2>No Calls Logged Yet</h2><p>Directional calls are written here after the next scheduled research run. Holds and No Calls are not logged as forecasts.</p></div>`}
    ${disclosure(k.disclosure)}`;
}

const STATE_GLYPH = { uptrend: "↗", downtrend: "↘", sideways: "→", calm: "○", normal: "◔", elevated: "◑", high: "●" };
async function viewOverview(main) {
  main.innerHTML = skel();
  const [o, K] = await Promise.all([load("/api/overview"), load("/api/committee").catch(() => null)]);
  const ix = o.indices || {}, t = o.today || {}, reg = o.register || { rows: [] }, acc = o.accountability || {}, st = o.stocks || [];
  const RC = K && K.briefing ? K.briefing.regime : null, macroAgainst = K ? (K.cards || []).filter((c) => c.agents.macro.stance < 0).length : 0;
  const mine = st.filter((r) => r.mine), others = st.filter((r) => !r.mine);
  const tone = /downtrend/.test(o.verdict.text) ? "dn" : /sideways/.test(o.verdict.text) ? "mid" : "up";
  const idxCard = (k) => { const s = ix[k]; if (!s) return "";
    return `<article class="ix ix-${esc(s.trend || "none")}"><header><b class="tk">${k}</b><span class="px">${money(s.close)}</span>
      <span class="num ${dirCls(s.chg)}">${pct(s.chg)}</span><span class="chip chip-${esc(s.trend)}">${esc(s.trend || "—")}</span></header>
      ${railHtml(s)}<p class="means">${esc(s.means || "")}</p></article>`; };
  const maxAbs = Math.max(1, ...(o.sectors || []).map((x) => Math.abs(x.rel20)));
  main.innerHTML = `
  ${RC ? `<section class="cc-hero mi-regime"><h1 class="cc-title">Market Intelligence</h1><p class="cc-lead">Regime: ${esc(RC.call)}.</p>
    <p class="cc-sub">Because ${esc(RC.why)}. So what for our calls: ${esc(RC.implication)} Today the Macro agent votes against ${macroAgainst} of ${(K.cards || []).length} cards.</p></section>` : ""}
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
      <div><h3>What's driving the market</h3><ul>${(o.drivers || []).map((d) => `<li>${esc(d.text)} <b>${esc(d.means)}</b>${RC ? ` <span class="faint">So what for our calls: ${esc(RC.call === "Risk-off" ? "keeps the Macro agent against long calls." : "no change to the Macro agent's vote.")}</span>` : ""}</li>`).join("")}</ul></div>
      <div><h3>Where the evidence disagrees</h3><ul>${(o.evidence || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><h3>Our record</h3><ul><li>${esc(acc.positions)}</li><li>${esc(acc.results)} ${esc(acc.ledger)}</li><li>${esc(acc.runs)}</li></ul><a href="#/track">Track record</a></div>
      <div><h3>Not available from free sources</h3><ul>${(o.not_available || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div></details>
  <p class="preamble">Research, not advice. Nothing is traded; every decision is yours.</p>`;
  main.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openStock(a.dataset.open); }));
  ["SPY", "QQQ"].forEach((k) => { if (ix[k]) drawIndexChart($(`#ixc-${k}`), k, ix[k], o.gates).catch(() => {}); });
}


/* Coverage & Monitoring (fr/coverage.py; rules in docs/coverage/COVERAGE_RULES.md). Research coverage only: no holdings. */
const PRIO_RANK = { high: 3, medium: 2, low: 1 };

const PRI_CLS = { high: "c-avoid", medium: "c-hold", low: "" };
function covAlertHtml(x, local) {
  return `<details class="cov-alert"><summary><span class="pill ${PRI_CLS[x.priority] || ""}">${esc(x.priority)}</span> <b>${esc(x.ticker)}</b> ${esc(x.label)}${x.immediate ? ` <span class="pill c-avoid">Immediate</span>` : ""}${x.best_effort ? ` <span class="faint small">best effort</span>` : ""}
    <span class="faint small">${esc(fmtDay(x.asof))} · significance ${x.significance}</span></summary>
    <dl class="rec-f"><div><dt>What Happened</dt><dd>${esc(x.what)}</dd></div><div><dt>Why It Matters</dt><dd>${esc(x.why)}</dd></div>
      <div><dt>What Changed</dt><dd>${esc(x.changed)}</dd></div><div><dt>Who Investigates</dt><dd>${esc(x.analysts.join(", "))}</dd></div>
      <div><dt>Affects The Call?</dt><dd>${esc(x.affects_call)}</dd></div><div><dt>Immediate Attention?</dt><dd>${esc(x.immediate_why)}</dd></div></dl>
    ${local ? `<p><button class="btn" data-ack="${esc(x.alert_id)}" data-st="seen">Mark seen</button> <button class="btn ghost" data-ack="${esc(x.alert_id)}" data-st="dismissed">Dismiss</button></p>` : ""}</details>`;
}
const DIR_CALLS = ["Buy", "Accumulate", "Reduce", "Avoid"];
/* A directional result on a name without a recorded call is a lean, not a recommendation (shown muted). */
function covCall(a) {
  if (DIR_CALLS.includes(a.call) && !a.in_ledger) return `<span class="faint" title="The committee's rules lean this way, but no call is recorded in the ledger: not a recommendation.">${esc(a.call)} lean</span>`;
  return callPill({ call: a.call });
}
function covSections(v) {
  const S = v.sections || {}, act = S.activity || { by_agent: {} };
  const tbl = (head, rows, empty) => rows.length ? `<div class="tbl-wrap"><table class="sortable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>` : `<p class="faint">${empty}</p>`;
  const tk = (t) => t === "Market" ? `<b>Market</b>` : `<a href="#" data-open="${esc(t)}"><b>${esc(t)}</b></a>`;
  const att = S.attention || [];
  const dg = v.digest || {};
  return `<section class="cc-sec"><h2>Stocks Needing Attention</h2>
      <p class="sub">Open alerts, most significant first. Each answers what happened, why it matters, what changed, who investigates, whether it affects the call, and whether it is urgent. ${dg.date ? `Latest digest (${esc(fmtDay(dg.date))}): ${dg.counts.high} high, ${dg.counts.medium} medium, ${dg.counts.low} low.` : ""}</p>
      ${att.length ? att.slice(0, 12).map((x) => covAlertHtml(x, v.local)).join("") : `<p class="faint">No open alerts. Alerts fire only when something meaningful changes from the previous assessment (rules in docs/coverage/ALERT_RULES.md); the first day of coverage has nothing to compare against.</p>`}
      ${att.length > 12 ? `<p class="faint small">${att.length - 12} more in the digest.</p>` : ""}</section>
    <div class="cc-two">
      <section class="cc-sec"><h2>Highest-Conviction Opportunities</h2><p class="sub">Live buying calls first, then candidates and stocks near their entry, by conviction, business grade and distance to entry.</p>
        ${tbl(["Stock", "Stage", "Call", "Conviction", "Grade", "Valuation", "Entry"], (S.opportunities || []).map((o) => `<tr><td>${tk(o.ticker)}</td><td>${esc(o.lifecycle)}</td><td>${covCall(o)}</td><td>${esc(o.conviction || "—")}</td><td>${esc(o.grade || "—")}</td><td>${esc(o.valuation || "—")}</td>
          <td>${o.entry != null ? `${money2(o.entry)} <span class="faint small">(${o.entry_gap_atr} ATR away)</span>` : "—"}</td></tr>`), "No opportunities: no live buying call, candidate or stock near its entry.")}</section>
      <section class="cc-sec"><h2>Upcoming Catalysts</h2><p class="sub">Covered stocks' earnings in the next 30 days and major market events in the next 14.</p>
        ${tbl(["Date", "Stock", "What", "Call"], (S.catalysts || []).map((c) => `<tr><td data-v="${esc(c.date)}">${esc(fmtDay(c.date))}<div class="faint small">${c.days === 0 ? "today" : `in ${c.days} days`}</div></td><td>${tk(c.ticker)}</td><td>${esc(c.what)}</td><td>${c.call ? covCall(c) : "—"}</td></tr>`), "Nothing scheduled.")}</section>
    </div>
    <div class="cc-two">
      <section class="cc-sec"><h2>Approaching Attractive Valuations</h2><p class="sub">Grade A or B businesses already in their cheap range, then fairly priced stocks within ${(S.rules || {}).approach_value_pct || 15} percentile points of it (own 5-year price-to-sales history).</p>
        ${tbl(["Stock", "Valuation", "Grade", "How Close", "Call"], (S.approaching_value || []).map((x) => `<tr><td>${tk(x.ticker)}</td><td>${esc(x.valuation)}</td><td>${esc(x.grade || "—")}</td><td data-v="${x.to_cheap}">${esc(x.note)}</td><td>${covCall(x)}</td></tr>`), "None near the cheap range.")}</section>
      <section class="cc-sec"><h2>Deteriorating Cases</h2><p class="sub">Stocks flagged Thesis Deteriorating, plus early warnings where quarterly revenue growth fell 10+ points over two quarters.</p>
        ${tbl(["Stock", "Status", "Why"], (S.deteriorating || []).map((d) => `<tr><td>${tk(d.ticker)}</td><td>${esc(d.kind)}</td><td>${esc(d.why)}</td></tr>`), "No deteriorating cases.")}</section>
    </div>
    <div class="cc-two">
      <section class="cc-sec"><h2>Recent Thesis Changes</h2><p class="sub">Calls that changed, recommendations that started or ended, and theses flagged, in the last 14 days.</p>
        ${tbl(["When", "Stock", "Change", "Why"], (S.thesis_changes || []).map((h) => `<tr><td data-v="${esc(h.at)}">${esc(fmtDay(h.at.slice(0, 10)))}</td><td>${tk(h.ticker)}</td><td>${esc(h.old_value || "—")} → ${esc(h.new_value || "—")}</td><td>${esc(h.reason)}</td></tr>`), "No thesis changes since coverage started.")}</section>
      <section class="cc-sec"><h2>Recently Discovered</h2><p class="sub">Screen picks and stocks you added, newest first.</p>
        ${tbl(["Stock", "Added", "By", "Stage"], (S.discovered || []).map((d) => `<tr><td>${tk(d.ticker)}<div class="faint small">${esc(d.name || "")}</div></td><td data-v="${esc(d.added_at)}">${esc(fmtDay(d.added_at.slice(0, 10)))}</td><td>${esc(d.added_by === "screen" ? "quarterly screen" : d.added_by === "manual" ? "you" : "seed")}</td><td>${esc(d.lifecycle)}${d.insufficient ? `<div class="faint small">insufficient data</div>` : ""}</td></tr>`), "Nothing newly discovered.")}</section>
    </div>
    <section class="cc-sec"><h2>Research Activity</h2>
      <div class="tiles"><div class="tile"><span>Open</span><b class="num">${act.open || 0}</b></div><div class="tile"><span>In Progress</span><b class="num">${act.in_progress || 0}</b></div>
        <div class="tile"><span>Opened, 14 Days</span><b class="num">${act.opened_14d || 0}</b></div><div class="tile"><span>Done, 14 Days</span><b class="num">${act.done_14d || 0}</b></div>
        ${Object.entries(act.by_agent).map(([k, n]) => `<div class="tile"><span>${esc(k)}</span><b class="num">${n}</b><small>open items</small></div>`).join("")}</div></section>`;
}
async function viewCoverage(main) {
  main.innerHTML = skel();
  const v = await load("/api/coverage");
  const live = v.stocks.filter((s) => !s.removed_at);
  const uniq = (f) => [...new Set(live.map(f).flat().filter(Boolean))].sort();
  const opt = (xs) => xs.map((x) => `<option>${esc(x)}</option>`).join("");
  const a = (s) => s.assessment || {};
  main.innerHTML = `<div class="head"><div><h1>Coverage &amp; Monitoring</h1><p class="sub">Every stock we cover: where it is in its research lifecycle, who is looking into what, and what changed. Research coverage only; no holdings are tracked.</p></div></div>
    <div class="tiles cov-tiles"><div class="tile"><span>Total Covered</span><b class="num">${v.total}</b></div>
      ${v.categories.map((c) => `<button class="tile cov-cat" data-cat="${esc(c)}"><span>${esc(c)}</span><b class="num">${v.counts[c] || 0}</b></button>`).join("")}</div>
    ${covSections(v)}
    <h2 class="cov-h">All Covered Stocks</h2>
    <div class="filters" role="group" aria-label="Filter coverage">
      <label>Category <select id="cf-cat"><option value="">All</option>${opt(v.categories)}</select></label>
      <label>Sector <select id="cf-sec"><option value="">All</option>${opt(uniq((s) => s.sector))}</select></label>
      <label>Analyst <select id="cf-an"><option value="">All</option>${opt(v.agents)}</select></label>
      <label>Horizon <select id="cf-hor"><option value="">All</option><option value="technical">20 days</option><option value="fundamental">250 days</option></select></label>
      <label>Research <select id="cf-rs"><option value="">All</option><option>open</option><option>in progress</option><option>done</option></select></label>
      <label>Conviction <select id="cf-conv"><option value="">All</option><option>Medium</option><option>Low</option><option value="none">None</option></select></label>
      <label>Priority <select id="cf-pr"><option value="">All</option><option>high</option><option>medium</option><option>low</option></select></label>
      ${v.groups.length ? `<label>Group <select id="cf-gr"><option value="">All</option>${opt(v.groups.map((g) => g.name))}</select></label>` : ""}
      <label><input type="checkbox" id="cf-arch"> Show archived</label>
      <span id="cf-n" class="faint"></span></div>
    <div class="tbl-wrap"><table class="sortable" id="cov-tbl"><thead><tr><th>Ticker</th><th>Category</th><th>Lifecycle</th><th>Call</th><th>Conviction</th><th>Priority</th><th>Analysts</th><th>Research</th><th>Sector</th><th>Base List</th></tr></thead><tbody></tbody></table></div>
    <div class="cc-two">
      <section class="cc-sec"><h2>Recent Changes</h2><p class="sub">Every move, with its reason. Automatic moves name the rule that fired.</p><div id="cov-hist"></div></section>
      <section class="cc-sec"><h2>Open Assignments</h2><p class="sub">Which committee agent owns investigating each open item.</p><div id="cov-asg"></div></section>
    </div>
    ${v.local ? `<section class="cc-sec" id="cov-manage"><h2>Manage Coverage</h2><p class="sub">On this Mac only. Every change is written to the history; a pin holds until you clear it.</p>
      <form id="cov-add" class="filters"><label>Add ticker <input name="t" maxlength="10" placeholder="e.g. SNPS" aria-label="Ticker to add"></label>
        <label>List <select name="tier"><option>Watchlist</option><option>Core Coverage</option></select></label>
        <label>Priority <select name="pr"><option>medium</option><option>high</option><option>low</option></select></label>
        <button class="btn" type="submit">Add</button></form>
      <form id="cov-set" class="filters"><label>Stock <select name="t">${live.map((s) => `<option>${esc(s.ticker)}</option>`).join("")}</select></label>
        <label>Change <select name="f"><option value="priority">Priority</option><option value="tier">Base list</option><option value="frequency">Monitoring frequency</option><option value="pin_category">Pin category</option><option value="pin_lifecycle">Pin lifecycle</option><option value="remove">Remove from coverage</option></select></label>
        <label>To <select name="v"></select></label><label>Note <input name="note" maxlength="200" placeholder="optional"></label>
        <button class="btn" type="submit">Apply</button></form>
      <form id="cov-asg-f" class="filters"><label>Stock <select name="t">${live.map((s) => `<option>${esc(s.ticker)}</option>`).join("")}</select></label>
        <label>Agent <select name="ag">${opt(v.agents)}</select></label><label>Item <input name="item" maxlength="300" placeholder="what to investigate"></label>
        <button class="btn" type="submit">Assign</button></form>
      <form id="cov-grp" class="filters"><label>New group <input name="name" maxlength="60" placeholder="e.g. AI infrastructure"></label><button class="btn" type="submit">Create</button>
        ${v.groups.length ? `<label>Group <select name="g">${v.groups.map((g) => `<option value="${esc(g.group_id)}">${esc(g.name)}</option>`).join("")}</select></label>
        <label>Stock <select name="t">${live.map((s) => `<option>${esc(s.ticker)}</option>`).join("")}</select></label>
        <button class="btn" type="button" data-gm="1">Add to group</button><button class="btn ghost" type="button" data-gm="0">Remove from group</button>` : ""}</form>
      <p id="cov-msg" class="faint" role="status"></p></section>` : ""}
    ${disclosure("Coverage and lifecycle moves are rules over our own data; they are not advice. Nothing is traded and no holdings are tracked.")}`;
  const sel = () => ({ cat: $("#cf-cat").value, sec: $("#cf-sec").value, an: $("#cf-an").value, hor: $("#cf-hor").value, rs: $("#cf-rs").value,
    conv: $("#cf-conv").value, pr: $("#cf-pr").value, gr: $("#cf-gr") ? $("#cf-gr").value : "", arch: $("#cf-arch").checked });
  const draw = () => {
    const f = sel();
    const xs = v.stocks.filter((s) => (f.arch || !s.removed_at) && (!f.cat || s.category === f.cat) && (!f.sec || s.sector === f.sec) && (!f.an || s.analysts.includes(f.an))
      && (!f.hor || s.horizon === f.hor) && (!f.rs || s.research_status === f.rs) && (!f.pr || s.priority === f.pr) && (!f.gr || s.groups.includes(f.gr))
      && (!f.conv || (f.conv === "none" ? !a(s).conviction : a(s).conviction === f.conv)));
    xs.sort((p, q) => v.categories.indexOf(q.category) - v.categories.indexOf(p.category) || PRIO_RANK[q.priority] - PRIO_RANK[p.priority] || p.ticker.localeCompare(q.ticker));
    $("#cov-tbl tbody").innerHTML = xs.map((s) => `<tr><td><a href="#" data-open="${esc(s.ticker)}"><b>${esc(s.ticker)}</b></a><div class="faint small">${esc(s.name || "")}</div></td>
      <td data-v="${v.categories.indexOf(s.category)}">${esc(s.category)}${s.pin_category ? ` <span class="faint small">(pinned)</span>` : ""}</td>
      <td data-v="${v.lifecycle.indexOf(s.lifecycle)}">${esc(s.lifecycle)}${s.pin_lifecycle ? ` <span class="faint small">(pinned)</span>` : ""}</td>
      <td>${a(s).insufficient ? `<span class="faint">Insufficient data</span>` : covCall(a(s))}</td><td>${esc(a(s).conviction || "—")}</td>
      <td data-v="${PRIO_RANK[s.priority]}">${esc(s.priority)}</td><td>${esc(s.analysts.join(", ") || "—")}</td><td>${esc(s.research_status)}</td>
      <td>${esc(s.sector || "—")}</td><td>${esc(s.tier)}${s.groups.length ? `<div class="faint small">${esc(s.groups.join(", "))}</div>` : ""}</td></tr>`).join("")
      || `<tr><td colspan="10"><div class="empty-state"><p>No covered stock matches these filters.</p></div></td></tr>`;
    $("#cf-n").textContent = `${xs.length} shown`;
    $("#cov-tbl").querySelectorAll("[data-open]").forEach((x) => x.addEventListener("click", (e) => { e.preventDefault(); openStock(x.dataset.open); }));
  };
  main.querySelectorAll(".filters select, #cf-arch").forEach((x) => { if (x.id && x.id.startsWith("cf-")) x.addEventListener("change", draw); });
  main.querySelectorAll(".cov-cat").forEach((b) => b.addEventListener("click", () => { $("#cf-cat").value = b.dataset.cat; draw(); }));
  draw();
  const hist = v.history.filter((h) => h.field === "category" || h.field === "lifecycle" || h.source === "manual").slice(0, 40);
  $("#cov-hist").innerHTML = hist.length ? `<div class="tbl-wrap"><table class="sortable"><thead><tr><th>When</th><th>Stock</th><th>Move</th><th>Why</th></tr></thead><tbody>
    ${hist.map((h) => `<tr><td data-v="${esc(h.at)}">${esc(h.at.slice(0, 16).replace("T", " "))}</td><td><b>${esc(h.ticker)}</b></td><td>${esc(h.field)}: ${esc(h.old_value || "—")} → ${esc(h.new_value || "—")}<div class="faint small">${esc(h.source)}${h.rule ? `, ${esc(h.rule)}` : ""}</div></td><td>${esc(h.reason)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="faint">No changes recorded yet.</p>`;
  const open = v.assignments.filter((x) => x.status !== "done");
  $("#cov-asg").innerHTML = open.length ? `<div class="tbl-wrap"><table class="sortable"><thead><tr><th>Stock</th><th>Agent</th><th>Item</th><th>Status</th></tr></thead><tbody>
    ${open.map((x) => `<tr><td><b>${esc(x.ticker)}</b></td><td>${esc(x.agent)}</td><td>${esc(x.item)}<div class="faint small">since ${esc(fmtDay(x.opened_at.slice(0, 10)))}</div></td>
      <td>${v.local ? `<select data-asg="${esc(x.assignment_id)}" aria-label="Research status">${["open", "in progress", "done"].map((st) => `<option${st === x.status ? " selected" : ""}>${st}</option>`).join("")}</select>` : esc(x.status)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="faint">No open assignments.</p>`;
  main.querySelectorAll(".cc-sec [data-open]").forEach((x) => x.addEventListener("click", (e) => { e.preventDefault(); openStock(x.dataset.open); }));
  enableSort(main);
  if (!v.local) return;
  const msg = (t) => { $("#cov-msg").textContent = t; };
  main.querySelectorAll("[data-ack]").forEach((b) => b.addEventListener("click", () => post({ action: "ack", alert_id: b.dataset.ack, status: b.dataset.st }, b.dataset.st === "seen" ? "Marked seen." : "Dismissed.")));
  const post = async (body, ok) => {
    try { await api("/api/coverage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); state.cache = {}; await viewCoverage(main); $("#cov-msg").textContent = ok; }
    catch (e) { msg("Not saved: " + e.message); }
  };
  main.querySelectorAll("[data-asg]").forEach((s) => s.addEventListener("change", () => post({ action: "status", assignment_id: s.dataset.asg, status: s.value }, "Research status updated.")));
  $("#cov-add").addEventListener("submit", (e) => { e.preventDefault(); const f = e.target; const t = f.t.value.trim().toUpperCase(); if (t) post({ action: "add", ticker: t, tier: f.tier.value, priority: f.pr.value }, `${t} added. It shows insufficient data until the background refresh backfills it.`); });
  const CHOICES = { priority: ["high", "medium", "low"], tier: ["Core Coverage", "Watchlist"], frequency: ["every refresh", "daily", "weekly"],
    pin_category: ["", ...v.categories], pin_lifecycle: ["", ...v.lifecycle], remove: ["confirm"] };
  const sf = $("#cov-set");
  const fill = () => { sf.v.innerHTML = CHOICES[sf.f.value].map((x) => `<option value="${esc(x)}">${esc(x || "Clear pin")}</option>`).join(""); };
  sf.f.addEventListener("change", fill); fill();
  sf.addEventListener("submit", (e) => { e.preventDefault();
    if (sf.f.value === "remove") post({ action: "remove", ticker: sf.t.value, note: sf.note.value }, `${sf.t.value} archived. Its history stays.`);
    else post({ action: "set", ticker: sf.t.value, field: sf.f.value, value: sf.v.value, note: sf.note.value }, "Saved."); });
  $("#cov-asg-f").addEventListener("submit", (e) => { e.preventDefault(); const f = e.target; if (f.item.value.trim()) post({ action: "assign", ticker: f.t.value, agent: f.ag.value, item: f.item.value }, "Assigned."); });
  const gf = $("#cov-grp");
  gf.addEventListener("submit", (e) => { e.preventDefault(); if (gf.name.value.trim()) post({ action: "group-create", name: gf.name.value }, "Group created."); });
  gf.querySelectorAll("[data-gm]").forEach((b) => b.addEventListener("click", () => post({ action: "group-member", group_id: gf.g.value, ticker: gf.t.value, on: b.dataset.gm === "1" }, "Group updated.")));
}

/* Phones: the bottom tab bar's "More" page lists every view (the top tab row is hidden on narrow screens). */
async function viewMore(main) {
  const links = [...document.querySelectorAll(".tabs a[data-view]")].map((a) => [a.dataset.view, a.textContent.trim()]).concat(STATIC ? [] : [["ops", "Research Operations"]]);
  main.innerHTML = `<div class="head"><div><h1>All Pages</h1><p class="sub">Every view in the dashboard.</p></div></div>
    <ul class="more-list">${links.map(([v, n]) => `<li><a href="#/${esc(v)}">${esc(n)}</a></li>`).join("")}
    ${STATIC ? "" : `<li><a href="#/settings">Settings</a></li>`}</ul>`;
}

/* Touch: SVG marks that explain themselves with a hover <title> also answer a tap, in a small readout. */
document.addEventListener("click", (e) => {
  const g = e.target.closest && e.target.closest("svg g");
  const t = g && g.querySelector(":scope > title");
  let tip = document.getElementById("tap-tip");
  if (!t) { if (tip) tip.hidden = true; return; }
  if (!tip) { tip = document.createElement("div"); tip.id = "tap-tip"; tip.setAttribute("role", "status"); document.body.appendChild(tip); }
  tip.textContent = t.textContent; tip.hidden = false;
  const x = Math.min(window.innerWidth - 16, Math.max(16, e.clientX)), y = Math.max(16, e.clientY - 12);
  tip.style.left = x + "px"; tip.style.top = y + "px";
});


/* Today (fr/daypage.py, 2026-11-12): the one page to read before the open, and the recap after the close. Short by
   design: the main thing, a take per stock with a stance, an action and the levels; tap a stock for its full page. */
const STANCE_CLS = { "Buy": "good", "Add on dips": "good", "Hold": "neutral", "Wait": "neutral", "Trim": "bad", "Avoid": "bad" };
const stanceBadge = (s) => (s ? `<span class="td-stance td-${STANCE_CLS[s] || "neutral"}">${esc(s)}</span>` : "");
function tdPrice(p) {
  if (!p) return "";
  const ext = p.extended != null ? `<span class="faint">${esc(p.extended_time || "extended hours")}</span> <span class="num">${money2(p.extended)}</span> <span class="num ${dirCls(p.extended_pct)}">${pct(p.extended_pct, 1)}</span>` : "";
  return `<span class="td-px"><span class="num">${money2(p.close)}</span> <span class="num ${dirCls(p.change_1d_pct)}">${pct(p.change_1d_pct, 1)}</span>${ext ? ` · ${ext}` : ""}</span>`;
}
const tdLevels = (lv) => (lv && lv.length ? `<ul class="td-levels">${lv.map((l) => `<li><b class="num">${money2(l.price)}</b> ${esc(l.means)}</li>`).join("")}</ul>` : "");
const tdTk = (t) => `<button class="td-tk" data-open="${esc(t)}" aria-label="Open ${esc(t)}">${esc(t)}</button>`;

async function viewToday(main) {
  main.innerHTML = skel();
  const d = await api("/api/today");
  const want = (location.hash.split("?")[1] || "").includes("recap") ? "recap" : (location.hash.split("?")[1] || "").includes("premarket") ? "premarket" : d.show;
  const P = d[want];
  const title = { premarket: "Before the open", recap: "After the close" };
  const toggle = `<div class="td-toggle" role="tablist">${["premarket", "recap"].map((k) => `<a role="tab" href="#/today?${k}" class="${k === want ? "on" : ""}" aria-selected="${k === want}">${title[k]}${d[k] ? ` <span class="faint">${esc(fmtDay(d[k].session_date))}</span>` : ""}</a>`).join("")}</div>`;
  if (!P || !P.page) {
    main.innerHTML = `<div class="head"><div><h1>${title[want]}</h1></div>${toggle}</div>
      <div class="card"><p>${P && P.status === "failed" ? `The page for ${esc(fmtDay(P.session_date))} could not be written (${esc(P.error || "error")}). It retries at the next scheduled time; the full research is under Home and Stocks.`
        : `No page yet. It is written each weekday at 8:50 AM (before the open) and 4:40 PM (after the close), Eastern.`}</p></div>`;
    return;
  }
  const g = P.page, M = g.market || {}, px = P.prices || {};
  const t1 = g.stocks.filter((s) => s.tier === 1), t2 = g.stocks.filter((s) => s.tier === 2), t3 = g.stocks.filter((s) => s.tier === 3);
  main.innerHTML = `<div class="head"><div><h1>${title[want]} · ${esc(new Date(P.session_date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }))}</h1>
      <p class="sub">${esc(d.label)}. Written ${esc(new Date(P.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}. Tap a stock for its full page.</p></div>${toggle}</div>
    <section class="td-market card" aria-label="Market">
      ${M.day_type ? `<p class="td-daytype">${esc(M.day_type)}</p>` : ""}
      <p class="td-main">${esc(M.headline)}</p>
      ${(M.watch || []).length ? `<h3>What to watch</h3><ul>${M.watch.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
    </section>
    ${t1.map((s) => `<article class="td-card card">
      <div class="td-h">${tdTk(s.ticker)}${tdPrice(px[s.ticker])}${stanceBadge(s.long_term.stance)}</div>
      <p class="td-hl">${esc(s.headline)}</p>
      ${s.why ? `<p>${esc(s.why)}</p>` : ""}
      ${s.long_term.reason ? `<p><b>Long term:</b> ${esc(s.long_term.reason)}</p>` : ""}
      ${s.what_would_change_it ? `<p class="muted"><b>What would change it:</b> ${esc(s.what_would_change_it)}</p>` : ""}
      ${s.action ? `<p class="td-act"><b>Action:</b> ${esc(s.action)}</p>` : ""}
      ${tdLevels(s.levels)}
    </article>`).join("")}
    ${t2.length ? `<section class="td-rest" aria-label="Also worth a look"><h2>Also worth a look</h2>${t2.map((s) => `<div class="td-row">
      <div class="td-h">${tdTk(s.ticker)}${tdPrice(px[s.ticker])}${stanceBadge(s.long_term.stance)}</div>
      <p class="td-hl">${esc(s.headline)}</p>
      ${s.action ? `<p class="td-act"><b>Action:</b> ${esc(s.action)}</p>` : ""}
      ${tdLevels(s.levels)}
      ${s.long_term.reason ? `<p class="faint">Long term: ${esc(s.long_term.reason)}</p>` : ""}</div>`).join("")}</section>` : ""}
    ${t3.length ? `<details class="td-quiet"><summary>Nothing new: ${t3.map((s) => esc(s.ticker)).join(", ")}</summary>${t3.map((s) => `<div class="td-row">
      <div class="td-h">${tdTk(s.ticker)}${tdPrice(px[s.ticker])}${stanceBadge(s.long_term.stance)}</div>
      ${s.headline ? `<p class="td-hl">${esc(s.headline)}</p>` : ""}${s.action ? `<p class="td-act"><b>Action:</b> ${esc(s.action)}</p>` : ""}${tdLevels(s.levels)}</div>`).join("")}</details>` : ""}
    <p class="faint td-foot">Model: ${esc(P.model || "—")}. Every number comes from the app's data; sentences with numbers we couldn't check are removed. Opinion, not personal advice.</p>`;
  main.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openStock(b.dataset.open)));
}

const VIEWS = { today: viewToday, more: viewMore, command: viewHome, stocks: viewStocks3, ideas: viewIdeas, market: viewMarket3, reports: viewReports, record: viewRecord, ops: viewOps, settings: viewSettings };
const skel = () => `<div class="list">${'<div class="skeleton"></div>'.repeat(6)}</div>`;
function whenPlotly(fn, tries = 0) { if (window.Plotly) fn(); else if (tries < 60) setTimeout(() => whenPlotly(fn, tries + 1), 100); else { const e = $("#treemap"); if (e) e.innerHTML = `<div class="empty">Heatmap library unavailable (offline?).</div>`; } }

async function route() {
  let v = (location.hash.replace("#/", "") || "today").split("?")[0];
  if (REDIRECT[v]) {                                        // old links land on their new home
    const extra = (location.hash.split("?")[1] || "");
    const to = REDIRECT[v] + (extra && !REDIRECT[v].includes("?") ? "?" + extra : "");
    history.replaceState(null, "", location.pathname + location.search + "#/" + to);
    v = to.split("?")[0];
  }
  const view = VIEWS[v] ? v : "today";
  document.querySelectorAll(".tabs a, .bottom-tabs a").forEach((a) => { a.classList.toggle("active", a.dataset.view === view); a.setAttribute("aria-current", a.dataset.view === view ? "page" : "false"); });
  const more = document.querySelector(".more-nav");
  if (more) { more.classList.toggle("active", !!more.querySelector(`a[data-view="${view}"]`)); more.open = false; }
  closeDrawer();
  const main = $("#main");
  try { await VIEWS[view](main); freshBanner(main); } catch (e) { main.innerHTML = `<div class="err">Could not load this view: ${esc(e.message)}</div>`; }
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
    // Deep link: ?open=NVDA opens that stock's panel (shareable; also used for screenshots).
    // Read it before route(): route() closes the drawer, which clears ?open from the address.
    const open = new URLSearchParams(location.search).get("open");
    const todayFirst = !force && /^#?\/?(today)?(\?|$)/.test(location.hash.replace("#/", "")) && !state.home;
    const early = todayFirst ? route() : null;               // the Today page doesn't wait for the slower home data
    state.home = await load("/api/home", force);
    renderChrome(state.home);
    if (early) await early; else await route();
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
  const cur = document.documentElement.dataset.theme || (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const t = cur === "dark" ? "light" : "dark";             // follows the system until toggled; the choice is remembered
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
