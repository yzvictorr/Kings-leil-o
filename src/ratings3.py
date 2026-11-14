# Overall dos jogadores — versão 3.
# Fontes (todas do elenco atual da Kings Cup Brasil 2026/27):
#  - kingsleague.pro: posição oficial, nota oficial ("Média") quando existe e status de lesão (data/kc2026.json, data/history.json)
#  - estatísticas oficiais por competição (data/history.json): Split 1 2025, Kings Cup 2025, Split 2 2026,
#    Kings Cup 2026/27, Mundial de Clubes 2025 e 2026, Nations 2025 e 2026 e Kings Cup América
#  - fantasy oficial (Kolex) da Kings Cup 2026/27: salário inicial e atual (data/fantasy_kc2026.json)
#  - títulos/tags da base antiga (data/players_split2_2026.json)
import json, math, unicodedata
norm = lambda s: unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower().replace("'", "").strip()
clamp = lambda x, a, b: max(a, min(b, x))
cur = json.load(open('data/kc2026.json', encoding='utf-8'))
hist = {norm(h[0]): h for h in json.load(open('data/history.json', encoding='utf-8'))}
old = {norm(p['n']): p for p in json.load(open('data/players_split2_2026.json', encoding='utf-8'))}
FAN = [f for f in json.load(open('data/fantasy_kc2026.json', encoding='utf-8')) if f[3] != 'President']
TEAM = {"capim fc": "Capim FC", "dendele fc": "Dendele FC", "desimpain": "DesimpaiN", "dibrados fc": "Dibrados FC", "fluxo fc": "Fluxo FC",
        "furia fc": "Furia FC", "g3x fc": "G3X FC", "loud sc": "LOUD SC", "nyvelados fc": "Nyvelados FC", "podpah funkbol clube": "Podpah Funkbol"}
POS = {"G": "GOL", "D": "DEF", "M": "MEI", "A": "ATA"}
# peso de cada competição (mais recente e mais forte pesa mais)
W = {"69": 1.0, "61": 1.0, "64": 1.15, "49": 1.1, "43": 0.75, "33": 0.65, "37": 0.85, "28": 0.8, "50": 0.6}
NAMES = {"33": "Split 1", "43": "Kings Cup 2025", "61": "Split 2", "69": "Kings Cup 2026", "37": "Mundial 2025", "64": "Mundial 2026", "28": "Nations 2025", "49": "Nations 2026", "50": "Kings Cup América"}
toks = lambda s: {t for t in norm(s).replace('.', ' ').split() if len(t) >= 3}
used = set()
def fantasy_for(team, name, g, j):
    best, bs = None, 0
    for i, f in enumerate(FAN):
        if i in used or {"Podpah Funkbol Clube": "Podpah Funkbol"}.get(f[2], f[2]) != team: continue
        sc = len(toks(name) & (toks(f[0]) | toks(f[1])))
        if sc and f[8] == g: sc += 1
        if sc and f[7] == j: sc += 0.5
        if sc > bs: best, bs = i, sc
    if best is not None and bs >= 1: used.add(best); return FAN[best]
    return None

def career(h, P):
    """Índice de desempenho na carreira KL (por jogo, ponderado por competição)."""
    if not h or not h[7]: return None, 0, {}
    tot = {"pg": 0, "g": 0, "a": 0, "mvp": 0}; num = den = 0.0; svs = svc = 0.0
    for sid, (pg, g, a, mvp, tir, drb, prt, gs, y, r) in h[7].items():
        w = W.get(sid, 0.7); tot["pg"] += pg; tot["g"] += g; tot["a"] += a; tot["mvp"] += mvp
        if P == "GOL":
            svs += w * prt; svc += w * gs
            num += w * (g + 0.7 * a + 1.5 * mvp); den += w * pg
        else:
            num += w * ((g * (1.4 if P == "DEF" else 1)) + 0.7 * a + 1.5 * mvp + 0.08 * drb + 0.03 * tir); den += w * pg
    if den <= 0: return None, 0, tot
    if P == "GOL":
        sv = svs / max(1, svs + svc)
        perf = 58 + (sv - 0.5) * 110 + 4 * min(1, num / den)
    else:
        c = num / den
        perf = 60 + 35 * (1 - math.exp(-c / 2.2))
    k = 5.0  # confiança: poucos jogos puxam para a média
    perf = (perf * den + 68 * k) / (den + k)
    return perf, den, tot

out = []
def rate(team, name, P, med, fis, due, chu, dfe, pas, hab, g, a, j, h, fz, xtags=()):
    o_old = old.get(norm(name)); g = g or 0; a = a or 0; j = j or 0
    inj = False  # lesões agora acontecem durante os jogos
    perf, games, tot = career(h, P)
    fan = None
    if fz:
        fv = (fz[4] + fz[5]) / 2000
        fan = 70 + (fv - 70) * 0.6 if P == "GOL" else 66 + (fv - 66) * 0.95
    parts = []
    if med: parts.append((med, 0.45 if med >= 85 else 0.5))
    if perf: parts.append((perf, 0.4 if med else 0.7))
    if fan: parts.append((fan, 0.15 if med else 0.3))
    if not parts: parts = [(66, 1)]
    o = sum(v * w for v, w in parts) / sum(w for _, w in parts)
    o = 72 + (o - 72) * 1.25  # espalha a escala (craques bem acima da média)
    imp = min(1.0, games / 40)  # importância: quem joga sempre (muitos jogos na Kings) é peça do time
    if o < 88:  # sobe quem não é craque; zagueiros e goleiros sobem mais
        o += (88 - o) * 0.2 + 2.5 * imp + (3 if P == "DEF" else 1 if P == "GOL" else 0)
        o = min(o, 89)
    o = int(round(clamp(o, 62, 94)))
    # potencial: quem tem pouca rodagem na Kings ainda pode crescer bastante
    seed = sum(ord(ch) for ch in name) % 3
    pot = int(min(95, o + round(1 + 7 * math.exp(-games / 18)) + seed))
    if med and chu:
        at = round(0.5 * chu + 0.3 * hab + 0.2 * fis) + (o - med); df = round(0.6 * dfe + 0.4 * due) + (o - med)
    else:
        at, df = {"ATA": (o + 3, o - 14), "MEI": (o, o - 7), "DEF": (o - 10, o + 3), "GOL": (35, o)}[P]
    p2 = None
    if P != "GOL":
        if med and chu:
            if P == "ATA" and pas >= chu - 2: p2 = "MEI"
            elif P == "MEI" and chu >= pas + 3: p2 = "ATA"
            elif P == "MEI" and dfe >= max(chu, pas): p2 = "DEF"
            elif P == "DEF" and (pas >= dfe - 3 or chu >= 78): p2 = "MEI"
        if not p2 and o_old and o_old['p'] != P and o_old['p'] != "GOL": p2 = o_old['p']
        if not p2 and tot.get("pg"):
            gpg = tot["g"] / tot["pg"]
            if P == "MEI" and gpg >= 0.7: p2 = "ATA"
            elif P == "DEF" and (tot["g"] + tot["a"]) / tot["pg"] >= 0.45: p2 = "MEI"
            elif P == "ATA" and tot["a"] > tot["g"]: p2 = "MEI"
    tags = []
    if inj: tags.append("Lesionado")
    tags += [t for t in (o_old['tags'] if o_old else []) if t not in tags]
    comps = [NAMES[s] for s in ["49", "64", "28", "37"] if h and s in h[7]]
    if comps and not any("Nations" in t or "Mundial" in t for t in tags): tags.append(comps[0])
    if tot.get("mvp", 0) >= 5: tags.append(f"{tot['mvp']} MVPs na carreira")
    tags = list(xtags) + [t for t in tags if t not in xtags]
    v = max(1, round(1.25 * math.exp((o - 64) * 0.13)))
    out.append(dict(n=name, t=team, p=P, p2=p2, o=o, at=int(clamp(at, 30, 95)), df=int(clamp(df, 30, 95)), v=v,
                    pot=pot, pm=tot.get("pg", j), g=tot.get("g", g) if P != "GOL" else tot.get("g", 0), a=tot.get("a", a), tags=tags[:4]))
for (team, name, pos, med, fis, due, chu, dfe, pas, hab, mvp, g, a, j, gc) in cur:
    rate(TEAM[team], name, POS[pos], med, fis, due, chu, dfe, pas, hab, g, a, j, hist.get(norm(name)), fantasy_for(TEAM[team], name, g or 0, j or 0))

# ---- todos que já jogaram a Kings League Brasil (data/all_klb.json, site oficial) ----
# entra só quem teve rodagem de verdade: 6+ jogos na KLB, ou 4+ jogos com 4+ participações em gol
ROLE = {"goalkeeper": "GOL", "defender": "DEF", "midfielder": "MEI", "forward": "ATA"}
KLB = ["33", "43", "61", "69"]
have = {norm(x['n']) for x in out}
for pid, name, role, seas, meta, st, bd in json.load(open('data/all_klb.json', encoding='utf-8')):
    if norm(name) in have or role not in ROLE: continue
    gk = sum(st.get(s, [0])[0] for s in KLB); ga = sum(st[s][1] + st[s][2] for s in KLB if s in st)
    if not (gk >= 6 or (gk >= 4 and ga >= 4)): continue
    last = max(seas, key=int); team = {"Podpah Funkbol Clube": "Podpah Funkbol"}.get(seas[last], seas[last])
    I = lambda k: int(meta[k]) if meta.get(k) else None
    med = I('average'); chu, hab, fis, dfe, due, pas = I('shooting'), I('skills'), I('physical'), I('defence'), I('duels'), I('passing')
    if med and not chu: med = None if ROLE[role] != "GOL" else med
    xt = [] if (last == "69" or meta.get('injury') == "true") else ["Ex-Kings"]
    g = sum(st[s][1] for s in st); a = sum(st[s][2] for s in st)
    rate(team, name, ROLE[role], med, fis, due, chu, dfe, pas, hab, g, a, gk, [name, team, '', 0, med, '', None, st], None, xt)

# ids estáveis: quem já existia mantém o id (salas e carreiras salvas continuam valendo)
prev = {}
try: prev = {norm(p['n']): p['id'] for p in json.load(open('players.json', encoding='utf-8'))}
except Exception: pass
out.sort(key=lambda x: (-x['o'], x['n']))
nid = max(prev.values(), default=0)
for x in out:
    k = norm(x['n'])
    if k in prev: x['id'] = prev[k]
    else: nid += 1; x['id'] = nid
out = [dict(id=x.pop('id'), **x) for x in out]
json.dump(out, open('players.json', 'w', encoding='utf-8'), ensure_ascii=False)
if __name__ == '__main__':
    for x in out[:12]: print(x['o'], 'pot', x['pot'], x['p'], x['n'], x['t'])
    from collections import defaultdict
    by = defaultdict(list)
    for x in out: by[x['t']].append(x['o'])
    print({t: round(sum(l) / len(l), 1) for t, l in by.items()})
    print(len(out), 'jogadores · fantasy ligado:', len(used))
    import statistics
    for P in ['GOL','DEF','MEI','ATA']: l=[x['o'] for x in out if x['p']==P]; print(P, 'média', round(statistics.mean(l),1), 'max', max(l))
