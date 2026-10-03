// `pnpm check:i18n`: comprueba las traducciones de la web (AGENTS.md §2.5 y §6).
//   1. Todos los idiomas tienen exactamente las mismas claves por namespace.
//   2. Toda clave usada en el código existe en español. Se entienden varios traductores por fichero:
//        const { t } = useTranslation("auth");       → t("login.title")      ≡ auth:login.title
//        const { t: tc } = useTranslation();         → tc("actions.save")    ≡ common:actions.save
//        t("errors:network")                         → prefijo explícito
//      (las claves construidas dinámicamente con `${…}` se omiten).
//   3. Avisa (no falla) de claves huérfanas y de plurales (`_one`/`_other`) tratados como una sola clave.
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

/** Quita el sufijo de plural de i18next para comparar con la clave usada en el código. */
const basePluralKey = (k) => k.replace(/_(zero|one|two|few|many|other)$/, "");

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

// ¿Existe la clave (o alguna de sus formas plurales) en español?
const exists = (ns, key) => {
  const set = base[ns];
  if (!set) return false;
  if (set.has(key)) return true;
  return [...set].some((k) => basePluralKey(k) === key);
};

// 2 y 3. Claves usadas vs. definidas -------------------------------------------------------------
const sources = walk(
  webSrc,
  (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !f.includes("locales"),
);
const used = new Set();
const hookRe =
  /const\s*\{\s*t(?:\s*:\s*(\w+))?\s*\}\s*=\s*useTranslation\(\s*(?:["'`](\w+)["'`])?\s*\)/g;
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  const translators = new Map(); // nombre de variable → namespace por defecto
  for (const m of text.matchAll(hookRe)) translators.set(m[1] ?? "t", m[2] ?? DEFAULT_NS);
  if (translators.size === 0) translators.set("t", DEFAULT_NS);

  for (const [varName, defaultNs] of translators) {
    const callRe = new RegExp(`(?<![\\w.])${varName}\\(\\s*["'\`]([^"'\`$]+)["'\`]`, "g");
    for (const m of text.matchAll(callRe)) {
      const raw = m[1];
      const [ns, key] = raw.includes(":") ? raw.split(":") : [defaultNs, raw];
      used.add(`${ns}:${basePluralKey(key)}`);
      if (!exists(ns, key)) errors.push(`${relative(root, file)}: clave no definida ${ns}:${key}`);
    }
  }
}
for (const [ns, keys] of Object.entries(base)) {
  for (const k of keys) {
    if (!used.has(`${ns}:${basePluralKey(k)}`)) {
      warnings.push(`clave huérfana o dinámica (no se ve su uso literal) ${ns}:${k}`);
    }
  }
}

// 4. Texto literal en JSX --------------------------------------------------------------------------
// Heurística: texto entre etiquetas con letras (>Hola<) que no sea una expresión {…}.
// `(?<!=)` ignora las flechas `=>` (p. ej. `() => api<T>(…)`), que no son JSX.
const literalRe = /(?<!=)>\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^<>{}]*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.!?:])\s*</g;
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

if (process.env.CHECK_I18N_VERBOSE) for (const w of warnings) console.warn(`aviso: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\ncheck:i18n falló con ${errors.length} error(es).`);
  process.exit(1);
}
console.log(
  `check:i18n OK (${langs.length} idiomas, ${used.size} claves en uso, ${warnings.length} dinámicas/huérfanas; CHECK_I18N_VERBOSE=1 para verlas).`,
);
