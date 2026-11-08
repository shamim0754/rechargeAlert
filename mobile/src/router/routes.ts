import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/LoginPage.vue') }],
  },
  {
    path: '/register',
    component: () => import('@/layouts/BlankLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/RegisterPage.vue') }],
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('@/pages/HomePage.vue') },
      { path: 'alerts', component: () => import('@/pages/AlertSettingsPage.vue') },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
