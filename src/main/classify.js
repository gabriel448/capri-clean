'use strict';
/*
 * Turns walked directory trees into categories -> sources.
 *
 * Order of evidence for every directory, top-down:
 *   1. hard path rules (launcher libraries, caches, dev tooling, Windows areas)
 *   2. engine fingerprints (Unity, Unreal, Godot, Ren'Py, RPG Maker, Steamworks,
 *      Bink, FMOD…) promoted up to the folder that really is "the game", so a
 *      game unzipped in Downloads is found as one game, not as loose .pak files
 *   3. soft rules (Program Files, AppData, ProgramData -> the app that owns it)
 *   4. whatever is left: each file by its extension, grouped by location
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { CATEGORIES } = require('./taxonomy');
const { F_GIT, F_PROJECT, F_GAMEPKG } = require('./walk');

const HOME = os.homedir().toLowerCase();

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const USER_DIRS = new Set(['downloads', 'desktop', 'documents', 'documentos', 'videos', 'vídeos', 'pictures', 'imagens',
  'music', 'músicas', 'saved games', 'source', 'repos', 'projects', 'projetos', 'área de trabalho', 'appdata']);
const BUCKET_DIRS = new Set([...USER_DIRS, 'onedrive']);
const GAME_CONTAINERS = new Set(['games', 'jogos', 'game', 'steamlibrary', 'steam library', 'epic games', 'gog games',
  'xboxgames', 'common', 'steamapps', 'riot games', 'ea games', 'origin games', 'jogos instalados', 'emuladores',
  'emulators', 'roms', 'isos', 'repacks', 'torrents', 'programas', 'apps', 'portable', 'portaveis', 'portáteis']);

function isStaticContainer(pl) {
  if (/^[a-z]:\\?$/.test(pl)) return true;
  if (/^[a-z]:\\(users|program files|program files \(x86\)|programdata)$/.test(pl)) return true;
  if (/^[a-z]:\\users\\[^\\]+$/.test(pl)) return true;
  if (/\\appdata\\(local|roaming|locallow)$/.test(pl) || /\\appdata\\local\\programs$/.test(pl)) return true;
  const base = pl.slice(pl.lastIndexOf('\\') + 1);
  if (USER_DIRS.has(base) || GAME_CONTAINERS.has(base) || base.startsWith('onedrive')) return true;
  return false;
}

const CACHE_NAMES = new Set(['cache', 'caches', 'code cache', 'gpucache', 'cache2', 'cachestorage', 'shadercache',
  'grshadercache', 'graphitedawncache', 'dawncache', 'dawngraphitecache', 'dawnwebgpucache', 'cacheddata',
  'cachedextensionvsixs', 'cachedextensions', 'crashpad', 'crashes', 'crash reports', 'crashdumps', 'logs', 'log', 'temp', 'tmp',
  'webcache', 'media cache', 'media cache files', 'shader_cache', 'shadercache', 'blob_storage', 'squirreltemp',
  'service worker', 'jumplisticons', 'jumplisticonsold', 'thumbnails', 'thumbnailcache', 'webview2', 'ebwebview']);

const VENDORS = new Set(['google', 'mozilla', 'bravesoftware', 'adobe', 'nvidia corporation', 'nvidia', 'amd', 'intel',
  'microsoft', 'apple', 'apple computer', 'vivaldi', 'opera software', 'yandex', 'comms', 'electronic arts', 'ubisoft',
  'rockstar games', 'epic games', 'jetbrains', 'autodesk', 'blizzard entertainment', 'riot games']);

const DEV_DOT = {
  gradle: 'Gradle', m2: 'Maven (.m2)', nuget: 'NuGet', cargo: 'Rust (cargo)', rustup: 'Rust (toolchains)',
  android: 'Android (.android)', ollama: 'Ollama · modelos de IA', cache: 'Cache de ferramentas (.cache)',
  vscode: 'VS Code · extensões', cursor: 'Cursor · extensões', docker: 'Docker', conda: 'Conda', lmstudio: 'LM Studio · modelos de IA',
  npm: 'npm', yarn: 'Yarn', pnpm: 'pnpm', deno: 'Deno', bun: 'Bun', rest: '.rest', vscodeinsiders: 'VS Code Insiders',
  windsurf: 'Windsurf', claude: 'Claude Code', codex: 'Codex', ipython: 'IPython', jupyter: 'Jupyter', keras: 'Keras',
  dotnet: '.NET', templateengine: '.NET templates', pyenv: 'pyenv', nvm: 'nvm', 'nvm-windows': 'nvm',
};

const GAME_APPDATA = {
  roblox: 'Roblox', fortnitegame: 'Fortnite', mojang: 'Minecraft', 'osu!': 'osu!', hytale: 'Hytale',
  factorio: 'Factorio', 'stardew valley': 'Stardew Valley',
};

const PRETTY = {
  'league of legends': 'League of Legends', valorant: 'VALORANT', 'riot client': 'Riot Client',
  'microsoft visual studio': 'Visual Studio', 'windows kits': 'Windows SDK (Windows Kits)', 'microsoft sdks': 'Microsoft SDKs',
  nodejs: 'Node.js', dotnet: '.NET', 'common files': 'Arquivos comuns (Common Files)',
};

function prettyPackage(name) {
  let s = name.replace(/_[a-z0-9]{13}$/i, '');
  const dot = s.indexOf('.');
  if (dot > 0 && dot < s.length - 1) s = s.slice(dot + 1);
  s = s.replace(/\./g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return s.trim() || name;
}

function prettyGameFolder(name) {
  let s = name.replace(/[\[(].*?[\])]/g, ' ').replace(/[ ._-]?(steamrip|steamunlocked|igg-games|ovagames|gog-games|elamigos)([ ._-]?com)?/ig, ' ').trim();
  let platform = '';
  s = s.replace(/-[A-Za-z0-9]{2,12}$/, (m) => (/[A-Z]/.test(m) && m === m.toUpperCase() ? '' : m)); // -PRELUDE, -OFME
  s = s.replace(/[ ._-](ps4|ps3|ps5|nsw|switch|xbox360)$/i, (m) => { platform = m.slice(1).toUpperCase(); return ''; });
  s = s.replace(/[-_ .]v?\d+(\.\d+){1,}.*$/i, '');
  s = s.replace(/[-_ ](win(64|32|dows)?|x64|x86|portable|repack|setup|build\s*\d+)$/i, '');
  if (!/\s/.test(s)) s = s.replace(/[_.]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (s && platform) s += ` (${platform})`;
  return s || name;
}

function readSteamManifests(steamappsPath) {
  const byDir = new Map();
  const byId = new Map();
  let ents = [];
  try { ents = fs.readdirSync(steamappsPath); } catch { return { byDir, byId }; }
  for (const f of ents) {
    if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
    try {
      const txt = fs.readFileSync(path.join(steamappsPath, f), 'utf8');
      const id = (txt.match(/"appid"\s+"(\d+)"/) || [])[1];
      const name = (txt.match(/"name"\s+"([^"]+)"/) || [])[1];
      const dir = (txt.match(/"installdir"\s+"([^"]+)"/) || [])[1];
      if (id && dir) {
        const info = { appid: id, name: name || dir };
        byDir.set(dir.toLowerCase(), info);
        byId.set(id, info);
      }
    } catch { /* unreadable manifest */ }
  }
  return { byDir, byId };
}

class Aggregator {
  constructor() {
    this.sources = new Map();
    this.cat = new Map(CATEGORIES.map((c) => [c.id, { ...c, bytes: 0, files: [] }]));
    this.steam = { byDir: new Map(), byId: new Map() };
    this.bucketCtx = new Map();
  }

  add(ctx, p, bytes) {
    if (!bytes) return;
    let s = this.sources.get(ctx.key);
    if (!s) {
      s = {
        id: ctx.key, cat: ctx.cat, label: ctx.label, bytes: 0, paths: new Map(), tags: new Set(),
        launcher: ctx.launcher || null, appid: ctx.appid || null,
        actions: {
          trash: !!ctx.trashable, clean: !!ctx.cleanable, uninstall: ctx.uninstall || null,
          emptyTrash: !!ctx.emptyTrash, cleanmgr: !!ctx.cleanmgr,
        },
        note: ctx.note || null,
      };
      this.sources.set(ctx.key, s);
    }
    s.bytes += bytes;
    const rootPath = ctx.root || p;
    s.paths.set(rootPath, (s.paths.get(rootPath) || 0) + bytes);
    if (ctx.tag) s.tags.add(ctx.tag);
    if (ctx.appid && !s.appid) s.appid = ctx.appid;
    if (ctx.uninstall && !s.actions.uninstall) s.actions.uninstall = ctx.uninstall;
    this.cat.get(ctx.cat).bytes += bytes;
  }

  bucket(cat, p, pl) {
    // group loose files by "where they live": Downloads, Documents › Faculdade, D: › Filmes …
    let base; let rel;
    if (pl === HOME || pl.startsWith(HOME + '\\')) {
      base = HOME; rel = p.slice(HOME.length + 1);
    } else {
      base = p.slice(0, 3).toLowerCase(); rel = p.slice(3);
    }
    const segs = rel ? rel.split('\\') : [];
    let take = 1;
    if (segs.length && (BUCKET_DIRS.has(segs[0].toLowerCase()) || GAME_CONTAINERS.has(segs[0].toLowerCase()) || segs[0].toLowerCase().startsWith('onedrive'))) take = 2;
    const used = segs.slice(0, take);
    const root = p.slice(0, base.length) + (used.length ? (base.endsWith('\\') ? '' : '\\') + used.join('\\') : '');
    const label = (base === HOME ? (used.length ? '' : 'Pasta do usuário') : base.slice(0, 2).toUpperCase() + (used.length ? ' › ' : ''))
      + used.join(' › ');
    const key = `b:${cat}:${root.toLowerCase()}`;
    let ctx = this.bucketCtx.get(key);
    if (!ctx) {
      ctx = { key, cat, label: label || root, root, whole: false, tag: 'Arquivos soltos' };
      this.bucketCtx.set(key, ctx);
    }
    return ctx;
  }
}

const NICE = {
  code: 'VS Code', discord: 'Discord', hydralauncher: 'Hydra Launcher', 'opera gx stable': 'Opera GX', spotify: 'Spotify',
  'claude-data': 'Claude (app)', copilot: 'Copilot', edgecore: 'Edge (núcleo)', edgewebview: 'Edge WebView', npm: 'npm',
};
function nice(label) {
  const k = String(label).toLowerCase();
  if (NICE[k]) return NICE[k];
  return /^[a-z]/.test(label) && !/[A-Z]/.test(label) && !label.includes('·') && label !== 'node_modules' ?label[0].toUpperCase() + label.slice(1) : label;
}

function mk(cat, keyName, label, root, extra = {}) {
  return { cat, key: `${cat}:${norm(keyName) || keyName}`, label: nice(label), root, whole: true, ...extra };
}

function gameCtx(agg, label, root, extra = {}) {
  return mk('games', label, label, root, { trashable: !extra.launcher, ...extra });
}

/** Path rules. Return a new context, or null to inherit. */
function rule(agg, node, p, pl, nm, depth, ctx) {
  // ---- drive root level ----
  if (depth === 1) {
    if (nm === '$recycle.bin') return mk('trash', 'trash', 'Lixeira', p, { emptyTrash: true, note: 'Esvaziar apaga de vez o que já está na lixeira.' });
    if (['windows.old', '$windows.~bt', '$windows.~ws', '$getcurrent', '$sysreset', '$winreagent', 'esd'].includes(nm)) {
      return mk('cache', 'winold', 'Restos de atualização do Windows', p, { cleanmgr: true, note: 'Use a Limpeza de Disco do Windows para remover com segurança.' });
    }
    if (['amd', 'nvidia', 'intel'].includes(nm) && !ctx) {
      return mk('cache', 'drivers', 'Instaladores de driver extraídos', p, { trashable: true, tag: 'C:\\AMD, C:\\NVIDIA…', note: 'Sobras da instalação de drivers. Pode apagar.' });
    }
    if (nm === 'windows') return { ...mk('system', 'windows', 'Windows', p), whole: false };
    if (['recovery', 'perflogs', 'system volume information', 'boot', 'onedrivetemp', 'config.msi'].includes(nm)) return mk('system', 'sysmisc', 'Arquivos de sistema', p);
    if (nm === 'steamlibrary' || nm === 'xboxgames') return null;
  }

  // ---- Windows internals ----
  if (/^[a-z]:\\windows\\temp$/.test(pl)) return mk('cache', 'wintemp', 'Temporários do Windows', p, { cleanable: true });
  if (/^[a-z]:\\windows\\softwaredistribution\\download$/.test(pl)) return mk('cache', 'wu', 'Windows Update · downloads antigos', p, { cleanable: true });
  if (/^[a-z]:\\windows\\(logs|minidump|livekernelreports|prefetch)$/.test(pl)) return mk('cache', 'winlogs', 'Logs, dumps e prefetch do Windows', p, { cleanable: nm !== 'prefetch' });
  if (/^[a-z]:\\windows\\installer$/.test(pl)) return mk('system', 'msicache', 'Windows Installer (cache de MSI)', p);

  // ---- Steam ----
  if (nm === 'steamapps') {
    const m = readSteamManifests(p);
    for (const [k, v] of m.byDir) agg.steam.byDir.set(k, v);
    for (const [k, v] of m.byId) agg.steam.byId.set(k, v);
  }
  if (/\\steamapps\\common\\[^\\]+$/.test(pl)) {
    const info = agg.steam.byDir.get(nm);
    if (/^steamworks shared$|^steam controller configs$/.test(nm)) return mk('apps', 'steam', 'Steam', p, { tag: 'Redistribuíveis' });
    return gameCtx(agg, info ? info.name : node.n, p, { launcher: 'Steam', appid: info && info.appid, uninstall: info ? 'steam' : null, tag: 'Steam' });
  }
  if (/\\steamapps\\workshop\\content\\\d+$/.test(pl)) {
    const info = agg.steam.byId.get(node.n);
    return gameCtx(agg, info ? info.name : `Workshop ${node.n}`, p, { launcher: 'Steam', appid: node.n, tag: 'Steam Workshop', uninstall: info ? 'steam' : null });
  }
  if (/\\steamapps\\shadercache$/.test(pl)) return mk('cache', 'steamshader', 'Steam · cache de shaders', p, { cleanable: true });
  if (/\\steamapps\\(downloading|temp)$/.test(pl)) return mk('cache', 'steamdl', 'Steam · downloads incompletos', p, { cleanable: true });
  if (nm === 'steam' && node.child('steamapps') || /\\program files( \(x86\))?\\steam$/.test(pl)) {
    return { ...mk('apps', 'steam', 'Steam', p, { noDetect: true }), whole: false };
  }

  // ---- other launchers ----
  if (/\\epic games\\ue_[^\\]+$/.test(pl)) return mk('dev', 'unreal', 'Unreal Engine', p, { tag: node.n });
  if (/\\epic games\\launcher$/.test(pl)) return mk('apps', 'epiclauncher', 'Epic Games Launcher', p);
  if (/\\epic games\\directxredist$/.test(pl)) return mk('apps', 'epiclauncher', 'Epic Games Launcher', p);
  if (/\\epic games\\[^\\]+$/.test(pl) && !/\\appdata\\/.test(pl)) return gameCtx(agg, prettyGameFolder(node.n), p, { launcher: 'Epic Games', uninstall: 'registry', tag: 'Epic Games' });
  if (/\\(gog galaxy\\games|gog games)\\[^\\]+$/.test(pl)) return gameCtx(agg, node.n, p, { launcher: 'GOG', uninstall: 'registry', tag: 'GOG' });
  if (/\\riot games\\riot client$/.test(pl)) return mk('apps', 'riotclient', 'Riot Client', p);
  if (/\\riot games\\[^\\]+$/.test(pl) && !/\\appdata\\/.test(pl)) return gameCtx(agg, PRETTY[nm] || node.n, p, { launcher: 'Riot', uninstall: 'registry', tag: 'Riot Games' });
  if (/\\xboxgames\\[^\\]+$/.test(pl)) return gameCtx(agg, node.n, p, { launcher: 'Xbox', uninstall: 'settings', tag: 'Xbox / Game Pass' });
  if (/\\(ea games|origin games)\\[^\\]+$/.test(pl)) return gameCtx(agg, node.n, p, { launcher: 'EA', uninstall: 'registry', tag: 'EA app' });
  if (/\\ubisoft game launcher\\games\\[^\\]+$/.test(pl)) return gameCtx(agg, node.n, p, { launcher: 'Ubisoft', uninstall: 'registry', tag: 'Ubisoft Connect' });
  if (/\\ubisoft game launcher$/.test(pl)) return { ...mk('apps', 'ubisoft', 'Ubisoft Connect', p, { noDetect: true }), whole: false };
  if (/\\rockstar games\\(launcher|social club)$/.test(pl)) return mk('apps', 'rockstarlauncher', 'Rockstar Games Launcher', p);
  if (/\\rockstar games\\[^\\]+$/.test(pl) && !/\\(appdata|documents)\\/.test(pl)) return gameCtx(agg, node.n, p, { launcher: 'Rockstar', uninstall: 'registry', tag: 'Rockstar' });
  if (/\\battle\.net$/.test(pl) && !/\\appdata\\/.test(pl)) return mk('apps', 'battlenet', 'Battle.net', p);

  // ---- Minecraft, wherever the launcher keeps it ----
  if (/\\appdata\\roaming\\\.minecraft$/.test(pl) || /\\\.tlauncher$/.test(pl)) return gameCtx(agg, 'Minecraft', p, { tag: 'Java Edition', trashable: false });
  if (/\\curseforge\\minecraft\\(instances\\[^\\]+|install)$/.test(pl)) return gameCtx(agg, 'Minecraft', p, { tag: 'CurseForge', trashable: false });
  if (/\\(prismlauncher|polymc|multimc|atlauncher)\\instances\\[^\\]+$/.test(pl) || /\\modrinthapp\\profiles\\[^\\]+$/.test(pl)) {
    return gameCtx(agg, 'Minecraft', p, { tag: 'Modpacks', trashable: false });
  }

  // ---- development ----
  if (nm === 'node_modules') return mk('dev', 'node_modules', 'node_modules', p, { trashable: true, note: 'Recriável com npm install. Cada caminho é um projeto.' });
  if (node.fl & 1) return mk('dev', 'venv', 'Ambientes Python (venv)', p, { trashable: true });
  if (nm === '.git' && depth > 1) return mk('dev', 'git', 'Histórico Git (.git)', p, { note: 'Apagar remove o histórico do repositório.' });
  if (['.next', '.nuxt', '.turbo', '.parcel-cache', '.angular', '__pycache__', '.pytest_cache', '.mypy_cache', '.gradle'].includes(nm) && depth > 3) {
    return mk('dev', 'buildcache', 'Caches de build (.next, .turbo, __pycache__…)', p, { trashable: true });
  }
  {
    const m = pl.match(/^[a-z]:\\users\\[^\\]+\\\.([^\\]+)$/);
    if (m) {
      const label = DEV_DOT[m[1]] || `.${node.n.slice(1)}`;
      return mk('dev', `dot-${m[1]}`, label, p, { tag: 'Pasta oculta do usuário' });
    }
  }
  if ((depth === 1 || /^[a-z]:\\users\\[^\\]+\\[^\\]+$/.test(pl))
    && /^(tizen-studio(-data)?|flutter|android(-sdk)?|msys64|cygwin(64)?|mingw(64)?|jdk[^\\]*|go|xampp|wamp(64)?|laragon|vcpkg|emsdk|anaconda3|miniconda3|tools|sdk|sdks)$/.test(nm)) {
    return mk('dev', nm, node.n, p, { tag: 'SDK / ferramenta' });
  }
  if (/\\appdata\\local\\android\\sdk$/.test(pl)) return mk('dev', 'androidsdk', 'Android SDK', p);
  if (/\\appdata\\(local|roaming)\\npm-cache$/.test(pl)) return mk('dev', 'npmcache', 'npm · cache', p, { cleanable: true });
  if (/\\appdata\\local\\pip\\cache$/.test(pl)) return mk('dev', 'pipcache', 'pip · cache', p, { cleanable: true });
  if (/\\appdata\\local\\yarn\\cache$/.test(pl)) return mk('dev', 'yarncache', 'Yarn · cache', p, { cleanable: true });
  if (/\\appdata\\local\\(docker|docker desktop)$/.test(pl)) return mk('dev', 'docker', 'Docker', p);
  if (/\\appdata\\local\\packages\\canonicalgroup[^\\]*$/.test(pl) || /\\appdata\\local\\wsl$/.test(pl)) return mk('dev', 'wsl', 'WSL (Linux)', p);
  if (/\\appdata\\local\\packages\\[^\\]*(debian|kalilinux|opensuse|archlinux)[^\\]*$/.test(pl)) return mk('dev', 'wsl', 'WSL (Linux)', p);
  if (/\\appdata\\(local|roaming)\\jetbrains$/.test(pl) || /\\program files( \(x86\))?\\jetbrains$/.test(pl)) return mk('dev', 'jetbrains', 'JetBrains IDEs', p);
  if (/\\unity\\hub\\editor$/.test(pl)) return mk('dev', 'unityeditor', 'Unity Editor', p);
  if (/\\appdata\\local\\programs\\(python|microsoft vs code|cursor)$/.test(pl)) {
    return mk('dev', nm, nm === 'python' ? 'Python' : nm === 'cursor' ? 'Cursor' : 'VS Code', p, { uninstall: 'registry' });
  }
  {
    const m = pl.match(/^[a-z]:\\program files( \(x86\))?\\(microsoft visual studio|windows kits|android|microsoft sdks|dotnet|nodejs|python[^\\]*|git|docker|unity hub|unity)$/);
    if (m) return mk('dev', `pf-${m[2].replace(/\d+$/, '')}`, PRETTY[m[2]] || node.n, p, { uninstall: 'registry' });
  }

  // ---- caches inside app data ----
  if (ctx && ctx.cacheSplit && CACHE_NAMES.has(nm)) {
    return mk('cache', `${ctx.key}-cache`, `${ctx.label} · cache`, p, { cleanable: true, tag: 'Cache de app' });
  }
  if (/\\appdata\\local\\temp$/.test(pl)) return mk('cache', 'usertemp', 'Temporários do usuário (%TEMP%)', p, { cleanable: true });
  if (/\\appdata\\local\\crashdumps$/.test(pl) || /\\microsoft\\windows\\wer$/.test(pl)) return mk('cache', 'dumps', 'Relatórios de erro e dumps', p, { cleanable: true });
  if (/\\appdata\\local\\d3dscache$/.test(pl) || /\\(nvidia|amd)\\(dxcache|glcache|dxccache|vkcache|optixcache)$/.test(pl) || /\\nvidia corporation\\nv_cache$/.test(pl)) {
    return mk('cache', 'gpushader', 'Cache de shaders da GPU', p, { cleanable: true, note: 'Os jogos recriam esse cache. O primeiro boot pode ficar mais lento.' });
  }
  if (/\\microsoft\\windows\\inetcache$/.test(pl)) return mk('cache', 'inetcache', 'Cache de internet do Windows', p, { cleanable: true });
  if (/\\microsoft\\windows\\explorer$/.test(pl)) return mk('cache', 'thumbs', 'Miniaturas do Explorer', p, { cleanable: true });

  // ---- soft rules: who owns this folder ----
  {
    const m = pl.match(/^[a-z]:\\program files( \(x86\))?\\([^\\]+)$/);
    if (m) {
      const x = m[2];
      if (x === 'windowsapps') return mk('apps', 'storeapps', 'Apps da Microsoft Store', p, { note: 'Desinstale pelas Configurações do Windows.', uninstall: 'settings' });
      if (/^(windows|microsoft update health|internet explorer|reference assemblies|msbuild|common files|modifiablewindowsapps|uninstall information)/.test(x)) {
        return mk('system', 'progsys', 'Componentes do Windows', p);
      }
      if (node.root === 'game') return gameCtx(agg, prettyGameFolder(node.n), p, { uninstall: 'registry', tag: 'Instalado' });
      if (VENDORS.has(x)) return { ...mk('apps', x, PRETTY[x] || node.n, p, { uninstall: 'registry', vendor: true }), whole: false, cacheSplit: true };
      return { ...mk('apps', x, PRETTY[x] || node.n, p, { uninstall: 'registry' }), whole: false, cacheSplit: true };
    }
  }
  if (ctx && ctx.vendor && depth === ctx.depth + 1) {
    // Program Files\Vendor\Product
    if (node.root === 'game') return gameCtx(agg, prettyGameFolder(node.n), p, { uninstall: 'registry', tag: 'Instalado' });
    return { ...mk('apps', node.n, node.n, p, { uninstall: 'registry' }), whole: false, cacheSplit: true };
  }
  {
    const m = pl.match(/\\appdata\\(local|roaming|locallow)\\([^\\]+)$/);
    if (m) {
      const x = m[2];
      if (x === 'programs' || x === 'packages') return null;
      if (GAME_APPDATA[x]) return gameCtx(agg, GAME_APPDATA[x], p, { tag: 'Dados do jogo', trashable: false });
      if (VENDORS.has(x)) return { ...mk('apps', x, PRETTY[x] || node.n, p, { tag: 'Dados de app', vendor: true }), whole: false, cacheSplit: true };
      return { ...mk('apps', x, node.n, p, { tag: 'Dados de app' }), whole: false, cacheSplit: true };
    }
  }
  {
    const m = pl.match(/\\appdata\\local\\packages\\([^\\]+)$/);
    if (m) { const label = prettyPackage(node.n); return { ...mk('apps', label, label, p, { tag: 'App da Store' }), whole: false, cacheSplit: true }; }
  }
  {
    const m = pl.match(/\\appdata\\local\\programs\\([^\\]+)$/);
    if (m) {
      if (node.root === 'game') return gameCtx(agg, prettyGameFolder(node.n), p, { uninstall: 'registry', tag: 'Instalado' });
      return { ...mk('apps', m[1], node.n, p, { uninstall: 'registry' }), whole: false, cacheSplit: true };
    }
  }
  {
    const m = pl.match(/^[a-z]:\\programdata\\([^\\]+)$/);
    if (m) {
      const x = m[1];
      if (x === 'microsoft') return { ...mk('system', 'progdata', 'Windows (ProgramData)', p), whole: false, cacheSplit: false };
      if (x === 'package cache') return mk('system', 'pkgcache', 'Cache de instaladores (Package Cache)', p, { note: 'Usado para reparar/desinstalar programas. Não apague.' });
      return { ...mk('apps', x, node.n, p, { tag: 'Dados de app' }), whole: false, cacheSplit: true };
    }
  }
  if (ctx && ctx.vendor && /\\appdata\\(local|roaming|locallow)\\[^\\]+\\[^\\]+$/.test(pl)) {
    if (CACHE_NAMES.has(nm)) return mk('cache', `${ctx.key}-cache`, `${ctx.label} · cache`, p, { cleanable: true, tag: 'Cache de app' });
    return { ...mk('apps', node.n, node.n, p, { tag: 'Dados de app' }), whole: false, cacheSplit: true };
  }
  return null;
}

const MEDIA = ['videos', 'images', 'audio', 'docs'];

function promoteRoots(all) {
  const isC = (n) => {
    if (n._sc === undefined) n._sc = isStaticContainer(n.path().toLowerCase());
    return n._sc;
  };
  for (let i = all.length - 1; i >= 0; i--) {
    const n = all[i];
    let m = 0;
    if (n.cats) for (const k of MEDIA) m += n.cats[k] || 0;
    n.media = (n.media || 0) + m;
    if (n.mk >= 3) n.hasGame = true;
    if (n.p) {
      n.p.media = (n.p.media || 0) + n.media;
      if (n.hasGame) n.p.hasGame = true;
    }
    if (n.mk >= 3) n.root = 'game';
    else if (n.ex >= 1 && n.dl >= 3) n.root = 'app';
    else if (n.fl & (F_GIT | F_PROJECT)) n.root = 'project';
  }
  // climb from the folder holding the marker up to the folder that really is the game
  for (let i = all.length - 1; i >= 0; i--) {
    let cur = all[i];
    if (!cur.root || cur.root === 'project') continue;
    while (cur.p && cur.p.p) {
      const par = cur.p;
      if (isC(par)) break;
      if (par.root === 'app' && cur.root === 'game' && cur.sub >= 0.5 * par.sub) { par.root = 'game'; cur.root = null; cur = par; continue; }
      if (par.root) break;
      if (cur.sub < 0.85 * par.sub) break;
      par.root = cur.root;
      cur.root = null;
      cur = par;
    }
  }
  // a folder sitting right in Downloads / D:\ / Games… that holds a game somewhere
  // inside and is not mostly photos, videos or documents IS that game
  for (const n of all) {
    if (!n.p || !n.hasGame || n.root === 'game') continue;
    if (!isC(n.p) || isC(n)) continue;
    if (n.media > 0.4 * n.sub) continue;
    n.root = 'game';
  }
  for (const n of all) if (n.root && isC(n)) n.root = null; // a container is never one thing
}

function classifyTree(agg, walked) {
  const { root, all } = walked;
  promoteRoots(all);

  const stack = [[root, root.n, null, 0]];
  while (stack.length) {
    const [node, p, inCtx, depth] = stack.pop();
    const pl = p.toLowerCase();
    const nm = node.n.toLowerCase();
    let ctx = inCtx;
    const r = rule(agg, node, p, pl, nm, depth, inCtx);
    if (r) { ctx = r; ctx.depth = depth; }
    else if (node.root && !(inCtx && inCtx.noDetect)) {
      if (node.root === 'game' && (!inCtx || inCtx.cat === 'apps' || inCtx.cat === 'dev')) {
        const inAppData = inCtx && inCtx.cat === 'apps' && inCtx.tag === 'Dados de app';
        const label = inAppData ? inCtx.label : prettyGameFolder(node.n);
        let tag = 'Pasta solta';
        if (node.fl & F_GAMEPKG) tag = 'Instalador / compactado';
        else if (inCtx) tag = `Dentro de ${inCtx.label}`;
        ctx = gameCtx(agg, label, p, { tag, trashable: !inCtx });
        ctx.depth = depth;
      } else if (node.root === 'app' && !inCtx) {
        ctx = mk('apps', `portable-${pl}`, node.n, p, { tag: 'Portátil', trashable: true });
        ctx.depth = depth;
      } else if (node.root === 'project' && !inCtx) {
        ctx = { ...mk('dev', `proj-${pl}`, node.n, p, { tag: 'Projeto de código' }), whole: false };
        ctx.depth = depth;
      }
    }
    node.vis = true;
    node.cls = ctx;

    if (ctx && ctx.whole) { agg.add(ctx, p, node.sub); continue; }

    if (node.own) {
      if (ctx) agg.add(ctx, p, node.own);
      else if (node.cats) {
        for (const cat in node.cats) agg.add(agg.bucket(cat, p, pl), p, node.cats[cat]);
      }
    }
    if (node.c) {
      const base = p.endsWith('\\') ? p : p + '\\';
      for (const ch of node.c) if (ch.sub > 0) stack.push([ch, base + ch.n, ctx, depth + 1]);
    }
  }

  // big files -> the category of the context they ended up in
  for (const f of walked.bigFiles) {
    let n = f.node;
    while (n && !n.vis) n = n.p;
    const ctx = n && n.cls;
    const cat = ctx ? ctx.cat : f.cat;
    const src = ctx ? ctx.label : agg.bucket(f.cat, f.node.path(), f.node.path().toLowerCase()).label;
    agg.cat.get(cat).files.push({ path: f.node.path() + '\\' + f.name, name: f.name, size: f.size, source: src });
  }
}

const SPECIAL = {
  'pagefile.sys': ['Memória virtual (pagefile.sys)', 'Gerenciado pelo Windows. Dá pra reduzir em Sistema › Avançado › Desempenho.'],
  'hiberfil.sys': ['Hibernação (hiberfil.sys)', 'Some se você desativar a hibernação: powercfg /h off (como administrador).'],
  'swapfile.sys': ['Swap de apps (swapfile.sys)', 'Gerenciado pelo Windows.'],
};
function addSpecial(agg, root, name, size) {
  const [label, note] = SPECIAL[name];
  agg.add(mk('system', name, label, root + name, { note }), root + name, size);
}

function finish(agg, drives) {
  // what the disk says is used but we could not read: pagefile, hiberfil, WinSxS, restore points…
  for (const d of drives) {
    const hidden = d.used - d.scanned;
    if (hidden > 256 * 1024 * 1024) {
      agg.add(mk('system', 'protected', 'Áreas protegidas do sistema', d.root, {
        note: 'Arquivo de paginação, hibernação, WinSxS, pontos de restauração e pastas sem permissão de leitura.',
        cleanmgr: true,
      }), d.root, hidden);
    }
  }
  const cats = [];
  for (const c of agg.cat.values()) {
    const sources = [...agg.sources.values()].filter((s) => s.cat === c.id)
      .map((s) => ({
        ...s,
        tags: [...s.tags],
        paths: [...s.paths.entries()].map(([pp, b]) => ({ path: pp, bytes: b })).sort((a, b) => b.bytes - a.bytes).slice(0, 60),
        pathCount: s.paths.size,
      }))
      .sort((a, b) => b.bytes - a.bytes);
    const files = c.files.sort((a, b) => b.size - a.size).slice(0, 60);
    cats.push({ id: c.id, label: c.label, hint: c.hint, bytes: c.bytes, sources: sources.slice(0, 300), sourceCount: sources.length, files });
  }
  return cats;
}

module.exports = { Aggregator, classifyTree, finish, addSpecial, prettyGameFolder, prettyPackage, isStaticContainer };
