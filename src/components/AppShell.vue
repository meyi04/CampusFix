<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>
          <span class="brand-mark">CF</span>
          <span class="brand-name">CampusFix</span>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button router-link="/profile" aria-label="Profile">
            <ion-icon :icon="personCircleOutline" />
          </ion-button>
          <ion-button aria-label="Sign out" @click="confirmLogout">
            <ion-icon :icon="logOutOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="app-content">
      <main class="page-container">
        <header class="page-heading">
          <div>
            <p class="eyebrow">{{ headingLabel }}</p>
            <h1>{{ title }}</h1>
            <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
          </div>
          <slot name="action" />
        </header>
        <slot />
      </main>
    </ion-content>
    <ion-footer class="mobile-nav">
      <nav class="nav-items" aria-label="Primary navigation">
        <router-link
          v-for="item in navigation"
          :key="item.label"
          :to="item.to"
          class="nav-item"
          active-class="active"
        >
          <ion-icon :icon="item.icon" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  alertController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import {
  addCircleOutline,
  barChartOutline,
  businessOutline,
  constructOutline,
  fileTrayFullOutline,
  homeOutline,
  logOutOutline,
  megaphoneOutline,
  notificationsOutline,
  peopleOutline,
  personCircleOutline,
  readerOutline,
} from 'ionicons/icons';
import { useSessionStore } from '@/stores/session';
import { logout } from '@/services/auth';

defineProps<{ title: string; subtitle?: string }>();

const router = useRouter();
const session = useSessionStore();
const headingLabel = computed(() => session.profile?.role === 'admin' ? 'ADMINISTRATION' : session.profile?.role === 'maintenance' ? 'MAINTENANCE' : 'MINDSORO STATE UNIVERSITY');
const navigation = computed(() => {
  const role = session.profile?.role;
  if (role === 'admin') {
    return [
      { label: 'Analytics', to: '/admin/analytics', icon: barChartOutline },
      { label: 'Reports', to: '/reports', icon: fileTrayFullOutline },
      { label: 'Directory', to: '/admin/catalog', icon: businessOutline },
      { label: 'Users', to: '/admin/users', icon: peopleOutline },
      { label: 'Audit', to: '/admin/audit', icon: readerOutline },
      { label: 'Updates', to: '/notifications', icon: notificationsOutline },
      { label: 'News', to: '/announcements', icon: megaphoneOutline },
    ];
  }
  const items = [
    ...(role === 'maintenance' ? [] : [{ label: 'Home', to: '/home', icon: homeOutline }]),
    { label: role === 'maintenance' ? 'Work' : 'Reports', to: role === 'maintenance' ? '/maintenance' : '/reports', icon: role === 'maintenance' ? constructOutline : fileTrayFullOutline },
    ...(role === 'student' || role === 'faculty' ? [{ label: 'New report', to: '/reports/new', icon: addCircleOutline }] : []),
    { label: 'Updates', to: '/notifications', icon: notificationsOutline },
    { label: 'News', to: '/announcements', icon: megaphoneOutline },
  ];
  return items;
});

async function confirmLogout() {
  const alert = await alertController.create({
    header: 'Sign out?',
    message: 'You will need to sign in again to access your reports.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Sign out',
        role: 'confirm',
        handler: async () => {
          try {
            await logout();
            await router.replace('/auth/login');
          } catch (error) {
            const failure = await alertController.create({
              header: 'Unable to sign out',
              message: error instanceof Error ? error.message : 'Please try again.',
              buttons: ['OK'],
            });
            await failure.present();
          }
        },
      },
    ],
  });
  await alert.present();
}
</script>

<style scoped>
.brand-mark {
  display: inline-grid;
  width: 36px;
  height: 36px;
  margin-right: 11px;
  place-items: center;
  border-radius: 11px;
  color: white;
  background: var(--ion-color-primary);
  font-size: 13px;
  font-weight: 800;
  vertical-align: middle;
}

.brand-name {
  font-size: 18px;
  font-weight: 750;
  vertical-align: middle;
}

.mobile-nav {
  background: var(--ion-background-color);
  border-top: 1px solid var(--campus-border);
  box-shadow: 0 -8px 25px rgba(25, 55, 38, .035);
}

.nav-items {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 6px;
  width: 100%;
  max-width: 920px;
  margin: auto;
  padding: 7px 8px calc(7px + env(safe-area-inset-bottom));
}

.nav-item {
  display: flex;
  box-sizing: border-box;
  flex: 0 0 76px;
  width: 76px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 42px;
  padding: 3px 7px;
  color: var(--ion-color-medium);
  font-size: 10px;
  font-weight: 600;
  text-decoration: none;
}

.nav-item ion-icon {
  font-size: 21px;
}

.nav-item.active {
  color: var(--ion-color-primary);
  background: #eaf3ed;
  border-radius: 9px;
}

@media (min-width: 850px) {
  .mobile-nav {
    border-top: 0;
    box-shadow: none;
  }
  .nav-items {
    gap: 2px;
    max-width: 1320px;
    padding: 9px 28px;
  }
  .nav-item {
    flex-basis: auto;
    width: auto;
    flex-direction: row;
    gap: 8px;
    min-width: 0;
    padding: 10px 12px;
    border-radius: 9px;
    font-size: 13px;
  }
}
</style>
