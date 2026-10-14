### Photos

Google Photos style library for Frappe. It runs on top of [Frappe Suite](https://github.com/frappe/suite): photos and videos live in Drive, albums are shared with Drive permissions, and the UI is built with frappe-ui.

- Timeline, favourites, archive, trash, folders and duplicates for everything you upload to Drive
- Albums with sharing, comments and likes
- People, places and things, found on your own server with OpenCV
- Collages, slideshow movies and a photo editor

### Installation

Photos needs Suite on the same bench.

```bash
bench get-app https://github.com/frappe/suite
bench get-app https://github.com/iamejaaz/photos
bench --site your.site install-app photos
```

Load demo photos, people and shared albums:

```bash
bench --site your.site photos-demo-data
```

### License

agpl-3.0
