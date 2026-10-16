<template>
  <SettingsHeader
    :title="__('Sign-up problems')"
    :description="__('People whose sign-up or password email could not be delivered in the last 30 days.')"
  />
  <SettingsBody>
    <div v-if="loading" class="flex justify-center py-8"><LoadingIndicator class="size-5" /></div>
    <p v-else-if="!problems.length" class="pt-2 text-base text-ink-gray-6">
      {{ __('No problems. Every sign-up email was delivered.') }}
    </p>
    <div v-else class="divide-y divide-outline-gray-1">
      <SettingsRow
        v-for="problem in problems"
        :key="problem.user"
        :title="problem.full_name || problem.user"
        :description="describe(problem)"
      >
        <Button :loading="copying === problem.user" @click="copyLink(problem.user)">
          <template #prefix><LucideLink class="size-4" /></template>
          {{ __('Copy sign-up link') }}
        </Button>
      </SettingsRow>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button, LoadingIndicator, SettingsBody, SettingsHeader, SettingsRow, call, toast } from 'frappe-ui'
import LucideLink from '~icons/lucide/link'

import { errorText } from '../../resources/drive'

type Problem = {
  user: string
  full_name: string | null
  joined: string
  last_login: string | null
  failed_on: string
  reason: string
}

const problems = ref<Problem[]>([])
const loading = ref(true)
const copying = ref('')

const day = (value: string) =>
  new Date(value.replace(' ', 'T')).toLocaleDateString(undefined, { dateStyle: 'medium' })

function describe(problem: Problem) {
  const seen = problem.last_login
    ? __('Last signed in {0}', [day(problem.last_login)])
    : __('Has not signed in yet')
  return `${problem.user} · ${problem.reason} ${__('Failed {0}', [day(problem.failed_on)])}. ${seen}.`
}

;(call('photos.api.signups.signup_problems') as Promise<Problem[]>)
  .then((rows) => (problems.value = rows))
  .catch((error) => toast.error(errorText(error) || __('Could not load sign-up problems')))
  .finally(() => (loading.value = false))

async function copyLink(user: string) {
  copying.value = user
  try {
    const link = (await call('photos.api.signups.signup_link', { user })) as string
    await navigator.clipboard.writeText(link)
    toast.success(__('Link copied. Send it to them on chat so they can set a password.'))
  } catch (error) {
    toast.error(errorText(error) || __('Could not make a link'))
  } finally {
    copying.value = ''
  }
}
</script>
