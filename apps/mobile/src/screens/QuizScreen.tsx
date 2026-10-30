import { answersMatch, type NoteResponse } from "@rev/shared";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, getNote } from "../api";
import { colors, space } from "../theme";
import { Button, ErrorBanner, Field, Loading, Screen, SecondaryButton } from "../ui";

export function QuizScreen({ noteId, onBack }: { noteId: string; onBack: () => void }) {
  const [note, setNote] = useState<NoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<"answer" | "review" | "done">("answer");
  const [correctCount, setCorrectCount] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNote(noteId)
      .then((loaded) => {
        if (!cancelled) setNote(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Could not load this quiz.");
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  function restart() {
    setIndex(0);
    setDraft("");
    setPhase("answer");
    setCorrectCount(0);
    setLastCorrect(false);
    setError(null);
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

  if (!note) {
    return (
      <Screen>
        <Loading label="Loading quiz" />
      </Screen>
    );
  }

  if (note.flashcards.length === 0) {
    return (
      <Screen>
        <View style={styles.content}>
          <SecondaryButton label="Back to note" onPress={onBack} testID="back" />
          <Text style={styles.title}>No cards to quiz.</Text>
        </View>
      </Screen>
    );
  }

  const total = note.flashcards.length;
  const card = note.flashcards[index];
  const score = `Score ${correctCount} of ${total}`;

  if (phase === "done" || !card) {
    return (
      <Screen>
        <View style={styles.content}>
          <SecondaryButton label="Back to note" onPress={onBack} testID="back" />
          <Text style={styles.kicker}>Quiz</Text>
          <Text style={styles.title} testID="quiz-score">
            You scored {correctCount} of {total}.
          </Text>
          <Text style={styles.body}>
            {correctCount === total ? "Every card matched." : "Review the cards you missed, then try the quiz again."}
          </Text>
          <Button label="Retry quiz" onPress={restart} testID="retry-quiz" />
        </View>
      </Screen>
    );
  }

  function onCheck() {
    const attempt = draft.trim();
    if (!attempt || !card) {
      setError("Type an answer first.");
      return;
    }
    const correct = answersMatch(card.answer, attempt);
    setLastCorrect(correct);
    if (correct) setCorrectCount((current) => current + 1);
    setError(null);
    setPhase("review");
  }

  function onNext() {
    if (index + 1 >= total) {
      setPhase("done");
      return;
    }
    setIndex((current) => current + 1);
    setDraft("");
    setLastCorrect(false);
    setPhase("answer");
    setError(null);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SecondaryButton label="Back to note" onPress={onBack} testID="back" />
        <Text style={styles.progress} testID="quiz-score">
          {score}
        </Text>
        <Text style={styles.progress}>
          Question {index + 1} of {total}
        </Text>
        <View style={styles.card}>
          <Text style={styles.face}>Question</Text>
          <Text style={styles.question} testID="quiz-question">
            {card.question}
          </Text>
        </View>
        {phase === "answer" ? (
          <>
            <Field
              label="Your answer"
              value={draft}
              onChangeText={setDraft}
              multiline
              style={styles.answer}
              testID="quiz-answer"
            />
            {error ? <ErrorBanner message={error} /> : null}
            <Button label="Check answer" onPress={onCheck} disabled={!draft.trim()} testID="check-answer" />
          </>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={[styles.face, { color: lastCorrect ? colors.accent : colors.danger }]} testID="quiz-result">
                {lastCorrect ? "Correct" : "Not quite"}
              </Text>
              <Text style={styles.label}>You wrote</Text>
              <Text style={styles.body}>{draft.trim()}</Text>
              <Text style={styles.label}>Answer</Text>
              <Text style={styles.body} testID="quiz-expected">
                {card.answer}
              </Text>
            </View>
            <Button
              label={index + 1 >= total ? "See score" : "Next question"}
              onPress={onNext}
              testID="next-question"
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, gap: 12, paddingBottom: 48 },
  kicker: { color: colors.accent, fontSize: 13, fontWeight: "700", letterSpacing: 0.6 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "700", lineHeight: 34 },
  progress: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  face: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  question: { color: colors.ink, fontSize: 22, lineHeight: 30, fontWeight: "600" },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 4 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  answer: { minHeight: 88 },
});
