import { analyticsAllowed, getPrivacyChoice, savePrivacyChoice } from './privacy-store';

export function initPrivacyOverlay(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#privacy-overlay');
  if (!dialog || dialog.dataset.bound) return;
  dialog.dataset.bound = 'true';
  const checkbox = dialog.querySelector<HTMLInputElement>('#privacy-analytics')!;
  const necessary = dialog.querySelector<HTMLInputElement>('#privacy-necessary')!;
  const main = dialog.querySelector<HTMLElement>('[data-privacy-main]')!;
  const details = dialog.querySelector<HTMLElement>('[data-privacy-detail-page]')!;
  const detailsLink = dialog.querySelector<HTMLButtonElement>('[data-privacy-details]')!;
  const save = dialog.querySelector<HTMLButtonElement>('[data-privacy-save]')!;
  const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  const content = dialog.querySelector<HTMLElement>('.privacy-content')!;
  const home = content.parentElement!;
  const settings = document.getElementById('settings-overlay')!;
  const settingsPage = settings.querySelector<HTMLElement>('[data-settings-page]')!;
  const settingsPaper = settings.querySelector<HTMLElement>('.settings-paper')!;
  const backToSettings = content.querySelector<HTMLButtonElement>('[data-privacy-settings-back]')!;
  let hosted = false;
  let animation: Animation | null = null;
  let busy = false;
  let failed = false;
  let previousOverflow = '';
  let opener: HTMLElement | null = null;

  function animateContent(element: HTMLElement): void {
    animation?.cancel();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true') return;
    animation = element.animate([
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 220, easing: 'ease-out' });
  }

  function restoreSettings(focus = true): void {
    if (!hosted) return;
    animation?.cancel();
    home.append(content);
    backToSettings.hidden = true;
    settingsPage.hidden = false;
    settingsPaper.classList.remove('has-privacy-page');
    settingsPaper.style.height = '';
    settings.setAttribute('aria-labelledby', 'settings-title');
    settings.removeAttribute('aria-describedby');
    hosted = false;
    if (focus) {
      animateContent(settingsPage);
      settings.querySelector<HTMLButtonElement>('[data-privacy-open]')!.focus({ preventScroll: true });
    }
  }

  function syncText(): void {
    const en = document.documentElement.lang.toLowerCase().startsWith('en');
    save.textContent = busy ? (en ? 'Saving…' : '保存中…') : (en ? 'Save selection' : '保存选择');
    status.textContent = failed ? (en
      ? 'Could not confirm Cookie cleanup. Please try again.'
      : '暂时无法确认 Cookie 已清理，请重试。') : '';
  }

  function showPage(detail: boolean, focus = true): void {
    main.hidden = detail;
    details.hidden = !detail;
    const activeOverlay = hosted ? settings : dialog!;
    activeOverlay.setAttribute('aria-labelledby', detail ? 'privacy-details-title' : 'privacy-title');
    activeOverlay.setAttribute('aria-describedby', detail ? 'privacy-details-intro' : 'privacy-intro');
    content.scrollTop = 0;
    if (focus) {
      animateContent(detail ? details : main);
      if (detail) details.querySelector<HTMLElement>('h2')!.focus();
      else detailsLink.focus();
    }
  }

  function syncChoice(): void {
    checkbox.checked = analyticsAllowed();
    necessary.checked = !checkbox.checked;
  }

  function open(withinSettings = false): void {
    if (dialog!.open || hosted) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    syncChoice();
    if (withinSettings) {
      settingsPaper.style.height = `${settingsPaper.offsetHeight}px`;
      settingsPaper.classList.add('has-privacy-page');
      settingsPage.hidden = true;
      settingsPaper.append(content);
      backToSettings.hidden = false;
      hosted = true;
    }
    showPage(false, false);
    failed = false;
    syncText();
    if (hosted) {
      animateContent(content);
      main.querySelector<HTMLElement>('h2')!.focus({ preventScroll: true });
      return;
    }
    previousOverflow = document.body.style.overflow;
    dialog!.classList.add('is-open');
    dialog!.showModal();
    document.body.style.overflow = 'hidden';
  }

  function close(): void {
    if (busy) return;
    if (hosted) document.dispatchEvent(new CustomEvent('daybook:settings-dismiss'));
    else dialog!.close();
  }

  dialog.addEventListener('close', () => {
    dialog.classList.remove('is-open');
    document.body.style.overflow = previousOverflow;
    opener?.focus({ preventScroll: true });
  });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.querySelectorAll('[data-privacy-close]').forEach(button => button.addEventListener('click', close));
  // These are two exclusive choices. Only selecting analytics can opt in.
  checkbox.addEventListener('change', () => { necessary.checked = !checkbox.checked; });
  necessary.addEventListener('change', () => { necessary.checked = true; checkbox.checked = false; });
  detailsLink.addEventListener('click', () => showPage(true));
  dialog.querySelector('[data-privacy-back]')!.addEventListener('click', () => showPage(false));
  document.addEventListener('daybook:lang-change', syncText);
  backToSettings.addEventListener('click', () => { if (!busy) restoreSettings(); });
  document.addEventListener('daybook:privacy-open', event => open((event as CustomEvent).detail?.withinSettings === true));
  document.addEventListener('daybook:settings-close', event => {
    if (busy && hosted) { event.preventDefault(); return; }
    restoreSettings(false);
  });
  document.addEventListener('keydown', event => {
    if (!hosted || event.key !== 'Tab') return;
    const controls = [...settings.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement?.tagName === 'H2')) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  });
  document.addEventListener('daybook:privacy-change', () => {
    if (!busy && (dialog.open || hosted)) { syncChoice(); syncText(); }
  });

  async function choose(analytics: boolean): Promise<void> {
    if (busy) return;
    busy = true;
    failed = false;
    const controls = (hosted ? settings : dialog!).querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input');
    const disabledStates = [...controls].map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    syncText();
    const saved = await savePrivacyChoice(analytics);
    busy = false;
    controls.forEach((control, index) => { control.disabled = disabledStates[index]!; });
    syncChoice();
    failed = !saved;
    syncText();
    if (saved) close();
  }

  save.addEventListener('click', () => { void choose(checkbox.checked); });
  if (document.body.dataset.statsEnabled === 'true' && !getPrivacyChoice()) open();
}
