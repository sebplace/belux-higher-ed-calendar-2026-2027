// Générateur statique du calendrier Microsoft Belux Higher Education.
// Usage : node tools/build.mjs
// Régénère les cartes et l'îlot de données dans index.html, puis écrit
// une page et un fichier .ics par événement dans e/.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TZ = "Europe/Brussels";
const LANGS = ["fr", "nl", "en"];

const data = JSON.parse(readFileSync(join(ROOT, "events.json"), "utf8"));
const BASE = data.site.base;

const MONTHS = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  nl: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
};

const L = {
  fr: {
    when: "Quand", where: "Lieu", who: "Public", lang: "Langue", deadline: "Inscriptions",
    register: "S'inscrire", details: "Voir l'événement", contact: "Contacter Microsoft",
    copy: "Copier l'invitation", ics: "Ajouter à mon agenda",
    past: "Événement terminé", closed: "Inscriptions clôturées", provisional: "Date provisoire",
    general: "Général", research: "Recherche", onsite: "Présentiel", online: "En ligne",
    english: "Anglais (à confirmer)", unknown: "À préciser",
    backToCalendar: "← Tous les événements", moreInfo: "Plus d'informations",
    verified: "Informations vérifiées le", tbc: "à confirmer"
  },
  nl: {
    when: "Wanneer", where: "Locatie", who: "Doelgroep", lang: "Taal", deadline: "Inschrijvingen",
    register: "Registreren", details: "Bekijk het event", contact: "Contacteer Microsoft",
    copy: "Uitnodiging kopiëren", ics: "Aan mijn agenda toevoegen",
    past: "Afgelopen event", closed: "Inschrijvingen gesloten", provisional: "Voorlopige datum",
    general: "Algemeen", research: "Onderzoek", onsite: "Ter plaatse", online: "Online",
    english: "Engels (te bevestigen)", unknown: "Te preciseren",
    backToCalendar: "← Alle events", moreInfo: "Meer informatie",
    verified: "Informatie geverifieerd op", tbc: "te bevestigen"
  },
  en: {
    when: "When", where: "Location", who: "Audience", lang: "Language", deadline: "Registration",
    register: "Register", details: "View event", contact: "Contact Microsoft",
    copy: "Copy invitation", ics: "Add to my calendar",
    past: "Past event", closed: "Registration closed", provisional: "Provisional date",
    general: "General", research: "Research", onsite: "In person", online: "Online",
    english: "English (to be confirmed)", unknown: "To be confirmed",
    backToCalendar: "← All events", moreInfo: "More information",
    verified: "Information verified on", tbc: "to be confirmed"
  }
};

function tzOffsetMinutes(date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}

function localToUtc(dateStr, timeStr) {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  return new Date(naive.getTime() - tzOffsetMinutes(naive) * 60000);
}

function tzLabel(dateStr) {
  return tzOffsetMinutes(new Date(`${dateStr}T12:00:00Z`)) === 120 ? "CEST" : "CET";
}

function dateLabel(ev, lang) {
  if (ev.dateText) return ev.dateText[lang];
  const [sy, sm, sd] = ev.start.split("-").map(Number);
  const [, em, ed] = ev.end.split("-").map(Number);
  const months = MONTHS[lang];
  let base;
  if (ev.datePrecision === "month") {
    base = `${months[sm - 1]} ${sy}`;
  } else if (ev.datePrecision === "range") {
    base = sm === em
      ? `${sd}-${ed} ${months[sm - 1]} ${sy}`
      : `${sd} ${months[sm - 1]} - ${ed} ${months[em - 1]} ${sy}`;
  } else {
    base = `${sd} ${months[sm - 1]} ${sy}`;
  }
  return ev.provisional ? `${base} (${L[lang].tbc})` : base;
}

function timeLabel(ev, lang) {
  if (ev.timeText) return ev.timeText[lang];
  if (!ev.timeStart) return null;
  const z = tzLabel(ev.start);
  const fmt = (t) => (lang === "nl" ? t.replace(":", ".") : lang === "fr" ? t.replace(":", "h") : t);
  const range = ev.timeEnd ? `${fmt(ev.timeStart)}-${fmt(ev.timeEnd)}` : fmt(ev.timeStart);
  const label = `${range} (${z})`;
  return ev.provisional ? `${label} — ${L[lang].tbc}` : label;
}

function ctaLabel(ev, lang) {
  if (ev.registration === "closed") return L[lang].details;
  if (ev.registration === "contact") return L[lang].contact;
  return L[lang].register;
}

// `language` accepte trois formes :
//   null                      -> « À préciser »
//   "en"                      -> déduit de la page officielle, affiché « (à confirmer) »
//   { fr, nl, en }            -> confirmé par l'organisateur, affiché tel quel
function languageLabel(ev, lang) {
  if (ev.language && typeof ev.language === "object") return ev.language[lang];
  if (ev.language === "en") return L[lang].english;
  return L[lang].unknown;
}

// Pas de fichier .ics quand la date est trop imprécise, explicitement désactivée,
// ou quand l'événement est une série récurrente dont on ne connaît pas toutes les séances.
const hasIcs = (ev) => !(ev.ics === false || ev.ongoing || ev.datePrecision === "month");

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const events = [...data.events].sort((a, b) =>
  a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title));

// ---------------------------------------------------------------- îlot JSON
function island() {
  const compact = events.map((ev) => {
    const o = {
      id: ev.id, title: ev.title, titleOfficial: ev.titleOfficial,
      track: ev.track, theme: ev.theme, format: ev.format,
      start: ev.start, end: ev.end, url: ev.url,
      registration: ev.registration, provisional: !!ev.provisional, ongoing: !!ev.ongoing,
      ics: hasIcs(ev) ? `e/${ev.id}.ics` : null,
      page: `e/${ev.id}.html`, t: {}
    };
    for (const lang of LANGS) {
      o.t[lang] = {
        date: dateLabel(ev, lang),
        time: timeLabel(ev, lang),
        venue: ev.venue ? ev.venue[lang] : null,
        audience: ev.audience ? ev.audience[lang] : null,
        benefit: ev.benefit ? ev.benefit[lang] : null,
        language: languageLabel(ev, lang),
        deadline: ev.deadline ? ev.deadline[lang] : null,
        theme: data.themes[ev.theme][lang],
        track: ev.track === "Research" ? L[lang].research : L[lang].general,
        format: ev.format === "online" ? L[lang].online : L[lang].onsite,
        cta: ctaLabel(ev, lang),
        copy: L[lang].copy,
        ics: L[lang].ics,
        status: ev.registration === "closed" ? L[lang].closed : (ev.provisional ? L[lang].provisional : null)
      };
    }
    return o;
  });
  return `<script type="application/json" id="events-data">${
    JSON.stringify({ base: BASE, themes: data.themes, events: compact }).replace(/</g, "\\u003c")
  }</script>`;
}

// ------------------------------------------------------------------- cartes
function card(ev) {
  const fr = L.fr;
  const chipClass = ev.track === "Research" ? "chip-res" : "chip-gen";
  const trackLabel = ev.track === "Research" ? fr.research : fr.general;
  const themeLabel = data.themes[ev.theme].fr;
  const status = ev.registration === "closed" ? fr.closed : (ev.provisional ? fr.provisional : null);
  const statusClass = ev.registration === "closed" ? "chip-closed" : "chip-provisional";
  const time = timeLabel(ev, "fr");
  const rows = [];
  if (time) rows.push(`          <div><dt data-i18n="l_when">${fr.when}</dt><dd data-f="time">${esc(time)}</dd></div>`);
  rows.push(`          <div><dt data-i18n="l_where">${fr.where}</dt><dd data-f="venue">${esc(ev.venue.fr)}</dd></div>`);
  rows.push(`          <div><dt data-i18n="l_who">${fr.who}</dt><dd data-f="audience">${esc(ev.audience.fr)}</dd></div>`);
  rows.push(`          <div><dt data-i18n="l_lang">${fr.lang}</dt><dd data-f="language">${esc(languageLabel(ev, "fr"))}</dd></div>`);
  if (ev.deadline) rows.push(`          <div><dt data-i18n="l_deadline">${fr.deadline}</dt><dd data-f="deadline">${esc(ev.deadline.fr)}</dd></div>`);

  const icsBtn = !hasIcs(ev) ? "" :
    `\n          <a class="btn btn-ghost btn-sm" href="e/${ev.id}.ics" download data-f="ics">${fr.ics}</a>`;

  return `      <article class="card" id="${ev.id}" data-start="${ev.start}" data-end="${ev.end}"${ev.ongoing ? ' data-ongoing="true"' : ""} data-track="${ev.track}" data-fmt="${ev.format}" data-theme="${ev.theme}" data-reg="${ev.registration}">
        <div class="card-top">
          <span class="chip ${chipClass}" data-f="track">${esc(trackLabel)}</span>
          <span class="chip chip-fmt" data-f="format">${esc(ev.format === "online" ? fr.online : fr.onsite)}</span>${
    themeLabel === trackLabel ? "" : `
          <span class="chip chip-theme" data-f="theme">${esc(themeLabel)}</span>`}${
    status ? `\n          <span class="chip ${statusClass}" data-f="status">${esc(status)}</span>` : ""}
        </div>
        <p class="card-date"><time datetime="${ev.datePrecision === "month" ? ev.start.slice(0, 7) : ev.start}" data-f="date">${esc(dateLabel(ev, "fr"))}</time></p>
        <h3 lang="en"><a class="card-link" href="e/${ev.id}.html" data-f="title">${esc(ev.title)}</a></h3>${
    ev.benefit ? `\n        <p class="card-benefit" data-f="benefit">${esc(ev.benefit.fr)}</p>` : ""}
        <dl class="meta">
${rows.join("\n")}
        </dl>
        <div class="card-actions">
          <a class="btn" href="${esc(ev.url)}" data-f="cta">${esc(ctaLabel(ev, "fr"))}</a>
          <button class="btn btn-ghost btn-sm" type="button" data-act="copy" data-f="copy">${fr.copy}</button>${icsBtn}
        </div>
      </article>`;
}

// ---------------------------------------------------------------------- ICS
function fold(line) {
  if (Buffer.byteLength(line, "utf8") <= 73) return line;
  const out = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > 73) { out.push(cur); cur = " " + ch; }
    else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

const icsEsc = (s) => String(s == null ? "" : s)
  .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

const stampUtc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (s) => s.replace(/-/g, "");

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function ics(ev) {
  if (!hasIcs(ev)) return null;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//Microsoft Belux Higher Education Calendar//FR",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${ev.id}@sebplace.github.io`,
    `DTSTAMP:${stampUtc(new Date(`${data.site.updated}T12:00:00Z`))}`
  ];
  if (ev.timeStart) {
    lines.push(`DTSTART:${stampUtc(localToUtc(ev.start, ev.timeStart))}`);
    lines.push(`DTEND:${stampUtc(localToUtc(ev.end, ev.timeEnd || ev.timeStart))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`);
    lines.push(`DTEND;VALUE=DATE:${dateOnly(addDays(ev.end, 1))}`);
  }
  const summary = ev.provisional ? `[${L.fr.tbc}] ${ev.titleOfficial}` : ev.titleOfficial;
  const desc = [
    ev.benefit ? icsEsc(ev.benefit.fr) : null,
    `${L.fr.who} : ${icsEsc(ev.audience.fr)}`,
    ev.registration === "contact" ? null : `${L.fr.moreInfo} : ${ev.url}`,
    `${BASE}#${ev.id}`
  ].filter(Boolean).join("\\n\\n");
  lines.push(fold(`SUMMARY:${icsEsc(summary)}`));
  lines.push(fold(`DESCRIPTION:${desc}`));
  lines.push(fold(`LOCATION:${icsEsc(ev.venue.fr)}`));
  if (ev.registration !== "contact") lines.push(fold(`URL:${ev.url}`));
  lines.push(`STATUS:${ev.provisional ? "TENTATIVE" : "CONFIRMED"}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// --------------------------------------------------------- page par événement
function eventPage(ev) {
  const t = {};
  for (const lang of LANGS) {
    t[lang] = {
      date: dateLabel(ev, lang), time: timeLabel(ev, lang),
      venue: ev.venue[lang], audience: ev.audience[lang],
      benefit: ev.benefit ? ev.benefit[lang] : null,
      language: languageLabel(ev, lang),
      deadline: ev.deadline ? ev.deadline[lang] : null,
      theme: data.themes[ev.theme][lang],
      format: ev.format === "online" ? L[lang].online : L[lang].onsite,
      cta: ctaLabel(ev, lang), back: L[lang].backToCalendar,
      when: L[lang].when, where: L[lang].where, who: L[lang].who, langLabel: L[lang].lang,
      deadlineLabel: L[lang].deadline,
      ics: L[lang].ics, verified: L[lang].verified,
      status: ev.registration === "closed" ? L[lang].closed : (ev.provisional ? L[lang].provisional : null)
    };
  }
  const descr = (ev.benefit ? ev.benefit.fr : `${dateLabel(ev, "fr")} — ${ev.venue.fr}`).slice(0, 200);
  const offset = (d) => (tzLabel(d) === "CEST" ? "+02:00" : "+01:00");
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Event",
    name: ev.titleOfficial,
    startDate: ev.timeStart ? `${ev.start}T${ev.timeStart}:00${offset(ev.start)}` : ev.start,
    ...(ev.ongoing ? {} : { endDate: ev.timeEnd ? `${ev.end}T${ev.timeEnd}:00${offset(ev.end)}` : ev.end }),
    eventAttendanceMode: ev.format === "online"
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: ev.format === "online"
      ? { "@type": "VirtualLocation", url: ev.url.startsWith("http") ? ev.url : BASE }
      : { "@type": "Place", name: ev.venue.en, address: ev.venue.en },
    organizer: { "@type": "Organization", name: "Microsoft", url: "https://www.microsoft.com" },
    url: `${BASE}e/${ev.id}.html`
  };
  if (ev.benefit) jsonLd.description = ev.benefit.en;
  if (ev.registration === "open") {
    jsonLd.offers = { "@type": "Offer", url: ev.url, availability: "https://schema.org/InStock", price: "0", priceCurrency: "EUR" };
  }

  return `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(ev.titleOfficial)} — Microsoft Belux Higher Education</title>
<meta name="description" content="${esc(descr)}">
<link rel="canonical" href="${BASE}e/${ev.id}.html">
<link rel="icon" href="../assets/favicon.svg">
<meta property="og:type" content="website">
<meta property="og:url" content="${BASE}e/${ev.id}.html">
<meta property="og:title" content="${esc(ev.titleOfficial)}">
<meta property="og:description" content="${esc(dateLabel(ev, "fr"))} · ${esc(ev.venue.fr)} — ${esc(descr)}">
<meta property="og:locale" content="fr_BE">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
<style>
:root{--bg:#f6f8fc;--surface:#fff;--surface-2:#f1f4fa;--text:#16181d;--text-soft:#5a6070;
--border:rgba(20,24,40,.10);--shadow:0 10px 30px rgba(20,30,70,.10);--brand-1:#2c6df4;--brand-2:#8a4fe3;--accent:#2c6df4}
@media(prefers-color-scheme:dark){:root{--bg:#101218;--surface:#191c24;--surface-2:#1f232d;--text:#f2f4f8;
--text-soft:#aab2c2;--border:rgba(255,255,255,.12);--shadow:0 10px 30px rgba(0,0,0,.45);--accent:#7aa6ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);line-height:1.55;
font-family:"Segoe UI","Segoe UI Variable",system-ui,-apple-system,Roboto,sans-serif}
.wrap{max-inline-size:760px;margin-inline:auto;padding:26px 22px 60px}
a{color:var(--accent)}
.top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-block-end:22px}
.langs{display:flex;flex-wrap:wrap;gap:6px}
.lang{font:inherit;font-size:.84rem;font-weight:700;cursor:pointer;color:var(--text-soft);
background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:6px 14px}
.lang[aria-pressed=true]{color:#fff;background:linear-gradient(100deg,var(--brand-1),var(--brand-2));border-color:transparent}
.card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:26px;box-shadow:var(--shadow)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-block-end:10px}
.chip{font-size:.74rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;
padding:4px 10px;border:1px solid var(--border);color:var(--text-soft);background:var(--surface-2)}
.chip-status{color:#8a2033;background:rgba(226,85,124,.16);border-color:rgba(226,85,124,.4)}
@media(prefers-color-scheme:dark){.chip-status{color:#ff9db5}}
h1{font-size:clamp(1.5rem,3.6vw,2.1rem);line-height:1.25;margin:0 0 6px}
.date{font-weight:700;color:var(--accent);margin:0 0 14px}
.benefit{color:var(--text-soft);margin:0 0 18px}
dl{display:grid;gap:8px;margin:0 0 22px}
dl>div{display:flex;gap:10px;font-size:.94rem;flex-wrap:wrap}
dt{color:var(--text-soft);min-inline-size:90px}
dd{margin:0}
.actions{display:flex;flex-wrap:wrap;gap:10px}
.btn{display:inline-block;text-decoration:none;font-weight:600;font-size:.93rem;color:#fff;border:0;cursor:pointer;
background:linear-gradient(100deg,var(--brand-1),var(--brand-2));padding:11px 20px;border-radius:999px;
box-shadow:0 6px 18px rgba(44,109,244,.28);font-family:inherit}
.btn-ghost{background:var(--surface-2);color:var(--text);border:1px solid var(--border);box-shadow:none}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:6px}
footer{margin-block-start:26px;font-size:.9rem;color:var(--text-soft)}
@media print{.langs,.actions{display:none}body{background:#fff;color:#111}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <a href="../index.html" data-f="back">${esc(L.fr.backToCalendar)}</a>
    <div class="langs" role="group" aria-label="Language / Taal / Langue">
      <button class="lang" type="button" data-lang="fr" aria-pressed="true" lang="fr">Français</button>
      <button class="lang" type="button" data-lang="nl" aria-pressed="false" lang="nl">Nederlands</button>
      <button class="lang" type="button" data-lang="en" aria-pressed="false" lang="en">English</button>
    </div>
  </div>
  <article class="card">
    <div class="chips">
      <span class="chip" data-f="format">${esc(ev.format === "online" ? L.fr.online : L.fr.onsite)}</span>${
    data.themes[ev.theme].fr === (ev.track === "Research" ? L.fr.research : L.fr.general) ? "" : `
      <span class="chip" data-f="theme">${esc(data.themes[ev.theme].fr)}</span>`}${
    t.fr.status ? `\n      <span class="chip chip-status" data-f="status">${esc(t.fr.status)}</span>` : ""}
    </div>
    <p class="date"><time datetime="${ev.datePrecision === "month" ? ev.start.slice(0, 7) : ev.start}" data-f="date">${esc(dateLabel(ev, "fr"))}</time></p>
    <h1 lang="en">${esc(ev.titleOfficial)}</h1>${
    ev.benefit ? `\n    <p class="benefit" data-f="benefit">${esc(ev.benefit.fr)}</p>` : ""}
    <dl>${t.fr.time ? `
      <div><dt data-f="l_when">${L.fr.when}</dt><dd data-f="time">${esc(t.fr.time)}</dd></div>` : ""}
      <div><dt data-f="l_where">${L.fr.where}</dt><dd data-f="venue">${esc(ev.venue.fr)}</dd></div>
      <div><dt data-f="l_who">${L.fr.who}</dt><dd data-f="audience">${esc(ev.audience.fr)}</dd></div>
      <div><dt data-f="l_lang">${L.fr.lang}</dt><dd data-f="language">${esc(t.fr.language)}</dd></div>${
    ev.deadline ? `
      <div><dt data-f="l_deadline">${L.fr.deadline}</dt><dd data-f="deadline">${esc(ev.deadline.fr)}</dd></div>` : ""}
    </dl>
    <div class="actions">
      <a class="btn" href="${esc(ev.url)}" data-f="cta">${esc(ctaLabel(ev, "fr"))}</a>${
    (!hasIcs(ev)) ? "" : `
      <a class="btn btn-ghost" href="${ev.id}.ics" download data-f="ics">${L.fr.ics}</a>`}
    </div>
  </article>
  <footer>
    <p><span data-f="verified">${L.fr.verified}</span> ${ev.verified} · <a href="../index.html" data-f="back2">${esc(L.fr.backToCalendar)}</a></p>
  </footer>
</div>
<script>
(function(){
  var T=${JSON.stringify(t).replace(/</g, "\\u003c")};
  var btns=[].slice.call(document.querySelectorAll(".lang"));
  var MAP={l_when:"when",l_where:"where",l_who:"who",l_lang:"langLabel",l_deadline:"deadlineLabel",back:"back",back2:"back"};
  function draw(l){
    document.documentElement.setAttribute("lang",l);
    var d=T[l];
    [].forEach.call(document.querySelectorAll("[data-f]"),function(el){
      var k=el.getAttribute("data-f");
      var v=d[MAP[k]||k];
      if(v) el.textContent=v;
    });
    btns.forEach(function(b){b.setAttribute("aria-pressed",b.dataset.lang===l?"true":"false");});
    try{localStorage.setItem("belux-cal-lang",l);}catch(e){}
  }
  btns.forEach(function(b){b.addEventListener("click",function(){draw(b.dataset.lang);});});
  var init="fr",c=[];
  try{c.push(new URL(location.href).searchParams.get("lang"));}catch(e){}
  try{c.push(localStorage.getItem("belux-cal-lang"));}catch(e){}
  c.push((navigator.language||"fr").slice(0,2).toLowerCase());
  c.some(function(x){if(x&&T[x]){init=x;return true;}return false;});
  draw(init);
})();
</script>
</body>
</html>
`;
}

// ------------------------------------------------------------------- écriture
const outDir = join(ROOT, "e");
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (f.endsWith(".html") || f.endsWith(".ics")) unlinkSync(join(outDir, f));
}

let pages = 0, icsFiles = 0;
for (const ev of events) {
  writeFileSync(join(outDir, `${ev.id}.html`), eventPage(ev), "utf8");
  pages++;
  const cal = ics(ev);
  if (cal) { writeFileSync(join(outDir, `${ev.id}.ics`), cal, "utf8"); icsFiles++; }
}

const indexPath = join(ROOT, "index.html");
let html = readFileSync(indexPath, "utf8");

function replaceBlock(source, name, content) {
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(source)) throw new Error(`Marqueur ${name} introuvable dans index.html`);
  return source.replace(re, `$1\n${content}\n      $2`);
}

html = replaceBlock(html, "CARDS", events.map(card).join("\n\n"));
html = replaceBlock(html, "DATA", `      ${island()}`);
writeFileSync(indexPath, html, "utf8");

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  `  <url><loc>${BASE}</loc><lastmod>${data.site.updated}</lastmod></url>`,
  ...events.map((ev) => `  <url><loc>${BASE}e/${ev.id}.html</loc><lastmod>${ev.verified}</lastmod></url>`),
  "</urlset>", ""
].join("\n");
writeFileSync(join(ROOT, "sitemap.xml"), sitemap, "utf8");
writeFileSync(join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`, "utf8");

console.log(`OK  ${events.length} evenements | ${pages} pages | ${icsFiles} fichiers ics | index.html, sitemap.xml, robots.txt regeneres`);
