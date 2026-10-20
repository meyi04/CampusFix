import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { UserRole } from '@/models/domain';
import { auth, db } from '@/firebase/client';

function requireFirebase() {
  if (!auth || !db) {
    throw new Error('Firebase is not configured. Add the required values to .env.local.');
  }
  return { authentication: auth, database: db };
}

function validateInstitutionalEmail(email: string): void {
  const allowedDomain = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
  if (allowedDomain && email.trim().toLowerCase().split('@').pop() !== allowedDomain) {
    throw new Error(`Use your institutional email address ending in @${allowedDomain}.`);
  }
}

export interface RegistrationInput {
  fullName: string;
  email: string;
  password: string;
  role: Extract<UserRole, 'student' | 'faculty' | 'maintenance'>;
  identifier: string;
  department: string;
  contact: string;
}

export async function register(input: RegistrationInput): Promise<void> {
  const { authentication, database } = requireFirebase();
  validateInstitutionalEmail(input.email);
  const credential = await createUserWithEmailAndPassword(authentication, input.email.trim(), input.password);
  try {
    await updateProfile(credential.user, { displayName: input.fullName.trim() });
    await setDoc(doc(database, 'users', credential.user.uid), {
      uid: credential.user.uid,
      fullName: input.fullName.trim(),
      email: credential.user.email,
      role: input.role,
      identifier: input.identifier.trim(),
      department: input.department.trim(),
      contact: input.contact.trim(),
      active: true,
      createdAt: serverTimestamp(),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'Unknown Firebase error.';
    throw new Error(`Your sign-in account was created, but CampusFix could not save its Firestore profile: ${detail} Contact the administrator before trying to register again.`);
  }

}

export async function login(email: string, password: string): Promise<void> {
  const { authentication } = requireFirebase();
  validateInstitutionalEmail(email);
  await signInWithEmailAndPassword(authentication, email.trim(), password);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { authentication } = requireFirebase();
  validateInstitutionalEmail(email);
  await sendPasswordResetEmail(authentication, email.trim());
}

export async function logout(): Promise<void> {
  const { authentication } = requireFirebase();
  await signOut(authentication);
}
