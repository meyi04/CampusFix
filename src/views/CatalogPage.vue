<template>
  <AppShell title="Campus directory" subtitle="Manage the buildings, rooms, and facility categories available in report forms.">
    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
    <div class="catalog-grid">
      <section class="panel">
        <div class="panel-heading">
          <h2>Buildings</h2>
          <ion-button type="button" fill="outline" size="small" :disabled="busy || !directoryReady" @click="addStandardCampusOptions">
            Add standard campus options
          </ion-button>
        </div>
        <p class="muted">Add the MinSU building list and matching report categories. Existing entries are kept.</p>
        <form @submit.prevent="addBuilding">
          <ion-input v-model="buildingName" label="Building name" label-placement="stacked" :maxlength="100" required />
          <ion-button type="submit" :disabled="busy || !buildingName.trim()">Add building</ion-button>
        </form>
        <ul class="record-list">
        <li v-for="item in buildings" :key="item.id"><span>{{ item.name }}<small v-if="!item.active">Inactive</small></span><button type="button" @click="setActive('buildings', item.id, !item.active)">{{ item.active ? 'Deactivate' : 'Reactivate' }}</button></li>
        </ul>
        <p v-if="!buildings.length" class="muted">Add a building to make reports available.</p>
      </section>

      <section class="panel">
        <h2>Rooms and areas</h2>
        <form @submit.prevent="addRoom">
          <ion-select v-model="roomBuilding" label="Building" label-placement="stacked" interface="popover" required>
            <ion-select-option v-for="item in activeBuildings" :key="item.id" :value="item.id">{{ item.name }}</ion-select-option>
          </ion-select>
          <ion-input v-model="roomName" label="Room or area name" label-placement="stacked" :maxlength="100" required />
          <ion-button type="submit" :disabled="busy || !roomName.trim() || !roomBuilding">Add room or area</ion-button>
        </form>
        <ul class="record-list">
          <li v-for="item in rooms" :key="item.id"><span>{{ buildingNameFor(item.buildingId) }} · {{ item.name }}<small v-if="!item.active">Inactive</small></span><button type="button" @click="setActive('rooms', item.id, !item.active)">{{ item.active ? 'Deactivate' : 'Reactivate' }}</button></li>
        </ul>
      </section>

      <section class="panel">
        <h2>Facility categories</h2>
        <form @submit.prevent="addCategory">
          <ion-input v-model="categoryName" label="Category name" label-placement="stacked" :maxlength="100" required />
          <ion-button type="submit" :disabled="busy || !categoryName.trim()">Add category</ion-button>
        </form>
        <ul class="record-list">
          <li v-for="item in categories" :key="item.id"><span>{{ item.name }}<small v-if="!item.active">Inactive</small></span><button type="button" @click="setActive('facilityCategories', item.id, !item.active)">{{ item.active ? 'Deactivate' : 'Reactivate' }}</button></li>
        </ul>
        <p v-if="!categories.length" class="muted">Add at least one category to enable report submission.</p>
      </section>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { IonButton, IonInput, IonSelect, IonSelectOption } from '@ionic/vue';
import AppShell from '@/components/AppShell.vue';
import { addCampusRecord, setCampusActive, subscribeManagedBuildings, subscribeManagedCategories, subscribeManagedRooms } from '@/services/campus';
import type { CampusBuilding, CampusCategory, CampusRoom } from '@/models/domain';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const buildings = ref<CampusBuilding[]>([]);
const categories = ref<CampusCategory[]>([]);
const rooms = ref<CampusRoom[]>([]);
const buildingName = ref('');
const roomBuilding = ref('');
const roomName = ref('');
const categoryName = ref('');
const error = ref('');
const busy = ref(false);
const buildingsLoaded = ref(false);
const categoriesLoaded = ref(false);
const unsubscribers: Array<() => void> = [];
const activeBuildings = computed(() => buildings.value.filter((building) => building.active));
const directoryReady = computed(() => buildingsLoaded.value && categoriesLoaded.value);
const standardBuildingNames = [
  'Admin Building',
  'Educ Building',
  'IABE',
  'ASTEER',
  'Student Center',
  'Gymnasium',
  'Auditorium',
  'Canteen',
  'CAS Building',
  'Entrep Building',
  'Tourism Building',
  'Agriculture and ENI Sci',
];
const standardFacilityCategories = ['Building', ...standardBuildingNames];

function buildingNameFor(id: string) { return buildings.value.find((item) => item.id === id)?.name ?? 'Campus'; }
async function save(operation: () => Promise<void>) {
  error.value = '';
  busy.value = true;
  try { await operation(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to save this campus record.'; }
  finally { busy.value = false; }
}
function addStandardCampusOptions() {
  const actor = session.profile;
  if (!actor) return Promise.resolve();
  return save(async () => {
    const existingBuildingNames = new Set(buildings.value.map((building) => building.name.trim().toLocaleLowerCase()));
    for (const name of standardBuildingNames) {
      if (!existingBuildingNames.has(name.toLocaleLowerCase())) {
        await addCampusRecord('buildings', { name }, actor);
      }
    }

    const existingCategoryNames = new Set(categories.value.map((category) => category.name.trim().toLocaleLowerCase()));
    for (const name of standardFacilityCategories) {
      if (!existingCategoryNames.has(name.toLocaleLowerCase())) {
        await addCampusRecord('facilityCategories', { name }, actor);
      }
    }
  });
}
function addBuilding() {
  const actor = session.profile;
  if (!actor) return Promise.resolve();
  return save(async () => { await addCampusRecord('buildings', { name: buildingName.value.trim() }, actor); buildingName.value = ''; });
}
function addRoom() {
  const actor = session.profile;
  if (!actor) return Promise.resolve();
  return save(async () => { await addCampusRecord('rooms', { buildingId: roomBuilding.value, name: roomName.value.trim() }, actor); roomName.value = ''; });
}
function addCategory() {
  const actor = session.profile;
  if (!actor) return Promise.resolve();
  return save(async () => { await addCampusRecord('facilityCategories', { name: categoryName.value.trim() }, actor); categoryName.value = ''; });
}
function setActive(type: 'buildings' | 'rooms' | 'facilityCategories', id: string, active: boolean) {
  const actor = session.profile;
  if (!actor) return Promise.resolve();
  return save(() => setCampusActive(type, id, active, actor));
}

onMounted(async () => {
  await session.initialize();
  if (session.profile?.role !== 'admin') { error.value = 'Administrator access is required.'; return; }
  unsubscribers.push(subscribeManagedBuildings((items) => { buildings.value = items; buildingsLoaded.value = true; }, (cause) => { error.value = cause.message; }));
  unsubscribers.push(subscribeManagedCategories((items) => { categories.value = items; categoriesLoaded.value = true; }, (cause) => { error.value = cause.message; }));
  unsubscribers.push(subscribeManagedRooms((items) => { rooms.value = items; }, (cause) => { error.value = cause.message; }));
});
onUnmounted(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));
</script>

<style scoped>
.catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); align-items: start; gap: 13px; }
.panel { padding: 19px; border: 1px solid var(--ion-color-step-150); border-radius: 10px; background: var(--ion-background-color); }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.panel-heading h2 { margin-top: 0; font-size: 16px; }
.panel ion-input, .panel ion-select { margin: 8px 0; }
.record-list { margin: 18px 0 0; padding: 0; list-style: none; }
.record-list li { display: flex; justify-content: space-between; align-items: center; gap: 9px; padding: 10px 0; border-top: 1px solid var(--ion-color-step-100); font-size: 12px; }
.record-list li > span { display: flex; flex-direction: column; gap: 3px; }
.record-list small { color: var(--ion-color-medium); font-size: 9px; }
.record-list button { border: 0; color: var(--ion-color-danger); background: none; font-size: 10px; }
.muted { color: var(--ion-color-medium); font-size: 11px; }
.error-banner { margin-bottom: 12px; color: var(--ion-color-danger); font-size: 12px; }
@media (max-width: 450px) { .panel-heading { align-items: flex-start; flex-direction: column; } }
</style>
