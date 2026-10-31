export class BodyTooLarge extends Error {}
export async function readBody(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new BodyTooLarge("Request too large");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new BodyTooLarge("Request too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (e) {
    if (e instanceof TypeError)
      throw new SyntaxError("Invalid UTF-8 body", { cause: e });
    throw e;
  } finally {
    reader.releaseLock();
  }
}
