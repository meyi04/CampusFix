<template>
  <ion-page>
    <ion-content class="auth-content">
      <main class="auth-card">
        <router-link to="/auth/login" class="back-link">← Back to sign in</router-link>
        <p class="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Reset your password</h1>
        <p class="muted">We will send a password reset link to your institutional email.</p>
        <form @submit.prevent="submit">
          <ion-input v-model="email" label="Institutional email" label-placement="stacked" type="email" required />
          <p v-if="message" :class="success ? 'success-text' : 'error-text'" role="status">{{ message }}</p>
          <ion-button expand="block" type="submit" :disabled="busy" class="submit-button">{{ busy ? 'Sending...' : 'Send reset link' }}</ion-button>
        </form>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonButton, IonContent, IonInput, IonPage } from '@ionic/vue';
import { sendPasswordReset } from '@/services/auth';

const email = ref('');
const busy = ref(false);
const message = ref('');
const success = ref(false);

async function submit() {
  busy.value = true;
  message.value = '';
  success.value = false;
  try {
    await sendPasswordReset(email.value);
    success.value = true;
    message.value = 'If an account exists for this email, a reset link has been sent.';
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Unable to send the reset email.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.auth-content { --background: var(--campus-surface); }
.auth-card { width: min(480px, calc(100% - 32px)); margin: 12vh auto; padding: 32px; border: 1px solid var(--ion-color-step-150); border-radius: 12px; background: var(--ion-background-color); }
.back-link { color: var(--ion-color-primary); text-decoration: none; font-size: 13px; }
.eyebrow { margin-top: 30px; color: var(--ion-color-primary); font-size: 11px; font-weight: 750; letter-spacing: .12em; }
h1 { font-size: 30px; }
.muted { color: var(--ion-color-medium); line-height: 1.5; }
ion-input { margin: 26px 0; }
.submit-button { margin-top: 20px; }
.success-text { color: var(--ion-color-success); }
.error-text { color: var(--ion-color-danger); }
</style>
