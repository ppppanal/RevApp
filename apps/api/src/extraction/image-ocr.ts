import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tesseract from "tesseract.js";

const require = createRequire(import.meta.url);
const english = require("@tesseract.js-data/eng") as { langPath: string; gzip?: boolean };

type OcrWorker = Awaited<ReturnType<typeof tesseract.createWorker>>;

let workerPromise: Promise<OcrWorker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function recognizeImageText(data: Uint8Array): Promise<string> {
  const run = queue.then(async () => {
    const worker = await getWorker();
    try {
      const result = await worker.recognize(Buffer.from(data));
      return result.data.text ?? "";
    } catch (error) {
      await resetWorker();
      throw error;
    }
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function shutdownImageOcr(): Promise<void> {
  const pending = queue.then(() => resetWorker());
  queue = pending.then(
    () => undefined,
    () => undefined,
  );
  await pending;
}

function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = tesseract
      .createWorker("eng", 1, {
        langPath: english.langPath,
        gzip: english.gzip !== false,
        cachePath: join(tmpdir(), "rev-tesseract"),
        logger: () => undefined,
      })
      .then(async (worker) => {
        await worker.setParameters({ user_defined_dpi: "300" });
        return worker;
      })
      .catch((error: unknown) => {
        workerPromise = null;
        throw error;
      });
  }
  return workerPromise;
}

async function resetWorker(): Promise<void> {
  const current = workerPromise;
  workerPromise = null;
  if (!current) return;
  const worker = await current.catch(() => null);
  await worker?.terminate().catch(() => undefined);
}
