import { liquidLoopFrames } from './generated/liquid-loop-frames';

/** Only plays while visible and busy. Pointer movement uses a separate RAF. */
export class LiquidCursor {
  readonly element: SVGSVGElement;
  private path: SVGPathElement;
  private raf = 0;
  private started = 0;
  private lastFrame = -1;

  constructor() {
    this.element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.element.classList.add('daybook-cursor__liquid');
    this.element.setAttribute('viewBox', '-140 -140 280 280');
    this.element.setAttribute('aria-hidden', 'true');
    this.path = document.createElementNS(this.element.namespaceURI, 'path') as SVGPathElement;
    this.element.append(this.path);
    this.reset();
  }

  start() {
    if (this.raf) return;
    this.started = performance.now();
    this.lastFrame = -1;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const elapsed = now - this.started;
    // Grow the resting dot first; begin at the first active pose afterwards.
    const frame = elapsed < 150 ? 0 : (24 + Math.floor((elapsed - 150) / 30)) % liquidLoopFrames.length;
    if (frame !== this.lastFrame) {
      this.path.setAttribute('d', liquidLoopFrames[frame]!);
      this.lastFrame = frame;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  reset() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.path.setAttribute('d', liquidLoopFrames[0]!);
  }

  destroy() {
    this.reset();
    this.element.remove();
  }
}
