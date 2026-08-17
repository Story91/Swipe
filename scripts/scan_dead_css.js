/*
 * Dead-CSS scan that understands class names built from data.
 *
 * The naive version matched literal substrings and called 310 classes dead.
 * Many of those are live: this codebase writes `al-row--${log.status}` and
 * `ab-side--${x ? 'yes' : 'no'}`, so a class can be used and never appear as
 * text. Deleting on the naive result would break exactly the rare states.
 *
 * This one treats a CSS class as REFERENCED if either:
 *   a) its full name appears literally in a .ts/.tsx file, or
 *   b) it starts with a prefix that some interpolation site can extend, e.g.
 *      a `foo--${...}` in the source makes every `.foo--*` class reachable.
 *
 * (b) is deliberately generous. A scan that deletes something live is far more
 * expensive than one that keeps something dead.
 */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const ROOT = process.cwd();
const skip = new Set(['node_modules', '.next', '.next-verify', '.next-check', '.git', 'artifacts', 'cache']);

function walk(dir, test, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, test, out);
    else if (test(full)) out.push(full);
  }
  return out;
}

const cssFiles = walk(path.join(ROOT, 'app'), f => f.endsWith('.css'));
const codeFiles = [
  ...walk(path.join(ROOT, 'app'), f => /\.tsx?$/.test(f)),
  ...walk(path.join(ROOT, 'components'), f => /\.tsx?$/.test(f)),
  ...walk(path.join(ROOT, 'lib'), f => /\.tsx?$/.test(f)),
];

const code = codeFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

// Every prefix that an interpolation can extend: the text immediately before
// a ${...} inside a template literal, trimmed back to the last class token.
const dynamicPrefixes = new Set();
for (const m of code.matchAll(/`([^`]*)`/g)) {
  for (const seg of m[1].split('${')) {
    const tail = seg.split(/\s/).pop() || '';
    if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tail) && tail.length >= 3) dynamicPrefixes.add(tail);
  }
}

const classes = new Set();
for (const f of cssFiles) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]{2,})/g)) {
    classes.add(m[1]);
  }
}

/*
 * Third filter: recency.
 *
 * A class staged for work in flight is indistinguishable from a dead one by
 * any static measure. `dragging-live` was written into TinderCard.css for a
 * gesture engine that has not landed yet, and reads as dead here.
 *
 * It is not indistinguishable historically, though: staged classes are new.
 * Anything whose name was added to a stylesheet in the last 30 CSS commits is
 * withheld, on the assumption that nobody writes CSS for something they are
 * about to delete. That turns the one judgement call in this scan into a
 * question with an answer in git.
 */
const recentlyTouched = new Set();
try {
  const diff = execSync('git log -30 -p --unified=0 -- "*.css"', {
    maxBuffer: 1 << 28,
  }).toString();
  for (const m of diff.matchAll(/^\+[^+][^{]*?\.([a-zA-Z][a-zA-Z0-9_-]{2,})/gm)) {
    recentlyTouched.add(m[1]);
  }
} catch {
  // No git history reachable; the filter simply does not apply.
}

const dead = [];
const staged = [];
for (const c of classes) {
  if (code.includes(c)) continue;
  let reachable = false;
  for (const p of dynamicPrefixes) {
    if (c.startsWith(p)) { reachable = true; break; }
  }
  if (reachable) continue;
  if (recentlyTouched.has(c)) { staged.push(c); continue; }
  dead.push(c);
}

console.log('css classes defined :', classes.size);
console.log('interpolation prefixes:', dynamicPrefixes.size);
console.log('NAIVE dead           :', [...classes].filter(c => !code.includes(c)).length);
console.log('withheld as recent   :', staged.length);
console.log('SAFE to delete       :', dead.length);
console.log('\nsample of the safe-to-delete set:');
console.log(dead.slice(0, 25).join(', '));
