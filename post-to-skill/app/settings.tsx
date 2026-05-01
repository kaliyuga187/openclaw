import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppStore } from '@/store/app';
import { MODEL_LABELS, type ModelChoice } from '@/anthropic/client';

export default function Settings() {
  const apiKey = useAppStore((s) => s.apiKey);
  const model = useAppStore((s) => s.model);
  const setApiKey = useAppStore((s) => s.setApiKey);
  const clearApiKey = useAppStore((s) => s.clearApiKey);
  const setModel = useAppStore((s) => s.setModel);
  const [draft, setDraft] = useState(apiKey ?? '');

  const save = async () => {
    if (draft.trim()) await setApiKey(draft.trim());
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.section}>Anthropic API key</Text>
      <Text style={styles.help}>
        Stored in your device&rsquo;s secure storage (Keychain on iOS, Keystore on Android). Never
        sent anywhere except Anthropic&rsquo;s API.
      </Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="sk-ant-..."
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={styles.input}
      />
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={save}>
          <Text style={styles.buttonText}>Save</Text>
        </Pressable>
        {apiKey ? (
          <Pressable
            style={[styles.button, styles.danger]}
            onPress={async () => {
              await clearApiKey();
              setDraft('');
            }}
          >
            <Text style={styles.buttonText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}>
        <Text style={styles.link}>Get an API key &rarr;</Text>
      </Pressable>

      <Text style={styles.section}>Model</Text>
      <Text style={styles.help}>
        Default is Opus 4.7 (highest quality). Switch to a smaller model for faster, cheaper
        responses on short posts.
      </Text>
      {(Object.keys(MODEL_LABELS) as ModelChoice[]).map((m) => (
        <Pressable key={m} style={styles.modelRow} onPress={() => setModel(m)}>
          <Text style={[styles.modelLabel, m === model && styles.modelSelected]}>
            {m === model ? '● ' : '○ '}
            {MODEL_LABELS[m]}
          </Text>
        </Pressable>
      ))}

      <Text style={styles.section}>About</Text>
      <Text style={styles.help}>
        post-to-skill is a personal tool. Verdicts come from Claude&rsquo;s training data only.
        It is not a replacement for live, sourced fact-checking.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fafafa' },
  section: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  help: { fontSize: 13, color: '#555', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', marginTop: 8, gap: 8 },
  button: {
    backgroundColor: '#1976d2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  danger: { backgroundColor: '#b71c1c' },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { color: '#1976d2', marginTop: 10 },
  modelRow: { paddingVertical: 8 },
  modelLabel: { fontSize: 14, color: '#333' },
  modelSelected: { fontWeight: '700', color: '#1976d2' },
});
