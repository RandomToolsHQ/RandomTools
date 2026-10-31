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
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw Error("Choose a JPEG, PNG or WebP image.");
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 24000000)
        throw Error("Image exceeds 24 megapixels.");
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.round(bitmap.width * scale)),
        Math.max(1, Math.round(bitmap.height * scale)),
      );
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvas.convertToBlob({
        type: "image/webp",
        quality: 0.8,
      });
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
