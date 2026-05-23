import type { CapacitorConfig } from '@capacitor/cli';

const bundledWeb = process.env.CAPACITOR_BUNDLED_WEB === 'true';
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || 'https://maiprop.co';

const config: CapacitorConfig = {
  appId: 'co.maiprop.mobile',
  appName: 'MaiProp',
  webDir: bundledWeb ? 'dist' : 'capacitor-fallback',
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
