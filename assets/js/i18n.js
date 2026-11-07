"use strict";

// UI copy only. Original announcements and visitor-entered labels stay untouched.
window.KepoI18n = (() => {
  function preferredLanguage() {
    const primary =
      window.navigator?.language || window.navigator?.languages?.[0] || "en";
    return String(primary).toLowerCase().split(/[-_]/)[0] === "id"
      ? "id"
      : "en";
  }
  let language = preferredLanguage();
  let manualChoice = false;
  const words = {
    Overview: "Ringkasan",
    Updates: "Kabar",
    "Service health": "Status layanan",
    "Reset tracker": "Pelacak reset",
    Sources: "Sumber",
    "Sources & data": "Sumber & data",
    "Sources & coverage": "Sumber & cakupan",
    "Skip to content": "Langsung ke konten",
    "Main navigation": "Navigasi utama",
    "kepoAI home": "Beranda kepoAI",
    "Switch appearance": "Ganti tampilan",
    Language: "Bahasa",
    "Recent announcements and live status from official feeds.":
      "Kabar terbaru dan status layanan dari sumber resmi.",
    "Company announcements and release notes. Newest first.":
      "Pengumuman dan catatan rilis, dari yang terbaru.",
    "Live reports from official status pages.":
      "Laporan langsung dari halaman status resmi.",
    "Personal reset reminders and archived Codex announcements.":
      "Pengingat reset pribadi dan arsip pengumuman Codex.",
    "Sources, coverage and privacy.": "Sumber, cakupan, dan privasi.",
    "Updated:": "Diperbarui:",
    "Refresh content ↻": "Perbarui kabar ↻",
    "Official status feeds": "Sumber status resmi",
    "Checking official feeds…": "Memeriksa sumber resmi…",
    "Checking…": "Memeriksa…",
    "Auto-refreshes every minute": "Diperbarui otomatis tiap menit",
    "Refresh reports ↻": "Perbarui status ↻",
    "Provider / coverage": "Penyedia / cakupan",
    "Checked (UTC)": "Diperiksa (UTC)",
    Source: "Sumber",
    "Published services": "Layanan yang dilaporkan",
    "Workspace only · API not covered": "Hanya Workspace · API tidak tercakup",
    Operational: "Normal",
    Degraded: "Terganggu",
    Outage: "Gangguan layanan",
    Maintenance: "Pemeliharaan",
    Unknown: "Belum diketahui",
    Unverified: "Belum terverifikasi",
    "Service notice": "Pemberitahuan layanan",
    "No incidents reported": "Tidak ada insiden dilaporkan",
    "Could not check": "Gagal diperiksa",
    "Not checked": "Belum diperiksa",
    refreshing: "memperbarui",
    "Request failed · retry with Refresh":
      "Pemeriksaan gagal · coba Perbarui status",
    "not current": "data lama",
    "Status page": "Halaman status",
    "Components & incidents ↗": "Komponen & insiden ↗",
    "Components & uptime coverage": "Komponen & cakupan waktu aktif",
    "Status unavailable. A failed check does not indicate an outage.":
      "Status tidak tersedia. Pemeriksaan gagal bukan berarti layanan padam.",
    "No active incidents reported in this feed.":
      "Tidak ada insiden aktif yang dilaporkan sumber ini.",
    "Not covered by this feed": "Tidak tercakup oleh sumber ini",
    "Verified historical uptime percentages are not available from these feeds.":
      "Persentase riwayat waktu aktif terverifikasi tidak tersedia dari sumber ini.",
    "Official status page": "Halaman status resmi",
    "OpenAI’s published aggregate and service components. Individual models and accounts may differ.":
      "Status gabungan dan komponen yang dilaporkan OpenAI. Kondisi tiap model dan akun dapat berbeda.",
    "Claude web, API, Code and other services published on Claude’s status page.":
      "Claude web, API, Code, dan layanan lain pada halaman status Claude.",
    "Gemini in Google Workspace only. This feed does not establish Gemini API or AI Studio availability.":
      "Hanya Gemini di Google Workspace. Sumber ini tidak menunjukkan ketersediaan Gemini API atau AI Studio.",
    "Google’s feed covers Gemini in Workspace. Use AI Studio’s official page for Gemini API status.":
      "Sumber Google mencakup Gemini di Workspace. Lihat halaman resmi AI Studio untuk status Gemini API.",
    Releases: "Rilis",
    "Latest per company": "Terbaru tiap perusahaan",
    "Latest per company · newest first":
      "Terbaru tiap perusahaan · urut dari terbaru",
    "Show earlier releases": "Lihat rilis sebelumnya",
    "Hide earlier releases": "Sembunyikan rilis sebelumnya",
    "No model launches in this feed.": "Belum ada rilis model dari sumber ini.",
    "Recent updates": "Kabar terbaru",
    "View all updates ↗": "Semua kabar ↗",
    "Filter by company": "Saring perusahaan",
    "All companies": "Semua perusahaan",
    "Search updates": "Cari kabar",
    "Search updates…": "Cari kabar…",
    "Filter by category": "Saring kategori",
    "All update types": "Semua jenis kabar",
    "Date ↓": "Tanggal ↓",
    Company: "Perusahaan",
    Update: "Kabar",
    "Model release": "Rilis model",
    "API update": "Pembaruan API",
    "Developer tools": "Alat pengembang",
    Engineering: "Rekayasa",
    News: "Berita",
    Research: "Riset",
    Safety: "Keselamatan",
    Security: "Keamanan",
    "No matching updates": "Tidak ada kabar yang cocok",
    "Try a different company, category or search term.":
      "Coba perusahaan, kategori, atau kata pencarian lain.",
    "Clear filters": "Hapus filter",
    "Historical announcements only; future reset dates are unknown.":
      "Hanya arsip pengumuman; jadwal reset berikutnya belum diketahui.",
    "Codex reset calendar": "Kalender reset Codex",
    "Previous archive month": "Bulan arsip sebelumnya",
    "Next archive month": "Bulan arsip berikutnya",
    Mon: "Sen",
    Tue: "Sel",
    Wed: "Rab",
    Thu: "Kam",
    Fri: "Jum",
    Sat: "Sab",
    Sun: "Min",
    "Banked reset": "Reset cadangan",
    "Global reset": "Reset global",
    Both: "Keduanya",
    "Dates in UTC. Blank days have no archived record.":
      "Tanggal dalam UTC. Hari kosong tidak memiliki catatan arsip.",
    "No archived announcement": "Tidak ada arsip pengumuman",
    "This date has no entry in the selected archive.":
      "Tidak ada catatan pada tanggal ini di arsip.",
    "This is a partial archive. Eligibility and original social posts have not been independently verified.":
      "Arsip ini belum lengkap. Kelayakan akun dan unggahan asli belum diverifikasi secara independen.",
    "Your reminders": "Pengingat Anda",
    "No timer set": "Belum ada pengingat",
    "Edit timer": "Ubah pengingat",
    "＋ Set timer": "＋ Atur pengingat",
    Remove: "Hapus",
    "Personal reset reminder": "Pengingat reset pribadi",
    "Reset time reached": "Waktu reset tercapai",
    "Reminders clear when you reload or close this page.":
      "Pengingat dihapus saat halaman dimuat ulang atau ditutup.",
    "Enter the reset time shown in your account. Reminders last for this visit only and clear when the page reloads.":
      "Masukkan waktu reset yang tertera di akun Anda. Pengingat hanya berlaku selama kunjungan ini dan dihapus saat halaman dimuat ulang.",
    "Reset date and time (your device’s local time)":
      "Tanggal dan waktu reset (waktu lokal perangkat)",
    "Label (optional)": "Label (opsional)",
    "Weekly Codex limit": "Batas mingguan Codex",
    Cancel: "Batal",
    "Set reminder": "Atur pengingat",
    "Close dialog": "Tutup dialog",
    "Choose a reset time in the future.": "Pilih waktu reset yang belum lewat.",
    "Reminder set for this visit. It clears when the page reloads.":
      "Pengingat diatur untuk kunjungan ini. Pengingat dihapus saat halaman dimuat ulang.",
    "Reminder removed.": "Pengingat dihapus.",
    "Timer removed.": "Pengingat dihapus.",
    "Announcement date is in the future": "Tanggal pengumuman belum tiba",
    "Open official announcement": "Buka pengumuman resmi",
    "News & releases": "Kabar & rilis",
    "Checked hourly. Release dates follow the original announcements.":
      "Diperiksa tiap jam. Tanggal rilis mengikuti pengumuman asli.",
    "Service coverage": "Cakupan layanan",
    "Provider-reported status, not an independent availability test. Verified historical uptime percentages are unavailable.":
      "Status dilaporkan oleh penyedia, bukan uji ketersediaan independen. Persentase riwayat waktu aktif terverifikasi tidak tersedia.",
    "Google’s feed covers Gemini in Workspace only. Gemini API and AI Studio are not covered.":
      "Sumber Google hanya mencakup Gemini di Workspace. Gemini API dan AI Studio tidak tercakup.",
    "Reset archive": "Arsip reset",
    "A partial archive from AI IDE List. Original social posts and eligibility have not been independently verified. Dates are UTC; blank days have no archived record.":
      "Arsip belum lengkap dari AI IDE List. Unggahan asli dan kelayakan akun belum diverifikasi secara independen. Tanggal dalam UTC; hari kosong tidak memiliki catatan arsip.",
    "AI IDE List reset archive": "Arsip reset AI IDE List",
    "Original announcement": "Pengumuman asli",
    "AI IDE List archive": "Arsip AI IDE List",
    "Gemini API release notes": "Catatan rilis Gemini API",
    "Gemini API / AI Studio status": "Status Gemini API / AI Studio",
    Privacy: "Privasi",
    "No analytics or visitor data storage. Reminders and appearance choices clear on reload. Status providers receive your IP address when your browser requests their reports.":
      "Tanpa analitik atau penyimpanan data pengunjung. Pengingat dan pilihan tampilan dihapus saat halaman dimuat ulang. Penyedia status menerima alamat IP Anda saat browser meminta laporan.",
    "Source checks": "Pemeriksaan sumber",
    Result: "Hasil",
    "Third-party archive": "Arsip pihak ketiga",
    "Official source": "Sumber resmi",
    "Up to date": "Berhasil diperiksa",
    "Failed · previous entries retained":
      "Gagal · catatan sebelumnya dipertahankan",
    "Source check history is unavailable.":
      "Riwayat pemeriksaan sumber tidak tersedia.",
    "· Refresh failed; showing previous content":
      "· Pembaruan gagal; menampilkan konten sebelumnya",
    "· Local copy; live content updates unavailable":
      "· Salinan lokal; pembaruan kabar tidak tersedia",
    "· Checking…": "· Memeriksa…",
    "· Source check history unavailable":
      "· Riwayat pemeriksaan sumber tidak tersedia",
    "· Source checks overdue": "· Pemeriksaan sumber terlambat",
    "· Some sources failed; previous entries retained":
      "· Sebagian sumber gagal; catatan sebelumnya dipertahankan",
    "Official service status, coverage, and last successful check":
      "Status layanan resmi, cakupan, dan pemeriksaan terakhir yang berhasil",
    "Company updates, newest first": "Kabar perusahaan, urut dari terbaru",
  };
  function text(value) {
    if (language === "en") return value;
    if (words[value]) return words[value];
    const rules = [
      [/^(.*) ↗$/, (m) => text(m[1]) + " ↗"],
      [/^(.+) — kepoAI$/, (m) => text(m[1]) + " — kepoAI"],
      [
        /^(\d+)\/3 feeds checked( · retry available)?$/,
        (m) => `${m[1]}/3 sumber diperiksa${m[2] ? " · bisa dicoba lagi" : ""}`,
      ],
      [/^Last known: (.+)$/, (m) => "Status terakhir: " + text(m[1])],
      [/^Checked (.+)$/, (m) => "Diperiksa " + m[1]],
      [/^(\d+) of (\d+) updates$/, (m) => `${m[1]} dari ${m[2]} kabar`],
      [/^(\d+) archived announcements?$/, (m) => `${m[1]} arsip pengumuman`],
      [/^(\d+) announcements?$/, (m) => `${m[1]} pengumuman`],
      [
        /^All archived announcements \((\d+)\)$/,
        (m) => `Semua arsip pengumuman (${m[1]})`,
      ],
      [
        /^(.+), (\d+) archived announcements?$/,
        (m) => `${m[1]}, ${m[2]} arsip pengumuman`,
      ],
      [/^Device timezone · (.+)$/, (m) => "Zona waktu perangkat · " + m[1]],
      [
        /^Timezone: (.+)\. This timer does not read or change your account limits\.$/,
        (m) =>
          `Zona waktu: ${m[1]}. Pengingat ini tidak membaca atau mengubah batas akun Anda.`,
      ],
      [
        /^Last checked: (.+)$/,
        (m) =>
          "Terakhir diperiksa: " +
          m[1].replace(
            " The latest refresh failed; this is a previous result.",
            " Pembaruan terakhir gagal; ini hasil sebelumnya.",
          ),
      ],
      [
        /^Provider report updated: (.+)$/,
        (m) => "Laporan penyedia diperbarui: " + m[1],
      ],
      [/^Last success: (.+)$/, (m) => "Terakhir berhasil: " + text(m[1])],
      [/^(OpenAI|Claude|Gemini) status$/, (m) => "Status " + m[1]],
      [
        /^Archived Codex reset announcements in (.+)\. Arrow keys move between dates; Home and End move within the week\.$/,
        (m) =>
          `Arsip pengumuman reset Codex pada ${m[1]}. Tombol panah berpindah tanggal; Home dan End berpindah dalam minggu.`,
      ],
    ];
    for (const [pattern, replace] of rules) {
      const match = value.match(pattern);
      if (match) return replace(match);
    }
    // Multiple freshness warnings can appear together.
    if (value.includes(" · "))
      return value
        .split(" · ")
        .map((v, i) => (i ? text("· " + v).replace(/^· /, "") : text(v)))
        .join(" · ");
    return value;
  }
  const originals = new WeakMap();
  const attributes = new WeakMap();
  const excluded =
    'script,style,noscript,[translate="no"],.entry-title,.update-row p,.release-list a,.incident-list a,.detail-components div>span:first-child';
  function translateNode(node) {
    if (node.nodeType === 3) {
      if (node.parentElement?.closest(excluded)) return;
      const current = node.nodeValue;
      const prior = originals.get(node);
      const original =
        prior && current === prior.output ? prior.original : current;
      const trimmed = original.trim();
      const output = trimmed
        ? original.replace(trimmed, text(trimmed))
        : original;
      originals.set(node, { original, output });
      if (current !== output) node.nodeValue = output;
      return;
    }
    if (node.nodeType !== 1 || node.matches(excluded)) return;
    for (const name of ["aria-label", "title", "placeholder"]) {
      const current = node.getAttribute(name);
      if (current === null) continue;
      const saved = attributes.get(node) || {};
      const prior = saved[name];
      const original =
        prior && current === prior.output ? prior.original : current;
      const output = text(original);
      saved[name] = { original, output };
      attributes.set(node, saved);
      if (current !== output) node.setAttribute(name, output);
    }
    for (const child of node.childNodes) translateNode(child);
  }
  function apply() {
    translateNode(document.documentElement);
  }
  function setLanguage(value, manual = true) {
    if (manual) manualChoice = true;
    language = value === "en" ? "en" : "id";
    document.documentElement.lang = language;
    apply();
  }
  function useSystemLanguage() {
    if (manualChoice) return false;
    setLanguage(preferredLanguage(), false);
    return true;
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") record.addedNodes.forEach(translateNode);
      else translateNode(record.target);
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "title", "placeholder"],
  });
  document.documentElement.lang = language;
  apply();
  return Object.freeze({
    text,
    apply,
    setLanguage,
    useSystemLanguage,
    locale: () => (language === "id" ? "id-ID" : "en-GB"),
    language: () => language,
  });
})();
