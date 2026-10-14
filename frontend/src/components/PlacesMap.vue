<template>
  <div ref="mapEl" class="isolate size-full overflow-hidden rounded-xl bg-surface-gray-2" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { type Place, thumbnailUrl } from '../api'

const props = defineProps<{ places: Place[] }>()
const router = useRouter()
const mapEl = ref<HTMLElement>()
let map: L.Map | null = null
let layer: L.LayerGroup | null = null

function render() {
  if (!map) return
  layer?.remove()
  layer = L.layerGroup().addTo(map)
  for (const place of props.places) {
    const icon = L.divIcon({
      className: '',
      iconSize: [44, 44],
      html: `<div class="relative size-11 overflow-hidden rounded-lg border-2 border-white shadow-lg">
        <img src="${thumbnailUrl(place.cover)}" class="size-full object-cover" alt="" />
        <span class="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] text-white">${place.count}</span>
      </div>`,
    })
    L.marker([place.latitude, place.longitude], { icon, title: place.place ?? '' })
      .on('click', () => place.place && router.push({ name: 'photos-search', query: { place: place.place } }))
      .addTo(layer)
  }
  if (props.places.length) {
    map.fitBounds(L.latLngBounds(props.places.map((p) => [p.latitude, p.longitude] as [number, number])), {
      padding: mapEl.value && mapEl.value.clientWidth < 500 ? [16, 16] : [48, 48],
      maxZoom: 9,
    })
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, {
    zoomControl: true,
    attributionControl: true,
    minZoom: 1,
    maxBounds: [
      [-85, -180],
      [85, 180],
    ],
    maxBoundsViscosity: 1,
  }).setView([20, 78], 4)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  render()
  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(mapEl.value)
})
watch(() => props.places, render)
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  map?.remove()
})
</script>
