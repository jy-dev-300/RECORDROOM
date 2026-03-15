type SpotifyAuthCallback = {
  code: string | null;
  accessToken: string | null;
  error: string | null;
  state: string | null;
  rawUrl: string;
};

type SpotifyAuthListener = (callback: SpotifyAuthCallback) => void;

const SPOTIFY_CALLBACK_PATH = "spotify-login-callback";
const SPOTIFY_APP_SCHEME = "recordroom";
const spotifyRedirectUri = `${SPOTIFY_APP_SCHEME}://${SPOTIFY_CALLBACK_PATH}`;
const listeners = new Set<SpotifyAuthListener>();
let lastSpotifyAuthCallback: SpotifyAuthCallback | null = null;

function parseUrlParams(input: string) {
  const params = new URLSearchParams(input);
  return {
    code: params.get("code"),
    accessToken: params.get("access_token"),
    error: params.get("error"),
    state: params.get("state"),
  };
}

export function getSpotifyRedirectUri() {
  return spotifyRedirectUri;
}

export function isSpotifyAuthCallbackUrl(url: string) {
  return url.startsWith(spotifyRedirectUri);
}

export function parseSpotifyAuthCallback(url: string): SpotifyAuthCallback {
  const [, queryString = ""] = url.split("?");
  const [querySection, fragmentSection = ""] = queryString.split("#");
  const queryParams = parseUrlParams(querySection);
  const fragmentParams = parseUrlParams(fragmentSection);

  return {
    code: queryParams.code,
    accessToken: fragmentParams.accessToken ?? queryParams.accessToken,
    error: queryParams.error ?? fragmentParams.error,
    state: queryParams.state ?? fragmentParams.state,
    rawUrl: url,
  };
}

export function handleSpotifyAuthRedirect(url: string) {
  if (!isSpotifyAuthCallbackUrl(url)) {
    return false;
  }

  const callback = parseSpotifyAuthCallback(url);
  lastSpotifyAuthCallback = callback;
  listeners.forEach((listener) => listener(callback));
  return true;
}

export function subscribeToSpotifyAuthRedirect(listener: SpotifyAuthListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLastSpotifyAuthCallback() {
  return lastSpotifyAuthCallback;
}
