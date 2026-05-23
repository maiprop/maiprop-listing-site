# MaiProp Android WebView Wrapper

This wrapper packages the existing MaiProp web app in a Capacitor Android shell.

By default, the Android app opens `https://portal.maiprop.co`, so the app uses the same production wiring as the web app: Supabase, public functions, listings, auctions, open houses, professionals, auth, and payments stay centralized in the web codebase.

The installable test APK uses Android package ID `co.maiprop.portal.mobile` and app label `MaiProp Portal` so it does not collide with earlier `co.maiprop.mobile` debug builds.

## Commands

```bash
npm run cap:sync:android
npm run android:web:apk
```

The default APK is debug-signed and installable for internal testing. GitHub Actions uploads it as `maiprop-webview-android-apk`.

## Build Modes

Remote web app, default:

```bash
CAPACITOR_SERVER_URL=https://portal.maiprop.co npm run android:web:apk
```

Bundled static web build:

```bash
npm run android:web:apk:bundled
```

Bundled mode runs `npm run build`, copies `dist` into Android, and uses the Vite env values available at build time.
