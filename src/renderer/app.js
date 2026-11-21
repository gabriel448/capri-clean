'use strict';
/* Capri Clean — renderer */
const api = window.capri;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { drives: [], selected: new Set(), result: null, view: 'home', cat: null, tab: 'sources', filter: '', open: new Set(), quick: new Set(), cart: new Map(), deleting: false };

// ---------- formatting ----------
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR');
function fmt(b) {
  if (b >= 1024 ** 4) return `${nf1.format(b / 1024 ** 4)} TB`;
  if (b >= 1024 ** 3) return `${nf1.format(b / 1024 ** 3)} GB`;
  if (b >= 1024 ** 2) return `${nf0.format(Math.round(b / 1024 ** 2))} MB`;
  if (b >= 1024) return `${nf0.format(Math.round(b / 1024))} KB`;
  return `${b} B`;
}
function countUp(el, to, ms = 900) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- Capri ----------
const FACES = { calm: 'face-calm', look: 'face-look', smug: 'face-smug', laugh: 'face-laugh', wide: 'face-wide' };
function face(kind) {
  const el = $('#face');
  const img = $('img', el);
  const src = `assets/${FACES[kind] || FACES.calm}.png`;
  if (img.getAttribute('src') === src) return;
  el.classList.add('is-swapping');
  setTimeout(() => { img.setAttribute('src', src); el.classList.remove('is-swapping'); }, 180);
}
function say(headline, meta) {
  const h = $('#headline');
  h.style.transition = 'opacity 180ms';
  h.style.opacity = 0;
  setTimeout(() => { h.innerHTML = headline; h.style.opacity = 1; }, 180);
  if (meta) $('#metaLine').textContent = meta;
}

function toast(msg, sub = '', kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast panel${kind === 'alert' ? ' toast--alert' : ''}`;
  el.innerHTML = `<div class="panel__plate"><img src="assets/${kind === 'alert' ? 'face-wide' : 'face-laugh'}.png" alt=""><div><p>${esc(msg)}</p>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 300); }, 4600);
}

function confirmBox({ title, body, ok = 'Confirmar', kind = 'CONFIRMAR', danger = true }) {
  return new Promise((resolve) => {
    const m = $('#modal');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modalKind').textContent = kind;
    const okBtn = $('#modalOk');
    okBtn.textContent = ok;
    okBtn.className = `btn ${danger ? 'btn--danger' : 'btn--go'}`;
    m.hidden = false;
    const done = (v) => { m.hidden = true; m.onclick = null; okBtn.onclick = null; document.onkeydown = null; resolve(v); };
    okBtn.onclick = () => done(true);
    m.onclick = (e) => { if (e.target.hasAttribute('data-close')) done(false); };
    document.onkeydown = (e) => { if (e.key === 'Escape') done(false); };
  });
}

// ---------- screens ----------
function swap(html, after) {
  const view = $('#view');
  const old = view.firstElementChild;
  const put = () => {
    view.innerHTML = `<div class="screen">${html}</div>`;
    view.scrollTop = 0;
    if (after) after(view.firstElementChild);
  };
  if (old) { old.classList.add('is-leaving'); setTimeout(put, 190); } else put();
}

function drivePicker() {
  const box = $('#drivePicker');
  box.innerHTML = state.drives.map((d) => `<button class="chip ${state.selected.has(d.root) ? 'is-on' : ''}" data-root="${esc(d.root)}"><span class="dot"></span>${esc(d.root.slice(0, 2))} ${fmt(d.used)}</button>`).join('');
  box.onclick = (e) => {
    const b = e.target.closest('.chip');
    if (!b || state.view === 'scanning') return;
    const r = b.dataset.root;
    if (state.selected.has(r)) { if (state.selected.size > 1) state.selected.delete(r); } else state.selected.add(r);
    drivePicker();
  };
}

function renderHome() {
  state.view = 'home';
  const used = state.drives.reduce((a, d) => a + d.used, 0);
  $('#tbMeta').textContent = `${state.drives.length} DISCO(S) // ${fmt(used)} USADOS`;
  swap(`
    <section class="home">
      <div class="home__copy">
        <div class="label">Discos encontrados</div>
        <div class="drivecards">
          ${state.drives.map((d, i) => {
            const pct = d.used / d.total;
            return `<div class="panel rise" style="--i:${i}"><div class="panel__plate drivecard">
              <div class="drivecard__letter">${esc(d.root.slice(0, 2))}</div>
              <div><div class="meter"><i class="${pct > 0.85 ? 'is-hot' : ''}" style="width:${(pct * 100).toFixed(1)}%"></i></div></div>
              <div class="drivecard__num"><b>${fmt(d.used)}</b> de ${fmt(d.total)}<br>${fmt(d.free)} livres</div>
            </div></div>`;
          }).join('')}
        </div>
        <p style="margin-top:26px">Eu varro o disco inteiro e separo tudo em <b>jogos, apps, vídeos, documentos, dev, cache</b>… Até jogo largado na pasta Downloads, compactado em RAR ou em pasta qualquer eu reconheço pelo motor dele (Unity, Unreal, Steamworks, repacks, dumps de PS4).</p>
        <p>Nada é apagado sem você confirmar. O que dá, vai pra Lixeira.</p>
      </div>
      <div class="home__art"><img src="assets/capri-cutout.png" alt=""></div>
    </section>`);
}

let lastP = null;
function renderScanning() {
  state.view = 'scanning';
  face('look');
  $('#face').classList.add('is-busy');
  say('Varrendo… <em>segura aí</em>.', 'lendo cada pasta');
  $('#scanBtn').disabled = true;
  swap(`
    <section class="scan"><div class="scan__box">
      <div class="label">Varredura</div>
      <div class="scan__big"><span id="scBytes">0 B</span><small id="scPct">0%</small></div>
      <div class="scan__stats"><span><b id="scFiles">0</b> arquivos</span><span><b id="scDirs">0</b> pastas</span><span>disco <b id="scDrive">—</b></span><span><b id="scTime">0s</b></span></div>
      <div class="scan__bar"><i id="scBar"></i></div>
      <div class="scan__path" id="scPath">&nbsp;</div>
      <div class="scan__actions"><button class="btn btn--ghost" id="cancelBtn">Parar</button></div>
    </div></section>`, (root) => {
    $('#cancelBtn', root).onclick = () => { api.cancel(); $('#cancelBtn').disabled = true; };
  });
  const t0 = Date.now();
  const tick = () => {
    if (state.view !== 'scanning') return;
    const el = $('#scTime');
    if (el) el.textContent = `${Math.round((Date.now() - t0) / 1000)}s`;
    if (lastP && $('#scBytes')) {
      const p = lastP;
      $('#scBytes').textContent = fmt(p.bytes);
      const pct = Math.min(99, (p.bytes / p.expected) * 100);
      $('#scPct').textContent = p.phase === 'classify' ? 'classificando' : `${Math.round(pct)}%`;
      $('#scBar').style.width = `${pct}%`;
      $('#scFiles').textContent = nf0.format(p.files);
      $('#scDirs').textContent = nf0.format(p.dirs);
      $('#scDrive').textContent = p.drive.slice(0, 2);
      $('#scPath').textContent = p.current;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const catById = (id) => state.result.categories.find((c) => c.id === id);
const totalUsed = () => state.result.drives.reduce((a, d) => a + d.used, 0);
const totalSize = () => state.result.drives.reduce((a, d) => a + d.total, 0);

function quickWins() {
  const out = [];
  for (const c of state.result.categories) {
    for (const s of c.sources) {
      if ((s.actions.clean || s.actions.emptyTrash) && s.bytes > 20 * 1024 * 1024) out.push(s);
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes).slice(0, 14);
}

function renderResults() {
  state.view = 'results';
  $('#face').classList.remove('is-busy');
  const r = state.result;
  const cats = r.categories;
  const used = totalUsed();
  const size = totalSize();
  const biggest = [...cats].sort((a, b) => b.bytes - a.bytes)[0];
  const wins = quickWins();
  if (!state.quick.size) wins.forEach((s) => state.quick.add(s.id));
  const winBytes = wins.filter((s) => state.quick.has(s.id)).reduce((a, s) => a + s.bytes, 0);
  face('smug');
  say(`O que mais pesa: <em>${esc(biggest.label.toLowerCase())}</em>, ${fmt(biggest.bytes)}.`, `${nf0.format(r.totals.files)} arquivos em ${Math.round(r.durationMs / 1000)}s`);
  $('#tbMeta').textContent = `${fmt(used)} USADOS // ${fmt(size - used)} LIVRES`;

  const shown = cats.filter((c) => c.bytes > 0);
  swap(`
    <div class="label">Pra onde foi o espaço</div>
    <section class="summary">
      <div>
        <div class="stack">
          ${shown.map((c, i) => `<i style="--i:${i};width:${(c.bytes / size) * 100}%;background:var(--c-${c.id})" data-cat="${c.id}" title="${esc(c.label)} · ${fmt(c.bytes)}"></i>`).join('')}
          <i class="free" style="--i:${shown.length};flex:1" title="Livre"></i>
        </div>
        <div class="legend">${shown.map((c) => `<span style="--c:var(--c-${c.id})">${esc(c.label)}</span>`).join('')}</div>
        <div class="totals">
          <div>Usado<b class="cu" data-to="${used}">0</b></div>
          <div>Livre<b class="cu" data-to="${size - used}">0</b></div>
          <div>Maior categoria<b>${esc(biggest.label)}</b></div>
        </div>
      </div>
      <div class="panel quick rise"><div class="panel__plate">
        <div class="meta"><span class="who">GANHO RÁPIDO</span><span class="sep">/</span><span>sem risco</span></div>
        <h3 id="quickTotal">${fmt(winBytes)}</h3>
        <p>Cache, temporários e lixeira. Os apps recriam o que precisarem.</p>
        <ul id="quickList">${wins.map((s) => `<li data-id="${esc(s.id)}" class="${state.quick.has(s.id) ? 'is-checked' : ''}"><span class="check"></span><span>${esc(s.label)}</span><span>${fmt(s.bytes)}</span></li>`).join('') || '<li><span></span><span>Nada sobrando por aqui.</span><span></span></li>'}</ul>
        <button class="btn btn--go" id="quickBtn" ${wins.length ? '' : 'disabled'}>Limpar selecionados</button>
      </div></div>
    </section>
    <div class="label">Categorias</div>
    <section class="cats">
      ${cats.map((c, i) => `
        <button class="cat rise ${c.bytes ? '' : 'cat--empty'}" style="--i:${i};--c:var(--c-${c.id})" data-cat="${c.id}">
          <div class="plate">
            <div class="cat__head"><span class="cat__name">${esc(c.label)}</span><span class="cat__pct">${used ? ((c.bytes / used) * 100).toFixed(1).replace('.', ',') : 0}%</span></div>
            <div class="cat__size cu" data-to="${c.bytes}">0 B</div>
            <div class="meter"><i style="width:${biggest.bytes ? (c.bytes / biggest.bytes) * 100 : 0}%"></i></div>
            <ul class="cat__top">${c.sources.slice(0, 3).map((s) => `<li><span>${esc(s.label)}</span><span>${fmt(s.bytes)}</span></li>`).join('')}</ul>
          </div>
        </button>`).join('')}
    </section>`, (root) => {
    root.querySelectorAll('.cu').forEach((el) => countUp(el, Number(el.dataset.to), 1100));
    root.querySelectorAll('[data-cat]').forEach((el) => { el.onclick = () => openCategory(el.dataset.cat); });
    $('#quickList', root).onclick = (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const id = li.dataset.id;
      if (state.quick.has(id)) state.quick.delete(id); else state.quick.add(id);
      li.classList.toggle('is-checked');
      const total = wins.filter((s) => state.quick.has(s.id)).reduce((a, s) => a + s.bytes, 0);
      countUp($('#quickTotal'), total, 500);
    };
    $('#quickBtn', root).onclick = () => runQuick(wins.filter((s) => state.quick.has(s.id)));
  });
}

function openCategory(id) {
  state.cat = id;
  state.tab = 'sources';
  state.filter = '';
  state.open.clear();
  renderCategory();
}

function sourceSub(s) {
  const p = s.paths[0] ? s.paths[0].path : '';
  return s.pathCount > 1 ? `${p}  +${s.pathCount - 1} local(is)` : p;
}

function rowHtml(s, max, i) {
  const tags = s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const safe = s.actions.clean || s.actions.emptyTrash ? '<span class="tag tag--ok">Seguro limpar</span>' : '';
  const acts = [];
  acts.push(`<button class="btn btn--ghost btn--sm" data-act="reveal">Abrir local</button>`);
  const can = cartable(s);
  const inCart = state.cart.has(`s:${s.id}`);
  if (can) acts.push(`<button class="btn btn--sm ${inCart ? 'btn--ghost' : 'btn--danger'}" data-act="cart">${inCart ? '✓ No carrinho · tirar' : '+ Carrinho de exclusão'}</button>`);
  if (s.actions.emptyTrash) acts.push(`<button class="btn btn--go btn--sm" data-act="emptyTrash">Esvaziar lixeira agora</button>`);
  if (s.actions.cleanmgr) acts.push(`<button class="btn btn--violet btn--sm" data-act="cleanmgr">Limpeza de Disco do Windows</button>`);
  if (s.actions.uninstall) acts.push(`<button class="btn btn--violet btn--sm" data-act="uninstall">Desinstalar</button>`);
  if (s.actions.trash) acts.push(`<button class="btn btn--ghost btn--sm" data-act="trash">Mover pra Lixeira</button>`);
  if (!can && s.tags.includes('Arquivos soltos')) acts.push('<span class="row__sub" style="align-self:center">Pasta com arquivos misturados: escolha arquivo por arquivo na aba “Maiores arquivos”.</span>');
  return `
  <div class="row rise ${state.open.has(s.id) ? 'is-open' : ''} ${inCart ? 'is-incart' : ''}" style="--i:${Math.min(i, 14)}" data-id="${esc(s.id)}">
    <div class="row__main">
      <div style="min-width:0"><div class="row__name">${esc(s.label)}${tags}${safe}</div><div class="row__sub">${esc(sourceSub(s))}</div></div>
      <div class="meter"><i style="width:${max ? Math.max(0.5, (s.bytes / max) * 100) : 0}%"></i></div>
      <div class="row__size">${fmt(s.bytes)}</div>
      <button class="addcart ${inCart ? 'is-in' : ''}" data-act="cart" title="${inCart ? 'Tirar do carrinho' : 'Adicionar ao carrinho'}" ${can ? '' : 'disabled'}>${inCart ? '✓' : '+'}</button>
      <div class="chev"></div>
    </div>
    <div class="row__more"><div><div class="row__inner">
      ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
      <ul class="paths">${s.paths.slice(0, 25).map((p, k) => `<li><span>${esc(p.path)}</span><span>${fmt(p.bytes)}</span><button class="link" data-act="revealPath" data-k="${k}">abrir</button></li>`).join('')}</ul>
      <div class="actions">${acts.join('')}</div>
    </div></div></div>
  </div>`;
}

function fileRowHtml(f, max, i) {
  const inCart = state.cart.has(`f:${f.path}`);
  return `
  <div class="row rise ${inCart ? 'is-incart' : ''}" style="--i:${Math.min(i, 14)}" data-file="${esc(f.path)}">
    <div class="row__main">
      <div style="min-width:0"><div class="row__name">${esc(f.name)}<span class="tag">${esc(f.source)}</span></div><div class="row__sub">${esc(f.path)} · <button class="link" data-act="revealFile">abrir local</button></div></div>
      <div class="meter"><i style="width:${(f.size / max) * 100}%"></i></div>
      <div class="row__size">${fmt(f.size)}</div>
      <button class="addcart ${inCart ? 'is-in' : ''}" data-act="cart" title="${inCart ? 'Tirar do carrinho' : 'Adicionar ao carrinho'}">${inCart ? '✓' : '+'}</button>
      <div></div>
    </div>
  </div>`;
}

function listHtml(c) {
  const q = state.filter.trim().toLowerCase();
  if (state.tab === 'files') {
    const files = c.files.filter((f) => !q || f.path.toLowerCase().includes(q));
    if (!files.length) return '<div class="empty">Nenhum arquivo acima de 64 MB aqui.</div>';
    return files.map((f, i) => fileRowHtml(f, files[0].size, i)).join('');
  }
  const src = c.sources.filter((s) => !q || s.label.toLowerCase().includes(q) || s.paths.some((p) => p.path.toLowerCase().includes(q)));
  if (!src.length) return '<div class="empty">Nada encontrado.</div>';
  return src.map((s, i) => rowHtml(s, src[0].bytes, i)).join('');
}

function renderCategory() {
  state.view = 'category';
  const c = catById(state.cat);
  face(c.id === 'cache' || c.id === 'trash' ? 'laugh' : 'look');
  say(`${esc(c.label)}: <em>${fmt(c.bytes)}</em> em ${nf0.format(c.sourceCount)} fonte(s).`, c.hint);
  swap(`
    <div style="--c:var(--c-${c.id})">
      <div class="detail__head">
        <div><button class="back" id="backBtn">‹ VOLTAR</button><h2 class="detail__title">${esc(c.label)}</h2><p class="hint">${esc(c.hint)}</p></div>
        <div class="detail__size">TOTAL<b class="cu" data-to="${c.bytes}">0</b></div>
      </div>
      <div class="toolbar">
        <div class="tabs"><button class="tab ${state.tab === 'sources' ? 'is-on' : ''}" data-tab="sources">Fontes · ${c.sourceCount}</button><button class="tab ${state.tab === 'files' ? 'is-on' : ''}" data-tab="files">Maiores arquivos · ${c.files.length}</button></div>
        <input class="search" id="search" placeholder="Filtrar por nome ou caminho…" value="${esc(state.filter)}">
      </div>
      <div class="rows" id="rows">${listHtml(c)}</div>
    </div>`, (root) => {
    root.querySelectorAll('.cu').forEach((el) => countUp(el, Number(el.dataset.to), 900));
    $('#backBtn', root).onclick = renderResults;
    root.querySelectorAll('.tab').forEach((t) => { t.onclick = () => {
      state.tab = t.dataset.tab;
      root.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-on', x === t));
      $('#rows').innerHTML = listHtml(c);
    }; });
    $('#search', root).oninput = (e) => { state.filter = e.target.value; $('#rows').innerHTML = listHtml(c); };
    $('#rows', root).onclick = (e) => onRowClick(e, c);
  });
}

// ---------- actions ----------
function findSource(id) {
  for (const c of state.result.categories) { const s = c.sources.find((x) => x.id === id); if (s) return [c, s]; }
  return [null, null];
}

function applyFreed(c, s, freed, remove) {
  freed = Math.min(freed, s.bytes);
  s.bytes -= freed;
  c.bytes -= freed;
  if (remove || s.bytes < 1024 * 1024) {
    c.sources = c.sources.filter((x) => x !== s);
    c.sourceCount -= 1;
  }
  for (const d of state.result.drives) { d.used = Math.max(0, d.used - freed); }
}

const listPaths = (s) => `<ul>${s.paths.slice(0, 12).map((p) => `<li>${esc(p.path)} — ${fmt(p.bytes)}</li>`).join('')}${s.pathCount > 12 ? `<li>…e mais ${s.pathCount - 12}</li>` : ''}</ul>`;

async function doAction(act, c, s, rowEl) {
  if (act === 'reveal') return api.reveal(s.paths[0].path);
  if (act === 'cleanmgr') { api.cleanmgr(); return toast('Abri a Limpeza de Disco.', 'Marque "Limpar arquivos do sistema" pra ver tudo.'); }
  if (act === 'uninstall') {
    const ok = await confirmBox({ title: `Desinstalar ${s.label}?`, body: `<p>Vou abrir o desinstalador oficial${s.launcher ? ` (${esc(s.launcher)})` : ''}. Siga as instruções dele.</p>`, ok: 'Abrir desinstalador', kind: 'DESINSTALAR', danger: false });
    if (!ok) return;
    const r = await api.uninstall(s);
    return toast(r.mode === 'settings' ? 'Abri Apps instalados do Windows.' : `Desinstalador aberto${r.name ? `: ${r.name}` : ''}.`, 'Depois, varra de novo pra atualizar os números.');
  }
  if (act === 'emptyTrash') {
    const ok = await confirmBox({ title: 'Esvaziar a Lixeira?', body: `<p>Isso apaga de vez ${fmt(s.bytes)} que já estão na lixeira. <b>Não dá pra desfazer.</b></p>`, ok: 'Esvaziar' });
    if (!ok) return;
    await api.emptyTrash();
    rowEl && rowEl.classList.add('is-gone');
    applyFreed(c, s, s.bytes, true);
    face('laugh');
    toast(`Lixeira vazia. +${fmt(s.bytes)} livres.`);
    return true;
  }
  if (act === 'clean') {
    const ok = await confirmBox({ title: `Limpar ${s.label}?`, body: `<p>Vou apagar o <b>conteúdo</b> destas pastas (as pastas ficam). Arquivos em uso são pulados.</p>${listPaths(s)}<p>Isso não vai pra Lixeira.</p>`, ok: `Limpar ${fmt(s.bytes)}` });
    if (!ok) return;
    const r = await api.clean(s.paths.map((p) => p.path));
    if (r.failed.length && !r.freed) { toast('Não consegui limpar essa pasta.', r.failed[0].error, 'alert'); return; }
    rowEl && rowEl.classList.add('is-gone');
    applyFreed(c, s, r.freed, !r.skipped);
    face('laugh');
    toast(`Limpei ${fmt(r.freed)}.`, r.skipped ? `${nf0.format(r.skipped)} arquivo(s) em uso foram ignorados. Normal.` : '');
    return true;
  }
  if (act === 'trash') {
    const ok = await confirmBox({ title: `Mandar ${s.label} pra Lixeira?`, body: `<p>Estes caminhos vão pra Lixeira do Windows (dá pra restaurar):</p>${listPaths(s)}<p>Se for maior que o limite da lixeira, o Windows pode apagar direto.</p>`, ok: 'Mover pra Lixeira' });
    if (!ok) return;
    const r = await api.trash(s.paths.map((p) => p.path));
    if (r.failed.length) toast(`Não consegui mover ${r.failed.length} item(ns).`, r.failed[0].error, 'alert');
    if (r.freed) {
      rowEl && rowEl.classList.add('is-gone');
      applyFreed(c, s, r.freed, !r.failed.length);
      face('laugh');
      toast(`${s.label} foi pra Lixeira.`, `${fmt(r.freed)} liberados quando você esvaziar a lixeira.`);
    }
    return true;
  }
}

async function onRowClick(e, c) {
  const actBtn = e.target.closest('[data-act]');
  const row = e.target.closest('.row');
  if (!row) return;
  if (row.dataset.file) {
    if (!actBtn) return;
    if (actBtn.dataset.act === 'cart') {
      const f = c.files.find((x) => x.path === row.dataset.file);
      if (f) toggleCart(itemFromFile(c, f));
      refreshRow(row, c);
    } else api.reveal(row.dataset.file);
    return;
  }
  const [, s] = findSource(row.dataset.id);
  if (!s) return;
  if (actBtn) {
    const act = actBtn.dataset.act;
    if (act === 'revealPath') return api.reveal(s.paths[Number(actBtn.dataset.k)].path);
    if (act === 'cart') { toggleCart(itemFromSource(c, s)); refreshRow(row, c); return; }
    const changed = await doAction(act, c, s, row);
    if (changed) setTimeout(() => {
      if (state.view !== 'category') return;
      $('#rows').innerHTML = listHtml(c);
      const total = $('.detail__size .cu');
      if (total) countUp(total, c.bytes, 700);
    }, 540);
    return;
  }
  if (e.target.closest('.row__main')) {
    row.classList.toggle('is-open');
    if (row.classList.contains('is-open')) state.open.add(s.id); else state.open.delete(s.id);
  }
}

async function runQuick(list) {
  if (!list.length) return;
  const total = list.reduce((a, s) => a + s.bytes, 0);
  const ok = await confirmBox({
    title: `Liberar ~${fmt(total)}?`,
    body: `<p>Vou limpar o conteúdo de:</p><ul>${list.map((s) => `<li>${esc(s.label)} — ${fmt(s.bytes)}</li>`).join('')}</ul><p>Cache e temporários não vão pra Lixeira. Arquivos em uso são pulados.</p>`,
    ok: 'Limpar tudo',
  });
  if (!ok) return;
  $('#quickBtn').disabled = true;
  face('look');
  let freed = 0;
  let skipped = 0;
  for (const s of list) {
    const [c] = findSource(s.id);
    if (s.actions.emptyTrash) {
      await api.emptyTrash();
      freed += s.bytes;
      applyFreed(c, s, s.bytes, true);
    } else {
      const r = await api.clean(s.paths.map((p) => p.path));
      freed += r.freed;
      skipped += r.skipped;
      applyFreed(c, s, r.freed, !r.skipped);
    }
  }
  state.quick.clear();
  face('laugh');
  toast(`Pronto: ${fmt(freed)} liberados.`, skipped ? `${nf0.format(skipped)} arquivo(s) em uso foram ignorados.` : '');
  renderResults();
}

// ---------- cart: pick things, review, delete for good ----------
function cartable(s) {
  if (s.cat === 'system' || !s.paths.length) return false;
  if (s.tags.includes('Arquivos soltos')) return false; // a bucket folder mixes categories
  if (s.actions.cleanmgr && !s.actions.clean) return false; // Windows.old & co: cleanmgr only
  if (s.id === 'apps:storeapps') return false;
  return true;
}

function itemFromSource(c, s) {
  const mode = s.actions.emptyTrash ? 'emptyTrash' : s.actions.clean ? 'clean' : 'delete';
  let warn = '';
  if (mode === 'delete') {
    if (s.launcher || s.actions.uninstall === 'steam') warn = `O ${s.launcher || 'launcher'} ainda vai achar que está instalado. "Desinstalar" é mais limpo.`;
    else if (s.actions.uninstall) warn = 'Instalado: o Windows ainda vai listar o app. "Desinstalar" é mais limpo.';
    else if (s.tags.includes('Dados de app') || s.tags.includes('Dados do jogo')) warn = 'Configurações, logins e saves desse app vão junto.';
    else if (s.id === 'dev:git') warn = 'Apaga o histórico dos repositórios.';
  }
  return {
    key: `s:${s.id}`, kind: 'source', mode, catId: c.id, sourceId: s.id, label: s.label,
    sub: s.pathCount > 1 ? `${s.pathCount} locais · ${s.paths[0].path}` : s.paths[0].path,
    bytes: s.bytes, paths: s.paths.map((p) => p.path), warn,
  };
}

function itemFromFile(c, f) {
  return { key: `f:${f.path}`, kind: 'file', mode: 'delete', catId: c.id, label: f.name, sub: f.path, bytes: f.size, paths: [f.path], source: f.source, warn: '' };
}

function toggleCart(item) {
  if (state.deleting) return;
  if (state.cart.has(item.key)) state.cart.delete(item.key);
  else state.cart.set(item.key, item);
  updateCartBtn(true);
  if ($('#drawer').classList.contains('is-open')) renderCart();
}

function cartTotal() {
  let t = 0;
  for (const it of state.cart.values()) t += it.bytes;
  return t;
}

function updateCartBtn(bump) {
  const b = $('#cartBtn');
  const n = state.cart.size;
  $('#cartCount').textContent = n;
  $('#cartSize').textContent = n ? fmt(cartTotal()) : 'vazio';
  b.classList.toggle('has-items', n > 0);
  if (bump) { b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump'); }
}

function refreshRow(row, c) {
  const html = row.dataset.file
    ? fileRowHtml(c.files.find((x) => x.path === row.dataset.file), c.files[0].size, 0)
    : rowHtml(findSource(row.dataset.id)[1], c.sources[0].bytes, 0);
  const tmp = document.createElement('div');
  tmp.innerHTML = html.trim();
  const fresh = tmp.firstElementChild;
  fresh.classList.remove('rise');
  if (row.classList.contains('is-open')) fresh.classList.add('is-open');
  row.replaceWith(fresh);
}

const MODE_LABEL = { delete: 'apagar de vez', clean: 'limpar conteúdo', emptyTrash: 'esvaziar' };

function renderCart() {
  const items = [...state.cart.values()];
  countUp($('#cartTotal'), cartTotal(), 500);
  $('#cartItems').textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
  $('#cartGo').disabled = !items.length || state.deleting;
  $('#cartClear').disabled = !items.length || state.deleting;
  $('#cartList').innerHTML = items.length ? items.map((it, i) => `
    <div class="citem" style="--i:${i};--c:var(--c-${it.catId})" data-key="${esc(it.key)}">
      <span class="citem__bar"></span>
      <div style="min-width:0">
        <div class="citem__name"><span class="citem__mode ${it.mode === 'delete' ? '' : 'citem__mode--soft'}">${MODE_LABEL[it.mode]}</span>${esc(it.label)}</div>
        <div class="citem__sub">${esc(it.sub)}</div>
        ${it.warn ? `<span class="citem__warn">⚠ ${esc(it.warn)}</span>` : ''}
      </div>
      <div class="citem__size">${fmt(it.bytes)}</div>
      <button class="citem__x" title="Tirar do carrinho">×</button>
    </div>`).join('')
    : `<div class="cart-empty"><img src="assets/face-calm.png" alt="">Carrinho vazio.<br>Use o <b>+</b> nas fontes e arquivos pra juntar o que quer apagar.</div>`;
}

function openCart() { renderCart(); $('#drawer').classList.add('is-open'); }
function closeCart() { if (!state.deleting) $('#drawer').classList.remove('is-open'); }

function applyItem(it, freed, complete) {
  const c = catById(it.catId);
  if (!c) return;
  if (it.kind === 'source') {
    const s = c.sources.find((x) => x.id === it.sourceId);
    if (s) applyFreed(c, s, freed, complete);
    return;
  }
  freed = Math.min(freed, it.bytes);
  c.bytes -= freed;
  if (complete) c.files = c.files.filter((f) => f.path !== it.paths[0]);
  const s = c.sources.find((x) => x.label === it.source && x.paths.some((p) => it.paths[0].toLowerCase().startsWith(p.path.toLowerCase())));
  if (s) s.bytes = Math.max(0, s.bytes - freed);
  for (const d of state.result.drives) d.used = Math.max(0, d.used - freed);
}

async function runCart() {
  if (state.deleting || !state.cart.size) return;
  state.deleting = true;
  $('#cartGo').disabled = true;
  $('#cartClear').disabled = true;
  face('look');
  $('#face').classList.add('is-busy');
  let freed = 0;
  let failed = 0;
  let skipped = 0;
  // files first, then folders: a file may live inside a folder that is also in the cart
  const items = [...state.cart.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'file' ? -1 : 1));
  for (const it of items) {
    const el = $(`.citem[data-key="${CSS.escape(it.key)}"]`);
    el && el.classList.add('is-working');
    el && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    let r;
    if (it.mode === 'emptyTrash') { await api.emptyTrash(); r = { freed: it.bytes, skipped: 0, failed: [] }; }
    else if (it.mode === 'clean') r = await api.clean(it.paths);
    else r = await api.remove(it.paths);
    freed += r.freed;
    skipped += r.skipped || 0;
    const complete = !r.failed.length && !r.skipped;
    applyItem(it, r.freed, complete);
    if (el) {
      el.classList.remove('is-working');
      el.classList.add(r.failed.length ? 'is-failed' : 'is-done');
      $('.citem__size', el).textContent = r.failed.length ? 'protegido' : `−${fmt(r.freed)}${r.skipped ? ` · ${nf0.format(r.skipped)} em uso` : ''}`;
      if (r.failed.length) {
        const w = document.createElement('span');
        w.className = 'citem__warn';
        w.textContent = `⚠ ${r.failed[0].error}`;
        el.children[1].append(w);
      }
    }
    if (r.failed.length) failed++;
    else state.cart.delete(it.key);
    countUp($('#cartTotal'), cartTotal(), 400);
    updateCartBtn(false);
  }
  state.deleting = false;
  $('#face').classList.remove('is-busy');
  face(failed ? 'wide' : 'laugh');
  const notes = [];
  if (skipped) notes.push(`${nf0.format(skipped)} arquivo(s) em uso foram ignorados`);
  if (failed) notes.push(`${failed} item(ns) protegidos ficaram no carrinho`);
  toast(`Apaguei ${fmt(freed)} de vez.`, notes.length ? `${notes.join(' · ')}.` : 'Espaço livre de verdade, sem passar pela lixeira.', failed ? 'alert' : 'ok');
  setTimeout(() => {
    renderCart();
    if (state.view === 'category') renderCategory();
    else if (state.view === 'results') renderResults();
  }, 900);
}

// hold-to-confirm: press for 1.4s, release early to cancel
(function holdButton() {
  const b = $('#cartGo');
  let t = null;
  const cancel = () => { clearTimeout(t); t = null; b.classList.remove('is-holding'); $('.hold__label', b).textContent = 'Segure pra apagar tudo'; };
  b.addEventListener('pointerdown', () => {
    if (b.disabled) return;
    b.classList.add('is-holding');
    $('.hold__label', b).textContent = 'Continue segurando…';
    t = setTimeout(() => { cancel(); runCart(); }, 1400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => { if (t) cancel(); }));
}());

$('#cartBtn').onclick = openCart;
$('#drawer').addEventListener('click', (e) => {
  if (e.target.closest('[data-close-cart]')) return closeCart();
  const x = e.target.closest('.citem__x');
  if (x && !state.deleting) {
    const el = x.closest('.citem');
    state.cart.delete(el.dataset.key);
    el.style.opacity = 0;
    el.style.transform = 'translateX(30px)';
    el.style.transition = 'opacity 260ms, transform 360ms var(--ease-out)';
    updateCartBtn(false);
    setTimeout(() => {
      renderCart();
      if (state.view === 'category') $('#rows').innerHTML = listHtml(catById(state.cat));
    }, 280);
  }
});
$('#cartClear').onclick = () => {
  if (state.deleting) return;
  state.cart.clear();
  updateCartBtn(false);
  renderCart();
  if (state.view === 'category') $('#rows').innerHTML = listHtml(catById(state.cat));
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').hidden) closeCart(); });

// ---------- scan lifecycle ----------
async function startScan() {
  lastP = null;
  state.quick.clear();
  renderScanning();
  await api.scan([...state.selected]);
}

api.onProgress((p) => { lastP = p; });
api.onDone((r) => {
  $('#scanBtn').disabled = false;
  $('#scanBtn span').textContent = 'Varrer de novo';
  state.result = r;
  if (r.stopped) toast('Varredura interrompida.', 'Mostrando o que deu pra ler.', 'alert');
  renderResults();
});
api.onError((msg) => {
  $('#scanBtn').disabled = false;
  $('#face').classList.remove('is-busy');
  face('wide');
  toast('A varredura falhou.', msg.split('\n')[0], 'alert');
  renderHome();
});

$('#scanBtn').onclick = startScan;

// ---------- updates (GitHub Releases) ----------
let appVersion = '';
function setUpd(stateName, text, button) {
  const el = $('#upd');
  el.dataset.state = stateName;
  el.innerHTML = `<span>${esc(text)}</span>${button ? `<button id="updBtn">${esc(button)}</button>` : ''}`;
  const b = $('#updBtn');
  if (b) b.onclick = () => { b.disabled = true; b.textContent = 'reiniciando…'; api.installUpdate(); };
}
api.onUpdate((u) => {
  const v = appVersion ? `v${appVersion}` : '';
  if (u.state === 'checking') setUpd('checking', `${v} · procurando atualização`);
  else if (u.state === 'latest') setUpd('latest', `${v} · atualizado`);
  else if (u.state === 'available') setUpd('downloading', `baixando v${u.version}…`);
  else if (u.state === 'downloading') setUpd('downloading', `baixando atualização ${Math.round(u.percent || 0)}%`);
  else if (u.state === 'error') setUpd('error', `${v} · sem conexão com atualizações`);
  else if (u.state === 'ready') {
    const idle = state.view === 'home' && !state.cart.size && !state.deleting;
    if (idle) {
      // nothing going on: update right now, with a short heads-up
      let n = 4;
      setUpd('ready', `v${u.version} pronta · reiniciando em ${n}s`, 'Agora');
      toast(`Versão nova (v${u.version}) baixada.`, 'Vou reiniciar pra atualizar em alguns segundos.');
      const t = setInterval(() => {
        n -= 1;
        if (state.view !== 'home' || state.cart.size) { clearInterval(t); setUpd('ready', `v${u.version} pronta`, 'Reiniciar e atualizar'); return; }
        if (n <= 0) { clearInterval(t); api.installUpdate(); return; }
        const s = $('#upd span');
        if (s) s.textContent = `v${u.version} pronta · reiniciando em ${n}s`;
      }, 1000);
    } else {
      setUpd('ready', `v${u.version} pronta`, 'Reiniciar e atualizar');
      toast(`Versão nova (v${u.version}) pronta.`, 'Clique em "Reiniciar e atualizar" no topo, ou ela instala quando você fechar.');
    }
  }
});

(async function init() {
  appVersion = await api.version();
  setUpd('idle', `v${appVersion}`);
  state.drives = await api.drives();
  state.drives.forEach((d) => state.selected.add(d.root));
  drivePicker();
  renderHome();
}());
