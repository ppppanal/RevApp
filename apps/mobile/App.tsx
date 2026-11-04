import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CreateNoteScreen } from "./src/screens/CreateNoteScreen";
import { NoteScreen } from "./src/screens/NoteScreen";
import { QuizScreen } from "./src/screens/QuizScreen";
import { StudyScreen } from "./src/screens/StudyScreen";
import { colors } from "./src/theme";

type Route =
  | { name: "home" }
  | { name: "note"; noteId: string }
  | { name: "study"; noteId: string; index: number }
  | { name: "quiz"; noteId: string };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: "home" });

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {route.name === "home" ? <CreateNoteScreen onOpenNote={(noteId) => setRoute({ name: "note", noteId })} /> : null}
      {route.name === "note" ? (
        <NoteScreen
          noteId={route.noteId}
          onBack={() => setRoute({ name: "home" })}
          onStudy={(index) => setRoute({ name: "study", noteId: route.noteId, index })}
          onQuiz={() => setRoute({ name: "quiz", noteId: route.noteId })}
        />
      ) : null}
      {route.name === "quiz" ? (
        <QuizScreen noteId={route.noteId} onBack={() => setRoute({ name: "note", noteId: route.noteId })} />
      ) : null}
      {route.name === "study" ? (
        <StudyScreen
          noteId={route.noteId}
          initialIndex={route.index}
          onBack={() => setRoute({ name: "note", noteId: route.noteId })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
