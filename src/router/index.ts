import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import AnalyticsPage from '@/views/AnalyticsPage.vue';
import { firebaseConfigurationError } from '@/firebase/client';
import { useSessionStore } from '@/stores/session';
import type { UserRole } from '@/models/domain';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/home',
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/views/HomePage.vue'),
    meta: { requiresAuth: true },
  },
  { path: '/auth/login', name: 'Login', component: () => import('@/views/LoginPage.vue'), meta: { publicOnly: true } },
  { path: '/auth/register', name: 'Register', component: () => import('@/views/RegisterPage.vue'), meta: { publicOnly: true } },
  { path: '/auth/forgot-password', name: 'ForgotPassword', component: () => import('@/views/ForgotPasswordPage.vue'), meta: { publicOnly: true } },
  { path: '/setup', name: 'Setup', component: () => import('@/views/SetupPage.vue') },
  { path: '/reports', name: 'Reports', component: () => import('@/views/ReportsPage.vue'), meta: { requiresAuth: true } },
  {
    path: '/reports/new',
    name: 'CreateReport',
    component: () => import('@/views/ReportCreatePage.vue'),
    meta: { requiresAuth: true, roles: ['student', 'faculty'] satisfies UserRole[] },
  },
  { path: '/reports/:id', name: 'ReportDetails', component: () => import('@/views/ReportDetailPage.vue'), meta: { requiresAuth: true } },
  { path: '/maintenance', name: 'Maintenance', component: () => import('@/views/ReportsPage.vue'), meta: { requiresAuth: true, roles: ['maintenance'] satisfies UserRole[] } },
  { path: '/notifications', name: 'Notifications', component: () => import('@/views/NotificationsPage.vue'), meta: { requiresAuth: true } },
  { path: '/profile', name: 'Profile', component: () => import('@/views/ProfilePage.vue'), meta: { requiresAuth: true } },
  { path: '/announcements', name: 'Announcements', component: () => import('@/views/AnnouncementsPage.vue'), meta: { requiresAuth: true } },
  { path: '/admin/catalog', name: 'AdminCatalog', component: () => import('@/views/CatalogPage.vue'), meta: { requiresAuth: true, roles: ['admin'] satisfies UserRole[] } },
  { path: '/admin/users', name: 'AdminUsers', component: () => import('@/views/UsersPage.vue'), meta: { requiresAuth: true, roles: ['admin'] satisfies UserRole[] } },
  { path: '/admin/audit', name: 'AdminAudit', component: () => import('@/views/AuditLogsPage.vue'), meta: { requiresAuth: true, roles: ['admin'] satisfies UserRole[] } },
  { path: '/admin/analytics', name: 'AdminAnalytics', component: AnalyticsPage, meta: { requiresAuth: true, roles: ['admin'] satisfies UserRole[] } },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  if (to.name === 'Setup') return true;
  if (firebaseConfigurationError) return { name: 'Setup' };

  const session = useSessionStore();
  await session.initialize();

  if (to.meta.requiresAuth) {
    if (!session.user) return { name: 'Login', query: { redirect: to.fullPath } };
    await session.refreshProfile();
    if (!session.profile) return { name: 'Setup' };
    const roles = to.meta.roles as UserRole[] | undefined;
    if (roles && !roles.includes(session.profile.role)) return { name: 'Home' };
    if (to.name === 'Home' && session.profile.role === 'admin') return { name: 'AdminAnalytics' };
  }

  if (to.meta.publicOnly && session.user) {
    await session.refreshProfile();
    if (session.profile) return session.profile.role === 'admin' ? { name: 'AdminAnalytics' } : { name: 'Home' };
  }
  return true;
});

export default router;
