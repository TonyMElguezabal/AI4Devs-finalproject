#!/usr/bin/env node
// redesign-visual-design (JOS-198), design Decision 8 — WCAG contrast of every documented text/background pair,
// in both themes, computed from frontend/src/styles/tokens.css (hex colours only; tints use the tokens'
// --tint-* percentages, mixed in sRGB exactly like the CSS `color-mix(in srgb, …)` the stylesheet uses).
//
//   node contrast.mjs [path/to/tokens.css]      exit 1 if any pair is under its minimum
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(process.argv[2] ?? resolve(here, "../../../../frontend/src/styles/tokens.css"));
const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const declarations = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const darkBlock = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/);
const lightBlock = css.replace(darkBlock?.[0] ?? "", "").match(/:root\s*\{([^}]*)\}/);
if (!lightBlock) throw new Error(`no :root block in ${file}`);
const light = declarations(lightBlock[1]);
const themes = { light, ...(darkBlock ? { dark: { ...light, ...declarations(darkBlock[1]) } } : {}) };

const rgb = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const mix = (fg, bg, pct) => fg.map((c, i) => c * (pct / 100) + bg[i] * (1 - pct / 100));
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const STATUSES = ["complete", "progress", "failed", "queued"];
let failures = 0;
let checked = 0;

for (const [theme, t] of Object.entries(themes)) {
  const color = (name, fallback) => {
    const v = t[name] ?? (fallback ? t[fallback] : undefined);
    return v && v.startsWith("#") ? rgb(v) : undefined;
  };
  const pct = (name, dflt) => (t[name] ? parseFloat(t[name]) : dflt);
  const bg = color("--color-bg");
  const surface = color("--color-surface", "--color-bg");
  const sunken = color("--color-surface-sunken");
  const text = color("--color-text");
  const muted = color("--color-muted");
  const accent = color("--color-accent");
  const onAccent = color("--color-on-accent");
  const pill = pct("--tint-pill", 13);
  const callout = pct("--tint-callout", 9);

  const pairs = [];
  const add = (label, fg, back, min = 4.5) => fg && back && pairs.push({ label, fg, back, min });
  add("text on page", text, bg);
  add("text on surface", text, surface);
  add("muted on page", muted, bg);
  add("muted on surface", muted, surface);
  add("muted on sunken surface", muted, sunken);
  add("text on sunken surface", text, sunken);
  add("accent on surface", accent, surface);
  add("accent on page", accent, bg);
  add("on-accent on accent (primary button)", onAccent, accent);
  for (const s of STATUSES) {
    const c = color(`--color-status-${s}`);
    if (!c || !surface) continue;
    add(`status ${s} on surface`, c, surface);
    add(`status ${s} on pill tint (${pill}%)`, c, mix(c, surface, pill));
    add(`status ${s} on callout tint (${callout}%)`, c, mix(c, surface, callout));
    add(`text on status ${s} callout tint`, text, mix(c, surface, callout));
  }

  console.log(`\n## ${theme} theme (${relative(resolve(here, "../../../.."), file)})\n`);
  console.log("| pair | ratio | min | result |\n|---|---|---|---|");
  for (const p of pairs) {
    const r = ratio(p.fg, p.back);
    const ok = r >= p.min;
    checked += 1;
    if (!ok) failures += 1;
    console.log(`| ${p.label} | ${r.toFixed(2)} | ${p.min} | ${ok ? "pass" : "FAIL"} |`);
  }
}
console.log(`\n${checked} pairs checked, ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
