<template>
  <AppShell title="Audit log" subtitle="A permanent record of administrative changes.">
    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
    <div v-if="loading" class="empty-state">Loading audit events...</div>
    <section v-for="item in entries" :key="item.id" class="audit-row">
      <span class="audit-dot" />
      <div class="audit-main">
        <strong>{{ value(item.action) }}</strong>
        <p>{{ value(item.actorName) }}<template v-if="item.targetId"> · {{ value(item.targetId) }}</template><template v-if="item.reportId"> · Report {{ value(item.reportId) }}</template></p>
      </div>
      <time>{{ formatDate(item.createdAt) }}</time>
    </section>
    <div v-if="!loading && !entries.length" class="empty-state">No administrative events recorded yet.</div>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import AppShell from '@/components/AppShell.vue';
import { subscribeAuditLogs } from '@/services/campus';
import { useSessionStore } from '@/stores/session';

type AuditEntry = Record<string, unknown> & { id: string };
const session = useSessionStore();
const entries = ref<AuditEntry[]>([]);
const loading = ref(true);
const error = ref('');
let unsubscribe: (() => void) | undefined;
function value(item: unknown) { return typeof item === 'string' ? item : ''; }
function formatDate(item: unknown) {
  if (item && typeof item === 'object' && 'toDate' in item && typeof item.toDate === 'function') return item.toDate().toLocaleString();
  return 'Just now';
}
onMounted(async () => {
  await session.initialize();
  if (session.profile?.role !== 'admin') { error.value = 'Administrator access is required.'; loading.value = false; return; }
  unsubscribe = subscribeAuditLogs((items) => { entries.value = items; loading.value = false; }, (cause) => { error.value = cause.message; loading.value = false; });
});
onUnmounted(() => unsubscribe?.());
</script>

<style scoped>
.audit-row { display: flex; align-items: center; gap: 13px; padding: 15px; border-bottom: 1px solid var(--ion-color-step-100); background: var(--ion-background-color); }
.audit-dot { width: 9px; height: 9px; flex: 0 0 9px; border-radius: 50%; background: var(--ion-color-primary); }
.audit-main { flex: 1; min-width: 0; }
.audit-main strong { font-size: 12px; }
.audit-main p { margin: 4px 0 0; color: var(--ion-color-medium); font-size: 10px; }
.audit-row time { color: var(--ion-color-medium); font-size: 10px; white-space: nowrap; }
.error-banner { color: var(--ion-color-danger); }
.empty-state { padding: 34px; color: var(--ion-color-medium); text-align: center; }
</style>
