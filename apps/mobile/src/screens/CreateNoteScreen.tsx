import { maxNoteTextLength, type NoteSummary } from "@rev/shared";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError, createNote, listNotes } from "../api";
import { pickStudyFile, type StudyFile } from "../pick-file";
import { colors, space } from "../theme";
import { Button, ErrorBanner, Field, Screen, SecondaryButton } from "../ui";

export function CreateNoteScreen({ onOpenNote }: { onOpenNote: (noteId: string) => void }) {
  const [title, setTitle] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<StudyFile | null>(null);
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

  async function onPick() {
    setError(null);
    try {
      const picked = await pickStudyFile();
      if (!picked) return;
      setFile(picked);
      setText("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that file.");
    }
  }

  async function onCreate() {
    const noteText = text.trim();
    if (!file && !noteText) {
      setError("Paste notes or attach a PDF or photo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createNote({
        ...(file ? { source: file } : { text: noteText }),
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
        <Text style={styles.lede}>
          Paste a reading, or attach a PDF or photo. You’ll get a summary, key points, and a deck you can flip, edit, and quiz.
        </Text>
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
          onChangeText={(value) => {
            setText(value);
            if (value.trim()) setFile(null);
          }}
          placeholder={file ? "Remove the file to paste text" : "Paste plain text"}
          multiline
          editable={!file}
          maxLength={maxNoteTextLength}
          testID="note-text"
        />
        {file ? (
          <View style={styles.file}>
            <Text style={styles.fileName} testID="attached-name">
              {file.filename}
            </Text>
            <Text style={styles.rowMeta}>{file.kind === "pdf" ? "PDF" : "Photo"}</Text>
            <SecondaryButton label="Remove file" onPress={() => setFile(null)} disabled={busy} testID="clear-file" />
          </View>
        ) : (
          <SecondaryButton label="Attach PDF or photo" onPress={() => void onPick()} disabled={busy} testID="attach-file" />
        )}
        {error ? <ErrorBanner message={error} /> : null}
        <Button
          label={busy ? (file ? "Reading the file..." : "Making cards...") : "Make study cards"}
          onPress={() => void onCreate()}
          disabled={busy}
          testID="create-note"
        />
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
  file: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  fileName: { color: colors.ink, fontSize: 16, fontWeight: "600" },
});
