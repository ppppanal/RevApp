import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { KeyPointKind, NoteResponse } from "@rev/shared";
import { ApiError, getNote } from "../api";
import { colors, space } from "../theme";
import { Button, ErrorBanner, Loading, Screen, SecondaryButton } from "../ui";

const kindLabel: Record<KeyPointKind, string> = {
  DEFINITION: "Definition",
  FORMULA: "Formula",
  FACT: "Fact",
};

const kindColor: Record<KeyPointKind, string> = {
  DEFINITION: colors.definition,
  FORMULA: colors.formula,
  FACT: colors.fact,
};

export function NoteScreen({
  noteId,
  onBack,
  onStudy,
}: {
  noteId: string;
  onBack: () => void;
  onStudy: (index: number) => void;
}) {
  const [note, setNote] = useState<NoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNote(noteId)
      .then((loaded) => {
        if (!cancelled) setNote(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Could not load this note.");
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  if (error) {
    return (
      <Screen>
        <View style={styles.pad}>
          <SecondaryButton label="Back" onPress={onBack} />
          <ErrorBanner message={error} />
        </View>
      </Screen>
    );
  }

  if (!note) {
    return (
      <Screen>
        <Loading label="Loading note" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <SecondaryButton label="Back" onPress={onBack} testID="back" />
        {note.subjectName ? <Text style={styles.subject}>{note.subjectName}</Text> : null}
        <Text style={styles.title}>{note.title}</Text>
        {note.status !== "READY" ? (
          <ErrorBanner
            message={
              note.status === "FAILED"
                ? "This note could not be generated. Try creating it again."
                : "This note is still processing."
            }
          />
        ) : null}
        {note.summary ? (
          <View style={styles.card} testID="note-summary">
            <Text style={styles.section}>Summary</Text>
            <Text style={styles.body}>{note.summary}</Text>
          </View>
        ) : null}
        <Text style={styles.section}>Key points</Text>
        {note.keyPoints.length === 0 ? <Text style={styles.muted}>No key points yet.</Text> : null}
        {note.keyPoints.map((point) => (
          <View key={point.id} style={styles.card}>
            <Text style={[styles.kind, { color: kindColor[point.kind] }]}>{kindLabel[point.kind]}</Text>
            <Text style={styles.body}>{point.content}</Text>
          </View>
        ))}
        <Text style={styles.section}>Cards</Text>
        {note.flashcards.length > 0 ? (
          <Button
            label={`Study ${note.flashcards.length} ${note.flashcards.length === 1 ? "card" : "cards"}`}
            onPress={() => onStudy(0)}
            testID="open-study"
          />
        ) : (
          <Text style={styles.muted}>No cards yet.</Text>
        )}
        {note.flashcards.map((card, index) => (
          <Pressable key={card.id} accessibilityRole="button" onPress={() => onStudy(index)} style={styles.card}>
            <Text style={styles.question}>{card.question}</Text>
            <Text style={styles.muted}>{card.edited ? "Edited · tap to study" : "Tap to study"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, gap: 12, paddingBottom: 40 },
  pad: { padding: space.screen, gap: 12 },
  subject: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "700", lineHeight: 34 },
  section: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  kind: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  question: { color: colors.ink, fontSize: 16, fontWeight: "600", lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13 },
});
