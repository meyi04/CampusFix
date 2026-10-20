<template>
  <AppShell title="Good to see you" :subtitle="welcome">
    <section class="welcome-strip">
      <div>
        <span class="welcome-tag">FACILITY SERVICE DESK</span>
        <h2>Help keep MinSU running smoothly.</h2>
        <p>Report an issue, then follow its progress right here.</p>
      </div>
      <ion-button v-if="session.profile?.role === 'student' || session.profile?.role === 'faculty'" router-link="/reports/new" class="new-report">
        <ion-icon slot="start" :icon="addOutline" />
        Report an issue
      </ion-button>
    </section>

    <div v-if="error" class="error-state" role="alert">{{ error }}</div>
    <div v-if="loading" class="loading-state" role="status">Loading your latest reports...</div>

    <section class="summary-grid" aria-label="Report summary">
      <article v-for="item in summary" :key="item.label" class="summary-card">
        <span class="summary-label">{{ item.label }}</span>
        <strong>{{ item.count }}</strong>
        <span class="summary-note">{{ item.note }}</span>
      </article>
    </section>

    <section v-if="session.profile?.role === 'admin'" class="panel admin-tools">
      <div class="section-heading"><div><h2>Campus administration</h2><p>Manage facility records and access.</p></div></div>
      <div class="admin-link-grid">
        <router-link to="/admin/analytics">Analytics <span>Trends, workload and CSV export</span></router-link>
        <router-link to="/admin/catalog">Buildings and categories <span>Manage the report directory</span></router-link>
        <router-link to="/admin/users">People and access <span>Roles and account status</span></router-link>
        <router-link to="/admin/audit">Audit log <span>Review privileged changes</span></router-link>
      </div>
    </section>

    <section v-if="session.profile?.role === 'admin' && reports.length" class="panel analytics-panel">
      <div class="section-heading">
        <div><h2>Current workload</h2><p>Distribution of the latest {{ reports.length }} reports.</p></div>
        <ion-button fill="outline" size="small" @click="downloadCsv">Export CSV</ion-button>
      </div>
      <div class="chart-wrap"><Doughnut :data="chartData" :options="chartOptions" /></div>
    </section>

    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>{{ session.profile?.role === 'maintenance' ? 'Assigned work' : 'Recent reports' }}</h2>
          <p>{{ session.profile?.role === 'admin' ? 'Latest reports across campus.' : 'Updates to your facility reports.' }}</p>
        </div>
        <router-link to="/reports" class="text-link">View all</router-link>
      </div>
      <div v-if="!loading && reports.length === 0" class="empty-state">
        <ion-icon :icon="fileTrayOutline" />
        <strong>No reports yet</strong>
        <span>Your facility issues will appear here.</span>
      </div>
      <router-link v-for="report in reports.slice(0, 5)" :key="report.id" :to="`/reports/${report.id}`" class="report-row">
        <div class="report-icon"><ion-icon :icon="constructOutline" /></div>
        <div class="report-main">
          <strong>{{ report.title }}</strong>
          <span>{{ report.buildingName }}<template v-if="report.room"> · {{ report.room }}</template> · {{ report.category }}</span>
        </div>
        <span class="status-chip" :class="statusClass(report.status)">{{ report.status }}</span>
      </router-link>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Chart as ChartJS, ArcElement, DoughnutController, Legend, Tooltip } from 'chart.js';
import { Doughnut } from 'vue-chartjs';
import { IonButton, IonIcon } from '@ionic/vue';
import { addOutline, constructOutline, fileTrayOutline } from 'ionicons/icons';
import AppShell from '@/components/AppShell.vue';
import { useSessionStore } from '@/stores/session';
import { subscribeReports } from '@/services/reports';
import type { FacilityReport } from '@/models/domain';
import { createCsv } from '@/utils/csv';

ChartJS.register(ArcElement, DoughnutController, Legend, Tooltip);

const session = useSessionStore();
const reports = ref<FacilityReport[]>([]);
const loading = ref(true);
const error = ref('');
let unsubscribe: (() => void) | undefined;

const welcome = computed(() => `${session.profile?.fullName ?? 'Campus community'}, here is your facility report overview.`);
const summary = computed(() => {
  const active = reports.value.filter((report) => !['Resolved', 'Closed', 'Rejected'].includes(report.status));
  const progress = reports.value.filter((report) => ['Assigned', 'In Progress', 'Pending Verification'].includes(report.status));
  const resolved = reports.value.filter((report) => ['Resolved', 'Closed'].includes(report.status));
  return [
    { label: 'Reports in view', count: reports.value.length, note: 'Most recent 100' },
    { label: 'Needs attention', count: active.length, note: 'Open reports' },
    { label: 'In progress', count: progress.length, note: 'Being maintained' },
    { label: 'Resolved', count: resolved.length, note: 'Completed work' },
  ];
});
const statusGroups = computed(() => [...new Set(reports.value.map((report) => report.status))]);
const chartData = computed(() => ({
  labels: statusGroups.value,
  datasets: [{
    data: statusGroups.value.map((status) => reports.value.filter((report) => report.status === status).length),
    backgroundColor: ['#155b3b', '#d49b21', '#4b83b7', '#55a57a', '#bd5552', '#5b6471', '#91ad9c'],
    borderWidth: 0,
    hoverOffset: 5,
  }],
}));
const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' as const } } };

function statusClass(status: string) {
  return status.toLowerCase().replaceAll(' ', '-');
}

function downloadCsv() {
  const headers = ['id', 'title', 'category', 'buildingName', 'room', 'priority', 'status', 'reporterName', 'assignedToName'] as const;
  const content = createCsv(reports.value.map((report) => ({
    id: report.id,
    title: report.title,
    category: report.category,
    buildingName: report.buildingName,
    room: report.room,
    priority: report.priority,
    status: report.status,
    reporterName: report.reporterName,
    assignedToName: report.assignedToName,
  })), headers);
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'campusfix-reports.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  await session.initialize();
  if (!session.profile) { loading.value = false; error.value = session.error ?? 'Your account profile is unavailable.'; return; }
  unsubscribe = subscribeReports(session.profile, (items) => {
    reports.value = items;
    loading.value = false;
  }, (cause) => {
    error.value = cause.message;
    loading.value = false;
  });
});
onUnmounted(() => unsubscribe?.());
</script>

<style scoped>
.welcome-strip { display: flex; justify-content: space-between; align-items: center; gap: 22px; margin-bottom: 22px; padding: 23px 26px; border-radius: 10px; color: white; background: #155b3b; }
.welcome-tag { color: #bdd9c7; font-size: 10px; font-weight: 750; letter-spacing: .12em; }
.welcome-strip h2 { margin: 9px 0 5px; font-size: clamp(18px, 3vw, 24px); }
.welcome-strip p { margin: 0; color: #e1eee5; font-size: 13px; }
.new-report { --background: white; --color: #155b3b; --border-radius: 7px; font-weight: 650; }
.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.summary-card, .panel { border: 1px solid var(--ion-color-step-150); border-radius: 10px; background: var(--ion-background-color); }
.summary-card { display: flex; flex-direction: column; gap: 8px; padding: 16px; }
.summary-label { color: var(--ion-color-medium); font-size: 12px; }
.summary-card strong { font-size: 25px; }
.summary-note { color: var(--ion-color-medium); font-size: 11px; }
.panel { margin-bottom: 18px; padding: 20px; }
.section-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 14px; }
.section-heading h2 { margin: 0 0 4px; font-size: 17px; }
.section-heading p { margin: 0; color: var(--ion-color-medium); font-size: 12px; }
.text-link { color: var(--ion-color-primary); font-size: 13px; text-decoration: none; white-space: nowrap; }
.report-row { display: flex; align-items: center; gap: 12px; padding: 13px 0; border-top: 1px solid var(--ion-color-step-100); color: inherit; text-decoration: none; }
.report-icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 9px; color: var(--ion-color-primary); background: #e9f2ec; font-size: 19px; }
.report-main { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.report-main strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.report-main span { overflow: hidden; color: var(--ion-color-medium); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.status-chip { padding: 5px 8px; border-radius: 20px; color: #69501c; background: #fff4d6; font-size: 10px; white-space: nowrap; }
.status-chip.resolved, .status-chip.closed { color: #155b3b; background: #e4f2e9; }
.status-chip.rejected { color: #852d2c; background: #fbe8e7; }
.status-chip.in-progress, .status-chip.pending-verification { color: #315d83; background: #e7f0f8; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 28px 12px; color: var(--ion-color-medium); font-size: 12px; }
.empty-state ion-icon { color: var(--ion-color-primary); font-size: 27px; }
.empty-state strong { color: var(--ion-text-color); font-size: 14px; }
.loading-state, .error-state { padding: 15px; border-radius: 8px; background: var(--campus-surface); color: var(--ion-color-medium); }
.error-state { color: var(--ion-color-danger); }
.analytics-panel { max-width: 720px; }
.admin-link-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.admin-link-grid a { display: flex; flex-direction: column; gap: 5px; padding: 12px; border: 1px solid var(--ion-color-step-150); border-radius: 7px; color: var(--ion-color-primary); font-size: 12px; font-weight: 650; text-decoration: none; }
.admin-link-grid span { color: var(--ion-color-medium); font-size: 10px; font-weight: 400; }
.chart-wrap { position: relative; height: 210px; }
@media (max-width: 650px) { .welcome-strip { align-items: flex-start; flex-direction: column; } .new-report { align-self: stretch; } .summary-grid { grid-template-columns: repeat(2, 1fr); gap: 9px; } .summary-card { padding: 13px; } .summary-card strong { font-size: 22px; } .panel { padding: 16px; } }
</style>
