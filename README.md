# Sayable

A simple, fast, **single-user AAC communication board** for the web.

Tap pictures → it speaks the words and builds a sentence. Some tiles open
other boards (folders). That's the whole idea — and deliberately so.

> **AAC** = Augmentative and Alternative Communication: tools that help people
> who don't use speech (or don't use it reliably) to communicate.

## Why it exists

Existing AAC web apps tend to be heavy, account-gated, and clunky. Sayable is a
reaction to that: built around **one person**, runs **entirely in the browser**,
**offline**, with **no accounts, no server, and no subscription**.

- **Speech is local** — uses the browser's built-in `speechSynthesis` (Web
  Speech API). No cloud TTS, no audio pipeline, no cost.
- **Data is local** — boards live on the device.
- **Installable** — a small PWA you can add to a tablet's home screen.

## Heritage & licensing

Sayable was **inspired by** the open-source []()
project — specifically the *idea* that an AAC board is a grid of buttons that
either speak or navigate. **No  code, text, or assets were copied.**
Different language, different framework, different data model, written from
scratch.

## Stack

- [Svelte 5](https://svelte.dev) (runes) + [Vite](https://vitejs.dev) + TypeScript
- Browser Web Speech API for text-to-speech
- Emoji as the v1 symbol set (zero dependencies, works offline)

## Run it

```sh
npm install
npm run dev      # http://localhost:5180
```

Build a production bundle:

```sh
npm run build
npm run preview
```

## How it's organized

```
src/
  lib/
    types.ts          # Board / Tile / TileAction data model
    speech.ts         # Web Speech API wrapper
    seed.ts           # the starter board set (home + Food/Feelings/Places/Fun)
    store.svelte.ts   # reactive app state (current board, sentence-in-progress)
  components/
    UtteranceBar.svelte  # the sentence bar + speak / delete / clear
    BoardGrid.svelte     # renders the current board as a grid
    TileButton.svelte    # a single tappable tile
  App.svelte          # top bar + layout
```

The data model, in one breath:

```ts
Board { name, rows, cols, tiles: Tile[] }
Tile  { text, symbol, bg, action: speak | goto(boardId) }
```

## Roadmap

- [ ] **Board editor** — add/move/recolor tiles, link boards (with local persistence)
- [ ] **Real symbol library** — swap emoji for [ARASAAC](https://arasaac.org)
      pictograms or uploaded photos (the `symbol` field already supports a URL)
- [ ] **Voice picker** — choose among installed system voices, save the preference
- [ ] **Offline service worker** — true offline install via the PWA
- [ ] **Per-person profiles** — export/import a board set as a single file
