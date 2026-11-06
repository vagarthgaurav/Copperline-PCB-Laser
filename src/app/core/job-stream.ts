/**
 * Pure helpers for streaming a G-code program to grblHAL with character
 * counting: lines are sent while their bytes fit the controller's receive
 * buffer, and every `ok` or `error:n` frees the oldest sent line.
 */

/** Bytes of sent-but-unanswered lines allowed in flight. grbl's buffer is 127; grblHAL's is larger, so this is safe on both. */
export const RX_BUDGET = 120;

/** One program line without comments or surrounding space; empty when nothing is left to send. */
export function cleanGcodeLine(line: string): string {
  return line
    .replace(/\([^)]*\)/g, '')
    .replace(/;.*$/, '')
    .trim();
}

export interface SentLine {
  /** 0-based index in the program. */
  index: number;
  /** Bytes on the wire, including the newline. */
  bytes: number;
}

export interface Batch {
  /** The text to write, newline terminated; empty when nothing fits yet. */
  text: string;
  sent: SentLine[];
  /** Index of the next program line to look at. */
  cursor: number;
}

/**
 * Takes as many lines from `cursor` on as fit in the budget next to `inFlight` bytes.
 * Comment-only lines are skipped. A line longer than the whole budget is still sent, alone.
 */
export function nextBatch(lines: readonly string[], cursor: number, inFlight: number, budget = RX_BUDGET): Batch {
  const sent: SentLine[] = [];
  let text = '';
  let used = inFlight;
  let index = cursor;
  while (index < lines.length) {
    const clean = cleanGcodeLine(lines[index]);
    if (clean === '') {
      index++;
      continue;
    }
    const bytes = clean.length + 1;
    const fits = used + bytes <= budget || (used === 0 && sent.length === 0);
    if (!fits) {
      break;
    }
    text += `${clean}\n`;
    sent.push({ index, bytes });
    used += bytes;
    index++;
  }
  return { text, sent, cursor: index };
}
