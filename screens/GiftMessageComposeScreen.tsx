import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";

type GiftMessageComposeScreenProps = {
  message: string;
  onChangeMessage: (nextMessage: string) => void;
  onDone: () => void;
};

export default function GiftMessageComposeScreen({
  message,
  onChangeMessage,
  onDone,
}: GiftMessageComposeScreenProps) {
  const inputRef = useRef<TextInput | null>(null);
  const [selection, setSelection] = useState({
    start: message.length,
    end: message.length,
  });

  useEffect(() => {
    const cursorIndex = message.length;
    setSelection({ start: cursorIndex, end: cursorIndex });

    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);

    return () => clearTimeout(timeout);
  }, [message.length]);

  return (
    <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Gift Note</Text>
          <Text style={styles.title}>Write a message to send with your record.</Text>
        </View>

        <View style={styles.inputWrap}>
          <TextInput
            autoFocus
            multiline
            onChangeText={onChangeMessage}
            onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
            placeholder="Write a message to send along with this track."
            placeholderTextColor="rgba(17,17,17,0.36)"
            ref={inputRef}
            selection={selection}
            style={styles.input}
            textAlignVertical="top"
            value={message}
          />
        </View>

        <Pressable onPress={onDone} style={styles.doneButton}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: "100%",
    backgroundColor: "#FEFEFE",
    paddingHorizontal: 24,
    paddingTop: 112,
    paddingBottom: 40,
  },
  header: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
  },
  eyebrow: {
    color: "rgba(17,17,17,0.54)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 10,
    color: "#111111",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
  },
  inputWrap: {
    flex: 1,
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    marginTop: 28,
  },
  input: {
    flex: 1,
    minHeight: 220,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: "rgba(17,17,17,0.12)",
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    color: "#111111",
    fontSize: 18,
    lineHeight: 27,
  },
  doneButton: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
