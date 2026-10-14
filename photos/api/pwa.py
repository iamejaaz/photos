import frappe
from werkzeug.wrappers import Response

SERVICE_WORKER = """
const STORE = 'photos-share'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/photos/share-target') return
  event.respondWith(
    (async () => {
      const form = await event.request.formData()
      const files = form.getAll('media').filter((file) => file instanceof File)
      const cache = await caches.open(STORE)
      await Promise.all(
        files.map((file, index) =>
          cache.put(
            `/photos/shared/${Date.now()}-${index}`,
            new Response(file, { headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) } }),
          ),
        ),
      )
      return Response.redirect('/photos/?shared=1', 303)
    })(),
  )
})
"""


@frappe.whitelist(allow_guest=True)
def service_worker():
    response = Response(SERVICE_WORKER, mimetype="application/javascript")
    response.headers.set("Service-Worker-Allowed", "/photos/")
    response.headers.set("Cache-Control", "no-cache")
    return response
