import { defineBoot } from '#q-app';
import { setAuthToken } from '@/lib/api';

export default defineBoot(() => {
  const token = localStorage.getItem('ra_admin_token');
  if (token) setAuthToken(token);
});
