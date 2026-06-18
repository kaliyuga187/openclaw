import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VerdictBadge } from './VerdictBadge';
import type { Verdict } from '../factcheck/types';

export function ClaimCard({ verdict }: { verdict: Verdict }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable style={styles.card} onPress={() => setOpen((v) => !v)}>
      <View style={styles.header}>
        <VerdictBadge label={verdict.label} />
        <Text style={styles.confidence}>{verdict.confidence} confidence</Text>
      </View>
      <Text style={styles.claim}>{verdict.claim}</Text>
      {open ? <Text style={styles.reasoning}>{verdict.reasoning}</Text> : (
        <Text style={styles.tap}>Tap to see reasoning</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  claim: {
    fontSize: 15,
    color: '#212121',
    lineHeight: 20,
  },
  reasoning: {
    fontSize: 13,
    color: '#555',
    marginTop: 8,
    lineHeight: 18,
  },
  confidence: {
    fontSize: 11,
    color: '#888',
  },
  tap: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
  },
});
