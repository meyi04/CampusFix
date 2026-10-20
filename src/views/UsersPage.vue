<template>
  <AppShell title="People and access" subtitle="Manage account status and assign roles through trusted server-side provisioning.">
    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
    <div v-if="loading" class="empty-state">Loading campus accounts...</div>
    <section v-else class="table-panel">
      <div class="notice"><strong>Role changes are saved to Firestore.</strong> The selected role controls this account's access. The user should sign out and back in for the updated access to load.</div>
      <p v-if="success" class="success-banner" role="status">{{ success }}</p>
      <div class="user-row table-header"><span>Person</span><span>Department</span><span>Role</span><span>Account</span></div>
      <div v-for="person in users" :key="person.uid" class="user-row">
        <div class="person"><strong>{{ person.fullName }}</strong><span>{{ person.email }}</span></div>
        <span>{{ person.department || '—' }}</span>
        <ion-select :model-value="person.role" interface="popover" aria-label="Account role" :disabled="busyUid === person.uid || person.uid === session.profile?.uid" @ion-change="setRole(person, $event.detail.value)">
          <ion-select-option value="student">Student</ion-select-option>
          <ion-select-option value="faculty">Faculty</ion-select-option>
          <ion-select-option value="maintenance">Maintenance</ion-select-option>
          <ion-select-option value="admin">Administrator</ion-select-option>
        </ion-select>
        <ion-button size="small" :color="person.active ? 'medium' : 'success'" fill="outline" :disabled="busyUid === person.uid || person.uid === session.profile?.uid" @click="setActive(person)">
          {{ person.active ? 'Deactivate' : 'Reactivate' }}
        </ion-button>
      </div>
      <p v-if="users.length >= 250" class="muted">Showing the first 250 accounts. Use Firestore paging for larger directories.</p>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { IonButton, IonSelect, IonSelectOption } from '@ionic/vue';
import AppShell from '@/components/AppShell.vue';
import { changeUserRole, listUsers, setAccountActive } from '@/services/campus';
import { useSessionStore } from '@/stores/session';
import type { UserProfile } from '@/models/domain';

const session = useSessionStore();
const users = ref<UserProfile[]>([]);
const loading = ref(true);
const busyUid = ref('');
const error = ref('');
const success = ref('');

async function refresh() { users.value = await listUsers(); }
async function setRole(person: UserProfile, role: UserProfile['role']) {
  if (role === person.role) return;
  busyUid.value = person.uid;
  error.value = '';
  success.value = '';
  try {
    await changeUserRole(person.uid, role);
    await refresh();
    success.value = `${person.fullName}'s role was saved as ${role}.`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to change this account role.';
  } finally {
    busyUid.value = '';
  }
}
async function setActive(person: UserProfile) {
  const actor = session.profile;
  if (!actor) return;
  busyUid.value = person.uid;
  error.value = '';
  try {
    await setAccountActive(person.uid, !person.active, actor);
    await refresh();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to update this account.';
  } finally {
    busyUid.value = '';
  }
}

onMounted(async () => {
  await session.initialize();
  if (session.profile?.role !== 'admin') { error.value = 'Administrator access is required.'; loading.value = false; return; }
  try { await refresh(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to load campus accounts.'; }
  finally { loading.value = false; }
});
</script>

<style scoped>
.table-panel { overflow: hidden; border: 1px solid var(--ion-color-step-150); border-radius: 10px; background: var(--ion-background-color); }
.notice { margin: 15px; padding: 12px; border-radius: 7px; color: #5d4b20; background: #fff5db; font-size: 11px; line-height: 1.5; }
.user-row { display: grid; grid-template-columns: 1.3fr 1fr 1fr auto; align-items: center; gap: 16px; min-height: 63px; padding: 10px 16px; border-top: 1px solid var(--ion-color-step-100); font-size: 12px; }
.table-header { min-height: 36px; color: var(--ion-color-medium); background: var(--campus-surface); font-size: 10px; font-weight: 700; }
.person { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.person strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.person span { overflow: hidden; color: var(--ion-color-medium); font-size: 10px; text-overflow: ellipsis; }
.user-row ion-select { max-width: 150px; font-size: 11px; }
.empty-state { padding: 34px; color: var(--ion-color-medium); text-align: center; }
.error-banner { margin-bottom: 12px; color: var(--ion-color-danger); }
.success-banner { margin: 12px 15px; color: var(--ion-color-success-shade); font-size: 12px; }
.muted { padding: 12px; color: var(--ion-color-medium); font-size: 11px; }
@media (max-width: 690px) { .user-row { grid-template-columns: 1fr 1fr auto; gap: 8px; padding: 10px; } .user-row > span:nth-child(2), .table-header > span:nth-child(2) { display: none; } }
</style>
