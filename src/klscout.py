"""Aplica os dados do Kings League Scout (klscout.netlify.app) em players.json.
Entrada: data/klscout_raw.json (extraído do site; uma linha por jogador do jogo):
  [id, over_site, [6 atributos], jogos_BR, gols_BR, assist_BR, mvps_BR, jogos_total, gols_bola_rolando_total,
   penaltis_batidos, penaltis_perdidos, goleiro[pen_enfrentados, pen_sofridos, shootouts_enfrentados, shootouts_sofridos] | null,
   altura_cm, pe, [nacionalidades], ano_nasc]
Atributos de linha: finalização, criação, drible, defesa, físico, decisivo.
Atributos de goleiro: defesas, gols sofridos, distribuição, assistências, pênaltis, decisivo.
Uso: cd src && python3 klscout.py   (roda uma vez sobre o players.json original; guarda a base em data/players_base.json)
"""
import json, math, os
D = os.path.dirname(os.path.abspath(__file__))
base_path = os.path.join(D, 'data', 'players_base.json')
if not os.path.exists(base_path):
    json.dump(json.load(open(os.path.join(D, 'players.json'), encoding='utf-8')), open(base_path, 'w', encoding='utf-8'), ensure_ascii=False)
P = json.load(open(base_path, encoding='utf-8'))
raw = {r[0]: r for r in json.load(open(os.path.join(D, 'data', 'klscout_raw.json'), encoding='utf-8'))}
clamp = lambda v, a, b: max(a, min(b, v))
mean = lambda xs: sum(xs) / len(xs)

# escala do site -> escala do jogo (pela posição no ranking: média e espalhamento)
site = [raw[p['id']][1] for p in P]
ms, ss = mean(site), math.sqrt(mean([(x - mean(site)) ** 2 for x in site]))
mo = mean([p['o'] for p in P])
def mapped(v): return mo + (v - ms) / ss * 6.5

# taxa de gols de bola rolando por jogo, por posição (para "puxar" quem tem poucos jogos para a média)
pos_rate = {}
for pos in ['ATA', 'MEI', 'DEF', 'GOL']:
    rs = [raw[p['id']] for p in P if p['p'] == pos]
    pos_rate[pos] = sum(r[8] for r in rs) / max(1, sum(r[7] for r in rs))

# perfil relativo aos colegas de posição (assim o craque não perde ataque só porque o over dele no site é altíssimo)
def prof(p, r):
    a = r[2]; ov = mean(a)  # compara com a média dos próprios atributos: mede o perfil, não o nível
    if p['p'] == 'GOL': return (0.6 * a[0] + 0.4 * a[1]) - ov, 0
    atk = 0.5 * a[0] + 0.25 * a[2] + 0.25 * a[1]
    dfn = (0.7 * a[3] + 0.3 * a[4]) - ov if abs(a[3] - 58.5) > 2.5 else None
    return atk - ov, dfn
avg = {}
for pos in ['ATA', 'MEI', 'DEF', 'GOL']:
    xs = [prof(p, raw[p['id']]) for p in P if p['p'] == pos]
    avg[pos] = (mean([x[0] for x in xs]), mean([x[1] for x in xs if x[1] is not None] or [0]))
NAT = {'Brazil': 'Brasil', 'Spain': 'Espanha', 'Italy': 'Itália', 'Portugal': 'Portugal', 'United States': 'Estados Unidos', 'Qatar': 'Catar'}
FOOT = {'left': 'canhoto', 'right': 'destro', 'both': 'ambidestro'}
log = []
for p in P:
    r = raw[p['id']]
    _, ov, at6, jb, gb, ab, mvpb, jall, gop, pa, pmiss, gk, h, ft, nats, _by = r
    games = max(jall, jb)
    gkp = p['p'] == 'GOL'
    # 1) over: só sobe, e pouco (até +4), para quem o site avalia acima e tem jogos suficientes
    up = 0
    if games >= 12:
        gap = mapped(ov) - p['o']
        if gap > 1.2: up = int(clamp(round(gap * 0.4), 0, 3))
    # 2) ataque e defesa pelo perfil do jogador no site (comparando os atributos com o over dele lá)
    w = clamp(games / 20, 0.25, 1)
    pa_, pd_ = prof(p, r); aa, ad = avg[p['p']]
    if gkp:
        d_df = clamp(round((pa_ - aa) * 0.2 * w), -4, 4); d_at = 0
    else:
        d_at = clamp(round((pa_ - aa) * 0.3 * w), -6, 6)
        d_df = clamp(round((pd_ - ad) * 0.25 * w), -6, 6) if pd_ is not None else 0  # o site usa ~58 como padrão para quem não tem dado de defesa
    o0 = p['o']
    p['o'] = o0 + up
    p['at'] = int(clamp(p['at'] + up + d_at, 20, 99))
    p['df'] = int(clamp(p['df'] + up + d_df, 20, 99))
    if p.get('pot', 0) < p['o']: p['pot'] = p['o']
    p['v'] = max(1, round(1.25 * math.exp((p['o'] - 64) * 0.13)))
    p['dec'] = at6[5]
    # 3) faro de gol: gols de bola rolando por jogo, puxado para a média da posição quando tem poucos jogos
    pr = pos_rate[p['p']]
    p['gr'] = round((gop + pr * 10) / (jall + 10), 3)
    # 4) pênaltis: aproveitamento real (com "puxão" para a média 72%)
    if pa: p['pk'] = int(clamp(round(75 + (((pa - pmiss) + 0.72 * 6) / (pa + 6) - 0.72) * 110), 55, 97))
    if gkp and gk and (gk[0] or gk[2]):
        pf, pg, sf, sg = gk
        p['gpk'] = int(clamp(round(78 + (0.66 - (pg + 0.66 * 6) / (pf + 6)) * 90), 62, 94))
        p['gso'] = int(clamp(round(78 + (0.44 - (sg + 0.44 * 6) / (sf + 6)) * 90), 62, 94))
    # 5) ficha: altura, pé, nacionalidade e números na Kings League Brasil
    if h: p['h'] = h
    if ft in FOOT: p['ft'] = FOOT[ft]
    p['nat'] = [NAT.get(n, n) for n in nats]
    p['kb'] = [jb, gb, ab, mvpb]
    if up or abs(d_at) >= 3 or abs(d_df) >= 3: log.append((p['n'], o0, p['o'], p['at'], p['df']))

json.dump(P, open(os.path.join(D, 'players.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('jogadores:', len(P), '| subiram de over:', sum(1 for x in log if x[2] > x[1]))
for x in sorted(log, key=lambda x: x[1] - x[2])[:40]: print(x)
