import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="contacts">
        <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
        <Label>Network</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="companies">
        <Icon sf={{ default: 'safari', selected: 'safari.fill' }} />
        <Label>Companies</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="applications">
        <Icon sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }} />
        <Label>Applications</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isDark = colors.isDark;
  const isIOS = Platform.OS === 'ios';
  const { applications, contacts } = useApp();
  const activeApps = applications.filter(a => a.status === 'Applied' || a.status === 'Interviewing').length;
  const followUps = contacts.filter(c => c.needsFollowUp).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: isDark ? 0.35 : 0.12,
          shadowRadius: 12,
          height: Platform.OS === 'web' ? 72 : 62,
          paddingBottom: Platform.OS === 'web' ? 8 : 8,
          paddingTop: 6,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: 'Inter_600SemiBold',
          fontSize: 10,
          letterSpacing: 0.2,
        },
        tabBarIconStyle: { marginTop: 2 },
      }}
    >
      {/* ── Tab 1: Home ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home dashboard',
          tabBarIcon: ({ color, size }) =>
            isIOS
              ? <SymbolView name="house.fill" tintColor={color} size={size} />
              : <Feather name="home" size={size} color={color} />,
        }}
      />

      {/* ── Tab 2: Network (events + contacts) ── */}
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Network',
          tabBarAccessibilityLabel: 'Networking events and contacts',
          tabBarBadge: followUps > 0 ? followUps : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 9, minWidth: 15, height: 15 },
          tabBarIcon: ({ color, size }) =>
            isIOS
              ? <SymbolView name="person.2.fill" tintColor={color} size={size} />
              : <Feather name="radio" size={size} color={color} />,
        }}
      />

      {/* ── Tab 3: Companies ── */}
      <Tabs.Screen
        name="companies"
        options={{
          title: 'Companies',
          tabBarAccessibilityLabel: 'Find work placement companies',
          tabBarIcon: ({ color, size }) =>
            isIOS
              ? <SymbolView name="safari.fill" tintColor={color} size={size} />
              : <Feather name="compass" size={size} color={color} />,
        }}
      />

      {/* ── Tab 4: Applications ── */}
      <Tabs.Screen
        name="applications"
        options={{
          title: 'Applications',
          tabBarAccessibilityLabel: 'My applications and career tracker',
          tabBarBadge: activeApps > 0 ? activeApps : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 9, minWidth: 15, height: 15 },
          tabBarIcon: ({ color, size }) =>
            isIOS
              ? <SymbolView name="list.bullet.rectangle.fill" tintColor={color} size={size} />
              : <Feather name="briefcase" size={size} color={color} />,
        }}
      />

      {/* ── Tab 5: Profile ── */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'My profile and documents',
          tabBarIcon: ({ color, size }) =>
            isIOS
              ? <SymbolView name="person.fill" tintColor={color} size={size} />
              : <Feather name="user" size={size} color={color} />,
        }}
      />

      {/* ── Hidden screens ── */}
      <Tabs.Screen name="prep" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
