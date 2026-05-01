import { StyleSheet, Text, View } from 'react-native';
import type { VerdictLabel } from '../factcheck/types';

const COLORS: Record<VerdictLabel, { bg: string; fg: string; label: string }> = {
  true: { bg: '#dcedc8', fg: '#33691e', label: 'True' },
  false: { bg: '#ffcdd2', fg: '#b71c1c', label: 'False' },
  uncertain: { bg: '#e0e0e0', fg: '#424242', label: 'Uncertain' },
};

export function VerdictBadge({ label }: { label: VerdictLabel }) {
  const c = COLORS[label];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
