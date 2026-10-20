<template>
  <ion-page>
    <ion-content class="auth-content">
      <main class="auth-layout">
        <section class="auth-intro">
          <div class="brand-mark">CF</div>
          <p class="eyebrow">MINDSORO STATE UNIVERSITY</p>
          <h1>Better spaces.<br />Better campus.</h1>
          <p>Report facility issues and follow every repair from submission to resolution.</p>
          <div class="intro-foot">A campus service for the MinSU community</div>
        </section>
        <section class="auth-form">
          <h2>Welcome back</h2>
          <p class="muted">Sign in with your university account.</p>
          <form @submit.prevent="submit">
            <ion-input v-model="email" label="Institutional email" label-placement="stacked" type="email" autocomplete="email" required />
            <ion-input v-model="password" label="Password" label-placement="stacked" type="password" autocomplete="current-password" required />
            <p v-if="error" class="error-text" role="alert">{{ error }}</p>
            <ion-button expand="block" type="submit" :disabled="busy" class="submit-button">
              {{ busy ? 'Signing in...' : 'Sign in' }}
            </ion-button>
          </form>
          <router-link class="forgot-link" to="/auth/forgot-password">Forgot your password?</router-link>
          <div class="auth-divider"><span>New to CampusFix?</span></div>
          <ion-button expand="block" fill="outline" router-link="/auth/register">Create an account</ion-button>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonButton, IonContent, IonInput, IonPage } from '@ionic/vue';
import { login } from '@/services/auth';
import router from '@/router';

const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await login(email.value, password.value);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.';
    busy.value = false;
    return;
  }

  const requestedDestination = router.currentRoute.value.query.redirect;
  const destination = typeof requestedDestination === 'string'
    && requestedDestination.startsWith('/')
    && !requestedDestination.startsWith('//')
    ? requestedDestination
    : '/home';
  try {
    await router.replace(destination);
  } catch (cause) {
    error.value = cause instanceof Error
      ? `You are signed in, but the requested page could not be opened: ${cause.message}`
      : 'You are signed in, but the requested page could not be opened. Please reload the app.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.auth-content { --background: var(--campus-surface); }
.auth-layout { display: grid; min-height: 100%; grid-template-columns: minmax(280px, 1fr) minmax(320px, 500px); align-items: center; gap: clamp(32px, 8vw, 110px); width: min(1080px, calc(100% - 40px)); margin: auto; padding: 36px 0; }
.auth-intro { min-height: 390px; display: flex; flex-direction: column; justify-content: center; padding: 36px; border-radius: 12px; color: white; background: #155b3b; }
.brand-mark { display: grid; width: 44px; height: 44px; place-items: center; border-radius: 10px; color: #155b3b; background: white; font-weight: 850; }
.eyebrow { margin: 32px 0 8px; color: #b6d9c6; font-size: 11px; font-weight: 750; letter-spacing: .12em; }
h1 { margin: 0; font-size: clamp(34px, 5vw, 50px); line-height: 1.12; }
.auth-intro > p:not(.eyebrow) { max-width: 380px; color: #e2eee6; font-size: 16px; line-height: 1.6; }
.intro-foot { margin-top: 38px; color: #b6d9c6; font-size: 12px; }
.auth-form { padding: 12px; }
.auth-form h2 { margin-bottom: 4px; font-size: 28px; }
.muted { color: var(--ion-color-medium); }
ion-input { margin: 22px 0; --padding-start: 0; }
.submit-button { margin-top: 24px; }
.forgot-link { display: block; margin: 16px 0 24px; text-align: right; color: var(--ion-color-primary); font-size: 13px; text-decoration: none; }
.auth-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: var(--ion-color-medium); font-size: 12px; }
.auth-divider::before, .auth-divider::after { height: 1px; flex: 1; background: var(--ion-color-step-150); content: ''; }
.error-text { color: var(--ion-color-danger); font-size: 13px; }
@media (max-width: 720px) { .auth-layout { display: block; width: min(460px, calc(100% - 28px)); padding: 0 0 28px; } .auth-intro { min-height: 0; margin: 0 -14px 20px; padding: 24px; border-radius: 0; } .auth-intro .eyebrow { margin-top: 20px; } .auth-intro h1 { font-size: 34px; } .intro-foot { display: none; } .auth-form { padding: 8px 2px; } }
</style>
