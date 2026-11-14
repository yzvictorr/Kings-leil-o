# Kings Leilão ⚽👑

Jogo de leilão e draft com jogadores da **Kings League Brasil**, pra jogar online com os amigos, cada um no seu celular. Os times se montam no leilão ou no draft e depois jogam o campeonato com as regras da Kings League: escalonado, cartas secretas, pênalti do presidente, gol em dobro, dado, match ball e shootouts.

## Modos
- **Leilão** (ordem aleatória, com botão Passar) ou **Draft**: 6 wild cards com propostas fechadas, duelos, sorteio da ordem e draft em cobrinha.
- **Split**: grupo único. Os 7 primeiros vão ao mata-mata, com o 1º direto na semi.
- **Kings Cup**: dois grupos e 1 jogo desafio por time. O grupo que vencer mais desafios leva 4 vagas e o 1º dele vai direto à semi.
- **Temporada completa**: o Split e depois a Kings Cup. Cada time mantém 6 WC e até 3 jogadores; o resto volta pro draft.
- Opcionais: mercado de técnicos e presidentes, mercado de trocas e overall escondido.
- Jogos simultâneos ao vivo, com botão **Pronto** e timer de 1 minuto.

## Estrutura
```
src/        código-fonte (engine.js = regras e simulação, app.js = telas e rede, live.js = partida ao vivo)
docs/       versão site, pronta para GitHub Pages (online via Firebase)
dist/       versão para o artefato do claude.ai
tests/      testes da simulação (node)
build.py    gera docs/index.html e dist/kings-leilao-claude.html a partir de src/
```

## Gerar e testar
```bash
python3 build.py
node tests/test_formats.js   # roda campeonatos completos em todos os formatos
node tests/test_cup.js       # confere as regras da Kings Cup (1 desafio por time etc.)
```

## Publicar no GitHub Pages
1. Configure o Firebase seguindo o `docs/LEIAME.md` e preencha o `docs/firebase-config.js`.
2. No repositório: **Settings > Pages > Build and deployment > Deploy from a branch**, branch `main`, pasta `/docs`.
3. O site fica em `https://SEU_USUARIO.github.io/NOME_DO_REPO/`.

## Observações
- Os escudos oficiais da Kings League são marcas registradas. Por isso os escudos do jogo são originais, e você cria o seu no editor.
- Os nomes de técnicos e presidentes vêm de fontes públicas. A formação preferida de cada técnico e a pontaria dos presidentes foram inventadas para o jogo.
- Os overalls (src/ratings3.py) usam o elenco oficial da Kings Cup Brasil 2026/27, as notas oficiais do kingsleague.pro, as estatísticas de Split 1, Kings Cup 2025, Split 2, Kings Cup 2026, Mundial 2025/2026 e Nations 2025/2026, e os salários do fantasy oficial.
