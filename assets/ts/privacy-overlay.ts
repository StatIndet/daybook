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
  let busy = false;
  let failed = false;
  let previousOverflow = '';
  let opener: HTMLElement | null = null;

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
    dialog!.setAttribute('aria-labelledby', detail ? 'privacy-details-title' : 'privacy-title');
    dialog!.setAttribute('aria-describedby', detail ? 'privacy-details-intro' : 'privacy-intro');
    dialog!.querySelector('.privacy-content')!.scrollTop = 0;
    if (focus) {
      if (detail) details.querySelector<HTMLElement>('h2')!.focus();
      else detailsLink.focus();
    }
  }

  function syncChoice(): void {
    checkbox.checked = analyticsAllowed();
    necessary.checked = !checkbox.checked;
  }

  function open(): void {
    if (dialog!.open) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    syncChoice();
    showPage(false, false);
    failed = false;
    syncText();
    previousOverflow = document.body.style.overflow;
    dialog!.classList.add('is-open');
    dialog!.showModal();
    document.body.style.overflow = 'hidden';
  }

  function close(): void { if (!busy) dialog!.close(); }

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
  document.addEventListener('daybook:privacy-open', open);
  document.addEventListener('daybook:privacy-change', () => {
    if (!busy && dialog.open) { syncChoice(); syncText(); }
  });

  async function choose(analytics: boolean): Promise<void> {
    if (busy) return;
    busy = true;
    failed = false;
    const controls = dialog!.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input');
    controls.forEach(control => { control.disabled = true; });
    syncText();
    const saved = await savePrivacyChoice(analytics);
    busy = false;
    controls.forEach(control => { control.disabled = false; });
    syncChoice();
    failed = !saved;
    syncText();
    if (saved) close();
  }

  save.addEventListener('click', () => { void choose(checkbox.checked); });
  if (document.body.dataset.statsEnabled === 'true' && !getPrivacyChoice()) open();
}
