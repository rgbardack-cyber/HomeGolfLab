/**
 * Tab Navigator
 * -------------
 * 5-tab layout matching the SwingIQ prototype:
 *   Home · Swing · Track · Stats · Compete
 */

import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '@/theme';

interface TabIconProps {
  emoji:   string;
  label:   string;
  focused: boolean;
}

function TabIcon({ emoji, label, focused }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 0.5,
          height: 70,
          paddingBottom: 10,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="Home"    focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="swing"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎥" label="Swing"   focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎯" label="Track"   focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📈" label="Stats"   focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="challenge"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏆" label="Compete" focused={focused} />,
        }}
      />
      <Tabs.Screen name="space" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem:       { alignItems: 'center', gap: 3 },
  tabEmoji:      { fontSize: 20 },
  tabLabel:      { fontSize: 9, color: Colors.textMuted, fontWeight: Typography.medium },
  tabLabelActive:{ color: Colors.green, fontWeight: Typography.semibold },
});
