import { validateImage, imageSize } from "./image-core";
async function compressOnMainThread(file: File) {
  validateImage(file);
  const bitmap = await createImageBitmap(file);
  try {
    const size = imageSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw Error("Canvas is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.8),
    );
    if (blob && blob.type !== "image/webp" && file.type === "image/jpeg")
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8),
      );
    if (!blob) throw Error("Image encoding failed.");
    return { blob };
  } finally {
    bitmap.close();
  }
}
export function processFile(
  file: File,
  operation: "hash" | "image",
): Promise<{ hash?: string; blob?: Blob }> {
  if (operation === "image" && typeof OffscreenCanvas === "undefined")
    return compressOnMainThread(file);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./file.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        Error("Processing timed out after 30 seconds. Try a smaller file."),
      );
    }, 30000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onerror = () => {
      finish();
      reject(Error("File worker unavailable. Try an up-to-date browser."));
    };
    worker.onmessage = (e) => {
      finish();
      if (e.data.fallback && operation === "image") {
        void compressOnMainThread(file).then(resolve, reject);
        return;
      }
      if (e.data.error) reject(Error(e.data.error));
      else resolve(e.data);
    };
    worker.postMessage({ file, operation });
  });
}
