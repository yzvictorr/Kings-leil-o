// Modo carreira: lesões, evolução, premiação e nova temporada
const E = require('../src/engine.js'); E.setPlayers(require('../src/players.json'));
let now=1e12; const S=E.newGame('ABCD','h1','V','F','online');
E.applyAction(S,{t:'settings',v:{total:6,squad:9,career:true}},0,true,now); E.applyAction(S,{t:'start'},0,true,now);
let g=0; while(S.phase!=='season'&&g++<200000){now+=400;E.marketTick(S,now); if(S.phase==='trade')E.applyAction(S,{t:'tclose'},0,true,now); if(S.phase==='auction'&&g%50==0)E.applyAction(S,{t:'autofill'},0,true,now);}
const play = () => { let k=0, injSeen=0; while(S.phase==='season'&&k++<100){ E.roundFixtures(S).filter(f=>!f.res).forEach(f=>{ const M=E.simMatchInstant(S,f); f.res=E.matchResult(M); }); E.advanceRound(S); injSeen=Math.max(injSeen,Object.keys(S.season.inj||{}).length); if(S.phase==='trade') E.applyAction(S,{t:'tclose'},0,true,now);} return injSeen; };
for (let y=1;y<=3;y++){
  const inj = play();
  console.log('temporada', S.career?S.career.year:1, 'fim:', S.phase, 'campeão', S.season.champion, 'max lesionados ao mesmo tempo', inj, 'títulos na sala', (S.hall||{titles:[]}).titles.length);
  const before = S.managers[0].budget;
  E.applyAction(S,{t:'nextseason'},0,true,now);
  console.log('  -> fase', S.phase, 'ano', S.career.year, 'evoluíram', S.career.lastEvo.length, 'ex', JSON.stringify(S.career.lastEvo.slice(0,3)), 'saldo', before,'->',S.managers[0].budget, 'agentes livres', E.freeAgents(S).length);
  const fa = E.freeAgents(S)[0]; E.applyAction(S,{t:'fasign',id:fa},0,false,now); E.applyAction(S,{t:'farel',id:S.managers[0].roster[0]},0,false,now);
  E.applyAction(S,{t:'tclose'},0,true,now);
}
