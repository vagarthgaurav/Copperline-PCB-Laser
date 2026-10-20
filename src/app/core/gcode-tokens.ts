export interface GcodeToken {
  kind: 'word' | 'text' | 'comment';
  text: string;
}

/** A G or M word such as G1, M3, G21 or G01, not part of a longer identifier. */
const WORD = /(?<![A-Za-z0-9.])[GMgm]\d+(?:\.\d+)?/g;

/**
 * Splits one G-code line for syntax highlighting. G/M words are `word`, the
 * `;` and everything after it is `comment`, the rest is `text`. No characters
 * are dropped, so joining every token's text reproduces the line.
 */
export function tokenizeGcodeLine(line: string): GcodeToken[] {
  const tokens: GcodeToken[] = [];
  const semicolon = line.indexOf(';');
  const code = semicolon === -1 ? line : line.slice(0, semicolon);

  let last = 0;
  for (const match of code.matchAll(WORD)) {
    if (match.index > last) {
      tokens.push({ kind: 'text', text: code.slice(last, match.index) });
    }
    tokens.push({ kind: 'word', text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < code.length) {
    tokens.push({ kind: 'text', text: code.slice(last) });
  }
  if (semicolon !== -1) {
    tokens.push({ kind: 'comment', text: line.slice(semicolon) });
  }
  return tokens;
}
