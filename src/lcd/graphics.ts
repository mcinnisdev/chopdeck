// Draws LcdFrame.graphics onto a canvas laid over the character grid. All coordinates are cell rectangles.
import { Graphic } from './frame';

export interface CellMetrics { cellW: number; cellH: number }

export function drawGraphics(ctx: CanvasRenderingContext2D, graphics: Graphic[], m: CellMetrics, ink: string, dim: string, glass: string): void {
  for (const g of graphics) {
    const x = g.col * m.cellW, y = g.row * m.cellH, w = g.cols * m.cellW, h = g.rows * m.cellH;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    switch (g.kind) {
      case 'fader': {
        // vertical bar from the bottom; a 1px track behind it
        const v = Math.max(0, Math.min(1, g.value ?? 0));
        const bw = Math.max(2, Math.floor(w * 0.5));
        const bx = x + Math.floor((w - bw) / 2);
        ctx.fillStyle = dim; ctx.fillRect(bx + Math.floor(bw / 2), y + 1, 1, h - 2);
        const bh = Math.round((h - 2) * v);
        ctx.fillStyle = ink; ctx.fillRect(bx, y + h - 1 - bh, bw, bh);
        break;
      }
      case 'pan': {
        // a small knob: circle with a pointer at the pan angle (0 = hard left, 1 = hard right)
        const v = Math.max(0, Math.min(1, g.value ?? 0.5));
        const r = Math.max(3, Math.min(w, h) / 2 - 1.5);
        const cx = x + w / 2, cy = y + h / 2;
        ctx.strokeStyle = ink; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        const a = (-135 + v * 270) * Math.PI / 180;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); ctx.stroke();
        break;
      }
      case 'meter': {
        // horizontal segmented meter with optional threshold/peak marks
        const v = Math.max(0, Math.min(1, g.value ?? 0));
        const segs = Math.max(4, Math.floor(w / 4));
        const lit = Math.round(segs * v);
        for (let i = 0; i < segs; i++) {
          ctx.fillStyle = i < lit ? ink : glass;
          ctx.fillRect(x + i * (w / segs) + 1, y + 2, w / segs - 2, h - 4);
          if (i >= lit) { ctx.strokeStyle = dim; ctx.strokeRect(x + i * (w / segs) + 1.5, y + 2.5, w / segs - 3, h - 5); }
        }
        for (const mk of g.marks ?? []) { ctx.fillStyle = ink; ctx.fillRect(x + Math.round(mk * w) - 1, y, 2, h); }
        break;
      }
      case 'bar': {
        const v = Math.max(0, Math.min(1, g.value ?? 0));
        ctx.fillStyle = ink; ctx.fillRect(x, y + 2, Math.round(w * v), h - 4);
        break;
      }
      case 'waveform': {
        const data = g.data ?? [];
        const n = data.length;
        if (g.selected) { ctx.fillStyle = dim; ctx.globalAlpha = 0.25; ctx.fillRect(x + g.selected[0] * w, y, (g.selected[1] - g.selected[0]) * w, h); ctx.globalAlpha = 1; }
        ctx.fillStyle = dim; ctx.fillRect(x, y + h / 2, w, 1);
        ctx.fillStyle = ink;
        if (n) {
          const cols = Math.floor(w);
          for (let px = 0; px < cols; px++) {
            const i0 = Math.floor((px / cols) * n), i1 = Math.max(i0 + 1, Math.floor(((px + 1) / cols) * n));
            let a = 0; for (let i = i0; i < i1; i++) a = Math.max(a, Math.abs(data[i] as number));
            const bh = Math.max(1, a * (h - 2));
            ctx.fillRect(x + px, y + h / 2 - bh / 2, 1, bh);
          }
        }
        for (const mk of g.marks ?? []) { ctx.fillStyle = ink; ctx.fillRect(x + Math.round(mk * w), y, 1, h); }
        if (g.playhead != null) { ctx.fillStyle = ink; ctx.fillRect(x + Math.round(g.playhead * w) - 1, y, 2, h); }
        break;
      }
      case 'box': {
        ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        break;
      }
    }
    ctx.restore();
  }
}
