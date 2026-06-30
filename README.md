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

## Symbols

Tiles can use **emoji** (offline, zero-dependency), real **[ARASAAC](https://arasaac.org)
pictograms** searchable right inside the tile editor, or **your own uploaded
image** (or a photo on mobile). Pictograms and uploads are **embedded as data
URLs** — uploads are resized/compressed first — so symbols keep working offline
and survive without any network call.

> Pictograms are by **ARASAAC** (Gobierno de Aragón, author Sergio Palao),
> licensed **CC BY-NC-SA**. Attribution is shown in the symbol picker. Non-commercial use.

## Roadmap

- [x] **Board editor** — add/move/recolor tiles, drag-to-reorder, link/create boards (auto-saved)
- [x] **Real symbol library** — ARASAAC pictogram search, embedded offline
- [x] **Profiles** — multiple named board sets (one per communicator) with a switcher
- [ ] **Category icons** — pair each color with a shape/icon for colorblind & low-vision users
- [ ] **Voice picker** — choose among installed system voices, save the preference
- [ ] **Offline service worker** — true offline install via the PWA
- [ ] **Profile export/import** — save/load a profile as a single shareable file
