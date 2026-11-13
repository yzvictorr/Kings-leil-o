# Monta o pool de jogadores da Kings League Brasil e calcula overalls.
# Base: estatísticas oficiais da temporada 2025/26 (Split 2 2026) em kingsleague.pro
# (chutes, chutes no alvo, assistências, dribles, defesas de goleiro)
# + bônus por Split 1 2025, Kings Cup 2025, Nations 2025/2026 e Mundial de Clubes 2025/2026.
import json, math

D = "DesimpaiN"; G = "G3X FC"; L = "LOUD SC"; FX = "Fluxo FC"; P = "Podpah Funkbol"
F = "Furia FC"; N = "Nyvelados FC"; DB = "Dibrados FC"; C = "Capim FC"; DD = "Dendele FC"

# name, team, PM, S, ST  (tabela de chutes - Split 2 2025/26)
shots = """Kelvin Oliveira|G|12|95|65
Davi Ilario|D|11|53|42
Andreas Vaz|G|12|52|30
Felipe Viana|L|10|52|39
Well Andrade|FX|11|51|34
Luan 'Mestre'|P|11|50|38
Lipão Pinheiro|F|8|45|33
Ton 'Spider'|G|11|41|27
Wellinton 'Gigante'|D|11|40|24
Léo 'Gol'|N|9|38|25
Helber Júnior|FX|11|38|29
Carlos 'Ferrão'|N|7|37|21
Gabriel Costa|DB|9|36|23
Yan 'Coringa'|P|11|36|25
Lucas Hector|C|10|35|21
Lucas 'L7'|DD|10|35|18
Gerard Nolla|C|10|34|24
Matheus 'Chaveirinho'|FX|11|33|21
Luisinho Alves|D|11|32|25
Christian Santos|D|11|32|19
Lyncoln Oliveira|DD|9|30|22
Ailton José|N|8|27|17
Vini Alexandre|P|11|27|16
Cristhian 'Canhoto'|DD|9|27|18
Sam Silva|L|10|27|12
Chay Medeiros|DB|6|27|16
Lucas Nascimento|DB|9|26|7
Leleti Garcia|F|6|25|9
Rafinha Cunha|L|10|25|15
Ryan Soares|DD|10|24|15
Juninho Antunes|P|11|24|16
Luiggi Longo|DB|9|24|14
Daniel Shiraishi|L|10|22|15
Vanderson 'Neguiim Jr'|N|10|22|12
Esaú Nascimento|L|7|21|13
Danilo Alemão|D|10|21|8
Thiago 'TH' Brito|G|12|20|13
Matheus 'Dedo'|F|9|20|12
Gustavo Húngaro|DD|10|19|13
Kaiky Souza|D|11|19|10
Jeffinho Honorato|F|9|18|7
Dani Liñares|C|10|17|10
Kenu Leandro|F|9|16|11
Matheus Rufino|G|11|16|10
Leléo Moura|P|11|15|9
João 'Choco'|P|11|14|8
Igor Campos|P|11|14|7
Caio Felipe|L|10|14|7
Caio Miranda|P|11|13|7
William Jesus|P|9|13|6
Nicollas Nascimento|DD|10|13|8
João Pedro|FX|11|12|7
Ryan Lima|G|11|12|9
Gustavinho Henrique|FX|11|12|7
Victor 'Bolt'|D|11|12|9
Jeferson Titon|C|10|12|9
Igor 'BB'|N|9|12|6
Danilo Belém|N|4|12|6
Josildo Barata|G|12|11|8
Murillo Pulino|FX|11|11|5
Walid Jaadi|L|5|11|6
Gui Carvalho|DD|10|10|2
Renan Augusto|FX|9|10|6
Maicon Macabeu|N|8|10|5
Luan Teles|DB|8|10|6
Álex Guti|C|8|9|5
Tuco Magalhães|FX|11|9|5
Marquinhos Samora|DD|10|9|3
Paulo 'Pulão'|L|8|9|2
Lucas Nascimento (Furia)|F|6|8|2
Rafão 'Portuga'|P|6|8|6
Etinho Lima|DB|3|8|4
Breno Arantes|C|6|7|5
Jonatas 'Batman'|DB|5|7|4
Juvenal Oliveira|D|8|7|5
Paulo 'Pinguinho'|FX|9|7|4
Thiago 'Major'|F|6|7|1
Rafael 'Tambinha'|F|9|7|4
Rafa Sousa|C|7|7|4
Thiago Santos|C|6|7|3
Wembley Luiz|G|12|6|0
Gabriel 'Dudu'|C|10|6|4
Daniel Coringa|N|1|6|5
Marcelinho Junior|DB|2|5|2
Luisinho Barreiros|N|7|5|4
Matheus Klynsmann|N|9|5|3
Bruninho Mandarino|DD|8|5|3
Douglinhas Melo|D|4|5|4
Marcos 'Bolivia'|C|10|5|3
Jheferson Falcão|FX|11|5|1
Murillo Donato|C|8|4|4
Edda Marcelino|DB|8|4|2
Felipe Cassiano|L|10|4|2
Gabriel Repulho|DD|8|4|2
Willy dos Santos|P|4|4|1
Sidney Pages|DB|9|4|2
Tiago Marinho|F|3|4|3
Ivo Alves|F|3|3|3
Thiago Oliveira|L|2|3|2
João Pelegrini|F|8|3|1
Marcos 'MV'|FX|10|3|2
João Guimarães|G|9|3|1
Luandrio 'Pé Fino'|N|4|3|3
Lucas 'Caroço'|C|10|2|0
Gabriel Medeiros|G|4|2|2
Ronaldinho Reis|P|6|2|2
Luiz Camilo|F|4|2|2
Gabriel Messias|G|11|2|1
Douglas 'Doth'|FX|4|2|1
Gabriel Lopes|D|3|2|1
Daniel Ferreira|DB|9|2|1
Patrick Habibi|FX|3|2|1
Leonardo 'Belletti'|DD|8|1|1
Victor 'VB' Bueno|D|5|1|1
Victor Hugo|F|3|1|0
Lucas 'Japa'|N|7|1|1
Ruan Major|DB|9|1|0
Matheus 'Biro'|L|10|1|1
Marinho Filho|G|7|1|0
William Costa|D|11|1|1
Arthur Facas|L|1|1|1
Lucas 'Pulguinha'|DB|9|0|0
Vitor 'Barba'|F|5|0|0
Maicon 'Barata'|L|8|0|0
Bruno 'Gan'|N|2|0|0
Gustavo Silva|P|2|0|0
Bruno Mota|DB|2|1|0
Gabriel Braga|G|1|0|0"""

teammap = dict(D=D, G=G, L=L, FX=FX, P=P, F=F, N=N, DB=DB, C=C, DD=DD)

assists = {"Davi Ilario":10,"Juninho Antunes":7,"Kelvin Oliveira":6,"Matheus 'Chaveirinho'":6,"Léo 'Gol'":5,
"Luan 'Mestre'":5,"Rafinha Cunha":5,"Gerard Nolla":4,"Well Andrade":4,"Victor 'Bolt'":4,"Lucas 'L7'":4,
"Jeffinho Honorato":3,"Andreas Vaz":3,"Gabriel Costa":3,"Cristhian 'Canhoto'":3,"Ton 'Spider'":3,"Gustavo Húngaro":3,
"Yan 'Coringa'":3,"Christian Santos":3,"Kaiky Souza":3,"Igor 'BB'":3,"Thiago 'TH' Brito":2,"Josildo Barata":2,
"Ailton José":2,"Matheus Rufino":2,"Matheus 'Dedo'":2,"Lucas Hector":2,"Esaú Nascimento":2,"Igor Campos":2,
"Matheus 'Biro'":2,"Felipe Viana":2,"Rafa Sousa":2,"Vanderson 'Neguiim Jr'":2,"Danilo Alemão":2,
"Dani Liñares":1,"Leleti Garcia":1,"Tuco Magalhães":1,"Gabriel Medeiros":1,"Ivo Alves":1,"Matheus Klynsmann":1,
"Thiago Oliveira":1,"Ryan Soares":1,"Kenu Leandro":1,"João 'Choco'":1,"Victor Hugo":1,"Gustavinho Henrique":1,
"Caio Miranda":1,"Helber Júnior":1,"William Jesus":1,"Lucas Nascimento":1,"Ruan Major":1,"Juvenal Oliveira":1,
"Wellinton 'Gigante'":1,"Jheferson Falcão":1,"Jeferson Titon":1,"Gabriel Messias":1,"Daniel Shiraishi":1,
"Maicon Macabeu":1,"Luan Teles":1,"Thiago Santos":1,"Luiggi Longo":1,"Sam Silva":1,"Daniel Coringa":1,"Tiago Marinho":1}

dribbles = {"Andreas Vaz":47,"Davi Ilario":45,"Lucas 'L7'":40,"Lipão Pinheiro":38,"Kelvin Oliveira":38,"Helber Júnior":33,
"Gerard Nolla":30,"Lucas Hector":30,"Léo 'Gol'":29,"Cristhian 'Canhoto'":26,"Ton 'Spider'":26,"Christian Santos":26,
"Yan 'Coringa'":24,"Luisinho Alves":21,"Rafinha Cunha":21,"Luan 'Mestre'":20,"Juninho Antunes":19,"Leleti Garcia":17,
"Well Andrade":17,"Wellinton 'Gigante'":17,"Carlos 'Ferrão'":17,"Ryan Soares":16,"Danilo Belém":16,"Felipe Viana":15,
"Chay Medeiros":15,"Lucas 'Pulguinha'":14,"Matheus Rufino":13,"Daniel Shiraishi":13,"Vanderson 'Neguiim Jr'":13,
"Jeferson Titon":11,"Álex Guti":10,"João 'Choco'":10,"Matheus 'Dedo'":10,"Lyncoln Oliveira":10,"Marquinhos Samora":10,
"Vini Alexandre":9,"Caio Miranda":9,"Jeffinho Honorato":8,"Ryan Lima":8,"Gui Carvalho":8,"Gustavinho Henrique":8,
"Nicollas Nascimento":8,"Lucas Nascimento (Furia)":8,"Willy dos Santos":8,"Gabriel 'Dudu'":8,"Ailton José":7,
"Matheus Klynsmann":7,"Gabriel Repulho":7,"Gabriel Costa":6,"Kenu Leandro":6,"Leléo Moura":6,"Sam Silva":6,
"Victor 'Bolt'":5,"Matheus 'Chaveirinho'":5,"Rafael 'Tambinha'":5,"Caio Felipe":5,"Luiggi Longo":5,"Dani Liñares":4,
"Thiago 'TH' Brito":4,"Murillo Donato":4,"Lucas 'Japa'":4,"Jonatas 'Batman'":4,"William Jesus":4,"Paulo 'Pinguinho'":4,
"João Guimarães":4,"Rafa Sousa":4,"Gabriel Lopes":4,"William Costa":4,"Danilo Alemão":4,"Etinho Lima":4,
"Victor 'VB' Bueno":3,"Douglinhas Melo":3,"Murillo Pulino":3,"Marcos 'MV'":3,"Esaú Nascimento":3,"Jheferson Falcão":3,
"Renan Augusto":3,"Gabriel Messias":3,"Maicon Macabeu":3,"Breno Arantes":2,"Gustavo Húngaro":2,"Matheus 'Biro'":2,
"Edda Marcelino":2,"Marcelinho Junior":2}

# Goleiros: defesas, gols sofridos (Split 2)
gk = {"Kaiky Souza":(98,36),"Gustavo Húngaro":(80,44),"Josildo Barata":(77,40),"João Pedro":(74,46),"Marcos 'Bolivia'":(74,35),
"Igor Campos":(67,48),"Igor 'BB'":(60,49),"Luan Teles":(59,33),"Esaú Nascimento":(57,28),"Ivo Alves":(23,11),
"Vitor 'Barba'":(23,24),"Thiago Santos":(15,9),"Victor Hugo":(11,5),"Thiago Oliveira":(8,3),"Arthur Facas":(8,2),
"Tiago Marinho":(7,9),"Douglas 'Doth'":(6,3),"Bruno 'Gan'":(5,2),"Gustavo Silva":(4,4),"Bruno Mota":(2,8),"Gabriel Braga":(1,1)}

known_goals = {"Kelvin Oliveira":33, "Davi Ilario":21, "Luan 'Mestre'":19}
mvps_s2 = {"Kelvin Oliveira":8, "Davi Ilario":8}

# Posições (conhecidas pelo site/notícias; o resto inferido pelo perfil estatístico)
pos_known = {"Kelvin Oliveira":"ATA","Andreas Vaz":"MEI","Ton 'Spider'":"ATA","Wembley Luiz":"DEF","Thiago 'TH' Brito":"MEI",
"Matheus Rufino":"MEI","Ryan Lima":"ATA","Gabriel Messias":"DEF","Marinho Filho":"DEF","João Guimarães":"MEI",
"Lipão Pinheiro":"ATA","Leleti Garcia":"ATA","Matheus 'Dedo'":"DEF","Jeffinho Honorato":"MEI","Kenu Leandro":"MEI",
"Rafael 'Tambinha'":"MEI","Davi Ilario":"ATA","Wellinton 'Gigante'":"DEF","Luan 'Mestre'":"MEI","Cristhian 'Canhoto'":"MEI",
"Well Andrade":"MEI","Léo 'Gol'":"ATA","Felipe Viana":"ATA","Helber Júnior":"ATA","Gerard Nolla":"ATA","Álex Guti":"DEF",
"Dani Liñares":"DEF","Lucas Hector":"ATA","Juninho Antunes":"MEI","Chay Medeiros":"ATA","Thiago 'Major'":"MEI",
"Ruan Major":"MEI","Jonatas 'Batman'":"MEI","Lucas 'L7'":"ATA","Gabriel Costa":"ATA","Marquinhos Samora":"MEI"}

# Bônus de outras competições (gols/assist/mvp/títulos)
bonus = {}
def add(name, pts, tag=None):
    b = bonus.setdefault(name, {"pts":0.0, "tags":[]})
    b["pts"] += pts
    if tag and tag not in b["tags"]: b["tags"].append(tag)

# Split 1 2025 (líderes oficiais)
for n,g in {"Leleti Garcia":19,"Kelvin Oliveira":15,"Douglinhas Melo":15,"Davi Ilario":15,"Lipão Pinheiro":12,"Léo 'Gol'":12}.items():
    add(n, g*0.16, "Split 1")
for n,a in {"Lipão Pinheiro":9,"Leleti Garcia":6}.items(): add(n, a*0.15)
for n,m in {"Leleti Garcia":6,"Davi Ilario":3,"Lucas Hector":3}.items(): add(n, m*0.35, "Split 1")
add("Leleti Garcia", 1.5, "Artilheiro Split 1")
# Furia campeã Split 1 2025
for n in ["Leleti Garcia","Lipão Pinheiro","Jeffinho Honorato","Matheus 'Dedo'","Victor Hugo","Kenu Leandro","Rafael 'Tambinha'"]:
    add(n, 0.6, "Campeão Split 1")
# Split 2 2026 - DesimpaiN campeão, prêmios
for n in ["Davi Ilario","Kaiky Souza","Wellinton 'Gigante'","Luisinho Alves","Christian Santos","Victor 'Bolt'","Danilo Alemão","Juvenal Oliveira","William Costa"]:
    add(n, 0.6, "Campeão Split 2")
add("Davi Ilario", 1.5, "MVP Split 2"); add("Kaiky Souza", 2.0, "Melhor goleiro Split 2"); add("Kelvin Oliveira", 1.5, "Artilheiro Split 2")
# Kings Cup Brasil 2025: Furia campeã, G3X vice, LOUD e Podpah Funkbol semifinal
for n in ["Leleti Garcia","Lipão Pinheiro","Jeffinho Honorato","Matheus 'Dedo'","Victor Hugo","Kenu Leandro","Rafael 'Tambinha'","Lucas Nascimento (Furia)"]:
    add(n, 0.7, "Campeão Kings Cup")
for n in ["Kelvin Oliveira","Andreas Vaz","Ton 'Spider'","Wembley Luiz","Thiago 'TH' Brito","Josildo Barata","Matheus Rufino","Ryan Lima","Gabriel Messias"]:
    add(n, 0.35, "Vice Kings Cup")
for n in ["Felipe Viana","Esaú Nascimento","Rafinha Cunha","Sam Silva","Daniel Shiraishi","Luan 'Mestre'","Juninho Antunes","Yan 'Coringa'","Vini Alexandre"]:
    add(n, 0.2)
# Kings World Cup Nations 2025 (Itália) e 2026 (Brasil) - Brasil bicampeão
for n,g in {"Lipão Pinheiro":14,"Kelvin Oliveira":12,"Leleti Garcia":6,"Matheus 'Dedo'":4,"Victor Hugo":3,"Ton 'Spider'":3,"Andreas Vaz":1,"Well Andrade":1,"Luan 'Mestre'":1}.items():
    add(n, g*0.14, "Nations 2026")
for n in ["Wembley Luiz","Cristhian 'Canhoto'","Jeffinho Honorato","Esaú Nascimento","Lipão Pinheiro","Kelvin Oliveira","Leleti Garcia","Matheus 'Dedo'","Victor Hugo","Ton 'Spider'","Andreas Vaz","Well Andrade","Luan 'Mestre'"]:
    add(n, 0.8, "Campeão Nations")
add("Kelvin Oliveira", 2.0, "MVP Nations 2025/26"); add("Kelvin Oliveira", 19*0.08)  # 2025: artilheiro
add("Lipão Pinheiro", 1.2, "Artilheiro Nations 2026"); add("Leleti Garcia", 0.8, "MVP da final Nations")
add("Andreas Vaz", 0.5); add("Lipão Pinheiro", 0.4)  # também campeões em 2025
# Kings World Cup Clubs 2025 (Paris) e 2026 (Milão)
for n,g in {"Leleti Garcia":10,"Lipão Pinheiro":9,"Léo 'Gol'":7,"Vini Alexandre":6,"Gui Carvalho":6}.items():
    add(n, g*0.12, "Mundial 2025")
add("Kelvin Oliveira", 14*0.14, "Mundial 2026")
for n in ["Kelvin Oliveira","Andreas Vaz","Ton 'Spider'","Wembley Luiz","Thiago 'TH' Brito","Josildo Barata","Matheus Rufino","Ryan Lima","Gabriel Messias","Well Andrade"]:
    add(n, 1.0, "Campeão Mundial 2026")
for n in ["Lipão Pinheiro","Leleti Garcia","Jeffinho Honorato","Matheus 'Dedo'","Victor Hugo","Kenu Leandro"]:
    add(n, 0.4, "Final Four Mundial 2026")
for n in ["Wellinton 'Gigante'","Luisinho Alves"]: add(n, 0.3)

GK_NAMES = set(k for k,(s,gc) in gk.items() if s >= 20 or k in ("Victor Hugo","Thiago Santos","Gabriel Braga","Thiago Oliveira","Arthur Facas","Tiago Marinho","Douglas 'Doth'","Bruno 'Gan'","Gustavo Silva","Bruno Mota"))
GK_NAMES.add("Victor Hugo")

players = []
for line in shots.strip().splitlines():
    n, t, pm, s, st = line.split("|")
    players.append(dict(name=n, team=teammap[t], pm=int(pm), s=int(s), st=int(st)))
names = {p["name"] for p in players}
for n in ["Lucas 'Pulguinha'"]: assert n in names

def shrink(v, pm, prior, k=3):
    return (v*pm + prior*k) / (pm + k)

TEAM_GC = {D:41/11, G:41/12, C:44/10, L:36/10, DB:41/9, FX:49/11, P:52/11, N:51/9, DD:44/10, F:49/9}
out = []
for p in players:
    n = p["name"]; pm = max(p["pm"],1)
    a = assists.get(n, 0); dr = dribbles.get(n, 0)
    if n in known_goals: g = known_goals[n]
    else: g = round(p["st"]*0.47)
    p["g"] = g; p["a"] = a; p["dr"] = dr; p["mvp"] = mvps_s2.get(n, 0)
    isgk = n in GK_NAMES
    if isgk:
        sv, gc = gk.get(n, (0,0))
        svg = shrink(sv/pm, pm, 3.0, 4); gcg = shrink(gc/pm, pm, 4.6, 4)
        perf = svg*1.1 - gcg*0.9 + (g/pm)*0.6 + (a/pm)*0.8
        pos = "GOL"
        p["sv"] = sv; p["gc"] = gc
    else:
        gpg = shrink(g/pm, pm, 0.3); apg = shrink(a/pm, pm, 0.12); stpg = shrink(p["st"]/pm, pm, 0.8); drpg = shrink(dr/pm, pm, 0.6)
        perf = gpg*2.2 + apg*2.4 + stpg*0.55 + drpg*0.45 + (p["mvp"]/pm)*2.5
        perf += min(pm, 12) * 0.06  # regularidade
        pos = pos_known.get(n)
        if not pos:
            if stpg > 1.4 or gpg > 0.8: pos = "ATA"
            elif drpg > 0.9 or apg > 0.25 or stpg > 0.7: pos = "MEI"
            else: pos = "DEF"
    if pos == "DEF":
        perf += 0.9 + min(pm,12)*0.09 + (4.6 - TEAM_GC[p["team"]])*0.5
    elif pos == "MEI":
        perf += 0.25 + (4.6 - TEAM_GC[p["team"]])*0.2
    b = bonus.get(n, {"pts":0, "tags":[]})
    p["pos"] = pos; p["perf"] = perf + b["pts"]*0.55; p["tags"] = b["tags"]
    out.append(p)

# Mapeia para overall equilibrado por posição (percentil dentro de goleiros / linha)
def assign(group, lo, hi):
    group.sort(key=lambda x: x["perf"])
    nG = len(group)
    vals = [x["perf"] for x in group]
    mn, mx = vals[0], vals[-1]
    for i, x in enumerate(group):
        pct = i/(nG-1)
        lin = (x["perf"]-mn)/(mx-mn)
        z = 0.55*pct + 0.45*lin**0.8
        x["ovr"] = int(round(lo + (hi-lo)*z))

gks = [x for x in out if x["pos"]=="GOL"]; fld = [x for x in out if x["pos"]!="GOL"]
assign(gks, 64, 90); assign(fld, 62, 96)

# Atributos para simulação
for x in out:
    o = x["ovr"]; pm = max(x["pm"],1)
    if x["pos"]=="GOL":
        x["att"] = max(40, o-25); x["df"] = o
    else:
        fin = min(99, 50 + 25*min(1.6, (x["g"]/pm))/1.6 + (o-62)*0.55)
        crt = min(99, 50 + 25*min(0.9, (x["a"]/pm)+x["dr"]/pm*0.15)/0.9 + (o-62)*0.5)
        att = 0.6*fin + 0.4*crt
        base_def = {"DEF":o+3, "MEI":o-4, "ATA":o-14}[x["pos"]]
        x["att"] = int(round(min(99, att))); x["df"] = int(round(max(40, min(95, base_def))))
    # valor de referência no leilão (moedas)
    x["val"] = max(1, int(round(((o-58)/38)**3.2 * 70)))

out.sort(key=lambda x: -x["ovr"])
for i, x in enumerate(out): x["id"] = i+1
res = [dict(id=x["id"], n=x["name"], t=x["team"], p=x["pos"], o=x["ovr"], at=x["att"], df=x["df"], v=x["val"],
            pm=x["pm"], g=x["g"], a=x["a"], tags=x["tags"][:4]) for x in out]
json.dump(res, open("/home/claude/build/players.json","w"), ensure_ascii=False)
for x in res[:40]: print(x["o"], x["p"], x["n"], x["t"], x["v"], x["at"], x["df"], x["tags"])
print("...")
for x in res[-10:]: print(x["o"], x["p"], x["n"], x["t"], x["v"])
from collections import Counter
print(len(res), Counter(x["p"] for x in res))
print(Counter(x["o"]//5*5 for x in res))
