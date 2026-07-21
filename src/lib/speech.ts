// Speech layer with two providers, picked automatically:
//
//  1. Browser SpeechSynthesis ("Web Speech API") — Chrome, Safari, Edge, etc.
//  2. Fully Kiosk Browser's JS bridge (window.fully) — Android kiosk mode.
//     Fully ≥1.55 can enumerate the device's TTS voices (initTts +
//     ttsInitSuccess event) and speak with a specific voice via
//     textToSpeech(text, voiceName), so kiosk users get the same voice
//     choice as browser users. Older Fully versions fall back to the
//     device default voice.
//
// Speech happens entirely on the device: no server, no network call, no cost.

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  lang?: string;
  voiceURI?: string;
}

// Unified voice shape for the settings picker. Field names mirror
// SpeechSynthesisVoice so either provider slots in unchanged.
export interface VoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
}

interface FullyBridge {
  textToSpeech(text: string, localeOrVoice?: string): void;
  stopTextToSpeech?(): void;
  initTts?(): void;
  bind?(event: string, code: string): void;
}

interface FullyTtsInfo {
  currentEngine?: string;
  engines?: string[];
  defaultVoice?: string;
  voices?: { name: string; locale: string }[];
}

function nativeSynth(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function fullyBridge(): FullyBridge | null {
  if (typeof window === 'undefined') return null;
  const f = (window as unknown as { fully?: FullyBridge }).fully;
  return f && typeof f.textToSpeech === 'function' ? f : null;
}

// Fully's WebView also exposes a crippled speechSynthesis (single voice), so
// presence of the bridge — not absence of speechSynthesis — decides the
// provider. Voice mode needs the enumeration API (Fully ≥1.55).
function fullyVoiceMode(): boolean {
  const f = fullyBridge();
  return !!f && typeof f.initTts === 'function' && typeof f.bind === 'function';
}

export function speechSupported(): boolean {
  return nativeSynth() || fullyBridge() !== null;
}

/** Whether the active speech provider honors the rate slider. */
export function speechRateSupported(): boolean {
  return fullyBridge() === null && nativeSynth();
}

/* ------------------------------------------------------------ voice lists */

let cachedVoices: VoiceInfo[] = [];
let fullyVoices: VoiceInfo[] = [];
const voiceListeners = new Set<() => void>();

function notifyVoiceListeners() {
  for (const cb of voiceListeners) cb();
}

// Human labels for Android voice names like "en-us-x-iob-local":
// language via Intl, then a stable number when a locale has several voices.
function localeLabel(locale: string): string {
  const tag = locale.replace('_', '-');
  try {
    const label = new Intl.DisplayNames(['en'], { type: 'language' }).of(tag);
    if (label && label !== tag) return label;
  } catch {
    /* fall through */
  }
  return tag;
}

function buildFullyVoices(info: FullyTtsInfo): VoiceInfo[] {
  const seen = new Set<string>();
  const all = (info.voices ?? []).filter((v) => v?.name && !seen.has(v.name) && seen.add(v.name));

  // A talker must not lose its voice when wifi drops: hide "-network" voices
  // (they synthesize server-side). Also hide the generic "xx-XX-language"
  // pseudo-voices when the locale offers concrete ones.
  const local = all.filter((v) => !v.name.endsWith('-network'));
  const concreteLocales = new Set(local.filter((v) => !v.name.endsWith('-language')).map((v) => v.locale));
  const usable = local.filter((v) => !(v.name.endsWith('-language') && concreteLocales.has(v.locale)));

  // English first (the device's audience), then everything else; stable
  // name-order within a locale so the numbered labels never reshuffle.
  usable.sort((a, b) => {
    const aEn = a.locale.startsWith('en') ? 0 : 1;
    const bEn = b.locale.startsWith('en') ? 0 : 1;
    if (aEn !== bEn) return aEn - bEn;
    if (a.locale !== b.locale) return a.locale.localeCompare(b.locale);
    return a.name.localeCompare(b.name);
  });

  const perLocaleCount = new Map<string, number>();
  for (const v of usable) perLocaleCount.set(v.locale, (perLocaleCount.get(v.locale) ?? 0) + 1);

  const counter = new Map<string, number>();
  return usable.map((v) => {
    const n = (counter.get(v.locale) ?? 0) + 1;
    counter.set(v.locale, n);
    const base = localeLabel(v.locale);
    const label = (perLocaleCount.get(v.locale) ?? 1) > 1 ? `${base} ${n}` : base;
    return {
      voiceURI: v.name,
      name: label,
      lang: v.locale.replace('_', '-'),
      default: v.name === info.defaultVoice,
      localService: true,
    };
  });
}

function handleFullyTtsInfo(raw: string) {
  let info: FullyTtsInfo | null = null;
  try {
    info = JSON.parse(raw) as FullyTtsInfo;
  } catch {
    try {
      info = JSON.parse(raw.replace(/\\(["'])/g, '$1')) as FullyTtsInfo;
    } catch {
      return;
    }
  }
  if (!info) return;
  fullyVoices = buildFullyVoices(info);
  notifyVoiceListeners();
}

export function getVoices(): VoiceInfo[] {
  if (fullyVoiceMode()) return fullyVoices;
  if (!nativeSynth()) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    // Some platforms (notably Android/Chrome) return duplicate voices that share
    // the same voiceURI. Dedupe by voiceURI so anything keying on it stays valid
    // (a duplicate key crashes Svelte's {#each}) and the picker isn't cluttered.
    const seen = new Set<string>();
    cachedVoices = voices
      .filter((v) => (seen.has(v.voiceURI) ? false : seen.add(v.voiceURI)))
      .map((v) => ({
        voiceURI: v.voiceURI,
        name: v.name,
        lang: v.lang,
        default: v.default,
        localService: v.localService,
      }));
  }
  return cachedVoices;
}

/** Subscribe to the (async) arrival of system voices. Returns an unsubscribe fn. */
export function onVoicesChanged(cb: () => void): () => void {
  voiceListeners.add(cb);
  let off = () => {};
  if (!fullyVoiceMode() && nativeSynth()) {
    const handler = () => {
      getVoices();
      cb();
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    off = () => window.speechSynthesis.removeEventListener('voiceschanged', handler);
  }
  return () => {
    voiceListeners.delete(cb);
    off();
  };
}

/* ---------------------------------------------------------------- warm-up */

// Both speech paths initialize lazily on their first real use, which puts a
// long "is it broken?" pause before the first word after a cold boot. Warm
// them at startup. In Fully, initTts() both warms the Android engine and
// fires ttsInitSuccess with the voice catalog.
if (typeof window !== 'undefined') {
  const fully = fullyBridge();
  if (fully) {
    if (fullyVoiceMode()) {
      (window as unknown as Record<string, unknown>).__sayableTtsInfo = handleFullyTtsInfo;
      try {
        // $info arrives with pre-escaped quotes, made to sit inside a JS
        // string literal; the "$info" literal below unescapes it for us.
        fully.bind!('ttsInitSuccess', 'window.__sayableTtsInfo("$info")');
        fully.initTts!();
      } catch {
        /* enumeration unavailable; speak() still works with the default voice */
      }
    } else {
      fully.textToSpeech(' ');
    }
  } else if (nativeSynth()) {
    // Kick off the async voice-list load...
    window.speechSynthesis.getVoices();
    // ...and warm the synthesis engine silently. A muted (volume 0) real word
    // forces the engine + voice model to load now, so the first spoken tile
    // after a cold start doesn't stall. Best-effort: some browsers defer speech
    // until a user gesture, in which case the first tap warms it instead.
    try {
      const warm = new SpeechSynthesisUtterance('ready');
      warm.volume = 0;
      window.speechSynthesis.speak(warm);
    } catch {
      /* engine not ready yet; the first real utterance will warm it */
    }
  }
}

/* ---------------------------------------------------------------- speaking */

// TTS engines read a lone capital letter by name ("capital I"). Speak such
// words as a homophone so a button sounds the same tapped alone as it does
// mid-sentence. Only whole-utterance exact matches are rewritten.
const SPOKEN_FIXES: Record<string, string> = {
  I: 'eye',
};

export function speak(text: string, opts: SpeakOptions = {}): void {
  const trimmed = text.trim();
  if (!trimmed || !speechSupported()) return;
  const phrase = SPOKEN_FIXES[trimmed] ?? trimmed;

  const fully = fullyBridge();
  if (fully) {
    fully.stopTextToSpeech?.();
    // Prefer the saved voice, but only once we know the catalog contains it —
    // a stale browser voiceURI (profile configured in Chrome) must not be
    // handed to Android's engine. Avoid passing undefined into the Java
    // overloads — call the 1-arg form unless we have a voice or locale.
    const known =
      opts.voiceURI && (fullyVoices.length === 0 || fullyVoices.some((v) => v.voiceURI === opts.voiceURI));
    if (opts.voiceURI && fullyVoiceMode() && known) fully.textToSpeech(phrase, opts.voiceURI);
    else if (opts.lang) fully.textToSpeech(phrase, opts.lang);
    else fully.textToSpeech(phrase);
    return;
  }

  const synth = window.speechSynthesis;
  // Cancel anything mid-flight so rapid tapping stays snappy.
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.rate = opts.rate ?? 0.95;
  utterance.pitch = opts.pitch ?? 1;
  utterance.lang = opts.lang ?? 'en-US';
  if (opts.voiceURI) {
    const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === opts.voiceURI);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
  }
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  const fully = fullyBridge();
  if (fully) fully.stopTextToSpeech?.();
  else if (nativeSynth()) window.speechSynthesis.cancel();
}
