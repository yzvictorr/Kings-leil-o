const fs = require("fs"); const path = require("path");
const E = require(path.join(__dirname, "../src/engine.js"));
E.setPlayers(JSON.parse(fs.readFileSync(path.join(__dirname, "../src/players.json"))));
const S = E.newGame("TEST", "p0", "Ana", "Reis FC", "online");
S.managers.push(Object.assign({}, S.managers[0], { pid: "p1", name: "Bia", team: "Rainhas", crest: Object.assign({}, S.managers[0].crest), champ: undefined }));
S.season = { fixtures: [], fmt: "split" };
const ok = (c, m) => { if (!c) { console.error("FALHOU: " + m); process.exit(1); } };
E.applyAction(S, { t: "editme", crest: Object.assign({}, S.managers[0].crest, { sa: "auto", stars: 5 }) }, 0, true, Date.now());
ok(S.managers[0].crest.stars === 0, "auto stars começa em 0 no save novo");
E.hallTitle(S, 0, "Split"); ok(S.managers[0].crest.stars === 1 && S.managers[0].champ.comp === "Split", "1 Split");
E.hallTitle(S, 0, "Kings Cup"); ok(S.managers[0].crest.stars === 2 && S.managers[0].crest.scup === 1, "Cup prateada");
E.hallTitle(S, 1, "Split"); ok(!S.managers[0].champ || S.managers[0].champ.comp !== "Split", "selo do Split passou");
ok(S.managers[1].champ.comp === "Split", "novo campeão tem selo");
console.log("ok v19");
// assumir bot no meio do campeonato
{ const S2 = E.newGame("T2", "h", "Host", "Host FC", "online"); S2.managers.push(Object.assign({}, S2.managers[0], { pid: "bot1", name: "Bot", team: "Robôs", cpu: true })); S2.phase = "season";
  ok(E.applyAction(S2, { t: "takebot", mi: 1, pid: "novo", name: "Zé" }, -1, false, Date.now()), "assumiu bot");
  ok(!S2.managers[1].cpu && S2.managers[1].pid === "novo" && S2.managers[1].team === "Robôs", "time herdado");
  ok(!E.applyAction(S2, { t: "takebot", mi: 0, pid: "outro", name: "X" }, -1, false, Date.now()), "não assume humano");
  console.log("ok takebot"); }
// lance inválido (NaN) não pode entrar no leilão
{ const S3 = E.newGame("T3", "h", "Host", "Host FC", "online"); S3.managers.push(Object.assign({}, S3.managers[0], { pid: "x2", name: "X", team: "X FC" })); let t3 = Date.now();
  E.applyAction(S3, { t: "settings", v: { total: 2, squad: 7 } }, 0, true, t3); E.applyAction(S3, { t: "start" }, 0, true, t3);
  for (let i = 0; i < 40 && !(S3.auction && S3.auction.lot); i++) { t3 += 500; E.marketTick(S3, t3); }
  if (S3.auction && S3.auction.lot) { const b0 = S3.auction.lot.bid; E.applyAction(S3, { t: "bid", amt: 5 }, 0, true, t3); E.applyAction(S3, { t: "bid", amount: "abc" }, 1, true, t3); ok(S3.auction.lot.bid === b0 && Number.isFinite(S3.auction.lot.bid), "lance inválido recusado"); }
  console.log("ok lance inválido"); }
