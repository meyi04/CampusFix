<template>
  <ion-page>
    <ion-content class="auth-content">
      <main class="auth-card">
        <router-link to="/auth/login" class="back-link">← Back to sign in</router-link>
        <p class="eyebrow">CAMPUSFIX ACCOUNT</p>
        <h1>Join the campus community</h1>
        <p class="muted">Create a student, faculty, or maintenance account. Your selected account type is saved in Firestore.</p>
        <form @submit.prevent="submit">
          <div class="form-grid">
            <ion-input v-model="fullName" label="Full name" label-placement="stacked" autocomplete="name" required />
            <ion-input v-model="email" label="Institutional email" label-placement="stacked" type="email" autocomplete="email" required />
            <ion-select v-model="role" label="I am a" label-placement="stacked" interface="popover">
              <ion-select-option value="student">Student</ion-select-option>
              <ion-select-option value="faculty">Faculty member</ion-select-option>
              <ion-select-option value="maintenance">Maintenance staff</ion-select-option>
            </ion-select>
            <ion-input v-model="identifier" :label="identifierLabel" label-placement="stacked" required />
            <ion-input v-model="department" label="College or department" label-placement="stacked" required />
            <ion-input v-model="contact" label="Contact number (optional)" label-placement="stacked" type="tel" />
            <ion-input v-model="password" label="Password (at least 8 characters)" label-placement="stacked" type="password" autocomplete="new-password" :minlength="8" required />
            <ion-input v-model="confirmPassword" label="Confirm password" label-placement="stacked" type="password" autocomplete="new-password" required />
          </div>
          <p v-if="error" class="error-text" role="alert">{{ error }}</p>
          <ion-button expand="block" type="submit" :disabled="busy" class="submit-button">{{ busy ? 'Creating account...' : 'Create account' }}</ion-button>
        </form>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonButton, IonContent, IonInput, IonPage, IonSelect, IonSelectOption } from '@ionic/vue';
import { register } from '@/services/auth';
import type { UserRole } from '@/models/domain';
import router from '@/router';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const fullName = ref('');
const email = ref('');
const role = ref<Extract<UserRole, 'student' | 'faculty' | 'maintenance'>>('student');
const identifierLabel = computed(() => ({
  student: 'Student ID',
  faculty: 'Faculty ID',
  maintenance: 'Staff ID',
}[role.value]));
const identifier = ref('');
const department = ref('');
const contact = ref('');
const password = ref('');
const confirmPassword = ref('');
const busy = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  if (password.value.length < 8) { error.value = 'Use a password with at least 8 characters.'; return; }
  if (password.value !== confirmPassword.value) { error.value = 'The passwords do not match.'; return; }
  busy.value = true;
  try {
    await register({
      fullName: fullName.value,
      email: email.value,
      password: password.value,
      role: role.value,
      identifier: identifier.value,
      department: department.value,
      contact: contact.value,
    });
    await session.refreshProfile();
    await router.replace('/home');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to create your account.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.auth-content { --background: var(--campus-surface); }
.auth-card { width: min(720px, calc(100% - 32px)); margin: 5vh auto; padding: clamp(22px, 5vw, 42px); border: 1px solid var(--ion-color-step-150); border-radius: 12px; background: var(--ion-background-color); }
.back-link { color: var(--ion-color-primary); text-decoration: none; font-size: 13px; }
.eyebrow { margin: 28px 0 8px; color: var(--ion-color-primary); font-size: 11px; font-weight: 750; letter-spacing: .12em; }
h1 { margin: 0; font-size: clamp(26px, 5vw, 34px); }
.muted { color: var(--ion-color-medium); line-height: 1.5; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 22px; margin-top: 22px; }
ion-input, ion-select { margin: 9px 0; }
.submit-button { margin-top: 24px; }
.error-text { color: var(--ion-color-danger); }
@media (max-width: 560px) { .form-grid { grid-template-columns: 1fr; } }
</style>
