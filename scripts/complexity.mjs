#!/usr/bin/env node
/**
 * Cyclomatic complexity report for the Consumption Dashboard sources.
 *
 * AST-based (TypeScript compiler API — already a project dependency, so still
 * zero ADDED dependencies): CC(function) = 1 + decision points, measured on
 * real syntax nodes:
 *   if / for / for-in / for-of / while / do / case / catch / ternary
 *   / && / || / ??
 * Each function-like node (declaration, method, arrow, function expression,
 * accessor, constructor) is measured SEPARATELY — a React component's CC no
 * longer absorbs the callbacks defined inside it, so the number points at the
 * actual function to fix.
 *
 * Usage:
 *   node scripts/complexity.mjs             # report, sorted by CC desc
 *   node scripts/complexity.mjs --all       # include CC ≤ 5 functions
 *   node scripts/complexity.mjs --ci        # exit 1 if any CC ≥ FAIL_AT
 *   node scripts/complexity.mjs --file=ui/app/pages/BillingOverview.tsx
 *
 * Thresholds: WARN_AT 10 (⚠ refactor candidate) · FAIL_AT 25 (✖ too complex).
 * FAIL_AT is calibrated to the current worst offenders on record — lower it as
 * they get refactored so the gate keeps ratcheting down, never up.
 *
 * Reading the numbers:
 *   1–5    simple — fine
 *   6–10   moderate — acceptable
 *   11–24  complex — every path is a test case; split when touched next
 *   25+    refactor candidate — maintenance risk, fails --ci
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["ui/app", "api"];
const EXTS = [".ts", ".tsx"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".dt-app", ".git"]);
const WARN_AT = 10;
const FAIL_AT = 25;

const argv = process.argv.slice(2);
const args = new Set(argv);
const SHOW_ALL = args.has("--all");
const CI = args.has("--ci");
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
    else if (EXTS.some((e) => name.endsWith(e)) && !name.endsWith(".d.ts")) yield p;
  }
}

// ── Function-like detection & naming ─────────────────────────────────────────
const isFn = (n) =>
  ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) ||
  ts.isArrowFunction(n) || ts.isFunctionExpression(n) ||
  ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isConstructorDeclaration(n);

function nameOf(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  const p = node.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isExportAssignment(p)) return "(default export)";
  if (p && ts.isCallExpression(p)) {
    const callee = p.expression.getText().split("\n")[0].slice(0, 36);
    return `(callback → ${callee})`;
  }
  return "(anonymous)";
}

// ── CC of one function body (nested functions measured separately) ───────────
function complexityOf(fn) {
  let cc = 1;
  const visit = (node) => {
    if (node !== fn && isFn(node)) return; // nested fn → its own entry
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
        cc++;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const op = node.operatorToken.kind;
        if (op === ts.SyntaxKind.AmpersandAmpersandToken ||
            op === ts.SyntaxKind.BarBarToken ||
            op === ts.SyntaxKind.QuestionQuestionToken) cc++;
        break;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  return cc;
}

// ── Scan ─────────────────────────────────────────────────────────────────────
const files = [];
for (const r of ROOTS) files.push(...walk(join(ROOT, r)));
const targets = ONLY_FILE
  ? files.filter((f) => relative(ROOT, f).replace(/\\/g, "/") === ONLY_FILE.replace(/\\/g, "/"))
  : files;

const results = [];
for (const file of targets) {
  const sf = ts.createSourceFile(
    file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const visit = (node) => {
    if (isFn(node) && node.body) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      results.push({ file: rel, line: line + 1, name: nameOf(node), cc: complexityOf(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

results.sort((a, b) => b.cc - a.cc || a.file.localeCompare(b.file) || a.line - b.line);

// ── Report ───────────────────────────────────────────────────────────────────
const mark = (cc) => (cc >= FAIL_AT ? "✖" : cc >= WARN_AT ? "⚠" : " ");
const shown = SHOW_ALL ? results : results.filter((r) => r.cc > 5);

console.log(`\nCyclomatic complexity — ${results.length} functions in ${targets.length} files`);
console.log(`(WARN ≥ ${WARN_AT} · FAIL ≥ ${FAIL_AT} · showing CC > 5${SHOW_ALL ? " + all" : ", use --all for everything"})\n`);
console.log("  CC".padEnd(7) + "fn".padEnd(44) + "location");
console.log("─".repeat(100));
for (const r of shown) {
  console.log(`${mark(r.cc)} ${String(r.cc).padStart(3)}  ${r.name.slice(0, 42).padEnd(44)}${r.file}:${r.line}`);
}

// per-file rollup
const byFile = new Map();
for (const r of results) {
  const e = byFile.get(r.file) ?? { fns: 0, total: 0, worst: 0 };
  e.fns++; e.total += r.cc; e.worst = Math.max(e.worst, r.cc);
  byFile.set(r.file, e);
}
console.log("\nPer-file (top 12 by worst function):\n");
console.log("worst".padStart(6) + "avg".padStart(7) + "fns".padStart(6) + "   file");
console.log("─".repeat(80));
for (const [file, e] of [...byFile.entries()].sort((a, b) => b[1].worst - a[1].worst).slice(0, 12)) {
  console.log(String(e.worst).padStart(6) + (e.total / e.fns).toFixed(1).padStart(7) + String(e.fns).padStart(6) + "   " + file);
}

const complex = results.filter((r) => r.cc >= WARN_AT).length;
const failing = results.filter((r) => r.cc >= FAIL_AT);
console.log(`\nSummary: ${failing.length} function(s) ≥ ${FAIL_AT} (fail), ${complex} ≥ ${WARN_AT} (warn).`);

if (CI && failing.length > 0) {
  console.error(`\n✖ CI gate: ${failing.length} function(s) at or above ${FAIL_AT}:`);
  for (const r of failing) console.error(`   ${r.cc}  ${r.name}  ${r.file}:${r.line}`);
  process.exit(1);
}
