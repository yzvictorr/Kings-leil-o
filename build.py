"""Gera os dois arquivos do jogo a partir de src/:
  dist/kings-leilao-claude.html  -> versão para o artefato do claude.ai
  docs/index.html                -> versão site (GitHub Pages / Netlify) com Firebase
Uso: python3 build.py
"""
import json, os
D = os.path.dirname(os.path.abspath(__file__))
src = lambda f: open(os.path.join(D, 'src', f), encoding='utf-8').read()
players = json.loads(src('players.json'))
eng = src('engine.js').replace('if (typeof module !== "undefined")', 'if (false)')
body = f'''<style>{src('style.css')}</style></head><body>
<div id="app"></div><div id="live" class="live" role="dialog" aria-label="Partida ao vivo"></div><div id="viewer" class="viewer" role="dialog" aria-label="Lances"></div><div id="toast" class="toast" role="status"></div>
<script>
let PLAYERS = {json.dumps(players, ensure_ascii=False)};
let PLAYER_BY_ID = {{}}; PLAYERS.forEach(p => PLAYER_BY_ID[p.id] = p);
{eng}
{src('app.js')}
{src('live.js')}
</script></body></html>'''
head = src('head.html')
site_boot = '''<script>
window.KL_SITE = true; window.KL_POLL_MS = 15000; window.KL_LIVE_MS = 900; window.KL_STATE_MS = 400;
window.__klFb = new Promise(r => { window.__klFbResolve = r; setTimeout(() => r(null), 10000); });
window.claude = { use: async n => { const db = await window.__klFb; return n === "db" ? db : null; } };
</script>
<script src="firebase-config.js"></script>
<script type="module" src="kl-firebase.js"></script>
'''
os.makedirs(os.path.join(D, 'dist'), exist_ok=True)
open(os.path.join(D, 'dist', 'kings-leilao-claude.html'), 'w', encoding='utf-8').write(head + body)
open(os.path.join(D, 'docs', 'index.html'), 'w', encoding='utf-8').write(head + site_boot + body)
print('ok: dist/kings-leilao-claude.html e docs/index.html')
