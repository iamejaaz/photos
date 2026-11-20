<template>
  <Teleport to="body">
    <div
      v-if="photo"
      class="fixed inset-0 z-[60] flex flex-col bg-black text-white"
    >
      <div class="flex items-center justify-between p-3">
        <button
          class="trim-button"
          :aria-label="__('Cancel')"
          @click="emit('close')"
        >
          <LucideX class="size-5" />
        </button>
        <Button
          variant="solid"
          :loading="saving"
          :disabled="!duration"
          @click="save"
        >
          {{ __("Save copy") }}
        </Button>
      </div>

      <div class="flex min-h-0 flex-1 items-center justify-center p-4">
        <video
          ref="video"
          :src="streamUrl(photo.name, photo.album)"
          :poster="thumbnailUrl(photo.name, photo.album, true)"
          class="max-h-full max-w-full"
          playsinline
          @loadedmetadata="loaded"
          @timeupdate="keepInside"
          @click="toggle"
        />
      </div>

      <div class="mx-auto w-full max-w-3xl px-4 pb-6">
        <div
          class="mb-3 flex items-center justify-between text-sm text-white/80"
        >
          <button
            class="trim-button"
            :aria-label="playing ? __('Pause') : __('Play')"
            @click="toggle"
          >
            <component
              :is="playing ? LucidePause : LucidePlay"
              class="size-5"
            />
          </button>
          <span>{{ clock(range.end - range.start) }}</span>
          <div class="flex items-center gap-1">
            <button
              class="trim-button"
              :aria-label="muted ? __('Keep sound') : __('Remove sound')"
              :class="{ 'bg-white/15': muted }"
              @click="muted = !muted"
            >
              <component
                :is="muted ? LucideVolumeX : LucideVolume2"
                class="size-5"
              />
            </button>
            <button
              class="trim-button"
              :aria-label="__('Save this frame as a photo')"
              :disabled="savingFrame"
              @click="saveFrame"
            >
              <LucideImageDown class="size-5" />
            </button>
          </div>
        </div>
        <div class="px-4">
          <div
            ref="track"
            class="relative h-14 touch-none select-none"
            @pointerdown="seekTo"
          >
            <div
              class="absolute inset-0 flex overflow-hidden rounded-md bg-white/10"
            >
              <img
                v-for="(frame, index) in frames"
                :key="index"
                :src="frame"
                class="h-full min-w-0 flex-1 object-cover"
                draggable="false"
                alt=""
              />
            </div>
            <div
              class="absolute inset-y-0 left-0 rounded-l-md bg-black/65"
              :style="{ width: `${percent(range.start)}%` }"
            />
            <div
              class="absolute inset-y-0 right-0 rounded-r-md bg-black/65"
              :style="{ width: `${100 - percent(range.end)}%` }"
            />
            <div
              class="absolute inset-y-0 border-y-2 border-white"
              :style="{
                left: `${percent(range.start)}%`,
                right: `${100 - percent(range.end)}%`,
              }"
            />
            <div
              class="pointer-events-none absolute -inset-y-1 w-0.5 rounded bg-white"
              :style="{ left: `${percent(current)}%` }"
            />
            <button
              v-for="edge in EDGES"
              :key="edge"
              class="absolute inset-y-0 flex w-5 cursor-ew-resize touch-none items-center justify-center bg-white text-black after:absolute after:-inset-x-3 after:inset-y-0"
              :class="
                edge === 'start'
                  ? 'rounded-l-md'
                  : '-translate-x-full rounded-r-md'
              "
              :style="{ left: `${percent(range[edge])}%` }"
              :aria-label="edge === 'start' ? __('Start') : __('End')"
              @pointerdown.stop.prevent="drag($event, edge)"
            >
              <component
                :is="edge === 'start' ? LucideChevronLeft : LucideChevronRight"
                class="size-4"
              />
            </button>
          </div>
          <div class="mt-2 flex justify-between text-xs text-white/60">
            <span>{{ clock(range.start) }}</span>
            <span>{{
              trimmed ? "" : __("Drag the white ends to cut the start or end")
            }}</span>
            <span>{{ clock(range.end) }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Button, toast } from "frappe-ui";
import LucideChevronLeft from "~icons/lucide/chevron-left";
import LucideChevronRight from "~icons/lucide/chevron-right";
import LucidePause from "~icons/lucide/pause";
import LucideImageDown from "~icons/lucide/image-down";
import LucidePlay from "~icons/lucide/play";
import LucideVolume2 from "~icons/lucide/volume-2";
import LucideVolumeX from "~icons/lucide/volume-x";
import LucideX from "~icons/lucide/x";

import { type Photo } from "../resources/photos";
import { exportFrame, trimVideo } from "../resources/edit";
import { streamUrl, thumbnailUrl } from "../resources/media";
import { notifyUploaded } from "../data/uploads";
import { useBackClose } from "../composables/useBackClose";
import { errorText } from "../resources/drive";
import { addToAlbum } from "../resources/albums";

const props = defineProps<{ photo: Photo | null; album?: string | null }>();
const emit = defineEmits<{ close: [] }>();

const EDGES = ["start", "end"] as const;
const MIN_LENGTH = 0.5;
const FRAME_COUNT = 8;

const video = ref<HTMLVideoElement>();
const savingFrame = ref(false);
const track = ref<HTMLElement>();
const duration = ref(0);
const current = ref(0);
const playing = ref(false);
const saving = ref(false);
const muted = ref(false);
const range = reactive({ start: 0, end: 0 });
const frames = ref<string[]>([]);
const trimmed = computed(
  () => range.start > 0.05 || range.end < duration.value - 0.05,
);
useBackClose(
  () => Boolean(props.photo),
  () => emit("close"),
);

watch(
  () => props.photo?.name,
  () => {
    duration.value = 0;
    current.value = 0;
    playing.value = false;
    frames.value = props.photo
      ? Array(FRAME_COUNT).fill(
          thumbnailUrl(props.photo.name, props.photo.album),
        )
      : [];
    if (props.photo) loadFrames(props.photo);
  },
  { immediate: true },
);

function once(element: HTMLVideoElement, name: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 10_000);
    element.addEventListener(name, () => (clearTimeout(timer), resolve()), {
      once: true,
    });
  });
}

async function loadFrames(photo: Photo) {
  const probe = document.createElement("video");
  probe.muted = true;
  probe.playsInline = true;
  probe.preload = "auto";
  probe.src = streamUrl(photo.name, photo.album);
  try {
    await once(probe, "loadeddata");
    const canvas = document.createElement("canvas");
    canvas.height = 96;
    canvas.width =
      Math.round((96 * probe.videoWidth) / (probe.videoHeight || 1)) || 96;
    const context = canvas.getContext("2d")!;
    for (let index = 0; index < FRAME_COUNT; index++) {
      if (props.photo?.name !== photo.name) return;
      probe.currentTime = ((index + 0.5) * probe.duration) / FRAME_COUNT;
      await once(probe, "seeked");
      context.drawImage(probe, 0, 0, canvas.width, canvas.height);
      frames.value[index] = canvas.toDataURL("image/jpeg", 0.7);
    }
  } catch {
  } finally {
    probe.removeAttribute("src");
    probe.load();
  }
}

const percent = (seconds: number) =>
  duration.value ? (seconds / duration.value) * 100 : 0;
const clock = (seconds: number) => {
  const whole = Math.max(0, seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${(whole - minutes * 60).toFixed(1).padStart(4, "0")}`;
};

function loaded() {
  duration.value = video.value?.duration || 0;
  range.start = 0;
  range.end = duration.value;
}

function keepInside() {
  const element = video.value;
  if (!element) return;
  current.value = element.currentTime;
  if (element.currentTime >= range.end) {
    element.currentTime = range.start;
    if (!element.paused) element.play();
  }
}

function toggle() {
  const element = video.value;
  if (!element) return;
  if (element.paused) {
    if (element.currentTime < range.start || element.currentTime >= range.end)
      element.currentTime = range.start;
    element.play();
    playing.value = true;
  } else {
    element.pause();
    playing.value = false;
  }
}

const timeAt = (event: PointerEvent) => {
  const box = track.value!.getBoundingClientRect();
  return (
    Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) *
    duration.value
  );
};

function seekTo(event: PointerEvent) {
  if (!video.value || !duration.value) return;
  video.value.currentTime = Math.min(
    range.end,
    Math.max(range.start, timeAt(event)),
  );
}

function drag(event: PointerEvent, edge: "start" | "end") {
  const move = (moved: PointerEvent) => {
    const time = timeAt(moved);
    if (edge === "start") range.start = Math.min(time, range.end - MIN_LENGTH);
    else range.end = Math.max(time, range.start + MIN_LENGTH);
    range.start = Math.max(0, range.start);
    range.end = Math.min(duration.value, range.end);
    if (video.value) video.value.currentTime = range[edge];
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
}

async function saveFrame() {
  if (!props.photo || !video.value || savingFrame.value) return;
  video.value.pause();
  playing.value = false;
  savingFrame.value = true;
  try {
    const frame = await exportFrame(props.photo.name, video.value.currentTime);
    if (props.album) await addToAlbum(props.album, [frame]);
    notifyUploaded();
    toast.success(__("Frame saved as a photo"));
  } catch (error) {
    toast.error(errorText(error) || __("Could not save this frame"));
  } finally {
    savingFrame.value = false;
  }
}

async function save() {
  if (!props.photo) return;
  saving.value = true;
  try {
    await trimVideo(
      props.photo.name,
      range.start,
      range.end,
      muted.value,
      props.album,
    );
    toast.success(
      __("Trimming. The new copy will appear in Photos when it is ready."),
    );
    emit("close");
  } catch (error) {
    toast.error(errorText(error) || __("Could not trim this video"));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.trim-button {
  @apply flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white;
}
</style>
