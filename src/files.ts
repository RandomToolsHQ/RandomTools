export function processFile(
  file: File,
  operation: "hash" | "image",
): Promise<{ hash?: string; blob?: Blob }> {
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
      if (e.data.error) reject(Error(e.data.error));
      else resolve(e.data);
    };
    worker.postMessage({ file, operation });
  });
}
