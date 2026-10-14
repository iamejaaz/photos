import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '',
    component: () => import('./pages/PhotosLayout.vue'),
    children: [
      {
        path: '',
        name: 'photos-home',
        component: () => import('./pages/Timeline.vue'),
      },
      {
        path: 'search',
        name: 'photos-search',
        component: () => import('./pages/Search.vue'),
      },
      {
        path: 'explore',
        name: 'photos-explore',
        component: () => import('./pages/Explore.vue'),
      },
      {
        path: 'sharing',
        name: 'photos-sharing',
        component: () => import('./pages/Albums.vue'),
        props: { shared: true },
      },
      {
        path: 'favourites',
        name: 'photos-favourites',
        component: () => import('./pages/Collection.vue'),
        props: { kind: 'favourites' },
      },
      {
        path: 'recent',
        name: 'photos-recent',
        component: () => import('./pages/Recent.vue'),
      },
      {
        path: 'archive',
        name: 'photos-archive',
        component: () => import('./pages/Collection.vue'),
        props: { kind: 'archive' },
      },
      {
        path: 'trash',
        name: 'photos-trash',
        component: () => import('./pages/Collection.vue'),
        props: { kind: 'trash' },
      },
      {
        path: 'library',
        name: 'photos-library',
        component: () => import('./pages/Library.vue'),
      },
      {
        path: 'folders',
        name: 'photos-folders',
        component: () => import('./pages/Folders.vue'),
      },
      {
        path: 'folders/:folder',
        name: 'photos-folder',
        component: () => import('./pages/FolderPage.vue'),
        props: true,
      },
      {
        path: 'people',
        name: 'photos-people',
        component: () => import('./pages/People.vue'),
      },
      {
        path: 'people/:person',
        name: 'photos-person',
        component: () => import('./pages/PersonPage.vue'),
        props: true,
      },
      {
        path: 'duplicates',
        name: 'photos-duplicates',
        component: () => import('./pages/Duplicates.vue'),
      },
      {
        path: 'albums',
        name: 'photos-albums',
        component: () => import('./pages/Albums.vue'),
      },
      {
        path: 'albums/:album',
        name: 'photos-album',
        component: () => import('./pages/Album.vue'),
        props: true,
        meta: { allowGuest: true },
      },
    ],
  },
]
