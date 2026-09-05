// 16-bit PCM WAV encode (and a small decoder for tests / non-browser use).

export function encodeWav(pcm: Float32Array[], rate: number, bits: 16 | 24 = 16): Uint8Array {
  const channels = pcm.length; const frames = pcm[0]?.length ?? 0; const bytesPer = bits / 8;
  const dataLen = frames * channels * bytesPer;
  const buf = new ArrayBuffer(44 + dataLen); const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * channels * bytesPer, true); v.setUint16(32, channels * bytesPer, true); v.setUint16(34, bits, true);
  str(36, 'data'); v.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    const x = Math.max(-1, Math.min(1, pcm[c][i]));
    if (bits === 16) { v.setInt16(o, Math.round(x * 32767), true); o += 2; }
    else { const s = Math.round(x * 8388607); v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3; }
  }
  return new Uint8Array(buf);
}

/** Decode PCM WAV (8/16/24/32-bit int, 32-bit float). Returns null for anything else. */
export function decodeWav(bytes: Uint8Array): { pcm: Float32Array[]; rate: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let o = 12; let fmt: { format: number; channels: number; rate: number; bits: number } | null = null; let data: { off: number; len: number } | null = null;
  while (o + 8 <= bytes.length) {
    const id = tag(o); const len = v.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === 'data') { data = { off: o + 8, len: Math.min(len, bytes.length - o - 8) }; }
    o += 8 + len + (len & 1);
  }
  if (!fmt || !data) return null;
  const { channels, bits } = fmt; const isFloat = fmt.format === 3 || (fmt.format === 0xfffe && bits === 32);
  const frames = Math.floor(data.len / (channels * (bits / 8)));
  const pcm = Array.from({ length: Math.min(2, channels) }, () => new Float32Array(frames));
  let p = data.off;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    let x = 0;
    if (bits === 8) { x = (v.getUint8(p) - 128) / 128; p += 1; }
    else if (bits === 16) { x = v.getInt16(p, true) / 32768; p += 2; }
    else if (bits === 24) { const s = (v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16)) << 8 >> 8; x = s / 8388608; p += 3; }
    else if (bits === 32) { x = isFloat ? v.getFloat32(p, true) : v.getInt32(p, true) / 2147483648; p += 4; }
    if (c < 2) pcm[c][i] = x;
  }
  return { pcm, rate: fmt.rate };
}
