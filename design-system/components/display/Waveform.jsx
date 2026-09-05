import React, { useEffect, useRef } from 'react';
export function Waveform({ data, chops = [], selected, playhead, height = 80, width = 480, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; c.width = width * dpr; c.height = height * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    const cs = getComputedStyle(c); const ink = cs.getPropertyValue('--lcd-ink').trim() || '#1C2814'; const dim = cs.getPropertyValue('--lcd-dim').trim() || '#5C6B44';
    ctx.clearRect(0, 0, width, height);
    const pts = data && data.length ? data : Array.from({ length: 256 }, (_, i) => Math.abs(Math.sin(i * .21) * Math.exp(-((i % 64) / 22))) * .9 + .04);
    const mid = height / 2; const step = width / pts.length;
    ctx.fillStyle = ink;
    pts.forEach((a, i) => { const h = Math.max(1, a * (height - 8)); ctx.fillRect(i * step, mid - h / 2, Math.max(1, step - 1), h); });
    ctx.fillStyle = dim; ctx.fillRect(0, mid, width, 1);
    chops.forEach((x, i) => { const px = x * width; ctx.fillStyle = ink; ctx.fillRect(px, 0, i === selected ? 2 : 1, height); ctx.font = '12px VT323, monospace'; ctx.fillText(String(i + 1).padStart(2, '0'), px + 3, 11); if (i === selected) { const nx = (chops[i + 1] ?? 1) * width; ctx.fillStyle = 'rgba(28,40,20,.18)'; ctx.fillRect(px, 0, nx - px, height); } });
    if (playhead != null) { ctx.fillStyle = ink; ctx.fillRect(playhead * width, 0, 2, height); }
  }, [data, chops, selected, playhead, height, width]);
  return <canvas ref={ref} role="img" aria-label="Waveform" style={{ width, height, display: 'block', imageRendering: 'pixelated', ...style }} />;
}
