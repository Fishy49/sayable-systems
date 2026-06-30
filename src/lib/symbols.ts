// ARASAAC pictogram library client.
//
// ARASAAC (https://arasaac.org) offers thousands of free AAC pictograms under
// CC BY-NC-SA, with an open, CORS-enabled API. We search it from the browser
// and embed picked images as data URLs so they stay offline and persistent.

const API = 'https://api.arasaac.org/v1';
const STATIC = 'https://static.arasaac.org/pictograms';

export interface Pictogram {
  id: number;
  keyword: string;
  thumb: string;
}

/** A tile symbol is either an emoji/text glyph or an image (URL or data URL). */
export function isImageSymbol(symbol: string): boolean {
  return /^(https?:|data:)/.test(symbol);
}

export function pictogramUrl(id: number, size = 300): string {
  return `${STATIC}/${id}/${id}_${size}.png`;
}

export async function searchPictograms(
  query: string,
  language = 'en',
  signal?: AbortSignal,
): Promise<Pictogram[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await fetch(`${API}/pictograms/${language}/search/${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = (await res.json()) as Array<{ _id: number; keywords?: Array<{ keyword?: string }> }>;
  return data.slice(0, 24).map((p) => ({
    id: p._id,
    keyword: p.keywords?.[0]?.keyword ?? q,
    thumb: pictogramUrl(p._id, 300),
  }));
}

/** Fetch an image and convert it to a self-contained data URL (offline-safe). */
export async function toDataUrl(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Turn an uploaded image File into a small, self-contained data URL: decoded,
 * scaled down to `maxSize`, and re-encoded. Keeps localStorage light and the
 * symbol fully offline. Falls back from WebP to PNG where WebP export is absent.
 */
export function fileToResizedDataUrl(file: File, maxSize = 320, quality = 0.82): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process that image.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      let out = '';
      try {
        out = canvas.toDataURL('image/webp', quality);
      } catch {
        out = '';
      }
      if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
      if (!out || out === 'data:,') {
        reject(new Error('Could not process that image.'));
        return;
      }
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}
