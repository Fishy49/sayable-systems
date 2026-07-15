// A tiny ZIP reader/writer for Open Board Format `.obz` bundles.
//
// Zero dependencies, in keeping with the rest of the app: DEFLATE is done with
// the platform's CompressionStream / DecompressionStream ('deflate-raw'),
// available in every browser we target. Reading handles both stored (method 0)
// and deflated (method 8) entries, so `.obz` files from other AAC tools
// (CoughDrop, AsTeRICS Grid, Cboard) import cleanly.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// ---- deflate helpers (native streams) ----

async function streamThrough(data: Uint8Array, ts: ReadableWritablePair): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(ts);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const deflateRaw = (d: Uint8Array) => streamThrough(d, new CompressionStream('deflate-raw'));
const inflateRaw = (d: Uint8Array) => streamThrough(d, new DecompressionStream('deflate-raw'));

// ---- CRC-32 (IEEE, as ZIP requires) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- little-endian writers ----

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}
const rd16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const rd32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// Fixed DOS timestamp (1980-01-01) — keeps output deterministic and avoids a
// dependency on the clock; OBZ consumers don't care about entry mtimes.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;
const UTF8_FLAG = 0x0800; // filenames are UTF-8

/** Build a ZIP archive. Entries are DEFLATE-compressed. */
export async function zip(entries: ZipEntry[]): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const chunks: number[][] = [];
  const central: number[][] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const deflated = await deflateRaw(entry.data);
    // If DEFLATE didn't help (already-compressed image data), store instead.
    const stored = deflated.length >= entry.data.length;
    const method = stored ? 0 : 8;
    const body = stored ? entry.data : deflated;

    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(UTF8_FLAG), ...u16(method),
      ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc),
      ...u32(body.length), ...u32(entry.data.length),
      ...u16(nameBytes.length), ...u16(0),
      ...nameBytes,
    ];
    chunks.push(local, [...body]);

    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(UTF8_FLAG), ...u16(method),
      ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc),
      ...u32(body.length), ...u32(entry.data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset),
      ...nameBytes,
    ]);
    offset += local.length + body.length;
  }

  const centralStart = offset;
  const centralBytes = central.flat();
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralBytes.length), ...u32(centralStart), ...u16(0),
  ];

  const total = offset + centralBytes.length + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  out.set(centralBytes, p);
  p += centralBytes.length;
  out.set(eocd, p);
  return out;
}

/** Read a ZIP archive into a name → bytes map. Handles stored + deflated. */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  // Find the End Of Central Directory record (scan back over its variable comment).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 0xffff; i--) {
    if (rd32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP file (no end-of-central-directory record).');

  const count = rd16(bytes, eocd + 10);
  let p = rd32(bytes, eocd + 16); // central directory offset
  const dec = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (rd32(bytes, p) !== 0x02014b50) throw new Error('Corrupt ZIP central directory.');
    const method = rd16(bytes, p + 10);
    const compSize = rd32(bytes, p + 20);
    const nameLen = rd16(bytes, p + 28);
    const extraLen = rd16(bytes, p + 30);
    const commentLen = rd16(bytes, p + 32);
    const localOff = rd32(bytes, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    // Jump to the local header to find where the data actually starts.
    const lNameLen = rd16(bytes, localOff + 26);
    const lExtraLen = rd16(bytes, localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    files.set(name, method === 8 ? await inflateRaw(raw) : new Uint8Array(raw));

    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
