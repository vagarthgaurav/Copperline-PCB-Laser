const EM_DASH = '—';

const countFormat = new Intl.NumberFormat('en-US');

/** Zero-padded millimetres with two decimals, such as `072.50`; an em dash when unknown. */
export function formatCoordinate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EM_DASH;
  }
  const text = Math.abs(value).toFixed(2).padStart(6, '0');
  return value < 0 && Number(text) !== 0 ? `-${text}` : text;
}

/** Whole seconds as `mm:ss`; minutes keep counting past 59 (`125:00`). */
export function formatEta(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Thousands-separated integer, such as `1,284`. */
export function formatCount(value: number): string {
  return countFormat.format(value);
}

/** `Line 412 of 1,284`. */
export function formatLineOf(line: number, lines: number): string {
  return `Line ${formatCount(line)} of ${formatCount(lines)}`;
}
