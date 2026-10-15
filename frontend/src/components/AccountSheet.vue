<template>
  <BottomSheet v-model:open="accountSheet.open">
    <div class="flex flex-col pb-4">
      <div class="flex items-center gap-3 px-5 pb-4 pt-1">
        <Avatar size="3xl" :image="image" :label="fullName || user" />
        <div class="min-w-0">
          <div class="truncate text-lg font-semibold text-ink-gray-9">{{ fullName || user }}</div>
          <div v-if="fullName && fullName !== user" class="truncate text-base text-ink-gray-6">
            {{ user }}
          </div>
          <div class="truncate text-sm text-ink-gray-5">{{ host }}</div>
        </div>
      </div>
      <div v-if="others.length" class="border-t border-outline-gray-1 py-1">
        <div v-for="other in others" :key="other.url" class="flex items-center pr-3">
          <button
            class="flex min-w-0 flex-1 items-center gap-3 px-5 py-2.5 text-left active:bg-surface-gray-2"
            @click="switchTo(other)"
          >
            <Avatar size="xl" :image="other.image ?? undefined" :label="other.fullName || other.user" />
            <div class="min-w-0">
              <div class="truncate text-base font-medium text-ink-gray-8">
                {{ other.fullName || other.user }}
              </div>
              <div class="truncate text-sm text-ink-gray-5">{{ hostOf(other.url) }}</div>
            </div>
          </button>
          <Button variant="ghost" :aria-label="__('Remove from this phone')" @click="remove(other)">
            <template #icon><LucideX class="size-4" /></template>
          </Button>
        </div>
      </div>
      <div class="border-t border-outline-gray-1 py-1">
        <ListRow
          v-if="native"
          class="px-5"
          :icon="LucidePlus"
          :label="__('Add another site')"
          @click="addSite"
        />
        <ListRow
          class="px-5"
          :icon="LucideSettings"
          :label="__('Photos settings')"
          @click="openPhotoSettings"
        />
        <ListRow
          class="px-5"
          :icon="LucideLogOut"
          :label="native ? __('Sign out of this site') : __('Sign out')"
          :disabled="signingOut"
          @click="signOut"
        />
      </div>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Avatar, BottomSheet, Button } from 'frappe-ui'
import LucideLogOut from '~icons/lucide/log-out'
import LucidePlus from '~icons/lucide/plus'
import LucideSettings from '~icons/lucide/settings'
import LucideX from '~icons/lucide/x'

import { fullName, getSessionUser, imageURL, useSessionStore } from '@/boot/session'
import { mediaUrl } from '../resources/media'
import ListRow from './ListRow.vue'
import { accountSheet, openSettings } from '../data/dialogs'
import type { Account } from '../native/sites'

const native = Boolean(import.meta.env.VITE_NATIVE)
const user = getSessionUser() ?? ''
const image = computed(() => (imageURL.value ? mediaUrl(imageURL.value) : undefined))
const hostOf = (url: string) => new URL(url).host
const host = ref(window.location.host)
const others = ref<Account[]>([])
const signingOut = ref(false)

watch(
  () => accountSheet.open,
  async (open) => {
    if (!open || !native) return
    const [{ siteOrigin }, { savedAccounts }] = await Promise.all([
      import('../native/site'),
      import('../native/sites'),
    ])
    host.value = hostOf(siteOrigin())
    others.value = (await savedAccounts()).filter((account) => account.url !== siteOrigin())
  },
)

async function switchTo(account: Account) {
  const { switchAccount } = await import('../native/sites')
  await switchAccount(account)
}

async function remove(account: Account) {
  const [{ forgetAccount }, { signOut }] = await Promise.all([
    import('../native/sites'),
    import('../native/auth'),
  ])
  signOut(account.url, account.clientId).catch(() => {})
  await forgetAccount(account.url)
  others.value = others.value.filter((item) => item.url !== account.url)
}

async function addSite() {
  const { startAddingSite } = await import('../native/sites')
  startAddingSite()
}

function openPhotoSettings() {
  accountSheet.open = false
  openSettings()
}

async function signOut() {
  signingOut.value = true
  if (native) {
    const { signOutOfThisSite } = await import('../native/account')
    return signOutOfThisSite()
  }
  await useSessionStore().logout.submit()
  window.location.href = '/login'
}
</script>
