'use strict';
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '24'; // parallel stat() calls

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { Worker } = require('worker_threads');
const { execFile, spawn } = require('child_process');
const { listDrives } = require('./scanner');
const { walk } = require('./walk');
const { runPurge } = require('./purge');

let win = null;
let worker = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#17101d',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#17101d', symbolColor: '#f6eef3', height: 38 },
    icon: path.join(__dirname, '../renderer/assets/capri.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

const DEMO = process.argv.includes('--demo') || !!process.env.CAPRI_DEMO;

app.whenReady().then(() => {
  createWindow();
  win.once('ready-to-show', () => setTimeout(setupUpdater, 1500));
  if (process.env.CAPRI_SHOT) selfTest(process.env.CAPRI_SHOT);
});

// ---------- auto-update from GitHub Releases ----------
// Every launch: look for a newer release, download it in the background, tell the
// page. The page installs it right away when nothing is going on, or on quit.
function setupUpdater() {
  if (!app.isPackaged || DEMO) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  // %APPDATA%\capri-clean\updater.log: what the updater did on each launch (kept small)
  const logFile = path.join(app.getPath('userData'), 'updater.log');
  const log = (msg) => {
    try {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > 256 * 1024) fs.renameSync(logFile, `${logFile}.old`);
      fs.appendFileSync(logFile, `${new Date().toISOString()} v${app.getVersion()} ${msg}\n`);
    } catch { /* logging must never break the app */ }
  };
  const send = (s) => {
    if (s.state !== 'downloading') log(`${s.state}${s.version ? ` ${s.version}` : ''}${s.message ? ` ${s.message}` : ''}`);
    if (win && !win.isDestroyed()) win.webContents.send('update', s);
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => send({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => send({ state: 'latest' }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => send({ state: 'error', message: String((e && e.message) || e).split('\n')[0] }));
  ipcMain.handle('update:install', () => { log('installing + restart'); setImmediate(() => autoUpdater.quitAndInstall(true, true)); return true; });
  autoUpdater.checkForUpdates().catch(() => {});
}
ipcMain.handle('app:version', () => app.getVersion());

// dev only: CAPRI_SHOT=<dir> npm start -> screenshots of every screen, then quits
async function selfTest(dir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  };
  const js = (code) => win.webContents.executeJavaScript(code);
  await wait(3500); await shot('1-home');
  const done = new Promise((r) => ipcMain.once('selftest:done', r));
  win.webContents.on('ipc-message', () => {});
  js(`(() => { window.capri.onDone(() => setTimeout(() => document.title = 'DONE', 50)); document.getElementById('scanBtn').click(); })()`);
  await wait(9000); await shot('2-scanning');
  for (let i = 0; i < 240 && win.getTitle() !== 'DONE'; i++) await wait(1000);
  await wait(2500); await shot('3-results');
  await js(`document.querySelector('.cat[data-cat="games"]').click()`);
  await wait(1800); await shot('4-games');
  await js(`document.querySelector('.row .row__main').click()`);
  await wait(900); await shot('5-games-open');
  // cart: add two sources and a big file, open the drawer — nothing real is deleted
  await js(`document.querySelectorAll('.row .addcart')[1].click()`); await wait(300);
  await js(`document.querySelectorAll('.row .addcart')[3].click()`); await wait(300);
  await js(`document.querySelector('.tab[data-tab="files"]').click()`); await wait(700);
  await js(`document.querySelector('.row .addcart').click()`); await wait(700);
  await shot('6-files-incart');
  await js(`document.querySelector('#cartBtn').click()`); await wait(1200);
  await shot('7-cart');
  // the delete pipeline itself, on a throwaway folder
  const dummy = path.join(dir, 'dummy-delete');
  fs.mkdirSync(path.join(dummy, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(dummy, 'a.bin'), Buffer.alloc(3 * 1024 * 1024));
  fs.writeFileSync(path.join(dummy, 'sub', 'b.bin'), Buffer.alloc(1024 * 1024));
  const r = await js(`window.capri.remove([${JSON.stringify(dummy)}])`);
  const prot = await js(`window.capri.remove([${JSON.stringify(app.getPath('downloads'))}])`);
  fs.writeFileSync(path.join(dir, 'delete-test.json'), JSON.stringify({ r, stillExists: fs.existsSync(dummy), protectedResult: prot, downloadsStillThere: fs.existsSync(app.getPath('downloads')) }, null, 2));
  void done;
  app.quit();
}
app.on('window-all-closed', () => app.quit());

// ---------- scan ----------
ipcMain.handle('drives', () => (DEMO ? require('./demo').drives() : listDrives()));

ipcMain.handle('scan:start', (_e, roots) => {
  if (DEMO) { require('./demo').play((ch, v) => win && win.webContents.send(ch, v)); return true; }
  if (worker) worker.terminate();
  worker = new Worker(path.join(__dirname, 'scanWorker.js'), { workerData: { roots } });
  const w = worker;
  w.on('message', (m) => {
    if (!win || w !== worker) return;
    if (m.type === 'progress') win.webContents.send('scan:progress', m.p);
    else if (m.type === 'done') { win.webContents.send('scan:done', m.r); worker = null; }
    else if (m.type === 'error') { win.webContents.send('scan:error', m.message); worker = null; }
  });
  w.on('error', (err) => win && win.webContents.send('scan:error', String(err)));
  return true;
});

ipcMain.handle('scan:cancel', () => {
  if (worker) worker.postMessage('stop');
  return true;
});

// ---------- actions ----------
const PROTECTED = [/^[a-z]:\\?$/i, /^[a-z]:\\windows(\\|$)/i, /^[a-z]:\\program files( \(x86\))?\\?$/i, /^[a-z]:\\users\\?$/i,
  /^[a-z]:\\users\\[^\\]+\\?$/i, /^[a-z]:\\users\\[^\\]+\\(downloads|desktop|documents|pictures|videos|music|saved games|appdata|onedrive[^\\]*)\\?$/i,
  /^[a-z]:\\users\\[^\\]+\\onedrive[^\\]*\\(documents|documentos|desktop|área de trabalho|pictures|imagens)\\?$/i,
  /^[a-z]:\\users\\[^\\]+\\appdata\\(local|roaming|locallow)(\\(programs|packages|microsoft|temp))?\\?$/i,
  /^[a-z]:\\programdata(\\microsoft)?\\?$/i, /^[a-z]:\\\$recycle\.bin/i, /^[a-z]:\\(recovery|boot|system volume information)(\\|$)/i,
  /\\steamapps(\\common)?\\?$/i];
const isProtected = (p) => PROTECTED.some((re) => re.test(p));

async function du(p) {
  try {
    const st = await fs.promises.lstat(p);
    if (!st.isDirectory()) return st.size;
    const r = await walk(p);
    return r.root.sub;
  } catch {
    return 0;
  }
}

ipcMain.handle('reveal', (_e, p) => {
  try {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) shell.openPath(p);
    else shell.showItemInFolder(p);
  } catch { shell.showItemInFolder(p); }
  return true;
});

ipcMain.handle('trash', async (_e, paths) => {
  const out = { freed: 0, failed: [] };
  for (const p of paths) {
    if (isProtected(p)) { out.failed.push({ path: p, error: 'Pasta protegida' }); continue; }
    const size = await du(p);
    try {
      await shell.trashItem(p);
      out.freed += size;
    } catch (err) {
      out.failed.push({ path: p, error: String(err.message || err) });
    }
  }
  return out;
});

// clean = empty a folder's contents; only the most basic roots are off limits
const CLEAN_BLOCK = [/^[a-z]:\\?$/i, /^[a-z]:\\windows\\?$/i, /^[a-z]:\\(windows\\system32|program files( \(x86\))?|programdata|users)\\?$/i,
  /^[a-z]:\\users\\[^\\]+\\?$/i, /^[a-z]:\\users\\[^\\]+\\(downloads|desktop|documents|pictures|videos|music|appdata|onedrive[^\\]*)\\?$/i,
  /^[a-z]:\\users\\[^\\]+\\appdata\\(local|roaming|locallow)\\?$/i];

// permanent delete (the cart). No recycle bin.
ipcMain.handle('delete', (_e, paths) => runPurge(paths, false, isProtected));
// empty cache/temp folders, keep the folder itself
ipcMain.handle('clean', (_e, paths) => runPurge(paths, true, (p) => CLEAN_BLOCK.some((re) => re.test(p))));

ipcMain.handle('emptyTrash', () => new Promise((resolve) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue'],
    { windowsHide: true }, (err) => resolve({ ok: !err }));
}));

ipcMain.handle('cleanmgr', () => {
  spawn('cleanmgr.exe', [], { detached: true, stdio: 'ignore' }).unref();
  return true;
});

function uninstallEntries() {
  const ps = `$k='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*';
Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.UninstallString } | Select-Object DisplayName,InstallLocation,UninstallString,QuietUninstallString | ConvertTo-Json -Compress`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        try { const j = JSON.parse(stdout); resolve(Array.isArray(j) ? j : [j]); } catch { resolve([]); }
      });
  });
}

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

ipcMain.handle('uninstall', async (_e, src) => {
  const how = src.actions && src.actions.uninstall;
  if (how === 'steam' && src.appid) { await shell.openExternal(`steam://uninstall/${src.appid}`); return { mode: 'steam' }; }
  if (how === 'registry') {
    const entries = await uninstallEntries();
    const paths = src.paths.map((x) => x.path.toLowerCase().replace(/\\+$/, ''));
    const label = normName(src.label);
    const hit = entries.find((e) => e.InstallLocation && paths.some((p) => {
      const loc = e.InstallLocation.toLowerCase().replace(/["\\]+$/g, '').replace(/^"/, '');
      return loc && (p === loc || p.startsWith(loc + '\\') || loc.startsWith(p + '\\'));
    })) || entries.find((e) => label.length > 3 && normName(e.DisplayName) === label);
    if (hit) {
      spawn(hit.UninstallString, [], { shell: true, detached: true, stdio: 'ignore', windowsHide: false }).unref();
      return { mode: 'registry', name: hit.DisplayName };
    }
  }
  await shell.openExternal('ms-settings:appsfeatures');
  return { mode: 'settings' };
});
