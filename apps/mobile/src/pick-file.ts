import type { CreateNoteRequest } from "@rev/shared";
import { maxUploadBytes } from "@rev/shared";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

const acceptedTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"];

export type StudyFile = Extract<CreateNoteRequest["source"], { kind: "pdf" | "image" }>;

export async function pickStudyFile(): Promise<StudyFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: acceptedTypes,
    copyToCacheDirectory: true,
    multiple: false,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > maxUploadBytes) {
    throw new Error("That file is larger than 6 MB.");
  }
  const data = stripDataUrl(await readBase64(asset));
  if (!data) throw new Error("Could not read that file.");
  if (data.length > Math.ceil(maxUploadBytes / 3) * 4 + 8) {
    throw new Error("That file is larger than 6 MB.");
  }
  const name = asset.name?.trim() || "upload";
  const mime = (asset.mimeType ?? "").toLowerCase();
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    return { kind: "pdf", filename: name, data };
  }
  const mimeType = mime === "image/jpg" ? "image/jpeg" : mime;
  if (!mimeType.startsWith("image/")) {
    throw new Error("Use a PDF or a PNG, JPEG, WEBP, GIF, or BMP image.");
  }
  return { kind: "image", filename: name, mimeType, data };
}

async function readBase64(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (asset.base64) return asset.base64;
  if (asset.file) return blobToDataUrl(asset.file);
  return new File(asset.uri).base64();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read that file."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(blob);
  });
}

function stripDataUrl(value: string): string {
  return value.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
}
