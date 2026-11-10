/**
 * App Entry Point
 * ---------------
 * Redirects to onboarding if not yet completed, or straight to the main tabs.
 * This runs after the store is hydrated from AsyncStorage in _layout.tsx.
 */

import { Redirect } from 'expo-router';
import { useStore } from '@/store';

export default function Index() {
  const hasCompletedOnboarding = useStore(s => s.profile.hasCompletedOnboarding);
  return hasCompletedOnboarding
    ? <Redirect href="/(tabs)/home" />
    : <Redirect href="/onboarding" />;
}
