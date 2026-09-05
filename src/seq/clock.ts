// A steady timer for the scheduler. A Worker keeps ticking when the tab is in the background;
// setInterval on the main thread is the fallback (and what tests use).

export interface Clock {
  /** Start calling `cb` about every `intervalMs`. */
  start(cb: () => void, intervalMs: number): void;
  stop(): void;
}

export class WorkerClock implements Clock {
  private worker: Worker | null = null;
  private timer: number | null = null;
  start(cb: () => void, intervalMs: number) {
    this.stop();
    try {
      const src = `let t=null;onmessage=e=>{if(e.data.cmd==='start'){clearInterval(t);t=setInterval(()=>postMessage('tick'),e.data.ms)}else{clearInterval(t);t=null}}`;
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      this.worker = new Worker(url);
      this.worker.onmessage = () => cb();
      this.worker.postMessage({ cmd: 'start', ms: intervalMs });
    } catch {
      this.timer = window.setInterval(cb, intervalMs);
    }
  }
  stop() {
    if (this.worker) { this.worker.postMessage({ cmd: 'stop' }); this.worker.terminate(); this.worker = null; }
    if (this.timer != null) { clearInterval(this.timer); this.timer = null; }
  }
}

/** Test clock: nothing runs until `pump()` is called by the test. */
export class ManualClock implements Clock {
  cb: (() => void) | null = null;
  start(cb: () => void) { this.cb = cb; }
  stop() { this.cb = null; }
  pump() { this.cb?.(); }
}
