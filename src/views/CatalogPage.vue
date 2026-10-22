<template>
  <AppShell title="Campus directory" subtitle="Keep campus locations and report categories organized in one place.">
    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
    <section class="directory-overview" aria-label="Directory overview">
      <article class="overview-card">
        <span class="overview-label">Buildings</span>
        <strong>{{ activeBuildings.length }}</strong>
        <span class="overview-detail">active locations</span>
      </article>
      <article class="overview-card">
        <span class="overview-label">Rooms and areas</span>
        <strong>{{ activeRooms.length }}</strong>
        <span class="overview-detail">active spaces</span>
      </article>
      <article class="overview-card">
        <span class="overview-label">Categories</span>
        <strong>{{ activeCategories.length }}</strong>
        <span class="overview-detail">available for reports</span>
      </article>
    </section>

    <section class="directory-panel">
      <nav class="directory-tabs" aria-label="Directory sections">
        <button
          v-for="tab in directoryTabs"
          :key="tab.id"
          type="button"
          class="directory-tab"
          :class="{ selected: activeSection === tab.id }"
          :aria-current="activeSection === tab.id ? 'page' : undefined"
          @click="selectSection(tab.id)"
        >
          <span>{{ tab.label }}</span>
          <span class="tab-count">{{ tab.count }}</span>
        </button>
      </nav>

      <div class="section-content">
        <div class="section-heading">
          <div>
            <h2>{{ currentSectionTitle }}</h2>
            <p>{{ currentSectionDescription }}</p>
          </div>
          <ion-button
            v-if="activeSection === 'buildings'"
            type="button"
            fill="outline"
            size="small"
            :disabled="busy || !directoryReady"
            @click="addStandardCampusOptions"
          >
            Add standard options
          </ion-button>
        </div>

        <form v-if="activeSection === 'buildings'" class="add-form" @submit.prevent="addBuilding">
          <ion-input v-model="buildingName" label="Building name" label-placement="stacked" placeholder="e.g. Admin Building" :maxlength="100" required />
          <ion-button type="submit" :disabled="busy || !buildingName.trim()">Add building</ion-button>
        </form>
        <form v-else-if="activeSection === 'rooms'" class="add-form room-form" @submit.prevent="addRoom">
          <ion-select v-model="roomBuilding" label="Building" label-placement="stacked" interface="popover" placeholder="Choose a building" required>
            <ion-select-option v-for="item in activeBuildings" :key="item.id" :value="item.id">{{ item.name }}</ion-select-option>
          </ion-select>
          <ion-input v-model="roomName" label="Room or area" label-placement="stacked" placeholder="e.g. Room 204" :maxlength="100" required />
          <ion-button type="submit" :disabled="busy || !roomName.trim() || !roomBuilding">Add room</ion-button>
        </form>
        <form v-else class="add-form" @submit.prevent="addCategory">
          <ion-input v-model="categoryName" label="Category name" label-placement="stacked" placeholder="e.g. Electrical" :maxlength="100" required />
          <ion-button type="submit" :disabled="busy || !categoryName.trim()">Add category</ion-button>
        </form>

        <div class="list-toolbar">
          <label class="search-control">
            <span class="sr-only">Search {{ currentSectionTitle.toLowerCase() }}</span>
            <ion-icon :icon="searchOutline" aria-hidden="true" />
            <input v-model="searchQuery" type="search" :placeholder="`Search ${currentSectionTitle.toLowerCase()}...`" />
          </label>
          <label class="inactive-toggle">
            <input v-model="showInactive" type="checkbox" />
            <span>Show inactive</span>
          </label>
        </div>

        <ul v-if="activeSection === 'buildings'" class="record-list">
          <li v-for="item in filteredBuildings" :key="item.id" class="record-row">
            <span class="record-icon"><ion-icon :icon="businessOutline" aria-hidden="true" /></span>
            <span class="record-details"><strong>{{ item.name }}</strong><small>{{ item.active ? 'Active' : 'Inactive' }}</small></span>
            <button class="status-action" :class="{ reactivate: !item.active }" type="button" :disabled="busy" @click="setActive('buildings', item.id, !item.active)">{{ item.active ? 'Deactivate' : 'Reactivate' }}</button>
          </li>
        </ul>
        <ul v-else-if="activeSection === 'rooms'" class="record-list">
          <li v-for="item in filteredRooms" :key="item.id" class="record-row">
            <span class="record-icon"><ion-icon :icon="locationOutline" aria-hidden="true" /></span>
            <span class="record-details"><strong>{{ item.name }}</strong><small>{{ buildingNameFor(item.buildingId) }} · {{ item.active ? 'Active' : 'Inactive' }}</small></span>
            <button class="status-action" :class="{ reactivate: !item.active }" type="button" :disabled="busy" @click="setActive('rooms', item.id, !item.active)">{{ item.active ? 'Deactivate' : 'Reactivate' }}</button>
          </li>
        </ul>
        <ul v-else class="record-list">
          <li v-for="item in filteredCategories" :key="item.id" class="record-row">
            <span class="record-icon"><ion-icon :icon="constructOutline" aria-hidden="true" /></span>
            <span class="record-details"><strong>{{ item.name }}</strong><small>{{ item.active ? 'Active' : 'Inactive' }}</small></span>
            <button class="status-action" :class="{ reactivate: !item.active }" type="button" :disabled="busy" @click="setActive('facilityCategories', item.id, !item.active)">{{ item.active ? 'Deactivate' : 'Reactivate' }}</button>
          </li>
        </ul>

        <div v-if="!currentFilteredCount && !normalizedSearch" class="empty-state">
          <strong>{{ emptyTitle }}</strong>
          <span>{{ emptyDescription }}</span>
        </div>
        <div v-else-if="!currentFilteredCount" class="empty-state">
          <strong>No matching entries</strong>
          <span>Try another search or turn on “Show inactive”.</span>
        </div>
      </div>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { IonButton, IonIcon, IonInput, IonSelect, IonSelectOption } from '@ionic/vue';
import { businessOutline, constructOutline, locationOutline, searchOutline } from 'ionicons/icons';
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
const activeSection = ref<'buildings' | 'rooms' | 'categories'>('buildings');
const searchQuery = ref('');
const showInactive = ref(false);
const error = ref('');
const busy = ref(false);
const buildingsLoaded = ref(false);
const categoriesLoaded = ref(false);
const unsubscribers: Array<() => void> = [];
const activeBuildings = computed(() => buildings.value.filter((building) => building.active));
const activeRooms = computed(() => rooms.value.filter((room) => room.active));
const activeCategories = computed(() => categories.value.filter((category) => category.active));
const directoryReady = computed(() => buildingsLoaded.value && categoriesLoaded.value);
const directoryTabs = computed(() => [
  { id: 'buildings' as const, label: 'Buildings', count: buildings.value.length },
  { id: 'rooms' as const, label: 'Rooms & areas', count: rooms.value.length },
  { id: 'categories' as const, label: 'Categories', count: categories.value.length },
]);
const normalizedSearch = computed(() => searchQuery.value.trim().toLocaleLowerCase());
const filteredBuildings = computed(() => buildings.value.filter((item) =>
  (showInactive.value || item.active) && item.name.toLocaleLowerCase().includes(normalizedSearch.value)));
const filteredRooms = computed(() => rooms.value.filter((item) =>
  (showInactive.value || item.active)
  && `${item.name} ${buildingNameFor(item.buildingId)}`.toLocaleLowerCase().includes(normalizedSearch.value)));
const filteredCategories = computed(() => categories.value.filter((item) =>
  (showInactive.value || item.active) && item.name.toLocaleLowerCase().includes(normalizedSearch.value)));
const currentSectionTitle = computed(() => directoryTabs.value.find((tab) => tab.id === activeSection.value)?.label ?? 'Buildings');
const currentSectionDescription = computed(() => ({
  buildings: 'Manage campus buildings and locations.',
  rooms: 'Keep rooms and shared areas connected to the right building.',
  categories: 'Choose the facility issue types available in report forms.',
})[activeSection.value]);
const currentSectionCount = computed(() => ({
  buildings: buildings.value.length,
  rooms: rooms.value.length,
  categories: categories.value.length,
})[activeSection.value]);
const currentFilteredCount = computed(() => ({
  buildings: filteredBuildings.value.length,
  rooms: filteredRooms.value.length,
  categories: filteredCategories.value.length,
})[activeSection.value]);
const emptyTitle = computed(() => currentSectionCount.value
  ? 'No active entries are shown'
  : `No ${currentSectionTitle.value.toLocaleLowerCase()} yet`);
const emptyDescription = computed(() => currentSectionCount.value
  ? 'Turn on “Show inactive” to review inactive records.'
  : 'Add your first entry using the form above.');
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
function selectSection(section: 'buildings' | 'rooms' | 'categories') {
  activeSection.value = section;
  searchQuery.value = '';
}
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
.directory-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
.overview-card { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 3px 12px; padding: 16px 18px; border: 1px solid var(--ion-color-step-150); border-radius: 12px; background: var(--ion-background-color); box-shadow: 0 5px 18px rgba(25, 55, 38, .035); }
.overview-label { color: var(--ion-color-medium); font-size: 12px; font-weight: 650; }
.overview-card strong { grid-column: 2; grid-row: 1 / span 2; color: var(--ion-color-primary); font-size: 28px; line-height: 1; }
.overview-detail { color: var(--ion-color-medium); font-size: 10px; }
.directory-panel { overflow: hidden; border: 1px solid var(--ion-color-step-150); border-radius: 13px; background: var(--ion-background-color); box-shadow: 0 8px 28px rgba(25, 55, 38, .045); }
.directory-tabs { display: flex; gap: 4px; overflow-x: auto; padding: 9px 12px 0; border-bottom: 1px solid var(--ion-color-step-150); scrollbar-width: thin; }
.directory-tab { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 8px; padding: 12px 14px; border: 0; border-bottom: 2px solid transparent; color: var(--ion-color-medium); background: transparent; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.directory-tab:hover, .directory-tab:focus-visible { color: var(--ion-color-primary); }
.directory-tab:focus-visible, .status-action:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
.directory-tab.selected { border-bottom-color: var(--ion-color-primary); color: var(--ion-color-primary); }
.tab-count { min-width: 22px; padding: 3px 6px; border-radius: 20px; color: var(--ion-color-medium); background: var(--campus-surface); font-size: 10px; text-align: center; }
.section-content { padding: 22px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.section-heading h2 { margin: 0; font-size: 18px; }
.section-heading p { margin: 6px 0 0; color: var(--ion-color-medium); font-size: 12px; }
.add-form { display: grid; grid-template-columns: minmax(180px, 1fr) auto; align-items: end; gap: 12px; padding: 15px; border: 1px solid var(--ion-color-step-150); border-radius: 10px; background: var(--campus-surface); }
.room-form { grid-template-columns: minmax(160px, .8fr) minmax(180px, 1fr) auto; }
.add-form ion-input, .add-form ion-select { min-width: 0; margin: 0; --background: var(--ion-background-color); --border-radius: 8px; }
.add-form ion-button { height: 40px; margin: 0; white-space: nowrap; }
.list-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 20px 0 8px; }
.search-control { display: flex; flex: 1; align-items: center; gap: 9px; max-width: 440px; min-height: 40px; padding: 0 12px; border: 1px solid var(--ion-color-step-150); border-radius: 8px; color: var(--ion-color-medium); background: var(--ion-background-color); }
.search-control:focus-within { border-color: var(--ion-color-primary); box-shadow: 0 0 0 2px rgba(21, 91, 59, .1); }
.search-control ion-icon { font-size: 17px; }
.search-control input { width: 100%; min-width: 0; padding: 9px 0; border: 0; outline: 0; color: var(--ion-text-color); background: transparent; font: inherit; font-size: 12px; }
.search-control input::placeholder { color: var(--ion-color-medium); }
.inactive-toggle { display: flex; align-items: center; gap: 7px; color: var(--ion-color-medium); font-size: 11px; white-space: nowrap; cursor: pointer; }
.inactive-toggle input { accent-color: var(--ion-color-primary); }
.record-list { margin: 0; padding: 0; list-style: none; }
.record-row { display: flex; align-items: center; gap: 12px; min-height: 62px; padding: 9px 4px; border-top: 1px solid var(--ion-color-step-100); }
.record-icon { display: grid; flex: 0 0 36px; width: 36px; height: 36px; place-items: center; border-radius: 9px; color: var(--ion-color-primary); background: #eaf3ed; }
.record-icon ion-icon { font-size: 18px; }
.record-details { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.record-details strong { overflow: hidden; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.record-details small { color: var(--ion-color-medium); font-size: 10px; }
.status-action { padding: 7px 10px; border: 1px solid var(--ion-color-step-150); border-radius: 7px; color: var(--ion-color-danger); background: var(--ion-background-color); font: inherit; font-size: 10px; font-weight: 650; cursor: pointer; }
.status-action:hover:not(:disabled) { border-color: var(--ion-color-danger); background: #fff7f6; }
.status-action.reactivate { color: var(--ion-color-success-shade); }
.status-action.reactivate:hover:not(:disabled) { border-color: var(--ion-color-success); background: #f3faf5; }
.status-action:disabled { opacity: .55; cursor: not-allowed; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 34px 16px; color: var(--ion-color-medium); text-align: center; }
.empty-state strong { color: var(--ion-text-color); font-size: 13px; }
.empty-state span { font-size: 11px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
.error-banner { margin-bottom: 12px; padding: 12px 14px; border: 1px solid rgba(191, 54, 54, .2); border-radius: 8px; color: var(--ion-color-danger); background: rgba(191, 54, 54, .06); font-size: 12px; }
@media (max-width: 700px) {
  .directory-overview { gap: 8px; }
  .overview-card { padding: 12px; }
  .overview-label { font-size: 10px; }
  .overview-detail { font-size: 9px; }
  .overview-card strong { font-size: 23px; }
  .section-content { padding: 16px; }
  .room-form { grid-template-columns: 1fr 1fr; }
  .room-form ion-button { grid-column: 1 / -1; justify-self: start; }
}
@media (max-width: 480px) {
  .directory-overview { grid-template-columns: 1fr; }
  .overview-card { grid-template-columns: 1fr auto; }
  .overview-card strong { grid-column: 2; grid-row: 1 / span 2; }
  .section-heading { flex-direction: column; }
  .add-form, .room-form { grid-template-columns: 1fr; }
  .room-form ion-button { grid-column: auto; }
  .add-form ion-button { justify-self: start; }
  .list-toolbar { align-items: flex-start; flex-direction: column; }
  .search-control { box-sizing: border-box; width: 100%; max-width: none; }
  .record-row { gap: 9px; }
  .status-action { padding: 7px; }
}
</style>
