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

// TTS engines read a lone capital letter by name ("capital I"). Speak such
// words as a homophone so a button sounds the same tapped alone as it does
// mid-sentence. Only whole-utterance exact matches are rewritten.
const SPOKEN_FIXES: Record<string, string> = {
  I: 'eye',
};

let cachedVoices: SpeechSynthesisVoice[] = [];

export function getVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    // Some platforms (notably Android/Chrome) return duplicate voices that share
    // the same voiceURI. Dedupe by voiceURI so anything keying on it stays valid
    // (a duplicate key crashes Svelte's {#each}) and the picker isn't cluttered.
    const seen = new Set<string>();
    cachedVoices = voices.filter((v) => (seen.has(v.voiceURI) ? false : seen.add(v.voiceURI)));
  }
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
  const trimmed = text.trim();
  if (!trimmed || !speechSupported()) return;
  const phrase = SPOKEN_FIXES[trimmed] ?? trimmed;

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
