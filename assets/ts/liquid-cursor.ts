import { liquidLoopFrames } from './generated/liquid-loop-frames';

// Matches the liquid/core transitions in custom-cursor.css.
const TRANSITION_MS = 300;

/** Plays while busy or fading out. Pointer movement uses a separate RAF. */
export class LiquidCursor {
  readonly element: SVGSVGElement;
  private path: SVGPathElement;
  private raf = 0;
  private started = 0;
  private lastFrame = -1;
  private exitTimer = 0;
  private settleTimer = 0;
  private enteredAt = 0;

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
    window.clearTimeout(this.settleTimer);
    this.settleTimer = 0;
    window.clearTimeout(this.exitTimer);
    this.exitTimer = 0;
    const cursor = this.element.parentElement;
    if (!cursor?.classList.contains('is-loading')) {
      this.enteredAt = performance.now();
      cursor?.classList.add('is-loading');
    }
    if (this.raf) return;
    this.started = performance.now();
    this.lastFrame = -1;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const elapsed = now - this.started;
    // Grow the resting dot first; begin at the first active pose afterwards.
    const frame = elapsed < TRANSITION_MS ? 0 : (24 + Math.floor((elapsed - TRANSITION_MS) / 30)) % liquidLoopFrames.length;
    if (frame !== this.lastFrame) {
      this.path.setAttribute('d', liquidLoopFrames[frame]!);
      this.lastFrame = frame;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  stop(immediate = false) {
    if (immediate) {
      this.reset();
      return;
    }
    window.clearTimeout(this.settleTimer);
    // Finish an already-visible entrance without holding up navigation.
    const remaining = Math.max(0, TRANSITION_MS - (performance.now() - this.enteredAt));
    if (remaining > 0) {
      this.settleTimer = window.setTimeout(() => this.fadeOut(), remaining);
    } else {
      this.fadeOut();
    }
  }

  private fadeOut() {
    this.settleTimer = 0;
    this.element.parentElement?.classList.remove('is-loading');
    // Keep the current loop alive through the CSS shrink/fade. A new request
    // can reverse that transition without resetting the visible silhouette.
    window.clearTimeout(this.exitTimer);
    this.exitTimer = window.setTimeout(() => this.reset(), TRANSITION_MS);
  }

  reset() {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = 0;
    window.clearTimeout(this.exitTimer);
    this.exitTimer = 0;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.element.parentElement?.classList.remove('is-loading');
    this.path.setAttribute('d', liquidLoopFrames[0]!);
  }

  destroy() {
    this.reset();
    this.element.remove();
  }
}
