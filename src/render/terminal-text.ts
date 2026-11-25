/** Keep untrusted report fields on one line and prevent terminal control sequences. */
export function terminalText(value: string): string {
  return value.replace(/[\p{Cc}\p{Bidi_Control}\u2028\u2029]/gu, " ");
}
