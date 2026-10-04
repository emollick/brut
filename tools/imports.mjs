// Static check: every named import must be exported by the file it points at.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site', 'js');
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p); } })(root);
const exportsOf = (src) => { const out = new Set(); for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]); for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const t = n.trim().split(/\s+as\s+/).pop(); if (t) out.add(t); } return out; };
const cache = new Map(); let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+(?:\*\s+as\s+\w+|\{([^}]*)\})\s+from\s+'([^']+)'/g)) {
    if (!m[2].startsWith('.')) continue;
    const target = path.resolve(path.dirname(f), m[2]);
    if (!fs.existsSync(target)) { console.log('MISSING FILE', path.relative(root, f), '->', m[2]); bad++; continue; }
    if (!m[1]) continue;
    if (!cache.has(target)) cache.set(target, exportsOf(fs.readFileSync(target, 'utf8')));
    for (const n of m[1].split(',')) { const name = n.trim().split(/\s+as\s+/)[0]; if (name && !cache.get(target).has(name)) { console.log('NO EXPORT', path.relative(root, f), 'wants', name, 'from', m[2]); bad++; } }
  }
}
console.log(files.length + ' files, ' + bad + ' import problems');
process.exit(bad ? 1 : 0);
