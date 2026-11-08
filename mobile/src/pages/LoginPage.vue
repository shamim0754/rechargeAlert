<template>
  <q-page class="q-pa-md flex flex-center bg-grey-2">
    <div style="width: 100%; max-width: 420px">
      <div class="text-h4 text-weight-bold text-primary q-mb-xs">RechargeAlert</div>
      <div class="text-grey-7 q-mb-lg">Sign in with your DESCO prepaid portal account</div>

      <q-form class="q-gutter-md" @submit.prevent="onSubmit">
        <q-input
          v-model="username"
          label="Email or phone"
          outlined
          bg-color="white"
          :rules="[(v) => !!v || 'Required']"
        />
        <q-input
          v-model="password"
          label="Password"
          type="password"
          outlined
          bg-color="white"
          :rules="[(v) => !!v || 'Required']"
        />
        <q-banner v-if="error" dense class="bg-negative text-white">{{ error }}</q-banner>
        <q-btn color="primary" class="full-width" label="Sign in" type="submit" :loading="loading" />
      </q-form>

      <div class="q-mt-md text-center">
        New here?
        <router-link to="/register">Create an account</router-link>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth-store';

const auth = useAuthStore();
const router = useRouter();
const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function onSubmit() {
  loading.value = true;
  error.value = '';
  try {
    await auth.login(username.value.trim(), password.value);
    await router.replace('/');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>
