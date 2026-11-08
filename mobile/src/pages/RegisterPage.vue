<template>
  <q-page class="q-pa-md">
    <div class="text-h5 text-weight-bold q-mb-xs">Create account</div>
    <div class="text-grey-7 q-mb-md">Uses DESCO prepaid portal registration</div>

    <q-stepper v-model="step" color="primary" animated flat bordered>
      <q-step :name="1" title="Sign-in details" icon="person" :done="step > 1">
        <q-option-group
          v-model="mode"
          :options="[
            { label: 'Mobile number', value: 'mobile' },
            { label: 'Email address', value: 'email' },
          ]"
          color="primary"
          inline
          class="q-mb-md"
        />
        <q-input
          v-if="mode === 'mobile'"
          v-model="mobile"
          label="Mobile number"
          placeholder="01XXXXXXXXX"
          outlined
        />
        <template v-else>
          <q-input v-model="email" label="Email address" type="email" outlined class="q-mb-md" />
          <q-input v-model="otpMobile" label="OTP mobile (optional)" outlined />
        </template>
        <q-stepper-navigation>
          <q-btn color="primary" label="Send verification code" :loading="loading" @click="start" />
        </q-stepper-navigation>
      </q-step>

      <q-step :name="2" title="Verify" icon="sms" :done="step > 2">
        <q-input v-model="code" label="Verification code" outlined />
        <q-stepper-navigation>
          <q-btn flat color="primary" label="Back" class="q-mr-sm" @click="step = 1" />
          <q-btn color="primary" label="Verify" :loading="loading" @click="verify" />
        </q-stepper-navigation>
      </q-step>

      <q-step :name="3" title="Password" icon="lock">
        <q-input v-model="password" label="Password" type="password" outlined class="q-mb-md" />
        <q-input v-model="password2" label="Confirm password" type="password" outlined />
        <q-stepper-navigation>
          <q-btn flat color="primary" label="Back" class="q-mr-sm" @click="step = 2" />
          <q-btn color="primary" label="Create account" :loading="loading" @click="setPassword" />
        </q-stepper-navigation>
      </q-step>
    </q-stepper>

    <q-banner v-if="error" dense class="bg-negative text-white q-mt-md">{{ error }}</q-banner>
    <q-banner v-if="info" dense class="bg-positive text-white q-mt-md">{{ info }}</q-banner>

    <div class="q-mt-lg text-center">
      Already registered?
      <router-link to="/login">Sign in</router-link>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api';

const router = useRouter();
const step = ref(1);
const mode = ref<'mobile' | 'email'>('mobile');
const mobile = ref('');
const email = ref('');
const otpMobile = ref('');
const code = ref('');
const password = ref('');
const password2 = ref('');
const sessionId = ref('');
const loading = ref(false);
const error = ref('');
const info = ref('');

const username = computed(() => (mode.value === 'mobile' ? mobile.value.trim() : email.value.trim()));

async function start() {
  loading.value = true;
  error.value = '';
  info.value = '';
  try {
    const data = await api<{ sessionId: string }>('/auth/register/start', {
      method: 'POST',
      json: {
        username: username.value,
        otpMobile: mode.value === 'email' && otpMobile.value ? otpMobile.value.trim() : undefined,
      },
    });
    sessionId.value = data.sessionId;
    step.value = 2;
    info.value = 'Verification code sent.';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not start registration';
  } finally {
    loading.value = false;
  }
}

async function verify() {
  loading.value = true;
  error.value = '';
  try {
    await api('/auth/register/verify', {
      method: 'POST',
      json: {
        username: username.value,
        code: code.value.trim(),
        sessionId: sessionId.value,
      },
    });
    step.value = 3;
    info.value = 'Verified. Set a password.';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Verification failed';
  } finally {
    loading.value = false;
  }
}

async function setPassword() {
  if (password.value !== password2.value) {
    error.value = 'Passwords do not match';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await api('/auth/register/set-password', {
      method: 'POST',
      json: {
        username: username.value,
        password: password.value,
        sessionId: sessionId.value,
      },
    });
    info.value = 'Account created. Waiting for admin approval after you sign in.';
    await router.replace('/login');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not set password';
  } finally {
    loading.value = false;
  }
}
</script>
