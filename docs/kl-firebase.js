// Ponte entre o jogo e o Firebase (Firestore). O jogo pede window.claude.use("db")
// e recebe aqui um objeto com doc()/collection() que lê e grava no Firestore.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let db = null;
try {
  const cfg = window.FIREBASE_CONFIG;
  if (cfg && cfg.apiKey && !/COLE/.test(cfg.apiKey)) {
    const fs = getFirestore(initializeApp(cfg));
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
