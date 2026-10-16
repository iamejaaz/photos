<template>
  <SettingsHeader
    :title="__('Problem reports')"
    :description="__('Problems people reported from the app or the web, newest first.')"
  />
  <SettingsBody>
    <label class="flex items-center gap-2 pb-3 text-base text-ink-gray-7">
      <Switch v-model="includeDone" />
      {{ __('Show fixed and closed') }}
    </label>
    <div v-if="loading" class="flex justify-center py-8"><LoadingIndicator class="size-5" /></div>
    <p v-else-if="!reports.length" class="text-base text-ink-gray-6">
      {{ includeDone ? __('Nobody has reported a problem yet.') : __('No open reports.') }}
    </p>
    <div v-else class="divide-y divide-outline-gray-1">
      <div v-for="report in reports" :key="report.name" class="flex flex-col gap-2 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-base font-medium text-ink-gray-9">{{ report.full_name || report.owner }}</div>
            <div class="text-sm text-ink-gray-5">{{ details(report) }}</div>
          </div>
          <Select
            class="w-28 shrink-0"
            :model-value="report.status"
            :options="statusOptions"
            @update:model-value="setStatus(report, String($event))"
          />
        </div>
        <p class="whitespace-pre-wrap text-base text-ink-gray-8">
          {{ report.description || __('No description, see the screenshot.') }}
        </p>
        <button
          v-if="report.screenshot"
          class="w-fit overflow-hidden rounded-lg ring-1 ring-outline-gray-2"
          :aria-label="__('Show screenshot')"
          @click="toggle(report.name)"
        >
          <img
            :src="mediaUrl(report.screenshot)"
            :class="expanded.has(report.name) ? 'max-h-[70vh]' : 'max-h-40'"
            class="w-auto object-contain"
            alt=""
          />
        </button>
        <details v-if="errorsOf(report).length" class="text-sm text-ink-gray-6">
          <summary class="cursor-pointer">
            {{ __('Errors the app caught ({0})', [errorsOf(report).length]) }}
          </summary>
          <pre class="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-gray-2 p-3 text-xs">{{
            errorsOf(report).join('\n')
          }}</pre>
        </details>
      </div>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { LoadingIndicator, Select, SettingsBody, SettingsHeader, Switch, call, toast } from 'frappe-ui'

import { errorText } from '../../resources/drive'
import { mediaUrl } from '../../resources/media'

type Report = {
  name: string
  status: string
  description: string | null
  screenshot: string | null
  page: string | null
  platform: string | null
  app_version: string | null
  recent_errors: string | null
  owner: string
  full_name: string
  creation: string
}

const reports = ref<Report[]>([])
const loading = ref(true)
const includeDone = ref(false)
const expanded = reactive(new Set<string>())
const statusOptions = [
  { label: __('Open'), value: 'Open' },
  { label: __('Fixed'), value: 'Fixed' },
  { label: __('Closed'), value: 'Closed' },
]

const when = (value: string) =>
  new Date(value.replace(' ', 'T')).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function details(report: Report) {
  const where = report.platform === 'android' ? __('Android app {0}', [report.app_version ?? '']) : __('Web')
  return [when(report.creation), where, report.page].filter(Boolean).join(' · ')
}

function errorsOf(report: Report): string[] {
  try {
    const parsed = JSON.parse(report.recent_errors || '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return report.recent_errors ? [report.recent_errors] : []
  }
}

function toggle(name: string) {
  if (expanded.has(name)) expanded.delete(name)
  else expanded.add(name)
}

async function load() {
  loading.value = true
  try {
    reports.value = (await call('photos.api.feedback.problem_reports', {
      include_done: includeDone.value,
    })) as Report[]
  } catch (error) {
    toast.error(errorText(error) || __('Could not load problem reports'))
  } finally {
    loading.value = false
  }
}

async function setStatus(report: Report, status: string) {
  const previous = report.status
  report.status = status
  try {
    await call('photos.api.feedback.set_report_status', { report: report.name, status })
    if (!includeDone.value && status !== 'Open')
      reports.value = reports.value.filter((item) => item.name !== report.name)
  } catch (error) {
    report.status = previous
    toast.error(errorText(error) || __('Could not update the report'))
  }
}

watch(includeDone, load, { immediate: true })
</script>
