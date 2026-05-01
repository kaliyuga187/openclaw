import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '@/store/app';

export default function RootLayout() {
  const hydrate = useAppStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#fafafa' } }}>
        <Stack.Screen name="index" options={{ title: 'post-to-skill' }} />
        <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
        <Stack.Screen name="feed/[handle]" options={{ title: 'Feed' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
