const E = require('../src/engine.js');
const players = require('../src/players.json'); E.setPlayers(players);
function run(opts){
  let now = 1e12;
  const S = E.newGame('ABCD','h1','Victor','Fatec FC','online');
  E.applyAction(S,{t:'settings',v:opts},0,true,now);
  E.applyAction(S,{t:'start'},0,true,now);
  let g=0, log=[];
  while(!(S.phase==='done' && (!S.settings.year || S.yearDone)) && g++<400000){
    now+=400;
    const ph=S.phase;
    if(ph==='staff'||ph==='auction'||ph==='wc'||ph==='lottery'||ph==='draft'){
      if(ph==='staff' && S.staffA.lot && S.staffA.lot.bidder!==0 && Math.random()<0.05) E.applyAction(S,{t:'pass'},0,false,now);
      if(ph==='auction' && S.auction.lot && S.auction.lot.bidder!==0 && Math.random()<0.05) E.applyAction(S,{t:'pass'},0,false,now);
      if(ph==='wc' && !S.auction && !S.wc.sub.includes(0)) E.applyAction(S,{t:'wcbids',bids:{}},0,false,now);
      if(ph==='auction' && Math.random()<0.001) E.applyAction(S,{t:'autofill'},0,true,now);
      E.marketTick(S,now);
    } else if(ph==='trade'){
      // human proposes something to bot 1
      if(!S._tp){ S._tp=1; const me=S.managers[0], b=S.managers[1]; const give=[me.roster.find(id=>players.find(p=>p.id===id).p!=='GOL')]; const get=[b.roster.find(id=>players.find(p=>p.id===id).p!=='GOL')]; E.applyAction(S,{t:'tprop',o:{to:1,give,get,cf:20,ct:0}},0,false,now); }
      E.marketTick(S,now);
      if(Math.random()<0.02){ log.push('trade offers: '+S.trade.offers.map(o=>o.st).join(',')); E.applyAction(S,{t:'tclose'},0,true,now); S._tp=0; }
    } else if(ph==='keep'){
      E.applyAction(S,{t:'keepclose'},0,true,now);
    } else if(ph==='season'){
      const fx=E.roundFixtures(S).filter(f=>!f.res);
      fx.forEach(f=>{ const M=E.simMatchInstant(S,f); f.res=E.matchResult(M); });
      E.advanceRound(S);
    } else if (ph==='done') { break; }
    else { console.log('stuck phase', ph); break; }
  }
  return {S, log};
}
for (const [fmt,total] of [['split',8],['split',5],['split',4],['split',3],['cup',4],['cup',5],['cup',6],['cup',9],['cup',12]]) {
  const {S} = run({total, fmt, mode:'leilao', squad:8});
  const se=S.season;
  const ko=se.fixtures.filter(f=>f.stage!=='Liga'&&f.stage!=='Desafio').map(f=>`${f.stage[0]}${f.id}:${f.h}v${f.a}`).join(' ');
  console.log(fmt,total,'phase',S.phase,'champ',se.champion,'desafio',se.desafio.join('-'),'|',ko,'|',se.koInfo);
}
// staff + draft + year + trades
const {S, log} = run({total:6, mode:'draft', staff:'ambos', trades:'ambos', year:true});
console.log('YEAR', S.phase, S.yearDone, S.history.map(h=>h.comp+':'+h.champion), log.slice(0,4));
console.log('staff', S.managers.map(m=>(m.coach||'-')+'/'+(m.pres||'-')).join(' '));
console.log('cup squad sizes', S.managers.map(m=>m.roster.length).join(','), 'wc', S.managers.map(m=>m.wc.length).join(','));
// match stats
let goals=0,n=0,y=0,r=0,cards={},so=0;
for(let k=0;k<300;k++){ const f={id:'x'+k,round:0,stage:k%3?'Liga':'Semifinal',h:k%6,a:(k+1)%6}; const M=E.simMatchInstant(S,f); const res=E.matchResult(M); goals+=res.s[0]+res.s[1]; n++; y+=res.yc[0]+res.yc[1]; r+=res.rc[0]+res.rc[1]; if(res.so) so++; M.ev.filter(e=>e.type==='card').forEach(e=>cards[e.card]=(cards[e.card]||0)+1); }
console.log('avg goals',(goals/n).toFixed(2),'yellow/match',(y/n).toFixed(2),'red/match',(r/n).toFixed(2),'so',so,'cards',JSON.stringify(cards));
const M=E.simMatchInstant(S,{id:'demo',round:0,stage:'Final',h:0,a:1});
M.ev.filter(e=>['card','info','yellow','red','goal'].includes(e.type)).slice(0,30).forEach(e=>console.log(Math.floor(e.m),e.type,e.text));
