/* iPhone layout (2026-11-12). A phone app of its own, not the web page shrunk down: four tabs with one job each
   (Today, Stocks, Events, Record). Every stock starts as one line (ticker, labelled price, change, one call) and
   expands in place; the full note and release-day detail open in a bottom sheet. Data: /api/phone (fr/phone.py),
   built from the same board rows, analyst notes and release notes as the web pages. Active at phone widths or when
   opened from the Home Screen; "Full site" on the Record tab switches back. */
(function () {
  if (!window.FR_PHONE) return;
  const $ = (s, r = document) => r.querySelector(s);
  const h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (x) => (x == null ? "—" : "$" + Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pc = (x) => (x == null ? "" : `<small class="${x >= 0 ? "up" : "dn"}">${x > 0 ? "+" : ""}${Number(x).toFixed(2)}%</small>`);
  const dayFmt = (iso) => { const d = new Date(iso + "T12:00:00"); return { m: d.toLocaleDateString(undefined, { month: "short" }), d: d.getDate(), wd: d.toLocaleDateString(undefined, { weekday: "short" }) }; };
  const LOGO = `<svg class="ph-logo" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="4.2" height="18" rx="1.2" fill="currentColor"/><rect x="9.6" y="3" width="9.6" height="4.2" rx="1.2" fill="currentColor"/><rect x="9.6" y="10" width="6" height="4.2" rx="1.2" fill="currentColor"/><circle cx="17.2" cy="18.6" r="2.4" fill="var(--accent)"/></svg>`;
  const ICON = {
    today: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
    stocks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 19V11M10 19V5M16 19v-6M22 19H2"/></svg>`,
    events: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
    record: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12l5 5L20 6"/></svg>`,
  };
  const TABS = [["today", "Today"], ["stocks", "Stocks"], ["events", "Events"], ["record", "Record"]];
  let D = null, filter = "main";

  document.documentElement.classList.add("phone-mode");
  const root = document.createElement("div");
  root.id = "ph";
  root.innerHTML = `<div class="ph-screen" id="ph-screen" tabindex="-1"></div>
    <nav class="ph-tabs" aria-label="Sections">${TABS.map(([k, n]) => `<a href="#/${k}" data-tab="${k}">${ICON[k]}<span>${n}</span></a>`).join("")}</nav>
    <div class="ph-scrim" id="ph-scrim"></div>
    <section class="ph-sheet" id="ph-sheet" role="dialog" aria-modal="true" aria-labelledby="ph-sh-title" aria-hidden="true">
      <div class="ph-grab" aria-hidden="true"></div>
      <div class="ph-sh-head"><h3 id="ph-sh-title"></h3><button type="button" id="ph-sh-close">Done</button></div>
      <div class="ph-sh-body" id="ph-sh-body"></div></section>`;
  document.body.appendChild(root);
  const screen = $("#ph-screen");

  /* ---------------------------------------------------------------- pieces */
  const head = (title, sub) => `<header class="ph-head"><div><h1>${h(title)}</h1>${sub ? `<p class="ph-sub">${h(sub)}</p>` : ""}</div>${LOGO}</header>`;
  const lvRows = (rows) => (rows || []).length ? `<div class="ph-levels">${rows.map((l) => `<div class="ph-lv"><span class="k ${h(l.k)}">${h(l.label)}</span><span class="v">${h(l.v)}</span></div>`).join("")}</div>` : "";
  const pillHtml = (p) => `<span class="ph-pill p-${h(p.cls)}">${h(p.label)}</span>`;
  const priceHtml = (q) => q ? `<div class="ph-px"><div>${money(q.price)}</div>${pc(q.change_pct)}<small class="ph-pl">${h(q.label)}</small></div>` : `<div class="ph-px"></div>`;
  function row(s) {
    return `<div class="ph-row" data-t="${h(s.t)}">
      <button type="button" class="ph-rh" aria-expanded="false"><div class="ph-id"><div class="tk">${h(s.t)}</div><div class="nm">${h(s.sub || s.name)}</div></div>
        ${priceHtml(s.quote)}${pillHtml(s.pill)}</button>
      <div class="ph-body"><div><div class="ph-inner">
        <div class="ph-calls"><div class="ph-cb"><small>Long-term</small><div>${h(s.longterm)}</div>${s.rule ? `<small>Value rule: ${h(s.rule)}</small>` : ""}</div><div class="ph-cb"><small>Swing</small><div>${h(s.swing)}</div></div></div>
        ${s.why ? `<p class="ph-why">${h(s.why)}</p>` : ""}
        ${s.note && s.note.what_changed ? `<p class="ph-flag ph-since">${h(s.note.what_changed)}</p>` : ""}
        ${lvRows(s.levels)}
        ${s.differs ? `<p class="ph-differ"><b>Analyst says ${h(s.analyst_action[0].toUpperCase() + s.analyst_action.slice(1))}.</b> ${h(s.differs.split("The analyst note says ")[1] || "")}</p>` : ""}
        ${s.check ? `<p class="ph-flag">${h(s.check)}</p>` : ""}
        ${s.note ? `<button type="button" class="ph-more" data-note="${h(s.t)}">Full note</button>` : ""}
      </div></div></div></div>`;
  }
  function evRow(e, i) {
    const d = dayFmt(e.date);
    return `<button type="button" class="ph-ev" data-ev="${i}"><div class="ph-day"><small>${h(d.m)}</small><span>${d.d}</span></div>
      <div class="ph-et"><div>${h(e.title)}${e.time ? ` <small class="ph-time">${h(e.time)}</small>` : ""}</div>${e.line ? `<p>${h(e.line)}</p>` : ""}</div>
      ${e.release || e.ticker ? `<span class="ph-chev" aria-hidden="true">›</span>` : ""}</button>`;
  }

  /* Morning call (fr/morning.py): the before-the-open calls on top of Today; graded after the close. */
  const CALLW = { buy: "Buy", add: "Add", hold: "Hold", trim: "Trim", avoid: "Avoid", nothing: "Do nothing", "lean in": "Lean in", selective: "Be selective", "stand aside": "Stand aside" };
  const CALLC = { buy: "buy", add: "buy", hold: "hold", trim: "avoid", avoid: "avoid", nothing: "none" };
  const GRADE = { right: ["Right", "buy"], wrong: ["Wrong", "avoid"], not_triggered: ["Not triggered", "none"], no_bet: ["No bet", "none"], no_data: ["Pending", "none"] };
  const tm = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  function morningHtml(M) {
    if (!M) return "";
    const d = dayFmt(M.session_date), today = new Date().toISOString().slice(0, 10) === M.session_date;
    const trig = (c) => c.trigger ? `${c.trigger.side === "above" ? "If it trades at or above" : "If it trades at or below"} ${money(c.trigger.price)}` : "At the open";
    const pill = (c) => c.grade ? `<span class="ph-pill p-${GRADE[c.grade.status][1]}">${GRADE[c.grade.status][0]}</span>` : `<span class="ph-pill p-${CALLC[c.call] || "none"}">${h(CALLW[c.call] || c.call)}</span>`;
    const mk = M.market || {};
    return `<section class="ph-group ph-mc" aria-label="Morning call">
      <p class="ph-when">${M.graded ? "Graded after the close" : "Morning call"}, ${h(d.wd)} ${h(d.m)} ${d.d}. Written ${h(tm(M.created_at))}${M.late ? ", after the open" : ""}${today ? "" : ""}</p>
      ${mk.call ? `<p class="ph-call">${h(CALLW[mk.call] || mk.call)}${mk.grade && mk.grade.status !== "no_bet" ? ` <span class="ph-pill p-${GRADE[mk.grade.status][1]}">${GRADE[mk.grade.status][0]}</span>` : ""}</p>` : ""}
      ${mk.if_then ? `<p class="ph-what">${h(mk.if_then)}</p>` : ""}
      ${mk.grade ? `<p class="ph-mc-why">${h(mk.grade.why)}</p>` : ""}
      <div class="ph-mc-list">${M.calls.map((c) => `<div class="ph-row" data-mc="${h(c.t)}">
        <button type="button" class="ph-rh" aria-expanded="false"><div class="ph-id"><div class="tk">${h(c.t)}</div><div class="nm">${h(CALLW[c.call] || c.call)}: ${h(trig(c))}</div></div><span></span>${pill(c)}</button>
        <div class="ph-body"><div><div class="ph-inner">
          ${c.grade ? `<p class="ph-why"><b>${GRADE[c.grade.status][0]}.</b> ${h(c.grade.why)}</p>` : ""}
          ${c.action ? `<p class="ph-why">${h(c.action)}</p>` : ""}
          ${c.if_then ? `<p class="ph-differ">${h(c.if_then)}</p>` : ""}
        </div></div></div></div>`).join("")}</div></section>`;
  }

  /* ---------------------------------------------------------------- views */
  const VIEWS = {
    today() {
      const M = D.market, act = D.stocks.filter((s) => s.act), soon = D.events.slice(0, 3);
      const wd = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      return head("Today", wd) + morningHtml(D.morning) + `
        <section class="ph-group ph-mkt" aria-label="Market"><p class="ph-when">${h(M.when)}</p><p class="ph-call">${h(M.call)}</p>
          ${M.what ? `<p class="ph-what">${h(M.what)}</p>` : ""}${lvRows(M.levels)}</section>
        ${soon.length ? `<h2 class="ph-gl">Coming up</h2><div class="ph-group">${soon.map((e) => evRow(e, D.events.indexOf(e))).join("")}</div>` : ""}
        <h2 class="ph-gl"><span>Act on these</span><span class="ph-count">${act.length} of ${D.stocks.length}</span></h2>
        <div class="ph-group">${act.map(row).join("") || `<p class="ph-empty">Nothing needs action today.</p>`}</div>`;
    },
    stocks() {
      const list = D.stocks.filter((s) => filter === "all" || s.main);
      return head("Stocks") + `
        <div class="ph-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input id="ph-q" type="search" placeholder="Find a stock" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Find a stock" aria-controls="ph-dd" aria-expanded="false">
          <div class="ph-dd" id="ph-dd" role="listbox" hidden></div></div>
        <div class="ph-seg" role="group" aria-label="Which stocks"><button type="button" data-f="main" aria-pressed="${filter === "main"}">Main 12</button><button type="button" data-f="all" aria-pressed="${filter === "all"}">All covered</button></div>
        <h2 class="ph-gl"><span>Sorted by what needs action</span></h2>
        <div class="ph-group">${list.map(row).join("")}</div>`;
    },
    events() {
      return head("Events", "What could move your stocks") + `<div class="ph-group">${D.events.map(evRow).join("") || `<p class="ph-empty">Nothing scheduled in the next 30 days.</p>`}</div>`;
    },
    record() {
      const R = D.record;
      return head("Record", "Are the calls any good?") + `
        <section class="ph-group ph-stat"><small>Verdict so far</small><p class="ph-big">${h(R.verdict)}</p><p>${h(R.text)}</p></section>
        ${(R.board || []).length ? `<h2 class="ph-gl"><span>Scoreboard</span><span class="ph-count">vs QQQ</span></h2>
          <div class="ph-group">${R.board.map((b) => `<div class="ph-ev ph-static"><div class="ph-et"><div>${h(b.name)}</div><p>${h(b.verdict)}${b.logged ? `; ${b.logged} logged` : ""}${b.note ? `. ${h(b.note)}` : ""}</p></div>
            <span class="ph-pill p-${!b.judged ? "none" : b.hit_rate >= 50 ? "buy" : "avoid"}">${b.hit_rate != null ? b.hit_rate + "%" : "—"}</span></div>`).join("")}</div>` : ""}
        <h2 class="ph-gl"><span>Recent calls</span><span class="ph-count">${R.recorded} logged</span></h2>
        <div class="ph-group">${R.calls.map((c) => `<div class="ph-ev ph-static"><div class="ph-et"><div>${h(c.t)}: ${h(c.call)}</div><p>${h(c.by)}, logged ${h(c.logged)}, graded after ${c.days} trading days</p></div>
          <span class="ph-pill p-${c.status === "Right" ? "buy" : c.status === "Wrong" ? "avoid" : "wait"}">${h(c.status)}</span></div>`).join("")}</div>
        <p class="ph-foot"><button type="button" id="ph-full">Open the full site</button></p>`;
    },
  };

  /* ---------------------------------------------------------------- sheet */
  const sheet = $("#ph-sheet");
  let lastFocus = null;
  function openSheet(title, html) {
    lastFocus = document.activeElement;
    $("#ph-sh-title").textContent = title; $("#ph-sh-body").innerHTML = html; $("#ph-sh-body").scrollTop = 0;
    root.classList.add("sheet-open"); sheet.setAttribute("aria-hidden", "false");
    setTimeout(() => $("#ph-sh-close").focus(), 60);
  }
  function closeSheet() { root.classList.remove("sheet-open"); sheet.setAttribute("aria-hidden", "true"); if (lastFocus) lastFocus.focus(); }
  $("#ph-scrim").addEventListener("click", closeSheet);
  $("#ph-sh-close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  function noteSheet(t) {
    const s = D.stocks.find((x) => x.t === t); if (!s || !s.note) return;
    const N = s.note, ul = (xs) => (xs || []).length ? `<ul>${xs.map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : "";
    openSheet(`${s.t}: ${s.name}`, `
      ${N.headline ? `<p class="ph-sh-lead">${h(N.headline)}</p>` : ""}
      <div class="ph-calls"><div class="ph-cb"><small>Long-term</small><div>${h(s.longterm)}</div></div><div class="ph-cb"><small>Swing</small><div>${h(s.swing)}</div></div></div>
      ${s.levels.length ? `<h4>Act at</h4>${lvRows(s.levels)}` : ""}
      ${N.timing ? `<h4>Timing</h4><p>${h(N.timing)}</p>` : ""}
      ${N.what_changed ? `<h4>What changed since the last note</h4><p>${h(N.what_changed)}</p>` : ""}
      ${N.happening ? `<h4>What's happening</h4><p>${h(N.happening)}</p>` : ""}
      ${N.business ? `<h4>The business</h4><p>${h(N.business)}</p>` : ""}
      ${N.worth ? `<h4>What it's worth</h4><p>${h(N.worth)}</p>` : ""}
      ${N.bull.length ? `<h4>Bull case</h4>${ul(N.bull)}` : ""}${N.bear.length ? `<h4>Bear case</h4>${ul(N.bear)}` : ""}
      ${N.change_mind.length ? `<h4>What would change the view</h4>${ul(N.change_mind)}` : ""}
      ${s.differs ? `<h4>Why the two calls differ</h4><p>${h(s.differs)}</p>` : ""}
      <p class="ph-src">Written from the ${h(N.asof || "")} close.</p>`);
  }
  function releaseSheet(e) {
    const R = e.release, N = R.note || {}, Dd = N.data || {}, H = Dd.reaction_history || {}, q = H.QQQ, sp = H.SPY;
    const d = dayFmt(e.date), CASE = { hot: "Hot", "in-line": "In line", cool: "Cool" }, cls = { hot: "dn", cool: "up", "in-line": "" };
    openSheet(`${R.name.split(" (")[0]}: ${d.wd} ${d.m} ${d.d}${e.time ? `, ${e.time}` : ""}`, `
      ${N.bottom_line ? `<p class="ph-sh-lead">${h(N.bottom_line)}</p>` : ""}
      ${q ? `<h4>What history says <span class="ph-src-i">${q.releases} release days since ${h(q.since.slice(0, 4))}</span></h4>
        <div class="ph-hist"><div><small>QQQ move</small><b>${q.median_size_pct.toFixed(2)}%</b></div><div><small>Normal day</small><b>${q.normal_day_size_pct.toFixed(2)}%</b></div><div><small>Up days</small><b>${q.up_days_pct}%</b></div></div>
        ${sp ? `<p class="ph-note-s">SPY: ${sp.median_size_pct.toFixed(2)}% vs ${sp.normal_day_size_pct.toFixed(2)}% on a normal day, up ${sp.up_days_pct}% of the time.</p>` : ""}` : ""}
      ${(N.plans || []).length ? `<h4>The plan <span class="ph-src-i">judgment</span></h4>${N.plans.map((p) => `<div class="ph-case"><b class="${cls[p.case] || ""}">${h(CASE[p.case] || p.case)}</b><p class="ph-if">${h(p.if)}</p><p>${h(p.then)}</p></div>`).join("")}`
        : `<p class="ph-note-s">The plan for each outcome is written the evening before the release.</p>`}
      ${(N.lines || []).length ? `<details class="ph-why-more"><summary>The reasoning</summary>${N.lines.map((l) => `<p><span class="ph-lab ph-${h(l.label)}">${l.label === "history" ? "History" : "Judgment"}</span>${h(l.text)}</p>`).join("")}</details>` : ""}
      ${(Dd.limits || []).length ? `<h4>Limit</h4><p>${h(Dd.limits[0])}</p>` : ""}`);
  }

  /* ---------------------------------------------------------------- search */
  function wireSearch() {
    const q = $("#ph-q"), dd = $("#ph-dd"); if (!q) return;
    const all = D.stocks.slice().sort((a, b) => (b.main - a.main) || (D.main.indexOf(a.t) - D.main.indexOf(b.t)) || a.t.localeCompare(b.t));
    const render = () => {
      const v = q.value.trim().toUpperCase();
      const list = all.filter((s) => !v || s.t.startsWith(v) || s.name.toUpperCase().includes(v));
      dd.innerHTML = (v ? "" : `<div class="ph-dh">Main 12</div>`) + (list.length ? list.map((s) => `<button type="button" role="option" data-pick="${h(s.t)}"><b>${h(s.t)}</b><span class="nm">${h(s.name)}</span>${pillHtml(s.pill)}</button>`).join("")
        : `<div class="ph-dh">No covered stock matches. Try a ticker like NVDA.</div>`);
      dd.hidden = false; q.setAttribute("aria-expanded", "true");
    };
    q.addEventListener("focus", render); q.addEventListener("input", render);
    q.addEventListener("blur", () => setTimeout(() => { dd.hidden = true; q.setAttribute("aria-expanded", "false"); }, 180));
    dd.addEventListener("pointerdown", (e) => e.preventDefault());
    dd.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pick]"); if (!b) return;
      const t = b.dataset.pick; dd.hidden = true; q.value = ""; q.blur();
      if (!D.stocks.find((s) => s.t === t).main && filter === "main") { filter = "all"; render0("stocks"); }
      const r = screen.querySelector(`.ph-row[data-t="${CSS.escape(t)}"]`);
      if (r) { toggle(r, true); setTimeout(() => r.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }), 80); }
    });
  }

  /* ---------------------------------------------------------------- wiring */
  function toggle(r, force) {
    const o = force != null ? force : !r.classList.contains("open");
    r.classList.toggle("open", o); r.querySelector(".ph-rh").setAttribute("aria-expanded", String(o));
  }
  screen.addEventListener("click", (e) => {
    const more = e.target.closest(".ph-more"); if (more) { noteSheet(more.dataset.note); return; }
    const ev = e.target.closest("[data-ev]");
    if (ev) { const x = D.events[+ev.dataset.ev]; if (x.release) releaseSheet(x); else if (x.ticker) noteSheet(x.ticker); return; }
    const seg = e.target.closest(".ph-seg button"); if (seg) { filter = seg.dataset.f; render0("stocks"); return; }
    if (e.target.closest("#ph-full")) { try { localStorage.setItem("fr-layout", "web"); } catch (err) {} location.reload(); return; }
    const rh = e.target.closest(".ph-rh"); if (rh) toggle(rh.parentNode);
  });
  const tabOf = () => { const v = (location.hash.replace("#/", "") || "today").split("?")[0]; return VIEWS[v] ? v : "today"; };
  function render0(tab) {
    screen.innerHTML = VIEWS[tab]();
    document.querySelectorAll(".ph-tabs a").forEach((a) => { if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (tab === "stocks") wireSearch();
  }
  function route() { if (!D) return; closeSheet(); render0(tabOf()); screen.scrollTop = 0; window.scrollTo(0, 0); }
  window.addEventListener("hashchange", route);

  async function load() {
    screen.innerHTML = head("Today") + `<div class="ph-group ph-loading" aria-busy="true"><div></div><div></div><div></div></div>`;
    try {
      D = await api("/api/phone");
      route();
      try {
        const f = await api("/api/freshness");
        if (f && f.late && f.text) screen.insertAdjacentHTML("afterbegin", `<p class="ph-late" role="status">${h(f.text)}</p>`);
      } catch (e) { /* optional */ }
    } catch (e) { screen.innerHTML = head("Today") + `<p class="ph-empty">Could not load the research data: ${h(e.message)}. Pull down or reopen in a minute.</p>`; }
  }
  load();
  setInterval(() => { if (!document.hidden && !root.classList.contains("sheet-open")) load(); }, 10 * 60 * 1000);
})();
