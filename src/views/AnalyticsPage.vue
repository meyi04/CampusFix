<template>
  <AppShell title="Maintenance analytics" subtitle="Explore reports in the latest live campus snapshot.">
    <div class="filters panel">
      <label>From <input v-model="fromDate" type="date" /></label>
      <label>Through <input v-model="throughDate" type="date" /></label>
      <ion-select v-model="groupBy" label="Group reports by" label-placement="stacked" interface="popover">
        <ion-select-option value="status">Status</ion-select-option>
        <ion-select-option value="category">Category</ion-select-option>
        <ion-select-option value="buildingName">Building</ion-select-option>
        <ion-select-option value="priority">Priority</ion-select-option>
        <ion-select-option value="assignedToName">Maintenance staff</ion-select-option>
        <ion-select-option value="month">Reporting month</ion-select-option>
      </ion-select>
      <ion-button fill="outline" :disabled="!filteredReports.length" @click="downloadCsv">Export filtered CSV</ion-button>
    </div>

    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Loading live report data...</p>
    <p v-else class="muted">Analytics are based on {{ reports.length }} most recent reports. Adjust the date range and grouping to explore the current snapshot.</p>
    <section class="summary-grid">
      <article><span>Reports in range</span><strong>{{ filteredReports.length }}</strong></article>
      <article><span>Open reports</span><strong>{{ openCount }}</strong></article>
      <article><span>Urgent</span><strong>{{ urgentCount }}</strong></article>
      <article><span>Overdue ({{ overdueDays }}+ days)</span><strong>{{ overdueCount }}</strong></article>
    </section>
    <section class="panel chart-panel">
      <h2>{{ chartTitle }}</h2>
      <p class="muted">Overdue counts include open reports older than the configured service target.</p>
      <div class="chart-wrap"><Bar v-if="filteredReports.length" :data="chartData" :options="chartOptions" /><div v-else class="empty">No reports match this date range.</div></div>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Bar } from 'vue-chartjs';
import { BarController, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { IonButton, IonSelect, IonSelectOption } from '@ionic/vue';
import AppShell from '@/components/AppShell.vue';
import { subscribeReports } from '@/services/reports';
import type { FacilityReport } from '@/models/domain';
import { useSessionStore } from '@/stores/session';
import { createCsv } from '@/utils/csv';

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip);

const session = useSessionStore();
const reports = ref<FacilityReport[]>([]);
const fromDate = ref('');
const throughDate = ref('');
const groupBy = ref<'status' | 'category' | 'buildingName' | 'priority' | 'assignedToName' | 'month'>('status');
const loading = ref(true);
const error = ref('');
const configuredOverdueDays = Number(import.meta.env.VITE_REPORT_OVERDUE_DAYS);
const overdueDays = Number.isFinite(configuredOverdueDays) && configuredOverdueDays > 0 ? configuredOverdueDays : 7;
let unsubscribe: (() => void) | undefined;

const filteredReports = computed(() => reports.value.filter((report) => {
  const date = report.createdAt?.toDate().getTime() ?? Date.now();
  const from = fromDate.value ? new Date(`${fromDate.value}T00:00:00`).getTime() : -Infinity;
  const through = throughDate.value ? new Date(`${throughDate.value}T23:59:59.999`).getTime() : Infinity;
  return date >= from && date <= through;
}));
const openCount = computed(() => filteredReports.value.filter((report) => !['Resolved', 'Closed', 'Rejected'].includes(report.status)).length);
const urgentCount = computed(() => filteredReports.value.filter((report) => report.priority === 'Urgent').length);
const overdueCount = computed(() => {
  const cutoff = Date.now() - overdueDays * 24 * 60 * 60 * 1000;
  return filteredReports.value.filter((report) => !['Resolved', 'Closed', 'Rejected'].includes(report.status)
    && (report.createdAt?.toDate().getTime() ?? Date.now()) < cutoff).length;
});
const labels = computed(() => {
  const key = groupBy.value;
  const value = (report: FacilityReport) => key === 'month'
    ? report.createdAt?.toDate().toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) ?? 'Unknown'
    : String(report[key] || (key === 'assignedToName' ? 'Unassigned' : 'Unknown'));
  return [...new Set(filteredReports.value.map(value))].sort((a, b) => {
    if (key === 'month') return new Date(a).getTime() - new Date(b).getTime();
    return a.localeCompare(b);
  });
});
const chartData = computed(() => ({
  labels: labels.value,
  datasets: [{
    label: 'Reports',
    data: labels.value.map((label) => filteredReports.value.filter((report) => {
      const value = groupBy.value === 'month'
        ? report.createdAt?.toDate().toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) ?? 'Unknown'
        : String(report[groupBy.value] || (groupBy.value === 'assignedToName' ? 'Unassigned' : 'Unknown'));
      return value === label;
    }).length),
    backgroundColor: '#2e7954',
    borderRadius: 4,
  }],
}));
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
};
const chartTitle = computed(() => ({
  status: 'Reports by status',
  category: 'Reports by facility category',
  buildingName: 'Reports by campus building',
  priority: 'Reports by priority',
  assignedToName: 'Maintenance workload',
  month: 'Monthly reporting trend',
}[groupBy.value]));

function downloadCsv() {
  const fields = ['id', 'title', 'category', 'buildingName', 'room', 'priority', 'status', 'reporterName', 'assignedToName'] as const;
  const csv = createCsv(filteredReports.value.map((report) => ({
    id: report.id,
    title: report.title,
    category: report.category,
    buildingName: report.buildingName,
    room: report.room,
    priority: report.priority,
    status: report.status,
    reporterName: report.reporterName,
    assignedToName: report.assignedToName,
  })), fields);
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.href = url;
  link.download = 'campusfix-filtered-reports.csv';
  link.click();
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  await session.initialize();
  const profile = session.profile;
  if (profile?.role !== 'admin') { error.value = 'Administrator access is required.'; loading.value = false; return; }
  unsubscribe = subscribeReports(profile, (items) => { reports.value = items; loading.value = false; }, (cause) => { error.value = cause.message; loading.value = false; });
});
onUnmounted(() => unsubscribe?.());
</script>

<style scoped>
.panel { padding: 20px; border: 1px solid var(--ion-color-step-150); border-radius: 10px; background: var(--ion-background-color); }
.filters { display: flex; align-items: flex-end; gap: 14px; margin-bottom: 15px; }
.filters label { display: flex; flex-direction: column; gap: 6px; color: var(--ion-color-medium); font-size: 10px; }
.filters input { min-height: 38px; padding: 7px 9px; border: 1px solid var(--ion-color-step-200); border-radius: 6px; color: var(--ion-text-color); background: var(--ion-background-color); }
.filters ion-select { min-width: 170px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 11px; margin: 15px 0; }
.summary-grid article { display: flex; flex-direction: column; gap: 9px; padding: 15px; border: 1px solid var(--ion-color-step-150); border-radius: 9px; background: var(--ion-background-color); }
.summary-grid span { color: var(--ion-color-medium); font-size: 11px; }
.summary-grid strong { font-size: 23px; }
.chart-panel h2 { margin: 0 0 5px; font-size: 17px; }
.muted { color: var(--ion-color-medium); font-size: 11px; }
.chart-wrap { position: relative; height: 340px; margin-top: 14px; }
.empty { display: grid; height: 100%; place-items: center; color: var(--ion-color-medium); font-size: 13px; }
.error-banner { color: var(--ion-color-danger); }
@media (max-width: 760px) { .filters { align-items: stretch; flex-direction: column; } .summary-grid { grid-template-columns: repeat(2, 1fr); } .chart-wrap { height: 280px; } }
</style>
