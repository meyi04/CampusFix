<template>
  <AppShell title="Campus announcements" subtitle="Official service updates, facility notices, and important information for the campus community.">
    <div class="announcement-layout">
      <section v-if="session.profile?.role === 'admin'" class="publish-panel">
        <div class="publish-intro">
          <span class="notice-icon"><ion-icon :icon="megaphoneOutline" /></span>
          <div>
            <p class="section-kicker">COMMUNICATIONS</p>
            <h2>Publish a campus notice</h2>
            <p>Share a clear, timely update with the campus community.</p>
          </div>
        </div>
        <form @submit.prevent="publish">
          <ion-input v-model="title" label="Headline" label-placement="stacked" placeholder="Write a clear announcement title" :maxlength="120" required />
          <ion-textarea v-model="body" label="Announcement details" label-placement="stacked" placeholder="Include what people need to know, when it takes effect, and who to contact." :auto-grow="true" :maxlength="2000" required />
          <div class="publish-footer">
            <p v-if="error" class="error-text" role="alert">{{ error }}</p>
            <span v-else class="editor-hint">Visible to signed-in campus users</span>
            <ion-button type="submit" :disabled="busy || title.trim().length < 3 || body.trim().length < 5">
              <ion-icon slot="start" :icon="megaphoneOutline" />
              {{ busy ? 'Publishing...' : 'Publish notice' }}
            </ion-button>
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
        <p class="notice-body">{{ item.body }}</p>
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
import { IonButton, IonIcon, IonInput, IonTextarea } from '@ionic/vue';
import { megaphoneOutline } from 'ionicons/icons';
import AppShell from '@/components/AppShell.vue';
import { createAnnouncement, subscribeAnnouncements } from '@/services/campus';
import { useSessionStore } from '@/stores/session';
import type { CampusAnnouncement } from '@/models/domain';

const session = useSessionStore();
const announcements = ref<CampusAnnouncement[]>([]);
const title = ref('');
const body = ref('');
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
    await createAnnouncement(title.value, body.value, session.profile);
    title.value = '';
    body.value = '';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to publish the announcement.';
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  await session.initialize();
  if (!session.profile) { error.value = session.error ?? 'Sign in to read announcements.'; loading.value = false; return; }
  unsubscribe = subscribeAnnouncements((items) => { announcements.value = items; loading.value = false; }, (cause) => { error.value = cause.message; loading.value = false; });
});
onUnmounted(() => unsubscribe?.());
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
.notice-body { margin: 0; color: var(--ion-color-medium-shade); font-size: 14px; line-height: 1.75; white-space: pre-wrap; }
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
