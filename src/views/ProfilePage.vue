<template>
  <AppShell title="Your profile" subtitle="View your account details and manage device notifications.">
    <section class="profile-card">
      <div class="avatar">{{ initials }}</div>
      <div class="profile-grid">
        <ion-input :model-value="profile?.fullName ?? ''" label="Full name" label-placement="stacked" readonly />
        <ion-input :model-value="profile?.email ?? ''" label="Institutional email" label-placement="stacked" readonly />
        <ion-input :model-value="roleLabel" label="Account type" label-placement="stacked" readonly />
        <ion-input :model-value="profile?.identifier ?? ''" label="Campus identifier" label-placement="stacked" readonly />
        <ion-input :model-value="profile?.department ?? ''" label="College or department" label-placement="stacked" readonly />
        <ion-input :model-value="profile?.contact ?? ''" label="Contact number" label-placement="stacked" readonly />
      </div>
      <p class="muted">Profile edits and account removal are reserved for administrator management.</p>
      <div class="push-row">
        <div><strong>Device notifications</strong><span>Optional Android push notifications for report updates.</span></div>
        <ion-button type="button" fill="outline" size="small" :disabled="pushBusy || !profile" @click="enablePush">{{ pushBusy ? 'Preparing...' : 'Set up push' }}</ion-button>
      </div>
      <p v-if="pushMessage" class="push-message" role="status">{{ pushMessage }}</p>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { IonButton, IonInput } from '@ionic/vue';
import { useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import { prepareNativePush } from '@/services/push';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const router = useRouter();
const profile = computed(() => session.profile);
const pushMessage = ref('');
const pushBusy = ref(false);
let stopPush: (() => Promise<void>) | undefined;
const initials = computed(() => (profile.value?.fullName || 'CampusFix').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase());
const roleLabel = computed(() => ({ student: 'Student', faculty: 'Faculty member', maintenance: 'Maintenance personnel', admin: 'Administrator' }[profile.value?.role ?? 'student']));

async function enablePush() {
  const account = profile.value;
  if (!account) return;
  pushBusy.value = true;
  pushMessage.value = '';
  try {
    const result = await prepareNativePush(account.uid, (cause) => { pushMessage.value = cause.message; }, (reportId) => { void router.push(`/reports/${reportId}`); });
    pushMessage.value = result.message;
    stopPush?.();
    stopPush = result.cleanup;
  } catch (cause) {
    pushMessage.value = cause instanceof Error ? cause.message : 'Unable to prepare push notifications.';
  } finally {
    pushBusy.value = false;
  }
}

onMounted(async () => {
  await session.initialize();
});
onUnmounted(() => { void stopPush?.(); });
</script>

<style scoped>
.profile-card { max-width: 720px; padding: 24px; border: 1px solid var(--ion-color-step-150); border-radius: 10px; background: var(--ion-background-color); }
.avatar { display: grid; width: 52px; height: 52px; place-items: center; border-radius: 50%; color: white; background: var(--ion-color-primary); font-size: 17px; font-weight: 750; }
.profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 20px; margin: 18px 0; }
ion-input { margin: 7px 0; }
.muted { color: var(--ion-color-medium); font-size: 12px; }
.push-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 22px; padding-top: 17px; border-top: 1px solid var(--ion-color-step-150); }
.push-row div { display: flex; flex-direction: column; gap: 4px; }
.push-row strong { font-size: 12px; }
.push-row span, .push-message { color: var(--ion-color-medium); font-size: 11px; }
@media (max-width: 550px) { .profile-grid { grid-template-columns: 1fr; } .profile-card { padding: 18px; } }
</style>
