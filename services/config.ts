export const config = {
  api: {
    baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "",
    localMediaBaseUrl: process.env.EXPO_PUBLIC_LOCAL_MEDIA_BASE_URL || "",
  },
} as const;
