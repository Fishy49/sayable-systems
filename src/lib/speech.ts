// Thin wrapper around the browser's built-in SpeechSynthesis ("Web Speech API").
// Speech happens entirely on the device: no server, no network call, no cost.

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  lang?: string;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  const phrase = text.trim();
  if (!phrase || !speechSupported()) return;

  const synth = window.speechSynthesis;
  // Cancel anything mid-flight so rapid tapping stays snappy.
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.rate = opts.rate ?? 0.95;
  utterance.pitch = opts.pitch ?? 1;
  utterance.lang = opts.lang ?? 'en-US';
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
