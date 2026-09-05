// Browser-side services: file picker, drag-and-drop, audio boot on first gesture.
import { useEffect } from 'react';
import { Firmware } from '@/kernel/firmware';
import { AudioEngine } from '@/audio/engine';
import { importFiles } from '@/screens/load';

export function installHost(fw: Firmware, engine: AudioEngine) {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true; input.accept = 'audio/*,.wav,.aif,.aiff,.mp3,.flac,.ogg,.all,.aps,.pgm,.snd,.seq,.mid,.midi,.chopdeck,.zip';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = () => { if (input.files?.length) { importFiles(fw.ctx(), Array.from(input.files)); input.value = ''; fw.touch(); } };
  fw.host = {
    pickFiles: () => { engine.boot(); input.click(); },
    download: (name, bytes, mime = 'application/octet-stream') => {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
    },
  };
}

/** Boot the audio context on the first gesture and accept dropped files anywhere on the page. */
export function useHostEvents(fw: Firmware, engine: AudioEngine) {
  useEffect(() => {
    const boot = () => engine.boot();
    const opts = { capture: true, passive: true } as AddEventListenerOptions;
    window.addEventListener('pointerdown', boot, opts);
    window.addEventListener('keydown', boot, opts);
    const over = (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) { importFiles(fw.ctx(), files); fw.touch(); }
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('pointerdown', boot, opts); window.removeEventListener('keydown', boot, opts);
      window.removeEventListener('dragover', over); window.removeEventListener('drop', drop);
    };
  }, [fw, engine]);
}
