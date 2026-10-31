export function runRegex(
  pattern: string,
  flags: string,
  text: string,
  replacement?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./regex.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error("Expression exceeded the 1 second time limit."));
    }, 1000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onerror = () => {
      finish();
      reject(Error("Regex worker failed."));
    };
    worker.onmessage = (e) => {
      finish();
      if (e.data.error) reject(Error(e.data.error));
      else resolve(e.data.result);
    };
    worker.postMessage({ pattern, flags, text, replacement });
  });
}
