<template>
  <AppShell title="Updates" subtitle="Live notifications for your facility reports.">
    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
    <div v-if="loading" class="empty-state">Loading your notifications...</div>
    <section v-for="item in notifications" :key="item.id" class="notification" :class="{ unread: item.read === false }">
      <div class="notification-icon"><ion-icon :icon="notificationsOutline" /></div>
      <div class="notification-body">
        <strong>{{ text(item.title) }}</strong>
        <p>{{ text(item.body) }}</p>
        <span>{{ formatDate(item.createdAt) }}</span>
      </div>
      <ion-button v-if="item.read === false" fill="clear" size="small" @click="markRead(item.id)">Mark read</ion-button>
      <ion-button v-if="item.reportId" fill="clear" size="small" :router-link="`/reports/${text(item.reportId)}`">View</ion-button>
    </section>
    <div v-if="!loading && !notifications.length" class="empty-state">
      <ion-icon :icon="notificationsOutline" />
      <strong>You’re all caught up</strong>
      <span>Report updates will appear here in real time.</span>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { IonButton, IonIcon } from '@ionic/vue';
import { notificationsOutline } from 'ionicons/icons';
import AppShell from '@/components/AppShell.vue';
import { markNotificationRead, subscribeNotifications } from '@/services/campus';
import { useSessionStore } from '@/stores/session';

type NotificationRecord = Record<string, unknown> & { id: string };
const session = useSessionStore();
const notifications = ref<NotificationRecord[]>([]);
const loading = ref(true);
const error = ref('');
let unsubscribe: (() => void) | undefined;

function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function formatDate(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toLocaleString();
  }
  return 'Just now';
}
async function markRead(id: string) {
  try { await markNotificationRead(id); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to update this notification.'; }
}

onMounted(async () => {
  await session.initialize();
  if (!session.profile) { error.value = session.error ?? 'Sign in to view your notifications.'; loading.value = false; return; }
  unsubscribe = subscribeNotifications(session.profile.uid, (items) => { notifications.value = items; loading.value = false; }, (cause) => { error.value = cause.message; loading.value = false; });
});
onUnmounted(() => unsubscribe?.());
</script>

<style scoped>
.notification { display: flex; align-items: center; gap: 13px; margin-bottom: 9px; padding: 16px; border: 1px solid var(--ion-color-step-150); border-radius: 9px; background: var(--ion-background-color); }
.notification.unread { border-left: 3px solid var(--ion-color-primary); background: #f7fbf8; }
.notification-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border-radius: 50%; color: var(--ion-color-primary); background: #e9f2ec; font-size: 19px; }
.notification-body { flex: 1; min-width: 0; }
.notification-body strong { font-size: 13px; }
.notification-body p { margin: 5px 0; color: var(--ion-color-medium-shade); font-size: 12px; line-height: 1.4; }
.notification-body span { color: var(--ion-color-medium); font-size: 10px; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 38px; color: var(--ion-color-medium); text-align: center; }
.empty-state ion-icon { font-size: 26px; }
.empty-state strong { color: var(--ion-text-color); }
.error-banner { margin-bottom: 12px; color: var(--ion-color-danger); }
@media (max-width: 600px) { .notification { align-items: flex-start; flex-wrap: wrap; } .notification-body { min-width: calc(100% - 55px); } }
</style>
