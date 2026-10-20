import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredConfigKeys = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseConfigurationError = requiredConfigKeys.length
  ? `Firebase configuration is missing: ${requiredConfigKeys.join(', ')}.`
  : null;

const firebaseApp = firebaseConfigurationError
  ? null
  : getApps().length
    ? getApp()
    : initializeApp(config);

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

if (
  import.meta.env.DEV
  && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
  && auth
  && db
) {
  const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}
