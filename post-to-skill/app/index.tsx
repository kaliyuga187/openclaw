import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { parseInput } from '@/x/parseUrl';
import { useAppStore } from '@/store/app';
import { Disclaimer } from '@/ui/Disclaimer';

export default function Index() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apiKey = useAppStore((s) => s.apiKey);
  const hydrated = useAppStore((s) => s.hydrated);

  const submit = () => {
    setError(null);
    const result = parseInput(input);
    if (result.kind === 'invalid') {
      setError(result.reason);
      return;
    }
    if (result.kind === 'post') router.push(`/post/${result.id}`);
    else router.push(`/feed/${result.handle}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Check a post or account</Text>
      <Text style={styles.sub}>
        Paste an x.com post URL, an account handle, or a numeric post id.
      </Text>

      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="https://x.com/nasa/status/... or @nasa"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        onSubmitEditing={submit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={submit}>
        <Text style={styles.buttonText}>Check</Text>
      </Pressable>

      {hydrated && !apiKey ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            No Anthropic API key configured. Open Settings to add one.
          </Text>
        </View>
      ) : null}

      <Disclaimer />

      <Link href="/settings" asChild>
        <Pressable style={styles.link}>
          <Text style={styles.linkText}>Settings</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fafafa' },
  heading: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  sub: { fontSize: 14, color: '#666', marginTop: 4, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  error: { color: '#b71c1c', marginTop: 8 },
  button: {
    marginTop: 12,
    backgroundColor: '#1976d2',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  warn: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#ffe0b2',
    borderRadius: 8,
  },
  warnText: { color: '#8a4b00' },
  link: { marginTop: 'auto', paddingVertical: 12, alignItems: 'center' },
  linkText: { color: '#1976d2', fontSize: 16 },
});
