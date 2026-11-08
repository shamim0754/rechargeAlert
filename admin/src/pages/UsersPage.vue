<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5 text-weight-bold">Users</div>
        <div class="text-grey-7">Approve users before they can configure recharge alerts</div>
      </div>
      <q-btn flat icon="refresh" label="Refresh" :loading="loading" @click="load" />
      <q-btn flat color="negative" label="Logout" class="q-ml-sm" @click="logout" />
    </div>

    <q-banner v-if="error" class="bg-negative text-white q-mb-md" dense>{{ error }}</q-banner>

    <q-table
      flat
      bordered
      row-key="id"
      :rows="users"
      :columns="columns"
      :loading="loading"
      :pagination="{ rowsPerPage: 20 }"
    >
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge :color="statusColor(props.row.status)" :label="props.row.status" />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn
            v-if="props.row.status !== 'APPROVED'"
            dense
            color="positive"
            label="Approve"
            class="q-mr-sm"
            :loading="acting === props.row.id"
            @click="approve(props.row.id)"
          />
          <q-btn
            v-if="props.row.status !== 'REVOKED'"
            dense
            outline
            color="negative"
            label="Revoke"
            :loading="acting === props.row.id"
            @click="revoke(props.row.id)"
          />
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { QTableColumn } from 'quasar';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

type UserRow = {
  id: string;
  username: string;
  status: string;
  monitoringEnabled: boolean;
  alertThresholdBdt: number | null;
  descoAccountNo: string | null;
  lastBalance: number | null;
  createdAt: string;
};

const users = ref<UserRow[]>([]);
const loading = ref(false);
const acting = ref<string | null>(null);
const error = ref('');
const auth = useAuthStore();
const router = useRouter();

const columns: QTableColumn[] = [
  { name: 'username', label: 'Username', field: 'username', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left' },
  { name: 'descoAccountNo', label: 'Account No', field: 'descoAccountNo', align: 'left' },
  { name: 'lastBalance', label: 'Last Balance', field: 'lastBalance', align: 'right' },
  {
    name: 'monitoringEnabled',
    label: 'Monitoring',
    field: 'monitoringEnabled',
    align: 'center',
    format: (v: boolean) => (v ? 'On' : 'Off'),
  },
  { name: 'actions', label: 'Actions', field: 'id', align: 'right' },
];

function statusColor(status: string) {
  if (status === 'APPROVED') return 'positive';
  if (status === 'REVOKED') return 'negative';
  return 'warning';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api<{ users: UserRow[] }>('/admin/users');
    users.value = data.users;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load users';
    if (String(error.value).toLowerCase().includes('sign in') || String(error.value).includes('401')) {
      auth.logout();
      await router.replace('/login');
    }
  } finally {
    loading.value = false;
  }
}

async function approve(id: string) {
  acting.value = id;
  try {
    await api(`/admin/users/${id}/approve`, { method: 'POST' });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Approve failed';
  } finally {
    acting.value = null;
  }
}

async function revoke(id: string) {
  acting.value = id;
  try {
    await api(`/admin/users/${id}/revoke`, { method: 'POST' });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Revoke failed';
  } finally {
    acting.value = null;
  }
}

function logout() {
  auth.logout();
  void router.replace('/login');
}

onMounted(load);
</script>
