#!/usr/bin/env node
/**
 * Cyclomatic complexity report for the Consumption Dashboard sources.
 *
 * Zero-dependency heuristic analyzer for TS/TSX:
 *   CC(function) = 1 + decision points (if / else if / for / while / do /
 *   case / catch / && / || / ?? / ternary "?").
 * Nested functions count toward their enclosing declaration (pragmatic
 * heuristic — good for spotting hotspots, not a compiler-grade metric).
 *
 * Usage:
 *   node scripts/complexity.mjs             # report, sorted by CC desc
 *   node scripts/complexity.mjs --all       # include CC ≤ 5 functions
 *   node scripts/complexity.mjs --ci        # exit 1 if any CC ≥ FAIL_AT
 *
 * Thresholds: WARN_AT 10 (⚠ refactor candidate) · FAIL_AT 15 (✖ too complex).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["ui/app", "api"];
const EXTS = [".ts", ".tsx"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".dt-app", ".git"]);
const WARN_AT = 10;
const FAIL_AT = 15;

const argv = process.argv.slice(2);
const args = new Set(argv);
const SHOW_ALL = args.has("--all");
const CI = args.has("--ci");
/** Optional --file=path restricts analysis to a single file (debug/review aid). */
const ONLY_FILE = argv.find((a) => a.startsWith("--file="))?.slice(7) ?? null;

// ── File discovery ───────────────────────────────────────────────────────────
function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (EXTS.some((e) => name.endsWith(e))) yield p;
  }
}

// ── Source cleaning: blank out comments and string/template contents ─────────
// Preserves length and line breaks so offsets → line numbers stay correct.
// Uses a brace stack so `${…}` interpolations correctly RETURN to template
// mode on their closing brace (nested templates included). Known heuristic
// limit: bare apostrophes/quotes inside JSX text nodes are lexed as string
// openers and can blank a short span — acceptable for hotspot reporting.
function clean(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let mode = "code"; // code | line | block | sq | dq | tpl
  const braces = []; // "brace" for ordinary { in code, "tpl" for ${ openings
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (mode === "code") {
      if (c === "/" && c2 === "/") { mode = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && c2 === "*") { mode = "block"; out += "  "; i += 2; continue; }
      if (c === "'") { mode = "sq"; out += c; i++; continue; }
      if (c === '"') { mode = "dq"; out += c; i++; continue; }
      if (c === "`") { mode = "tpl"; out += c; i++; continue; }
      if (c === "{") { braces.push("brace"); out += c; i++; continue; }
      if (c === "}") {
        if (braces.pop() === "tpl") { mode = "tpl"; out += " "; i++; continue; }
        out += c; i++; continue;
      }
      out += c; i++; continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; } else out += " ";
      i++; continue;
    }
    if (mode === "block") {
      if (c === "*" && c2 === "/") { mode = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    if (mode === "sq" || mode === "dq") {
      const q = mode === "sq" ? "'" : '"';
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === q) { mode = "code"; out += c; i++; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    if (mode === "tpl") {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === "$" && c2 === "{") { braces.push("tpl"); mode = "code"; out += "  "; i += 2; continue; }
      if (c === "`") { mode = "code"; out += c; i++; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
  }
  return out;
}

// ── Function discovery ───────────────────────────────────────────────────────
const FN_PATTERNS = [
  // function declaration / expression with a name
  /\bfunction\s+([A-Za-z0-9_$]+)\s*\(/g,
  // const name = (…) =>  |  const name = async (…) =>  |  const name = function
  /\b(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=]{0,120})?=\s*(?:async\s*)?(?:function\b|\()/g,
  // object property / class method: name(…) {   (excluding keywords)
  /(?<![.\w$])(?!if\b|for\b|while\b|switch\b|catch\b|return\b|else\b|do\b|new\b|typeof\b)([A-Za-z0-9_$]+)\s*\(([^()]|\([^()]*\))*\)\s*{/g,
];

function findBodyRange(src, fromIdx) {
  // Find first '{' at/after fromIdx, then brace-match to its close.
  let i = src.indexOf("{", fromIdx);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return [i, j];
    }
  }
  return null;
}

function matchParen(src, openIdx) {
  // src[openIdx] must be "(" — returns index of its matching ")".
  let d = 0;
  for (let j = openIdx; j < src.length; j++) {
    if (src[j] === "(") d++;
    else if (src[j] === ")") { d--; if (d === 0) return j; }
  }
  return -1;
}

/**
 * Body range for a match whose param list STARTS at `parenIdx`. Handles
 * destructured params (`({ a, b })`) that would fool a naive "first {" scan:
 * paren-match the param list first, then look for `=>` (arrow) or `{`
 * (declaration/expression) AFTER the closing paren. Arrow expression bodies
 * (no braces) span to the next `;` or newline at depth 0.
 */
function findFnBody(src, parenIdx) {
  const close = matchParen(src, parenIdx);
  if (close < 0) return null;
  // Skip return-type annotation etc. while searching for "=>" or "{" nearby.
  const lookahead = src.slice(close + 1, close + 200);
  const arrowRel = lookahead.indexOf("=>");
  const braceRel = lookahead.indexOf("{");
  if (arrowRel >= 0 && (braceRel < 0 || arrowRel < braceRel)) {
    // Arrow function: body starts after "=>".
    let k = close + 1 + arrowRel + 2;
    while (k < src.length && /\s/.test(src[k])) k++;
    if (src[k] === "{") return findBodyRange(src, k);
    // Expression body — take until ; or newline at zero paren/brace depth.
    let d = 0;
    for (let j = k; j < src.length; j++) {
      const ch = src[j];
      if (ch === "(" || ch === "{" || ch === "[") d++;
      else if (ch === ")" || ch === "}" || ch === "]") { if (d === 0) return [k, j]; d--; }
      else if ((ch === ";" || ch === "\n") && d === 0) return [k, j];
    }
    return [k, src.length - 1];
  }
  if (braceRel >= 0) return findBodyRange(src, close + 1 + braceRel);
  return null;
}

const DECISIONS = [
  /\bif\s*\(/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bdo\b/g,
  /\bcase\s/g,
  /\bcatch\s*\(/g,
  /&&/g,
  /\|\|/g,
  /\?\?/g,
  /\?(?!\?|\.)/g, // ternary (not ?? and not optional chaining ?.)
];

function complexityOf(body) {
  let cc = 1;
  for (const re of DECISIONS) {
    re.lastIndex = 0;
    const m = body.match(re);
    if (m) cc += m.length;
  }
  return cc;
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

// ── Analysis ─────────────────────────────────────────────────────────────────
const results = [];
const perFile = new Map();

const files = ONLY_FILE
  ? [[ONLY_FILE]]
  : ROOTS.map((r) => [...walk(r)]);
for (const rootFiles of files) {
  for (const file of rootFiles) {
    const raw = readFileSync(file, "utf8");
    const src = clean(raw);
    const rel = relative(".", file).replace(/\\/g, "/");
    const seen = new Set(); // avoid duplicate ranges from overlapping patterns
    let fileCc = 0;

    for (const pattern of FN_PATTERNS) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(src)) !== null) {
        const name = m[1] ?? "(anonymous)";
        const endIdx = m.index + m[0].length - 1;
        // Param-list-aware body resolution: when the match ends at "(", the
        // params may contain destructuring braces — paren-match first.
        // Method-pattern matches end at "{" (already the body opener).
        const range = src[endIdx] === "("
          ? findFnBody(src, endIdx)
          : src[endIdx] === "{"
            ? findBodyRange(src, endIdx)
            : findFnBody(src, src.indexOf("(", endIdx));
        if (!range) continue;
        const key = `${range[0]}-${range[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const body = src.slice(range[0], range[1] + 1);
        const cc = complexityOf(body);
        fileCc += cc;
        results.push({ file: rel, name, line: lineOf(src, m.index), cc });
      }
    }
    perFile.set(rel, (perFile.get(rel) ?? 0) + fileCc);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
results.sort((a, b) => b.cc - a.cc || a.file.localeCompare(b.file));
const shown = SHOW_ALL ? results : results.filter((r) => r.cc > 5);

const flag = (cc) => (cc >= FAIL_AT ? "✖" : cc >= WARN_AT ? "⚠" : " ");
const pad = (s, w) => String(s).padEnd(w);

console.log("\nCyclomatic complexity — consumption-dashboard");
console.log(`thresholds: ⚠ ≥ ${WARN_AT} (refactor candidate) · ✖ ≥ ${FAIL_AT} (too complex)\n`);
console.log(`${pad("CC", 5)}${pad("", 2)}${pad("Function", 34)}${pad("Line", 6)}File`);
console.log("─".repeat(96));
for (const r of shown) {
  console.log(`${pad(r.cc, 5)}${pad(flag(r.cc), 2)}${pad(r.name.slice(0, 32), 34)}${pad(r.line, 6)}${r.file}`);
}

const worstFiles = [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log("\nTop files by total complexity:");
for (const [f, cc] of worstFiles) console.log(`  ${pad(cc, 6)}${f}`);

const warns = results.filter((r) => r.cc >= WARN_AT && r.cc < FAIL_AT).length;
const fails = results.filter((r) => r.cc >= FAIL_AT).length;
console.log(`\n${results.length} functions analyzed · ${warns} ⚠ warnings · ${fails} ✖ over limit\n`);

if (CI && fails > 0) {
  console.error(`CI mode: ${fails} function(s) at or above CC ${FAIL_AT} — failing.`);
  process.exit(1);
}
