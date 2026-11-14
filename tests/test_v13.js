const E = require('../src/engine.js'); E.setPlayers(require('../src/players.json'));
let now = 1e12; const S = E.newGame('V13', 'h1', 'V', 'F', 'online');
E.applyAction(S, { t: 'settings', v: { total: 4, squad: 9, career: true, trades: 'antes', tmin: 3 } }, 0, true, now); E.applyAction(S, { t: 'start' }, 0, true, now);
let g = 0; while (S.phase !== 'trade' && S.phase !== 'season' && g++ < 200000) { now += 400; E.marketTick(S, now); if (S.phase === 'auction' && g % 50 == 0) E.applyAction(S, { t: 'autofill' }, 0, true, now); }
console.log('fase', S.phase);
for (let k = 0; k < 200 && S.phase === 'trade'; k++) { now += 1000; E.marketTick(S, now); }
const bo = (S.trade ? S.trade.offers : []).filter(o => o.bot);
console.log('propostas de bots recebidas:', bo.length, bo.slice(0, 2).map(o => `${S.managers[o.from].team} dá ${o.give} +${o.cf} por ${o.get}`));
if (S.phase === 'trade') E.applyAction(S, { t: 'tclose' }, 0, true, now);
// cobrador oficial
const m = S.managers[0]; const pk = m.roster.find(id => !m.tac.slots.includes(id) && id !== m.tac.gk) || m.tac.slots[2];
console.log('pk antes', m.tac.pk);
const play = () => { let k = 0; while (S.phase === 'season' && k++ < 100) { E.roundFixtures(S).filter(f => !f.res).forEach(f => { const M = E.simMatchInstant(S, f); f.res = E.matchResult(M); }); E.advanceRound(S); if (S.phase === 'trade') E.applyAction(S, { t: 'tclose' }, 0, true, now); } };
play();
console.log('recordes', JSON.stringify(S.hall.rec));
E.applyAction(S, { t: 'nextseason' }, 0, true, now);
console.log('insatisfeitos', JSON.stringify(S.career.unhappy));
// ordem do draft na revanche
const S2 = E.newGame('DR', 'h1', 'V', 'F', 'online'); E.applyAction(S2, { t: 'join', pid: 'p2', name: 'A', team: 'B' }, -1, true, now); E.applyAction(S2, { t: 'join', pid: 'p3', name: 'C', team: 'D' }, -1, true, now);
E.applyAction(S2, { t: 'settings', v: { total: 4, squad: 8, mode: 'draft' } }, 0, true, now); E.applyAction(S2, { t: 'start' }, 0, true, now);
g = 0; while (S2.phase !== 'season' && g++ < 100000) { now += 400; E.marketTick(S2, now); if (S2.phase === 'trade') E.applyAction(S2, { t: 'tclose' }, 0, true, now); }
let k = 0; while (S2.phase === 'season' && k++ < 100) { E.roundFixtures(S2).filter(f => !f.res).forEach(f => { const M = E.simMatchInstant(S2, f); f.res = E.matchResult(M); }); E.advanceRound(S2); }
E.resetToLobby(S2); console.log('lastOrder', S2.lastOrder);
E.applyAction(S2, { t: 'start' }, 0, true, now); g = 0; while (S2.phase !== 'lottery' && g++ < 2000) { now += 400; E.marketTick(S2, now); }
console.log('draft byTable', S2.draft && S2.draft.byTable, 'ordem', S2.draft && S2.draft.order.map(i => S2.managers[i].pid || S2.managers[i].team));
