<template>
  <q-page class="q-pa-md">
    <div class="text-h5 text-weight-bold q-mb-xs">Recharge alert</div>
    <div class="text-grey-7 q-mb-md">
      Get notified when your DESCO prepaid balance falls below a threshold.
    </div>

    <q-banner v-if="!auth.isApproved" class="bg-warning text-dark q-mb-md" rounded>
      Waiting for admin approval. Alert settings are disabled.
    </q-banner>

    <q-form class="q-gutter-md" @submit.prevent="save">
      <q-input
        v-model.number="threshold"
        type="number"
        label="Alert when balance below (BDT)"
        outlined
        :disable="!auth.isApproved"
        :rules="[(v) => (typeof v === 'number' && v > 0) || 'Enter a positive amount']"
      />
      <q-input
        v-model.number="alertsPerDay"
        type="number"
        label="How many times want alert in a day"
        hint="1–24 times per day (Asia/Dhaka)"
        outlined
        min="1"
        max="24"
        :disable="!auth.isApproved"
        :rules="[
          (v) =>
            (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 24) ||
            'Enter 1 to 24',
        ]"
      />
      <q-input
        v-model="email"
        type="email"
        label="Alert email"
        outlined
        :disable="!auth.isApproved"
      />
      <div>
        <q-toggle
          v-model="monitoringEnabled"
          label="Activate"
          :disable="!auth.isApproved"
        />
        <div class="text-caption text-grey-6 q-ml-sm">
          When on, the app checks your balance on schedule and sends alerts if it falls below your threshold.
        </div>
      </div>
      <q-banner v-if="error" dense class="bg-negative text-white">{{ error }}</q-banner>
      <q-banner v-if="info" dense class="bg-positive text-white">{{ info }}</q-banner>
      <q-btn
        color="primary"
        class="full-width"
        label="Save"
        type="submit"
        :disable="!auth.isApproved"
        :loading="loading"
      />
      <q-btn flat class="full-width" label="Back" to="/" />
    </q-form>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

const auth = useAuthStore();
const router = useRouter();
const threshold = ref<number>(100);
const alertsPerDay = ref<number>(1);
const email = ref('');
const monitoringEnabled = ref(true);
const loading = ref(false);
const error = ref('');
const info = ref('');

onMounted(async () => {
  if (!auth.user) {
    try {
      await auth.refreshMe();
    } catch {
      await router.replace('/login');
      return;
    }
  }
  if (!auth.isApproved) return;
  threshold.value = auth.user?.alertThresholdBdt || 100;
  alertsPerDay.value = auth.user?.alertsPerDay || 1;
  email.value = auth.user?.alertEmail || '';
  monitoringEnabled.value = auth.user?.monitoringEnabled ?? true;
});

async function save() {
  loading.value = true;
  error.value = '';
  info.value = '';
  try {
    await api('/alerts/settings', {
      method: 'PUT',
      json: {
        alertThresholdBdt: Number(threshold.value),
        alertsPerDay: Number(alertsPerDay.value),
        alertEmail: email.value || null,
        monitoringEnabled: monitoringEnabled.value,
      },
    });
    await auth.refreshMe();
    info.value = 'Alert settings saved.';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Save failed';
  } finally {
    loading.value = false;
  }
}
</script>
