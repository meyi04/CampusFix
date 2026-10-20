<template>
  <AppShell title="Report details" subtitle="Review the issue, follow its maintenance history, and see the latest status.">
    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
    <div v-if="loading" class="loading-panel">Loading report details...</div>
    <template v-else-if="report">
      <div class="detail-grid">
        <section class="panel report-overview">
          <div class="top-row">
            <span class="status-chip" :class="report.status.toLowerCase().replaceAll(' ', '-')">{{ report.status }}</span>
            <div class="priority-control">
              <span class="priority" :class="report.priority.toLowerCase()">{{ report.priority }} priority</span>
              <ion-select v-if="session.profile?.role === 'admin'" v-model="prioritySelection" interface="popover" aria-label="Report priority" @ion-change="savePriority">
                <ion-select-option v-for="priority in REPORT_PRIORITIES" :key="priority" :value="priority">{{ priority }}</ion-select-option>
              </ion-select>
            </div>
          </div>
          <h2>{{ report.title }}</h2>
          <p class="description">{{ report.description }}</p>
          <div class="facts-grid">
            <div><span>Building</span><strong>{{ report.buildingName }}</strong></div>
            <div><span>Room or area</span><strong>{{ report.room || 'Not specified' }}</strong></div>
            <div><span>Category</span><strong>{{ report.category }}</strong></div>
            <div><span>Reported by</span><strong>{{ report.reporterName }}</strong></div>
            <div><span>Submitted</span><strong>{{ formatDate(report.createdAt) }}</strong></div>
            <div><span>Assigned to</span><strong>{{ report.assignedToName || 'Not yet assigned' }}</strong></div>
          </div>
          <div v-if="report.latitude !== undefined && report.longitude !== undefined" class="location-info">
            <a :href="`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=18/${report.latitude}/${report.longitude}`" target="_blank" rel="noopener noreferrer">View optional location on OpenStreetMap</a>
          </div>
          <div v-if="reportedPhotoUrls.length" class="photo-section">
            <h3>Reported photos</h3>
            <div class="photo-grid">
              <a v-for="(url, index) in reportedPhotoUrls" :key="`${index}-${url.slice(0, 48)}`" :href="url" target="_blank" rel="noopener noreferrer"><img :src="url" :alt="`Reported facility photo ${index + 1}`" /></a>
            </div>
          </div>
          <div v-if="report.maintenancePhotos?.length" class="photo-section">
            <h3>Maintenance photos</h3>
            <div class="photo-grid">
              <figure v-for="(photo, index) in report.maintenancePhotos" :key="`${photo.photoId ?? photo.url}-${index}`">
                <a v-if="maintenancePhotoUrl(photo)" :href="maintenancePhotoUrl(photo)" target="_blank" rel="noopener noreferrer"><img :src="maintenancePhotoUrl(photo)" :alt="`${photo.phase} maintenance photo ${index + 1}`" /></a>
                <figcaption>{{ photo.phase === 'before' ? 'Before repair' : 'After repair' }}</figcaption>
              </figure>
            </div>
          </div>
          <p v-if="photosError" class="error-banner" role="alert">{{ photosError }}</p>
          <div v-if="report.resolutionNotes" class="resolution">
            <h3>Resolution notes</h3>
            <p>{{ report.resolutionNotes }}</p>
          </div>
        </section>

        <section class="panel history-panel">
          <h2>Comments</h2>
          <p class="muted">Share additional details with the people authorized to work on this report.</p>
          <div v-if="commentsError" class="error-banner">{{ commentsError }}</div>
          <article v-for="comment in comments" :key="comment.id" class="comment">
            <strong>{{ comment.authorName }}</strong><span>{{ formatDate(comment.createdAt) }}</span>
            <p>{{ comment.body }}</p>
          </article>
          <form v-if="session.profile" class="comment-form" @submit.prevent="postComment">
            <ion-textarea v-model="commentText" label="Add a comment" label-placement="stacked" :auto-grow="true" :maxlength="1000" required />
            <p v-if="commentError" class="error-banner">{{ commentError }}</p>
            <ion-button type="submit" size="small" :disabled="commentBusy || commentText.trim().length < 2">
              {{ commentBusy ? 'Posting...' : 'Post comment' }}
            </ion-button>
          </form>
        </section>

        <aside class="panel action-panel">
          <h2>Work update</h2>
          <template v-if="availableActions.length">
            <p class="muted">{{ actionHint }}</p>
            <ion-select v-if="session.profile?.role === 'admin' && report.status === 'Approved'" v-model="assignedUid" label="Maintenance staff" label-placement="stacked" interface="popover" placeholder="Select staff">
              <ion-select-option v-for="staff in maintenanceUsers" :key="staff.uid" :value="staff.uid">{{ staff.fullName }}</ion-select-option>
            </ion-select>
            <ion-textarea v-model="notes" label="Work notes" label-placement="stacked" placeholder="Add review feedback, work performed, or completion details." :auto-grow="true" />
            <ion-button v-for="action in availableActions" :key="action.status" expand="block" :fill="action.primary ? 'solid' : 'outline'" :disabled="busy || (action.status === 'Assigned' && !assignedUid)" @click="runAction(action.status)">
              {{ busy ? 'Saving...' : action.label }}
            </ion-button>
          </template>
          <template v-else>
            <div class="done-state">
              <ion-icon :icon="checkmarkCircleOutline" />
              <strong>{{ session.profile?.role === 'maintenance' ? 'No work actions available' : 'You are up to date' }}</strong>
              <span>{{ session.profile?.role === 'maintenance' ? 'This report is not assigned to you.' : 'Check back here for changes to this report.' }}</span>
            </div>
          </template>
          <div v-if="session.profile?.role === 'maintenance' && report.assignedToUid === session.profile.uid" class="work-photos">
            <h3>Document the repair</h3>
            <p class="muted">Upload a before or after photo. Images are private to authorized report viewers.</p>
            <ion-select v-model="photoPhase" label="Photo type" label-placement="stacked" interface="popover">
              <ion-select-option value="before">Before</ion-select-option>
              <ion-select-option value="after">After</ion-select-option>
            </ion-select>
            <label class="photo-upload">Choose image<input type="file" accept="image/*" @change="uploadWorkPhoto" /></label>
            <p v-if="photoError" class="error-banner">{{ photoError }}</p>
          </div>
        </aside>
      </div>

      <section class="panel history-panel">
        <h2>Report timeline</h2>
        <p class="muted">Status changes and maintenance actions are kept as a permanent history.</p>
        <div v-if="historyError" class="error-banner">{{ historyError }}</div>
        <ol class="timeline">
          <li v-for="entry in history" :key="entry.id">
            <span class="timeline-dot" />
            <div>
              <strong>{{ entry.newStatus === entry.previousStatus ? 'Maintenance update' : entry.newStatus }}</strong>
              <p>{{ entry.notes }}</p>
              <span>{{ entry.actorName }} · {{ formatDate(entry.createdAt) }}</span>
            </div>
          </li>
          <li v-if="!history.length && !historyError" class="muted">No history entries yet.</li>
        </ol>
      </section>
    </template>
    <div v-else class="loading-panel">This report is unavailable or you do not have permission to view it.</div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonButton, IonIcon, IonSelect, IonSelectOption, IonTextarea } from '@ionic/vue';
import { checkmarkCircleOutline } from 'ionicons/icons';
import AppShell from '@/components/AppShell.vue';
import { subscribeMaintenanceUsers } from '@/services/campus';
import { addMaintenancePhoto, addReportComment, changeReportPriority, changeReportStatus, REPORT_PRIORITIES, subscribeReport, subscribeReportComments, subscribeReportHistory, subscribeReportPhotos, type FirestoreReportPhoto } from '@/services/reports';
import type { FacilityReport, ReportComment, ReportHistoryEntry, ReportStatus, UserProfile } from '@/models/domain';
import { availableReportActions } from '@/services/workflow';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const report = ref<FacilityReport | null>(null);
const storedPhotos = ref<FirestoreReportPhoto[]>([]);
const history = ref<ReportHistoryEntry[]>([]);
const comments = ref<ReportComment[]>([]);
const commentText = ref('');
const maintenanceUsers = ref<UserProfile[]>([]);
const assignedUid = ref('');
const notes = ref('');
const photoPhase = ref<'before' | 'after'>('before');
const prioritySelection = ref<'Low' | 'Normal' | 'High' | 'Urgent'>('Normal');
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const historyError = ref('');
const commentsError = ref('');
const commentError = ref('');
const commentBusy = ref(false);
const photoError = ref('');
const photosError = ref('');
let stopReport: (() => void) | undefined;
let stopHistory: (() => void) | undefined;
let stopComments: (() => void) | undefined;
let stopUsers: (() => void) | undefined;
let stopPhotos: (() => void) | undefined;

const availableActions = computed(() => {
  return report.value ? availableReportActions(report.value, session.profile) : [];
});
const reportedPhotoUrls = computed(() => [
  ...storedPhotos.value.filter((photo) => photo.kind === 'report').map((photo) => photo.dataUrl),
  ...(report.value?.imageUrls ?? []),
]);

function maintenancePhotoUrl(photo: NonNullable<FacilityReport['maintenancePhotos']>[number]) {
  return (photo.photoId
    ? storedPhotos.value.find((stored) => stored.id === photo.photoId)?.dataUrl
    : undefined) ?? photo.url ?? '';
}

watch(report, (item) => { prioritySelection.value = item?.priority ?? 'Normal'; }, { immediate: true });

const actionHint = computed(() => {
  if (report.value?.status === 'Approved') return 'Choose the maintenance staff member responsible for this work order.';
  if (['Rejected', 'Needs Clarification', 'Resolved', 'Closed', 'Pending Verification'].includes(report.value?.status ?? '')) return 'Add a note explaining this decision or verification.';
  return 'Add a progress note if it will help the reporter or maintenance team.';
});

function formatDate(value?: FacilityReport['createdAt'] | ReportHistoryEntry['createdAt']) {
  return value?.toDate ? value.toDate().toLocaleString() : 'Just now';
}

async function runAction(status: ReportStatus) {
  if (!report.value || !session.profile) return;
  prioritySelection.value = report.value.priority;
  if (['Rejected', 'Needs Clarification', 'Resolved', 'Closed', 'Pending Verification'].includes(status) && notes.value.trim().length < 5) {
    error.value = 'Add at least five characters of notes before submitting this update.';
    return;
  }
  let assignee: UserProfile | undefined;
  if (status === 'Assigned') {
    assignee = maintenanceUsers.value.find((person) => person.uid === assignedUid.value);
    if (!assignee) { error.value = 'Select an active maintenance staff member.'; return; }
  }
  busy.value = true;
  error.value = '';
  try {
    await changeReportStatus(report.value, session.profile, status, notes.value, assignee);
    notes.value = '';
    if (status === 'Reopened') await router.replace('/reports');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to update this report.';
  } finally {
    busy.value = false;
  }
}

async function savePriority() {
  if (!report.value || !session.profile || session.profile.role !== 'admin' || prioritySelection.value === report.value.priority) return;
  try {
    await changeReportPriority(report.value, session.profile, prioritySelection.value, notes.value);
    notes.value = '';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to change this report priority.';
    prioritySelection.value = report.value.priority;
  }
}

async function uploadWorkPhoto(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !report.value || !session.profile) return;
  photoError.value = '';
  try {
    await addMaintenancePhoto(report.value, session.profile, file, photoPhase.value, notes.value);
    notes.value = '';
    input.value = '';
  } catch (cause) {
    photoError.value = cause instanceof Error ? cause.message : 'Unable to upload the maintenance photo.';
  }
}

async function postComment() {
  if (!session.profile || !report.value) return;
  commentError.value = '';
  commentBusy.value = true;
  try {
    await addReportComment(report.value.id, session.profile, commentText.value);
    commentText.value = '';
  } catch (cause) {
    commentError.value = cause instanceof Error ? cause.message : 'Unable to post your comment.';
  } finally {
    commentBusy.value = false;
  }
}

async function loadReport(id: string) {
  await session.initialize();
  if (!session.profile) { loading.value = false; error.value = session.error ?? 'Sign in to view this report.'; return; }
  stopReport?.();
  stopHistory?.();
  stopComments?.();
  stopUsers?.();
  stopPhotos?.();
  storedPhotos.value = [];
  photosError.value = '';
  loading.value = true;
  stopReport = subscribeReport(id, (item) => { report.value = item; loading.value = false; }, (cause) => { error.value = cause.message; loading.value = false; });
  stopPhotos = subscribeReportPhotos(id, (items) => { storedPhotos.value = items; }, (cause) => { photosError.value = cause.message; });
  stopHistory = subscribeReportHistory(id, (items) => { history.value = items; }, (cause) => { historyError.value = cause.message; });
  stopComments = subscribeReportComments(id, (items) => { comments.value = items; }, (cause) => { commentsError.value = cause.message; });
  if (session.profile.role === 'admin') {
    stopUsers = subscribeMaintenanceUsers((items) => { maintenanceUsers.value = items; }, (cause) => { error.value = cause.message; });
  }
}

onMounted(() => { void loadReport(String(route.params.id)); });
watch(() => route.params.id, (id) => { if (id) void loadReport(String(id)); });
onUnmounted(() => { stopReport?.(); stopHistory?.(); stopComments?.(); stopUsers?.(); stopPhotos?.(); });
</script>

<style scoped>
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(270px, .85fr); align-items: start; gap: 14px; }
.panel { padding: 21px; border: 1px solid var(--ion-color-step-150); border-radius: 10px; background: var(--ion-background-color); }
.top-row { display: flex; justify-content: space-between; align-items: center; }
.status-chip { padding: 6px 9px; border-radius: 20px; color: #69501c; background: #fff4d6; font-size: 11px; }
.status-chip.resolved, .status-chip.closed { color: #155b3b; background: #e4f2e9; }
.status-chip.rejected { color: #852d2c; background: #fbe8e7; }
.status-chip.in-progress, .status-chip.pending-verification { color: #315d83; background: #e7f0f8; }
.priority { color: var(--ion-color-medium); font-size: 11px; }
.priority-control { display: flex; align-items: center; gap: 4px; }
.priority-control ion-select { min-height: 28px; padding: 0 2px; font-size: 11px; }
.priority.urgent, .priority.high { color: var(--ion-color-danger); font-weight: 700; }
.report-overview h2 { margin: 18px 0 8px; font-size: 22px; }
.description { color: var(--ion-color-medium-shade); font-size: 14px; line-height: 1.65; white-space: pre-wrap; }
.facts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px; margin: 22px 0; padding: 17px 0; border-top: 1px solid var(--ion-color-step-100); border-bottom: 1px solid var(--ion-color-step-100); }
.facts-grid div { display: flex; flex-direction: column; gap: 5px; }
.facts-grid span { color: var(--ion-color-medium); font-size: 10px; }
.facts-grid strong { font-size: 12px; }
.location-info { margin: 10px 0; font-size: 12px; }
.location-info a { color: var(--ion-color-primary); }
.photo-section { margin-top: 22px; }
.photo-section h3, .work-photos h3, .resolution h3 { font-size: 14px; }
.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 9px; }
.photo-grid img { display: block; width: 100%; height: 105px; border-radius: 7px; object-fit: cover; }
.photo-grid figure { margin: 0; }
.photo-grid figcaption { padding-top: 5px; color: var(--ion-color-medium); font-size: 10px; }
.resolution { margin-top: 24px; padding: 14px; border-left: 3px solid var(--ion-color-success); background: #eff7f1; }
.resolution h3, .resolution p { margin: 0 0 6px; }
.action-panel h2, .history-panel h2 { margin: 0 0 8px; font-size: 17px; }
.muted { color: var(--ion-color-medium); font-size: 11px; line-height: 1.5; }
.action-panel ion-button { margin: 10px 0; }
.done-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px 10px; color: var(--ion-color-medium); font-size: 11px; text-align: center; }
.done-state ion-icon { color: var(--ion-color-primary); font-size: 26px; }
.done-state strong { color: var(--ion-text-color); font-size: 13px; }
.work-photos { margin-top: 18px; padding-top: 17px; border-top: 1px solid var(--ion-color-step-100); }
.work-photos ion-select { margin: 8px 0; }
.photo-upload { display: block; margin: 10px 0; padding: 10px; border: 1px dashed var(--ion-color-step-400); border-radius: 8px; color: var(--ion-color-primary); cursor: pointer; font-size: 12px; text-align: center; }
.photo-upload input { display: none; }
.history-panel { margin-top: 14px; }
.timeline { margin: 20px 0 0; padding: 0; list-style: none; }
.timeline li { position: relative; display: flex; gap: 13px; padding-bottom: 20px; }
.timeline li:not(:last-child)::before { position: absolute; top: 14px; bottom: 0; left: 5px; width: 1px; background: var(--ion-color-step-150); content: ''; }
.timeline-dot { z-index: 1; width: 11px; height: 11px; flex: 0 0 11px; margin-top: 3px; border-radius: 50%; background: var(--ion-color-primary); }
.timeline li strong { font-size: 12px; }
.timeline li p { margin: 4px 0; font-size: 12px; }
.timeline li div > span { color: var(--ion-color-medium); font-size: 10px; }
.comment { padding: 12px 0; border-top: 1px solid var(--ion-color-step-100); }
.comment strong { font-size: 12px; }
.comment > span { margin-left: 9px; color: var(--ion-color-medium); font-size: 10px; }
.comment p { margin: 6px 0 0; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
.comment-form { margin-top: 12px; }
.error-banner, .loading-panel { margin-bottom: 14px; padding: 13px; border-radius: 8px; background: var(--campus-surface); color: var(--ion-color-medium); font-size: 12px; }
.error-banner { color: var(--ion-color-danger); }
@media (max-width: 760px) { .detail-grid { grid-template-columns: 1fr; } .facts-grid { gap: 13px; } }
</style>
