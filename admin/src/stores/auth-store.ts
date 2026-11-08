import { defineStore, acceptHMRUpdate } from 'pinia';
import { api, setAuthToken, getAuthToken } from '@/lib/api';

type Admin = { id: string; email: string };

export const useAuthStore = defineStore('admin-auth', {
  state: () => ({
    token: getAuthToken() as string | null,
    admin: null as Admin | null,
  }),
  getters: {
    isAuthenticated: (s) => Boolean(s.token),
  },
  actions: {
    async login(email: string, password: string) {
      const data = await api<{ token: string; admin: Admin }>('/admin/login', {
        method: 'POST',
        json: { email, password },
      });
      this.token = data.token;
      this.admin = data.admin;
      setAuthToken(data.token);
    },
    logout() {
      this.token = null;
      this.admin = null;
      setAuthToken(null);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
