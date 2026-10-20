import { defineStore } from 'pinia';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { ref } from 'vue';
import type { UserProfile } from '@/models/domain';
import { auth, db, firebaseConfigurationError } from '@/firebase/client';

export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null);
  const profile = ref<UserProfile | null>(null);
  const ready = ref(false);
  const error = ref<string | null>(firebaseConfigurationError);
  let initialized = false;
  let readyPromise: Promise<void> | null = null;

  async function loadProfile(nextUser: User): Promise<void> {
    if (!db) return;
    if (profile.value?.uid !== nextUser.uid) profile.value = null;
    error.value = null;
    try {
      const snapshot = await getDoc(doc(db, 'users', nextUser.uid));
      if (auth?.currentUser?.uid !== nextUser.uid) return;
      if (!snapshot.exists()) {
        profile.value = null;
        error.value = 'Your account profile is unavailable. Contact a CampusFix administrator.';
        return;
      }
      const account = snapshot.data() as UserProfile;
      if (!account.active) {
        profile.value = null;
        error.value = 'This account is inactive. Contact a CampusFix administrator.';
      } else {
        profile.value = account;
      }
    } catch (cause) {
      if (auth?.currentUser?.uid === nextUser.uid) {
        profile.value = null;
        error.value = cause instanceof Error ? cause.message : 'Unable to load your profile.';
      }
    }
  }

  async function refreshProfile(forceTokenRefresh = false): Promise<void> {
    const currentUser = auth?.currentUser ?? user.value;
    if (!currentUser) return;
    user.value = currentUser;
    if (forceTokenRefresh) await currentUser.getIdToken(true);
    await loadProfile(currentUser);
  }

  function initialize(): Promise<void> {
    if (readyPromise) return readyPromise;
    const authClient = auth;
    const database = db;
    if (!authClient || !database) {
      ready.value = true;
      return Promise.resolve();
    }

    readyPromise = new Promise((resolve) => {
      onAuthStateChanged(authClient, async (nextUser) => {
        user.value = nextUser;
        if (profile.value?.uid !== nextUser?.uid) profile.value = null;
        error.value = null;
        if (nextUser) await loadProfile(nextUser);
        ready.value = true;
        if (!initialized) {
          initialized = true;
          resolve();
        }
      });
    });
    return readyPromise;
  }

  return { user, profile, ready, error, initialize, refreshProfile };
});
