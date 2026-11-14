// Confere regras da partida: gol dobro da carta só em gol de bola rolando, PP sempre 1, match ball oficial
const E = require('../src/engine.js'); E.setPlayers(require('../src/players.json'));
let now = 1e12; const S = E.newGame('ABCD','h1','V','F','online');
E.applyAction(S,{t:'settings',v:{total:8,squad:10}},0,true,now); E.applyAction(S,{t:'start'},0,true,now);
let g=0; while(S.phase!=='season'&&g++<200000){now+=400;E.marketTick(S,now); if(S.phase==='trade')E.applyAction(S,{t:'tclose'},0,true,now); if(S.phase==='auction'&&g%50==0)E.applyAction(S,{t:'autofill'},0,true,now);}
const f = E.roundFixtures(S)[0], f0 = f;
let goals=0, n=400, bad=[], mbSeq={}, mbCards=0, dobGoals={gol:0,other2:0}, so5=0, cards={};
for (let i=0;i<n;i++){
  const M = E.newMatch(S,f); E.attachRosters(S,M);
  let k=0; while(M.status==='playing'&&k++<20000){ E.stepMatch(M, Date.now(), true); }
  goals += M.score[0]+M.score[1];
  M.ev.forEach(e=>{
    if(e.type==='goal' && e.v===2 && e.m>=0 && !(e.m>=17&&e.m<20) && !['gol','vazio','falta','penf'].includes(e.kind)) bad.push(e.kind+'@'+e.m);
    if(e.type==='goal' && e.kind==='pp' && e.v!==1) bad.push('pp '+e.v);
    if(e.ph==='mbn') mbSeq[e.text.slice(0,40)]=1;
    if((e.type==='yellow'||e.type==='red') && /match ball/.test(e.text)) mbCards++;
    if(e.type==='card') cards[e.card]=(cards[e.card]||0)+1;
  });
  if(M.soKicks && M.soKicks[0]>=5) so5++;
}
console.log('gols/jogo', (goals/n).toFixed(2), 'erros gol dobro/PP:', bad.length? bad.slice(0,5):'nenhum');
console.log('cartões no match ball:', mbCards, '| shootouts com 5+ cobranças:', so5);
console.log('cartas ativadas:', JSON.stringify(cards));
console.log(Object.keys(mbSeq).join(' | '));
{ // faltas
  let f=0,pen=0,fk=0,n2=200,gl=0;
  for(let i=0;i<n2;i++){ const M=E.newMatch(S,f0); E.attachRosters(S,M); let k=0; while(M.status==='playing'&&k++<20000) E.stepMatch(M,Date.now(),true);
    f+=(M.t[0].fouls||0)+(M.t[1].fouls||0); M.ev.forEach(e=>{ if(e.type==='foul'&&/PÊNALTI/.test(e.text)) pen++; if(e.type==='goal'&&e.kind==='falta') fk++; }); }
  console.log('faltas/jogo', (f/n2).toFixed(1), 'pênaltis de falta/jogo', (pen/n2).toFixed(2), 'gols de falta/jogo', (fk/n2).toFixed(2));
}
