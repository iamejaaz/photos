<template>
  <SettingsHeader :title="__('Account')" />
  <SettingsBody>
    <div class="flex flex-col gap-6 pt-2">
      <SettingsRow :title="fullName" :description="site">
        <Button @click="signOut">{{ __('Sign out') }}</Button>
      </SettingsRow>
      <div class="text-sm text-ink-gray-5">
        {{ __('Signing out stops backup on this phone. Your photos stay on the site.') }}
      </div>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { Button, SettingsBody, SettingsHeader, SettingsRow } from 'frappe-ui'

import { fullName } from '@/boot/session'
import { signOut as revoke } from '../../native/auth'
import { photosBackup } from '../../native/backup'
import { trimMediaCache } from '../../native/media'
import { siteOrigin } from '../../native/site'
import { saveSite, savedSite } from '../../native/sites'

const site = siteOrigin()

async function signOut() {
  const { plugin } = await photosBackup()
  await plugin.signOut().catch(() => {})
  await trimMediaCache(0)
  const saved = await savedSite()
  await revoke(site, saved?.clientId ?? '').catch(() => {})
  await saveSite(null)
  window.location.replace('/')
}
</script>
