import { animateTextChange, reducedMotion } from './text-roll';

/** Owns presentation only. The router owns request cancellation and identity. */
export class NavigationLoading {
  private id = 0;
  private timer = 0;
  private visible = false;
  private mobile = matchMedia('(max-width: 960px)');
  private motion = matchMedia('(prefers-reduced-motion: reduce)');
  private logo = document.querySelector<HTMLElement>('[data-navigation-logo]');
  private logoText = this.logo?.textContent ?? '';
  private logoWaiting = false;
  private status = document.getElementById('navigation-status');

  constructor() {
    this.mobile.addEventListener('change', () => this.syncLogo(true));
    this.motion.addEventListener('change', () => this.syncLogo(true));
    document.addEventListener('daybook:settings-change', () => this.syncLogo(true));
    // BFCache restores must not revive a stale pending indicator.
    window.addEventListener('pagehide', () => this.finish(this.id, true));
  }

  start(id: number) {
    this.id = id;
    clearTimeout(this.timer);
    document.documentElement.dataset.navigationPending = 'true';
    if (this.visible) return;
    this.timer = window.setTimeout(() => {
      if (id !== this.id) return;
      this.visible = true;
      document.documentElement.dataset.navigationLoading = 'true';
      document.querySelector('[data-daybook-page]')?.setAttribute('aria-busy', 'true');
      if (this.status) this.status.textContent = document.documentElement.lang.startsWith('en') ? 'Loading page…' : '正在载入页面…';
      this.syncLogo();
      document.dispatchEvent(new CustomEvent('daybook:navigation-loading'));
    }, 400);
  }

  finish(id: number, immediate = false) {
    if (id !== this.id) return;
    clearTimeout(this.timer);
    delete document.documentElement.dataset.navigationPending;
    if (!this.visible) {
      if (immediate) this.syncLogo(true);
      return;
    }
    this.visible = false;
    delete document.documentElement.dataset.navigationLoading;
    document.querySelector('[data-daybook-page]')?.removeAttribute('aria-busy');
    if (this.status) this.status.textContent = '';
    this.syncLogo(immediate);
    document.dispatchEvent(new CustomEvent('daybook:navigation-loading'));
  }

  private syncLogo(immediate = false) {
    if (!this.logo) return;
    const waiting = this.visible && this.mobile.matches;
    if (waiting === this.logoWaiting && !immediate) return;
    this.logoWaiting = waiting;
    // Measure both labels without moving the menu.
    if (waiting && !this.logo.style.minWidth) {
      const measure = this.logo.cloneNode(false) as HTMLElement;
      measure.removeAttribute('data-navigation-logo');
      measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none';
      this.logo.parentElement?.append(measure);
      measure.textContent = this.logoText;
      const original = measure.getBoundingClientRect().width;
      measure.textContent = 'Waiting...';
      this.logo.style.minWidth = `${Math.ceil(Math.max(original, measure.getBoundingClientRect().width))}px`;
      measure.remove();
    }
    animateTextChange(this.logo, waiting ? 'Waiting...' : this.logoText, immediate || reducedMotion(), () => {
      if (!this.logoWaiting) this.logo?.style.removeProperty('min-width');
    });
    if (!this.mobile.matches) this.logo.style.removeProperty('min-width');
  }
}
