// Firebase config (reuse same project as client)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAxrUkM1lwAlgYz3f6-PH7rxd5VfmMERRg",
    authDomain: "studioproject-d4e5d.firebaseapp.com",
    projectId: "studioproject-d4e5d",
    storageBucket: "studioproject-d4e5d.firebasestorage.app",
    messagingSenderId: "143735992963",
    appId: "1:143735992963:web:325e5ef8bbdc1f03a721b6"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
