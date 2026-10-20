<template>
  <AppShell title="Report a facility issue" subtitle="Tell us what needs attention. You can follow the repair here.">
    <form class="form-layout" @submit.prevent="confirmSubmit">
      <section class="form-panel">
        <h2>Issue details</h2>
        <p class="muted">Provide enough detail for the maintenance team to find and assess the issue.</p>
        <ion-input v-model="title" label="Report title" label-placement="stacked" placeholder="e.g. Broken ceiling light" :maxlength="100" required />
        <ion-textarea v-model="description" label="What happened?" label-placement="stacked" placeholder="Describe the issue, when you noticed it, and any safety concerns." :auto-grow="true" :maxlength="2000" required />
        <div class="form-grid">
          <ion-select v-model="category" label="Facility category" label-placement="stacked" interface="popover" placeholder="Select a category" required>
            <ion-select-option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</ion-select-option>
          </ion-select>
          <p v-if="categoriesLoading" class="directory-hint" role="status">Loading facility categories...</p>
          <p v-else-if="categoryError" class="directory-error" role="alert">Facility categories could not be loaded: {{ categoryError }}</p>
          <p v-else-if="!categories.length" class="directory-hint">
            No active facility categories are set up yet. Ask an administrator to add them in the
            <router-link v-if="session.profile?.role === 'admin'" to="/admin/catalog">campus directory</router-link>
            <span v-else>campus directory</span>.
          </p>
          <ion-select v-model="priority" label="Severity" label-placement="stacked" interface="popover" required>
            <ion-select-option v-for="item in REPORT_PRIORITIES" :key="item" :value="item">{{ item }}</ion-select-option>
          </ion-select>
          <ion-select v-model="buildingId" label="Campus building" label-placement="stacked" interface="popover" placeholder="Select a building" required>
            <ion-select-option v-for="item in buildings" :key="item.id" :value="item.id">{{ item.name }}</ion-select-option>
          </ion-select>
          <p v-if="buildingsLoading" class="directory-hint" role="status">Loading campus buildings...</p>
          <p v-else-if="buildingError" class="directory-error" role="alert">Campus buildings could not be loaded: {{ buildingError }}</p>
          <p v-else-if="!buildings.length" class="directory-hint">
            No active campus buildings are set up yet. Ask an administrator to add them in the
            <router-link v-if="session.profile?.role === 'admin'" to="/admin/catalog">campus directory</router-link>
            <span v-else>campus directory</span>.
          </p>
          <ion-select v-if="rooms.length" v-model="room" label="Room or area" label-placement="stacked" interface="popover" placeholder="Select a room">
            <ion-select-option v-for="item in rooms" :key="item.id" :value="item.name">{{ item.name }}</ion-select-option>
            <ion-select-option value="Other location">Other location</ion-select-option>
          </ion-select>
          <ion-input v-else v-model="room" label="Room or specific location" label-placement="stacked" placeholder="e.g. Room 204 or east hallway" />
          <ion-input v-if="room === 'Other location' && rooms.length" v-model="otherLocation" label="Describe the location" label-placement="stacked" required />
        </div>
        <div class="location-row">
          <div><strong>Optional device location</strong><span>GPS is never required to submit your report.</span></div>
          <ion-button type="button" fill="outline" size="small" :disabled="locationBusy" @click="addLocation">
            {{ location ? 'Location added' : locationBusy ? 'Finding...' : 'Add location' }}
          </ion-button>
        </div>
        <p v-if="locationError" class="error-text">{{ locationError }}</p>
      </section>

      <section class="form-panel">
        <div class="section-title-row">
          <div><h2>Photos</h2><p class="muted">Add up to five images (5 MB each, 6 MB combined). A photo helps staff assess the issue.</p></div>
          <ion-button type="button" fill="outline" size="small" @click="takePhoto">Use camera</ion-button>
        </div>
        <label class="upload-drop">
          <input type="file" accept="image/*" multiple @change="selectPhotos" />
          <ion-icon :icon="imageOutline" />
          <strong>Choose photos</strong>
          <span>JPG, PNG, or another image format · max 5 MB each</span>
        </label>
        <div v-if="photoPreviews.length" class="photo-grid">
          <figure v-for="(photo, index) in photoPreviews" :key="photo.url">
            <img :src="photo.url" :alt="photo.file.name" />
            <figcaption>{{ photo.file.name }} <button type="button" @click="removePhoto(index)">Remove</button></figcaption>
          </figure>
        </div>
      </section>

      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <div v-if="busy" class="upload-progress" role="status">
        <span>Uploading and submitting your report</span><span>{{ progress }}%</span>
        <ion-progress-bar :value="progress / 100" />
      </div>
      <ion-button expand="block" type="submit" :disabled="busy || !session.profile" class="submit-button">
        {{ busy ? 'Submitting...' : 'Review and submit report' }}
      </ion-button>
    </form>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { alertController, IonButton, IonIcon, IonInput, IonProgressBar, IonSelect, IonSelectOption, IonTextarea } from '@ionic/vue';
import { imageOutline } from 'ionicons/icons';
import AppShell from '@/components/AppShell.vue';
import { subscribeBuildings, subscribeCategories, subscribeRooms } from '@/services/campus';
import { createReport, REPORT_PRIORITIES } from '@/services/reports';
import type { CampusBuilding, CampusCategory, CampusRoom } from '@/models/domain';
import { useSessionStore } from '@/stores/session';

const router = useRouter();
const session = useSessionStore();
const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const title = ref('');
const description = ref('');
const category = ref('');
const priority = ref<'Low' | 'Normal' | 'High' | 'Urgent'>('Normal');
const buildingId = ref('');
const room = ref('');
const otherLocation = ref('');
const buildings = ref<CampusBuilding[]>([]);
const categories = ref<CampusCategory[]>([]);
const rooms = ref<CampusRoom[]>([]);
const photos = ref<File[]>([]);
const photoPreviews = ref<Array<{ file: File; url: string }>>([]);
const location = ref<{ latitude: number; longitude: number } | null>(null);
const locationError = ref('');
const locationBusy = ref(false);
const busy = ref(false);
const progress = ref(0);
const error = ref('');
const buildingsLoading = ref(true);
const categoriesLoading = ref(true);
const buildingError = ref('');
const categoryError = ref('');
let stopBuildings: (() => void) | undefined;
let stopCategories: (() => void) | undefined;
let stopRooms: (() => void) | undefined;

watch(buildingId, (id) => {
  stopRooms?.();
  rooms.value = [];
  room.value = '';
  if (id) stopRooms = subscribeRooms(id, (items) => { rooms.value = items; }, (cause) => { error.value = cause.message; });
});

function selectPhotos(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = Array.from(input.files ?? []);
  error.value = '';
  if (photos.value.length + selected.length > 5) { error.value = 'Choose no more than five photos.'; input.value = ''; return; }
  if ([...photos.value, ...selected].reduce((total, file) => total + file.size, 0) > 6 * 1024 * 1024) {
    error.value = 'The combined photo size cannot exceed 6 MB when stored in Firestore.';
    input.value = '';
    return;
  }
  const invalid = selected.find((file) => !validTypes.includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024);
  if (invalid) { error.value = `${invalid.name} must be a supported image between 1 byte and 5 MB.`; input.value = ''; return; }
  selected.forEach(addPhoto);
  input.value = '';
}

function addPhoto(file: File) {
  if (photos.value.reduce((total, existing) => total + existing.size, file.size) > 6 * 1024 * 1024) {
    throw new Error('The combined photo size cannot exceed 6 MB when stored in Firestore.');
  }
  photos.value = [...photos.value, file];
  photoPreviews.value = [...photoPreviews.value, { file, url: URL.createObjectURL(file) }];
}

function removePhoto(index: number) {
  URL.revokeObjectURL(photoPreviews.value[index].url);
  photos.value = photos.value.filter((_, photoIndex) => photoIndex !== index);
  photoPreviews.value = photoPreviews.value.filter((_, photoIndex) => photoIndex !== index);
}

async function takePhoto() {
  error.value = '';
  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
    });
    if (!photo.dataUrl) throw new Error('The camera did not return an image.');
    const blob = await (await fetch(photo.dataUrl)).blob();
    const file = new File([blob], `campusfix-${Date.now()}.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
    if (photos.value.length >= 5) throw new Error('Choose no more than five photos.');
    if (!validTypes.includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error('Choose a supported image no larger than 5 MB.');
    addPhoto(file);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to access a photo. You can still choose a file instead.';
  }
}

async function addLocation() {
  locationError.value = '';
  locationBusy.value = true;
  try {
    const point = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
    location.value = { latitude: point.coords.latitude, longitude: point.coords.longitude };
  } catch (cause) {
    locationError.value = cause instanceof Error ? cause.message : 'Location was unavailable. You can still submit without it.';
  } finally {
    locationBusy.value = false;
  }
}

async function confirmSubmit() {
  error.value = '';
  const reporter = session.profile;
  if (!reporter) { error.value = 'Sign in to submit a report.'; return; }
  if (!title.value.trim() || title.value.trim().length < 5) { error.value = 'Enter a title with at least 5 characters.'; return; }
  if (!description.value.trim() || description.value.trim().length < 20) { error.value = 'Describe the issue in at least 20 characters.'; return; }
  const building = buildings.value.find((item) => item.id === buildingId.value);
  if (!building) { error.value = 'Select a campus building from the available list.'; return; }
  const categoryItem = categories.value.find((item) => item.id === category.value);
  if (!categoryItem) { error.value = 'Select a facility category.'; return; }
  const confirmation = await alertController.create({
    header: 'Submit this report?',
    message: 'Your report and any attached photos will be shared with authorized campus staff.',
    buttons: [{ text: 'Review', role: 'cancel' }, { text: 'Submit report', role: 'confirm' }],
  });
  await confirmation.present();
  if ((await confirmation.onDidDismiss()).role !== 'confirm') return;
  busy.value = true;
  progress.value = 0;
  try {
    const input = {
      title: title.value,
      description: description.value,
      category: categoryItem.name,
      categoryId: categoryItem.id,
      buildingId: building.id,
      buildingName: building.name,
      room: (room.value === 'Other location' ? otherLocation.value : room.value).trim(),
      priority: priority.value,
      photos: photos.value,
      ...(location.value ?? {}),
    };
    const id = await createReport(input, reporter, (value) => { progress.value = value; });
    await router.replace(`/reports/${id}`);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to submit the report. Please try again.';
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await session.initialize();
  if (!session.profile) { error.value = session.error ?? 'Sign in to submit a report.'; return; }
  stopBuildings = subscribeBuildings((items) => {
    buildings.value = items;
    buildingsLoading.value = false;
    buildingError.value = '';
  }, (cause) => {
    buildingsLoading.value = false;
    buildingError.value = cause.message;
  });
  stopCategories = subscribeCategories((items) => {
    categories.value = items;
    categoriesLoading.value = false;
    categoryError.value = '';
  }, (cause) => {
    categoriesLoading.value = false;
    categoryError.value = cause.message;
  });
});
onUnmounted(() => {
  stopBuildings?.();
  stopCategories?.();
  stopRooms?.();
  photoPreviews.value.forEach((photo) => URL.revokeObjectURL(photo.url));
});
</script>

<style scoped>
.form-layout { max-width: 820px; }
.form-panel { margin-bottom: 14px; padding: 22px; border: 1px solid var(--ion-color-step-150); border-radius: 10px; background: var(--ion-background-color); }
.form-panel h2 { margin: 0 0 7px; font-size: 17px; }
.muted { margin: 0 0 18px; color: var(--ion-color-medium); font-size: 12px; line-height: 1.5; }
ion-input, ion-textarea, ion-select { margin: 16px 0; }
.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 20px; }
.location-row, .section-title-row { display: flex; justify-content: space-between; align-items: center; gap: 15px; }
.location-row { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--ion-color-step-100); }
.location-row div { display: flex; flex-direction: column; gap: 4px; }
.location-row strong { font-size: 12px; }
.location-row span { color: var(--ion-color-medium); font-size: 11px; }
.section-title-row { align-items: flex-start; }
.upload-drop { display: flex; min-height: 130px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 1px dashed var(--ion-color-step-400); border-radius: 9px; color: var(--ion-color-medium); cursor: pointer; font-size: 11px; text-align: center; }
.upload-drop input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
.upload-drop ion-icon { color: var(--ion-color-primary); font-size: 24px; }
.upload-drop strong { color: var(--ion-text-color); font-size: 13px; }
.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-top: 14px; }
.photo-grid figure { overflow: hidden; margin: 0; border: 1px solid var(--ion-color-step-150); border-radius: 8px; }
.photo-grid img { display: block; width: 100%; height: 110px; object-fit: cover; }
.photo-grid figcaption { display: flex; justify-content: space-between; gap: 6px; padding: 7px; font-size: 10px; }
.photo-grid button { border: 0; color: var(--ion-color-danger); background: none; font-size: 10px; }
.upload-progress { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin: 14px 0; font-size: 12px; }
.upload-progress ion-progress-bar { grid-column: 1 / -1; }
.error-text { color: var(--ion-color-danger); font-size: 12px; }
.directory-hint, .directory-error { grid-column: 1 / -1; margin: -12px 0 5px; font-size: 11px; line-height: 1.5; }
.directory-hint { color: var(--ion-color-medium); }
.directory-hint a { color: var(--ion-color-primary); }
.directory-error { color: var(--ion-color-danger); }
.submit-button { margin: 18px 0 30px; }
@media (max-width: 600px) { .form-panel { padding: 16px; } .form-grid { grid-template-columns: 1fr; } .section-title-row { align-items: flex-start; flex-direction: column; } }
</style>
