# RECORDROOM

## Vercel Setup

This project uses Vercel as a lightweight backend for album data fetching, daily refresh, and caching.

### Purpose

- The Expo app does **not** call MusicBrainz directly for the 128-album overview.
- It calls a Vercel serverless route instead.
- A daily refresh route generates the shared 128-album payload.
- User-facing requests read the stored payload instead of regenerating it.

## Environment

### Expo local env

Set in [.env.local](/c:/Users/jsy30/Desktop/RECORDROOM/.env.local):

```env
EXPO_PUBLIC_API_BASE_URL=https://your-vercel-project-url.vercel.app
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
```

Notes:
- `EXPO_PUBLIC_API_BASE_URL` is required for the app to reach the Vercel backend.
- `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` is kept for future Spotify playback/auth work.

### Vercel env

Current MusicBrainz album fetching does not require private MusicBrainz secrets.

For persistent daily storage, configure Redis REST env vars in Vercel:

- `KV_REST_API_URL` and `KV_REST_API_TOKEN`
  or
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

Optional for secured cron execution:

- `CRON_SECRET`

If Spotify playback/auth is used later, related env vars can live in Vercel or app config depending on the auth flow.

## Vercel Route

User-facing serverless route:

- [api/musicbrainz/random-albums.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/random-albums.ts)

Route URL:

```txt
/api/musicbrainz/random-albums
```

What it returns:

- `countries`
- `countrySections`
- `allAlbums`
- `generatedAt`

Daily refresh route:

- [api/musicbrainz/refresh-daily.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/refresh-daily.ts)

Cron config:

- [vercel.json](/c:/Users/jsy30/Desktop/RECORDROOM/vercel.json)

## Backend Services

### App-facing fetch service

- [services/musicBrainzFetchService.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzFetchService.ts)

Used by the Expo app to call the Vercel route.

### Server-side MusicBrainz fetch logic

- [services/musicBrainzRandomAlbums.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzRandomAlbums.ts)

Used only by the Vercel route.

Responsibilities:
- choose 8 random countries
- fetch up to 16 albums per country from the current year
- shape MusicBrainz results into the app `Album` format
- provide cover-art URLs via Cover Art Archive

## Caching

Caching/storage is now split like this:

- persistent daily payload in Redis via [services/dailyAlbumsStore.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/dailyAlbumsStore.ts)
- daily generation through [api/musicbrainz/refresh-daily.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/refresh-daily.ts)
- read-only user-facing fetch through [api/musicbrainz/random-albums.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/random-albums.ts)
- global refresh lock in Redis so only one refresh runs at a time
- CDN cache headers on the user-facing response

Response header for debugging:

- `X-Recordroom-Cache`
  Values: `HIT`, `MISS`

## Data Flow

1. Expo app starts
2. Vercel cron calls [api/musicbrainz/refresh-daily.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/refresh-daily.ts) once per day
3. That route generates the new shared 128-album payload and stores it in Redis
4. [services/ScreenFlowControl.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/services/ScreenFlowControl.tsx) calls the app-facing MusicBrainz fetch service
5. The user-facing route returns stored payload from Redis
6. [data/albumStacks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/data/albumStacks.ts) converts albums into the stack UI model
7. [screens/AlbumsOverviewScreen.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/screens/AlbumsOverviewScreen.tsx) renders the 128 overview with country labels above each partition

## Important Routes and Files

- [api/musicbrainz/random-albums.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/random-albums.ts)
- [api/musicbrainz/refresh-daily.ts](/c:/Users/jsy30/Desktop/RECORDROOM/api/musicbrainz/refresh-daily.ts)
- [services/dailyAlbumsStore.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/dailyAlbumsStore.ts)
- [services/musicBrainzFetchService.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzFetchService.ts)
- [services/musicBrainzRandomAlbums.ts](/c:/Users/jsy30/Desktop/RECORDROOM/services/musicBrainzRandomAlbums.ts)
- [services/ScreenFlowControl.tsx](/c:/Users/jsy30/Desktop/RECORDROOM/services/ScreenFlowControl.tsx)
- [data/musicBrainzCountries.ts](/c:/Users/jsy30/Desktop/RECORDROOM/data/musicBrainzCountries.ts)
- [data/albumsData.ts](/c:/Users/jsy30/Desktop/RECORDROOM/data/albumsData.ts)
- [data/albumStacks.ts](/c:/Users/jsy30/Desktop/RECORDROOM/data/albumStacks.ts)
