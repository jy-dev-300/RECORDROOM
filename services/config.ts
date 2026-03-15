function optionalEnv(name: string, fallback: string) {
  return process.env[name] || fallback;
}

export const config = {
  spotify: {
    clientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || "",
    market: optionalEnv("EXPO_PUBLIC_SPOTIFY_MARKET", "US"),
  },
  api: {
    baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "",
  },
} as const;
