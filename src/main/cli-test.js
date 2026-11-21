'use strict';
// node src/main/cli-test.js C:\  -> prints a classification summary (no UI)
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '24';
const { scan } = require('./scanner');

const gb = (b) => (b / 1024 ** 3).toFixed(2) + ' GB';
const roots = process.argv.slice(2);
if (!roots.length) roots.push('C:\\');

(async () => {
  let last = 0;
  const res = await scan(roots, {
    onProgress: (p) => {
      if (Date.now() - last > 2000) { last = Date.now(); process.stderr.write(`  ${p.files} arquivos, ${gb(p.bytes)} / ${gb(p.expected)}\n`); }
    },
  });
  console.log(`\n${res.totals.files} arquivos, ${res.totals.dirs} pastas, ${res.totals.denied} negadas, ${(res.durationMs / 1000).toFixed(1)}s`);
  for (const d of res.drives) { console.log(`${d.root} usado ${gb(d.used)} lido ${gb(d.scanned)}`); if (process.env.DENIED) console.log(d.denied.slice(0, 40).join('\n')); }
  for (const c of res.categories) {
    if (!c.bytes) continue;
    console.log(`\n## ${c.label}  ${gb(c.bytes)}  (${c.sourceCount} fontes)`);
    for (const s of c.sources.slice(0, Number(process.env.TOP || 12))) {
      console.log(`   ${gb(s.bytes).padStart(10)}  ${s.label}  [${s.tags.join(', ')}]  ${s.paths[0] && s.paths[0].path}`);
    }
  }
})();
