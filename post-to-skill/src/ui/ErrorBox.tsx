import { Pressable, StyleSheet, Text, View } from 'react-native';

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#ffebee',
    borderColor: '#ef9a9a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  text: {
    color: '#b71c1c',
    fontSize: 14,
  },
  btn: {
    marginTop: 8,
    backgroundColor: '#b71c1c',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
  },
});
