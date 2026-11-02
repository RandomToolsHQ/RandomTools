import words from "./data/eff-words.txt?raw";
// EFF Large Wordlist. Source and CC BY attribution: src/data/NOTICE.md.
export const effWords = words.trim().split("\n");
if (effWords.length !== 7776 || new Set(effWords).size !== 7776)
  throw Error("Passphrase dictionary integrity error");
