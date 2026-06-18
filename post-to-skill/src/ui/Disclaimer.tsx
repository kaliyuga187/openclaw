import { StyleSheet, Text, View } from 'react-native';

export function Disclaimer() {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        Verdicts use Claude&rsquo;s training knowledge only. No live web search, no cited sources.
        Treat as a sanity check, not authoritative fact-checking.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#fff8e1',
    borderColor: '#f4c542',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
  },
  text: {
    color: '#5a4500',
    fontSize: 12,
    lineHeight: 16,
  },
});
