import type { CapacitorConfig } from '@capacitor/cli';

const bundledWeb = process.env.CAPACITOR_BUNDLED_WEB === 'true';
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || 'https://portal.maiprop.co';
const appId = process.env.CAPACITOR_APP_ID?.trim() || 'co.maiprop.portal.mobile';
const appName = process.env.CAPACITOR_APP_NAME?.trim() || 'MaiProp Portal';

const config: CapacitorConfig = {
  appId,
  appName,
  webDir: bundledWeb ? 'dist' : 'capacitor-fallback',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  ...(bundledWeb
    ? {}
    : {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
        },
      }),
};

export default config;
