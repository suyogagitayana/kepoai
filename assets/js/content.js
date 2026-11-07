"use strict";

// A public static JSON file served by the same GitHub Pages site.
window.ModelContent = Object.freeze({
  INTERVAL_MS: 300000,
  async fetchData(pageURL) {
    const page = new URL(pageURL);
    if (!["http:", "https:"].includes(page.protocol))
      throw new Error("Hosted content feed required");
    const endpoint = new URL("./content.json", page);
    endpoint.searchParams.set("check", String(Math.floor(Date.now() / 300000)));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint.href, {
        mode: "same-origin",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error("Published feed returned HTTP " + response.status);
      const raw = await response.text();
      if (raw.length > 4000000) throw new Error("Published feed too large");
      return JSON.parse(raw);
    } finally {
      clearTimeout(timeout);
    }
  },
});
