import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NoteResponse } from "@rev/shared";
import { ApiError, getNote, updateFlashcard } from "../api";
import { colors, space } from "../theme";
import { Button, ErrorBanner, Field, Loading, Screen, SecondaryButton } from "../ui";

export function StudyScreen({
  noteId,
  initialIndex,
  onBack,
}: {
  noteId: string;
  initialIndex: number;
  onBack: () => void;
}) {
  const [note, setNote] = useState<NoteResponse | null>(null);
  const [index, setIndex] = useState(initialIndex);
  const [showAnswer, setShowAnswer] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNote(noteId)
      .then((loaded) => {
        if (cancelled) return;
        setNote(loaded);
        const start = Math.min(initialIndex, Math.max(loaded.flashcards.length - 1, 0));
        setIndex(start);
        const card = loaded.flashcards[start];
        setQuestion(card?.question ?? "");
        setAnswer(card?.answer ?? "");
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Could not load cards.");
      });
    return () => {
      cancelled = true;
    };
  }, [noteId, initialIndex]);

  const card = note?.flashcards[index];

  function showCard(nextIndex: number) {
    if (!note) return;
    const next = note.flashcards[nextIndex];
    if (!next) return;
    setIndex(nextIndex);
    setShowAnswer(false);
    setQuestion(next.question);
    setAnswer(next.answer);
    setSaved(false);
    setError(null);
  }

  async function onSave() {
    if (!card) return;
    const nextQuestion = question.trim();
    const nextAnswer = answer.trim();
    if (!nextQuestion || !nextAnswer) {
      setError("Question and answer both need text.");
      return;
    }
    if (nextQuestion === card.question && nextAnswer === card.answer) {
      setSaved(true);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateFlashcard(card.id, {
        ...(nextQuestion !== card.question ? { question: nextQuestion } : {}),
        ...(nextAnswer !== card.answer ? { answer: nextAnswer } : {}),
      });
      setNote((current) => {
        if (!current) return current;
        return {
          ...current,
          flashcards: current.flashcards.map((item) => (item.id === updated.id ? updated : item)),
        };
      });
      setQuestion(updated.question);
      setAnswer(updated.answer);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save this card.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !note) {
    return (
      <Screen>
        <View style={styles.content}>
          <SecondaryButton label="Back" onPress={onBack} />
          <ErrorBanner message={error} />
        </View>
      </Screen>
    );
  }

  if (!note || !card) {
    return (
      <Screen>
        <Loading label="Loading cards" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SecondaryButton label="Back to note" onPress={onBack} testID="back" />
        <Text style={styles.progress} testID="card-progress">
          Card {index + 1} of {note.flashcards.length}
        </Text>
        <Pressable
          testID="study-card"
          accessibilityRole="button"
          accessibilityLabel={showAnswer ? "Show question" : "Show answer"}
          onPress={() => setShowAnswer((current) => !current)}
          style={styles.card}
        >
          <Text style={styles.face}>{showAnswer ? "Answer" : "Question"}</Text>
          <Text style={styles.cardText} testID={showAnswer ? "card-answer" : "card-question"}>
            {showAnswer ? card.answer : card.question}
          </Text>
          <Text style={styles.hint}>Tap to flip</Text>
        </Pressable>
        <View style={styles.row}>
          <View style={styles.rowButton}>
            <SecondaryButton label="Previous" onPress={() => showCard(index - 1)} disabled={index === 0} testID="prev-card" />
          </View>
          <View style={styles.rowButton}>
            <SecondaryButton
              label="Next"
              onPress={() => showCard(index + 1)}
              disabled={index === note.flashcards.length - 1}
              testID="next-card"
            />
          </View>
        </View>
        <Text style={styles.section}>Edit this card</Text>
        <Field label="Question" value={question} onChangeText={setQuestion} multiline style={styles.edit} testID="edit-question" />
        <Field label="Answer" value={answer} onChangeText={setAnswer} multiline style={styles.edit} testID="edit-answer" />
        {error ? <ErrorBanner message={error} /> : null}
        {saved ? <Text style={styles.saved}>Saved.</Text> : null}
        <Button label={busy ? "Saving..." : "Save card"} onPress={() => void onSave()} disabled={busy} testID="save-card" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, gap: 12, paddingBottom: 48 },
  progress: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 220,
    padding: 20,
    justifyContent: "space-between",
    gap: 12,
  },
  face: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  cardText: { color: colors.ink, fontSize: 22, lineHeight: 30, fontWeight: "600" },
  hint: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: "row", gap: 10 },
  rowButton: { flex: 1 },
  section: { color: colors.ink, fontSize: 18, fontWeight: "700", marginTop: 8 },
  edit: { minHeight: 88 },
  saved: { color: colors.accent, fontSize: 14, fontWeight: "600" },
});
