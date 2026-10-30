import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NoteSummary } from "@rev/shared";
import { ApiError, createNote, listNotes } from "../api";
import { colors, space } from "../theme";
import { Button, ErrorBanner, Field, Screen } from "../ui";

export function CreateNoteScreen({ onOpenNote }: { onOpenNote: (noteId: string) => void }) {
  const [title, setTitle] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [text, setText] = useState("");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listNotes()
      .then((items) => {
        if (!cancelled) setNotes(items);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate() {
    const noteText = text.trim();
    if (!noteText) {
      setError("Paste some notes first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createNote({
        text: noteText,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(subjectName.trim() ? { subjectName: subjectName.trim() } : {}),
      });
      setNotes((current) => [
        {
          id: created.id,
          title: created.title,
          status: created.status,
          summary: created.summary,
          subjectName: created.subjectName,
          flashcardCount: created.flashcards.length,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        ...current.filter((item) => item.id !== created.id),
      ]);
      onOpenNote(created.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create the note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Rev</Text>
        <Text style={styles.title}>Turn notes into cards.</Text>
        <Text style={styles.lede}>Paste a reading. You’ll get a summary, key points, and a deck you can flip and edit.</Text>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Optional" maxLength={200} testID="note-title" />
        <Field
          label="Subject"
          value={subjectName}
          onChangeText={setSubjectName}
          placeholder="Optional"
          maxLength={80}
          testID="note-subject"
        />
        <Field
          label="Notes"
          value={text}
          onChangeText={setText}
          placeholder="Paste plain text"
          multiline
          maxLength={20000}
          testID="note-text"
        />
        {error ? <ErrorBanner message={error} /> : null}
        <Button label={busy ? "Making cards..." : "Make study cards"} onPress={() => void onCreate()} disabled={busy} testID="create-note" />
        <Text style={styles.section}>Recent</Text>
        {notes.length === 0 ? <Text style={styles.empty}>Notes you create show up here.</Text> : null}
        {notes.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" onPress={() => onOpenNote(item.id)} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowMeta}>
                {item.subjectName ? `${item.subjectName} · ` : ""}
                {item.flashcardCount} {item.flashcardCount === 1 ? "card" : "cards"}
                {item.status === "READY" ? "" : ` · ${item.status.toLowerCase()}`}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.screen, gap: 14, paddingBottom: 40 },
  kicker: { color: colors.accent, fontSize: 13, fontWeight: "700", letterSpacing: 0.6 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "700", lineHeight: 38 },
  lede: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  section: { color: colors.ink, fontSize: 18, fontWeight: "700", marginTop: 8 },
  empty: { color: colors.muted, fontSize: 15 },
  row: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  rowText: { gap: 4 },
  rowTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  rowMeta: { color: colors.muted, fontSize: 13 },
});
