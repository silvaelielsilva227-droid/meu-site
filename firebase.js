import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// 1. IMPORTA O BANCO DE DADOS AQUI EMBAIXO
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCV-NLHOdBQDI88vQGDZ_rxCjx3wluAEqE",
  authDomain: "meu-site-2e63f.firebaseapp.com",
  databaseURL: "https://meu-site-2e63f-default-rtdb.firebaseio.com",
  projectId: "meu-site-2e63f",
  storageBucket: "meu-site-2e63f.firebasestorage.app",
  messagingSenderId: "473963797649",
  appId: "1:473963797649:web:fc2ad30e6507ab55dd7330",
  measurementId: "G-H43NTQNRWC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 2. ATIVA O BANCO DE DADOS GLOBALMENTE PARA O SEU GESTAO.JS PODER USAR
window.db = getDatabase(app);

console.log("Firebase e Banco de Dados conectados!");

export {
  auth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
};
