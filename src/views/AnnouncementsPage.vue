<template>
  <AppShell title="Campus announcements" subtitle="Official service updates, facility notices, and important information for the campus community.">
    <div class="announcement-layout">
      <section v-if="session.profile?.role === 'admin'" class="publish-panel">
        <div class="publish-intro">
          <span class="notice-icon"><ion-icon :icon="megaphoneOutline" /></span>
          <div>
            <p class="section-kicker">COMMUNICATIONS</p>
            <h2>{{ editingAnnouncement ? 'Edit campus notice' : 'Publish a campus notice' }}</h2>
            <p>Share a clear, timely update with the campus community.</p>
          </div>
        </div>
        <form @submit.prevent="publish">
          <ion-input v-model="title" label="Headline" label-placement="stacked" placeholder="Write a clear announcement title" :maxlength="120" required />
          <ion-textarea v-model="body" label="Announcement details" label-placement="stacked" placeholder="Include what people need to know, when it takes effect, and who to contact." :auto-grow="true" :maxlength="2000" required />
          <div class="image-field">
            <label for="announcement-image">Image <span>(optional, JPEG/PNG/WebP up to 5 MB)</span></label>
            <input id="announcement-image" ref="imageInput" type="file" accept="image/jpeg,image/png,image/webp" @change="selectImage" />
            <img v-if="imagePreviewUrl || editingImageUrl && !removeExistingImage" class="image-preview" :src="imagePreviewUrl || editingImageUrl" alt="Announcement image preview" />
            <button
              v-if="editingImageUrl && !removeExistingImage && !selectedImage"
              type="button"
              class="remove-image"
              @click="removeExistingImage = true"
            >
              Remove current image
            </button>
            <span v-if="selectedImage" class="selected-file">{{ selectedImage.name }}</span>
          </div>
          <div class="publish-footer">
            <p v-if="error" class="error-text" role="alert">{{ error }}</p>
            <span v-else class="editor-hint">Visible to signed-in campus users</span>
            <ion-button type="submit" :disabled="busy || title.trim().length < 3 || body.trim().length < 5">
              <ion-icon slot="start" :icon="megaphoneOutline" />
              {{ busy ? 'Saving...' : editingAnnouncement ? 'Save changes' : 'Publish notice' }}
            </ion-button>
            <ion-button v-if="editingAnnouncement" type="button" fill="clear" :disabled="busy" @click="cancelEdit">Cancel</ion-button>
          </div>
        </form>
      </section>
      <p v-else-if="error" class="error-text" role="alert">{{ error }}</p>
      <div class="feed-heading">
        <div><p class="section-kicker">LATEST UPDATES</p><h2>From around campus</h2></div>
        <span v-if="!loading" class="notice-count">{{ announcements.length }} {{ announcements.length === 1 ? 'notice' : 'notices' }}</span>
      </div>
      <div v-if="loading" class="empty-state">Loading campus notices...</div>
      <article v-for="item in announcements" :key="item.id" class="announcement">
        <div class="notice-meta">
          <span class="notice-label">CAMPUS NOTICE</span>
          <time :datetime="dateTime(item.createdAt)">{{ formatDate(item.createdAt) }}</time>
        </div>
        <h3>{{ item.title }}</h3>
        <img v-if="item.imageUrl" class="notice-image" :src="item.imageUrl" :alt="`Image for ${item.title}`" loading="lazy" />
        <p class="notice-body">{{ item.body }}</p>
        <div v-if="session.profile?.role === 'admin'" class="notice-actions">
          <ion-button fill="outline" size="small" :disabled="busy" @click="beginEdit(item)">Edit</ion-button>
          <ion-button fill="clear" color="danger" size="small" :disabled="busy" @click="confirmDelete(item)">Delete</ion-button>
        </div>
        <footer class="notice-author">
          <span class="author-avatar">{{ initials(item.authorName) }}</span>
          <span><strong>{{ item.authorName || 'MinSU Facilities Office' }}</strong><small>Official campus communication</small></span>
        </footer>
      </article>
      <div v-if="!loading && !announcements.length" class="empty-state">
        <span class="notice-icon"><ion-icon :icon="megaphoneOutline" /></span>
        <strong>No current announcements</strong>
        <span>Official campus notices will appear here when published.</span>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { alertController, IonButton, IonIcon, IonInput, IonTextarea } from '@ionic/vue';
import { megaphoneOutline } from 'ionicons/icons';
import AppShell from '@/components/AppShell.vue';
import { createAnnouncement, deleteAnnouncement, subscribeAnnouncements, updateAnnouncement } from '@/services/campus';
import { useSessionStore } from '@/stores/session';
import type { CampusAnnouncement } from '@/models/domain';

const session = useSessionStore();
const announcements = ref<CampusAnnouncement[]>([]);
const title = ref('');
const body = ref('');
const editingAnnouncement = ref<CampusAnnouncement | null>(null);
const editingImageUrl = ref('');
const removeExistingImage = ref(false);
const selectedImage = ref<File | null>(null);
const imagePreviewUrl = ref('');
const imageInput = ref<HTMLInputElement | null>(null);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
let unsubscribe: (() => void) | undefined;
function formatDate(value: CampusAnnouncement['createdAt']) {
  return value?.toDate ? value.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now';
}
function dateTime(value: CampusAnnouncement['createdAt']) { return value?.toDate?.().toISOString() ?? ''; }
function initials(name?: string) {
  return (name || 'MinSU').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}
async function publish() {
  if (!session.profile || session.profile.role !== 'admin') return;
  busy.value = true;
  error.value = '';
  try {
    if (editingAnnouncement.value) {
      await updateAnnouncement(editingAnnouncement.value, title.value, body.value, session.profile, {
        imageFile: selectedImage.value ?? undefined,
        removeImage: removeExistingImage.value,
      });
    } else {
      await createAnnouncement(title.value, body.value, session.profile, selectedImage.value ?? undefined);
    }
    cancelEdit();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to publish the announcement.';
  } finally {
    busy.value = false;
  }
}
function selectImage(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0] ?? null;
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
  selectedImage.value = file;
  imagePreviewUrl.value = file ? URL.createObjectURL(file) : '';
  if (file) removeExistingImage.value = false;
}
function beginEdit(item: CampusAnnouncement) {
  editingAnnouncement.value = item;
  title.value = item.title;
  body.value = item.body;
  editingImageUrl.value = item.imageUrl ?? '';
  removeExistingImage.value = false;
  selectedImage.value = null;
  if (imageInput.value) imageInput.value.value = '';
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
  imagePreviewUrl.value = '';
  error.value = '';
}
function cancelEdit() {
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
  editingAnnouncement.value = null;
  editingImageUrl.value = '';
  removeExistingImage.value = false;
  selectedImage.value = null;
  imagePreviewUrl.value = '';
  title.value = '';
  body.value = '';
  if (imageInput.value) imageInput.value.value = '';
}
async function confirmDelete(item: CampusAnnouncement) {
  const alert = await alertController.create({
    header: 'Delete announcement?',
    message: `“${item.title}” will be removed from the campus news feed.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'confirm',
        handler: async () => {
          if (!session.profile || session.profile.role !== 'admin') return;
          busy.value = true;
          error.value = '';
          try {
            await deleteAnnouncement(item, session.profile);
            if (editingAnnouncement.value?.id === item.id) cancelEdit();
          } catch (cause) {
            error.value = cause instanceof Error ? cause.message : 'Unable to delete the announcement.';
          } finally {
            busy.value = false;
          }
        },
      },
    ],
  });
  await alert.present();
}
onMounted(async () => {
  await session.initialize();
  if (!session.profile) { error.value = session.error ?? 'Sign in to read announcements.'; loading.value = false; return; }
  unsubscribe = subscribeAnnouncements((items) => { announcements.value = items; loading.value = false; }, (cause) => { error.value = cause.message; loading.value = false; });
});
onUnmounted(() => {
  unsubscribe?.();
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
});
</script>

<style scoped>
.announcement-layout { max-width: 980px; margin: 0 auto; }
.publish-panel, .announcement { margin-bottom: 20px; border: 1px solid var(--campus-border); border-radius: 16px; background: var(--ion-background-color); box-shadow: var(--campus-shadow); }
.publish-panel { padding: 24px 28px; }
.publish-intro { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.notice-icon { display: grid; width: 46px; height: 46px; flex: 0 0 46px; place-items: center; border-radius: 14px; color: var(--ion-color-primary); background: #eaf3ed; font-size: 22px; }
.section-kicker { margin: 0 0 5px; color: var(--ion-color-primary); font-size: 10px; font-weight: 750; letter-spacing: .12em; }
.publish-intro h2, .feed-heading h2 { margin: 0; font-size: 19px; letter-spacing: -.015em; }
.publish-intro p:last-child { margin: 5px 0 0; color: var(--ion-color-medium); font-size: 12px; line-height: 1.5; }
.publish-panel ion-input, .publish-panel ion-textarea { margin: 12px 0; }
.publish-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.editor-hint { color: var(--ion-color-medium); font-size: 11px; }
.feed-heading { display: flex; justify-content: space-between; align-items: end; gap: 12px; margin: 30px 2px 14px; }
.notice-count { padding: 6px 10px; border: 1px solid var(--campus-border); border-radius: 20px; color: var(--ion-color-medium-shade); background: white; font-size: 11px; }
.announcement { position: relative; overflow: hidden; padding: 25px 28px 21px; }
.announcement::before { position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--ion-color-primary); content: ''; }
.notice-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.notice-label { color: var(--ion-color-primary); font-size: 9px; font-weight: 800; letter-spacing: .12em; }
.notice-meta time { color: var(--ion-color-medium); font-size: 11px; }
.announcement h3 { margin: 14px 0 9px; font-size: clamp(18px, 2.5vw, 22px); line-height: 1.35; letter-spacing: -.02em; }
.notice-image { display: block; width: 100%; max-height: 390px; margin: 14px 0; border-radius: 11px; object-fit: cover; }
.notice-body { margin: 0; color: var(--ion-color-medium-shade); font-size: 14px; line-height: 1.75; white-space: pre-wrap; }
.notice-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 12px; }
.image-field { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin: 14px 0; }
.image-field label { color: var(--ion-text-color); font-size: 13px; font-weight: 600; }
.image-field label span { color: var(--ion-color-medium); font-size: 11px; font-weight: 400; }
.image-field input { max-width: 100%; font-size: 12px; }
.image-preview { width: min(100%, 360px); max-height: 220px; border-radius: 9px; object-fit: cover; }
.remove-image { padding: 0; border: 0; color: var(--ion-color-danger); background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
.selected-file { color: var(--ion-color-medium); font-size: 11px; }
.notice-author { display: flex; align-items: center; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--campus-border); }
.author-avatar { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; color: var(--ion-color-primary); background: #eaf3ed; font-size: 11px; font-weight: 750; }
.notice-author > span:last-child { display: grid; gap: 3px; }
.notice-author strong { font-size: 11px; }
.notice-author small { color: var(--ion-color-medium); font-size: 10px; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 42px 20px; border: 1px dashed var(--campus-border); border-radius: 14px; color: var(--ion-color-medium); background: rgba(255,255,255,.7); text-align: center; }
.empty-state strong { color: var(--ion-text-color); }
.empty-state .notice-icon { margin-bottom: 5px; }
.error-text { color: var(--ion-color-danger); font-size: 12px; }
@media (max-width: 600px) { .publish-panel, .announcement { padding: 18px; border-radius: 13px; } .publish-footer { align-items: flex-start; flex-direction: column; } .publish-footer ion-button { margin: 0; } }
</style>
