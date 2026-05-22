# MaiProp Mobile

Expo React Native app for the all-in-one MaiProp mobile experience: marketplace, search/map-ready discovery, role workspace, inbox, and account/auth.

## Run

```bash
npm install
npm start
```

## Android

The Android project is generated from Expo config and uses the package id `co.maiprop.mobile`.

```bash
npm run prebuild:android   # regenerate native Android files from Expo config
npm run android            # run on a connected Android device/emulator
npm run android:apk        # EAS internal APK build
npm run android:aab        # EAS Play Store app bundle build
```

Local `npm run android` requires Android Studio, a JDK, and `adb` on PATH. The EAS build profiles are in `mobile/eas.json`.

### Download APK from GitHub

The `Mobile Android APK` GitHub Actions workflow builds `maiprop-android-apk` on every push to `codex/mobile-android-app`.

1. Open the branch in GitHub.
2. Go to **Actions** -> **Mobile Android APK**.
3. Open the latest successful run.
4. Download the `maiprop-android-apk` artifact.

For live MaiProp data, create `mobile/.env` from `mobile/.env.example` and set:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
EXPO_PUBLIC_MAIPROP_AGENT_URL=http://localhost:8787 # optional AI agent backend
```

Without Supabase values, the app runs with built-in demo data so the mobile UX stays testable.
Without `EXPO_PUBLIC_MAIPROP_AGENT_URL`, the MaiProp Advisor uses local demo guidance instead of the Cloudflare/OpenAI agent backend.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
