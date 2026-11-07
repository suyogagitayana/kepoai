"use strict";

// Official public endpoints only. No keys, cookies, proxies, or model requests.
window.ModelHealth = (() => {
  const ENDPOINTS = Object.freeze({
    openai: "https://status.openai.com/api/v2/summary.json",
    claude: "https://status.claude.com/api/v2/summary.json",
    gemini: "https://www.google.com/appsstatus/dashboard/incidents.json",
  });
  const PAGE_URLS = Object.freeze({
    openai: "https://status.openai.com/",
    claude: "https://status.claude.com/",
    gemini: "https://www.google.com/appsstatus/dashboard/",
  });
  const SCOPES = Object.freeze({
    openai:
      "OpenAI’s published aggregate and service components. Individual models and accounts may differ.",
    claude:
      "Claude web, API, Code and other services published on Claude’s status page.",
    gemini:
      "Gemini in Google Workspace only. This feed does not establish Gemini API or AI Studio availability.",
  });
  const INDICATORS = Object.freeze({
    none: "operational",
    minor: "degraded",
    major: "outage",
    critical: "outage",
    maintenance: "degraded",
  });
  const COMPONENTS = Object.freeze({
    operational: "operational",
    degraded_performance: "degraded",
    partial_outage: "degraded",
    major_outage: "outage",
    under_maintenance: "maintenance",
  });
  const validDate = (value) =>
    typeof value === "string" && Number.isFinite(Date.parse(value));
  const validText = (value) =>
    typeof value === "string" && value.length > 0 && value.length < 5000;
  const label = (value) =>
    ({
      operational: "Operational",
      degraded: "Degraded",
      outage: "Outage",
      maintenance: "Maintenance",
      unknown: "Unknown",
      notice: "Service notice",
      clear: "No incidents reported",
    })[value] || "Unknown";

  function parseStatuspage(body, id, checkedAt) {
    if (
      !["openai", "claude"].includes(id) ||
      !body ||
      !body.status ||
      !Object.hasOwn(INDICATORS, body.status.indicator) ||
      !Array.isArray(body.components) ||
      body.components.length > 500
    )
      throw new Error("Unrecognized official status response");
    if (
      body.components.some(
        (c) => !c || !validText(c.name) || typeof c.status !== "string",
      )
    )
      throw new Error("Invalid component response");
    if (body.incidents !== undefined && !Array.isArray(body.incidents))
      throw new Error("Invalid incident response");
    const incidents = (body.incidents || [])
      .filter((i) => i && !["resolved", "postmortem"].includes(i.status))
      .slice(0, 20)
      .map((i) => ({
        title: validText(i.name) ? i.name.slice(0, 500) : "Active incident",
        url:
          typeof i.id === "string" && /^[a-zA-Z0-9_-]+$/.test(i.id)
            ? PAGE_URLS[id] + "incidents/" + i.id
            : PAGE_URLS[id],
      }));
    return {
      status: INDICATORS[body.status.indicator],
      checkedAt,
      scope: SCOPES[id],
      url: PAGE_URLS[id],
      providerUpdatedAt: validDate(body.page?.updated_at)
        ? body.page.updated_at
        : null,
      components: body.components
        .filter((c) => !c.group)
        .map((c) => ({
          name: c.name.slice(0, 200),
          status: Object.hasOwn(COMPONENTS, c.status)
            ? COMPONENTS[c.status]
            : "unknown",
        })),
      incidents,
      incidentsKnown: Array.isArray(body.incidents),
    };
  }

  function parseGoogle(body, checkedAt) {
    // Gemini product ID comes from Google's official JSON Product Catalog.
    const geminiId = "npdyhgECDJ6tB66MxXyo";
    if (
      !Array.isArray(body) ||
      body.length > 10000 ||
      body.some(
        (i) =>
          !i ||
          !validDate(i.begin) ||
          (i.end && !validDate(i.end)) ||
          (typeof i.service_name !== "string" &&
            !Array.isArray(i.affected_products)),
      )
    )
      throw new Error("Unrecognized Google incident response");
    const matches = body.filter(
      (i) =>
        i.service_key === geminiId ||
        i.service_name === "Gemini" ||
        (Array.isArray(i.affected_products) ? i.affected_products : []).some(
          (p) => p && (p.id === geminiId || p.title === "Gemini"),
        ),
    );
    const active = matches.filter(
      (i) =>
        !i.end &&
        Date.parse(i.begin) <= Date.parse(checkedAt) &&
        i.most_recent_update?.status !== "AVAILABLE",
    );
    const impact = active.map(
      (i) => i.most_recent_update?.status || i.status_impact,
    );
    const status = impact.includes("SERVICE_OUTAGE")
      ? "outage"
      : impact.includes("SERVICE_DISRUPTION")
        ? "degraded"
        : active.length
          ? "notice"
          : "clear";
    return {
      status,
      checkedAt,
      scope: SCOPES.gemini,
      url: PAGE_URLS.gemini,
      providerUpdatedAt: null,
      components: [
        { name: "Gemini in Workspace", status },
        { name: "Gemini API / AI Studio", status: "unknown" },
      ],
      incidentsKnown: true,
      incidents: active.slice(0, 20).map((i) => ({
        title: validText(i.external_desc)
          ? i.external_desc
              .replace(/\*\*/g, "")
              .split("\n")
              .filter((s) => s && !/^summary:?$/i.test(s))[0]
              .slice(0, 400)
          : "Gemini Workspace incident",
        url:
          typeof i.id === "string" && /^[a-zA-Z0-9_-]+$/.test(i.id)
            ? PAGE_URLS.gemini + "incidents/" + i.id
            : PAGE_URLS.gemini,
      })),
    };
  }

  async function fetchReport(id) {
    if (!Object.hasOwn(ENDPOINTS, id)) throw new Error("Unknown provider");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(ENDPOINTS[id], {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error("Official feed returned HTTP " + response.status);
      const body = await response.json();
      const checkedAt = new Date().toISOString();
      return id === "gemini"
        ? parseGoogle(body, checkedAt)
        : parseStatuspage(body, id, checkedAt);
    } finally {
      clearTimeout(timeout);
    }
  }
  return Object.freeze({
    ENDPOINTS,
    PAGE_URLS,
    SCOPES,
    label,
    parseStatuspage,
    parseGoogle,
    fetchReport,
    INTERVAL_MS: 60000,
  });
})();
