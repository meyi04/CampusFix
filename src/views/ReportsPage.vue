<template>
  <AppShell :title="session.profile?.role === 'maintenance' ? 'Assigned work orders' : 'Facility reports'" subtitle="Follow a report for the latest maintenance updates.">
    <div v-if="error" class="error-state" role="alert">{{ error }}</div>
    <div v-if="loading" class="loading-state" role="status">Loading reports...</div>
    <section v-if="!loading && reports.length" class="filters-panel" aria-label="Filter reports">
      <div class="filter-heading">
        <div><h2>Find a report</h2><p>Filter the reports available to your account.</p></div>
        <span class="result-count">{{ filteredReports.length }} of {{ reports.length }}</span>
      </div>
      <div class="filter-controls">
        <label class="search-field">
          <span>Search</span>
          <input v-model="searchText" type="search" placeholder="Title, building, or room" />
        </label>
        <label><span>Status</span>
          <select v-model="statusFilter">
            <option value="">All statuses</option>
            <option v-for="status in reportStatuses" :key="status" :value="status">{{ status }}</option>
          </select>
        </label>
        <label><span>Priority</span>
          <select v-model="priorityFilter">
            <option value="">All priorities</option>
            <option v-for="priority in reportPriorities" :key="priority" :value="priority">{{ priority }}</option>
          </select>
        </label>
        <label><span>Building</span>
          <select v-model="buildingFilter">
            <option value="">All buildings</option>
            <option v-for="building in buildings" :key="building" :value="building">{{ building }}</option>
          </select>
        </label>
        <ion-button v-if="hasFilters" class="clear-button" fill="clear" @click="clearFilters">Clear filters</ion-button>
      </div>
    </section>
    <div v-if="!loading && !reports.length && !error" class="empty-state">
      <strong>No facility reports yet</strong>
      <span>Reports available to your account will appear here.</span>
      <ion-button v-if="session.profile?.role !== 'maintenance'" router-link="/reports/new" fill="outline">Submit a report</ion-button>
    </div>
    <div v-if="!loading && reports.length && !filteredReports.length" class="empty-state">
      <strong>No reports match these filters</strong>
      <span>Try a different search or clear some filters.</span>
      <ion-button fill="outline" @click="clearFilters">Clear filters</ion-button>
    </div>
    <section class="report-list">
      <router-link v-for="report in filteredReports" :key="report.id" :to="`/reports/${report.id}`" class="report-card">
        <div class="report-top">
          <span class="status-chip" :class="report.status.toLowerCase().replaceAll(' ', '-')">{{ report.status }}</span>
          <span class="priority" :class="report.priority.toLowerCase()">{{ report.priority }} priority</span>
        </div>
        <h2>{{ report.title }}</h2>
        <p>{{ report.buildingName }}<template v-if="report.room"> · {{ report.room }}</template> · {{ report.category }}</p>
        <div class="report-bottom"><span>Reported by {{ report.reporterName }}</span><span>{{ formatDate(report.createdAt) }}</span></div>
      </router-link>
    </section>
    <div v-if="hasMore" class="load-more">
      <ion-button fill="outline" :disabled="loadingMore" @click="loadMore">{{ loadingMore ? 'Loading...' : 'Load older reports' }}</ion-button>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { IonButton } from '@ionic/vue';
import AppShell from '@/components/AppShell.vue';
import { useSessionStore } from '@/stores/session';
import { getReportsPage, REPORT_PAGE_SIZE, subscribeReports } from '@/services/reports';
import type { FacilityReport, ReportPriority, ReportStatus } from '@/models/domain';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

const session = useSessionStore();
const loading = ref(true);
const error = ref('');
const loadingMore = ref(false);
const hasMore = ref(false);
const latestReports = ref<FacilityReport[]>([]);
const olderReports = ref<FacilityReport[]>([]);
let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
const mergedReports = () => [...latestReports.value, ...olderReports.value];
const reports = ref<FacilityReport[]>([]);
const searchText = ref('');
const statusFilter = ref('');
const priorityFilter = ref('');
const buildingFilter = ref('');
const reportStatuses: ReportStatus[] = ['Submitted', 'Under Review', 'Approved', 'Assigned', 'In Progress', 'Pending Verification', 'Resolved', 'Closed', 'Rejected', 'Needs Clarification', 'Reopened'];
const reportPriorities: ReportPriority[] = ['Low', 'Normal', 'High', 'Urgent'];
const buildings = computed(() => [...new Set(reports.value.map((report) => report.buildingName).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
const filteredReports = computed(() => {
  const search = searchText.value.trim().toLocaleLowerCase();
  return reports.value.filter((report) => {
    const matchesSearch = !search || [report.title, report.buildingName, report.room, report.category]
      .some((value) => value.toLocaleLowerCase().includes(search));
    return matchesSearch
      && (!statusFilter.value || report.status === statusFilter.value)
      && (!priorityFilter.value || report.priority === priorityFilter.value)
      && (!buildingFilter.value || report.buildingName === buildingFilter.value);
  });
});
const hasFilters = computed(() => Boolean(searchText.value || statusFilter.value || priorityFilter.value || buildingFilter.value));
let unsubscribe: (() => void) | undefined;

function clearFilters() {
  searchText.value = '';
  statusFilter.value = '';
  priorityFilter.value = '';
  buildingFilter.value = '';
}

function formatDate(value: FacilityReport['createdAt']) {
  return value?.toDate ? value.toDate().toLocaleDateString() : 'Just now';
}

async function loadMore() {
  const profile = session.profile;
  if (!profile || !cursor || loadingMore.value) return;
  loadingMore.value = true;
  error.value = '';
  try {
    const page = await getReportsPage(profile, cursor);
    const known = new Set(reports.value.map((report) => report.id));
    olderReports.value = [...olderReports.value, ...page.reports.filter((report) => !known.has(report.id))];
    reports.value = mergedReports();
    cursor = page.cursor;
    hasMore.value = page.reports.length === REPORT_PAGE_SIZE;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load older reports.';
  } finally {
    loadingMore.value = false;
  }
}

onMounted(async () => {
  await session.initialize();
  if (!session.profile) { loading.value = false; error.value = session.error ?? 'Your account profile is unavailable.'; return; }
  try {
    const firstPage = await getReportsPage(session.profile);
    latestReports.value = firstPage.reports;
    reports.value = firstPage.reports;
    cursor = firstPage.cursor;
    hasMore.value = firstPage.reports.length === REPORT_PAGE_SIZE;
    loading.value = false;
    unsubscribe = subscribeReports(session.profile, (items) => {
      latestReports.value = items;
      reports.value = [...items, ...olderReports.value.filter((old) => !items.some((current) => current.id === old.id))];
    }, (cause) => { error.value = cause.message; });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load reports.';
    loading.value = false;
  }
});
onUnmounted(() => unsubscribe?.());
</script>

<style scoped>
.filters-panel { margin-bottom: 18px; padding: 20px 22px; border: 1px solid var(--campus-border); border-radius: 15px; background: var(--ion-background-color); box-shadow: var(--campus-shadow); }
.filter-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 15px; }
.filter-heading h2 { margin: 0; font-size: 16px; }
.filter-heading p { margin: 4px 0 0; color: var(--ion-color-medium); font-size: 11px; }
.result-count { color: var(--ion-color-medium); font-size: 11px; white-space: nowrap; }
.filter-controls { display: grid; grid-template-columns: minmax(190px, 1.5fr) repeat(3, minmax(130px, 1fr)) auto; align-items: end; gap: 10px; }
.filter-controls label { display: grid; min-width: 0; gap: 6px; color: var(--ion-color-medium-shade); font-size: 10px; font-weight: 650; }
.filter-controls input, .filter-controls select { box-sizing: border-box; width: 100%; min-height: 40px; padding: 0 11px; border: 1px solid var(--campus-border); border-radius: 8px; outline-color: var(--ion-color-primary); color: var(--ion-text-color); background: #fff; font: inherit; font-size: 12px; }
.clear-button { margin: 0; white-space: nowrap; }
.report-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 370px), 1fr)); gap: 14px; }
.report-card { display: block; padding: 20px; border: 1px solid var(--campus-border); border-radius: 14px; background: var(--ion-background-color); box-shadow: var(--campus-shadow); color: inherit; text-decoration: none; transition: border-color .15s ease, box-shadow .15s ease; }
.report-card:hover { border-color: #b6d0bf; box-shadow: 0 14px 34px rgba(25, 55, 38, .1); }
.report-top, .report-bottom { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.report-card h2 { margin: 15px 0 6px; font-size: 18px; letter-spacing: -.01em; }
.report-card p { margin: 0 0 20px; color: var(--ion-color-medium); font-size: 12px; }
.report-bottom { color: var(--ion-color-medium); font-size: 10px; }
.status-chip { padding: 5px 8px; border-radius: 20px; color: #69501c; background: #fff4d6; font-size: 10px; }
.priority { color: var(--ion-color-medium); font-size: 10px; }
.priority.urgent, .priority.high { color: var(--ion-color-danger); font-weight: 650; }
.status-chip.resolved, .status-chip.closed { color: #155b3b; background: #e4f2e9; }
.status-chip.rejected { color: #852d2c; background: #fbe8e7; }
.status-chip.in-progress, .status-chip.pending-verification { color: #315d83; background: #e7f0f8; }
.empty-state, .loading-state, .error-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 34px; border: 1px solid var(--campus-border); border-radius: 14px; background: var(--ion-background-color); color: var(--ion-color-medium); text-align: center; }
.empty-state strong { color: var(--ion-text-color); }
.error-state { color: var(--ion-color-danger); }
.load-more { display: flex; justify-content: center; padding: 17px; }
@media (max-width: 900px) { .filter-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); } .clear-button { justify-self: start; } }
@media (max-width: 520px) { .filters-panel { padding: 16px; } .filter-controls { grid-template-columns: 1fr; } .filter-heading { align-items: flex-start; } .report-card { padding: 16px; } .report-bottom { align-items: flex-start; flex-direction: column; gap: 5px; } }
</style>
