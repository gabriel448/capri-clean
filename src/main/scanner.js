'use strict';
/* Scan job. Runs inside a worker thread (see main.js) or directly from the CLI test. */
const fs = require('fs');
const { walk } = require('./walk');
const { execFileSync } = require('child_process');
const { Aggregator, classifyTree, finish, addSpecial } = require('./classify');

// pagefile/hiberfil refuse to be opened, but `dir` still lists their size
function rootSpecialFiles(root) {
  try {
    const out = execFileSync('cmd.exe', ['/d', '/c', 'dir', '/a', '/-c', root], { encoding: 'latin1', windowsHide: true, timeout: 15000 });
    const res = [];
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/\s(\d{4,})\s+(pagefile\.sys|hiberfil\.sys|swapfile\.sys)\s*$/i);
      if (m) res.push({ name: m[2].toLowerCase(), size: Number(m[1]) });
    }
    return res;
  } catch {
    return [];
  }
}

const SKIP = [
  /^[a-z]:\\windows\\winsxs$/, // hard links into System32: counting them doubles Windows
  /^[a-z]:\\system volume information$/,
];

async function driveInfo(root) {
  try {
    const s = await fs.promises.statfs(root);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { root, total, free, used: total - free };
  } catch {
    return null;
  }
}

async function listDrives() {
  const out = [];
  for (let i = 67; i <= 90; i++) { // C..Z
    const root = String.fromCharCode(i) + ':\\';
    const info = await driveInfo(root);
    if (info && info.total > 0) out.push(info);
  }
  return out;
}

async function scan(roots, { onProgress, shouldStop } = {}) {
  const started = Date.now();
  const agg = new Aggregator();
  const drives = [];
  const totals = { files: 0, dirs: 0, bytes: 0, denied: 0 };
  const infos = [];
  for (const r of roots) infos.push((await driveInfo(r)) || { root: r, total: 0, free: 0, used: 0 });
  const expected = infos.reduce((a, d) => a + d.used, 0) || 1;

  for (const info of infos) {
    if (shouldStop && shouldStop()) break;
    const base = { ...totals };
    const walked = await walk(info.root, {
      shouldStop,
      skip: (pl) => SKIP.some((re) => re.test(pl)),
      onProgress: (s) => onProgress && onProgress({
        files: base.files + s.files,
        dirs: base.dirs + s.dirs,
        bytes: base.bytes + s.bytes,
        expected,
        drive: info.root,
        current: s.current,
      }),
    });
    totals.files += walked.stats.files;
    totals.dirs += walked.stats.dirs;
    totals.bytes += walked.stats.bytes;
    totals.denied += walked.stats.denied;
    onProgress && onProgress({ ...totals, expected, drive: info.root, current: 'Classificando…', phase: 'classify' });
    classifyTree(agg, walked);
    let scanned = walked.root.sub;
    for (const f of rootSpecialFiles(info.root)) { addSpecial(agg, info.root, f.name, f.size); scanned += f.size; }
    drives.push({ ...info, scanned, denied: walked.stats.deniedList });
  }

  const categories = finish(agg, drives);
  return {
    drives,
    categories,
    totals,
    stopped: !!(shouldStop && shouldStop()),
    durationMs: Date.now() - started,
    at: Date.now(),
  };
}

module.exports = { scan, listDrives, driveInfo };
