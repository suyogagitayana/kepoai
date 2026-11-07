const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const load = (name) =>
  fs.readFileSync(path.join(root, "assets/js", name), "utf8");

async function main() {
  for (const [preferences, expected] of [
    [["en-US", "id"], "en"],
    [["id-ID", "en"], "id"],
    [["ja", "id-ID"], "en"],
    [["fr"], "en"],
    [[], "en"],
  ]) {
    const navigator = { language: preferences[0], languages: preferences };
    const element = {
      nodeType: 1,
      childNodes: [],
      matches: () => false,
      getAttribute: () => null,
    };
    const context = vm.createContext({
      window: { navigator },
      document: { documentElement: element },
      MutationObserver: class {
        observe() {}
      },
    });
    vm.runInContext(load("i18n.js"), context);
    const locale = context.window.KepoI18n;
    assert.equal(locale.language(), expected);
    assert.equal(element.lang, expected);
    navigator.languages = expected === "id" ? ["en-US"] : ["id-ID"];
    navigator.language = navigator.languages[0];
    assert.equal(locale.useSystemLanguage(), true);
    assert.notEqual(locale.language(), expected);
    locale.setLanguage(expected);
    assert.equal(locale.useSystemLanguage(), false);
    assert.equal(locale.language(), expected);
  }
  // Language changes must be reversible, handle fresh status messages, and
  // leave original source text alone even when it matches a UI phrase.
  const ui = {
    nodeType: 3,
    nodeValue: "Last known: Degraded",
    parentElement: { closest: () => null },
  };
  const source = {
    nodeType: 3,
    nodeValue: "Operational",
    parentElement: { closest: () => ({}) },
  };
  const element = {
    nodeType: 1,
    childNodes: [ui, source],
    matches: () => false,
    getAttribute: () => null,
  };
  const localization = vm.createContext({
    window: { navigator: { language: "id-ID" } },
    document: { documentElement: element },
    MutationObserver: class {
      observe() {}
    },
  });
  vm.runInContext(load("i18n.js"), localization);
  const language = localization.window.KepoI18n;
  assert.equal(language.locale(), "id-ID");
  assert.equal(ui.nodeValue, "Status terakhir: Terganggu");
  assert.equal(source.nodeValue, "Operational");
  language.apply();
  assert.equal(ui.nodeValue, "Status terakhir: Terganggu");
  language.setLanguage("en");
  assert.equal(ui.nodeValue, "Last known: Degraded");
  ui.nodeValue = "Request failed · retry with Refresh";
  language.setLanguage("id");
  assert.equal(ui.nodeValue, "Pemeriksaan gagal · coba Perbarui status");
  assert.match(
    language.text(
      "· Source checks overdue · Some sources failed; previous entries retained",
    ),
    /terlambat.*Sebagian sumber gagal/,
  );
  assert.match(
    language.text("12 October 2026, 2 archived announcements"),
    /2 arsip pengumuman/,
  );
  language.setLanguage("en");
  assert.equal(ui.nodeValue, "Request failed · retry with Refresh");

  let request;
  const transport = vm.createContext({
    window: {},
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, text: async () => "{}" };
    },
  });
  vm.runInContext(load("content.js"), transport);
  const client = transport.window.ModelContent;
  await client.fetchData("https://person.github.io/kepoai/#overview");
  assert.equal(new URL(request.url).pathname, "/kepoai/content.json");
  assert.equal(request.options.credentials, "omit");
  assert.equal(request.options.mode, "same-origin");
  assert.equal(request.options.cache, "no-store");
  await assert.rejects(client.fetchData("file:///local/index.html"), /Hosted/);
  transport.fetch = async () => ({ ok: false, status: 404 });
  await assert.rejects(
    client.fetchData("https://person.github.io/kepoai/"),
    /404/,
  );

  const nodes = Object.fromEntries(
    [
      "#content-updated",
      "#content-age",
      "#update-count",
      "#updates-title .count-label",
      "#live-summary",
    ].map((k) => [k, { textContent: "", className: "" }]),
  );
  const active = { dataset: {}, closest: () => null };
  const doc = {
    activeElement: active,
    querySelector: (key) => nodes[key] || null,
    querySelectorAll: () => [],
  };
  const ctx = vm.createContext({
    window: {},
    URL,
    Intl,
    Date,
    setTimeout,
    clearTimeout,
    document: doc,
    location: {
      hash: "#updates",
      protocol: "https:",
      href: "https://person.github.io/kepoai/#updates",
    },
  });
  for (const name of ["data.js", "brands.js", "health.js"])
    vm.runInContext(load(name), ctx);
  ctx.ModelHealth = ctx.window.ModelHealth;
  ctx.ModelContent = { ...client };
  const app = load("app.js");
  vm.runInContext(
    app.slice(0, app.search(/document\.addEventListener\(["']click["']/)),
    ctx,
  );
  for (const initiallyDark of [false, true]) {
    let dark = false,
      click,
      change;
    const preference = {
      matches: initiallyDark,
      addEventListener: (type, fn) => {
        change = fn;
      },
    };
    ctx.window.matchMedia = (query) => {
      assert.equal(query, "(prefers-color-scheme: dark)");
      return preference;
    };
    doc.body = {
      classList: {
        toggle: (name, force) => {
          assert.equal(name, "dark");
          dark = force === undefined ? !dark : force;
        },
      },
    };
    nodes["#theme-toggle"] = {
      addEventListener: (type, fn) => {
        click = fn;
      },
    };
    ctx.setupAppearance();
    assert.equal(dark, initiallyDark);
    preference.matches = !initiallyDark;
    change();
    assert.equal(dark, !initiallyDark);
    click();
    assert.equal(dark, initiallyDark);
    preference.matches = !initiallyDark;
    change();
    assert.equal(dark, initiallyDark);
  }
  const current = JSON.parse(JSON.stringify(ctx.window.MODEL_WATCH_DATA));
  const oldCount = current.updates.length;
  const latest = [
    ...current.updates.map((u) => u.date),
    ...current.resets.map((r) => r.date.slice(0, 10)),
  ]
    .sort()
    .at(-1);
  const later = new Date(latest + "T00:00:00Z");
  later.setUTCDate(later.getUTCDate() + 1);
  const testDay = later.toISOString().slice(0, 10);
  const selectedDay = current.resets.at(-1)?.date.slice(0, 10) || testDay;
  const next = JSON.parse(JSON.stringify(current));
  next.updates.unshift({
    id: "test-new-release",
    provider: "openai",
    date: testDay,
    category: "Model release",
    title: "Introducing test model",
    summary: "New source entry.",
    url: "https://openai.com/index/test-model/",
    source: "OpenAI",
  });
  next.resets.unshift({
    date: testDay + "T00:01:00Z",
    type: "Banked reset",
    title: "A new reset record",
    note: "Third-party archive.",
    source: "AI IDE List archive",
    url: "https://aiidelist.com/codex-reset",
    announcementUrl: "https://x.com/person/status/test-new",
  });
  vm.runInContext(
    "query='Computer';providerFilter='gemini';timers.openai={at:'2026-12-01T00:00:00Z',note:'Visit reminder'}",
    ctx,
  );
  ctx.ModelContent.fetchData = async () => next;
  await ctx.refreshContent();
  assert.equal(vm.runInContext("data.updates.length", ctx), oldCount + 1);
  assert.equal(vm.runInContext("selectedResetDay", ctx), testDay);
  assert.match(ctx.releaseTimeline(), /test model/);
  assert.equal(vm.runInContext("query", ctx), "Computer");
  assert.equal(vm.runInContext("providerFilter", ctx), "gemini");
  assert.equal(vm.runInContext("timers.openai.note", ctx), "Visit reminder");
  assert.equal(doc.activeElement, active);

  vm.runInContext(
    `resetCalendarTouched=true;selectedResetDay='${selectedDay}';selectedResetMonth='${selectedDay.slice(0, 7)}'`,
    ctx,
  );
  ctx.ModelContent.fetchData = async () => current;
  await ctx.refreshContent();
  assert.equal(vm.runInContext("selectedResetDay", ctx), selectedDay);
  ctx.ModelContent.fetchData = async () => {
    throw new Error("offline");
  };
  await ctx.refreshContent();
  assert.equal(vm.runInContext("contentPhase", ctx), "error");
  assert.equal(vm.runInContext("data.updates.length", ctx), oldCount);
  assert.match(nodes["#content-age"].textContent, /showing previous content/);
  ctx.ModelContent.fetchData = async () => ({ version: 1, updates: [] });
  await ctx.refreshContent();
  assert.equal(vm.runInContext("data.updates.length", ctx), oldCount);
  const oldFeed = JSON.parse(JSON.stringify(current));
  if (oldFeed.contentMeta)
    oldFeed.contentMeta.generatedAt = "2020-01-01T00:00:00Z";
  else oldFeed.updatedAt = "2020-01-01T00:00:00Z";
  ctx.ModelContent.fetchData = async () => oldFeed;
  await ctx.refreshContent();
  assert.equal(vm.runInContext("contentPhase", ctx), "error");
  assert.equal(vm.runInContext("data.updatedAt", ctx), current.updatedAt);
  let calls = 0,
    finish;
  ctx.ModelContent.fetchData = () => {
    calls++;
    return new Promise((resolve) => {
      finish = () => resolve(current);
    });
  };
  const running = ctx.refreshContent();
  await ctx.refreshContent();
  assert.equal(calls, 1);
  finish();
  await running;
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB/);
  console.log(
    "PASS: project-relative feed URL, browser failures, dynamic releases/resets, filter/focus/timer preservation, calendar selection, invalid payload retention, no duplicate polling or visitor storage.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
