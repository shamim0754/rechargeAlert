<template>
  <q-page class="flex flex-center bg-grey-2">
    <q-card class="q-pa-md" style="width: 100%; max-width: 420px">
      <q-card-section>
        <div class="text-h5 text-weight-bold">RechargeAlert Admin</div>
        <div class="text-grey-7 q-mt-xs">Sign in to approve users</div>
      </q-card-section>
      <q-card-section>
        <q-form class="q-gutter-md" @submit.prevent="onSubmit">
          <q-input v-model="email" label="Email" type="email" outlined dense :rules="[required]" />
          <q-input
            v-model="password"
            label="Password"
            type="password"
            outlined
            dense
            :rules="[required]"
          />
          <q-banner v-if="error" class="bg-negative text-white" dense>{{ error }}</q-banner>
          <q-btn color="primary" class="full-width" label="Sign in" type="submit" :loading="loading" />
        </q-form>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth-store';

const auth = useAuthStore();
const router = useRouter();
const email = ref('admin@rechargealert.local');
const password = ref('');
const loading = ref(false);
const error = ref('');
const required = (v: string) => !!v || 'Required';

async function onSubmit() {
  loading.value = true;
  error.value = '';
  try {
    await auth.login(email.value, password.value);
    await router.replace('/');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>
