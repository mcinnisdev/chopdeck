export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}
