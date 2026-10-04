import { analyticsAllowed, getPrivacyChoice, savePrivacyChoice } from './privacy-store';

export function initPrivacyOverlay(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#privacy-overlay');
  if (!dialog || dialog.dataset.bound) return;
  dialog.dataset.bound = 'true';
  const checkbox = dialog.querySelector<HTMLInputElement>('#privacy-analytics')!;
  const save = dialog.querySelector<HTMLButtonElement>('[data-privacy-save]')!;
  const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  let busy = false;
  let failed = false;
  let previousOverflow = '';
  let opener: HTMLElement | null = null;

  function syncText(): void {
    const en = document.documentElement.lang.toLowerCase().startsWith('en');
    save.textContent = busy ? (en ? 'Saving…' : '保存中…') : checkbox.checked
      ? (en ? 'Allow anonymous statistics' : '允许匿名统计')
      : (en ? 'Save selection' : '保存选择');
    status.textContent = failed ? (en
      ? 'Statistics are paused. Cookie cleanup could not be confirmed; please try saving again.'
      : '统计已暂停，暂时无法确认 Cookie 清理结果，请重试保存。') : '';
  }

  function open(): void {
    if (dialog!.open) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    checkbox.checked = analyticsAllowed();
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
  checkbox.addEventListener('change', syncText);
  document.addEventListener('daybook:lang-change', syncText);
  document.addEventListener('daybook:privacy-open', open);
  document.addEventListener('daybook:privacy-change', () => {
    if (!busy && dialog.open) { checkbox.checked = analyticsAllowed(); syncText(); }
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
    checkbox.checked = analyticsAllowed();
    failed = !saved;
    syncText();
    if (saved) close();
  }

  save.addEventListener('click', () => { void choose(checkbox.checked); });
  dialog.querySelector('[data-privacy-necessary]')!.addEventListener('click', () => { void choose(false); });
  if (document.body.dataset.statsEnabled === 'true' && !getPrivacyChoice()) open();
}
