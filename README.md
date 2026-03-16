# RECORDROOM

## Vercel Setup

This project now uses Vercel as a lightweight backend for SoundCloud track discovery and daily refreshes.

### Purpose

- The Expo app does not call SoundCloud discovery endpoints directly.
- It calls a Vercel serverless route that returns a curated discovery feed.
- The backend fetches a large candidate pool of public SoundCloud tracks.
- It filters obvious junk, scores survivors, preserves randomness, and returns up to 128 tracks.
- The overview UI renders 32 stacks with 4 tracks each in the same partitioned layout.

## Environment

### Expo local env

Set in [`.env.local`](/c:/Users/jsy30/Desktop/RECORDROOM/.env.local):

```env
EXPO_PUBLIC_API_BASE_URL=https://your-vercel-project-url.vercel.app
EXPO_PUBLIC_SOUNDCLOUD_CLIENT_ID=your_soundcloud_client_id
```

Notes:
- `EXPO_PUBLIC_API_BASE_URL` is required for the app to reach the Vercel backend.
- `EXPO_PUBLIC_SOUNDCLOUD_CLIENT_ID` can be used locally, but the backend should also have a server-side SoundCloud client ID configured.

### Vercel env

Configure these in Vercel:

- `SOUNDCLOUD_CLIENT_ID`
- `CRON_SECRET` for protected cron execution, if desired

The active backend no longer depends on Spotify, MusicBrainz, or Redis for the discovery feed.

## Vercel Routes

User-facing serverless route:

- [api/soundcloud/random-tracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/soundcloud/random-tracks.ts)

Route URL:

```txt
/api/soundcloud/random-tracks
```

What it returns:

- `tracks`
- `generatedAt`

Daily refresh route:

- [api/soundcloud/refresh-daily.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/soundcloud/refresh-daily.ts)

Cron config:

- [vercel.json](/c:/Users/jsy30/Desktop/RECORDROOM/vercel.json)

## Backend Services

### App-facing fetch service

- [services/soundCloudFetchService.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/soundCloudFetchService.ts)

Used by the Expo app to call the Vercel route and cache track artwork on-device.

### Server-side SoundCloud discovery logic

- [services/soundCloudRandomTracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/soundCloudRandomTracks.ts)

Responsibilities:

- fetch 400 to 800 public SoundCloud candidates per batch
- reject non-streamable, artless, too-short, too-long, and obviously low-signal tracks
- reject common spam patterns from title and tags
- score tracks using likes, plays, comments, reposts, followers, metadata richness, and duration
- keep only tracks with score `>= 8`
- shuffle survivors before applying a max of 2 tracks per creator
- return up to 128 `FeedTrack` items

## Device Caching

Track payloads and artwork are cached on-device through:

- [services/deviceTrackCache.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/deviceTrackCache.ts)

This cache:

- stores the last fetched feed payload locally
- prefetches artwork for the first part of the feed
- rewrites cached artwork paths when available

## Data Flow

1. Expo app starts.
2. [services/ScreenFlowControl.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/services/ScreenFlowControl.tsx) loads cached tracks if available.
3. The app requests [api/soundcloud/random-tracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/soundcloud/random-tracks.ts).
4. [services/soundCloudRandomTracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/soundCloudRandomTracks.ts) builds the filtered random feed.
5. [data/trackStacks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/data/trackStacks.ts) converts the 128-track feed into 32 stacks of 4 tracks.
6. [screens/TracksOverviewScreen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/screens/TracksOverviewScreen.tsx) renders the partitioned overview.

## Important Files

- [api/soundcloud/random-tracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/soundcloud/random-tracks.ts)
- [api/soundcloud/refresh-daily.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/soundcloud/refresh-daily.ts)
- [services/soundCloudFetchService.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/soundCloudFetchService.ts)
- [services/soundCloudRandomTracks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/soundCloudRandomTracks.ts)
- [services/deviceTrackCache.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/deviceTrackCache.ts)
- [services/ScreenFlowControl.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/services/ScreenFlowControl.tsx)
- [data/trackStacks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/data/trackStacks.ts)
- [screens/TracksOverviewScreen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/screens/TracksOverviewScreen.tsx)
- [screens/Partition16Screen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/screens/Partition16Screen.tsx)
