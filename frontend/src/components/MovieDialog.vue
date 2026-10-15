<template>
  <Dialog
    v-model:open="movie.open"
    :title="__('Create movie')"
    size="sm"
    :actions="[{ label: __('Create'), variant: 'solid', loading: saving, onClick: create }]"
  >
    <div class="flex flex-col gap-4">
      <p class="text-base text-ink-gray-6">
        {{ __('{0} photos, each with a slow zoom and a fade into the next.', [movie.files.length]) }}
      </p>
      <FormControl v-model="title" type="text" :label="__('Title')" :placeholder="__('Movie')" />
      <FormControl v-model="seconds" type="select" :label="__('Each photo')" :options="speeds" />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, FormControl, toast } from 'frappe-ui'

import { createMovie } from '../resources/movies'
import { clearSelection } from '../data/selection'
import { movie } from '../data/dialogs'

const speeds = [
  { label: __('2 seconds'), value: '2' },
  { label: __('3 seconds'), value: '3' },
  { label: __('5 seconds'), value: '5' },
]
const title = ref('')
const seconds = ref('3')
const saving = ref(false)

watch(
  () => movie.open,
  (open) => {
    if (open) title.value = ''
  },
)

async function create() {
  saving.value = true
  try {
    await createMovie(movie.files, title.value, Number(seconds.value), movie.album)
    movie.open = false
    clearSelection()
    toast.info(__('Making your movie. You will get a message when it is ready.'))
  } finally {
    saving.value = false
  }
}
</script>
