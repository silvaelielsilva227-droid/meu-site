import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    sendPasswordResetEmail, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
    apiKey: "AlzaSyCV-NLHOdBQDI88vQGDZ_rxCjx3wluAEqE",
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

// ATIVA O BANCO DE DADOS GLOBALMENTE
window.db = getDatabase(app);
console.log("Firebase e Banco de Dados conectados!");

export {
    auth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    sendPasswordResetEmail, onAuthStateChanged, signOut
};
