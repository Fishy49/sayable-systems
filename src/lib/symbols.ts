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
