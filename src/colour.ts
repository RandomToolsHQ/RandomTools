export function parseColour(input: string): [number, number, number] {
  const value = input.trim().toLowerCase();
  if (/^#[\da-f]{3}$/.test(value))
    return [...value.slice(1)].map((c) => parseInt(c + c, 16)) as [
      number,
      number,
      number,
    ];
  if (/^#[\da-f]{6}$/.test(value))
    return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
  const rgb = value.match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/,
  );
  if (rgb) {
    const channels = rgb.slice(1).map(Number);
    if (channels.some((c) => c > 255))
      throw Error("RGB channels must be 0–255.");
    return channels as [number, number, number];
  }
  const hsl = value.match(
    /^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/,
  );
  if (hsl) {
    const hue = (((Number(hsl[1]) % 360) + 360) % 360) / 60,
      s = Number(hsl[2]) / 100,
      l = Number(hsl[3]) / 100;
    if (s > 1 || l > 1)
      throw Error("HSL saturation and lightness must be 0–100%.");
    const c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs((hue % 2) - 1)),
      m = l - c / 2;
    const parts =
      hue < 1
        ? [c, x, 0]
        : hue < 2
          ? [x, c, 0]
          : hue < 3
            ? [0, c, x]
            : hue < 4
              ? [0, x, c]
              : hue < 5
                ? [x, 0, c]
                : [c, 0, x];
    return parts.map((v) => Math.round((v + m) * 255)) as [
      number,
      number,
      number,
    ];
  }
  throw Error("Enter HEX (#6366f1), rgb(99, 102, 241) or hsl(239, 84%, 67%).");
}
