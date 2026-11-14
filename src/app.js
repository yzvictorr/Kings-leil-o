/* ===== UI + rede (v2) ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CROWN = `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#f5c542" d="M6 22l14 12 12-20 12 20 14-12-6 30H12z"/><rect x="12" y="54" width="40" height="5" rx="2" fill="#f5c542"/><circle cx="6" cy="20" r="4" fill="#f5c542"/><circle cx="32" cy="11" r="4" fill="#f5c542"/><circle cx="58" cy="20" r="4" fill="#f5c542"/></svg>`;
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
let MYPID = store("kl_pid"); if (!MYPID) { MYPID = "u" + Math.random().toString(36).slice(2, 10); store("kl_pid", MYPID); }

const NET = { mode: "none", code: null, db: null, rjoin: null, docRef: null, liveRef: null, unsub: [], busy: false, pending: false, lastWrite: 0, lbusy: false, lpending: false, llast: 0, seq: 0, queue: [], clockOff: 0, canWriteIn: true };
let S = null;      // estado do jogo
let LIVE = null;   // partida que este aparelho está assistindo
let LIVES = {};    // todas as partidas ao vivo da rodada (fid -> partida)
const EVS = {};    // eventos das partidas (modo local / cache)
const UI = { tab: "time", editMi: null, err: "", homeErr: "", busy: false, gate: null, speed: 1, paused: false };

function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 2600); }
function myMi() { return S ? S.managers.findIndex(m => m.pid === MYPID) : -1; }
function isHost() { return NET.mode === "local" || NET.mode === "host"; }
function now() { return Date.now(); }
function hostClock() { return Date.now() + (NET.mode === "client" ? NET.clockOff : 0); }
function humansIdx() { return S.managers.map((m, i) => i).filter(i => !S.managers[i].cpu); }

/* ---------- ações ---------- */
function act(a) {
  if (!S) return;
  if (a.t === "m" && a.a && a.a.fid == null && LIVE) a.a.fid = LIVE.fid;
  if (NET.mode === "local" || NET.mode === "host") {
    const mi = a.mi != null && NET.mode === "local" ? a.mi : myMi();
    if (a.t === "m") return liveAct(a.a, mi);
    if (hostOnly(a)) return hostAction(a);
    if (applyAction(S, a, mi, true, now())) commit(); else if (a.t === "bid") toast("Lance não aceito: confira saldo e vagas.");
  } else if (NET.mode === "client") sendIntent(a);
}
function hostOnly(a) { return ["quickround", "simstage", "lspeed", "lpause", "lff"].includes(a.t); }
function commit() {
  if (S.phase === "lobby" && Object.keys(LIVES).length) { LIVES = {}; UI.watch = null; LIVE = null; if (NET.mode === "host") writeLive(); try { renderLive(); } catch (e) { } }
  S.rev = (S.rev || 0) + 1; S.hostNow = now();
  render();
  if (NET.mode === "host") scheduleWrite();
  if (NET.mode === "local") saveLocal();
}
function saveLocal() { try { sessionStorage.setItem("kl_local2", JSON.stringify(S)); } catch (e) { } }
function scheduleWrite() {
  if (NET.busy) { NET.pending = true; return; }
  const wait = Math.max(0, (window.KL_STATE_MS || 220) - (now() - NET.lastWrite));
  NET.busy = true;
  setTimeout(async () => {
    try { S.hostNow = now(); await NET.docRef.set(JSON.parse(JSON.stringify(S))); } catch (e) { if (e && e.code === "quota_exceeded") toast("Limite de armazenamento atingido."); }
    NET.lastWrite = now(); NET.busy = false;
    if (NET.pending) { NET.pending = false; scheduleWrite(); }
  }, wait);
}
function writeLive() {
  if (NET.mode !== "host") return;
  if (NET.lbusy) { NET.lpending = true; return; }
  const wait = Math.max(0, (window.KL_LIVE_MS || 320) - (now() - NET.llast));
  NET.lbusy = true;
  setTimeout(async () => {
    try { const d = { ms: JSON.parse(JSON.stringify(LIVES)), hostNow: now() }; await NET.liveRef.set(d); } catch (e) { }
    NET.llast = now(); NET.lbusy = false;
    if (NET.lpending) { NET.lpending = false; writeLive(); }
  }, wait);
}

/* ---------- intenções dos convidados ---------- */
function sendIntent(a) {
  NET.seq++;
  NET.queue.push({ s: NET.seq, a });
  if (NET.queue.length > 8) NET.queue.shift();
  const pres = { kl: { pid: MYPID, q: NET.queue } };
  [NET.rjoin, NET.lobby].forEach(r => { try { r && r.presence && r.presence(pres); } catch (e) { } });
  if (NET.db) { try { NET.db.doc(`games/${NET.code}/in/${MYPID}`).set({ pid: MYPID, q: NET.queue }).then(() => { NET.writeOk = true; }).catch(e => { NET.writeOk = false; NET.writeErr = (e && e.code) || "erro"; }); } catch (e) { NET.writeOk = false; NET.writeErr = "erro"; } }
}
function handleIntents(pid, q) {
  if (NET.mode !== "host" || !S || !Array.isArray(q) || !pid) return;
  S.seqs = S.seqs || {};
  let changed = false, touched = false;
  q.slice().sort((x, y) => x.s - y.s).forEach(it => {
    if (!it || typeof it.s !== "number" || it.s <= (S.seqs[pid] || 0)) return;
    S.seqs[pid] = it.s; touched = true;
    const a = Object.assign({}, it.a || {});
    if (a.t === "join") a.pid = pid;
    if (hostOnly(a) || ["settings", "start", "pause", "autofill", "kick", "wcclose", "tclose", "keepclose", "relobby"].includes(a.t)) return;
    const mi = S.managers.findIndex(m => m.pid === pid);
    if (a.t === "m") { liveAct(a.a || {}, mi); touched = true; return; }
    if (applyAction(S, a, mi, false, now())) changed = true;
  });
  if (changed) commit(); else if (touched) scheduleWrite();
}
function peersList(p) { if (!p) return []; if (Array.isArray(p)) return p; if (p instanceof Map) return [...p.values()]; if (typeof p === "object") return Object.values(p); return []; }
function findKl(o, d) { if (!o || typeof o !== "object" || d > 4) return null; if (o.kl && o.kl.pid) return o.kl; for (const v of Object.values(o)) { const r = findKl(v, d + 1); if (r) return r; } return null; }
function onPeers(peers) {
  NET.peers = peersList(peers).length;
  peersList(peers).forEach(pr => { const k = findKl(pr, 0); if (k && k.pid !== MYPID) { NET.gotPresence = true; handleIntents(k.pid, k.q); } });
}
function applyRemote(data) {
  if (!data || NET.mode !== "client") return;
  NET.lastSync = Date.now();
  if (S && data.code === S.code && (data.rev || 0) <= (S.rev || 0) && S.phase === data.phase) { if (data.rev === S.rev) return; if ((data.rev || 0) < (S.rev || 0)) return; }
  const before = S && S.season ? S.season.fixtures.filter(f => f.res).length : 0;
  S = JSON.parse(JSON.stringify(data));
  setPov(S.pov);
  applyLocalOverrides(); applyOptimistic();
  if (S.hostNow) NET.clockOff = S.hostNow - Date.now();
  NET.lastSync = Date.now();
  render(); renderChat();
}
function applyRemoteLive(d) {
  if (NET.mode !== "client") return;
  if (d && d.hostNow && NET.liveNow && d.hostNow < NET.liveNow) return;
  if (d && d.hostNow) { NET.liveNow = d.hostNow; NET.clockOff = d.hostNow - Date.now(); }
  LIVES = d && d.ms && typeof d.ms === "object" ? d.ms : {};
  syncLive(); renderLive(); updateRoundBoard();
}
/* qual partida este aparelho mostra */
function myLiveTeams(M) { return NET.mode === "local" ? M.t.filter(T => !T.cpu).length > 0 : M.t.some(T => T.mi === myMi() && !T.cpu); }
function syncLive() {
  UI.dismiss = UI.dismiss || {};
  if (UI.watch && !LIVES[UI.watch]) UI.watch = null;
  if (!UI.watch) {
    const ms = Object.values(LIVES);
    const mine = ms.find(M => M.status === "playing" && myLiveTeams(M) && !UI.dismiss[M.fid] && !(M.pending && false));
    if (mine) { UI.watch = mine.fid; UI.hideLive = false; }
  }
  if (NET.mode === "local") {
    const cur = UI.watch ? LIVES[UI.watch] : null;
    const needs = M => M.status === "playing" && M.pending && chooser(M).some(n => !M.t[n.team].cpu);
    if (!cur || !needs(cur)) { const o = Object.values(LIVES).find(needs); if (o && (!cur || cur.status === "done" || !UI.dismiss[o.fid])) { UI.watch = o.fid; UI.hideLive = false; } }
  }
  LIVE = UI.watch ? LIVES[UI.watch] : null;
}
function setWatch(fid) { UI.watch = fid; UI.dismiss = UI.dismiss || {}; delete UI.dismiss[fid]; UI.hideLive = false; syncLive(); renderLive(true); }
function anyLive() { return Object.values(LIVES).some(M => M.status === "playing"); }
let pollT = null;
function startPoll() {
  if (pollT) return;
  pollT = setInterval(async () => {
    if (!NET.db || !NET.code) return;
    try {
      if (NET.mode === "host") {
        const snap = await NET.db.collection(`games/${NET.code}/in`).get();
        snap.docs.forEach(d => { const x = d.data(); if (x) handleIntents(x.pid || d.id, x.q); });
      } else if (NET.mode === "client") {
        const d = await NET.docRef.get(); if (d.exists) applyRemote(d.data());
        const l = await NET.liveRef.get(); applyRemoteLive(l.exists ? l.data() : null);
        if (myMi() < 0 && S && S.phase === "lobby" && NET.joinInfo && Date.now() - (NET.lastJoin || 0) > 4000) { NET.lastJoin = Date.now(); sendIntent({ t: "join", name: NET.joinInfo.name, team: NET.joinInfo.team }); }
      }
    } catch (e) { NET.pollErr = (e && e.code) || "erro"; }
  }, window.KL_POLL_MS || (NET.mode === "host" ? 600 : 800));
}

/* ---------- conexão ---------- */
async function getCaps() {
  if (!window.claude || !window.claude.use) return { db: null, room: null };
  const [db, room] = await Promise.all([window.claude.use("db").catch(() => null), window.claude.use("room").catch(() => null)]);
  return { db, room };
}
async function joinRoom(room, code) {
  if (!room) return null;
  try { let r = room.join ? room.join("kl-" + code) : room; if (r && r.then) r = await r; return r || null; } catch (e) { return null; }
}
function inviteCode() { try { const c = new URLSearchParams(location.search).get("sala"); return c && /^[A-Za-z]{4}$/.test(c) ? c.toUpperCase() : ""; } catch (e) { return ""; } }
function genCode() { const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; let c = ""; for (let i = 0; i < 4; i++) c += L[Math.floor(Math.random() * L.length)]; return c; }
async function createOnline() {
  const name = $("#h-name").value.trim(), team = $("#h-team").value.trim();
  if (!name || !team) { UI.homeErr = "Escreva seu nome e o nome do seu time."; return render(); }
  store("kl_name", name); store("kl_team", team);
  UI.busy = true; UI.homeErr = "Criando a sala…"; render();
  const { db, room } = await getCaps();
  if (!db) { UI.busy = false; UI.homeErr = (window.KL_SITE ? "Não consegui conectar ao banco da sala (Firebase). Confira o arquivo firebase-config.js e sua internet. Enquanto isso, dá pra jogar no modo 'um aparelho só'." : "Não consegui abrir o banco de dados da sala. Abra esta página pelo claude.ai com sua conta. Enquanto isso, dá pra jogar no modo 'um aparelho só'."); return render(); }
  const code = genCode();
  S = newGame(code, MYPID, name, team, "online");
  NET.db = db; NET.code = code; NET.docRef = db.doc("games/" + code); NET.liveRef = db.doc("live/" + code);
  try { await NET.docRef.set(JSON.parse(JSON.stringify(S))); await NET.liveRef.set({ status: "none" }); }
  catch (e) { UI.busy = false; S = null; UI.homeErr = "Sua conta só pode assistir salas aqui (sem permissão de gravar). Peça para o dono do artefato criar a sala, ou jogue no modo 'um aparelho só'."; return render(); }
  becomeHost(room);
}
async function becomeHost(room) {
  NET.mode = "host"; store("kl_last", NET.code);
  NET.liveRef = NET.db.doc("live/" + NET.code);
  try { const l = await NET.liveRef.get(); const d = l.exists ? l.data() : null; if (d && d.ms) { LIVES = d.ms; syncLive(); } } catch (e) { }
  const lobby = room || (await getCaps()).room;
  NET.rjoin = await joinRoom(lobby, NET.code);
  [NET.rjoin, lobby].forEach(r => { if (r && r.onPeers) { try { r.presence && r.presence({ kl: { pid: MYPID, host: true, q: [] } }); r.onPeers(onPeers); } catch (e) { } } });
  NET.lobby = lobby; startPoll();
  try { NET.unsub.push(NET.db.collection(`games/${NET.code}/in`).onSnapshot(snap => snap.docs.forEach(d => { const x = d.data(); if (x) handleIntents(x.pid || d.id, x.q); }), () => { })); } catch (e) { }
  startLoop(); UI.busy = false; UI.homeErr = "";
  commit(); renderLive();
}
async function joinOnline() {
  const code = $("#j-code").value.trim().toUpperCase(), name = $("#j-name").value.trim(), team = $("#j-team").value.trim();
  if (code.length !== 4) { UI.homeErr = "O código da sala tem 4 letras."; return render(); }
  if (!name || !team) { UI.homeErr = "Escreva seu nome e o nome do seu time."; return render(); }
  store("kl_name", name); store("kl_team", team);
  UI.busy = true; UI.homeErr = "Entrando…"; render();
  const { db, room } = await getCaps();
  if (!db) { UI.busy = false; UI.homeErr = (window.KL_SITE ? "Não consegui conectar ao banco da sala. Confira sua internet e tente de novo." : "Não consegui conectar. Abra esta página logado no claude.ai pelo link que o dono compartilhou."); return render(); }
  NET.db = db; NET.code = code; NET.docRef = db.doc("games/" + code); NET.liveRef = db.doc("live/" + code);
  let first = true;
  const timer = setTimeout(() => { if (first) { UI.homeErr = "A sala está demorando para responder. Confira o código e sua conexão."; render(); } }, 10000);
  NET.unsub.push(NET.docRef.onSnapshot(snap => {
    if (!snap.exists) {
      if (!snap.metadata.fromCache && first) { clearTimeout(timer); first = false; UI.busy = false; UI.homeErr = `Não achei a sala ${code}. Confira o código com o anfitrião.`; NET.unsub.forEach(u => u()); NET.unsub = []; render(); }
      return;
    }
    const data = snap.data();
    if (first) {
      clearTimeout(timer); first = false;
      if (data.hostPid === MYPID) { S = JSON.parse(JSON.stringify(data)); setPov(S.pov); NET.unsub.forEach(u => u()); NET.unsub = []; becomeHost(room); return; }
      NET.mode = "client"; store("kl_last", code); UI.busy = false; UI.homeErr = "";
      NET.joinInfo = { name, team };
      (async () => {
        NET.lobby = room; NET.rjoin = await joinRoom(room, code);
        if (!data.managers.some(m => m.pid === MYPID)) { NET.lastJoin = Date.now(); sendIntent({ t: "join", name, team }); }
        startLoop(); startPoll(); render();
      })();
      NET.unsub.push(NET.liveRef.onSnapshot(ls => applyRemoteLive(ls.exists ? ls.data() : null), () => { }));
    }
    if (NET.mode === "client") applyRemote(data);
  }, e => { UI.busy = false; UI.homeErr = "Não consegui ler a sala (" + (e && e.code || "erro") + ")."; render(); }));
}
function startLocal() {
  const names = [...document.querySelectorAll(".lp-name")].map(i => i.value.trim()).filter(Boolean);
  if (names.length < 1) { UI.homeErr = "Coloque pelo menos um jogador."; return render(); }
  S = newGame("LOCL", MYPID, null, null, "local");
  names.forEach((n, i) => S.managers.push(mkMgr("local" + i, n, (n + " FC").slice(0, 24), i, false)));
  S.settings.total = Math.max(names.length, 4);
  NET.mode = "local"; NET.code = "LOCL";
  startLoop(); commit();
}
let loopT = null, lastAuc = 0, nextTick = 0;
function startLoop() {
  if (loopT) return;
  loopT = setInterval(() => {
    const t = now();
    if (S && isHost() && ["auction", "wc", "lottery", "draft", "staff", "trade", "keep"].includes(S.phase) && t - lastAuc > 450) { lastAuc = t; if (marketTick(S, t)) commit(); }
    if (S && isHost() && S.phase === "season") roundTick(t);
    if (isHost()) Object.values(LIVES).forEach(M => { if (M.status === "playing") liveLoop(M, t); });
    tickClocks();
  }, 100);
}
function leave() {
  NET.unsub.forEach(u => { try { u(); } catch (e) { } }); NET.unsub = [];
  try { NET.rjoin && NET.rjoin.leave && NET.rjoin.leave(); } catch (e) { }
  NET.mode = "none"; S = null; LIVE = null; LIVES = {}; UI.watch = null; try { sessionStorage.removeItem("kl_local2"); } catch (e) { }
  render(); renderLive();
}

/* ---------- campeonato: rodadas simultâneas (anfitrião) ---------- */
const READY_MS = 60000;
function hostAction(a) {
  if (!S || !S.season) return;
  if (["quickround", "simstage"].includes(a.t)) {
    if (S.phase !== "season") return;
    Object.values(LIVES).forEach(M => { let g = 0; while (M.status === "playing" && g++ < 6000) stepMatch(M, now(), true); const f = S.season.fixtures.find(x => x.id === M.fid); if (f && !f.res) finishFixture(f, M); });
    LIVES = {}; syncLive(); writeLive();
    if (a.t === "quickround") { roundFixtures(S).filter(f => !f.res).forEach(f => finishFixture(f, simMatchInstant(S, f))); advanceRound(S); }
    else { const st0 = S.season.stage; let g = 0; while (S.phase === "season" && S.season.stage === st0 && g++ < 60) { roundFixtures(S).filter(f => !f.res).forEach(f => finishFixture(f, simMatchInstant(S, f))); advanceRound(S); } }
    commit(); renderLive(); return;
  }
  if (a.t === "lspeed") { UI.speed = a.v; Object.values(LIVES).forEach(M => M.speed = a.v); writeLive(); renderLive(true); return; }
  if (a.t === "lpause") { const p = !Object.values(LIVES).some(M => M.paused); Object.values(LIVES).forEach(M => M.paused = p); UI.paused = p; writeLive(); renderLive(true); return; }
  if (a.t === "lff" && LIVE && LIVE.status === "playing") {
    const M = LIVES[LIVE.fid]; if (!M) return;
    let g = 0; while (M.status === "playing" && g++ < 5000) stepMatch(M, now(), true);
    onLiveDone(M); return;
  }
}
function roundKey(se) { return se.stage + "-" + se.round; }
function roundTick(t) {
  const se = S.season; if (!se || se.stage === "done") return;
  let ch = false;
  if (!se.rs || se.rs.key !== roundKey(se)) { se.rs = { key: roundKey(se), ready: {}, av: {} }; ch = true; }
  const rs = se.rs, fx = roundFixtures(S);
  const busy = new Set(); Object.values(LIVES).forEach(M => { if (M.status === "playing") M.t.forEach(T => busy.add(T.mi)); });
  fx.forEach(f => {
    if (f.res || LIVES[f.id] || busy.has(f.h) || busy.has(f.a)) return;
    if (!rs.av[f.id]) { rs.av[f.id] = t + READY_MS; ch = true; }
    const rd = mi => S.managers[mi].cpu || rs.ready[f.id + ":" + mi];
    if ((rd(f.h) && rd(f.a)) || t > rs.av[f.id]) { startLive(f, t); busy.add(f.h); busy.add(f.a); ch = true; }
  });
  if (fx.length && fx.every(f => f.res) && !anyLive()) {
    if (!rs.doneAt) { rs.doneAt = t; ch = true; }
    else if (t - rs.doneAt > 9000) { LIVES = {}; syncLive(); writeLive(); renderLive(); advanceRound(S); ch = true; }
  }
  if (ch) commit();
}
function finishFixture(f, M) {
  f.res = matchResult(M);
  const evs = M.ev;
  EVS[f.id] = evs;
  if (NET.mode === "host") NET.db.doc(`mev/${NET.code}-${f.id}`).set({ ev: evs }).catch(() => { });
}
function startLive(f, t) {
  const M = newMatch(S, f); attachRosters(S, M);
  M.speed = UI.speed || 1; M.paused = !!UI.paused; M.holdUntil = (t || now()) + 2500; M._next = 0;
  LIVES[f.id] = M;
  syncLive(); writeLive(); renderLive(); updateRoundBoard();
}
function liveLoop(M, t) {
  if (M.paused) return;
  if (M.pending) { // espera escolhas
    const before = M.seq; stepMatch(M, hostClock(), false);
    if (M.seq !== before || !M.pending) afterStep(M, t);
    return;
  }
  if (t < (M.holdUntil || 0) || t < (M._next || 0)) return;
  const per = { 1: 900, 2: 450, 4: 170 }[M.speed || 1];
  M._next = t + per;
  stepMatch(M, t, false);
  afterStep(M, t);
}
function afterStep(M, t) {
  if (M.hold) { M.holdUntil = t + M.hold * (M.speed === 4 ? 0.5 : M.speed === 2 ? 0.75 : 1); M.hold = 0; }
  if (M.status === "done") return onLiveDone(M);
  writeLive(); if (M === LIVE) renderLive(); updateRoundBoard();
}
function onLiveDone(M) {
  const f = S.season.fixtures.find(x => x.id === M.fid);
  if (f && !f.res) finishFixture(f, M);
  writeLive(); commit(); if (M === LIVE) renderLive(true); updateRoundBoard();
}
function liveAct(a, mi) {
  let M = a.fid != null ? LIVES[a.fid] : null;
  if (!M) M = Object.values(LIVES).find(x => x.status === "playing" && x.t.some(T => T.mi === mi));
  if (M && a.t === "mreact" && REACTS.includes(a.e)) { // reação de qualquer um que esteja assistindo
    const t = now(); M.rlast = M.rlast || {}; if (t - (M.rlast[mi] || 0) < 900) return; M.rlast[mi] = t;
    M.rseq = (M.rseq || 0) + 1; M.reacts = (M.reacts || []).concat({ i: M.rseq, e: a.e, n: S.managers[mi] ? S.managers[mi].name : "", c: S.managers[mi] ? S.managers[mi].color : "#fff" }).slice(-8);
    writeLive(); if (M === LIVE) renderLive(); return;
  }
  if (!M || M.status !== "playing") return;
  let ti;
  if (NET.mode === "local" && a.ti != null) ti = a.ti; else ti = M.t.findIndex(T => T.mi === mi);
  if (ti < 0 || M.t[ti].cpu) return;
  if (matchAction(M, ti, a, hostClock())) { afterStep(M, now()); }
}

const REACTS = ["🔥", "😂", "😱", "👏", "😡", "👑"];
/* ---------- placar da rodada (jogos simultâneos) ---------- */
function fmtClock(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function minLabel(M) { if (M.status === "done") return "FIM"; if (M.phase === "so") return "SO"; const m = Math.floor(M.min); return m >= 36 ? "36'+" : m + "'"; }
function roundBoard() {
  if (!S || !S.season || S.phase !== "season") return "";
  const se = S.season, fx = roundFixtures(S); if (!fx.length) return "";
  const rs = se.rs && se.rs.key === roundKey(se) ? se.rs : { ready: {}, av: {} };
  const mis = editableMis();
  const busy = new Set(); Object.values(LIVES).forEach(M => { if (M.status === "playing") M.t.forEach(T => busy.add(T.mi)); });
  return fx.map(f => {
    const M = LIVES[f.id];
    const side = (mi, sc) => `<div class="rb-t">${crestSVG(S.managers[mi].crest, 22)}<span>${esc(S.managers[mi].team)}</span>${sc != null ? `<b class="num">${sc}</b>` : ""}</div>`;
    let status, extra = "";
    if (M) {
      status = M.status === "done" ? `<span class="pill">FIM${M.so ? ` · SO ${M.so[0]}-${M.so[1]}` : ""}</span>` : `<span class="pill live">● ${minLabel(M)}</span>${M.pending ? ' <span class="pill">pênalti/escolha</span>' : ""}`;
      extra = `<button class="btn sm ${M.status === "playing" ? "gold" : ""}" data-a="watch2" data-fid="${f.id}">${M.status === "playing" ? "Assistir" : "Ver"}</button>`;
      return `<div class="rb-row ${UI.watch === f.id ? "on" : ""}"><div class="rb-teams">${side(f.h, M.score[0])}${side(f.a, M.score[1])}</div><div class="rb-st">${f.stage === "Desafio" ? '<span class="pill">Desafio</span>' : ""}${status}${extra}</div></div>`;
    }
    if (f.res) return `<div class="rb-row"><div class="rb-teams">${side(f.h, f.res.s[0])}${side(f.a, f.res.s[1])}</div><div class="rb-st">${f.stage === "Desafio" ? '<span class="pill">Desafio</span>' : ""}<span class="pill">FIM${f.res.so ? ` · SO ${f.res.so[0]}-${f.res.so[1]}` : ""}</span><button class="btn sm" data-a="watch" data-id="${f.id}">Lances</button></div></div>`;
    const waitOther = busy.has(f.h) || busy.has(f.a);
    const rdy = mi => S.managers[mi].cpu || rs.ready[f.id + ":" + mi];
    const mine = mis.filter(mi => mi === f.h || mi === f.a);
    const btns = waitOther ? "" : mine.map(mi => rdy(mi) ? `<span class="pill you">${mis.length > 1 ? esc(S.managers[mi].team) + " " : ""}pronto ✓</span>` : `<button class="btn sm gold" data-a="ready" data-fid="${f.id}" data-mi="${mi}">${mis.length > 1 ? esc(S.managers[mi].team) + ": " : ""}Pronto!</button>`).join("");
    status = waitOther ? `<span class="muted" style="font-size:12.5px">espera o outro jogo do time acabar</span>`
      : `<span class="muted" style="font-size:12.5px">${[f.h, f.a].map(mi => `${rdy(mi) ? "✓" : "…"} ${esc(S.managers[mi].team.split(" ")[0])}`).join(" · ")}</span>${rs.av[f.id] ? ` <span class="pill num" data-dl="${rs.av[f.id]}">1:00</span>` : ""}`;
    return `<div class="rb-row ${mine.length ? "mine" : ""}"><div class="rb-teams">${side(f.h)}${side(f.a)}</div><div class="rb-st">${f.stage === "Desafio" ? '<span class="pill">Desafio</span>' : ""}${status}${btns}${mine.length && !waitOther ? `<button class="btn sm ghost" data-a="tab" data-tab="time">Táticas</button>` : ""}</div></div>`;
  }).join("");
}
let _rbT = 0;
function updateRoundBoard() {
  const t = Date.now(); if (t - _rbT < 400) { clearTimeout(updateRoundBoard._p); updateRoundBoard._p = setTimeout(updateRoundBoard, 420); return; }
  _rbT = t;
  const el = document.getElementById("roundboard"); if (el && !editing(el)) el.innerHTML = roundBoard();
  const sb = document.getElementById("l-sb"); if (sb) sb.innerHTML = liveStrip();
  const hb = document.getElementById("hdr-live"); if (hb) hb.style.display = anyLive() ? "" : "none";
}
function liveStrip() {
  const ms = Object.values(LIVES); if (ms.length < 2) return "";
  return ms.map(M => `<button class="sbm ${LIVE && LIVE.fid === M.fid ? "on" : ""}" data-a="watch2" data-fid="${M.fid}"><span style="color:${M.t[0].color}">${esc(M.t[0].name.slice(0, 12))}</span> <b class="num">${M.score[0]}-${M.score[1]}</b> <span style="color:${M.t[1].color}">${esc(M.t[1].name.slice(0, 12))}</span> <small class="num">${minLabel(M)}</small></button>`).join("");
}

/* ---------- resposta imediata no aparelho de quem clicou ---------- */
function lotOf() { if (!S) return null; if (S.phase === "staff") return S.staffA && S.staffA.lot; return S.auction && S.auction.lot; }
function lotKey(l) { return l ? l.n + "-" + (l.pid != null ? l.pid : l.sid) : ""; }
function optimistic(kind, mi, amt) {
  const l = lotOf(); if (!l) return;
  if (kind === "pass") { UI.passFx = { key: lotKey(l), at: Date.now(), mi }; clearTimeout(UI._pfx); UI._pfx = setTimeout(() => render(), 1750); }
  if (NET.mode !== "client") return;
  UI.opt = { key: lotKey(l), kind, mi, amt, until: Date.now() + 5000 };
  applyOptimistic(); render(true);
}
function applyOptimistic() {
  if (UI.optReady && S && S.season && S.season.rs) { if (Date.now() < UI.optReady.until) S.season.rs.ready[UI.optReady.k] = true; else UI.optReady = null; }
  const o = UI.opt; if (!o) return;
  if (Date.now() > o.until) { UI.opt = null; return; }
  const l = lotOf(); if (!l || lotKey(l) !== o.key) { UI.opt = null; return; }
  if (o.kind === "bid") { if (l.bid < o.amt) { l.bid = o.amt; l.bidder = o.mi; l.passed = (l.passed || []).filter(x => x !== o.mi); l.optimistic = true; } else UI.opt = null; }
  else { l.passed = l.passed || []; if (!l.passed.includes(o.mi)) { l.passed.push(o.mi); l.optimistic = true; } else UI.opt = null; }
}
function passStamp(lot) { const f = UI.passFx; return f && f.key === lotKey(lot) && Date.now() - f.at < 1700 ? `<div class="stampfx" aria-hidden="true">${NET.mode === "local" ? esc(S.managers[f.mi].team) + "<br>" : ""}PASSOU</div>` : ""; }
function bidPop(lot) { const k = lotKey(lot) + ":" + lot.bid; const pop = UI.lastBk && UI.lastBk !== k && lot.bid > 0; UI.lastBk = k; return pop ? "pop" : ""; }

/* ---------- relógio do leilão ---------- */
function tickClocks() {
  const sc = $("#sclock");
  if (sc && S && S.staffA && S.staffA.lot) { const left = Math.max(0, (S.staffA.lot.deadline - hostClock()) / 1000); sc.textContent = Math.ceil(left); sc.classList.toggle("hot", left <= 4); const sb = $("#sclockbar"); if (sb) sb.style.width = Math.min(100, left / S.settings.timer * 100) + "%"; }
  const dc = $("#dclock");
  if (dc && S && S.draft && S.phase === "draft") { const left = Math.max(0, (S.draft.deadline - hostClock()) / 1000); dc.textContent = Math.ceil(left); dc.classList.toggle("hot", left <= 6); }
  const wcl = $("#wcclock");
  if (wcl && S && S.wc && S.phase === "wc") { const left = Math.max(0, (S.wc.deadline - hostClock()) / 1000); wcl.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`; }
  if (S && S.auction && (S.phase === "auction" || S.phase === "wc")) {
    const a = S.auction, el = $("#clock"), bar = $("#clockbar");
    if (el && a.lot) {
      const left = a.paused ? (a.pausedLeft || 0) / 1000 : Math.max(0, (a.lot.deadline - hostClock()) / 1000);
      el.textContent = Math.ceil(left); el.classList.toggle("hot", left <= 4 && !a.paused);
      if (bar) bar.style.width = Math.min(100, left / S.settings.timer * 100) + "%";
    }
  }
  document.querySelectorAll("[data-dl]").forEach(el => { el.textContent = fmtClock(+el.dataset.dl - hostClock()); });
  const pc = $("#pcount");
  if (pc && LIVE && LIVE.pending) pc.textContent = Math.max(0, Math.ceil((LIVE.pending.until - hostClock()) / 1000)) + "s";
}

/* ---------- componentes ---------- */
function hid() { return !!S && (S.settings.hide === "sempre" || (S.settings.hide === "leilao" && ["auction", "wc", "lottery", "draft"].includes(S.phase))); }
function O(p) { return hid() ? "?" : p.o; }
let CREST_N = 0;
function crestSVG(c, size) {
  c = c || {}; const id = "cr" + (CREST_N++);
  const shapes = {
    escudo: `<path d="M50 4 L94 16 V58 C94 88 72 106 50 116 C28 106 6 88 6 58 V16 Z"/>`,
    redondo: `<circle cx="50" cy="60" r="46"/>`,
    hexagono: `<polygon points="50,6 94,32 94,88 50,114 6,88 6,32"/>`,
    diamante: `<polygon points="50,4 96,60 50,116 4,60"/>`,
    flamula: `<path d="M8 8 H92 V70 L50 116 L8 70 Z"/>`,
    brasao: `<path d="M10 6 H36 L50 14 L64 6 H90 V60 C90 90 70 106 50 116 C30 106 10 90 10 60 Z"/>`,
    oval: `<ellipse cx="50" cy="60" rx="40" ry="54"/>`,
    quadrado: `<rect x="8" y="10" width="84" height="100" rx="14"/>`
  };
  const sh = shapes[c.shape] || shapes.escudo, c1 = c.c1 || "#f5c542", c2 = c.c2 || "#111";
  const pats = {
    liso: "",
    listras: [10, 30, 50, 70, 90].map(x => `<rect x="${x - 5}" y="0" width="10" height="120"/>`).join(""),
    diagonal: `<polygon points="0,30 30,0 100,70 100,100 70,120"/>`,
    metade: `<rect x="50" y="0" width="50" height="120"/>`,
    faixa: `<rect x="0" y="46" width="100" height="26"/>`,
    xadrez: Array.from({ length: 30 }, (_, k) => { const x = k % 5, y = Math.floor(k / 5); return (x + y) % 2 ? `<rect x="${x * 20}" y="${y * 20}" width="20" height="20"/>` : ""; }).join("")
  };
  const icons = {
    coroa: `<path d="M34 64 L36 48 L43 55 L50 44 L57 55 L64 48 L66 64 Z"/><rect x="34" y="65" width="32" height="4" rx="1"/>`,
    raio: `<polygon points="54,40 40,62 50,62 46,80 60,56 50,56"/>`,
    estrela: `<polygon points="50,40 55,54 70,54 58,63 62,77 50,68 38,77 42,63 30,54 45,54"/>`,
    bola: `<circle cx="50" cy="60" r="17" fill="none" stroke-width="3"/><polygon points="50,52 57,57 54,65 46,65 43,57"/>`,
    chama: `<path d="M50 40 C58 50 66 56 62 68 C60 75 54 80 50 80 C44 80 38 74 38 66 C38 58 44 56 46 48 C48 54 50 56 52 56 C54 52 52 46 50 40 Z"/>`,
    olho: `<path d="M30 60 C40 46 60 46 70 60 C60 74 40 74 30 60 Z" fill="none" stroke-width="3"/><circle cx="50" cy="60" r="7"/>`,
    leao: `<circle cx="50" cy="66" r="9"/><circle cx="38" cy="54" r="5"/><circle cx="46" cy="47" r="5"/><circle cx="55" cy="47" r="5"/><circle cx="63" cy="54" r="5"/>`,
    foguete: `<path d="M50 38 C58 46 60 58 58 70 H42 C40 58 42 46 50 38 Z"/><polygon points="42,66 34,76 42,74"/><polygon points="58,66 66,76 58,74"/><circle cx="50" cy="54" r="4" fill="${c1}"/>`,
    trofeu: `<path d="M40 44 H60 V56 C60 64 55 68 50 68 C45 68 40 64 40 56 Z"/><path d="M40 47 H34 C34 55 38 58 41 58" fill="none" stroke-width="3"/><path d="M60 47 H66 C66 55 62 58 59 58" fill="none" stroke-width="3"/><rect x="47" y="67" width="6" height="7"/><rect x="41" y="74" width="18" height="4" rx="1"/>`,
    ancora: `<circle cx="50" cy="44" r="4" fill="none" stroke-width="3"/><rect x="48" y="47" width="4" height="30"/><rect x="40" y="53" width="20" height="3"/><path d="M36 64 C38 76 62 76 64 64" fill="none" stroke-width="4"/>`,
    espadas: `<path d="M38 42 L62 76 M62 42 L38 76" stroke-width="5" fill="none"/><path d="M34 70 L44 80 M66 70 L56 80" stroke-width="4" fill="none"/>`,
    coracao: `<path d="M50 78 C40 70 32 62 32 54 C32 47 37 43 42 43 C46 43 49 46 50 49 C51 46 54 43 58 43 C63 43 68 47 68 54 C68 62 60 70 50 78 Z"/>`,
    nenhum: ""
  };
  const ic = icons[c.icon] != null ? icons[c.icon] : icons.coroa;
  const c3 = c.c3 || c2, tc = c.tc || c2;
  const txt = c.txt ? `<text x="50" y="${c.shape === "diamante" ? 96 : 101}" text-anchor="middle" font-family="Big Shoulders Display, Arial Narrow, sans-serif" font-weight="900" font-size="17" fill="${tc}" stroke="${c1}" stroke-width="3" paint-order="stroke">${esc(c.txt)}</text>` : "";
  const ns = Math.max(0, Math.min(5, c.stars | 0));
  const stars = ns ? Array.from({ length: ns }, (_, k) => { const cx = 50 + (k - (ns - 1) / 2) * 11, cy = c.shape === "diamante" ? 30 : 24; return `<polygon transform="translate(${cx} ${cy}) scale(.22)" points="0,-20 6,-6 21,-6 9,3 13,18 0,9 -13,18 -9,3 -21,-6 -6,-6" fill="${c3}" stroke="${c1}" stroke-width="4"/>`; }).join("") : "";
  return `<svg class="crest" viewBox="0 0 100 120" width="${size}" height="${size * 1.2}" aria-hidden="true"><defs><clipPath id="${id}">${sh}</clipPath></defs>
    <g clip-path="url(#${id})"><rect width="100" height="120" fill="${c1}"/><g fill="${c2}">${pats[c.pat] || ""}</g></g>
    <g fill="none" stroke="${c3}" stroke-width="6">${sh}</g>
    ${ic ? `<circle cx="50" cy="60" r="22" fill="${c1}" stroke="${c3}" stroke-width="3"/><g fill="${c2}" stroke="${c2}">${ic}</g>` : ""}${stars}${txt}</svg>`;
}
function kitSVG(k, size, num) {
  k = k || {}; const id = "kt" + (CREST_N++); const c1 = k.c1 || "#f5c542", c2 = k.c2 || "#111";
  const body = `<path d="M30 8 L42 4 C45 10 55 10 58 4 L70 8 L92 24 L82 40 L72 34 V92 H28 V34 L18 40 L8 24 Z"/>`;
  const pats = {
    liso: "", listras: [34, 46, 58, 70].map(x => `<rect x="${x - 4}" y="0" width="8" height="100"/>`).join(""),
    horizontais: [24, 44, 64, 84].map(y => `<rect x="0" y="${y - 5}" width="100" height="10"/>`).join(""),
    faixa: `<polygon points="20,10 36,10 84,92 68,92"/>`, metade: `<rect x="50" y="0" width="50" height="100"/>`,
    xadrez: Array.from({ length: 50 }, (_, q) => { const x = q % 10, y = Math.floor(q / 10); return (x + y) % 2 ? `<rect x="${x * 10}" y="${y * 20}" width="10" height="20"/>` : ""; }).join(""),
    gola: `<path d="M40 4 C45 14 55 14 60 4 L58 12 C54 18 46 18 42 12 Z"/><rect x="0" y="86" width="100" height="6"/><rect x="8" y="22" width="12" height="4" transform="rotate(30 14 24)"/><rect x="80" y="22" width="12" height="4" transform="rotate(-30 86 24)"/>`,
    centro: `<rect x="42" y="0" width="16" height="100"/>`,
    ombros: `<rect x="0" y="0" width="100" height="22"/>`,
    v: `<polygon points="20,20 50,52 80,20 80,32 50,64 20,32"/>`,
    finas: [30, 38, 46, 54, 62, 70].map(x => `<rect x="${x - 1.2}" y="0" width="2.4" height="100"/>`).join("")
  };
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><defs><clipPath id="${id}">${body}</clipPath></defs>
    <g clip-path="url(#${id})"><rect width="100" height="100" fill="${c1}"/><g fill="${c2}">${pats[k.pat] || ""}</g></g>
    <g fill="none" stroke="rgba(0,0,0,.55)" stroke-width="2.5">${body}</g>
    <text x="50" y="68" text-anchor="middle" font-family="Big Shoulders Display, Arial Narrow, sans-serif" font-weight="900" font-size="30" fill="${k.num || "#fff"}" stroke="rgba(0,0,0,.45)" stroke-width="2" paint-order="stroke">${num || 10}</text></svg>`;
}
function pcard(p) {
  const owner = S ? ownerOf(S, p.id) : -1;
  return `<div class="pcard ${p.p === "GOL" ? "gk" : ""}">
    <div class="crown">${CROWN}</div>
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="ovr">${O(p)}</div><div class="pos">${p.p}</div></div>
    <div class="num muted" style="text-align:right;font-size:13px">VALOR REF.<br><b style="font-size:24px;color:var(--ink)">${hid() ? "?" : p.v}</b></div></div>
    <div class="nm">${esc(p.n)}</div>
    <div class="club">${esc(p.t)}${owner >= 0 ? ` · <b style="color:${S.managers[owner].color}">${esc(S.managers[owner].team)}</b>` : ""}</div>
    ${p.tags.length ? `<div class="tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    <div class="st"><div><b>${p.pm}</b>jogos</div><div><b>${hid() ? "?" : p.at}</b>ATQ</div><div><b>${hid() ? "?" : p.df}</b>DEF</div><div><b>${hid() ? "?" : (p.pot || p.o)}</b>POT</div></div>
    ${hid() ? `<div class="muted" style="font-size:11px">Modo overall escondido: use as conquistas e o clube como pista.</div>` : ""}
  </div>`;
}
function posb(p, p2) { return `<span class="posb ${p}">${p}${p2 ? `<small>/${p2}</small>` : ""}</span>`; }
function mgrName(i) { const m = S.managers[i]; return `<span class="mcrest">${crestSVG(m.crest, 16)}</span> ${esc(m.team)}`; }
function connStatus() {
  const w = NET.writeOk === true ? "envio por banco OK" : NET.writeOk === false ? `envio por banco bloqueado (${NET.writeErr})` : "envio por banco testando";
  const r = NET.rjoin || NET.lobby ? "canal ao vivo OK" : "canal ao vivo indisponível";
  const s = NET.lastSync ? `última sincronização há ${Math.round((Date.now() - NET.lastSync) / 1000)}s` : "sem sincronizar";
  return `${w} · ${r} · ${s}${NET.pollErr ? " · leitura: " + NET.pollErr : ""}`;
}
function header() {
  const me = S ? S.managers[myMi()] : null;
  return `<div class="top"><div class="wrap">
    <div class="brand">${CROWN}<div>Kings Leilão<small>KINGS LEAGUE BRASIL · FUT 7</small></div></div>
    <div class="spacer"></div>
    ${S && NET.mode !== "local" ? `<span class="chip">Sala <b>${esc(S.code)}</b></span>` : ""}
    ${S && NET.mode === "local" ? `<span class="chip">Um aparelho só</span>` : ""}
    ${me ? `<span class="chip"><span class="dot" style="--c:${me.color}"></span>${esc(me.team)}</span>` : ""}
    ${NET.mode === "host" ? `<span class="chip">Anfitrião</span>` : ""}
    ${S && S.phase === "season" ? `<button class="btn sm gold" id="hdr-live" data-a="showlive" style="${anyLive() ? "" : "display:none"}">Ao vivo</button>` : ""}
    ${S ? `<button class="btn sm ghost" data-a="leave">Sair</button>` : ""}
  </div></div>`;
}
const RULES = [
  ["Escalonado", "Começa 1x1 e entra um por minuto, na ordem que você escolher, até o 7x7 no 5'.", "#4cc9f0"],
  ["Cartas secretas", "Uma por time, por jogo, do baralho oficial de 10. Liberadas do 5' ao 17' e do 23' ao 36'.", "#b392f0"],
  ["Pênalti presidente", "Você cobra e escolhe o canto; sempre vale 1 gol. Mesmas janelas das cartas.", "#f5c542"],
  ["Gol dobro", "Do 17' ao 20' todo gol vale 2.", "#ff8c42"],
  ["Dado", "Do 20' ao 23': 3x3, 2x2 ou 1x1 com goleiro. Cartões ficam pausados.", "#2fd47e"],
  ["Match ball", "Após o 36', quem chegar ao placar do líder +1 vence: 5x5, 4x4, 3x3, 1x1 e 2x2. Empate: shootouts (5 + alternadas).", "#ff4d61"]
];
function viewHome() {
  const nm = esc(store("kl_name") || ""), tm = esc(store("kl_team") || "");
  return `<div class="hero">
    <h1>Monte seu time.<br><em>Leilão</em> da Kings League.</h1>
    <p>Jogadores da Kings League Brasil sorteados um a um no leilão, com overall calculado pelo Split 1, Split 2, Kings Cup, Nations e Mundial. Depois, cada jogo é disputado ao vivo no campo: você escolhe formação, estilo, ordem do escalonado e a hora de usar a carta secreta e o pênalti do presidente.</p>
  </div>
  <div class="rules">${RULES.map(r => `<div style="--c:${r[2]}"><b>${r[0]}</b>${r[1]}</div>`).join("")}</div>
  <div class="grid3">
    <div class="card" style="display:grid;gap:10px;align-content:start">
      <h2 style="font-size:24px">Criar sala</h2>
      <p class="muted" style="margin:0;font-size:14px">Você vira o anfitrião. Seus amigos entram com o código, cada um no próprio celular.</p>
      <label class="f" for="h-name">Seu nome (presidente)<input id="h-name" type="text" maxlength="18" value="${nm}"></label>
      <label class="f" for="h-team">Nome do seu time<input id="h-team" type="text" maxlength="24" value="${tm}"></label>
      <button class="btn gold" data-a="create" ${UI.busy ? "disabled" : ""}>Criar sala</button>
    </div>
    <div class="card" style="display:grid;gap:10px;align-content:start">
      <h2 style="font-size:24px">Entrar numa sala</h2>
      <p class="muted" style="margin:0;font-size:14px">Peça o código para quem criou a sala.</p>
      <label class="f" for="j-code">Código da sala<input id="j-code" type="text" maxlength="4" style="text-transform:uppercase;font-family:var(--display);font-size:22px;letter-spacing:.2em" value="${esc(inviteCode() || store("kl_last") || "")}"></label>
      <label class="f" for="j-name">Seu nome<input id="j-name" type="text" maxlength="18" value="${nm}"></label>
      <label class="f" for="j-team">Nome do seu time<input id="j-team" type="text" maxlength="24" value="${tm}"></label>
      <button class="btn gold" data-a="join" ${UI.busy ? "disabled" : ""}>Entrar</button>
    </div>
    <div class="card" style="display:grid;gap:10px;align-content:start">
      <h2 style="font-size:24px">Um aparelho só</h2>
      <p class="muted" style="margin:0;font-size:14px">Todo mundo no mesmo computador ou TV. Bom para testar sozinho também.</p>
      <div id="lp" style="display:grid;gap:6px">${[0, 1, 2].map(i => `<input class="lp-name" id="lp${i}" type="text" maxlength="18" placeholder="Jogador ${i + 1}" value="${i === 0 ? nm : ""}">`).join("")}</div>
      <div class="row"><button class="btn sm" data-a="lpadd">+ jogador</button></div>
      <button class="btn" data-a="local">Jogar aqui</button>
    </div>
  </div>
  <p class="err" role="status">${esc(UI.homeErr)}</p>
  ${howOvr()}`;
}
function howOvr() {
  return `<details class="card" style="margin-top:14px"><summary>Como o overall foi calculado</summary><div class="howto" style="margin-top:10px">
  <p>Base: estatísticas oficiais da Kings League Brasil 2025/26 (Split 2) no kingsleague.pro: jogos, finalizações no alvo, assistências, dribles e, para goleiros, defesas e gols sofridos. Tudo por jogo, com peso menor para quem jogou pouco.</p>
  <p>Bônus pelo Split 1 2025 (artilharia, assistências, MVPs), títulos e campanhas na Kings Cup 2025, Kings World Cup Nations 2025/2026 e Mundial de Clubes 2025/2026. Defensores ganham pontos pela defesa do time e pela regularidade.</p>
  <p>Resultado espalhado de 62 a 96 (linha) e 64 a 90 (goleiros). Fora do Split 2, os gols dos 3 artilheiros são oficiais; os demais são estimados pelas finalizações no alvo.</p></div></details>`;
}
function poolTable(list) {
  return `<table class="tbl"><thead><tr><th>OVR</th><th>Pos</th><th>Jogador</th><th>Clube 25/26</th><th>ATQ</th><th>DEF</th><th>Valor</th><th>Dono</th></tr></thead><tbody>
  ${list.map(p => { const ow = S ? ownerOf(S, p.id) : -1; return `<tr class="${ow >= 0 ? "gone" : ""}"><td class="o ${p.p === "GOL" ? "g" : ""}">${p.o}</td><td>${posb(p.p, p.p2)}</td>
      <td><b>${esc(p.n)}</b>${p.tags.length ? `<div class="muted" style="font-size:11.5px">${esc(p.tags.slice(0, 3).join(" · "))}</div>` : ""}</td>
      <td class="muted">${esc(p.t)}</td><td class="num">${p.at}</td><td class="num">${p.df}</td><td class="num">${p.v}</td><td>${ow >= 0 ? mgrName(ow) : ""}</td></tr>`; }).join("")}</tbody></table>`;
}

function viewLobby() {
  const host = isHost(), mi = myMi(), st = S.settings;
  const total = Math.max(2, st.total), cpus = Math.max(0, total - S.managers.length);
  const pool = Math.min(PLAYERS.length, Math.ceil(st.squad * 1.5) * Math.max(total, S.managers.length));
  const crestBox = crestEditor();
  return `<div class="sec-title"><h2>Vestiário</h2><span class="muted">${NET.mode === "local" ? "todos no mesmo aparelho" : "esperando a galera entrar"}</span></div>
  <div class="grid2">
    <div class="card" style="display:grid;gap:12px;align-content:start">
      ${NET.mode !== "local" ? `<div><div class="muted" style="font-size:13px">CÓDIGO DA SALA</div><div class="num" style="font-size:72px;font-weight:900;color:var(--gold);letter-spacing:.12em;line-height:1">${esc(S.code)}</div>
      ${window.KL_SITE ? `<div class="row" style="margin-top:6px"><button class="btn sm gold" data-a="copyinvite">Copiar link de convite</button></div><p class="muted" style="margin:6px 0 0;font-size:14px">Mande o link pros seus amigos: o código ${esc(S.code)} já vem preenchido, é só pôr o nome e entrar.</p>` : `<p class="muted" style="margin:6px 0 0;font-size:14px">Compartilhe esta página com seus amigos pelo botão Compartilhar do Claude e mande o código. Cada um abre o link, toca em "Entrar numa sala" e digita ${esc(S.code)}.</p>`}</div>` : ""}
      <div style="display:grid;gap:8px">
        ${S.managers.map((m, i) => `<div class="row" style="justify-content:space-between;border:1px solid var(--line);border-left:4px solid ${m.color};border-radius:10px;padding:8px 10px">
          <div class="row" style="gap:8px">${crestSVG(m.crest, 26)}<b>${esc(m.team)}</b> <span class="muted">· ${esc(m.name)}</span> ${m.pid === MYPID ? '<span class="pill you">você</span>' : ""}</div>
          ${host && m.pid !== MYPID && NET.mode !== "local" ? `<button class="btn sm ghost" data-a="kick" data-mi="${i}">Remover</button>` : ""}</div>`).join("")}
        ${NET.mode === "host" ? `<div class="muted" style="font-size:12px">Conexão: ${NET.rjoin || NET.lobby ? "canal ao vivo OK" : "canal ao vivo indisponível"} · pedidos recebidos: ${Object.keys(S.seqs || {}).length}</div>` : ""}
        ${cpus ? `<div class="muted" style="font-size:14px">+ ${cpus} time${cpus > 1 ? "s" : ""} do computador (bots) para completar ${total} times.</div>` : ""}
      </div>
      ${mi >= 0 ? `<div class="row" style="align-items:flex-end">
        <label class="f" for="me-team" style="flex:1">Nome do seu time<input id="me-team" type="text" maxlength="24" value="${esc(S.managers[mi].team)}"></label>
        <button class="btn sm" data-a="editme">Salvar</button></div>` : NET.mode === "client" ? `<div class="flash" style="border-color:var(--gold);background:rgba(245,197,66,.06)"><b>Pedindo para entrar…</b><div class="muted" style="font-size:13px;margin-top:4px">O pedido é reenviado sozinho a cada 4 segundos. A página do anfitrião precisa estar aberta.</div><div class="muted num" style="font-size:12px;margin-top:6px">${connStatus()}</div><button class="btn sm" style="margin-top:8px" data-a="rejoin">Tentar de novo</button></div>` : ""}
    </div>
    <div class="card" style="display:grid;gap:12px;align-content:start">
      <h3 style="font-size:22px">Modo de jogo</h3>
      <div class="modes">
        <button class="mode ${st.mode !== "draft" ? "on" : ""}" data-a="setmode" data-v="leilao" ${host ? "" : "disabled"}><b>Leilão</b><span>Jogadores sorteados um a um. Quem der mais leva.</span></button>
        <button class="mode ${st.mode === "draft" ? "on" : ""}" data-a="setmode" data-v="draft" ${host ? "" : "disabled"}><b>Draft Kings League</b><span>Wild cards com propostas secretas, sorteio da ordem e draft em cobra.</span></button>
      </div>
      <div class="grid2" style="gap:10px">
        <label class="f" for="s-fmt">Formato do campeonato<select id="s-fmt" ${host && !st.year ? "" : "disabled"}><option value="split" ${st.fmt !== "cup" ? "selected" : ""}>Split: grupo único, top 7 no mata-mata</option><option value="cup" ${st.fmt === "cup" ? "selected" : ""}>Kings Cup: 2 grupos + jogo desafio</option></select></label>
        <label class="f" for="s-career">Modo carreira<select id="s-career" ${host ? "" : "disabled"}><option value="0" ${!st.career ? "selected" : ""}>Não</option><option value="1" ${st.career ? "selected" : ""}>Sim: várias temporadas com o mesmo time</option></select></label>
        <label class="f" for="s-year">Temporada completa<select id="s-year" ${host ? "" : "disabled"}><option value="0" ${!st.year ? "selected" : ""}>Não, só um campeonato</option><option value="1" ${st.year ? "selected" : ""}>Sim: Split e depois Kings Cup</option></select></label>
        <label class="f" for="s-staff">Mercado de staff<select id="s-staff" ${host ? "" : "disabled"}>${[["nenhum", "Sem técnicos e presidentes"], ["tecnicos", "Só técnicos"], ["presidentes", "Só presidentes"], ["ambos", "Técnicos e presidentes"]].map(([k, v]) => `<option value="${k}" ${st.staff === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="f" for="s-trades">Mercado de trocas<select id="s-trades" ${host ? "" : "disabled"}>${[["nenhum", "Sem trocas"], ["antes", "Antes do campeonato"], ["mata", "Antes do mata-mata"], ["ambos", "Antes do campeonato e do mata-mata"]].map(([k, v]) => `<option value="${k}" ${st.trades === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      </div>
      <p class="muted" style="font-size:13px;margin:0">${st.year ? "Temporada completa: Split com o modo escolhido abaixo. Depois cada time mantém até 6 wild cards e até 3 jogadores, o resto volta para um draft, e começa a Kings Cup. Como a Cup tem dois grupos iguais, a temporada usa número par de times (mínimo 8): bots completam o que faltar." : st.fmt === "cup" ? "Kings Cup: dois grupos iguais. Todo time joga em toda rodada: contra o próprio grupo ou, uma única vez, o jogo desafio contra alguém do outro grupo. O desafio não vale ponto na tabela, só ponto para o grupo e uma carta secreta extra no mata-mata para quem vencer. O grupo com mais vitórias nos desafios leva 4 vagas e o 1º dele vai direto à semi; o outro grupo leva 3 vagas e o 1º joga as quartas. Precisa de número par de times (mínimo 8): bots completam o que faltar." : "Split: todos contra todos uma vez. O 1º vai direto para a semifinal e do 2º ao 7º jogam as quartas."}${st.staff !== "nenhum" ? " Antes dos jogadores tem o leilão de staff: técnicos dão bônus se o time usar a formação e o estilo favoritos deles, e o presidente é quem cobra o pênalti presidente." : ""}</p>
      <div class="grid2" style="gap:10px">
        ${stepper("budget", st.mode === "draft" ? "Moedas para wild cards (K$)" : "Orçamento por time (K$)", st.budget, 30, 600, 10, host)}
        ${st.mode === "draft" ? `${stepper("wc", "Wild cards por time (máx. 6)", st.wc, 0, 6, 1, host)}
        <div class="f"><span>Escolhas no draft</span><div class="stepper"><b class="num">${st.picks}</b><span class="muted" style="font-size:12px">sempre completa 12</span></div></div>
        ${stepper("dtimer", "Segundos por escolha", st.dtimer, 10, 90, 5, host)}` : stepper("squad", "Jogadores por elenco (com reservas)", st.squad, 7, 12, 1, host)}
        ${stepper("timer", "Segundos por lance", st.timer, 5, 30, 1, host)}
        ${stepper("total", "Times no campeonato", st.total, 2, 12, 1, host)}
        ${st.trades !== "nenhum" ? stepper("tmin", "Tempo do mercado de trocas (min)", st.tmin || 1, 1, 5, 1, host) : ""}
      </div>
      <label class="f" for="s-hide">Overall dos jogadores<select id="s-hide" ${host ? "" : "disabled"}>${[["nao", "Visível"], ["leilao", "Escondido no leilão (revela no campeonato)"], ["sempre", "Escondido o jogo todo"]].map(([k, v]) => `<option value="${k}" ${st.hide === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${st.mode === "draft" ? `<p class="muted" style="font-size:13.5px;margin:0">Elenco de <b style="color:var(--ink)">${st.wc + st.picks}</b> jogadores: <b style="color:var(--ink)">${st.wc}</b> wild cards + <b style="color:var(--ink)">${st.picks}</b> do draft. 1) Cada um manda propostas secretas pelos wild cards que quer. Se só você pediu, leva pelo valor da proposta. Se dois ou mais pediram o mesmo, vira leilão entre eles. 2) Sorteio da ordem. 3) Draft em cobra (1→${Math.max(2, st.total)}, depois ${Math.max(2, st.total)}→1) com todos os jogadores que sobraram. Wild card que não fechar vira escolha extra no draft.</p>` : `<p class="muted" style="font-size:13.5px;margin:0">Vão a leilão <b class="num" style="color:var(--ink)">${pool}</b> jogadores sorteados (1,5 por vaga de cada time), aparecendo um de cada vez em ordem aleatória. Quem não quiser toca em <b>Passar</b>. Se ninguém quiser, o jogador vai para a repescagem no fim. Cada elenco precisa de pelo menos 1 goleiro.</p>`}
      ${host ? `<div class="row"><span class="spacer"></span><button class="btn gold big" data-a="start">${st.mode === "draft" ? "Começar wild cards" : "Começar leilão"}</button></div>` : `<p class="muted" style="margin:0">Só o anfitrião muda as regras e começa o leilão.</p>`}
    </div>
  </div>
  ${hallView()}
  ${crestBox}`;
}

function crestEditor() {
  const mis = editableMis(); if (!mis.length) return "";
  if (UI.crestMi == null || !mis.includes(UI.crestMi)) UI.crestMi = mis[0];
  const mi = UI.crestMi, m = S.managers[mi], c = m.crest || {};
  const sel = (id, list, val, labels) => `<select id="${id}" data-mi="${mi}">${list.map((k, i) => `<option value="${k}" ${k === val ? "selected" : ""}>${labels ? labels[i] : k}</option>`).join("")}</select>`;
  return `<div class="sec-title"><h2>Escudo</h2><span class="muted">escolha um pronto ou monte o seu</span></div>
  <div class="card crested">
    ${mis.length > 1 ? `<div class="row" style="margin-bottom:10px"><span class="muted">Editando:</span>${mis.map(i => `<button class="btn sm ${i === mi ? "gold" : ""}" data-a="crestmi" data-mi="${i}">${esc(S.managers[i].team)}</button>`).join("")}</div>` : ""}
    <div class="crestgrid">
      <div class="crestprev">${crestSVG(c, 130)}<b>${esc(m.team)}</b></div>
      <div style="display:grid;gap:10px">
        <div class="presets">${CREST_PRESETS.map((p, k) => `<button class="preset" data-a="crestpre" data-k="${k}" data-mi="${mi}" title="${esc(p.n)}">${crestSVG(Object.assign({}, p, { txt: c.txt }), 40)}<span>${esc(p.n)}</span></button>`).join("")}</div>
        <div class="grid3" style="gap:8px">
          <label class="f" for="c-shape">Formato${sel("c-shape", CREST_SHAPES, c.shape, ["Escudo", "Redondo", "Hexágono", "Diamante", "Flâmula", "Brasão", "Oval", "Quadrado"])}</label>
          <label class="f" for="c-pat">Desenho${sel("c-pat", CREST_PATS, c.pat, ["Liso", "Listras", "Diagonal", "Metade", "Faixa", "Xadrez"])}</label>
          <label class="f" for="c-icon">Símbolo${sel("c-icon", CREST_ICONS, c.icon, ["Coroa", "Raio", "Estrela", "Bola", "Chama", "Olho", "Garra", "Foguete", "Troféu", "Âncora", "Espadas", "Coração", "Nenhum"])}</label>
          <label class="f" for="c-c1">Cor principal<input id="c-c1" type="color" data-mi="${mi}" value="${c.c1 || "#f5c542"}"></label>
          <label class="f" for="c-c2">Cor secundária<input id="c-c2" type="color" data-mi="${mi}" value="${c.c2 || "#111111"}"></label>
          <label class="f" for="c-txt">Sigla (até 3)<input id="c-txt" type="text" maxlength="3" data-mi="${mi}" value="${esc(c.txt || "")}" style="text-transform:uppercase"></label>
          <label class="f" for="c-c3">Cor da borda<input id="c-c3" type="color" data-mi="${mi}" value="${c.c3 || c.c2 || "#ffffff"}"></label>
          <label class="f" for="c-tc">Cor da sigla<input id="c-tc" type="color" data-mi="${mi}" value="${c.tc || c.c2 || "#111111"}"></label>
          <label class="f" for="c-stars">Estrelas (títulos)<select id="c-stars" data-mi="${mi}">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${(c.stars | 0) === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        </div>
      </div>
    </div>
    <p class="muted" style="font-size:12.5px;margin:8px 0 0">Os escudos oficiais dos times da Kings League são marcas registradas, então os prontos aqui são originais. Dá pra recriar as cores do seu time do coração no editor.</p>
  </div>
  <div class="sec-title"><h2>Uniformes</h2><span class="muted">principal no campo e na torcida; o reserva entra quando as cores batem com o do rival</span></div>
  ${kitEditor(mi, m)}`;
}
const KIT_NAMES = ["Lisa", "Listras verticais", "Listras horizontais", "Faixa diagonal", "Metade", "Xadrez", "Gola e punhos", "Faixa central", "Ombros", "V no peito", "Listras finas"];
function kitEditor(mi, m) {
  const which = UI.kitTab === 2 ? 2 : 1, key = which === 2 ? "kit2" : "kit";
  const k = m[key] || (which === 2 ? awayKit(m.kit) : {}) || {};
  return `<div class="card crested"><div class="row" style="margin-bottom:10px;gap:6px"><button class="btn sm ${which === 1 ? "gold" : ""}" data-a="kittab" data-v="1">Principal</button><button class="btn sm ${which === 2 ? "gold" : ""}" data-a="kittab" data-v="2">Reserva</button></div>
  <div class="crestgrid">
    <div class="crestprev"><div class="row" style="gap:6px;justify-content:center">${kitSVG(m.kit, which === 1 ? 120 : 70, 10)}${kitSVG(m.kit2 || awayKit(m.kit), which === 2 ? 120 : 70, 10)}</div><b>${esc(m.team)}</b><span class="muted" style="font-size:12px">${which === 1 ? "Principal (casa)" : "Reserva (fora, se as cores baterem)"}</span></div>
    <div class="grid3" style="gap:8px;align-content:start">
      <label class="f" for="k-c1">Cor da camisa<input id="k-c1" type="color" data-mi="${mi}" value="${k.c1 || "#f5c542"}"></label>
      <label class="f" for="k-c2">Cor do detalhe<input id="k-c2" type="color" data-mi="${mi}" value="${k.c2 || "#111111"}"></label>
      <label class="f" for="k-num">Cor do número<input id="k-num" type="color" data-mi="${mi}" value="${k.num || "#ffffff"}"></label>
      <label class="f" for="k-pat">Modelo<select id="k-pat" data-mi="${mi}">${KIT_PATS.map((p, i) => `<option value="${p}" ${k.pat === p ? "selected" : ""}>${KIT_NAMES[i] || p}</option>`).join("")}</select></label>
      <div class="row" style="gap:6px;align-items:flex-end;grid-column:span 2"><button class="btn sm" data-a="kitfromcrest" data-mi="${mi}">Usar cores do escudo</button>${which === 2 ? `<button class="btn sm ghost" data-a="kitinvert" data-mi="${mi}">Inverter o principal</button>` : ""}</div>
    </div></div></div>`;
}
function setKit(mi, patch) { const m = S.managers[mi], key = UI.kitTab === 2 ? "kit2" : "kit"; const k = Object.assign({}, m[key] || (key === "kit2" ? awayKit(m.kit) : {}), patch); if (NET.mode === "client") { m[key] = k; setLocal(mi, key, k); render(true); } act({ t: "editme", [key]: k, mi }); }
function setCrest(mi, patch) { const m = S.managers[mi]; const c = Object.assign({}, m.crest || {}, patch); if (NET.mode === "client") { m.crest = c; setLocal(mi, "crest", c); render(true); } act({ t: "editme", crest: c, mi }); }
function viewAuction() {
  const a = S.auction, mi = myMi();
  const lot = a.lot, pl = lot ? P(lot.pid) : null;
  const host = isHost();
  let stage;
  if (lot) {
    let bidders = NET.mode === "local" ? humansIdx() : (mi >= 0 ? [mi] : []);
    if (lot.only) bidders = bidders.filter(i => lot.only.includes(i));
    stage = `<div class="stage">${passStamp(lot)}${pcard(pl)}
      <div class="bidbox">
        <div class="row" style="justify-content:space-between"><span class="phase">${a.wc ? `Disputa ${lot.n} de ${a.total}` : `${a.repesc ? "Repescagem · " : ""}Lote ${lot.n} de ${a.total}`}</span>${a.paused ? '<span class="phase mb">Pausado</span>' : ""}</div>
        <div class="bidnow"><div class="amt num ${bidPop(lot)}">${lot.bid || "–"}</div><div class="who"><div class="muted" style="font-size:12px">${lot.bidder >= 0 ? "LANCE ATUAL" : "SEM LANCES · comece com 1"}</div>${lot.bidder >= 0 ? mgrName(lot.bidder) : ""}${lot.bidder === mi && mi >= 0 ? ' <span class="pill you">você lidera</span>' : ""}</div><div class="spacer"></div><div class="clock num" id="clock">–</div></div>
        <div class="bar"><i id="clockbar" style="width:100%"></i></div>
        ${lot.passed.length ? `<div class="muted" style="font-size:13px">Passaram: ${lot.passed.map(i => esc(S.managers[i].team)).join(", ")}</div>` : ""}
        ${bidders.map(bi => bidControls(bi, lot, pl)).join("")}
        ${mi < 0 && NET.mode === "client" ? `<p class="muted">Você está assistindo.</p>` : ""}
      </div></div>`;
  } else {
    const ls = a.lastSale;
    stage = `<div style="display:grid;place-items:center;min-height:240px;gap:10px;text-align:center">
      ${ls ? (ls.mi >= 0 ? `<div class="sold-anim"><div class="muted">VENDIDO</div><h2 style="font-size:44px">${esc(P(ls.pid).n)}</h2><div>${mgrName(ls.mi)} · <b class="num" style="font-size:24px;color:var(--gold)">${ls.price} K$</b></div></div>` : `<div class="sold-anim"><div class="muted">SEM INTERESSADOS</div><h2 style="font-size:36px">${esc(P(ls.pid).n)}</h2></div>`) : `<h2 style="font-size:36px">Sorteando o primeiro jogador…</h2>`}
      <div class="muted">Próximo jogador saindo do pote…</div></div>`;
  }
  const sq = S.settings.squad;
  if (a.wc) return `<div class="sec-title"><h2>Disputa de wild card</h2><span class="muted">${lot ? `só ${lot.only.map(i => esc(S.managers[i].team)).join(" e ")} podem dar lance` : "preparando a próxima disputa"}</span></div><div class="card">${stage}</div>
    <div class="sec-title"><h2>Presidentes</h2></div><div class="mgrs">${S.managers.map((m, i) => mgrBox(m, i)).join("")}</div>
    <div class="sec-title"><h2>Últimos lances</h2></div><div class="card log">${S.log.slice(0, 12).map(l => `<div>${esc(l)}</div>`).join("")}</div>`;
  return `<div class="sec-title"><h2>Leilão</h2><span class="muted">${a.sold.length} vendidos · ${S.managers.reduce((s, m) => s + Math.max(0, sq - m.roster.length), 0)} vagas abertas</span></div>
  <div class="card">${stage}</div>
  ${host ? `<div class="row" style="margin-top:10px"><span class="muted" style="font-size:13px">Anfitrião:</span>
    <button class="btn sm" data-a="pause">${a.paused ? "Retomar leilão" : "Pausar leilão"}</button>
    <button class="btn sm" data-a="autofill">Completar elencos automaticamente</button></div>` : ""}
  <div class="sec-title"><h2>Presidentes</h2></div>
  <div class="mgrs">${S.managers.map((m, i) => mgrBox(m, i)).join("")}</div>
  <div class="sec-title"><h2>Últimos lances</h2></div><div class="card log">${S.log.slice(0, 12).map(l => `<div>${esc(l)}</div>`).join("")}</div>`;
}
/* ---------- mercado de staff ---------- */
function staffCard(x) {
  return `<div class="pcard" style="background:linear-gradient(160deg,#16243a,#0b1220);border-color:#2c4a73"><div class="crown">${CROWN}</div>
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="pos" style="font-size:16px;color:var(--blue)">${x.k === "tec" ? "TÉCNICO" : "PRESIDENTE"}</div></div><div class="num muted" style="text-align:right;font-size:13px">VALOR REF.<br><b style="font-size:24px;color:var(--ink)">${x.v}</b></div></div>
    <div class="nm">${esc(x.n)}</div><div class="club">${esc(x.club)}</div>
    <div class="st">${x.k === "tec" ? `<div><b>${x.form}</b>formação</div><div><b style="font-size:14px">${STYLES[x.style].n}</b>estilo</div><div><b>+${x.r}</b>nível</div>` : `<div><b>${x.pen}</b>pênalti</div><div></div><div></div>`}</div></div>`;
}
function viewStaff() {
  const a = S.staffA, lot = a.lot, mi = myMi();
  let stage;
  if (lot) {
    const x = STAFF_BY_ID[lot.sid];
    const bidders = (NET.mode === "local" ? humansIdx() : mi >= 0 ? [mi] : []).filter(i => staffNeed(S, S.managers[i], x));
    stage = `<div class="stage">${passStamp(lot)}${staffCard(x)}<div class="bidbox">
      <div class="row" style="justify-content:space-between"><span class="phase">Staff ${lot.n} de ${a.total}</span></div>
      <div class="bidnow"><div class="amt num ${bidPop(lot)}">${lot.bid || "–"}</div><div class="who"><div class="muted" style="font-size:12px">${lot.bidder >= 0 ? "LANCE ATUAL" : "SEM LANCES · comece com 1"}</div>${lot.bidder >= 0 ? mgrName(lot.bidder) : ""}</div><div class="spacer"></div><div class="clock num" id="sclock">–</div></div>
      <div class="bar"><i id="sclockbar" style="width:100%"></i></div>
      <p class="muted" style="margin:0;font-size:13px">${x.k === "tec" ? `Bônus quando o time joga no ${x.form} e/ou no estilo ${STYLES[x.style].n}.` : `Ele cobra o pênalti presidente do seu time. Quanto maior a nota, mais chance de gol.`}</p>
      ${bidders.map(bi => { const m = S.managers[bi], mx = staffMax(S, m), lead = lot.bidder === bi, ps = lot.passed.includes(bi); return `<div style="display:grid;gap:6px;border-top:1px solid var(--line);padding-top:10px"><div>${mgrName(bi)} <span class="muted">· saldo ${m.budget} · máx ${mx}</span></div>
        <div class="bidbtns">${[1, 2, 5].filter(s => lot.bid + s <= mx).map(s => `<button class="btn ${s === 1 ? "gold" : ""}" data-a="bid" data-mi="${bi}" data-amt="${lot.bid + s}" ${lead ? "disabled" : ""}>+${s} <span class="num">(${lot.bid + s})</span></button>`).join("")}<button class="btn ghost" data-a="pass" data-mi="${bi}" ${lead || ps ? "disabled" : ""}>Passar</button></div></div>`; }).join("")}
    </div></div>`;
  } else stage = `<div style="display:grid;place-items:center;min-height:200px;text-align:center">${a.last && a.last.mi >= 0 ? `<div class="sold-anim"><div class="muted">CONTRATADO</div><h2 style="font-size:40px">${esc(STAFF_BY_ID[a.last.sid].n)}</h2><div>${mgrName(a.last.mi)} · <b class="num" style="color:var(--gold)">${a.last.price} K$</b></div></div>` : `<h2 style="font-size:32px">Próximo nome saindo do pote…</h2>`}</div>`;
  return `<div class="sec-title"><h2>Mercado de staff</h2><span class="muted">técnicos e presidentes da Kings League Brasil</span></div><div class="card">${stage}</div>
  <div class="sec-title"><h2>Presidentes</h2></div><div class="mgrs">${S.managers.map((m, i) => `<div class="mgr" style="--c:${m.color}"><div class="t"><span class="row" style="gap:6px;flex-wrap:nowrap">${crestSVG(m.crest, 22)}<span>${esc(m.team)}</span></span>${m.cpu ? '<span class="pill cpu">bot</span>' : ""}</div><div class="money num">${m.budget} K$</div><div class="muted" style="font-size:13px">Técnico: <b style="color:var(--ink)">${m.coach ? esc(STAFF_BY_ID[m.coach].n) : "—"}</b><br>Presidente: <b style="color:var(--ink)">${m.pres ? esc(STAFF_BY_ID[m.pres].n) : "—"}</b></div></div>`).join("")}</div>`;
}
/* ---------- mercado de trocas ---------- */
function viewTrade() {
  const tr = S.trade, mis = NET.mode === "local" ? humansIdx() : myMi() >= 0 ? [myMi()] : [];
  UI.tr = UI.tr || {};
  if (UI.tr.from == null || !mis.includes(UI.tr.from)) UI.tr = { from: mis[0], to: null, give: [], get: [], cf: 0, ct: 0 };
  const me = UI.tr.from, others = S.managers.map((m, i) => i).filter(i => i !== me);
  if (UI.tr.to == null || UI.tr.to === me) UI.tr.to = others[0];
  const F = me != null ? S.managers[me] : null, T = S.managers[UI.tr.to];
  const prow = (id, list, side) => { const p = P(id), on = UI.tr[side].includes(id); return `<button class="trow ${on ? "on" : ""}" data-a="ttog" data-side="${side}" data-id="${id}">${posb(p.p, p.p2)} <span style="flex:1;text-align:left">${esc(p.n)}</span><b class="num">${O(p)}</b></button>`; };
  const [mn, mx] = sqLimits(S);
  const builder = F ? `<div class="card" style="display:grid;gap:10px">
    ${mis.length > 1 ? `<div class="row"><span class="muted">Propondo como:</span>${mis.map(i => `<button class="btn sm ${i === me ? "gold" : ""}" data-a="tfrom" data-mi="${i}">${esc(S.managers[i].team)}</button>`).join("")}</div>` : ""}
    <div class="row"><span class="muted">Trocar com:</span>${others.map(i => `<button class="btn sm ${i === UI.tr.to ? "gold" : ""}" data-a="tto" data-mi="${i}">${esc(S.managers[i].team)}${S.managers[i].cpu ? " (bot)" : ""}</button>`).join("")}</div>
    <div class="grid2">
      <div><div class="muted" style="font-size:12px;margin-bottom:6px">VOCÊ ENTREGA (${esc(F.team)} · saldo ${F.budget} K$)</div><div class="tlist">${F.roster.map(id => prow(id, F.roster, "give")).join("")}</div>
        <label class="f" for="t-cf" style="margin-top:8px">+ moedas que você paga<input id="t-cf" type="number" min="0" max="${F.budget}" value="${UI.tr.cf || 0}"></label></div>
      <div><div class="muted" style="font-size:12px;margin-bottom:6px">VOCÊ RECEBE (${esc(T.team)} · saldo ${T.budget} K$)</div><div class="tlist">${T.roster.map(id => prow(id, T.roster, "get")).join("")}</div>
        <label class="f" for="t-ct" style="margin-top:8px">+ moedas que você pede<input id="t-ct" type="number" min="0" max="${T.budget}" value="${UI.tr.ct || 0}"></label></div>
    </div>
    <div class="row" style="justify-content:space-between"><span class="muted" style="font-size:13px">Cada elenco fica entre ${mn} e ${mx} jogadores e com pelo menos 1 goleiro. Bots aceitam se a troca for boa pra eles.</span><button class="btn gold" data-a="tsend">Propor troca</button></div>
    ${tr.lastErr && tr.lastErr.mi === me && Date.now() - tr.lastErr.at < 8000 ? `<p class="err">${esc(tr.lastErr.err)}</p>` : ""}
  </div>` : "";
  const desc = o => `<b>${esc(S.managers[o.from].team)}</b> entrega ${o.give.map(id => esc(P(id).n)).join(", ") || "—"}${o.cf ? ` + ${o.cf} K$` : ""} · recebe ${o.get.map(id => esc(P(id).n)).join(", ") || "—"}${o.ct ? ` + ${o.ct} K$` : ""} <span class="muted">(com ${esc(S.managers[o.to].team)})</span>`;
  const stl = { pend: "pendente", ok: "aceita", no: "recusada", cancel: "cancelada", fail: "inválida" };
  const offers = tr.offers.map(o => `<div class="row" style="justify-content:space-between;border-bottom:1px solid #1b212c;padding:8px 0;gap:8px"><div style="flex:1;min-width:240px">${desc(o)}${o.err ? ` <span class="err">${esc(o.err)}</span>` : ""}</div>
    <div class="row" style="gap:6px"><span class="pill ${o.st === "ok" ? "you" : ""}">${stl[o.st]}</span>${o.st === "pend" && mis.includes(o.to) ? `<button class="btn sm gold" data-a="tresp" data-id="${o.id}" data-ok="1" data-mi="${o.to}">Aceitar</button><button class="btn sm" data-a="tresp" data-id="${o.id}" data-ok="0" data-mi="${o.to}">Recusar</button>` : ""}${o.st === "pend" && mis.includes(o.from) ? `<button class="btn sm ghost" data-a="tcancel" data-id="${o.id}" data-mi="${o.from}">Cancelar</button>` : ""}</div></div>`).join("");
  return `${tr.when === "carreira" ? careerWindow(me) : ""}<div class="sec-title"><h2>Mercado de trocas</h2><span class="phase">${tr.when === "carreira" ? `temporada ${S.career.year}` : tr.when === "antes" ? "antes do campeonato" : "antes do mata-mata"}</span>${tr.deadline ? `<span class="pill">fecha em <b class="num" data-dl="${tr.deadline}">1:00</b></span>` : ""}</div>
  ${isHost() ? `<div class="row" style="margin-bottom:10px"><span class="muted" style="font-size:13px">Anfitrião:</span><button class="btn gold sm" data-a="tclose">Fechar mercado e seguir</button></div>` : `<p class="muted">O anfitrião fecha o mercado quando todo mundo terminar.</p>`}
  ${builder}
  <div class="sec-title"><h2>Propostas</h2></div><div class="card">${offers || '<p class="muted" style="margin:0">Nenhuma proposta ainda.</p>'}</div>
  <div class="sec-title"><h2>Elencos</h2></div><div class="mgrs">${S.managers.map((m, i) => mgrBox(m, i)).join("")}</div>`;
}
// modo carreira: evolução, agentes livres e dispensas
function careerWindow(me) {
  const C = S.career, m = me != null ? S.managers[me] : null;
  const evo = (C.lastEvo || []).map(([id, a, b]) => `<span class="pill ${b > a ? "you" : ""}">${esc(shortName(P(id).n))} ${a}→<b>${b}</b></span>`).join("");
  const fa = freeAgents(S).map(P).sort((a, b) => b.o - a.o).slice(0, 24);
  const [mn, mx] = sqLimits(S);
  return `<div class="sec-title"><h2>Temporada ${C.year}</h2><span class="phase">janela de transferências</span></div>
  <div class="card" style="display:grid;gap:10px">
    ${evo ? `<div><div class="muted" style="font-size:12px;margin-bottom:4px">QUEM EVOLUIU NA TEMPORADA PASSADA</div><div class="row" style="gap:6px">${evo}</div></div>` : ""}
    ${S.trade.lastErr && m && S.trade.lastErr.mi === me && Date.now() - S.trade.lastErr.at < 8000 ? `<p class="err" style="margin:0">${esc(S.trade.lastErr.err)}</p>` : ""}
    ${m ? `<div class="muted" style="font-size:13px">Saldo do ${esc(m.team)}: <b style="color:var(--gold)">${m.budget} K$</b> · elenco ${m.roster.length} (entre ${mn} e ${mx}). Contratar custa o valor do jogador; dispensar devolve metade.</div>
    <div class="grid2"><div><div class="muted" style="font-size:12px;margin-bottom:6px">SEU ELENCO (dispensar)</div><div class="tlist">${m.roster.map(P).sort((a, b) => POS_ORDER[a.p] - POS_ORDER[b.p] || b.o - a.o).map(p => `<div class="trow">${posb(p.p, p.p2)} <span style="flex:1">${esc(p.n)} <span class="muted">pot ${p.pot || p.o}</span></span><b class="num">${O(p)}</b><button class="btn sm ghost" data-a="farel" data-id="${p.id}" data-mi="${me}">Dispensar +${Math.floor(p.v / 2)}</button></div>`).join("")}</div></div>
    <div><div class="muted" style="font-size:12px;margin-bottom:6px">AGENTES LIVRES (contratar)</div><div class="tlist">${fa.map(p => `<div class="trow">${posb(p.p, p.p2)} <span style="flex:1">${esc(p.n)} <span class="muted">${esc(p.t)} · pot ${p.pot || p.o}</span></span><b class="num">${O(p)}</b><button class="btn sm ${m.budget >= p.v ? "gold" : ""}" data-a="fasign" data-id="${p.id}" data-mi="${me}" ${m.budget >= p.v && m.roster.length < mx ? "" : "disabled"}>${p.v} K$</button></div>`).join("") || '<p class="muted">Nenhum agente livre.</p>'}</div></div></div>` : ""}
  </div>`;
}
/* ---------- Kings Cup: manter wild cards e jogadores ---------- */
function viewKeep() {
  const k = S.keep, mis = NET.mode === "local" ? humansIdx() : myMi() >= 0 ? [myMi()] : [];
  UI.kp = UI.kp || {};
  if (UI.kpMi == null || !mis.includes(UI.kpMi)) UI.kpMi = mis[0];
  const mi = UI.kpMi, m = mi != null ? S.managers[mi] : null;
  let box = "";
  if (m) {
    const d = UI.kp[mi] = UI.kp[mi] || { wc: [], keep: [] };
    const sent = !!k.sub[mi];
    box = `<div class="card" style="display:grid;gap:10px">
      ${mis.length > 1 ? `<div class="row"><span class="muted">Escolhendo:</span>${mis.map(i => `<button class="btn sm ${i === mi ? "gold" : ""}" data-a="kpmi" data-mi="${i}">${esc(S.managers[i].team)}</button>`).join("")}</div>` : ""}
      <div class="row" style="justify-content:space-between"><h3 style="font-size:22px">${esc(m.team)}: quem fica para a Kings Cup</h3><span class="muted">wild cards ${d.wc.length}/${k.maxWC} · mantidos ${d.keep.length}/${k.maxKeep}</span></div>
      ${sent ? `<div class="flash">Escolhas enviadas! Esperando os outros presidentes.</div>` : `
      <div class="tlist">${m.roster.map(id => { const p = P(id), w = d.wc.includes(id), kk = d.keep.includes(id); return `<div class="row" style="gap:8px;border:1px solid var(--line);border-radius:10px;padding:6px 10px">${posb(p.p, p.p2)}<b style="flex:1">${esc(p.n)}</b><span class="num" style="color:var(--gold)">${O(p)}</span>
        <button class="btn sm ${w ? "gold" : ""}" data-a="kptog" data-kind="wc" data-id="${id}" data-mi="${mi}">Wild card</button><button class="btn sm ${kk ? "gold" : ""}" data-a="kptog" data-kind="keep" data-id="${id}" data-mi="${mi}">Manter</button></div>`; }).join("")}</div>
      <div class="row" style="justify-content:space-between"><span class="muted" style="font-size:13px">Quem não for escolhido volta para o draft da Kings Cup.</span><button class="btn gold" data-a="kpsend" data-mi="${mi}">Confirmar elenco</button></div>`}
    </div>`;
  }
  return `<div class="sec-title"><h2>Kings Cup</h2><span class="phase">montagem dos elencos</span>${k.deadline ? `<span class="pill">fecha em <b class="num" data-dl="${k.deadline}">1:00</b> · quem não confirmar fica com os melhores</span>` : ""}</div>
  <p class="muted" style="max-width:75ch">Igual à vida real: cada presidente segura até ${k.maxWC} wild cards e até ${k.maxKeep} jogadores do draft. Os outros vão para o pote e o draft em cobra completa os elencos.</p>
  ${isHost() ? `<div class="row" style="margin-bottom:10px"><span class="muted" style="font-size:13px">Anfitrião:</span><button class="btn sm" data-a="keepclose">Fechar e ir para o sorteio</button></div>` : ""}
  ${box}
  <div class="sec-title"><h2>Presidentes</h2></div><div class="mgrs">${S.managers.map((x, i) => `<div class="mgr" style="--c:${x.color}"><div class="t"><span>${esc(x.team)}</span>${k.sub[i] ? '<span class="pill you">pronto</span>' : '<span class="pill">escolhendo…</span>'}</div></div>`).join("")}</div>`;
}
/* ---------- modo draft: wild cards, sorteio e draft ---------- */
function marketPool(clickA, selId, mi) {
  const t = taken(S), q = (UI.mq || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), pos = UI.mpos || "ALL";
  let list = PLAYERS.filter(p => !t.has(p.id) && (pos === "ALL" || p.p === pos) && (!q || (p.n + " " + p.t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)));
  if (hid()) list = list.slice().sort((x, y) => x.n.localeCompare(y.n));
  const h = hid();
  return `<div class="row" style="margin-bottom:10px">
    <input id="mq" type="text" placeholder="Buscar jogador ou clube" value="${esc(UI.mq || "")}" style="max-width:280px">
    <select id="mpos" style="max-width:150px">${["ALL", "GOL", "DEF", "MEI", "ATA"].map(p => `<option value="${p}" ${pos === p ? "selected" : ""}>${p === "ALL" ? "Todas posições" : p}</option>`).join("")}</select>
    <span class="muted" style="font-size:13px">${list.length} disponíveis</span></div>
  <div class="scroll"><table class="tbl"><thead><tr><th>OVR</th><th>Pos</th><th>Jogador</th><th>Clube 25/26</th>${h ? "" : "<th>ATQ</th><th>DEF</th><th>Valor</th>"}<th></th></tr></thead><tbody>
  ${list.map(p => `<tr class="${selId === p.id ? "sel" : ""}"><td class="o ${p.p === "GOL" ? "g" : ""}">${O(p)}</td><td>${posb(p.p, p.p2)}</td><td><b>${esc(p.n)}</b>${p.tags.length ? `<div class="muted" style="font-size:11.5px">${esc(p.tags.slice(0, 3).join(" · "))}</div>` : ""}</td><td class="muted">${esc(p.t)}</td>${h ? "" : `<td class="num">${p.at}</td><td class="num">${p.df}</td><td class="num">${p.v}</td>`}
    <td>${clickA ? `<button class="btn sm" data-a="${clickA}" data-id="${p.id}" data-mi="${mi}">${clickA === "wcadd" ? "Quero" : "Escolher"}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
}
function viewWC() {
  const w = S.wc, st = S.settings;
  const mis = NET.mode === "local" ? humansIdx() : myMi() >= 0 ? [myMi()] : [];
  UI.wcd = UI.wcd || {}; UI.wcsent = UI.wcsent || {};
  if (UI.wcMi == null || !mis.includes(UI.wcMi)) UI.wcMi = mis[0];
  const mi = UI.wcMi, m = mi != null ? S.managers[mi] : null;
  const status = `<div class="mgrs">${S.managers.map((x, i) => `<div class="mgr" style="--c:${x.color}"><div class="t"><span class="row" style="gap:6px;flex-wrap:nowrap">${crestSVG(x.crest, 22)}<span>${esc(x.team)}</span></span>${wcLeft(S, x) <= 0 ? '<span class="pill">completo</span>' : w.sub.includes(i) ? '<span class="pill you">enviou</span>' : '<span class="pill">pensando…</span>'}</div>
    <div class="row" style="justify-content:space-between"><span class="money num">${x.budget} K$</span><span class="muted" style="font-size:13px">${x.wc.length}/${st.wc} wild cards</span></div>
    <div class="mini">${x.wc.map(id => `<span>${P(id).p} ${O(P(id))} ${esc(P(id).n.split(" ")[0].replace(/'/g, ""))}</span>`).join("")}</div></div>`).join("")}</div>`;
  let mine = "";
  if (m && wcLeft(S, m) > 0) {
    const d = UI.wcd[mi] = UI.wcd[mi] || {};
    Object.keys(d).forEach(id => { if (taken(S).has(+id)) delete d[id]; });
    const need = wcLeft(S, m), n = Object.keys(d).length, sum = Object.values(d).reduce((x, y) => x + (+y || 0), 0);
    const cap = m.budget - Math.max(0, need - n);
    const sent = UI.wcsent[w.round + "-" + mi] && w.sub.includes(mi);
    mine = `<div class="card" style="display:grid;gap:10px">
      ${mis.length > 1 ? `<div class="row"><span class="muted">Propostas de:</span>${mis.map(i => `<button class="btn sm ${i === mi ? "gold" : ""}" data-a="wcmi" data-mi="${i}">${esc(S.managers[i].team)}</button>`).join("")}<span class="muted" style="font-size:12.5px">(um de cada vez, sem olhar o do outro)</span></div>` : ""}
      <div class="row" style="justify-content:space-between"><h3 style="font-size:22px">Suas propostas · ${esc(m.team)}</h3><span class="muted">vagas: ${need} · saldo ${m.budget} K$</span></div>
      ${sent ? `<div class="flash">Propostas enviadas! Esperando os outros presidentes. <button class="btn sm" data-a="wcedit" data-mi="${mi}">Mudar</button></div>` : `
      ${n ? Object.entries(d).map(([id, v]) => `<div class="row" style="gap:8px;border:1px solid var(--line);border-radius:10px;padding:6px 10px">${posb(P(+id).p)}<b style="flex:1">${esc(P(+id).n)}</b><span class="muted">${hid() ? "" : "ref. " + P(+id).v}</span>
        <label class="row" for="wcv-${id}" style="gap:6px;font-size:13px">Proposta<input id="wcv-${id}" class="wcamt" data-mi="${mi}" data-id="${id}" type="number" min="1" max="${m.budget}" value="${v}" style="width:90px"></label><button class="btn sm ghost" data-a="wcdel" data-mi="${mi}" data-id="${id}" aria-label="Remover">✕</button></div>`).join("") : `<p class="muted" style="margin:0">Toque em "Quero" nos jogadores da lista abaixo (até ${need}).</p>`}
      <div class="row" style="justify-content:space-between"><span class="${sum > cap ? "err" : "muted"}">Total: <b class="num">${sum}</b> de ${cap} K$ possíveis${need - n > 0 ? ` (reserva 1 K$ por vaga sem proposta)` : ""}</span>
      <button class="btn gold" data-a="wcsend" data-mi="${mi}" ${sum > cap ? "disabled" : ""}>${n ? "Enviar propostas" : "Não quero nenhum agora"}</button></div>`}
    </div>`;
  } else if (m) mine = `<div class="flash">Seus wild cards estão completos. Agora é esperar o draft.</div>`;
  return `<div class="sec-title"><h2>Wild cards</h2><span class="phase">Rodada ${w.round} de ${w.maxRounds}</span><span class="muted">propostas fecham em <b id="wcclock" class="num">–</b></span></div>
  <p class="muted" style="margin:0 0 12px;max-width:75ch">Propostas secretas. Se só você pedir um jogador, ele é seu pelo valor que ofereceu. Se mais de um time pedir o mesmo, vira leilão só entre vocês, começando na maior proposta.</p>
  ${isHost() ? `<div class="row" style="margin-bottom:12px"><span class="muted" style="font-size:13px">Anfitrião:</span><button class="btn sm" data-a="wcclose">Fechar propostas agora</button><button class="btn sm" data-a="autofill">Pular para o draft automático</button></div>` : ""}
  ${mine}
  <div class="sec-title"><h2>Presidentes</h2></div>${status}
  ${S.wc.results.length ? `<div class="sec-title"><h2>Contratações</h2></div><div class="card log">${S.wc.results.slice(0, 20).map(r => `<div>${mgrName(r.mi)}: <b>${esc(P(r.pid).n)}</b> por <b class="num">${r.price}</b></div>`).join("")}</div>` : ""}
  ${m && wcLeft(S, m) > 0 && !(UI.wcsent[w.round + "-" + mi] && w.sub.includes(mi)) ? `<div class="sec-title"><h2>Todos os jogadores</h2></div>${marketPool("wcadd", null, mi)}` : ""}`;
}
function viewLottery() {
  const d = S.draft;
  return `<div class="sec-title"><h2>Sorteio do draft</h2><span class="muted">a ordem das escolhas</span></div>
  <div class="card lottery">
    <div class="balls">${d.order.map((mi, k) => k < d.revealed ? `<div class="ball on" style="--c:${S.managers[mi].color}"><span class="num">${k + 1}º</span>${crestSVG(S.managers[mi].crest, 44)}<b>${esc(S.managers[mi].team)}</b></div>` : `<div class="ball ${k === d.revealed ? "spin" : ""}"><span class="num">${k + 1}º</span><b>?</b></div>`).join("")}</div>
    <p class="muted" style="margin:10px 0 0">Ordem em cobra: na rodada 1 vai do 1º ao último, na rodada 2 volta do último ao 1º, e assim por diante.</p>
  </div>
  ${isHost() ? `<div class="row" style="margin-top:10px"><button class="btn sm" data-a="autofill">Fazer o draft todo automático</button></div>` : ""}`;
}
function viewDraft() {
  const d = S.draft, st = S.settings, pk = draftPicker(S), pm = S.managers[pk];
  const mi = myMi();
  const myTurn = NET.mode === "local" ? !pm.cpu : pk === mi;
  const sel = UI.dsel != null && !taken(S).has(UI.dsel) ? P(UI.dsel) : null;
  const pickNo = d.n + 1;
  const rounds = Math.max(...S.managers.map(m => m.roster.length - m.wc.length), 0) + 1;
  const board = `<div class="scroll" style="max-height:none"><table class="tbl dboard"><thead><tr><th>Time</th><th>Wild cards</th>${Array.from({ length: Math.max(st.picks, rounds) }, (_, r) => `<th>R${r + 1}</th>`).join("")}</tr></thead><tbody>
    ${d.order.map(i => { const m = S.managers[i]; const picks = d.picks.filter(x => x.mi === i).slice().reverse(); return `<tr class="${i === pk ? "sel" : ""}"><td>${mgrName(i)}</td><td class="muted" style="font-size:12px">${m.wc.map(id => esc(P(id).n.split(" ")[0])).join(", ") || "—"}</td>${Array.from({ length: Math.max(st.picks, rounds) }, (_, r) => { const x = picks[r]; return `<td style="font-size:12.5px">${x ? `${posb(P(x.pid).p)} ${esc(P(x.pid).n)}` : ""}</td>`; }).join("")}</tr>`; }).join("")}
  </tbody></table></div>`;
  return `<div class="sec-title"><h2>Draft</h2><span class="phase">Pick ${pickNo} · rodada ${d.round + 1}</span></div>
  <div class="card stage" style="grid-template-columns:auto 1fr">
    ${sel && myTurn ? pcard(sel) : `<div class="pcard" style="align-items:center;justify-content:center;text-align:center">${crestSVG(pm.crest, 90)}<div class="nm" style="margin-top:10px">${esc(pm.team)}</div></div>`}
    <div class="bidbox">
      <div class="row" style="justify-content:space-between"><span class="muted">NO RELÓGIO</span><div class="clock num" id="dclock">–</div></div>
      <h2 style="font-size:38px;color:${pm.color}">${esc(pm.team)}</h2>
      <div class="muted">${pm.cpu ? "O bot está escolhendo…" : myTurn ? "É a sua vez! Toque num jogador da lista e confirme." : `Esperando ${esc(pm.name)} escolher…`} Faltam ${slotsLeft(S, pm)} jogador${slotsLeft(S, pm) === 1 ? "" : "es"} no elenco.</div>
      ${myTurn ? `<div class="row"><button class="btn gold big" data-a="dpick" ${sel && canBidOn(S, pm, sel) ? "" : "disabled"}>Escolher ${sel ? esc(sel.n) : "jogador"}</button></div>${sel && !canBidOn(S, pm, sel) ? `<p class="err">Sua última vaga precisa ser um goleiro.</p>` : ""}` : ""}
      ${d.last && now() - d.last.at < 6000 ? `<div class="flash">Pick ${d.n}: <b>${esc(P(d.last.pid).n)}</b> para ${mgrName(d.last.mi)}</div>` : ""}
      <div class="muted" style="font-size:13px">Próximos: ${(() => { const out = []; let r = d.round, k = d.idx; for (let g = 0; g < 40 && out.length < 4; g++) { k++; if (k >= d.order.length) { k = 0; r++; } const x = (r % 2 === 0 ? d.order : d.order.slice().reverse())[k]; if (slotsLeft(S, S.managers[x]) > 0 && !(x === pk && out.length === 0 && false)) out.push(esc(S.managers[x].team)); } return out.join(" → "); })()}</div>
    </div>
  </div>
  ${isHost() ? `<div class="row" style="margin-top:10px"><span class="muted" style="font-size:13px">Anfitrião:</span><button class="btn sm" data-a="autofill">Completar o draft automaticamente</button></div>` : ""}
  <div class="sec-title"><h2>Quadro do draft</h2></div>${board}
  <div class="sec-title"><h2>Disponíveis</h2></div>${marketPool(myTurn ? "dsel" : null, UI.dsel, pk)}`;
}
function bidControls(bi, lot, pl) {
  const m = S.managers[bi], mx = maxBid(S, m), can = canBidOn(S, m, pl);
  const leading = lot.bidder === bi, passed = lot.passed.includes(bi);
  let why = "";
  if (slotsLeft(S, m) <= 0) why = "Elenco completo.";
  else if (!can) why = "Sua última vaga tem que ser goleiro.";
  else if (mx <= lot.bid) why = `Seu lance máximo é ${mx}.`;
  const dis = leading || !!why || S.auction.paused;
  const steps = [1, 2, 5, 10].filter(s => lot.bid + s <= mx);
  return `<div style="display:grid;gap:6px;border-top:1px solid var(--line);padding-top:10px">
    <div class="row" style="justify-content:space-between"><span>${mgrName(bi)} <span class="muted">· saldo ${m.budget} · máx ${Math.max(0, mx)} · ${m.roster.length}/${S.settings.squad}</span></span>${leading ? '<span class="pill you">na frente</span>' : passed ? '<span class="pill">passou</span>' : ""}</div>
    <div class="bidbtns">${steps.map(s => `<button class="btn ${s === 1 ? "gold" : ""}" data-a="bid" data-mi="${bi}" data-amt="${lot.bid + s}" ${dis ? "disabled" : ""}>+${s} <span class="num">(${lot.bid + s})</span></button>`).join("")}
      ${!dis && mx > lot.bid + 10 ? `<button class="btn ghost" data-a="bid" data-mi="${bi}" data-amt="${mx}">Tudo (${mx})</button>` : ""}
      <button class="btn ghost" data-a="pass" data-mi="${bi}" ${leading || passed || why ? "disabled" : ""}>Passar</button></div>
    ${why ? `<div class="muted" style="font-size:13px">${why}</div>` : ""}
  </div>`;
}
function mgrBox(m, i) {
  const sq = S.settings.squad;
  const ros = m.roster.map(P).sort((a, b) => POS_ORDER[a.p] - POS_ORDER[b.p] || b.o - a.o);
  const avg = hid() ? "?" : ros.length ? Math.round(ros.reduce((s, p) => s + p.o, 0) / ros.length) : 0;
  return `<div class="mgr ${m.pid === MYPID ? "me" : ""}" style="--c:${m.color}">
    <div class="t"><span class="row" style="gap:6px;flex-wrap:nowrap">${crestSVG(m.crest, 22)}<span style="overflow:hidden;text-overflow:ellipsis">${esc(m.team)}</span></span>${m.cpu ? '<span class="pill cpu">bot</span>' : m.pid === MYPID ? '<span class="pill you">você</span>' : ""}</div>
    <div class="row" style="justify-content:space-between"><span class="money num">${m.budget} K$</span><span class="muted" style="font-size:13px">${m.roster.length}/${sq} · média ${avg || "–"}</span></div>
    <div class="mini">${ros.map(p => `<span title="${esc(p.n)}">${p.p} ${O(p)} ${esc(p.n.split(" ")[0].replace(/'/g, ""))}</span>`).join("")}${Array.from({ length: Math.max(0, sq - ros.length) }, () => `<span class="e">vaga</span>`).join("")}</div>
  </div>`;
}

/* ---------- temporada ---------- */
function viewSeason() {
  const se = S.season, host = isHost(), mi = myMi();
  const tb = standings(S);
  const champ = se.champion != null ? S.managers[se.champion] : null;
  const stageName = { league: se.fmt === "cup" ? "Fase de grupos" : "Fase de liga", playin: "Play-in", quarters: "Quartas de final", semis: "Semifinais", final: "Final", done: "Encerrado" }[se.stage];
  const next = roundFixtures(S).filter(f => !f.res);
  const tabs = [["time", "Meu time"], ["tabela", "Classificação"], ["jogos", "Jogos"], ["elencos", "Elencos"], ["artilharia", "Estatísticas"]];
  return `${gameOver(S) ? voteCard() + hallView() : ""}${S.history && S.history.length ? yearView() : ""}${champ ? `<div class="champ" style="margin-top:20px">${crestSVG(champ.crest, 90)}<div><div class="muted">CAMPEÃO ${se.fmt === "cup" ? "DA KINGS CUP" : "DO SPLIT"}</div><h2>${esc(champ.team)}</h2><div>Presidente ${esc(champ.name)}</div></div>${CROWN.replace("<svg", '<svg style="width:70px;height:70px;margin-left:auto"')}</div>${awardsView()}` : ""}
  <div class="sec-title"><h2>${se.fmt === "cup" ? "Kings Cup" : "Split"}</h2>${S.career ? `<span class="pill you">Carreira · temporada ${S.career.year}</span>` : ""}<span class="phase">${stageName}</span>${se.koInfo ? `<span class="muted" style="font-size:13px">${esc(se.koInfo)}</span>` : ""}</div>
  ${se.fmt === "cup" ? `<div class="row" style="margin-bottom:10px;gap:8px"><span class="pill">Desafios: Grupo A <b class="num">${se.desafio[0]}</b> x <b class="num">${se.desafio[1]}</b> Grupo B</span>${Object.keys(se.dwin).length ? `<span class="muted" style="font-size:13px">Carta extra no mata-mata: ${Object.keys(se.dwin).map(i => esc(S.managers[+i].team)).join(", ")}</span>` : ""}</div>` : ""}
  ${!champ ? `<div class="card" style="display:grid;gap:10px">
    <div class="row" style="justify-content:space-between"><div class="muted" style="font-size:13px">${se.stage === "league" ? `RODADA ${se.round + 1} DE ${se.leagueRounds}` : stageName.toUpperCase()} · JOGOS SIMULTÂNEOS</div>
    ${host ? `<div class="row" style="gap:6px"><span class="muted" style="font-size:12.5px">Anfitrião:</span><button class="btn sm" data-a="quickround">Simular rodada sem ver</button><button class="btn sm ghost" data-a="simstage">Simular a fase toda</button></div>` : ""}</div>
    <div id="roundboard" class="roundboard">${roundBoard() || '<span class="muted">Preparando a rodada…</span>'}</div>
    <p class="muted" style="margin:0;font-size:13px">Todos os jogos da rodada rolam ao mesmo tempo. Cada técnico ajusta as táticas e toca em <b>Pronto!</b>; quando os dois lados estão prontos, o jogo começa na hora. Se der 1 minuto, o jogo arruma o que faltar e começa sozinho. Jogos só de bots já começam direto.</p>
  </div>` : ""}
  <div class="tabs">${tabs.map(([k, l]) => `<button class="${UI.tab === k ? "on" : ""}" data-a="tab" data-tab="${k}">${l}</button>`).join("")}</div>
  ${UI.tab === "time" ? teamView() : UI.tab === "tabela" ? (se.fmt === "cup" ? `<div class="grid2">${[0, 1].map(g => `<div><h3 style="font-size:20px;margin-bottom:6px">Grupo ${"AB"[g]}</h3>${tableView(standings(S, g), g)}</div>`).join("")}</div>` : tableView(tb)) + bracketView() : UI.tab === "jogos" ? fixturesView() : UI.tab === "elencos" ? rostersView() : statsView()}`;
}
function hallView() {
  const H = S.hall; if (!H || (!H.titles.length && !Object.keys(H.h2h).length)) return "";
  const tot = {}; H.titles.forEach(t => { const k = t.pid ? t.name : "Bots"; tot[k] = (tot[k] || 0) + 1; });
  const rk = Object.entries(tot).sort((a, b) => b[1] - a[1]);
  const h2h = Object.values(H.h2h).sort((a, b) => (b.wa + b.wb) - (a.wa + a.wb));
  return `<div class="card" style="display:grid;gap:8px;margin-top:16px"><h3 style="font-size:22px">Histórico da sala</h3>
    <div class="row" style="gap:10px;flex-wrap:wrap">${rk.map(([n, c], k) => `<span class="pill ${k === 0 ? "you" : ""}">${k === 0 ? "👑 " : ""}${esc(n)}: <b>${c}</b> título${c > 1 ? "s" : ""}</span>`).join("")}</div>
    <div class="muted" style="font-size:13px">Últimos campeões: ${H.titles.slice(-6).reverse().map(t => `<b style="color:var(--ink)">${esc(t.team)}</b> (${t.comp}${t.season ? " " + t.season : ""}, ${t.pid ? esc(t.name) : "bot"})`).join(" · ")}</div>
    ${h2h.length ? `<div style="display:grid;gap:4px"><div class="muted" style="font-size:12px">CONFRONTO DIRETO ENTRE AMIGOS</div>${h2h.slice(0, 8).map(r => `<div class="row" style="gap:8px"><b>${esc(r.na)}</b><span class="num" style="color:var(--gold);font-weight:800">${r.wa} x ${r.wb}</span><b>${esc(r.nb)}</b></div>`).join("")}</div>` : ""}
  </div>`;
}
function voteCard() {
  const hum = S.managers.map((m, i) => i).filter(i => !S.managers[i].cpu), v = S.votes || {};
  const yes = hum.filter(i => v[i] === true).length, no = hum.filter(i => v[i] === false).length, need = Math.floor(hum.length / 2) + 1;
  const mis = NET.mode === "local" ? hum : myMi() >= 0 ? [myMi()] : [];
  return `<div class="card votecard" style="margin-top:16px;display:grid;gap:10px">
    <div class="row" style="justify-content:space-between"><h3 style="font-size:24px">${S.settings.career ? `Fim da temporada ${S.career ? S.career.year : 1}: seguir para a próxima?` : "Revanche na mesma sala?"}</h3><span class="pill">${yes} sim · ${no} não · precisa de ${need}</span></div>
    <p class="muted" style="margin:0">${S.settings.career ? "Modo carreira: se a maioria votar sim, começa a próxima temporada com os mesmos elencos. Os jogadores evoluem rumo ao potencial (quem jogou bem evolui mais), cada time recebe premiação pela campanha e abre a janela de transferências." : "Se a maioria votar sim, todo mundo volta pro vestiário desta sala com os mesmos escudos e uniformes. Dá pra trocar o modo e as regras antes de começar."}</p>
    ${mis.map(mi => `<div class="row" style="gap:8px">${mis.length > 1 ? `<b>${esc(S.managers[mi].team)}:</b>` : ""}<button class="btn ${v[mi] === true ? "gold" : ""}" data-a="vote" data-v="1" data-mi="${mi}">${v[mi] === true ? "Votei sim ✓" : S.settings.career ? "Sim, próxima temporada" : "Sim, bora de novo"}</button><button class="btn ghost ${v[mi] === false ? "on" : ""}" data-a="vote" data-v="0" data-mi="${mi}">${v[mi] === false ? "Votei não" : "Não"}</button></div>`).join("")}
    ${isHost() ? `<div class="row"><span class="muted" style="font-size:13px">Anfitrião:</span>${S.settings.career ? `<button class="btn sm gold" data-a="nextseason">Próxima temporada agora</button>` : ""}<button class="btn sm" data-a="relobby">Voltar ao vestiário${S.settings.career ? " (encerra a carreira)" : ""}</button></div>` : ""}
  </div>`;
}
function cardNames(s) { return String(s || "").split("+").map(k => CARDS[k] ? CARDS[k].name : k).join(" + "); }
function yearView() {
  return `<div class="card" style="margin-top:16px;display:grid;gap:8px"><div class="muted" style="font-size:12px">TEMPORADA ${S.yearDone ? "COMPLETA" : "EM ANDAMENTO"}</div>
    <div class="row" style="gap:14px">${S.history.map(h => `<div class="row" style="gap:8px">${crestSVG(S.managers[h.champion].crest, 30)}<div><div class="muted" style="font-size:12px">${h.comp}</div><b>${esc(S.managers[h.champion].team)}</b></div></div>`).join("")}</div>
    ${S.yearDone ? (() => { const tot = {}; S.history.forEach(h => h.table.forEach(r => tot[r.i] = (tot[r.i] || 0) + r.pts)); const best = Object.entries(tot).sort((x, y) => y[1] - x[1])[0]; const both = S.history[0].champion === S.history[1].champion; return `<div>${both ? `<b style="color:var(--gold)">${esc(S.managers[S.history[0].champion].team)} ganhou o Split e a Kings Cup!</b> ` : ""}Melhor campanha do ano nas fases de grupo: <b>${esc(S.managers[+best[0]].team)}</b> (${best[1]} pts).</div>`; })() : ""}</div>`;
}
function bracketView() {
  const se = S.season; if (!se.bracket) return "";
  const lv = [0, 1, 2, 3].filter(l => se.bracket.some(x => x.lvl === l));
  const nm = o => { if (o.t != null) return mgrName(o.t); const f = se.fixtures.find(x => x.id === o.w); const w = f && f.res ? (f.res.w === 0 ? f.h : f.a) : null; return w != null ? mgrName(w) : `<span class="muted">vencedor ${o.w.toUpperCase()}</span>`; };
  return `<div class="sec-title"><h2>Mata-mata</h2></div><div class="bracket">${lv.map(l => `<div class="bcol"><div class="muted" style="font-size:12px;text-transform:uppercase">${KO_NAMES[l]}</div>${se.bracket.filter(x => x.lvl === l).map(x => { const f = se.fixtures.find(y => y.id === x.id); return `<div class="bmatch"><div>${nm(x.a)} ${f && f.res ? `<b class="num">${f.res.s[0]}</b>` : ""}</div><div>${nm(x.b)} ${f && f.res ? `<b class="num">${f.res.s[1]}</b>` : ""}</div>${f && f.res && f.res.so ? `<div class="muted" style="font-size:11px">shootouts ${f.res.so[0]}-${f.res.so[1]}</div>` : ""}</div>`; }).join("")}</div>`).join("")}</div>`;
}
// seleção do campeonato: goleiro da melhor defesa + 2 por posição (gols, MVPs e overall)
function teamOfTournament(gk, mv) {
  const goals = {}; topScorers(S).forEach(x => goals[x.id] = x.n);
  const owned = S.managers.flatMap((m, mi) => m.roster.map(id => ({ id, mi })));
  const score = id => (goals[id] || 0) + (mv[id] || 0) * 3 + P(id).o / 25;
  const pickPos = (pos, n) => owned.filter(x => P(x.id).p === pos).sort((a, b) => score(b.id) - score(a.id)).slice(0, n);
  const line = [...(gk ? [{ id: gk.id, mi: ownerOf(S, gk.id) }] : pickPos("GOL", 1)), ...pickPos("DEF", 2), ...pickPos("MEI", 2), ...pickPos("ATA", 2)];
  if (line.length < 4) return "";
  return `<div class="sec-title"><h2>Seleção do campeonato</h2></div><div class="toty">${line.map(x => { const p = P(x.id), m = S.managers[x.mi]; return `<div class="totyc" style="--c:${m ? m.color : "#888"}">${posb(p.p, p.p2)}<b>${esc(p.n)}</b><span class="muted">${m ? esc(m.team) : ""}${goals[x.id] ? ` · ${goals[x.id]} gols` : ""}${mv[x.id] ? ` · ${mv[x.id]} MVP` : ""}</span></div>`; }).join("")}</div>`;
}
function awardsView() {
  const ts = topScorers(S)[0];
  const mv = {}; S.season.fixtures.forEach(f => { if (f.res && f.res.mvp) mv[f.res.mvp] = (mv[f.res.mvp] || 0) + 1; });
  const mvp = Object.entries(mv).sort((a, b) => b[1] - a[1])[0];
  const tb = standings(S);
  const bestDef = tb.slice().sort((a, b) => a.gc / Math.max(1, a.pj) - b.gc / Math.max(1, b.pj))[0];
  const bestAtt = tb.slice().sort((a, b) => b.gf - a.gf)[0];
  const gk = bestDef ? S.managers[bestDef.i].tac && P(S.managers[bestDef.i].tac.gk) : null;
  const card = (t, big, sub) => `<div class="award"><div class="muted" style="font-size:12px">${t}</div><b>${big}</b><span class="muted">${sub}</span></div>`;
  return `<div class="awards">
    ${ts ? card("ARTILHEIRO", esc(P(ts.id).n), `${ts.n} gols · ${esc(S.managers[ownerOf(S, ts.id)].team)}`) : ""}
    ${mvp ? card("REI DOS MVPS", esc(P(+mvp[0]).n), `${mvp[1]} vezes melhor em campo`) : ""}
    ${gk ? card("LUVA DE OURO", esc(gk.n), `defesa do ${esc(S.managers[bestDef.i].team)}: ${(bestDef.gc / Math.max(1, bestDef.pj)).toFixed(1)} gols sofridos por jogo`) : ""}
    ${bestAtt ? card("ATAQUE MAIS FORTE", esc(S.managers[bestAtt.i].team), `${bestAtt.gf} gols na fase de liga`) : ""}
  </div>${teamOfTournament(gk, mv)}`;
}
function editableMis() { return NET.mode === "local" ? humansIdx() : myMi() >= 0 ? [myMi()] : []; }
/* ---------- escalação visual: toque num jogador e depois em outro para trocar ---------- */
function fitOf(p, slot) { if (!p) return ""; if (slot === "GOL") return p.p === "GOL" ? "ok" : "bad"; if (p.p === slot) return "ok"; if (p.p2 === slot) return "mid"; return "bad"; }
function luChip(mi, key, id, slot, extra) {
  const p = id != null ? P(id) : null, sel = UI.lsel && UI.lsel.mi === mi && UI.lsel.k === key;
  const fit = slot ? fitOf(p, slot) : "";
  return `<button class="luchip ${fit} ${sel ? "sel" : ""}" data-a="lu" data-mi="${mi}" data-k="${key}" ${extra || ""} aria-label="${p ? esc(p.n) : "vaga"}">
    ${slot ? `<span class="lupos">${slot}</span>` : ""}<span class="luo num">${p ? O(p) : "–"}</span><span class="lun">${p ? esc(shortName(p.n)) : "vaga"}${p && isInj(S, id) ? " 🩹" : ""}</span>${p ? `<span class="lup">${p.p}${p.p2 ? "/" + p.p2 : ""}</span>` : ""}</button>`;
}
function lineupBoard(mi, m, tac) {
  const slots = FORMS[tac.form], xy = FORM_XY[tac.form];
  const used = new Set([tac.gk].concat(tac.slots));
  const bench = m.roster.filter(id => !used.has(id)).sort((a, b) => POS_ORDER[P(a).p] - POS_ORDER[P(b).p] || P(b).o - P(a).o);
  const ord = tac.order.filter(id => tac.slots.includes(id));
  const bad = slots.filter((sl, i) => tac.slots[i] != null && fitOf(P(tac.slots[i]), sl) === "bad").length + (P(tac.gk) && P(tac.gk).p !== "GOL" ? 1 : 0);
  const chem = chemistry({ field: tac.slots.filter(x => x != null).concat(tac.gk != null ? [tac.gk] : []) });
  const injd = [tac.gk].concat(tac.slots).filter(id => isInj(S, id));
  return `<div class="lubox">
    <div class="lupitch">
      <div class="luline mid"></div><div class="luline box"></div><div class="luline box top"></div>
      ${slots.map((sl, i) => { const [x, y] = xy[i]; const n = ord.indexOf(tac.slots[i]); return `<div class="luslot" style="left:${y * 100}%;top:${(1 - x) * 82 + 4}%">${luChip(mi, "s" + i, tac.slots[i], sl, "")}${n >= 0 ? `<span class="luord" title="Ordem no escalonado">${n + 1}º</span>` : ""}</div>`; }).join("")}
      <div class="luslot" style="left:50%;top:91%">${luChip(mi, "gk", tac.gk, "GOL", "")}</div>
    </div>
    <div class="muted" style="font-size:12.5px">${UI.lsel && UI.lsel.mi === mi ? "<b style='color:var(--gold)'>Agora toque em quem vai trocar de lugar com ele.</b>" : "Toque num jogador e depois em outro (no campo ou no banco) para trocar."} Verde: posição dele · amarelo: posição secundária · vermelho: fora de posição.${bad ? ` <b style="color:var(--red)">${bad} fora de posição.</b>` : ""}</div>
    <div class="row" style="gap:6px"><span class="pill ${chem.pairs ? "you" : ""}">Química: ${chem.pairs} dupla${chem.pairs === 1 ? "" : "s"} do mesmo clube${chem.pairs ? ` (+${Math.round((chem.mult - 1) * 100)}%)` : ""}</span>${injd.length ? `<span class="pill" style="color:var(--red)">🩹 ${injd.map(id => esc(shortName(P(id).n)) + " fora " + S.season.inj[id] + " rod.").join(", ")} — o jogo troca na hora</span>` : ""}</div>
    <div class="lubench"><span class="muted" style="font-size:12px">BANCO</span>${bench.map(id => luChip(mi, "b" + id, id, null, "")).join("") || '<span class="muted">sem reservas</span>'}</div>
  </div>`;
}
function luTap(mi, k) {
  const cur = UI.lsel;
  if (!cur || cur.mi !== mi) { UI.lsel = { mi, k }; return render(true); }
  if (cur.k === k) { UI.lsel = null; return render(true); }
  if (cur.k[0] === "b" && k[0] === "b") { UI.lsel = { mi, k }; return render(true); }
  const a = cur.k, b = k; UI.lsel = null;
  tacChange(mi, tac => {
    const get = key => key === "gk" ? tac.gk : key[0] === "s" ? tac.slots[+key.slice(1)] : +key.slice(1);
    const set = (key, id) => { if (key === "gk") tac.gk = id; else if (key[0] === "s") tac.slots[+key.slice(1)] = id; };
    const ia = get(a), ib = get(b);
    if (a[0] === "b") { set(b, ia); const oi = tac.order.indexOf(ib); if (oi >= 0 && b[0] === "s") tac.order[oi] = ia; }
    else if (b[0] === "b") { set(a, ib); const oi = tac.order.indexOf(ia); if (oi >= 0 && a[0] === "s") tac.order[oi] = ib; }
    else { set(a, ib); set(b, ia); }
  });
}
function teamView() {
  const mis = editableMis();
  if (!mis.length) return `<p class="muted">Você está assistindo esta sala.</p>`;
  if (UI.editMi == null || !mis.includes(UI.editMi)) UI.editMi = mis[0];
  const mi = UI.editMi, m = S.managers[mi], tac = m.tac || autoTac(S, mi, "2-3-1", "equilibrado");
  const slots = FORMS[tac.form];
  const used = new Set([tac.gk].concat(tac.slots));
  const bench = m.roster.filter(id => !used.has(id));
  const opt = (sel, list) => list.map(id => { const p = P(id); return `<option value="${id}" ${id === sel ? "selected" : ""}>${O(p)} ${p.p} · ${esc(p.n)}</option>`; }).join("");
  const order = tac.order.filter(id => tac.slots.includes(id));
  return `${mis.length > 1 ? `<div class="row" style="margin-bottom:10px"><span class="muted">Editando:</span>${mis.map(i => `<button class="btn sm ${i === mi ? "gold" : ""}" data-a="editmi" data-mi="${i}">${esc(S.managers[i].team)}</button>`).join("")}</div>` : ""}
  <div class="grid2">
    <div class="card" style="display:grid;gap:10px;align-content:start">
      <h3 style="font-size:22px">Escalação · ${esc(m.team)}</h3>
      ${m.coach ? (() => { const c = STAFF_BY_ID[m.coach]; const f1 = tac.form === c.form, f2 = tac.style === c.style; return `<div class="flash" style="border-color:${f1 && f2 ? "var(--pitch)" : "var(--line)"};background:transparent;font-size:13.5px">Técnico <b>${esc(c.n)}</b> prefere <b>${c.form}</b> ${f1 ? "✓" : "✗"} e <b>${STYLES[c.style].n}</b> ${f2 ? "✓" : "✗"}. ${f1 && f2 ? "Encaixe perfeito: bônus máximo!" : f1 || f2 ? "Encaixe parcial: bônus menor." : "Sem bônus de preleção."}</div>`; })() : ""}
      ${m.pres ? `<div class="muted" style="font-size:13px">Presidente: <b style="color:var(--ink)">${esc(STAFF_BY_ID[m.pres].n)}</b> (pênalti ${STAFF_BY_ID[m.pres].pen}) cobra o pênalti presidente.</div>` : ""}
      <div class="grid2" style="gap:10px">
        <label class="f" for="t-form">Formação<select id="t-form" data-mi="${mi}">${Object.keys(FORMS).map(f => `<option ${f === tac.form ? "selected" : ""}>${f}</option>`).join("")}</select></label>
        <label class="f" for="t-style">Estilo de jogo<select id="t-style" data-mi="${mi}">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${k === tac.style ? "selected" : ""}>${v.n}</option>`).join("")}</select></label>
      </div>
      ${lineupBoard(mi, m, tac)}
      <label class="row" for="t-auto" style="gap:8px;font-size:14px"><input id="t-auto" type="checkbox" data-mi="${mi}" ${tac.autoSub !== false ? "checked" : ""}> Substituições automáticas (ilimitadas: quem cansa sai e pode voltar)</label>
      <label class="f" for="t-gkm">Goleiro linha<select id="t-gkm" data-mi="${mi}">${[["auto", "Automático (escalonado até 3x3, dado às vezes, match ball 2x2/1x1)"], ["sempre", "Sempre que der"], ["nunca", "Nunca"]].map(([k, v]) => `<option value="${k}" ${(tac.gkMode || "auto") === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    </div>
    <div style="display:grid;gap:16px;align-content:start">
      <div class="card" style="display:grid;gap:8px">
        <h3 style="font-size:20px">Ordem do escalonado</h3>
        <p class="muted" style="margin:0;font-size:13px">Quem entra primeiro joga o 1x1. Um por minuto até o 7x7.</p>
        ${order.map((id, k) => `<div class="row" style="gap:6px;border:1px solid var(--line);border-radius:10px;padding:6px 8px"><span class="num" style="width:22px;color:var(--gold)">${k + 1}º</span>${posb(P(id).p)}<span style="flex:1">${esc(P(id).n)} <span class="muted">${k}'</span></span>
          <button class="btn sm ghost" data-a="ord" data-mi="${mi}" data-k="${k}" data-d="-1" ${k === 0 ? "disabled" : ""} aria-label="Subir">▲</button><button class="btn sm ghost" data-a="ord" data-mi="${mi}" data-k="${k}" data-d="1" ${k === order.length - 1 ? "disabled" : ""} aria-label="Descer">▼</button></div>`).join("")}
      </div>
      <div class="card" style="display:grid;gap:8px">
        <h3 style="font-size:20px">Estilos</h3>
        <div class="muted" style="font-size:13px;display:grid;gap:4px">
          <div><b>Contra-ataque</b> castiga quem joga de Posse ou Pressão alta.</div>
          <div><b>Bola longa</b> passa por cima da Pressão alta.</div>
          <div><b>Pressão alta</b> rouba de quem tem Posse, mas abre espaço atrás.</div>
          <div><b>Retranca</b> defende muito e ataca pouco. <b>Posse</b> sofre contra Retranca.</div>
        </div>
      </div>
      <div class="card" style="display:grid;gap:8px">
        <h3 style="font-size:20px">Se o jogo for simulado</h3>
        <p class="muted" style="margin:0;font-size:13px">Nos jogos ao vivo você aperta os botões. Na simulação rápida, vale isto:</p>
        <label class="f" for="st-card-${mi}">Carta secreta<select id="st-card-${mi}" data-mi="${mi}" data-k="card">${Object.entries(STRATS).map(([k, v]) => `<option value="${k}" ${m.strat.card === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="f" for="st-pp-${mi}">Pênalti do presidente<select id="st-pp-${mi}" data-mi="${mi}" data-k="pp">${Object.entries(STRATS).map(([k, v]) => `<option value="${k}" ${m.strat.pp === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      </div>
    </div>
  </div>
  ${crestEditor()}`;
}
function tacChange(mi, fn) {
  const m = S.managers[mi]; const tac = JSON.parse(JSON.stringify(m.tac || autoTac(S, mi, "2-3-1", "equilibrado")));
  fn(tac);
  tac.order = tac.order.filter(id => tac.slots.includes(id));
  tac.slots.forEach(id => { if (id != null && !tac.order.includes(id)) tac.order.push(id); });
  if (NET.mode === "client") { m.tac = tac; setLocal(mi, "tac", tac); render(true); }
  act({ t: "tac", tac, mi });
}
function tableView(tb, g) {
  const n = S.managers.length; const se = S.season;
  const cut = se.fmt === "cup" ? (se.bonusGroup == null ? 3 : se.bonusGroup === g ? 4 : 3) : n >= 5 ? Math.min(7, n) : n >= 4 ? 4 : 2;
  const top = se.fmt === "split" ? n >= 5 : se.bonusGroup === g;
  return `<div class="scroll" style="max-height:none"><table class="tbl"><thead><tr><th>#</th><th>Time</th><th>PTS</th><th>J</th><th>V</th><th title="Vitórias nos shootouts (já contadas em V)">V-SO</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th title="Cartões recebidos">🟨🟥</th></tr></thead><tbody>
  ${tb.map((r, k) => `<tr style="${k === cut - 1 || (k === 0 && top) ? "border-bottom:2px solid var(--gold)" : ""}"><td class="num">${k + 1}</td><td>${mgrName(r.i)} <span class="muted" style="font-size:12px">${esc(S.managers[r.i].name)}</span></td><td class="num" style="font-size:20px;color:var(--gold)">${r.pts}</td><td class="num">${r.pj}</td><td class="num">${r.v}</td><td class="num">${r.vso}</td><td class="num">${r.d}</td><td class="num">${r.gf}</td><td class="num">${r.gc}</td><td class="num">${r.gf - r.gc}</td><td class="num">${r.ca}</td></tr>`).join("")}
  </tbody></table><p class="muted" style="padding:0 12px;font-size:12px">Vitória vale 1 ponto, no tempo normal ou nos shootouts; derrota vale 0. Gols de shootout não entram no saldo. Desempate: confronto direto entre os empatados, saldo de gols, menos cartões, gols marcados. ${se.fmt === "cup" ? (se.bonusGroup == null ? "Jogos desafio não contam aqui. O grupo que vencer mais desafios leva 4 vagas (1º direto na semi); o outro leva 3." : se.bonusGroup === g ? "Este grupo venceu mais desafios: 4 vagas, 1º direto na semi." : "3 vagas: o 1º joga as quartas.") : n >= 5 ? `1º direto na semi; 2º ao ${Math.min(7, n)}º disputam as quartas.` : n >= 4 ? "Top 4 vai às semifinais (1º x 4º, 2º x 3º)." : "Top 2 faz a final."}</p></div>`;
}
function fixturesView() {
  const byR = {};
  S.season.fixtures.forEach(f => (byR[f.round] = byR[f.round] || []).push(f));
  return Object.keys(byR).sort((a, b) => b - a).map(r => {
    const fs = byR[r];
    return `<div class="card" style="padding:0;margin-bottom:12px"><div class="row" style="padding:10px 12px;border-bottom:1px solid var(--line)"><b>${fs[0].stage === "Liga" ? `Rodada ${+r + 1}` : fs[0].stage}</b></div>
    ${fs.map(f => { const res = f.res; return `<div class="fx"><div class="h ${res && res.w === 0 ? "w" : ""}">${esc(S.managers[f.h].team)} <span class="dot" style="--c:${S.managers[f.h].color}"></span></div>
      <div class="sc">${res ? `${res.s[0]}<span class="muted">x</span>${res.s[1]}` : `<span class="muted">x</span>`}${res && res.so ? `<div class="muted" style="font-size:12px">shootouts ${res.so[0]}-${res.so[1]}</div>` : ""}</div>
      <div class="${res && res.w === 1 ? "w" : ""}"><span class="dot" style="--c:${S.managers[f.a].color}"></span> ${esc(S.managers[f.a].team)}</div>
      <div>${res ? `<button class="btn sm" data-a="watch" data-id="${f.id}">Lances</button>` : ""}</div></div>`; }).join("")}</div>`;
  }).join("") || `<p class="muted">Nenhum jogo ainda.</p>`;
}
function rostersView() {
  return `<div class="mgrs">${S.managers.map((m, i) => {
    const tac = m.tac; if (!tac) return "";
    const row = (id, tag) => { const p = P(id); return `<div class="row" style="gap:6px;font-size:13.5px"><span class="num" style="color:${p.p === "GOL" ? "var(--blue)" : "var(--gold)"};width:24px">${O(p)}</span>${posb(p.p, p.p2)} ${esc(p.n)} ${tag ? `<span class="pill">${tag}</span>` : ""}</div>`; };
    const used = new Set([tac.gk].concat(tac.slots));
    return `<div class="mgr" style="--c:${m.color}"><div class="t"><span>${esc(m.team)}</span>${m.cpu ? '<span class="pill cpu">bot</span>' : ""}</div>
      <div class="muted" style="font-size:12px">${tac.form} · ${STYLES[tac.style].n} · sobrou ${m.budget} K$</div>
      ${row(tac.gk)}${tac.slots.filter(x => x != null).map(id => row(id)).join("")}${m.roster.filter(id => !used.has(id)).map(id => row(id, "reserva")).join("")}</div>`;
  }).join("")}</div>`;
}
// rankings do campeonato a partir dos resultados das partidas
function seasonStats() {
  const P2 = {}, T2 = {};
  const pl = id => P2[id] = P2[id] || { id, j: 0, g: 0, a: 0, mvp: 0, sv: 0, gc: 0, y: 0, r: 0, ns: 0, nc: 0 };
  S.season.fixtures.forEach(f => {
    const r = f.res; if (!r) return;
    [f.h, f.a].forEach((mi, ti) => {
      const t = T2[mi] = T2[mi] || { mi, j: 0, gf: 0, gc: 0, fouls: 0, y: 0, r: 0 };
      t.j++; t.gf += r.s[ti]; t.gc += r.s[1 - ti]; t.fouls += (r.fouls || [0, 0])[ti]; t.y += (r.yc || [0, 0])[ti]; t.r += (r.rc || [0, 0])[ti];
      (r.pl ? r.pl[ti] : []).forEach(id => { pl(id).j++; if (P(id) && P(id).p === "GOL") pl(id).gc += r.s[1 - ti]; });
      (r.sc ? r.sc[ti] : []).forEach(([id, n]) => pl(id).g += n);
      (r.ast ? r.ast[ti] : []).forEach(([id, n]) => pl(id).a += n);
      (r.svs ? r.svs[ti] : []).forEach(([id, n]) => pl(id).sv += n);
      (r.cl ? r.cl[ti] : []).forEach(([id, c]) => { if (c === "r") pl(id).r++; else pl(id).y++; });
    });
    if (r.mvp) pl(r.mvp).mvp++;
    (r.nt || []).forEach(([id, n]) => { pl(id).ns += n; pl(id).nc++; });
  });
  return { P: Object.values(P2).filter(x => P(x.id)), T: Object.values(T2) };
}
function statsView() {
  const st = seasonStats();
  if (!st.P.length) return `<p class="muted">As estatísticas aparecem depois dos primeiros jogos.</p>`;
  const who = x => { const p = P(x.id), ow = ownerOf(S, x.id); return `${posb(p.p, p.p2)} <b>${esc(p.n)}</b> <span class="muted" style="font-size:12px">${ow >= 0 ? esc(S.managers[ow].team) : ""}</span>`; };
  const box = (title, list, val, unit) => `<div class="card rank"><h4>${title}</h4>${list.length ? list.slice(0, 6).map((x, k) => `<div class="rrow"><span class="num rk">${k + 1}</span><span class="rn">${who(x)}</span><b class="num">${val(x)}</b>${unit ? `<small class="muted">${unit}</small>` : ""}</div>`).join("") : '<p class="muted">—</p>'}</div>`;
  const tbox = (title, list, val, unit) => `<div class="card rank"><h4>${title}</h4>${list.slice(0, 6).map((x, k) => `<div class="rrow"><span class="num rk">${k + 1}</span><span class="rn">${mgrName(x.mi)}</span><b class="num">${val(x)}</b>${unit ? `<small class="muted">${unit}</small>` : ""}</div>`).join("")}</div>`;
  const by = (f, filt) => st.P.filter(filt || (x => f(x) > 0)).sort((a, b) => f(b) - f(a) || P(b.id).o - P(a.id).o);
  const minJ = Math.max(1, Math.floor(Math.max(...st.P.map(x => x.j)) / 2));
  return `<div class="ranks">
    ${box("Artilharia", by(x => x.g), x => x.g, "gols")}
    ${box("Assistências", by(x => x.a), x => x.a, "assist.")}
    ${box("Participações em gol", by(x => x.g + x.a), x => x.g + x.a, "G+A")}
    ${box("Rei dos MVPs", by(x => x.mvp), x => x.mvp, "MVP")}
    ${box("Melhor média", by(x => x.ns / x.nc, x => x.nc >= minJ), x => (x.ns / x.nc).toFixed(1), "nota")}
    ${box("Goleiros: mais defesas", by(x => x.sv, x => P(x.id).p === "GOL" && x.sv > 0), x => x.sv, "defesas")}
    ${box("Goleiros: menos gols por jogo", by(x => -x.gc / x.j, x => P(x.id).p === "GOL" && x.j >= minJ), x => (x.gc / x.j).toFixed(1), "sofridos/jogo")}
    ${box("Cartões", by(x => x.y + x.r * 3), x => `${x.y ? "🟨" + x.y : ""} ${x.r ? "🟥" + x.r : ""}`, "")}
    ${tbox("Melhor ataque", st.T.slice().sort((a, b) => b.gf / b.j - a.gf / a.j), x => (x.gf / x.j).toFixed(1), "gols/jogo")}
    ${tbox("Melhor defesa", st.T.slice().sort((a, b) => a.gc / a.j - b.gc / b.j), x => (x.gc / x.j).toFixed(1), "sofridos/jogo")}
    ${tbox("Mais faltas", st.T.slice().sort((a, b) => b.fouls - a.fouls), x => x.fouls, "faltas")}
    ${tbox("Fair play", st.T.slice().sort((a, b) => (a.y + a.r * 3) - (b.y + b.r * 3)), x => x.y + x.r * 3, "pts de cartão")}
  </div>`;
}
function scorersView() {
  const ts = topScorers(S).slice(0, 20);
  if (!ts.length) return `<p class="muted">Ainda sem gols.</p>`;
  return `<div class="scroll" style="max-height:none"><table class="tbl"><thead><tr><th>#</th><th>Jogador</th><th>Time</th><th>Gols</th></tr></thead><tbody>
  ${ts.map((x, k) => { const p = P(x.id), ow = ownerOf(S, x.id); return `<tr><td class="num">${k + 1}</td><td>${posb(p.p, p.p2)} <b>${esc(p.n)}</b></td><td>${ow >= 0 ? mgrName(ow) : ""}</td><td class="num" style="font-size:20px;color:var(--gold)">${x.n}</td></tr>`; }).join("")}
  </tbody></table></div>`;
}

/* ---------- lances de jogos encerrados ---------- */
async function openReplay(fid) {
  const f = S.season.fixtures.find(x => x.id === fid); if (!f || !f.res) return;
  let evs = EVS[fid];
  if (!evs && NET.db) { try { const d = await NET.db.doc(`mev/${NET.code}-${fid}`).get(); if (d.exists) evs = d.data().ev; EVS[fid] = evs; } catch (e) { } }
  const H = S.managers[f.h], A = S.managers[f.a];
  const icon = e => ({ goal: "⚽", card: "🃏", pp: "👔", penres: "🥅", sores: "🥅", chance: "↗", so: e.ok ? "⚽" : "✖", end: "🏁", phase: "⏱", dice: "🎲", foul: "🦶", inj: "🩹", yellow: "🟨", red: "🟥", sub: "⇄", tac: "📋", info: "•" }[e.type] || "•");
  $("#viewer").innerHTML = `<div class="vbox">
    <div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="phase">${esc(f.stage === "Liga" ? `Rodada ${f.round + 1}` : f.stage)}</span><button class="btn sm" data-a="vclose">Fechar</button></div>
    <div class="board"><div class="tn" style="color:${H.color}">${esc(H.team)}<small>pres. ${esc(H.name)}</small></div>
    <div><div class="score num">${f.res.s[0]}<span class="muted">:</span>${f.res.s[1]}</div>${f.res.so ? `<div class="muted num" style="text-align:center">shootouts ${f.res.so[0]}-${f.res.so[1]}</div>` : ""}</div>
    <div class="tn" style="text-align:right;color:${A.color}">${esc(A.team)}<small>pres. ${esc(A.name)}</small></div></div>
    <p class="muted" style="font-size:13px">Cartas: ${esc(H.team)} tinha <b>${cardNames(f.res.cards[0])}</b>, ${esc(A.team)} tinha <b>${cardNames(f.res.cards[1])}</b>.${f.res.yc ? ` Cartões: 🟨 ${f.res.yc[0]}x${f.res.yc[1]} · 🟥 ${f.res.rc[0]}x${f.res.rc[1]}.` : ""}${f.res.mvp ? ` MVP: <b>${esc(P(f.res.mvp).n)}</b>.` : ""} Finalizações ${f.res.shots[0]} x ${f.res.shots[1]}.</p>
    <div class="feed">${evs ? evs.filter(e => e.text).map(e => `<div class="ev k-${e.type}" style="--c:${e.team === 0 ? H.color : e.team === 1 ? A.color : "#555"}"><div class="m num">${e.m >= 36 && (e.type === "so") ? "SO" : Math.floor(e.m) + "'"}</div><div class="ic">${icon(e)}</div><div class="t">${esc(e.text)}${e.type === "goal" ? ` <span class="muted num">${e.s[0]}-${e.s[1]}</span>` : ""}</div></div>`).join("") : `<p class="muted">Os lances deste jogo não estão salvos.</p>`}</div></div>`;
  $("#viewer").classList.add("on"); document.body.style.overflow = "hidden";
}
function closeReplay() { $("#viewer").classList.remove("on"); document.body.style.overflow = ""; }

/* ---------- render principal ---------- */
function stepper(k, label, v, min, max, step, on) {
  return `<div class="f"><span>${label}</span><div class="stepper"><button class="btn sm" data-a="stp" data-k="${k}" data-d="${-step}" data-min="${min}" data-max="${max}" ${on && v > min ? "" : "disabled"} aria-label="Diminuir">−</button><b class="num">${v}</b><button class="btn sm" data-a="stp" data-k="${k}" data-d="${step}" data-min="${min}" data-max="${max}" ${on && v < max ? "" : "disabled"} aria-label="Aumentar">+</button></div></div>`;
}
function readSettings() {
  const sv = id => { const el = $(id); return el ? el.value : undefined; };
  return { t: "settings", v: { hide: sv("#s-hide"), fmt: sv("#s-fmt"), year: sv("#s-year") === "1", staff: sv("#s-staff"), trades: sv("#s-trades"), career: sv("#s-career") === "1" } };
}
function editing(box) {
  const ae = document.activeElement;
  if (!ae || ae === document.body || (box && !box.contains(ae))) return false;
  if (ae.tagName === "SELECT") return true;
  if (ae.tagName === "INPUT" && ["color", "number"].includes(ae.type)) return true;
  if (ae.tagName === "INPUT" && ae.type === "text" && !["q", "mq"].includes(ae.id)) return true;
  return false;
}
function setLocal(mi, field, v) { UI.local = UI.local || {}; (UI.local[mi] = UI.local[mi] || {})[field] = { v: JSON.parse(JSON.stringify(v)), until: Date.now() + 6000 }; }
function applyLocalOverrides() {
  if (!UI.local || !S) return;
  Object.entries(UI.local).forEach(([mi, fields]) => {
    const m = S.managers[+mi]; if (!m) return;
    Object.entries(fields).forEach(([f, o]) => {
      if (Date.now() > o.until || JSON.stringify(m[f]) === JSON.stringify(o.v)) delete fields[f];
      else m[f] = JSON.parse(JSON.stringify(o.v));
    });
  });
}
function render(force) {
  if (!force && editing($("#app"))) { UI.pendingRender = true; return; }
  UI.pendingRender = false;
  const ae = document.activeElement, aid = ae && ae.id, ss = ae && ae.selectionStart;
  const keepVal = ae && ae.tagName === "INPUT" && ae.type === "text" ? ae.value : null;
  let body;
  if (!S) body = viewHome();
  else if (S.phase === "lobby") body = viewLobby();
  else if (S.phase === "auction" || (S.phase === "wc" && S.auction)) body = viewAuction();
  else if (S.phase === "wc") body = viewWC();
  else if (S.phase === "lottery") body = viewLottery();
  else if (S.phase === "draft") body = viewDraft();
  else if (S.phase === "staff") body = viewStaff();
  else if (S.phase === "trade") body = viewTrade();
  else if (S.phase === "keep") body = viewKeep();
  else body = viewSeason();
  $("#app").innerHTML = header() + `<main class="wrap">${body}</main>`;
  if (aid) { const el = document.getElementById(aid); if (el) { if (keepVal != null) el.value = keepVal; el.focus(); try { if (ss != null && el.setSelectionRange) el.setSelectionRange(ss, ss); } catch (e) { } } }
  tickClocks(); renderChat();
}
/* ---------- chat da sala ---------- */
const QUICK = ["Boa!", "Que golaço!", "Roubado!", "Bora!", "Sem chance 😂", "GG"];
function chatMi() { return NET.mode === "local" ? (humansIdx()[0] != null ? humansIdx()[0] : -1) : myMi(); }
function renderChat() {
  let box = document.getElementById("chat");
  if (!S || NET.mode === "local") { if (box) box.style.display = "none"; return; }
  if (!box) { box = document.createElement("div"); box.id = "chat"; box.className = "chat"; document.body.appendChild(box);
    box.innerHTML = `<button class="chatbtn" data-a="chattog" aria-label="Chat da sala">💬<span id="chatn" class="chatn"></span></button><div class="chatpanel" id="chatpanel"><div class="chatlist" id="chatlist" aria-live="polite"></div>
      <div class="chatq">${QUICK.map(q => `<button class="btn sm ghost" data-a="chatq" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      <form id="chatform" class="row" style="gap:6px;flex-wrap:nowrap"><input id="chat-in" type="text" maxlength="140" placeholder="Mensagem para a sala…" autocomplete="off" style="flex:1"><button class="btn sm gold" type="submit">Enviar</button></form></div>`;
    box.querySelector("#chatform").addEventListener("submit", ev => { ev.preventDefault(); const i = $("#chat-in"); const v = i.value.trim(); if (v) { sendChat(v); i.value = ""; } });
  }
  box.style.display = "";
  const msgs = S.chat || [], last = msgs.length ? msgs[msgs.length - 1].i : 0;
  box.classList.toggle("open", !!UI.chatOpen);
  if (UI.chatOpen) UI.chatSeen = last;
  const unread = Math.max(0, msgs.filter(m => m.i > (UI.chatSeen || 0)).length);
  $("#chatn").textContent = unread ? unread : ""; $("#chatn").style.display = unread ? "" : "none";
  const sig = last + ":" + msgs.length;
  if (UI.chatSig !== sig) { UI.chatSig = sig; const l = $("#chatlist"); l.innerHTML = msgs.map(m => `<div class="cmsg"><b style="color:${m.c}">${esc(m.n)}</b> ${esc(m.txt)}</div>`).join("") || '<p class="muted" style="margin:0">Ninguém falou nada ainda.</p>'; l.scrollTop = l.scrollHeight;
    const nw = msgs.filter(m => m.i > (UI.chatToast || 0) && m.mi !== myMi()); if (UI.chatToast != null && nw.length && !UI.chatOpen) toast(`💬 ${nw[nw.length - 1].n}: ${nw[nw.length - 1].txt}`); UI.chatToast = last; }
}
function sendChat(txt) { const mi = chatMi(); if (mi < 0) return; if (NET.mode === "client") { S.chat = (S.chat || []).concat({ i: (S.chatN || 0) + 0.5, mi, n: S.managers[mi].name, c: S.managers[mi].color, txt }); UI.chatSig = null; renderChat(); } act({ t: "chat", txt, mi }); }

document.addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const a = b.dataset.a;
  if (a === "create") return createOnline();
  if (a === "join") return joinOnline();
  if (a === "local") return startLocal();
  if (a === "lpadd") { const lp = $("#lp"); if (lp.children.length < 12) { const i = document.createElement("input"); i.className = "lp-name"; i.type = "text"; i.maxLength = 18; i.id = "lp" + lp.children.length; i.placeholder = "Jogador " + (lp.children.length + 1); lp.appendChild(i); i.focus(); } return; }
  if (a === "leave") return leave();
  if (a === "copyinvite") { const url = location.origin + location.pathname + "?sala=" + S.code; try { navigator.clipboard.writeText(url).then(() => toast("Link copiado!"), () => prompt("Copie o link:", url)); } catch (e) { prompt("Copie o link:", url); } return; }
  if (a === "rejoin") { if (NET.joinInfo) { NET.lastJoin = Date.now(); sendIntent({ t: "join", name: NET.joinInfo.name, team: NET.joinInfo.team }); toast("Pedido reenviado."); render(); } return; }
  if (a === "kick") return act({ t: "kick", mi: +b.dataset.mi });
  if (a === "editme") return act({ t: "editme", team: $("#me-team").value.trim() });
  const val = id => { const el = $(id); return el ? +el.value : undefined; };
  const sv = id => { const el = $(id); return el ? el.value : undefined; };
  const settings = () => readSettings();
  if (a === "setmode") { act(settings()); return act({ t: "settings", v: { mode: b.dataset.v } }); }
  if (a === "wcadd") { const mi = +b.dataset.mi, id = +b.dataset.id; const d = UI.wcd[mi] = UI.wcd[mi] || {}; const need = wcLeft(S, S.managers[mi]); if (Object.keys(d).length >= need) { toast(`Você só tem ${need} vaga${need > 1 ? "s" : ""} de wild card.`); return; } d[id] = Math.max(1, hid() ? 5 : Math.round(P(id).v)); return render(); }
  if (a === "wcdel") { const d = UI.wcd[+b.dataset.mi] || {}; delete d[+b.dataset.id]; return render(); }
  if (a === "wcsend") { const mi = +b.dataset.mi; const d = UI.wcd[mi] || {}; if (!wcValid(S, mi, d)) { toast("Propostas inválidas: confira o total e as vagas."); return; } act({ t: "wcbids", bids: d, mi }); UI.wcsent[S.wc.round + "-" + mi] = true; return render(); }
  if (a === "wcedit") { delete UI.wcsent[S.wc.round + "-" + (+b.dataset.mi)]; return render(); }
  if (a === "wcmi") { UI.wcMi = +b.dataset.mi; return render(); }
  if (a === "wcclose") return act({ t: "wcclose" });
  if (a === "ttog") { const side = b.dataset.side, id = +b.dataset.id; const l = UI.tr[side]; const k = l.indexOf(id); if (k >= 0) l.splice(k, 1); else l.push(id); return render(); }
  if (a === "tfrom") { UI.tr = { from: +b.dataset.mi, to: null, give: [], get: [], cf: 0, ct: 0 }; return render(); }
  if (a === "tto") { UI.tr.to = +b.dataset.mi; UI.tr.get = []; UI.tr.ct = 0; return render(); }
  if (a === "tsend") { const cf = +($("#t-cf") || {}).value || 0, ct = +($("#t-ct") || {}).value || 0; const o = { to: UI.tr.to, give: UI.tr.give.slice(), get: UI.tr.get.slice(), cf, ct }; act({ t: "tprop", o, mi: UI.tr.from }); UI.tr.give = []; UI.tr.get = []; UI.tr.cf = 0; UI.tr.ct = 0; toast("Proposta enviada."); return render(); }
  if (a === "tresp") return act({ t: "tresp", id: b.dataset.id, ok: b.dataset.ok === "1", mi: +b.dataset.mi });
  if (a === "tcancel") return act({ t: "tcancel", id: b.dataset.id, mi: +b.dataset.mi });
  if (a === "tclose" || a === "keepclose") return act({ t: a });
  if (a === "kpmi") { UI.kpMi = +b.dataset.mi; return render(); }
  if (a === "kptog") { const mi = +b.dataset.mi, id = +b.dataset.id, kind = b.dataset.kind; const d = UI.kp[mi]; const other = kind === "wc" ? "keep" : "wc"; d[other] = d[other].filter(x => x !== id); const l = d[kind], k = l.indexOf(id); if (k >= 0) l.splice(k, 1); else { const max = kind === "wc" ? S.keep.maxWC : S.keep.maxKeep; if (l.length >= max) { toast(`Máximo de ${max}.`); return; } l.push(id); } return render(); }
  if (a === "kpsend") { const mi = +b.dataset.mi; return act({ t: "keep", k: UI.kp[mi], mi }); }
  if (a === "dsel") { UI.dsel = +b.dataset.id; return render(); }
  if (a === "dpick") { const mi = NET.mode === "local" ? draftPicker(S) : myMi(); const pid = UI.dsel; UI.dsel = null; return act({ t: "dpick", pid, mi }); }
  if (a === "savesettings") return act(settings());
  if (a === "stp") { const k = b.dataset.k, cur = +(S.settings[k] != null ? S.settings[k] : (k === "tmin" ? 1 : 0)); const nv = Math.max(+b.dataset.min, Math.min(+b.dataset.max, cur + +b.dataset.d)); if (nv === cur) return; return act({ t: "settings", v: { [k]: nv } }); }
  if (a === "start") { act(settings()); return act({ t: "start" }); }
  if (a === "bid") { optimistic("bid", +b.dataset.mi, +b.dataset.amt); return act({ t: "bid", amount: +b.dataset.amt, mi: +b.dataset.mi }); }
  if (a === "pass") { optimistic("pass", +b.dataset.mi); return act({ t: "pass", mi: +b.dataset.mi }); }
  if (a === "pause" || a === "autofill" || a === "quickround" || a === "simstage") return act({ t: a });
  if (a === "ready") { const mi = +b.dataset.mi, fid = b.dataset.fid; if (NET.mode === "client" && S.season && S.season.rs) { S.season.rs.ready[fid + ":" + mi] = true; UI.optReady = { k: fid + ":" + mi, until: Date.now() + 6000 }; } act({ t: "ready", fid, mi }); b.disabled = true; b.textContent = "Pronto ✓"; return updateRoundBoard(); }
  if (a === "watch2") return setWatch(b.dataset.fid);
  if (a === "react") { const t = Date.now(); if (t - (UI.lastReact || 0) < 900) return; UI.lastReact = t; return act({ t: "m", a: { t: "mreact", e: b.dataset.e }, mi: NET.mode === "local" ? humansIdx()[0] : myMi() }); }
  if (a === "tab") { UI.tab = b.dataset.tab; return render(); }
  if (a === "editmi") { UI.editMi = +b.dataset.mi; return render(); }
  if (a === "crestmi") { UI.crestMi = +b.dataset.mi; return render(); }
  if (a === "vote") { const mi = +b.dataset.mi, v = b.dataset.v === "1"; if (NET.mode === "client") { S.votes = S.votes || {}; S.votes[mi] = v; render(true); } return act({ t: "vote", v, mi, next: !!S.settings.career }); }
  if (a === "relobby") return act({ t: "relobby" });
  if (a === "lu") return luTap(+b.dataset.mi, b.dataset.k);
  if (a === "chattog") { UI.chatOpen = !UI.chatOpen; renderChat(); if (UI.chatOpen) setTimeout(() => { const i = $("#chat-in"); if (i) i.focus(); }, 50); return; }
  if (a === "chatq") return sendChat(b.dataset.q);
  if (a === "fasign" || a === "farel") return act({ t: a, id: +b.dataset.id, mi: +b.dataset.mi });
  if (a === "nextseason") return act({ t: "nextseason" });
  if (a === "replay") { if (LV.lastGoal) { LV.replay = { frames: LV.lastGoal.frames, i: 0 }; } return; }
  if (a === "kittab") { UI.kitTab = +b.dataset.v; return render(true); }
  if (a === "kitinvert") { const m = S.managers[+b.dataset.mi]; const k = m.kit || {}; return setKit(+b.dataset.mi, { c1: k.c2 || "#111111", c2: k.c1 || "#f5c542", pat: k.pat || "liso", num: k.c1 || "#ffffff" }); }
  if (a === "kitfromcrest") { const m = S.managers[+b.dataset.mi]; const c = m.crest || {}; return setKit(+b.dataset.mi, { c1: c.c1 || "#f5c542", c2: c.c2 || "#111111" }); }
  if (a === "crestpre") { const p = CREST_PRESETS[+b.dataset.k]; return setCrest(+b.dataset.mi, { shape: p.shape, c1: p.c1, c2: p.c2, pat: p.pat, icon: p.icon }); }
  if (a === "ord") { const mi = +b.dataset.mi, k = +b.dataset.k, d = +b.dataset.d; return tacChange(mi, tac => { const o = tac.order.filter(id => tac.slots.includes(id)); const j = k + d; if (j < 0 || j >= o.length) return; [o[k], o[j]] = [o[j], o[k]]; tac.order = o; }); }
  if (a === "watch") return openReplay(b.dataset.id);
  if (a === "vclose") return closeReplay();
  if (a === "showlive") { const ms = Object.values(LIVES); const M = ms.find(x => x.status === "playing" && myLiveTeams(x)) || ms.find(x => x.status === "playing") || ms[0]; if (M) setWatch(M.fid); return; }
  if (a === "hidelive" || a === "closelive") { UI.dismiss = UI.dismiss || {}; if (UI.watch) UI.dismiss[UI.watch] = true; UI.watch = null; LIVE = null; return renderLive(true); }
  // ao vivo
  if (a === "lcard") return act({ t: "m", a: { t: "mcard", ti: +b.dataset.ti, idx: +b.dataset.idx }, mi: liveMi(+b.dataset.ti) });
  if (a === "lpp") return act({ t: "m", a: { t: "mpp", ti: +b.dataset.ti }, mi: liveMi(+b.dataset.ti) });
  if (a === "lstyle") return act({ t: "m", a: { t: "mstyle", style: b.dataset.v, ti: +b.dataset.ti }, mi: liveMi(+b.dataset.ti) });
  if (a === "lsubpick") { const ti = +b.dataset.ti, id = +b.dataset.id; LV.subSel = LV.subSel || {}; if (b.dataset.side === "f") { LV.subSel[ti] = LV.subSel[ti] === id ? null : id; return renderCtrl(true); } const o = LV.subSel[ti]; if (!o) { toast("Primeiro toque em quem sai."); return; } LV.subSel[ti] = null; act({ t: "m", a: { t: "msub", out: o, in: id, ti }, mi: liveMi(ti) }); return renderCtrl(true); }
  if (a === "lsub") { const ti = +b.dataset.ti; const o = +$("#sub-out-" + ti).value, i = +$("#sub-in-" + ti).value; if (!o || !i) return; return act({ t: "m", a: { t: "msub", out: o, in: i, ti }, mi: liveMi(ti) }); }
  if (a === "lchoice") { UI.gate = null; return act({ t: "m", a: { t: "mchoice", f: b.dataset.f, v: b.dataset.f === "val" ? b.dataset.v : +b.dataset.v, ti: +b.dataset.ti }, mi: liveMi(+b.dataset.ti) }); }
  if (a === "lgate") { UI.gate = b.dataset.k; return renderLive(true); }
  if (a === "lspeed") { UI.speed = +b.dataset.v; return act({ t: "lspeed", v: +b.dataset.v }); }
  if (a === "lpause" || a === "lff") return act({ t: a });
});
function liveMi(ti) { return LIVE ? LIVE.t[ti].mi : -1; }
document.addEventListener("input", e => {
  const el = e.target;
  if (el.classList && el.classList.contains("wcamt")) { const d = UI.wcd[+el.dataset.mi] = UI.wcd[+el.dataset.mi] || {}; d[+el.dataset.id] = Math.max(1, Math.floor(+el.value || 1)); clearTimeout(UI._wct); UI._wct = setTimeout(render, 600); }
  if (el.id === "mq") { UI.mq = el.value; clearTimeout(UI._mqt); UI._mqt = setTimeout(render, 250); }
});
document.addEventListener("change", e => {
  const el = e.target, id = el.id;
  if (id === "mpos") { UI.mpos = el.value; return render(); }
  if (id && id.startsWith("st-")) { const mi = +el.dataset.mi; if (NET.mode === "client" && S.managers[mi]) { const st = Object.assign({}, S.managers[mi].strat, { [el.dataset.k]: el.value }); S.managers[mi].strat = st; setLocal(mi, "strat", st); } return act({ t: "strat", [el.dataset.k]: el.value, mi }); }
  if (["s-fmt", "s-year", "s-staff", "s-trades", "s-hide", "s-career"].includes(id) && isHost()) return act(readSettings());
  if (id === "c-stars") return setCrest(+el.dataset.mi, { stars: +el.value });
  if (id === "k-c1" || id === "k-c2" || id === "k-num" || id === "k-pat") return setKit(+el.dataset.mi, { [id.slice(2)]: el.value });
  if (id === "c-shape" || id === "c-pat" || id === "c-icon" || id === "c-c1" || id === "c-c2" || id === "c-c3" || id === "c-tc" || id === "c-txt") return setCrest(+el.dataset.mi, { [id.slice(2) === "shape" ? "shape" : id.slice(2)]: id === "c-txt" ? el.value.toUpperCase().slice(0, 3) : el.value });
  if (id === "t-auto") return tacChange(+el.dataset.mi, tac => { tac.autoSub = el.checked; });
  if (id === "t-gkm") return tacChange(+el.dataset.mi, tac => { tac.gkMode = el.value; });
  if (id === "t-form") return tacChange(+el.dataset.mi, tac => { tac.form = el.value; tac.slots = autoTac(S, +el.dataset.mi, el.value, tac.style, tac.gk).slots; });
  if (id === "t-style") return tacChange(+el.dataset.mi, tac => { tac.style = el.value; });
  if (id === "t-gk") return tacChange(+el.dataset.mi, tac => { const nv = +el.value; const s = tac.slots.indexOf(nv); if (s >= 0) tac.slots[s] = tac.gk; tac.gk = nv; });
  if (id && id.startsWith("t-s")) return tacChange(+el.dataset.mi, tac => { const i = +el.dataset.slot, nv = +el.value, old = tac.slots[i]; const j = tac.slots.indexOf(nv); if (j >= 0) { tac.slots[j] = old; tac.slots[i] = nv; } else { tac.slots[i] = nv; const oi = tac.order.indexOf(old); if (oi >= 0) tac.order[oi] = nv; } });
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#viewer").classList.contains("on")) closeReplay(); });

function boot(saved) {
  try {
    const raw = saved && saved.S ? saved.S : JSON.parse(sessionStorage.getItem("kl_local2") || "null");
    if (raw && raw.mode === "local" && raw.v === 2) { S = raw; setPov(S.pov); NET.mode = "local"; NET.code = "LOCL"; startLoop(); }
  } catch (e) { }
  render(); initLive();
}
try { window.claude && window.claude.hot && window.claude.hot.snapshot(() => (NET.mode === "local" ? { S } : {})); } catch (e) { }

document.addEventListener("change", e => { const t = e.target; if (t && (t.tagName === "SELECT" || t.type === "color")) { try { t.blur(); } catch (x) { } } }, true);
document.addEventListener("focusout", () => setTimeout(() => {
  if (UI.pendingRender && !editing($("#app"))) render();
  if (typeof LV !== "undefined" && LV.ctrlPending && !editing($("#l-ctrl"))) { LV.ctrlPending = false; renderCtrl(true); }
}, 40));
