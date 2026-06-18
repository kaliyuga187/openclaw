import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { fetchPost, SyndicationError } from '@/x/syndication';
import type { XPost } from '@/x/types';
import { factCheckPost, type FactCheckResult } from '@/factcheck';
import { makeClient, MissingApiKeyError } from '@/anthropic/client';
import { useAppStore } from '@/store/app';
import { Disclaimer } from '@/ui/Disclaimer';
import { ClaimCard } from '@/ui/ClaimCard';
import { ErrorBox } from '@/ui/ErrorBox';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const apiKey = useAppStore((s) => s.apiKey);
  const model = useAppStore((s) => s.model);
  const [post, setPost] = useState<XPost | null>(null);
  const [result, setResult] = useState<FactCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const fetched = await fetchPost(id);
      setPost(fetched);
      const client = makeClient(apiKey);
      const fact = await factCheckPost(client, model, fetched.text);
      setResult(fact);
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
  }, [id, apiKey, model]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {post ? (
        <View style={styles.postBox}>
          <Text style={styles.author}>
            {post.authorName} <Text style={styles.handle}>@{post.authorHandle}</Text>
          </Text>
          <Text style={styles.body}>{post.text}</Text>
        </View>
      ) : null}

      <Disclaimer />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Fetching and assessing...</Text>
        </View>
      ) : null}

      {error ? <ErrorBox message={error} onRetry={run} /> : null}

      {result?.verdicts.length ? (
        result.verdicts.map((v, i) => <ClaimCard key={i} verdict={v} />)
      ) : !loading && result ? (
        <Text style={styles.empty}>No factual claims found in this post.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  content: { padding: 16 },
  postBox: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  author: { fontWeight: '700', fontSize: 14 },
  handle: { fontWeight: '400', color: '#666' },
  body: { marginTop: 6, fontSize: 15, lineHeight: 20 },
  loading: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  loadingText: { marginLeft: 10, color: '#555' },
  empty: { color: '#666', fontStyle: 'italic', marginTop: 12 },
});
