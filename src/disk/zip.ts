// Minimal ZIP (store only) writer and reader, enough to bundle a project for export/import without dependencies.

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(data: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export interface ZipEntry { name: string; data: Uint8Array }

export function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = []; const central: Uint8Array[] = [];
  let offset = 0;
  const le16 = (n: number) => [n & 255, (n >> 8) & 255]; const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const e of entries) {
    const name = enc.encode(e.name); const crc = crc32(e.data);
    const local = Uint8Array.from([0x50, 0x4b, 3, 4, ...le16(20), ...le16(0x800), ...le16(0), ...le16(0), ...le16(0x21), ...le32(crc), ...le32(e.data.length), ...le32(e.data.length), ...le16(name.length), ...le16(0), ...name]);
    parts.push(local, e.data);
    central.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...le16(20), ...le16(20), ...le16(0x800), ...le16(0), ...le16(0), ...le16(0x21), ...le32(crc), ...le32(e.data.length), ...le32(e.data.length), ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(offset), ...name]));
    offset += local.length + e.data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = Uint8Array.from([0x50, 0x4b, 5, 6, ...le16(0), ...le16(0), ...le16(entries.length), ...le16(entries.length), ...le32(cdSize), ...le32(offset), ...le16(0)]);
  const total = offset + cdSize + end.length; const out = new Uint8Array(total); let p = 0;
  for (const b of [...parts, ...central, end]) { out.set(b, p); p += b.length; }
  return out;
}

/** Read a stored (uncompressed) zip; deflated entries are skipped. */
export function zipRead(bytes: Uint8Array): ZipEntry[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  // find end of central directory
  let eocd = -1; for (let i = bytes.length - 22; i >= 0; i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  const count = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true); const size = v.getUint32(p + 24, true); const nl = v.getUint16(p + 28, true); const el = v.getUint16(p + 30, true); const cl = v.getUint16(p + 32, true); const lo = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nl));
    if (method === 0) { const lnl = v.getUint16(lo + 26, true); const lel = v.getUint16(lo + 28, true); const start = lo + 30 + lnl + lel; out.push({ name, data: bytes.slice(start, start + size) }); }
    p += 46 + nl + el + cl;
  }
  return out;
}
