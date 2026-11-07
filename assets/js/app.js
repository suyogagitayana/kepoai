"use strict";

const $ = (selector) => document.querySelector(selector);
const IDS = ["openai", "claude", "gemini"];
const BRANDS = window.MODEL_WATCH_BRANDS;
const LABELS = {
  overview: "Overview",
  updates: "Updates",
  status: "Service health",
  resets: "Reset tracker",
  sources: "Sources & data",
};
const TITLES = {
  overview: "Overview",
  updates: "Updates",
  status: "Service health",
  resets: "Reset tracker",
  sources: "Sources & coverage",
};
const DESCRIPTIONS = {
  overview: "Recent announcements and live status from official feeds.",
  updates: "Company announcements and release notes. Newest first.",
  status: "Live reports from official status pages.",
  resets: "Personal reset reminders and archived Codex announcements.",
  sources: "Sources, coverage and privacy.",
};
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const E = escapeHTML;
const safeURL = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
};
const link = (url, label, cls = "text-link") =>
  `<a class="${cls}" href="${E(url)}" target="_blank" rel="noopener noreferrer">${E(label)} ↗</a>`;
const dateTime = (value) =>
  new Intl.DateTimeFormat(window.KepoI18n?.locale() || "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
const shortDate = (value) =>
  new Intl.DateTimeFormat(window.KepoI18n?.locale() || "en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));

function validateData(d) {
  const fail = () => {
    throw new Error(
      "Invalid site data. Check companies, dates, source URLs and required fields.",
    );
  };
  const str = (s, max = 1000) =>
    typeof s === "string" && s.length > 0 && s.length <= max;
  const day = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  const iso = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    day(s.slice(0, 10));
  const status = (s) =>
    ["operational", "degraded", "outage", "unknown"].includes(s);
  if (
    !d ||
    d.version !== 1 ||
    !iso(d.updatedAt) ||
    !Array.isArray(d.providers) ||
    d.providers.length !== 3 ||
    !Array.isArray(d.updates) ||
    d.updates.length > 2000 ||
    !Array.isArray(d.resets) ||
    d.resets.length > 1000
  )
    fail();
  const seen = new Set();
  d.providers.forEach((p) => {
    if (
      !p ||
      !IDS.includes(p.id) ||
      seen.has(p.id) ||
      !str(p.name, 50) ||
      !str(p.subtitle, 100) ||
      !status(p.status) ||
      !iso(p.checkedAt) ||
      !safeURL(p.statusUrl) ||
      !str(p.scope) ||
      !str(p.uptimePeriod, 50) ||
      !Array.isArray(p.history) ||
      p.history.length > 4000
    )
      fail();
    seen.add(p.id);
    if (
      p.uptime !== null &&
      (typeof p.uptime !== "number" ||
        !Number.isFinite(p.uptime) ||
        p.uptime < 0 ||
        p.uptime > 100 ||
        !safeURL(p.uptimeSource))
    )
      fail();
    const dates = new Set();
    p.history.forEach((h) => {
      if (
        !h ||
        !day(h.date) ||
        !status(h.status) ||
        dates.has(h.date) ||
        h.date > p.checkedAt.slice(0, 10)
      )
        fail();
      dates.add(h.date);
    });
  });
  const seenUpdates = new Set();
  d.updates.forEach((u) => {
    if (
      !u ||
      !str(u.id, 100) ||
      seenUpdates.has(u.id) ||
      !IDS.includes(u.provider) ||
      !day(u.date) ||
      !str(u.category, 80) ||
      !str(u.title, 300) ||
      !str(u.summary, 1500) ||
      !str(u.source, 100) ||
      !safeURL(u.url)
    )
      fail();
    seenUpdates.add(u.id);
  });
  d.resets.forEach((r) => {
    if (
      !r ||
      !iso(r.date) ||
      !str(r.type, 80) ||
      !str(r.title, 300) ||
      !str(r.source, 100) ||
      !str(r.note, 1500) ||
      !safeURL(r.url) ||
      !safeURL(r.announcementUrl)
    )
      fail();
  });
  if (d.contentMeta !== undefined) {
    const meta = d.contentMeta;
    if (
      !meta ||
      meta.version !== 1 ||
      !iso(meta.generatedAt) ||
      meta.intervalMinutes !== 60 ||
      !Array.isArray(meta.sources) ||
      meta.sources.length !== 4
    )
      fail();
    const sourceIds = new Set();
    for (const s of meta.sources) {
      if (
        !s ||
        !["openai", "claude", "gemini", "resets"].includes(s.id) ||
        sourceIds.has(s.id) ||
        !str(s.label, 100) ||
        !safeURL(s.url) ||
        !["official", "archive"].includes(s.kind) ||
        !["ok", "error"].includes(s.status) ||
        !iso(s.checkedAt) ||
        (s.lastSuccessAt !== null && !iso(s.lastSuccessAt)) ||
        !Number.isInteger(s.records) ||
        s.records < 0 ||
        s.records > 2000
      )
        fail();
      sourceIds.add(s.id);
    }
  }
  return d;
}

let data = validateData(window.MODEL_WATCH_DATA);
const timers = {};
let archiveDays = [
  ...new Set(data.resets.map((r) => r.date.slice(0, 10))),
].sort();
let selectedResetDay = archiveDays.at(-1) || data.updatedAt.slice(0, 10);
let selectedResetMonth = selectedResetDay.slice(0, 7);
let resetCalendarTouched = false;
let contentRunning = false;
let contentPhase = "idle";
let nextContentAt = 0;
let contentLastAttempt = 0;
let providerFilter = "all";
let categoryFilter = "all";
let query = "";
let releaseHistoryOpen = false;
let toastTimeout;
const healthState = Object.fromEntries(
  IDS.map((id) => [id, { phase: "idle", report: null, error: null }]),
);
let healthBusy = false;
let nextHealthAt = 0;
let lastHealthStarted = 0;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(
    () => $("#toast").classList.remove("visible"),
    3500,
  );
}
function route() {
  const hash = location.hash.slice(1);
  return Object.hasOwn(LABELS, hash) ? hash : "overview";
}
function logo(id, tiny = false) {
  return `<img class="brand-mark ${tiny ? "small-mark" : ""}" src="${E(BRANDS[id].image)}" alt="" aria-hidden="true" width="${tiny ? 16 : 20}" height="${tiny ? 16 : 20}" decoding="async">`;
}
function providerById(id) {
  return data.providers.find((p) => p.id === id);
}

function statusCards() {
  return `<div class="service-table-wrap" id="health-live"><table class="service-table"><caption class="sr-only">Official service status, coverage, and last successful check</caption><thead><tr><th scope="col">Provider / coverage</th><th scope="col">Status</th><th scope="col" class="checked-column">Checked (UTC)</th><th scope="col" class="source-column">Source</th></tr></thead><tbody>${data.providers
    .map((p) => {
      const state = healthState[p.id];
      const report = state.report;
      const stale =
        report &&
        (state.phase === "error" ||
          Date.now() - Date.parse(report.checkedAt) > 120000);
      const kind = stale ? "unknown" : report?.status || "unknown";
      const headline = report
        ? `${stale ? "Last known: " : ""}${ModelHealth.label(report.status)}`
        : state.phase === "loading"
          ? "Checking…"
          : state.phase === "error"
            ? "Could not check"
            : "Not checked";
      const time = report ? `${report.checkedAt.slice(11, 19)}` : "—";
      return `<tr data-health-provider="${p.id}"><th scope="row"><span class="provider-name">${logo(p.id)}${E(p.name)}</span><span class="provider-coverage">${p.id === "gemini" ? "Workspace only · API not covered" : "Published services"}</span></th><td><div class="service-status"><span class="status-dot ${kind}"></span><span>${E(headline)}</span>${state.phase === "loading" && report ? '<span class="checking-label">refreshing</span>' : ""}</div>${state.phase === "error" ? '<div class="fetch-error">Request failed · retry with Refresh</div>' : ""}<span class="mobile-check">Checked ${E(time)}${report ? " UTC" : ""}</span></td><td class="checked-column"><time datetime="${E(report?.checkedAt || "")}">${E(time)}</time>${stale ? '<span class="stale-label">not current</span>' : ""}</td><td class="source-column">${link(ModelHealth.PAGE_URLS[p.id], "Status page")}${p.id === "gemini" ? link("https://aistudio.google.com/status", "API / AI Studio") : ""}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

function healthControls() {
  return `<div class="health-controls"><span data-next-health>Auto-refreshes every minute</span><button class="button refresh-button" data-refresh-health ${healthBusy ? "disabled" : ""}>${healthBusy ? "Checking…" : "Refresh reports ↻"}</button></div>`;
}

function healthDetails() {
  return `<div id="health-details" class="health-details">${data.providers
    .map((p) => {
      const state = healthState[p.id];
      const report = state.report;
      return `<article class="status-detail"><div class="detail-label">${E(p.name)}</div><div><p>${E(ModelHealth.SCOPES[p.id])}</p>
      ${report ? `<p>Last checked: ${dateTime(report.checkedAt)}.${state.phase === "error" ? " The latest refresh failed; this is a previous result." : ""}</p>${report.providerUpdatedAt ? `<p>Provider report updated: ${dateTime(report.providerUpdatedAt)}.</p>` : ""}` : "<p>Status unavailable. A failed check does not indicate an outage.</p>"}
      ${report?.incidents.length ? `<ul class="incident-list">${report.incidents.map((i) => `<li>${link(i.url, i.title)}</li>`).join("")}</ul>` : report?.incidentsKnown ? "<p>No active incidents reported in this feed.</p>" : ""}
      <details><summary>Components &amp; uptime coverage</summary>${report?.components.length ? `<div class="detail-components">${report.components.map((c) => `<div><span>${E(c.name)}</span><span>${p.id === "gemini" && c.status === "unknown" ? "Not covered by this feed" : E(ModelHealth.label(c.status))}</span></div>`).join("")}</div>` : ""}<p>Verified historical uptime percentages are not available from these feeds.</p></details>
      ${link(ModelHealth.PAGE_URLS[p.id], "Official status page")}${p.id === "gemini" ? " · " + link("https://aistudio.google.com/status", "Gemini API / AI Studio") : ""}</div></article>`;
    })
    .join("")}</div>`;
}

function updateHealthUI() {
  const cards = $("#health-live");
  if (cards) cards.outerHTML = statusCards();
  const details = $("#health-details");
  if (details) {
    const expanded = [...details.querySelectorAll("details")].map(
      (d) => d.open,
    );
    details.outerHTML = healthDetails();
    $("#health-details")
      .querySelectorAll("details")
      .forEach((d, index) => {
        d.open = expanded[index] || false;
      });
  }
  document.querySelectorAll("[data-refresh-health]").forEach((b) => {
    b.disabled = healthBusy;
    b.textContent = healthBusy ? "Checking…" : "Refresh reports ↻";
  });
  const successes = IDS.filter(
    (id) => healthState[id].report && healthState[id].phase !== "error",
  ).length;
  $("#live-summary").textContent = healthBusy
    ? "Checking official feeds…"
    : `${successes}/3 feeds checked${successes < 3 ? " · retry available" : ""}`;
  tick();
}

async function refreshHealth() {
  if (healthBusy) return;
  healthBusy = true;
  lastHealthStarted = Date.now();
  IDS.forEach((id) => {
    healthState[id].phase = "loading";
  });
  updateHealthUI();
  await Promise.allSettled(
    IDS.map(async (id) => {
      try {
        const report = await ModelHealth.fetchReport(id);
        healthState[id] = { phase: "ready", report, error: null };
      } catch (error) {
        healthState[id].phase = "error";
        healthState[id].error =
          error.name === "AbortError" ? "timeout" : "request failed";
      }
      updateHealthUI();
    }),
  );
  healthBusy = false;
  nextHealthAt = Date.now() + ModelHealth.INTERVAL_MS;
  updateHealthUI();
}

function filters() {
  return `<div class="filters"><div class="filter-bar" role="group" aria-label="Filter by company"><button class="filter-button ${providerFilter === "all" ? "active" : ""}" data-filter="all" aria-pressed="${providerFilter === "all"}">All companies</button>${data.providers.map((p) => `<button class="filter-button ${providerFilter === p.id ? "active" : ""}" data-filter="${p.id}" aria-pressed="${providerFilter === p.id}">${logo(p.id, true)}${E(p.name)}</button>`).join("")}</div><div class="filter-tools"><label class="search-box"><span aria-hidden="true">⌕</span><input type="search" id="search" aria-label="Search updates" placeholder="Search updates…" value="${E(query)}"><kbd aria-hidden="true">/</kbd></label><select id="category" aria-label="Filter by category"><option value="all">All update types</option>${[
    ...new Set(data.updates.map((u) => u.category)),
  ]
    .sort()
    .map(
      (c) =>
        `<option value="${E(c)}" ${categoryFilter === c ? "selected" : ""}>${E(c)}</option>`,
    )
    .join("")}</select></div></div>`;
}

function filteredUpdates() {
  return data.updates
    .filter(
      (u) =>
        (providerFilter === "all" || u.provider === providerFilter) &&
        (categoryFilter === "all" || u.category === categoryFilter) &&
        `${u.title} ${u.summary} ${u.category} ${u.source} ${providerById(u.provider).name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}
function updateList() {
  const items = filteredUpdates();
  const shown = route() === "overview" ? items.slice(0, 5) : items;
  return shown.length
    ? `<div class="updates-table-wrap"><table class="updates-table"><caption class="sr-only">Company updates, newest first</caption><thead><tr><th scope="col" class="entry-date-column">Date ↓</th><th scope="col" class="entry-company-column">Company</th><th scope="col">Update</th></tr></thead><tbody>${shown.map((u) => `<tr class="update-row"><td class="entry-date-column"><time datetime="${u.date}" title="${u.date}">${shortDate(u.date)}</time></td><td class="entry-company-column"><span class="entry-company">${logo(u.provider, true)}${E(providerById(u.provider).name)}</span><span class="entry-category">${E(u.category)}</span><time class="mobile-date" datetime="${u.date}">${shortDate(u.date)}</time></td><td><h3>${link(u.url, u.title, "entry-title")}</h3>${/^(?:Official (?:company update|model launch announcement|release notes update)\.)(?: Open the source for details\.)?$/.test(u.summary.trim()) ? "" : `<p>${E(u.summary)}</p>`}</td></tr>`).join("")}</tbody></table></div><div class="feed-bottom"><span aria-live="polite">${shown.length} of ${items.length} updates</span></div>`
    : `<div class="empty"><h3>No matching updates</h3><p>Try a different company, category or search term.</p><button class="button" data-clear-filters>Clear filters</button></div>`;
}

function releaseEntries() {
  const launches = data.updates
    .filter((u) => u.category === "Model release")
    .sort((a, b) => a.date.localeCompare(b.date));
  return IDS.flatMap((id) =>
    launches.filter((u) => u.provider === id).slice(-3),
  );
}
function releaseLabel(title) {
  const text = title
    .replace(/^Introducing /, "")
    .replace(
      /\s+(?:reaches\s+)?(?:general availability|generally available).*$/i,
      "",
    )
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/ and Gemini \d+(?:\.\d+)? /g, " + ")
    .trim();
  return text;
}
function releaseTimeline() {
  const entries = releaseEntries();
  if (!entries.length) return "";
  const hasHistory = IDS.some(
    (id) => entries.filter((u) => u.provider === id).length > 1,
  );
  return `<section class="release-section" aria-labelledby="release-heading"><div class="section-heading"><div class="release-heading"><h2 id="release-heading">Releases</h2><span class="visual-caption">Latest per company${releaseHistoryOpen ? " · newest first" : ""}</span></div>${hasHistory ? `<button class="button release-toggle" data-toggle-releases aria-expanded="${releaseHistoryOpen}" aria-controls="release-strip">${releaseHistoryOpen ? "Hide earlier releases" : "Show earlier releases"}</button>` : ""}</div><div class="release-strip" id="release-strip">${IDS.map(
    (id) => {
      const launches = entries
        .filter((u) => u.provider === id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const shown = releaseHistoryOpen ? launches : launches.slice(0, 1);
      return `<section class="release-column" aria-labelledby="release-company-${id}"><h3 id="release-company-${id}">${logo(id, true)}${E(providerById(id).name)}</h3>${shown.length ? `<ol class="release-list">${shown.map((u) => `<li><time datetime="${u.date}" title="${u.date}">${shortDate(u.date)}</time><a href="${E(u.url)}" target="_blank" rel="noopener noreferrer" title="${E(u.title + " · " + u.date)}" aria-label="${E(providerById(id).name + ": " + u.title + ", " + u.date + ". " + (window.KepoI18n?.text("Open official announcement") || "Open official announcement"))}">${E(releaseLabel(u.title))}<span class="release-arrow" aria-hidden="true">↗</span></a></li>`).join("")}</ol>` : '<p class="release-empty">No model launches in this feed.</p>'}</section>`;
    },
  ).join("")}</div></section>`;
}

function resetMonths() {
  if (!archiveDays.length) return [selectedResetMonth];
  const first = archiveDays[0].slice(0, 7),
    last = archiveDays.at(-1).slice(0, 7),
    months = [];
  const date = new Date(first + "-01T00:00:00Z");
  while (date.toISOString().slice(0, 7) <= last) {
    months.push(date.toISOString().slice(0, 7));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return months;
}
function resetRecordsForDay(day) {
  return data.resets
    .filter((r) => r.date.slice(0, 10) === day)
    .sort((a, b) => b.date.localeCompare(a.date));
}
function resetKind(record) {
  const type = record.type.toLowerCase();
  return type.includes("global") && type.includes("banked")
    ? "combined"
    : type.includes("global")
      ? "global"
      : type.includes("banked")
        ? "banked"
        : "other";
}
function calendarDays(month) {
  const first = new Date(month + "-01T00:00:00Z");
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !Number.isFinite(first.getTime()) ||
    first.toISOString().slice(0, 7) !== month
  )
    throw new Error("Invalid calendar month");
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(first);
    date.setUTCDate(1 - offset + i);
    const day = date.toISOString().slice(0, 10);
    return {
      date: day,
      number: date.getUTCDate(),
      inMonth: day.slice(0, 7) === month,
      records: resetRecordsForDay(day),
    };
  });
}
function resetRecordList(records) {
  return records
    .map(
      (r) =>
        `<article class="reset-record"><time datetime="${E(r.date)}">${dateTime(r.date)}</time><span class="reset-type ${resetKind(r)}">${E(r.type)}</span><h3 translate="no">${E(r.title)}</h3><p translate="no">${E(r.note)}</p>${link(r.url, r.source)}${link(r.announcementUrl, "Original announcement")}</article>`,
    )
    .join("");
}
function resetCalendar() {
  const months = resetMonths(),
    index = months.indexOf(selectedResetMonth),
    days = calendarDays(selectedResetMonth),
    records = resetRecordsForDay(selectedResetDay);
  const monthLabel = new Intl.DateTimeFormat(
    window.KepoI18n?.locale() || "en-GB",
    { month: "long", year: "numeric", timeZone: "UTC" },
  ).format(new Date(selectedResetMonth + "-01T00:00:00Z"));
  const fullDate = (day) =>
    new Intl.DateTimeFormat(window.KepoI18n?.locale() || "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(day + "T00:00:00Z"));
  const today = new Date().toISOString().slice(0, 10);
  const rows = Array.from(
    { length: 6 },
    (_, row) =>
      `<tr>${days
        .slice(row * 7, row * 7 + 7)
        .map((day) =>
          day.inMonth
            ? `<td><button class="calendar-day ${day.date === selectedResetDay ? "selected" : ""} ${day.records.length ? "has-records" : ""}" data-calendar-day="${day.date}" aria-pressed="${day.date === selectedResetDay}" ${day.date === today ? 'aria-current="date"' : ""} tabindex="${day.date === selectedResetDay ? "0" : "-1"}" aria-label="${E(fullDate(day.date) + ", " + day.records.length + " archived announcement" + (day.records.length === 1 ? "" : "s"))}"><span>${day.number}</span><span class="calendar-dots" aria-hidden="true">${day.records
                .slice(0, 3)
                .map((r) => `<i class="record-dot ${resetKind(r)}"></i>`)
                .join("")}</span></button></td>`
            : '<td class="calendar-outside" aria-hidden="true"></td>',
        )
        .join("")}</tr>`,
  ).join("");
  return `<section id="reset-calendar" aria-labelledby="reset-calendar-title"><div class="section-heading"><h2 id="reset-calendar-title">Codex reset calendar</h2><span class="visual-caption">${data.resets.length} archived announcements</span></div><div class="reset-calendar-layout"><div class="calendar-panel"><div class="calendar-toolbar"><button class="button calendar-nav" data-calendar-step="-1" aria-label="Previous archive month" ${index <= 0 ? "disabled" : ""}>‹</button><h3>${E(monthLabel)}</h3><button class="button calendar-nav" data-calendar-step="1" aria-label="Next archive month" ${index >= months.length - 1 ? "disabled" : ""}>›</button></div><table class="calendar-table"><caption class="sr-only">Archived Codex reset announcements in ${E(monthLabel)}. Arrow keys move between dates; Home and End move within the week.</caption><thead><tr>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<th scope="col">${d}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><div class="calendar-legend"><span><i class="record-dot banked"></i>Banked reset</span><span><i class="record-dot global"></i>Global reset</span><span><i class="record-dot combined"></i>Both</span></div><p class="calendar-note">Dates in UTC. Blank days have no archived record.</p></div><div class="calendar-selection" aria-live="polite"><div class="calendar-selection-heading"><h3>${E(fullDate(selectedResetDay))}</h3><span>${records.length} announcement${records.length === 1 ? "" : "s"}</span></div>${records.length ? resetRecordList(records) : '<div class="calendar-empty"><span class="empty-calendar-icon" aria-hidden="true">□</span><h3>No archived announcement</h3><p>This date has no entry in the selected archive.</p></div>'}</div></div><details class="all-reset-records"><summary>All archived announcements (${data.resets.length})</summary><div class="panel">${resetRecordList([...data.resets].sort((a, b) => b.date.localeCompare(a.date))) || '<p class="small">No archived records.</p>'}</div></details></section>`;
}
function refreshCalendar(focusSelector) {
  const container = $("#reset-calendar");
  if (!container) return;
  container.outerHTML = resetCalendar();
  const target = $(focusSelector);
  const selected = $('[data-calendar-day="' + selectedResetDay + '"]');
  if (target && !target.disabled) target.focus({ preventScroll: true });
  else selected?.focus({ preventScroll: true });
}

function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 86400)}d ${String(Math.floor(s / 3600) % 24).padStart(2, "0")}h ${String(Math.floor(s / 60) % 60).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
}
function countdown(at) {
  return Date.parse(at) <= Date.now()
    ? "Reset time reached"
    : duration(Date.parse(at) - Date.now());
}
function overview() {
  return `<section class="service-section" aria-labelledby="health-title"><div class="section-heading"><h2 id="health-title">Service health</h2>${healthControls()}</div>${statusCards()}<div class="health-footnote"><a class="text-link" href="#status">Components &amp; incidents ↗</a></div></section>${releaseTimeline()}<section aria-labelledby="updates-title"><div class="section-heading"><h2 id="updates-title">Recent updates <span class="count-label">${data.updates.length}</span></h2><a class="text-link" href="#updates">View all updates ↗</a></div>${filters()}<div id="update-list">${updateList()}</div></section>`;
}

function statusView() {
  return `<div class="section-heading">${healthControls()}</div>${statusCards()}<div class="health-footnote"><span>Google’s feed covers Gemini in Workspace. Use AI Studio’s official page for Gemini API status.</span></div>${healthDetails()}`;
}

function resetsView() {
  return `<p class="view-intro">Historical announcements only; future reset dates are unknown.</p>${resetCalendar()}<p class="small">This is a partial archive. Eligibility and original social posts have not been independently verified.</p><section class="personal-reminders"><div class="section-heading"><h2>Your reminders</h2><span class="subtle">Device timezone · ${E(Intl.DateTimeFormat().resolvedOptions().timeZone)}</span></div><div class="timer-grid">${data.providers.map((p) => `<article class="panel timer-card"><h3>${logo(p.id)}${E(p.name)}</h3><div class="timer-number" ${timers[p.id] ? `data-countdown="${p.id}"` : ""}>${timers[p.id] ? countdown(timers[p.id].at) : "No timer set"}</div>${timers[p.id] ? `<p ${timers[p.id].note ? 'translate="no"' : ""}>${E(timers[p.id].note || "Personal reset reminder")}</p>` : ""}${timers[p.id] ? `<p>${E(new Date(timers[p.id].at).toLocaleString(window.KepoI18n?.locale() || "en-GB"))}</p>` : ""}<div class="timer-actions"><button class="button" data-timer="${p.id}">${timers[p.id] ? "Edit timer" : "＋ Set timer"}</button>${timers[p.id] ? `<button class="timer-remove" data-remove-timer="${p.id}">Remove</button>` : ""}</div></article>`).join("")}</div><p class="small">Reminders clear when you reload or close this page.</p></section>`;
}
function sourcesView() {
  return `<div class="source-grid"><article class="source-card"><h3>News &amp; releases</h3><p>Checked hourly. Release dates follow the original announcements.</p>${link("https://openai.com/news/", "OpenAI News")}${link("https://www.anthropic.com/news", "Anthropic News")}${link("https://aistudio.google.com/docs/changelog", "Gemini API release notes")}</article><article class="source-card"><h3>Service coverage</h3><p>Provider-reported status, not an independent availability test. Verified historical uptime percentages are unavailable.</p>${IDS.map((id) => link(ModelHealth.PAGE_URLS[id], providerById(id).name + " status")).join("")}<p>Google’s feed covers Gemini in Workspace only. Gemini API and AI Studio are not covered.</p>${link("https://aistudio.google.com/status", "Gemini API / AI Studio status")}</article><article class="source-card"><h3>Reset archive</h3><p>A partial archive from AI IDE List. Original social posts and eligibility have not been independently verified. Dates are UTC; blank days have no archived record.</p>${link("https://aiidelist.com/codex-reset", "AI IDE List reset archive")}</article><article class="source-card"><h3>Privacy</h3><p>No analytics or visitor data storage. Reminders and appearance choices clear on reload. Status providers receive your IP address when your browser requests their reports.</p></article></div>${contentSourcesView()}`;
}

function contentSourcesView() {
  const sources = data.contentMeta?.sources || [];
  return `<section class="content-collection" id="content-source-status"><h3>Source checks</h3>${sources.length ? `<div class="updates-table-wrap"><table class="collection-table"><thead><tr><th>Source</th><th>Checked (UTC)</th><th>Result</th></tr></thead><tbody>${sources.map((s) => `<tr><td>${link(s.url, s.label)}<span class="source-kind">${s.kind === "archive" ? "Third-party archive" : "Official source"}</span></td><td>${dateTime(s.checkedAt)}</td><td><span class="source-result ${s.status === "ok" ? "source-ok" : "source-error"}">${s.status === "ok" ? "Up to date" : "Failed · previous entries retained"}</span>${s.status === "error" ? `<div>Last success: ${s.lastSuccessAt ? dateTime(s.lastSuccessAt) : "Unknown"}</div>` : ""}</td></tr>`).join("")}</tbody></table></div>` : "<p>Source check history is unavailable.</p>"}</section>`;
}
function updateContentUI() {
  $("#content-updated").textContent = dateTime(data.updatedAt);
  const state = $("#content-age");
  const meta = data.contentMeta;
  state.className = "";
  if (contentPhase === "error") {
    state.textContent = "· Refresh failed; showing previous content";
    state.className = "content-warning";
  } else if (contentPhase === "local") {
    state.textContent = "· Local copy; live content updates unavailable";
  } else if (contentRunning) {
    state.textContent = "· Checking…";
  } else if (meta) {
    const ok = meta.sources.filter((s) => s.status === "ok").length;
    const stale = Date.now() - Date.parse(meta.generatedAt) > 3 * 3600000;
    state.textContent = [
      stale ? "Source checks overdue" : "",
      ok < meta.sources.length
        ? "Some sources failed; previous entries retained"
        : "",
    ]
      .filter(Boolean)
      .map((t) => "· " + t)
      .join(" ");
    if (stale || ok < meta.sources.length) state.className = "content-warning";
  } else {
    state.textContent = "· Source check history unavailable";
  }
  document.querySelectorAll("[data-refresh-content]").forEach((b) => {
    b.disabled = contentRunning;
    b.textContent = contentRunning ? "Checking…" : "Refresh content ↻";
  });
  const panel = $("#content-source-status");
  if (panel) panel.outerHTML = contentSourcesView();
}
function applyPublishedContent(next) {
  const changed =
    JSON.stringify([data.updates, data.resets]) !==
    JSON.stringify([next.updates, next.resets]);
  const active = document.activeElement;
  const focusedRelease = active
    ?.closest?.(".release-section a")
    ?.getAttribute("href");
  const focusedReleaseToggle = active?.dataset?.toggleReleases !== undefined;
  const focusedCalendarDay = active?.dataset?.calendarDay;
  const focusedCalendarStep = active?.dataset?.calendarStep;
  const expanded = $(".all-reset-records")?.open || false;
  data = next;
  archiveDays = [
    ...new Set(data.resets.map((r) => r.date.slice(0, 10))),
  ].sort();
  if (!resetCalendarTouched || !resetMonths().includes(selectedResetMonth)) {
    selectedResetDay = archiveDays.at(-1) || data.updatedAt.slice(0, 10);
    selectedResetMonth = selectedResetDay.slice(0, 7);
  }
  $("#update-count").textContent = data.updates.length;
  if (changed) {
    const timeline = $(".release-section");
    if (timeline) timeline.outerHTML = releaseTimeline();
    const category = $("#category");
    if (category) {
      const categories = [
        ...new Set(data.updates.map((u) => u.category)),
      ].sort();
      if (categoryFilter !== "all" && !categories.includes(categoryFilter))
        categoryFilter = "all";
      category.innerHTML =
        '<option value="all">All update types</option>' +
        categories
          .map((c) => `<option value="${E(c)}">${E(c)}</option>`)
          .join("");
      category.value = categoryFilter;
    }
    renderList();
    const count = $("#updates-title .count-label");
    if (count) count.textContent = data.updates.length;
    const calendar = $("#reset-calendar");
    if (calendar) {
      calendar.outerHTML = resetCalendar();
      const all = $(".all-reset-records");
      if (all) all.open = expanded;
    }
    if (focusedReleaseToggle)
      $("[data-toggle-releases]")?.focus({ preventScroll: true });
    if (focusedRelease) {
      [...document.querySelectorAll(".release-section a")]
        .find((a) => a.getAttribute("href") === focusedRelease)
        ?.focus({ preventScroll: true });
    }
    if (focusedCalendarDay) {
      $('[data-calendar-day="' + focusedCalendarDay + '"]')?.focus({
        preventScroll: true,
      });
    } else if (focusedCalendarStep) {
      const button = $('[data-calendar-step="' + focusedCalendarStep + '"]');
      if (button && !button.disabled) button.focus({ preventScroll: true });
    }
  }
}
async function refreshContent() {
  if (contentRunning) return;
  if (!["http:", "https:"].includes(location.protocol)) {
    contentPhase = "local";
    updateContentUI();
    return;
  }
  contentRunning = true;
  contentLastAttempt = Date.now();
  updateContentUI();
  try {
    const next = validateData(await ModelContent.fetchData(location.href));
    if (
      Date.parse(next.contentMeta?.generatedAt || next.updatedAt) <
      Date.parse(data.contentMeta?.generatedAt || data.updatedAt)
    )
      throw new Error("Older published feed");
    applyPublishedContent(next);
    contentPhase = "ready";
  } catch (error) {
    contentPhase = "error";
  } finally {
    contentRunning = false;
    nextContentAt = Date.now() + ModelContent.INTERVAL_MS;
    updateContentUI();
  }
}

function render() {
  const current = route();
  document.title = `${LABELS[current]} — kepoAI`;
  $("#page-label").textContent = LABELS[current];
  $("#page-title").textContent = TITLES[current];
  $("#page-description").textContent = DESCRIPTIONS[current];
  $("#update-count").textContent = data.updates.length;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === current);
    if (a.dataset.nav === current) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("#view").innerHTML =
    current === "overview"
      ? overview()
      : current === "status"
        ? statusView()
        : current === "resets"
          ? resetsView()
          : current === "sources"
            ? sourcesView()
            : `<section class="full-feed">${releaseTimeline()}${filters()}<div id="update-list">${updateList()}</div></section>`;
  updateHealthUI();
  updateContentUI();
}
function renderList() {
  if ($("#update-list")) $("#update-list").innerHTML = updateList();
}
function tick() {
  document.querySelectorAll("[data-next-health]").forEach((el) => {
    el.textContent = healthBusy ? "Checking…" : "Auto-refreshes every minute";
  });
  document.querySelectorAll("[data-elapsed]").forEach((el) => {
    const time = Date.parse(el.dataset.elapsed);
    el.textContent =
      time > Date.now()
        ? "Announcement date is in the future"
        : duration(Date.now() - time);
  });
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    const timer = timers[el.dataset.countdown];
    if (timer) el.textContent = countdown(timer.at);
  });
}
function openTimer(id) {
  $("#timer-provider").value = id;
  populateTimer(id);
  $("#timer-timezone").textContent =
    `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. This timer does not read or change your account limits.`;
  $("#timer-dialog").showModal();
}
function populateTimer(id) {
  const t = timers[id];
  const d = t ? new Date(t.at) : new Date(Date.now() + 3600000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  $("#timer-date").value = local;
  $("#timer-date").setCustomValidity("");
  $("#timer-note").value = t ? t.note : "";
}

function setupAppearance() {
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  let manualChoice = false;
  const followSystem = () => {
    if (!manualChoice)
      document.body.classList.toggle("dark", preference.matches);
  };
  followSystem();
  preference.addEventListener("change", followSystem);
  $("#theme-toggle").addEventListener("click", () => {
    manualChoice = true;
    document.body.classList.toggle("dark");
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button,[data-close]");
  if (!button) return;
  if (button.dataset.toggleReleases !== undefined) {
    releaseHistoryOpen = !releaseHistoryOpen;
    const section = $(".release-section");
    if (section) section.outerHTML = releaseTimeline();
    $("[data-toggle-releases]")?.focus({ preventScroll: true });
    return;
  }
  if (button.dataset.calendarDay) {
    resetCalendarTouched = true;
    selectedResetDay = button.dataset.calendarDay;
    refreshCalendar('[data-calendar-day="' + selectedResetDay + '"]');
    return;
  }
  if (button.dataset.calendarStep) {
    resetCalendarTouched = true;
    const months = resetMonths();
    const next =
      months.indexOf(selectedResetMonth) + Number(button.dataset.calendarStep);
    if (next >= 0 && next < months.length) {
      selectedResetMonth = months[next];
      selectedResetDay =
        archiveDays.filter((d) => d.startsWith(selectedResetMonth)).at(-1) ||
        selectedResetMonth + "-01";
      refreshCalendar(
        '[data-calendar-step="' + button.dataset.calendarStep + '"]',
      );
    }
    return;
  }
  if (button.dataset.refreshContent !== undefined) {
    refreshContent();
    return;
  }
  if (button.dataset.refreshHealth !== undefined) {
    refreshHealth();
    return;
  }
  if (button.dataset.close) $("#" + button.dataset.close).close();
  if (button.dataset.filter) {
    providerFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((b) => {
      b.classList.toggle("active", b.dataset.filter === providerFilter);
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.filter === providerFilter),
      );
    });
    renderList();
  }
  if (button.dataset.provider) {
    providerFilter = button.dataset.provider;
    categoryFilter = "all";
    query = "";
    if (route() === "updates") render();
    else location.hash = "updates";
  }
  if (button.dataset.clearFilters !== undefined) {
    providerFilter = "all";
    categoryFilter = "all";
    query = "";
    render();
  }
  if (button.dataset.timer) openTimer(button.dataset.timer);
  if (button.dataset.removeTimer) {
    delete timers[button.dataset.removeTimer];
    render();
    toast("Timer removed.");
  }
});
document.addEventListener("keydown", (event) => {
  const day = event.target.closest("[data-calendar-day]");
  if (!day) return;
  const key = event.key;
  if (
    ![
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ].includes(key)
  )
    return;
  event.preventDefault();
  resetCalendarTouched = true;
  const date = new Date(day.dataset.calendarDay + "T00:00:00Z");
  const weekday = (date.getUTCDay() + 6) % 7;
  const delta = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
    Home: -weekday,
    End: 6 - weekday,
  }[key];
  date.setUTCDate(date.getUTCDate() + delta);
  const next = date.toISOString().slice(0, 10);
  if (!resetMonths().includes(next.slice(0, 7))) return;
  selectedResetDay = next;
  selectedResetMonth = next.slice(0, 7);
  refreshCalendar('[data-calendar-day="' + next + '"]');
});
document.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    query = event.target.value;
    renderList();
  }
  if (event.target.id === "timer-date") event.target.setCustomValidity("");
});
document.addEventListener("change", (event) => {
  if (event.target.id === "category") {
    categoryFilter = event.target.value;
    renderList();
  }
  if (event.target.id === "timer-provider") populateTimer(event.target.value);
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) &&
    !document.querySelector("dialog[open]")
  ) {
    if ($("#search")) {
      event.preventDefault();
      $("#search").focus();
    }
  }
});
$("#timer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const at = new Date($("#timer-date").value);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) {
    $("#timer-date").setCustomValidity(
      window.KepoI18n?.text("Choose a reset time in the future.") ||
        "Choose a reset time in the future.",
    );
    $("#timer-date").reportValidity();
    return;
  }
  timers[$("#timer-provider").value] = {
    at: at.toISOString(),
    note: $("#timer-note").value.trim(),
  };
  $("#timer-dialog").close();
  render();
  toast("Reminder set for this visit. It clears when the page reloads.");
});
function refreshLanguageUI() {
  $("#language").value = window.KepoI18n.language();
  render();
  $("#today").textContent = new Intl.DateTimeFormat(window.KepoI18n.locale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  if ($("#timer-dialog").open)
    $("#timer-timezone").textContent =
      `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. This timer does not read or change your account limits.`;
  $("#timer-date").setCustomValidity("");
  window.KepoI18n.apply();
}
$("#language").value = window.KepoI18n.language();
$("#language").addEventListener("change", (event) => {
  window.KepoI18n.setLanguage(event.target.value);
  refreshLanguageUI();
});
window.addEventListener("languagechange", () => {
  if (window.KepoI18n.useSystemLanguage()) refreshLanguageUI();
});
setupAppearance();
$(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  $("#main").focus();
});
$("#today").textContent = new Intl.DateTimeFormat(
  window.KepoI18n?.locale() || "en-GB",
  { day: "2-digit", month: "short", year: "numeric" },
).format(new Date());
window.addEventListener("hashchange", () => {
  render();
  $("#main").focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
render();
window.KepoI18n?.apply();
setInterval(tick, 1000);
refreshHealth();
setInterval(() => {
  if (!document.hidden && Date.now() >= nextHealthAt) refreshHealth();
}, 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastHealthStarted > 45000)
    refreshHealth();
});
window.addEventListener("online", () => {
  if (!document.hidden) refreshHealth();
});

refreshContent();
setInterval(() => {
  if (
    !document.hidden &&
    ["http:", "https:"].includes(location.protocol) &&
    Date.now() >= nextContentAt
  )
    refreshContent();
}, 5000);
document.addEventListener("visibilitychange", () => {
  if (
    !document.hidden &&
    Date.now() - contentLastAttempt > ModelContent.INTERVAL_MS
  )
    refreshContent();
});
window.addEventListener("online", () => {
  if (!document.hidden) refreshContent();
});
