# Kings Leilão: como colocar no seu próprio site

São 4 arquivos:

- `index.html`: o jogo inteiro.
- `firebase-config.js`: onde você cola a configuração do seu Firebase.
- `kl-firebase.js`: liga o jogo ao Firebase. Não precisa mexer.
- `firestore.rules`: as regras de segurança do banco. Você cola no Firebase.

O modo "um aparelho só" funciona sem Firebase. O Firebase só é necessário para o modo online, em que cada um joga no seu celular.

---

## 1. Criar o banco no Firebase (uns 10 minutos)

1. Entre em https://console.firebase.google.com com sua conta Google e clique em **Criar projeto** (pode chamar de `kings-leilao`). O Google Analytics pode ficar desligado.
2. No menu da esquerda, abra **Criação > Firestore Database** e clique em **Criar banco de dados**.
   - Local: `southamerica-east1 (São Paulo)`.
   - Modo: **produção**.
3. Ainda no Firestore, abra a aba **Regras**. Apague o que estiver lá, cole todo o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.
4. Clique na engrenagem (**Configurações do projeto**). Em **Seus apps**, clique no ícone **</>** (Web), dê um apelido e registre. **Não** precisa marcar Firebase Hosting.
5. Vai aparecer um bloco `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. Copie esses valores para o arquivo `firebase-config.js`, no lugar de cada `COLE_AQUI`.

> A `apiKey` do Firebase não é senha: ela foi feita para ficar no site. Quem protege o banco são as regras do passo 3.

## 2. Publicar o site (grátis)

**Opção mais fácil: Netlify**

1. Crie uma conta grátis em https://app.netlify.com.
2. Vá em **Add new site > Deploy manually** e arraste a pasta com os 4 arquivos.
3. Pronto: você recebe um endereço tipo `algo.netlify.app`. Dá pra trocar o nome em **Site configuration > Change site name**.

**Outras opções:** GitHub Pages (suba os arquivos num repositório e ative Pages) ou Vercel. Qualquer hospedagem de site estático serve.

> Não abra o `index.html` com dois cliques no computador para testar o online: o navegador bloqueia os scripts nesse modo. Use o endereço publicado.

## 3. Jogar

- O anfitrião abre o site, cria a sala e toca em **Copiar link de convite**.
- Os amigos abrem o link, o código da sala já vem preenchido, colocam nome e time e entram.
- Ninguém precisa de conta.

## Limites do plano grátis do Firebase

O plano grátis (Spark) tem uma cota diária de leituras e gravações. Confira os números atuais em https://firebase.google.com/pricing.

Pelas minhas contas, uma temporada com 4 a 6 amigos fica bem abaixo dessa cota. Se a cota estourar, o online para até o dia seguinte. Nada é cobrado sem você ativar um plano pago.

Para gastar menos:

- Jogue as partidas em 2x ou 4x.
- Use "Simular rodada sem ver" quando ninguém quiser assistir.

## Atualizar o jogo depois

Quando eu te mandar uma versão nova, troque só o `index.html` e publique de novo. O `firebase-config.js` continua o mesmo.
