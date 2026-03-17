# RECORDROOM

## Tech Stack

### Frontend

- `Expo` / `React Native`
- `TypeScript`
- `react-native-reanimated`
- `react-native-gesture-handler`
- `expo-image`

The frontend is the app running on the device through Expo. It is responsible for:

- rendering the overview grid and single-stack screens
- caching the selected track payload on device
- caching artwork files on device
- calling the backend API for prepared track metadata

Main frontend files:

- [App.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/App.tsx)
- [services/ScreenFlowControl.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/services/ScreenFlowControl.tsx)
- [screens/TracksOverviewScreen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/screens/TracksOverviewScreen.tsx)
- [screens/SingleAlbumStackScreen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/screens/SingleAlbumStackScreen.tsx)
- [components/TrackStackPreviewOnOverviewScreen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/components/TrackStackPreviewOnOverviewScreen.tsx)
- [data/trackStacks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/data/trackStacks.ts)

### Backend

- `Vercel Functions`
- `Redis` for prepared track metadata
- `Vercel Blob` for artwork files

The backend is only the data/API layer. It is responsible for:

- serving the prepared daily track payload
- storing and reading metadata from Redis
- serving artwork files from Blob URLs
- optionally running refresh/admin routes

Main backend files:

- [api/musicbrainz/random-tracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/random-tracks.ts)
- [api/musicbrainz/refresh-daily.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/refresh-daily.ts)
- [services/dailyTracksStore.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/dailyTracksStore.ts)

### Offline / Publishing Pipeline

- local Node scripts
- MusicBrainz search
- local JSON + local artwork download
- publish step to Redis + Blob

This pipeline is not part of normal app use. It is for preparing the feed ahead of time.

Main pipeline files:

- [scripts/generate-musicbrainz-track-pool.mjs](/c:/Users/jsy30/Desktop/RECORDROOM/scripts/generate-musicbrainz-track-pool.mjs)
- [scripts/publish-track-pool-to-vercel.mjs](/c:/Users/jsy30/Desktop/RECORDROOM/scripts/publish-track-pool-to-vercel.mjs)
- [scripts/publish-track-metadata-from-blob.mjs](/c:/Users/jsy30/Desktop/RECORDROOM/scripts/publish-track-metadata-from-blob.mjs)

## Architecture Flow

1. A local script generates a validated yearly pool of tracks and artwork.
2. A publish script uploads artwork files to Blob and metadata to Redis.
3. The Expo app calls the Vercel backend for a prepared track payload.
4. The backend returns Redis metadata that already points at Blob artwork URLs.
5. The app caches that payload and artwork locally, then builds overview/detail stacks from it.

## Current Feed Setup

The active app flow now expects a Vercel-backed MusicBrainz track feed that is prepared ahead of time and stored in Redis.

Main files:

- [services/musicBrainzRandomTracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzRandomTracks.ts)
- [services/musicBrainzTrackFetchService.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzTrackFetchService.ts)
- [services/deviceTrackCache.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/deviceTrackCache.ts)
- [services/dailyTracksStore.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/dailyTracksStore.ts)
- [services/ScreenFlowControl.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/services/ScreenFlowControl.tsx)
- [data/trackStacks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/data/trackStacks.ts)
- [screens/TracksOverviewScreen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/screens/TracksOverviewScreen.tsx)
- [screens/SingleAlbumStackScreen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/screens/SingleAlbumStackScreen.tsx)
- [api/musicbrainz/random-tracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/random-tracks.ts)
- [api/musicbrainz/refresh-daily.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/refresh-daily.ts)

## Environment

Vercel should provide the backend feed. Set these in your project and local env:

Set in [`.env.local`](/c:/Users/jsy30/Desktop/RECORDROOM/.env.local):

```env
EXPO_PUBLIC_API_BASE_URL=https://your-project.vercel.app
CRON_SECRET=your_cron_secret
KV_REST_API_URL=https://your-upstash-endpoint
KV_REST_API_TOKEN=your-upstash-token
BLOB_READ_WRITE_TOKEN=your_blob_token
```

Behavior:

- the app fetches tracks from `/api/musicbrainz/random-tracks`
- Vercel cron hits `/api/musicbrainz/refresh-daily`
- the prepared daily payload is stored in Redis
- artwork files live in Vercel Blob

## Caching Logic

All track payload and artwork caching lives in:

- [services/deviceTrackCache.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/deviceTrackCache.ts)
- [services/musicBrainzTrackFetchService.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzTrackFetchService.ts)
- [services/ScreenFlowControl.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/services/ScreenFlowControl.tsx)
- [services/dailyTracksStore.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/dailyTracksStore.ts)

### What Is Cached

- the last accepted track payload is stored as `daily-tracks.json`
- artwork files are stored under the track artwork cache directory
- cached artwork paths are only used if the local file actually exists

### Boot Behavior

On app boot:

1. [services/ScreenFlowControl.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/services/ScreenFlowControl.tsx) tries `loadCachedRandomTracks()`
2. if cached tracks exist, that cached track set is warmed and committed as the active session feed
3. if no cached tracks exist, the app runs `fetchRandomTracks()`
4. `fetchRandomTracks()` calls the Vercel `random-tracks` route
5. that route reads the prepared payload from KV, or bootstraps it once if missing

Important:

- the app now commits one feed source for the session instead of visibly swapping from one stack list to another after a second request
- normal navigation does not trigger a new feed request

### When A Fresh Request Happens

A fresh request happens when `fetchRandomTracks()` is called.

Right now that can happen through:

- first boot with no usable cached payload
- the debug `Fresh Request` button under the overview hamburger menu
- Vercel cron hitting `/api/musicbrainz/refresh-daily`

### What Happens When `fetchRandomTracks()` Runs

In [services/musicBrainzTrackFetchService.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzTrackFetchService.ts):

- `clearTrackCache()` runs immediately at the start of `fetchRandomTracks()`
- that wipes the cached payload and cached artwork directory
- then a fresh track feed is fetched
- then tracks are filtered again for usable artwork URLs
- then the resulting track set is cached again

So a fresh request means:

- old payload gone
- old artwork files gone
- new feed fetched from the deployed backend
- new artwork cache repopulated

### Artwork Validation And Cache Safety

Tracks are rejected if artwork is not usable.

Current protections:

- [services/musicBrainzTrackFetchService.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzTrackFetchService.ts) keeps only tracks with non-empty artwork URLs
- [services/deviceTrackCache.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/deviceTrackCache.ts) only rewrites artwork URLs to local cached files if those files exist
- [screens/SingleAlbumStackScreen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/screens/SingleAlbumStackScreen.tsx) filters out blank-media projects before rendering

### Session Stability

To avoid visible reloading while the user is using the app:

- the active stack list is chosen once at boot or on manual refresh
- the overview is hidden until that feed has been warmed
- the single-stack page preloads the tapped stack assets before opening
- backing out of a stack restores the previous overview scroll position

## Feed Rules

The current MusicBrainz feed logic aims to return random 2026 tracks with usable artwork.

Current behavior in [services/musicBrainzRandomTracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzRandomTracks.ts):

- searches recordings from the current system year
- includes albums, singles, and EPs
- keeps official releases
- currently has dedupe logic commented out for debugging

## Vercel Flow

The deployed flow now works like this:

1. cron calls [api/musicbrainz/refresh-daily.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/refresh-daily.ts)
2. that route fetches a fresh 128-track MusicBrainz payload
3. the payload is stored in KV by [services/dailyTracksStore.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/dailyTracksStore.ts)
4. app clients call [api/musicbrainz/random-tracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/random-tracks.ts)
5. that route serves the stored payload instead of rebuilding the feed every time

The `random-tracks` route also has a bootstrap path:

- if KV is empty, it acquires a lock
- generates the first payload once
- stores it
- serves it

This prevents every app open from doing a fresh live MusicBrainz discovery run.

## Local Pool Generation

There is now a local generator script that can build a large validated yearly track pool and download artwork files:

- [scripts/generate-musicbrainz-track-pool.mjs](/c:/Users/jsy30/Desktop/RECORDROOM/scripts/generate-musicbrainz-track-pool.mjs)

Run it with:

```bash
npm run generate:track-pool
```

What it does:

- fetches current-year MusicBrainz recordings in pages
- keeps only releases from the current system year
- rejects duplicates by release, artwork, track signature, and album signature
- caps artists to 2 tracks
- downloads cover art files locally and only keeps entries whose artwork download succeeds
- writes metadata JSON to `generated/musicbrainz-track-pool-YYYY.json`
- writes artwork files to `generated/track-artwork/`

The generator targets `3840` valid entries by default.

## Publish To Vercel

After generating the local pool, you can publish it to Vercel Blob and Redis with:

```bash
npm run publish:track-pool
```

This uses:

- `BLOB_READ_WRITE_TOKEN` for Vercel Blob artwork uploads
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

What it does:

- reads `generated/musicbrainz-track-pool-YYYY.json`
- uploads each artwork file from `generated/track-artwork/` to Vercel Blob
- rewrites each track's `artwork_url` to the Blob URL
- stores the published track payload in Redis under the live daily tracks key

Recommended flow:

1. `npm run generate:track-pool`
2. `npm run publish:track-pool`
3. redeploy or hit your existing `random-tracks` route

With that flow, the app can stay fast because it reads prepared metadata from Redis and image files from Blob instead of rebuilding live from MusicBrainz.

## Stack Construction

Track stacks are built in:

- [data/trackStacks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/data/trackStacks.ts)

Current behavior:

- only tracks with non-empty artwork URLs are used
- stacks can have fewer than 4 entries if the accepted pool is smaller or filtered down
- shorter stacks are not padded with fake placeholder entries in the active track flow

## Debugging Notes

Useful current debug behaviors:

- `Fresh Request` under the overview hamburger forces a full fresh request
- that request clears all cached payload and artwork first
- local device cache is separate from the Vercel KV cache
- if you want fresh deployed data, hit the refresh route or redeploy after backend changes

If you are testing fresh feed generation repeatedly, the main files to inspect are:

- [services/musicBrainzTrackFetchService.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzTrackFetchService.ts)
- [services/deviceTrackCache.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/deviceTrackCache.ts)
- [services/ScreenFlowControl.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/services/ScreenFlowControl.tsx)
