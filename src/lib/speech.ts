// Thin wrapper around the browser's built-in SpeechSynthesis ("Web Speech API").
// Speech happens entirely on the device: no server, no network call, no cost.

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  lang?: string;
  voiceURI?: string;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let cachedVoices: SpeechSynthesisVoice[] = [];

export function getVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) cachedVoices = voices;
  return cachedVoices;
}

/** Subscribe to the (async) arrival of system voices. Returns an unsubscribe fn. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => {};
  const handler = () => {
    getVoices();
    cb();
  };
  window.speechSynthesis.addEventListener('voiceschanged', handler);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', handler);
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
  if (opts.voiceURI) {
    const voice = getVoices().find((v) => v.voiceURI === opts.voiceURI);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
  }
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
