export function validateImage(file: File) {
  if (file.size > 25 * 1024 * 1024) throw Error("Files must be under 25 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPEG, PNG or WebP image.");
}
export function imageSize(width: number, height: number) {
  if (width * height > 24000000) throw Error("Image exceeds 24 megapixels.");
  const scale = Math.min(1, 1920 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export function imageExtension(blob: Blob) {
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/jpeg") return "jpg";
  throw Error("Browser returned an unsupported image format.");
}
