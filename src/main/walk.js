'use strict';
/*
 * Fast directory walker.
 * Builds an in-memory tree of directories (files are folded into per-directory
 * totals) plus the evidence the classifier needs: engine markers, exe/dll
 * counts, venv flags and a list of large files.
 */
const fsp = require('fs').promises;
const { extCategory } = require('./taxonomy');

const SEP = '\\';
const DIR_CONCURRENCY = 48;
const STAT_CHUNK = 96;
const BIG_FILE = 64 * 1024 * 1024;

// file names (lower case) that are strong / medium evidence of a game install
const GAME_FILES = new Map([
  ['unityplayer.dll', 3], ['gameassembly.dll', 3], ['steam_api.dll', 3], ['steam_api64.dll', 3],
  ['steam_appid.txt', 3], ['eossdk-win64-shipping.dll', 3], ['eossdk-win32-shipping.dll', 3],
  ['galaxy.dll', 3], ['galaxy64.dll', 3], ['data.win', 3], ['game.rgssad', 3], ['game.rgss2a', 3],
  ['game.rgss3a', 3], ['.build.info', 3], ['uplay_r1_loader64.dll', 3], ['uplay_r1_loader.dll', 3],
  ['upc_r2_loader64.dll', 3], ['eboot.bin', 3], ['param.sfo', 3], ['steam_emu.ini', 3], ['onlinefix64.dll', 3], ['cream_api.ini', 3],
  ['bink2w64.dll', 1], ['binkw32.dll', 1], ['binkw64.dll', 1], ['fmod.dll', 1], ['fmodex.dll', 1],
  ['fmodstudio.dll', 1], ['fmod64.dll', 1], ['physx3_x64.dll', 1], ['physxcommon_64.dll', 1],
  ['nvngx_dlss.dll', 2], ['libxess.dll', 2], ['amd_fidelityfx_dx12.dll', 2], ['nw.dll', 1],
  ['oo2core_9_win64.dll', 2], ['oo2core_8_win64.dll', 2], ['oo2core_7_win64.dll', 2],
  ['d3d12core.dll', 0], ['openal32.dll', 1], ['soft_oal.dll', 1], ['sdl2.dll', 1], ['xaudio2_9redist.dll', 1],
]);
const GAME_DIRS = new Map([
  ['monobleedingedge', 3], ['easyanticheat', 3], ['battleye', 3], ['_commonredist', 2],
  ['renpy', 3], ['www', 0], ['engine', 1], ['paks', 2], ['sce_sys', 3], ['sce_module', 3], ['steamsettings', 2],
]);
const GAME_EXT = new Set(['pak', 'pck', 'bsa', 'ba2', 'vpk', 'forge', 'rpa', 'wad', 'big', 'arc', 'ucas', 'utoc', 'assets', 'bundle', 'blb', 'ff', 'dat', 'bin']);
const STRONG_GAME_EXT = new Set(['rpa', 'pck', 'ucas', 'utoc', 'bsa', 'ba2', 'vpk', 'forge']);

const F_VENV = 1;
const F_GIT = 2;
const F_PROJECT = 4;
const F_GAMEPKG = 8;

// scene / repack release names: a game, even while it is still a .rar or a setup
const SCENE = /(^|[-._ \[(])(fitgirl|dodi|elamigos|kaos|codex|skidrow|plaza|empress|rune|tenoke|flt|razor1911|darksiders|prelude|ofme|cpy|hoodlum|reloaded|prophet|chronos|tinyiso|goldberg|insaneramzes|repack|gog|p2p|xatab|decepticon|onlinefix|online-fix)([-._ \])]|$)/i;
const SCENE_EXT = new Set(['rar', 'zip', '7z', 'iso', 'bin', 'exe', 'nfo', 'pkg', 'r00', 'part1', 'cab']);

class DirNode {
  constructor(name, parent) {
    this.n = name;
    this.p = parent;
    this.c = null; // children
    this.own = 0; // bytes of files directly inside
    this.sub = 0; // subtree bytes (filled after walk)
    this.cats = null; // ext-category -> bytes for own files
    this.mk = 0; // game evidence score
    this.ex = 0; // exe count
    this.dl = 0; // dll count
    this.fl = 0; // flags
    this.denied = false;
  }
  path() {
    const parts = [];
    let n = this;
    while (n) { parts.push(n.n); n = n.p; }
    parts.reverse();
    let out = parts[0];
    for (let i = 1; i < parts.length; i++) out += (out.endsWith(SEP) ? '' : SEP) + parts[i];
    return out;
  }
  child(name) {
    if (!this.c) return null;
    const lower = name.toLowerCase();
    for (const ch of this.c) if (ch.n.toLowerCase() === lower) return ch;
    return null;
  }
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/**
 * Walk a root. opts: { onProgress(stats), shouldStop(), skip(pathLower) }
 */
async function walk(rootPath, opts = {}) {
  const root = new DirNode(rootPath.replace(/\\+$/, '') + (/^[a-z]:$/i.test(rootPath.replace(/\\+$/, '')) ? SEP : ''), null);
  const all = [root];
  const bigFiles = [];
  const stats = { files: 0, dirs: 1, bytes: 0, denied: 0, deniedList: [], current: rootPath };
  const stack = [[root, root.n]];
  let active = 0;
  let lastTick = 0;

  const tick = () => {
    const now = Date.now();
    if (opts.onProgress && now - lastTick > 120) {
      lastTick = now;
      opts.onProgress(stats);
    }
  };

  const addFile = (node, name, size) => {
    node.own += size;
    stats.files++;
    stats.bytes += size;
    const ext = extOf(name);
    let cat = extCategory(ext);
    const lower = name.toLowerCase();
    if (SCENE_EXT.has(ext) && (SCENE.test(name) || /^fg-\d+\.bin$|^fg-optional/.test(lower))) {
      node.mk += 3; node.fl |= F_GAMEPKG;
      if (ext !== 'nfo') cat = 'games';
    } else if (ext === 'pkg' && size > 1024 ** 3) { // PS4/PS3 package
      node.mk += 3; node.fl |= F_GAMEPKG; cat = 'games';
    }
    if (!node.cats) node.cats = Object.create(null);
    node.cats[cat] = (node.cats[cat] || 0) + size;
    const score = GAME_FILES.get(lower);
    if (score) node.mk += score;
    if (ext === 'exe') node.ex++;
    else if (ext === 'dll') node.dl++;
    else if (lower === 'pyvenv.cfg') node.fl |= F_VENV;
    else if (lower === 'package.json' || lower === 'cargo.toml' || lower === 'pyproject.toml' || lower === '.csproj') node.fl |= F_PROJECT;
    if (GAME_EXT.has(ext) && size > 200 * 1024 * 1024) node.mk += STRONG_GAME_EXT.has(ext) ? 2 : 1;
    else if (STRONG_GAME_EXT.has(ext) && size > 20 * 1024 * 1024) node.mk += 1;
    if (size >= BIG_FILE) bigFiles.push({ node, name, size, cat });
  };

  const readOne = async (node, dirPath) => {
    let ents;
    try {
      ents = await fsp.readdir(dirPath, { withFileTypes: true });
    } catch {
      node.denied = true;
      stats.denied++;
      if (stats.deniedList.length < 200) stats.deniedList.push(dirPath);
      return;
    }
    const files = [];
    for (const d of ents) {
      // reparse points (junctions, symlinks, cloud placeholders) are skipped: no double counting
      let isDir = d.isDirectory();
      if (d.isSymbolicLink()) {
        if (dirPath.toLowerCase().includes('\\onedrive')) continue;
        try {
          const st = await fsp.lstat(dirPath + (dirPath.endsWith(SEP) ? '' : SEP) + d.name);
          if (st.isSymbolicLink()) continue; // junction / symlink: already counted elsewhere
          if (st.isDirectory()) isDir = true;
          else if (st.isFile()) { files.push(d.name); continue; }
          else continue;
        } catch { continue; }
      }
      if (isDir) {
        const childPath = dirPath + (dirPath.endsWith(SEP) ? '' : SEP) + d.name;
        if (opts.skip && opts.skip(childPath.toLowerCase())) continue;
        const ch = new DirNode(d.name, node);
        (node.c || (node.c = [])).push(ch);
        all.push(ch);
        stats.dirs++;
        const lower = d.name.toLowerCase();
        const s = GAME_DIRS.get(lower);
        if (s) node.mk += s;
        if (lower === '.git') node.fl |= F_GIT;
        stack.push([ch, childPath]);
      } else if (d.isFile()) {
        if (!node.p && /^(pagefile|hiberfil|swapfile)\.sys$/i.test(d.name)) continue; // measured separately
        files.push(d.name);
      }
    }
    const base = dirPath + (dirPath.endsWith(SEP) ? '' : SEP);
    for (let i = 0; i < files.length; i += STAT_CHUNK) {
      const chunk = files.slice(i, i + STAT_CHUNK);
      await Promise.all(chunk.map((f) => fsp.lstat(base + f).then(
        (st) => addFile(node, f, st.size),
        () => {},
      )));
    }
    stats.current = dirPath;
    tick();
  };

  await new Promise((resolve) => {
    const pump = () => {
      if (opts.shouldStop && opts.shouldStop()) stack.length = 0;
      while (active < DIR_CONCURRENCY && stack.length) {
        const [node, p] = stack.pop();
        active++;
        readOne(node, p).finally(() => {
          active--;
          if (!active && !stack.length) resolve();
          else pump();
        });
      }
      if (!active && !stack.length) resolve();
    };
    pump();
  });

  // subtree sizes, bottom-up (children were always pushed after their parent)
  for (let i = all.length - 1; i >= 0; i--) {
    const n = all[i];
    n.sub += n.own;
    if (n.p) n.p.sub += n.sub;
  }

  // structural engine fingerprints that need grandchildren
  for (const n of all) {
    if (!n.c) continue;
    for (const ch of n.c) {
      const lower = ch.n.toLowerCase();
      if (lower === 'engine' && (ch.child('Binaries') || ch.child('Content') || ch.child('Plugins'))) n.mk += 3; // Unreal
      else if (lower.endsWith('_data') && (ch.child('Managed') || ch.child('il2cpp_data') || ch.child('StreamingAssets'))) n.mk += 3; // Unity
      else if (lower === 'content' && ch.child('Paks')) n.mk += 3; // Unreal project dir
      else if (lower === 'www' && n.dl > 0) n.mk += 2; // RPG Maker MV/MZ (nw.js)
      else if (lower === 'game' && ch.child('cache') && n.child('renpy')) n.mk += 3; // Ren'Py
    }
  }

  return { root, all, bigFiles, stats };
}

module.exports = { walk, DirNode, F_VENV, F_GIT, F_PROJECT, F_GAMEPKG, SEP };
