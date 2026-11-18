// Configuração do projeto Firebase do Kings Leilão.
// (A apiKey do Firebase é pública por natureza; quem protege o banco são as regras do Firestore.)
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGYnNyDzSFaxsPz1fRcUmzrLxwfMMCZrc",
  authDomain: "kings-leilao.firebaseapp.com",
  projectId: "kings-leilao",
  storageBucket: "kings-leilao.firebasestorage.app",
  messagingSenderId: "292327302924",
  appId: "1:292327302924:web:b0c19ebc085b8245adcb29"
};

// conta(s) que podem colocar fotos nas cartas (ID da conta, aparece em Perfil quando você entra)
window.KL_ADMINS = ["hzzHUn4k6FcFaAImc98zBN7pbvV2"];

// servidor das salas na Cloudflare: com o endereço aqui, a sala roda na nuvem e não depende de ninguém ficar com o site aberto.
// Deixe "" para usar o modo antigo (a sala roda no aparelho do anfitrião, pelo Firebase).
window.KL_SERVER = "https://kings-game-salas.victor-rodrigues38.workers.dev";
