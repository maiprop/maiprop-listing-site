import 'react-native-url-polyfill/auto';

import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, Tabs, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProviders } from '@/providers/app-providers';

type IconName = keyof typeof Ionicons.glyphMap;

const tabIcons: Record<string, IconName> = {
  index: 'home-outline',
  listings: 'search-outline',
  auctions: 'hammer-outline',
  'open-houses': 'calendar-outline',
  professionals: 'people-outline',
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tabBarBackground = isDark ? '#1D221F' : '#FFFFFF';
  const tabBarBorder = isDark ? '#313932' : '#DDE4DB';
  const activeTint = isDark ? '#5EEAD4' : '#0F766E';
  const inactiveTint = isDark ? '#B6C0BA' : '#66736D';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
          <AppProviders>
            <Tabs
              screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: activeTint,
                tabBarInactiveTintColor: inactiveTint,
                tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
                tabBarStyle: {
                  backgroundColor: tabBarBackground,
                  borderTopColor: tabBarBorder,
                  height: 68,
                  paddingBottom: 10,
                  paddingTop: 8,
                },
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name={tabIcons[route.name] ?? 'ellipse-outline'} size={size} color={color} />
                ),
              })}>
              <Tabs.Screen name="index" options={{ title: 'Home' }} />
              <Tabs.Screen name="listings" options={{ title: 'Listings' }} />
              <Tabs.Screen name="auctions" options={{ title: 'Auctions' }} />
              <Tabs.Screen name="open-houses" options={{ title: 'Open Houses' }} />
              <Tabs.Screen name="professionals" options={{ title: 'Pros' }} />
              <Tabs.Screen name="search" options={{ href: null }} />
              <Tabs.Screen name="workspace" options={{ href: null }} />
              <Tabs.Screen name="inbox" options={{ href: null }} />
              <Tabs.Screen name="account" options={{ href: null }} />
              <Tabs.Screen name="listing/[id]" options={{ href: null }} />
            </Tabs>
          </AppProviders>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
