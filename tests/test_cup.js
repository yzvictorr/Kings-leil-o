const E = require('../src/engine.js'); E.setPlayers(require('../src/players.json'));
function season(total, fmt, extra) {
  let now=1e12; const S=E.newGame('ABCD','h1','V','F','online');
  E.applyAction(S,{t:'settings',v:Object.assign({total,fmt,squad:8},extra||{})},0,true,now); E.applyAction(S,{t:'start'},0,true,now);
  let g=0; while(S.phase!=='season'&&g++<200000){now+=400;E.marketTick(S,now); if(S.phase==='trade')E.applyAction(S,{t:'tclose'},0,true,now); if(S.phase==='auction'&&g%50==0)E.applyAction(S,{t:'autofill'},0,true,now);}
  return {S, now};
}
for (const total of [3,4,5,7,8,9,10,11,12]) {
  const {S} = season(total,'cup'); const se=S.season;
  const n=S.managers.length; let ok=true, msg=[];
  if (se.fmt!=='cup') { console.log(total,'->',n,'fmt',se.fmt); continue; }
  const des={}, rounds={};
  se.fixtures.forEach(f=>{ (rounds[f.round]=rounds[f.round]||[]).push(f); if(f.stage==='Desafio'){des[f.h]=(des[f.h]||0)+1;des[f.a]=(des[f.a]||0)+1; const gh=se.groups[0].includes(f.h), ga=se.groups[0].includes(f.a); if(gh===ga){ok=false;msg.push('desafio same group');}} });
  for(let i=0;i<n;i++) if(des[i]!==1){ok=false;msg.push('team '+i+' desafios '+des[i]);}
  Object.values(rounds).forEach(fs=>{ const c={}; fs.forEach(f=>{c[f.h]=(c[f.h]||0)+1;c[f.a]=(c[f.a]||0)+1;}); for(let i=0;i<n;i++) if(c[i]!==1){ok=false;msg.push('round team '+i+' plays '+c[i]);} });
  // pairs within group exactly once
  se.groups.forEach(G=>{ G.forEach(a=>G.forEach(b=>{ if(a<b){ const k=se.fixtures.filter(f=>f.stage==='Liga'&&((f.h===a&&f.a===b)||(f.h===b&&f.a===a))).length; if(k!==1){ok=false;msg.push('pair '+a+'-'+b+' '+k);} } })); });
  console.log('cup', total,'-> teams',n,'groups',se.groups.map(g=>g.length).join('/'),'rounds',se.leagueRounds, ok?'OK':'FAIL '+msg.slice(0,4).join('; '));
}
// full run + bracket check
for (let it=0; it<30; it++) {
  const {S} = season(8+2*(it%3),'cup'); const se=S.season;
  let g=0; while(S.phase==='season'&&g++<100){ E.roundFixtures(S).filter(f=>!f.res).forEach(f=>{ f.res=E.matchResult(E.simMatchInstant(S,f)); }); E.advanceRound(S); if(S.phase==='trade') E.applyAction(S,{t:'tclose'},0,true,0); }
  if (it<3) {
    const bg=se.bonusGroup, Wt=E.standings(S,bg).map(r=>r.i), Lt=E.standings(S,1-bg).map(r=>r.i);
    const fx=id=>se.fixtures.find(f=>f.id===id);
    console.log('desafios',se.desafio.join('-'),'W group',"AB"[bg],'| qf1',fx('qf1').h===Lt[0]&&fx('qf1').a===Wt[3],'sf1 has W1',fx('sf1').h===Wt[0],'| champ',se.champion,'|',se.koInfo);
    const t=E.standings(S,0); console.log('  tabela A', t.map(r=>`${r.i}:${r.pts}pts sg${r.gf-r.gc} ca${r.ca}${r.h2h!=null?' h2h'+r.h2h:''}`).join('  '));
  }
  if (S.phase!=='done') console.log('NOT DONE', it, S.phase);
}
// split points
{ const {S}=season(8,'split'); let g=0; while(S.phase==='season'&&g++<100){ E.roundFixtures(S).filter(f=>!f.res).forEach(f=>{ f.res=E.matchResult(E.simMatchInstant(S,f)); }); E.advanceRound(S);} 
  const t=E.standings(S); console.log('split', t.map(r=>`${r.i}:${r.pts}(${r.v}v${r.vso}so) sg${r.gf-r.gc} ca${r.ca}${r.h2h!=null?' h2h'+r.h2h+'/'+r.h2hgd:''}`).join(' | ')); }
