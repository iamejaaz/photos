<template>
  <Dialog
    v-model:open="open"
    :title="count === 1 ? __('Edit date and time') : __('Edit date of {0} items', [count])"
    size="sm"
    :actions="[{ label: __('Save'), variant: 'solid', loading: saving, onClick: save }]"
  >
    <div class="flex flex-col gap-4">
      <RadioGroup v-if="count > 1" v-model="mode" orientation="horizontal">
        <Radio value="shift" :label="__('Shift')" />
        <Radio value="set" :label="__('Set all to')" />
      </RadioGroup>
      <DateTimePicker v-if="mode === 'set'" v-model="takenOn" />
      <div v-else class="grid grid-cols-3 gap-2">
        <FormControl v-model="amount" type="number" min="1" />
        <FormControl v-model="unit" type="select" :options="units" />
        <FormControl v-model="direction" type="select" :options="directions" />
      </div>
      <div class="text-sm text-ink-gray-5">
        {{ __('Only Photos changes. The original files stay as they are.') }}
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DateTimePicker, Dialog, FormControl, Radio, RadioGroup, toast } from 'frappe-ui'
import dayjs from 'dayjs'

import { editDate } from '../resources/edit'
import { activeFeed } from '../data/feed'
import { editing, metadataSaved } from '../data/dialogs'

const open = computed({
  get: () => editing.kind === 'date',
  set: (value) => !value && (editing.kind = null),
})
const count = computed(() => editing.files.length)
const mode = ref<'set' | 'shift'>('set')
const takenOn = ref('')
const amount = ref('1')
const unit = ref('60')
const direction = ref('1')
const saving = ref(false)
const units = [
  { label: __('Minutes'), value: '1' },
  { label: __('Hours'), value: '60' },
  { label: __('Days'), value: '1440' },
]
const directions = [
  { label: __('Later'), value: '1' },
  { label: __('Earlier'), value: '-1' },
]

watch(open, (value) => {
  if (!value) return
  mode.value = count.value > 1 ? 'shift' : 'set'
  const first = activeFeed.value?.feed.rows.find((row) => row.name === editing.files[0])
  takenOn.value = dayjs(first?.taken || undefined).format('YYYY-MM-DD HH:mm:ss')
})

async function save() {
  saving.value = true
  try {
    const shift = Number(amount.value) * Number(unit.value) * Number(direction.value)
    await editDate(
      editing.files,
      mode.value === 'set' ? { taken_on: takenOn.value } : { shift_minutes: shift },
    )
    metadataSaved((row) =>
      mode.value === 'set'
        ? takenOn.value
        : dayjs(row.taken).add(shift, 'minute').format('YYYY-MM-DD HH:mm:ss'),
    )
    toast.success(__('Date updated'))
  } catch (error) {
    toast.error((error as { messages?: string[] }).messages?.[0] ?? __('Could not update the date'))
  } finally {
    saving.value = false
  }
}
</script>
