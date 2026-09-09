// Tests de non-régression du calendrier.
// Prérequis : npm install   (installe Playwright en devDependency)
// Usage     : node tools/check.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = pathToFileURL(join(ROOT, "index.html")).href;
const data = JSON.parse(readFileSync(join(ROOT, "events.json"), "utf8"));

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `  attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`}`);
}
function atLeast(label, actual, min) {
  const ok = actual >= min;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `  attendu >= ${min}, obtenu ${actual}`}`);
}

const browser = await chromium.launch({ channel: "msedge" });
const errors = [];

async function newPage(opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return { ctx, page };
}

// 1. Chargement nominal
{
  const { ctx, page } = await newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(INDEX, { waitUntil: "load" });
  check("nombre de cartes", await page.locator(".card").count(), data.events.length);
  check("îlot de données présent", await page.locator("#events-data").count(), 1);

  // 2. Recherche tolérante
  const q = async (text) => {
    await page.locator("#q").fill(text);
    return page.locator("#grid .card:not(.is-hidden), #archive-grid .card:not(.is-hidden)").count();
  };
  atLeast("recherche sans accent « superieur »", await q("superieur"), 1);
  check("recherche multi-mots « copilot delaware »", await q("copilot delaware"), 1);
  check("recherche multi-mots « fabric zaventem »", await q("fabric zaventem"), 1);
  atLeast("recherche « presentiel »", await q("presentiel"), 1);
  atLeast("recherche néerlandaise « onderzoek »", await q("onderzoek"), 1);
  check("recherche sans résultat", await q("zzzz"), 0);
  check("message vide affiché", await page.locator("#empty").isVisible(), true);

  // 3. Réinitialisation
  await page.locator("#reset").click();
  check("réinitialisation vide la recherche", await page.locator("#q").inputValue(), "");
  check("réinitialisation restaure le thème", await page.locator("#f-theme").inputValue(), "all");

  // 4. Filtres
  await page.selectOption("#f-theme", "copilot");
  check("filtre thème Copilot", await page.locator("#grid .card:not(.is-hidden)").count(),
    data.events.filter((e) => e.theme === "copilot").length);
  await page.locator("#reset").click();

  // 5. Impression : la sélection à l'écran est respectée
  await page.selectOption("#f-theme", "research");
  const onScreen = await page.locator(".card:not(.is-hidden)").count();
  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  const printed = await page.evaluate(() =>
    [...document.querySelectorAll(".card")].filter((e) => getComputedStyle(e).display !== "none").length);
  check("impression = sélection écran", printed, onScreen);
  check("texte d'impression sombre", await page.evaluate(() => getComputedStyle(document.body).color), "rgb(17, 17, 17)");
  await page.emulateMedia({ media: "screen", colorScheme: "light" });
  await page.locator("#reset").click();

  // 6. Absence de débordement horizontal
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`pas de débordement à ${width}px`, over <= 0, true);
  }
  await ctx.close();
}

// 7. État dans l'URL
{
  const { ctx, page } = await newPage();
  await page.goto(`${INDEX}?lang=nl&theme=copilot&fmt=online`, { waitUntil: "load" });
  check("langue restaurée depuis l'URL", await page.evaluate(() => document.documentElement.lang), "nl");
  check("thème restauré depuis l'URL", await page.locator("#f-theme").inputValue(), "copilot");
  await ctx.close();
}

// 8. Événements passés : bascule automatique
{
  const { ctx, page } = await newPage();
  await page.clock.install({ time: new Date("2027-01-15T09:00:00") });
  await page.goto(INDEX, { waitUntil: "load" });
  check("tous les événements sont archivés en 2027", await page.locator("#archive-grid .card").count(), data.events.length);
  check("grille principale vide", await page.locator("#grid .card").count(), 0);
  await ctx.close();
}

// 9. Pages et fichiers par événement
{
  const { ctx, page } = await newPage();
  for (const ev of data.events) {
    const url = pathToFileURL(join(ROOT, "e", `${ev.id}.html`)).href;
    const res = await page.goto(url, { waitUntil: "load" });
    if (!res || res.status() >= 400) { failures++; console.log(`FAIL  page ${ev.id} introuvable`); continue; }
    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    JSON.parse(ld);
  }
  console.log(`  ok  ${data.events.length} pages événement avec données structurées valides`);
  await ctx.close();
}

// 10. Aucune erreur JavaScript
check("aucune erreur console/page", errors, []);

await browser.close();
console.log(failures === 0 ? "\nTous les contrôles sont passés." : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);

