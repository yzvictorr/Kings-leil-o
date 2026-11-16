// Ponte entre o jogo e o Firebase (Firestore). O jogo pede window.claude.use("db")
// e recebe aqui um objeto com doc()/collection() que lê e grava no Firestore.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, getDocs, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let db = null;
try {
  const cfg = window.FIREBASE_CONFIG;
  if (cfg && cfg.apiKey && !/COLE/.test(cfg.apiKey)) {
    const app = initializeApp(cfg);
    const fs = getFirestore(app);
    // login com Google (opcional): guarda o perfil do jogador em users/{uid}
    try {
      const auth = getAuth(app);
      const A = window.klAuth = { user: null, ready: false, cbs: [], err: null,
        onChange(cb) { this.cbs.push(cb); if (this.ready) cb(this.user); },
        async signIn() {
          // popup direto do clique (funciona no iPhone); redirecionamento só se o navegador bloquear o popup
          const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
          try { await signInWithPopup(auth, p); }
          catch (e) { if (e && /popup-blocked|operation-not-supported/.test(e.code || "")) await signInWithRedirect(auth, p); else throw e; }
        },
        // e-mail e senha: alternativa para quem não consegue entrar com Google (iPhone, navegador do Instagram/WhatsApp...)
        emailIn(email, pass) { return signInWithEmailAndPassword(auth, email, pass); },
        async emailUp(email, pass, name) { const c = await createUserWithEmailAndPassword(auth, email, pass); if (name) { try { await updateProfile(c.user, { displayName: name }); A.user && (A.user.name = name); } catch (e) { } } return c; },
        reset(email) { return sendPasswordResetEmail(auth, email); },
        signOut() { return signOut(auth); } };
      onAuthStateChanged(auth, u => { A.user = u ? { uid: u.uid, name: u.displayName || "", photo: u.photoURL || "", email: u.email || "" } : null; A.ready = true; A.cbs.forEach(f => { try { f(A.user); } catch (e) { } }); });
      getRedirectResult(auth).catch(e => { A.err = e && e.code; });
    } catch (e) { console.error("Login não iniciou:", e); }
    // os dados vão como texto JSON (o Firestore não aceita listas dentro de listas)
    const wrap = s => ({
      exists: s.exists(), id: s.id,
      data: () => { const d = s.data(); if (!d || typeof d.j !== "string") return undefined; try { return JSON.parse(d.j); } catch (e) { return undefined; } },
      metadata: { fromCache: !!(s.metadata && s.metadata.fromCache) }
    });
    db = {
      doc: path => {
        const r = doc(fs, path);
        return {
          get: async () => wrap(await getDoc(r)),
          set: d => setDoc(r, { j: JSON.stringify(d), t: Date.now() }),
          // grava só se a sala ainda for deste anfitrião (ou, ao assumir, se ainda for do anterior), tudo numa transação
          setIfHost: (d, pid, from) => runTransaction(fs, async tx => {
            const s = await tx.get(r);
            if (s.exists()) { let cur = null; try { cur = JSON.parse(s.data().j).hostPid || null; } catch (e) { } if (cur && cur !== pid && cur !== from) { const e = new Error("not-host"); e.code = "not-host"; throw e; } }
            tx.set(r, { j: JSON.stringify(d), t: Date.now() });
          }),
          onSnapshot: (next, err) => onSnapshot(r, s => next(wrap(s)), err || (() => { }))
        };
      },
      collection: path => {
        const r = collection(fs, path);
        return {
          get: async () => ({ docs: (await getDocs(r)).docs.map(wrap) }),
          onSnapshot: (next, err) => onSnapshot(r, q => next({ docs: q.docs.map(wrap) }), err || (() => { }))
        };
      }
    };
  }
} catch (e) { console.error("Firebase não iniciou:", e); db = null; }
window.KL_FB_OK = !!db;
window.__klFbResolve(db);
