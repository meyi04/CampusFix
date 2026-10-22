<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <div slot="start" class="brand">
          <img class="brand-mark" src="/campusfix-mark.svg" alt="" />
          <span class="brand-name">CampusFix</span>
        </div>
        <ion-buttons slot="end">
          <ion-button v-if="installPromptAvailable" title="Install" aria-label="Install app" @click="installApp">
            <ion-icon slot="start" :icon="downloadOutline" />
            <span class="install-label">Install app</span>
          </ion-button>
          <ion-button v-if="session.profile" router-link="/notifications" title="Updates" aria-label="Updates">
            <ion-icon :icon="notificationsOutline" />
          </ion-button>
          <template v-if="session.profile?.role === 'admin'">
            <ion-button router-link="/announcements" title="News" aria-label="News">
              <ion-icon :icon="megaphoneOutline" />
            </ion-button>
          </template>
          <ion-button router-link="/profile" title="Profile" aria-label="Profile">
            <ion-icon :icon="personCircleOutline" />
          </ion-button>
          <ion-button title="Sign out" aria-label="Sign out" @click="confirmLogout">
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
  IonToolbar,
} from '@ionic/vue';
import {
  addCircleOutline,
  barChartOutline,
  businessOutline,
  constructOutline,
  downloadOutline,
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
import { canInstallPwa as installPromptAvailable, promptPwaInstall } from '@/utils/pwa';

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
    ];
  }
  const items = [
    ...(role === 'maintenance' ? [] : [{ label: 'Home', to: '/home', icon: homeOutline }]),
    { label: role === 'maintenance' ? 'Work' : 'Reports', to: role === 'maintenance' ? '/maintenance' : '/reports', icon: role === 'maintenance' ? constructOutline : fileTrayFullOutline },
    ...(role === 'student' || role === 'faculty' ? [{ label: 'New report', to: '/reports/new', icon: addCircleOutline }] : []),
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

async function installApp() {
  try {
    await promptPwaInstall();
  } catch (error) {
    console.error('CampusFix could not open the browser install prompt.', error);
  }
}
</script>

<style scoped>
.brand-mark {
  width: 36px;
  height: 36px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-name {
  font-size: 18px;
  font-weight: 750;
}

.install-label { font-size: 12px; font-weight: 650; }

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
