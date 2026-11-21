'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

/*
 * Delete file by file. Whatever is in use, locked or without permission is SKIPPED
 * (counted, never fatal) and everything else goes. Folders left empty are removed.
 * Typical case: %TEMP% always has a few files held open by running programs.
 */
async function unlinkOne(fp) {
  try {
    await fsp.rm(fp, { force: true });
    return true;
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') { // read-only file: clear the flag and retry once
      try { await fsp.chmod(fp, 0o666); await fsp.rm(fp, { force: true }); return true; } catch { /* still locked */ }
    }
    return false;
  }
}

async function purge(target, keepRoot) {
  const res = { freed: 0, skipped: 0 };
  let st;
  try { st = await fsp.lstat(target); } catch { return res; } // already gone
  if (!st.isDirectory() || st.isSymbolicLink()) {
    if (keepRoot) return res;
    if (await unlinkOne(target)) res.freed += st.isSymbolicLink() ? 0 : st.size; else res.skipped++;
    return res;
  }
  const rec = async (dir) => { // returns true when dir ended up empty
    let ents;
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { res.skipped++; return false; }
    let empty = true;
    for (let i = 0; i < ents.length; i += 64) {
      await Promise.all(ents.slice(i, i + 64).map(async (d) => {
        const fp = path.join(dir, d.name);
        if (d.isSymbolicLink()) { // junction/symlink: remove the link, never what it points to
          try { await fsp.unlink(fp); } catch { try { await fsp.rmdir(fp); } catch { res.skipped++; empty = false; } }
          return;
        }
        if (d.isDirectory()) {
          if (await rec(fp)) { try { await fsp.rmdir(fp); } catch { empty = false; } } else empty = false;
          return;
        }
        let size = 0;
        try { size = (await fsp.lstat(fp)).size; } catch { /* vanished */ }
        if (await unlinkOne(fp)) res.freed += size;
        else { res.skipped++; empty = false; }
      }));
    }
    return empty;
  };
  const empty = await rec(target);
  if (empty && !keepRoot) { try { await fsp.rmdir(target); } catch { /* kept */ } }
  return res;
}

async function runPurge(paths, keepRoot, blocked) {
  const out = { freed: 0, skipped: 0, failed: [] };
  for (const p of paths) {
    if (blocked(p)) { out.failed.push({ path: p, error: 'Pasta protegida do sistema' }); continue; }
    const r = await purge(p, keepRoot);
    out.freed += r.freed;
    out.skipped += r.skipped;
  }
  return out;
}

module.exports = { purge, runPurge };
