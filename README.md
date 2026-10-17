<div align="center" markdown="1">

<img src="frontend/public/logo.svg" alt="Photos logo" width="80" height="80" />
<h1>Photos</h1>

**Open source photo and video library for Frappe**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](license.txt)

</div>

## Photos

Photos keeps every photo and video you own in one private library on your own server. It runs on top of [Frappe Suite](https://github.com/frappe/suite), so your media lives in Drive and albums are shared with Drive permissions.

### Key Features

- Timeline, favourites, archive, trash, folders and duplicates for everything you upload
- Memories from the same day in past years
- Albums with sharing, comments and likes
- People, places and things, found on your own server with OpenCV
- Collages, slideshow movies and a photo editor
- Android app that backs up your phone's gallery in the background

### Under the Hood

- [**Frappe Framework**](https://github.com/frappe/frappe): the full-stack web framework the app is built on.
- [**Frappe Suite**](https://github.com/frappe/suite): Drive stores the files and handles sharing.
- [**Frappe UI**](https://github.com/frappe/frappe-ui): the Vue component library for the interface.
- [**Capacitor**](https://capacitorjs.com): wraps the same frontend as the Android app.

## Installation

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

## Android App

The app in `mobile/` bundles the same frontend with Capacitor. It signs in with OAuth, backs up the phone's gallery in the background, and accepts photos shared from other apps.

```bash
yarn install
yarn native:sync
cd mobile/android && ./gradlew assembleDebug
```

The APK is at `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. To use a plain `http://` bench while developing, add `mobile/capacitor.config.local.json` with `{"android": {"allowMixedContent": true}}` and sync again.

## License

[AGPL-3.0](license.txt)
