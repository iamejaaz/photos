<template>
  <div ref="mapEl" class="isolate size-full overflow-hidden rounded-xl bg-surface-gray-2" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { type Place } from '../resources/photos'
import { thumbnailUrl } from '../resources/media'

const props = defineProps<{ places: Place[] }>()
const router = useRouter()
const mapEl = ref<HTMLElement>()
let map: L.Map | null = null
const TILE_SIZE = 256
const SCAN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>'
let layer: L.LayerGroup | null = null

const CLUSTER_PX = 48

function clusters() {
  const groups: { lead: Place; point: L.Point; members: Place[] }[] = []
  for (const place of [...props.places].sort((a, b) => b.count - a.count)) {
    const point = map!.latLngToLayerPoint([place.latitude, place.longitude])
    const group = groups.find((item) => item.point.distanceTo(point) < CLUSTER_PX)
    if (group) group.members.push(place)
    else groups.push({ lead: place, point, members: [place] })
  }
  return groups
}

function open(members: Place[]) {
  const bounds = L.latLngBounds(members.map((p) => [p.latitude, p.longitude] as [number, number]))
  const zoom = map!.getBoundsZoom(bounds, false, L.point(CLUSTER_PX * 2, CLUSTER_PX * 2))
  if (members.length > 1 && zoom > map!.getZoom())
    return map!.fitBounds(bounds, { padding: [CLUSTER_PX, CLUSTER_PX] })
  const place = members[0].place
  if (place) router.push({ name: 'photos-search', query: { place } })
}

function drawMarkers() {
  if (!map) return
  layer?.remove()
  layer = L.layerGroup().addTo(map)
  for (const { lead, members } of clusters()) {
    const count = members.reduce((sum, place) => sum + place.count, 0)
    const icon = L.divIcon({
      className: '',
      iconSize: [44, 44],
      html: `<div class="relative size-11 overflow-hidden rounded-lg border-2 border-white shadow-lg">
        <img src="${thumbnailUrl(lead.cover)}" class="size-full object-cover" alt="" />
        <span class="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] text-white">${count}</span>
      </div>`,
    })
    const title = members
      .map((place) => place.place)
      .filter(Boolean)
      .join(', ')
    L.marker([lead.latitude, lead.longitude], { icon, title })
      .on('click', () => open(members))
      .addTo(layer)
  }
}

function render() {
  if (!map) return
  showAll(false)
  drawMarkers()
}

function showAll(animate = true) {
  if (!map || !props.places.length) return
  map.fitBounds(L.latLngBounds(props.places.map((p) => [p.latitude, p.longitude] as [number, number])), {
    padding: mapEl.value && mapEl.value.clientWidth < 500 ? [16, 16] : [48, 48],
    maxZoom: 9,
    animate,
  })
}

function fitWorld() {
  if (!map || !mapEl.value) return
  const side = Math.max(mapEl.value.clientWidth, mapEl.value.clientHeight)
  map.setMinZoom(Math.max(1, Math.ceil(Math.log2(side / TILE_SIZE))))
}

const ShowAllControl = L.Control.extend({
  onAdd() {
    const bar = L.DomUtil.create('div', 'leaflet-bar')
    const button = L.DomUtil.create('a', '', bar)
    button.href = '#'
    button.role = 'button'
    button.title = __('Show all places')
    button.setAttribute('aria-label', __('Show all places'))
    button.style.display = 'flex'
    button.style.alignItems = 'center'
    button.style.justifyContent = 'center'
    button.innerHTML = SCAN_ICON
    L.DomEvent.on(button, 'click', (event) => {
      L.DomEvent.preventDefault(event)
      showAll()
    })
    L.DomEvent.disableClickPropagation(bar)
    return bar
  },
})

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
    noWrap: true,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  new ShowAllControl({ position: 'topleft' }).addTo(map)
  map.on('zoomend', drawMarkers)
  fitWorld()
  render()
  resizeObserver = new ResizeObserver(() => {
    map?.invalidateSize({ animate: false })
    fitWorld()
  })
  resizeObserver.observe(mapEl.value)
})
watch(() => props.places, render)
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  map?.stop()
  map?.off()
  map?.remove()
  map = null
})
</script>
