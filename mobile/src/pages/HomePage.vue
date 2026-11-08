<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5 text-weight-bold">Balance</div>
        <div class="text-grey-7">{{ auth.user?.username }}</div>
      </div>
      <q-btn flat icon="logout" @click="logout" />
    </div>

    <q-banner
      v-if="auth.user && auth.user.status !== 'APPROVED'"
      class="bg-warning text-dark q-mb-md"
      rounded
    >
      Status: <strong>{{ auth.user.status }}</strong>.
      Recharge alerts stay locked until an admin approves your account.
    </q-banner>

    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-caption text-grey-7">Current balance</div>
        <div class="text-h3 text-weight-bold">
          {{ balanceText }}
        </div>
        <div v-if="meta.accountNo" class="text-body2 q-mt-sm">
          Account {{ meta.accountNo }}
          <span v-if="meta.meterNo"> · Meter {{ meta.meterNo }}</span>
        </div>
        <div v-if="meta.balanceSnapshotAt" class="text-caption text-grey-6 q-mt-xs">
          Snapshot {{ meta.balanceSnapshotAt }}
          <span v-if="meta.stale"> · stale</span>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat color="primary" label="Refresh" :loading="loading" @click="loadBalance" />
      </q-card-actions>
    </q-card>

    <q-btn
      color="primary"
      class="full-width"
      outline
      label="Recharge alert settings"
      :disable="!auth.isApproved"
      to="/alerts"
    />

    <q-banner v-if="error" dense class="bg-negative text-white q-mt-md">{{ error }}</q-banner>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { announceLowBalance } from '@/utils/alertSpeak';

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const error = ref('');
const meta = reactive({
  balance: null as number | null,
  currency: 'BDT',
  accountNo: '' as string | null,
  meterNo: '' as string | null,
  balanceSnapshotAt: '' as string | null,
  stale: false,
});

const balanceText = computed(() => {
  if (meta.balance == null) return '—';
  return `${meta.balance.toFixed(2)} ${meta.currency}`;
});

async function loadBalance() {
  loading.value = true;
  error.value = '';
  try {
    await auth.refreshMe();
    const data = await api<{
      balance: number | null;
      currency?: string;
      accountNo?: string;
      meterNo?: string;
      balanceSnapshotAt?: string;
      stale?: boolean;
    }>('/balance/current');
    meta.balance = data.balance;
    meta.currency = data.currency || 'BDT';
    meta.accountNo = data.accountNo || null;
    meta.meterNo = data.meterNo || null;
    meta.balanceSnapshotAt = data.balanceSnapshotAt || null;
    meta.stale = Boolean(data.stale);

    const threshold = auth.user?.alertThresholdBdt;
    if (
      auth.user?.monitoringEnabled &&
      threshold != null &&
      data.balance != null &&
      data.balance < threshold
    ) {
      void announceLowBalance(threshold, data.balance);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load balance';
  } finally {
    loading.value = false;
  }
}

function logout() {
  auth.logout();
  void router.replace('/login');
}

onMounted(async () => {
  if (!auth.user) {
    try {
      await auth.refreshMe();
    } catch {
      auth.logout();
      await router.replace('/login');
      return;
    }
  }
  await loadBalance();
});
</script>
