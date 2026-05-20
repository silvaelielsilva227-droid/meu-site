import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {

  getAuth,

  signInWithEmailAndPassword,

  onAuthStateChanged,

  signOut

} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

export {

  auth,

  signInWithEmailAndPassword,

  onAuthStateChanged,

  signOut

};