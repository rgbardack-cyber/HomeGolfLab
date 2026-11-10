/**
 * Root Layout (_layout.tsx)
 * --------------------------
 * Expo Router entry point. Sets up:
 *   - Safe area provider
 *   - Gesture handler
 *   - Global store hydration
 *   - Onboarding redirect logic
 *   - Dark status bar
 */

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useStore } from '@/store';
import { Colors } from '@/theme';

// Keep splash visible while loading persisted state
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { loadFromStorage, profile } = useStore();

  useEffect(() => {
    const init = async () => {
      await loadFromStorage();
      await SplashScreen.hideAsync();
    };
    init();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          {/* Onboarding — shown if not completed */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          {/* Main tabbed app */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* Modal-style results screen */}
          <Stack.Screen
            name="swing/results"
            options={{
              headerShown: false,
              presentation: 'card',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
