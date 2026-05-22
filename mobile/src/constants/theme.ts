/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#18201D',
    background: '#F7F8F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#DDF3EE',
    textSecondary: '#66736D',
    border: '#DDE4DB',
    primary: '#0F766E',
    primaryText: '#FFFFFF',
    accent: '#B95D22',
    accentSoft: '#F8E8D9',
    success: '#256E4A',
    danger: '#B42318',
  },
  dark: {
    text: '#F5F7F2',
    background: '#111412',
    backgroundElement: '#1D221F',
    backgroundSelected: '#143F3A',
    textSecondary: '#B6C0BA',
    border: '#313932',
    primary: '#5EEAD4',
    primaryText: '#0B1513',
    accent: '#FDBA74',
    accentSoft: '#352317',
    success: '#86EFAC',
    danger: '#FCA5A5',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
