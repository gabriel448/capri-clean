'use strict';
/*
 * Demo mode (`npm run demo`): a made-up PC, so screenshots never show anyone's real files.
 * Nothing on disk is read; actions still go to the real handlers, so don't click delete
 * on paths that happen to exist on your machine.
 */
const { CATEGORIES } = require('./taxonomy');

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const U = 'C:\\Users\\Voce';
const g = (n) => Math.round(n * GB);

// [cat, label, GB, path, extra]
const SRC = [
  ['games', 'Baldur\'s Gate 3', 122.4, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Baldurs Gate 3', { tags: ['Steam'], launcher: 'Steam', appid: '1086940', uninstall: 'steam' }],
  ['games', 'Red Dead Redemption 2', 119.5, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Red Dead Redemption 2', { tags: ['Steam'], launcher: 'Steam', appid: '1174180', uninstall: 'steam' }],
  ['games', 'Forza Horizon 5', 110.2, 'C:\\XboxGames\\Forza Horizon 5', { tags: ['Xbox / Game Pass'], launcher: 'Xbox', uninstall: 'settings' }],
  ['games', 'Elden Ring', 49.1, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\ELDEN RING', { tags: ['Steam'], launcher: 'Steam', appid: '1245620', uninstall: 'steam' }],
  ['games', 'Fortnite', 44.8, 'C:\\Program Files\\Epic Games\\Fortnite', { tags: ['Epic Games', 'Dados do jogo'], launcher: 'Epic Games', uninstall: 'registry' }],
  ['games', 'Minecraft', 11.3, `${U}\\curseforge\\minecraft\\Instances\\All the Mods 9`, { tags: ['CurseForge'], extraPaths: [[`${U}\\AppData\\Roaming\\.minecraft`, 2.1]] }],
  ['games', 'Hollow Knight', 9.1, `${U}\\Downloads\\Hollow Knight`, { tags: ['Pasta solta'], trash: true }],
  ['games', 'Celeste', 1.2, `${U}\\Downloads\\Celeste`, { tags: ['Instalador / compactado'], trash: true }],
  ['games', 'Stardew Valley', 0.7, 'C:\\GOG Games\\Stardew Valley', { tags: ['GOG'], launcher: 'GOG', uninstall: 'registry' }],
  ['apps', 'Adobe Photoshop 2026', 5.8, 'C:\\Program Files\\Adobe\\Adobe Photoshop 2026', { uninstall: 'registry' }],
  ['apps', 'Spotify', 4.2, `${U}\\AppData\\Roaming\\Spotify`, { tags: ['Dados de app'] }],
  ['apps', 'Chrome', 3.1, `${U}\\AppData\\Local\\Google\\Chrome`, { tags: ['Dados de app'], uninstall: 'registry' }],
  ['apps', 'Steam', 2.1, 'C:\\Program Files (x86)\\Steam', { tags: ['Dados de app'] }],
  ['apps', 'Discord', 1.4, `${U}\\AppData\\Local\\Discord`, { tags: ['Dados de app'], uninstall: 'registry' }],
  ['apps', 'OBS Studio', 0.6, 'C:\\Program Files\\obs-studio', { uninstall: 'registry' }],
  ['videos', 'Videos › Gravações', 38.2, `${U}\\Videos\\Gravações`, { tags: ['Arquivos soltos'] }],
  ['videos', 'Downloads', 6.2, `${U}\\Downloads`, { tags: ['Arquivos soltos'] }],
  ['images', 'Pictures › Câmera', 12.4, `${U}\\Pictures\\Câmera`, { tags: ['Arquivos soltos'] }],
  ['images', 'Desktop', 0.8, `${U}\\Desktop`, { tags: ['Arquivos soltos'] }],
  ['audio', 'Music', 7.5, `${U}\\Music`, { tags: ['Arquivos soltos'] }],
  ['docs', 'Documents › Faculdade', 2.3, `${U}\\Documents\\Faculdade`, { tags: ['Arquivos soltos'] }],
  ['docs', 'Downloads', 0.6, `${U}\\Downloads`, { tags: ['Arquivos soltos'] }],
  ['archives', 'Downloads', 18.6, `${U}\\Downloads`, { tags: ['Arquivos soltos'] }],
  ['dev', 'Android SDK', 12.0, `${U}\\AppData\\Local\\Android\\Sdk`, {}],
  ['dev', 'Docker', 9.8, `${U}\\AppData\\Local\\Docker`, {}],
  ['dev', 'node_modules', 6.2, `${U}\\projetos\\loja\\node_modules`, { trash: true, note: 'Recriável com npm install. Cada caminho é um projeto.', extraPaths: [[`${U}\\projetos\\portfolio\\node_modules`, 1.4], [`${U}\\projetos\\bot\\node_modules`, 0.9]] }],
  ['dev', 'portfolio', 1.1, `${U}\\projetos\\portfolio`, { tags: ['Projeto de código'] }],
  ['cache', 'Temporários do usuário (%TEMP%)', 13.8, `${U}\\AppData\\Local\\Temp`, { clean: true }],
  ['cache', 'Windows Update · downloads antigos', 3.2, 'C:\\Windows\\SoftwareDistribution\\Download', { clean: true }],
  ['cache', 'Chrome · cache', 2.1, `${U}\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache`, { clean: true, tags: ['Cache de app'] }],
  ['cache', 'Cache de shaders da GPU', 1.3, `${U}\\AppData\\Local\\NVIDIA\\DXCache`, { clean: true, note: 'Os jogos recriam esse cache. O primeiro boot pode ficar mais lento.' }],
  ['cache', 'Discord · cache', 0.4, `${U}\\AppData\\Roaming\\discord\\Cache`, { clean: true, tags: ['Cache de app'] }],
  ['trash', 'Lixeira', 4.6, 'C:\\$Recycle.Bin', { emptyTrash: true, note: 'Esvaziar apaga de vez o que já está na lixeira.' }],
  ['system', 'Windows', 28.0, 'C:\\Windows', {}],
  ['system', 'Áreas protegidas do sistema', 22.0, 'C:\\', { cleanmgr: true, note: 'Arquivo de paginação, hibernação, WinSxS, pontos de restauração e pastas sem permissão de leitura.' }],
  ['system', 'Memória virtual (pagefile.sys)', 16.0, 'C:\\pagefile.sys', { note: 'Gerenciado pelo Windows.' }],
  ['other', 'C: › Backup', 25.0, 'C:\\Backup', { tags: ['Arquivos soltos'] }],
];

const FILES = {
  games: [['Baldurs Gate 3\\Data\\Gustav.pak', 'Baldur\'s Gate 3', 18.2], ['Red Dead Redemption 2\\levels_3.rpf', 'Red Dead Redemption 2', 8.0], ['ELDEN RING\\Game\\data0.bdt', 'Elden Ring', 7.1]],
  videos: [['Gravações\\gameplay-2026-10-31.mp4', 'Videos › Gravações', 6.4], ['Gravações\\live-aniversario.mkv', 'Videos › Gravações', 4.9], ['Downloads\\aula-completa.mp4', 'Downloads', 2.2]],
  archives: [['Downloads\\backup-celular.zip', 'Downloads', 7.8], ['Downloads\\Win11_24H2.iso', 'Downloads', 5.6], ['Downloads\\setup-jogo.exe', 'Downloads', 1.9]],
};

function build() {
  const cats = CATEGORIES.map((c) => ({ id: c.id, label: c.label, hint: c.hint, bytes: 0, sources: [], sourceCount: 0, files: [] }));
  const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
  SRC.forEach(([cat, label, gb, p, x], i) => {
    const paths = [{ path: p, bytes: g(gb) }].concat((x.extraPaths || []).map(([pp, b]) => ({ path: pp, bytes: g(b) })));
    const bytes = paths.reduce((a, q) => a + q.bytes, 0);
    byId[cat].sources.push({
      id: `${cat}:demo${i}`, cat, label, bytes, paths, pathCount: paths.length, tags: x.tags || [],
      launcher: x.launcher || null, appid: x.appid || null, note: x.note || null,
      actions: { trash: !!x.trash, clean: !!x.clean, uninstall: x.uninstall || null, emptyTrash: !!x.emptyTrash, cleanmgr: !!x.cleanmgr },
    });
    byId[cat].bytes += bytes;
  });
  for (const [cat, list] of Object.entries(FILES)) {
    byId[cat].files = list.map(([rel, source, gb]) => ({ path: `${cat === 'games' ? 'C:\\Program Files (x86)\\Steam\\steamapps\\common' : U}\\${rel}`, name: rel.split('\\').pop(), size: g(gb), source }));
  }
  for (const c of cats) { c.sources.sort((a, b) => b.bytes - a.bytes); c.sourceCount = c.sources.length; }
  const used = cats.reduce((a, c) => a + c.bytes, 0);
  const total = 1863 * GB;
  return { cats, used, total };
}

function drives() {
  const { used, total } = build();
  return [{ root: 'C:\\', total, free: total - used, used }];
}

function play(send) {
  const { cats, used, total } = build();
  const t0 = Date.now();
  const dur = 14000;
  const paths = ['C:\\Program Files (x86)\\Steam\\steamapps\\common', `${U}\\Downloads`, `${U}\\AppData\\Local`, `${U}\\Videos\\Gravações`, 'C:\\Windows\\System32'];
  const timer = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / dur);
    send('scan:progress', {
      files: Math.round(k * 1240000), dirs: Math.round(k * 188000), bytes: Math.round(k * used), expected: used,
      drive: 'C:\\', current: paths[Math.floor(k * 4.99)] + '\\…',
    });
    if (k >= 1) {
      clearInterval(timer);
      send('scan:done', {
        drives: [{ root: 'C:\\', total, free: total - used, used, scanned: used }],
        categories: cats, totals: { files: 1240000, dirs: 188000, bytes: used, denied: 0 },
        stopped: false, durationMs: dur, at: Date.now(),
      });
    }
  }, 120);
}

module.exports = { drives, play, build, MB };
