<template>
  <ion-page>
    <ion-content class="setup-content">
      <section class="setup-card">
        <img class="brand-mark" src="/campusfix-mark.svg" alt="CampusFix" />
        <p class="eyebrow">MINDSORO STATE UNIVERSITY</p>
        <template v-if="firebaseConfigurationError">
          <h1>Connect CampusFix to Firebase</h1>
          <p>Authentication, facility reports, and live updates are ready to use once this app is connected to your Firebase project.</p>
          <pre>{{ firebaseConfigurationError }}</pre>
          <template v-if="isProductionBuild">
            <p>The hosted site was built without its Firebase web app settings. Add the <code>VITE_FIREBASE_*</code> values from Firebase Console to the hosting build environment, rebuild the app, and deploy the new <code>dist</code> folder.</p>
            <p class="setup-hint">For Firebase CLI hosting, put the values in a local <code>.env.local</code> before running <code>npm run build</code> and <code>firebase deploy --only hosting</code>. For GitHub Actions or another CI host, configure them as build environment variables or secrets.</p>
          </template>
          <p v-else>Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Firebase web app configuration, then restart the development server.</p>
        </template>
        <template v-else>
          <h1>Account profile needs attention</h1>
          <p v-if="session.user?.email">You signed in as <strong>{{ session.user.email }}</strong>, but CampusFix could not load the matching account profile.</p>
          <p v-else>CampusFix could not load the account profile for this sign-in.</p>
          <pre>{{ profileError }}</pre>
          <p v-if="session.error?.includes('unavailable')">
            Registration normally creates this profile automatically. If this is an older account, ask the administrator to create the matching <code>users/{{ session.user?.uid }}</code> document in the same Firebase project's Firestore.
          </p>
          <p v-else-if="session.error?.includes('permission-denied') || session.error?.includes('insufficient permissions')">
            Ask your administrator to confirm this app points to the correct Firebase project and that the Firestore rules are deployed.
          </p>
          <p v-else-if="!session.error?.includes('unavailable')">
            Ask your Firebase project owner to verify that your Firestore profile is active and uses a valid account role.
          </p>
          <p v-if="actionError" class="error-text" role="alert">{{ actionError }}</p>
          <ion-button expand="block" fill="outline" :disabled="busy" @click="signOut">Sign out and return to sign in</ion-button>
        </template>
      </section>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonButton, IonContent, IonPage } from '@ionic/vue';
import { firebaseConfigurationError } from '@/firebase/client';
import { logout } from '@/services/auth';
import { useSessionStore } from '@/stores/session';

const router = useRouter();
const session = useSessionStore();
const isProductionBuild = import.meta.env.PROD;
const profileError = computed(() => session.error ?? 'The profile lookup did not return an account. Check the browser console for details.');
const actionError = ref('');
const busy = ref(false);

async function signOut() {
  actionError.value = '';
  busy.value = true;
  try {
    await logout();
    await router.replace('/auth/login');
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Unable to sign out.';
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await session.initialize();
  if (!session.user) {
    await router.replace('/auth/login');
    return;
  }
  await session.refreshProfile();
  if (session.profile?.role === 'admin') await router.replace('/admin/analytics');
  else if (session.profile?.role === 'maintenance') await router.replace('/maintenance');
  else if (session.profile) await router.replace('/home');
});

</script>

<style scoped>
.setup-content { --background: var(--campus-surface); }
.setup-card { width: min(560px, calc(100% - 32px)); margin: 12vh auto; padding: 34px; border: 1px solid var(--ion-color-step-150); border-radius: 12px; background: var(--ion-background-color); }
.brand-mark { display: block; width: 42px; height: 42px; border-radius: 11px; }
.eyebrow { margin-top: 28px; color: var(--ion-color-primary); font-size: 11px; font-weight: 750; letter-spacing: .12em; }
h1 { margin: 8px 0; font-size: 28px; }
p { color: var(--ion-color-medium-shade); line-height: 1.6; }
pre { overflow-wrap: anywhere; white-space: pre-wrap; padding: 14px; border-radius: 8px; color: #7a3e00; background: #fff4df; }
ion-button { margin-top: 20px; }
.error-text { color: var(--ion-color-danger); }
</style>
