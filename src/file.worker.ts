import { validateImage, imageSize } from "./image-core";
self.onmessage = async (
  event: MessageEvent<{ file: File; operation: "hash" | "image" }>,
) => {
  try {
    const { file, operation } = event.data;
    if (file.size > 25 * 1024 * 1024) throw Error("Files must be under 25 MB.");
    if (operation === "hash") {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      self.postMessage({
        hash: Array.from(new Uint8Array(digest), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join(""),
      });
      return;
    }
    validateImage(file);
    if (typeof OffscreenCanvas === "undefined") {
      self.postMessage({ fallback: true });
      return;
    }
    const bitmap = await createImageBitmap(file);
    try {
      const size = imageSize(bitmap.width, bitmap.height);
      const canvas = new OffscreenCanvas(size.width, size.height);
      const context = canvas.getContext("2d");
      if (!context) {
        self.postMessage({ fallback: true });
        return;
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob = await canvas.convertToBlob({
        type: "image/webp",
        quality: 0.8,
      });
      if (blob.type !== "image/webp" && file.type === "image/jpeg")
        blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
      self.postMessage({ blob });
    } finally {
      bitmap.close();
    }
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "File processing failed",
    });
  }
};
