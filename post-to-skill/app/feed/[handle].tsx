import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchFeed, SyndicationError } from '@/x/syndication';
import type { XPost } from '@/x/types';
import { factCheckPost } from '@/factcheck';
import type { VerdictLabel } from '@/factcheck/types';
import { makeClient, MissingApiKeyError } from '@/anthropic/client';
import { useAppStore } from '@/store/app';
import { Disclaimer } from '@/ui/Disclaimer';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { ErrorBox } from '@/ui/ErrorBox';

type FeedRow = {
  post: XPost;
  status: 'pending' | 'done' | 'error';
  worstLabel?: VerdictLabel;
  errorMessage?: string;
};

function pickWorst(labels: VerdictLabel[]): VerdictLabel | undefined {
  if (labels.includes('false')) return 'false';
  if (labels.includes('uncertain')) return 'uncertain';
  if (labels.includes('true')) return 'true';
  return undefined;
}

export default function FeedScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const apiKey = useAppStore((s) => s.apiKey);
  const model = useAppStore((s) => s.model);
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!handle) return;
    setError(null);
    setLoading(true);
    setRows([]);
    try {
      const posts = await fetchFeed(handle);
      const initial: FeedRow[] = posts.map((p) => ({ post: p, status: 'pending' }));
      setRows(initial);

      const client = makeClient(apiKey);
      // Process sequentially to keep cache hits cheap and avoid rate-limit bursts.
      for (let i = 0; i < posts.length; i++) {
        try {
          const result = await factCheckPost(client, model, posts[i].text);
          const worst = pickWorst(result.verdicts.map((v) => v.label));
          setRows((prev) => {
            const next = [...prev];
            next[i] = { post: posts[i], status: 'done', worstLabel: worst };
            return next;
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed';
          setRows((prev) => {
            const next = [...prev];
            next[i] = { post: posts[i], status: 'error', errorMessage: msg };
            return next;
          });
        }
      }
    } catch (e) {
      if (e instanceof MissingApiKeyError) {
        setError('No API key. Open Settings to add one.');
      } else if (e instanceof SyndicationError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('Unknown error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, apiKey, model]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>@{handle}</Text>
        {loading ? <ActivityIndicator /> : null}
      </View>
      <Disclaimer />
      {error ? <ErrorBox message={error} onRetry={run} /> : null}

      <FlatList
        data={rows}
        keyExtractor={(r) => r.post.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/post/${item.post.id}`)}
          >
            <View style={styles.rowHeader}>
              {item.status === 'pending' ? (
                <ActivityIndicator size="small" />
              ) : item.status === 'done' && item.worstLabel ? (
                <VerdictBadge label={item.worstLabel} />
              ) : item.status === 'done' ? (
                <Text style={styles.muted}>no claims</Text>
              ) : (
                <Text style={styles.errSmall}>error</Text>
              )}
            </View>
            <Text style={styles.body} numberOfLines={3}>
              {item.post.text}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa', padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 20, fontWeight: '700' },
  row: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginVertical: 4,
  },
  rowHeader: { marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 19, color: '#212121' },
  muted: { color: '#888', fontSize: 12 },
  errSmall: { color: '#b71c1c', fontSize: 12 },
});
