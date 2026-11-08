import { defineStore, acceptHMRUpdate } from 'pinia';
import { api, setAuthToken, getAuthToken } from '@/lib/api';

export type AppUser = {
  id: string;
  username: string;
  status: string;
  monitoringEnabled: boolean;
  alertThresholdBdt: number | null;
  alertEmail: string | null;
  alertsPerDay: number;
  descoAccountId: number | null;
  descoAccountNo: string | null;
  descoMeterNo: string | null;
  lastBalance: number | null;
  lastBalanceAt: string | null;
  balanceSnapshotAt: string | null;
  canConfigureAlerts: boolean;
};

export const useAuthStore = defineStore('user-auth', {
  state: () => ({
    token: getAuthToken() as string | null,
    user: null as AppUser | null,
  }),
  getters: {
    isAuthenticated: (s) => Boolean(s.token),
    isApproved: (s) => s.user?.status === 'APPROVED',
  },
  actions: {
    async login(username: string, password: string) {
      const data = await api<{ token: string; user: AppUser }>('/auth/login', {
        method: 'POST',
        json: { username, password },
      });
      this.token = data.token;
      this.user = data.user;
      setAuthToken(data.token);
    },
    async refreshMe() {
      const data = await api<{ user: AppUser }>('/auth/me');
      this.user = data.user;
    },
    logout() {
      this.token = null;
      this.user = null;
      setAuthToken(null);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
