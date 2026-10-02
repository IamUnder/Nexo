// `pnpm check:i18n`: comprueba las traducciones de la web (AGENTS.md §2.5 y §6).
//   1. Todos los idiomas tienen exactamente las mismas claves por namespace.
//   2. Toda clave usada en el código (`t("ns:clave")` / `t("clave")`) existe en español.
//   3. Avisa (no falla) de claves huérfanas.
//   4. Falla si hay texto literal visible en JSX (prohibido: todo va por i18n).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const webSrc = join(root, "apps/web/src");
const localesDir = join(webSrc, "locales");
const DEFAULT_LANG = "es";
const DEFAULT_NS = "common";

const errors = [];
const warnings = [];

function walk(dir, filter) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, filter) : filter(full) ? [full] : [];
  });
}

function flatten(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

// 1. Paridad entre idiomas ----------------------------------------------------------------------
const langs = readdirSync(localesDir).filter((n) => statSync(join(localesDir, n)).isDirectory());
const keysByLang = {};
for (const lang of langs) {
  keysByLang[lang] = {};
  for (const file of readdirSync(join(localesDir, lang)).filter((f) => f.endsWith(".json"))) {
    const ns = file.replace(/\.json$/, "");
    keysByLang[lang][ns] = new Set(
      flatten(JSON.parse(readFileSync(join(localesDir, lang, file), "utf8"))),
    );
  }
}
const base = keysByLang[DEFAULT_LANG];
if (!base) {
  console.error(`No existe el idioma base «${DEFAULT_LANG}» en ${relative(root, localesDir)}`);
  process.exit(1);
}
for (const lang of langs.filter((l) => l !== DEFAULT_LANG)) {
  for (const ns of new Set([...Object.keys(base), ...Object.keys(keysByLang[lang])])) {
    const a = base[ns] ?? new Set();
    const b = keysByLang[lang][ns] ?? new Set();
    for (const k of a) if (!b.has(k)) errors.push(`[${lang}] falta la clave ${ns}:${k}`);
    for (const k of b)
      if (!a.has(k))
        errors.push(`[${lang}] clave sobrante (no existe en ${DEFAULT_LANG}) ${ns}:${k}`);
  }
}

// 2 y 3. Claves usadas vs. definidas -------------------------------------------------------------
const sources = walk(
  webSrc,
  (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !f.includes("locales"),
);
const used = new Set();
const callRe = /\bt\(\s*["'`]([^"'`$]+)["'`]/g;
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(callRe)) {
    const raw = m[1];
    const [ns, key] = raw.includes(":") ? raw.split(":") : [DEFAULT_NS, raw];
    used.add(`${ns}:${key}`);
    if (!base[ns]?.has(key)) errors.push(`${relative(root, file)}: clave no definida ${ns}:${key}`);
  }
}
for (const [ns, keys] of Object.entries(base)) {
  for (const k of keys)
    if (!used.has(`${ns}:${k}`))
      warnings.push(`clave huérfana (no se usa en el código) ${ns}:${k}`);
}

// 4. Texto literal en JSX --------------------------------------------------------------------------
// Heurística: texto entre etiquetas con letras (>Hola<) que no sea una expresión {…}.
const literalRe = />\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^<>{}]*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.!?:])\s*</g;
for (const file of sources.filter((f) => f.endsWith(".tsx"))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(literalRe)) {
    const before = text.slice(0, m.index);
    const line = before.split("\n").length;
    errors.push(
      `${relative(root, file)}:${line}: texto literal en JSX «${m[1].trim()}» (usa i18n)`,
    );
  }
}

for (const w of warnings) console.warn(`aviso: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\ncheck:i18n falló con ${errors.length} error(es).`);
  process.exit(1);
}
console.log(`check:i18n OK (${langs.length} idiomas, ${used.size} claves en uso).`);
