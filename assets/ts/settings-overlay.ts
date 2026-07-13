import { loadSettings, updateSetting, DaybookSettings } from './settings-store.js';

export function initSettingsOverlay() {
  const persistentLogo = document.querySelector('.persistent-logo');
  if (!persistentLogo) return;

  // Bind to logo once (since it's outside page-frame)
  persistentLogo.addEventListener('click', (e: Event) => {
    e.preventDefault();
    const overlay = document.getElementById('settings-overlay');
    if (!overlay) return;
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  });

  const closeOverlay = (overlay: HTMLElement) => {
    overlay.setAttribute('inert', '');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const overlay = document.getElementById('settings-overlay');
    if (!overlay || !overlay.classList.contains('is-open')) return;

    if (target.closest('[data-settings-close]')) {
      closeOverlay(overlay);
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.settings-overlay')) e.stopPropagation();
  });

  document.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('.settings-overlay')) e.stopPropagation();
  });

  document.addEventListener('touchstart', (e) => {
    if ((e.target as HTMLElement).closest('.settings-overlay')) e.stopPropagation();
  });

  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('settings-overlay');
    if (e.key === 'Escape' && overlay && overlay.classList.contains('is-open')) {
      closeOverlay(overlay);
    }
  });

  const settings = loadSettings();
  
  const setupCheckbox = (id: string, key: keyof DaybookSettings) => {
    const checkbox = document.getElementById(id) as HTMLInputElement | null;
    if (checkbox) {
      checkbox.checked = settings[key] as boolean;
      checkbox.addEventListener('change', (e) => {
        updateSetting(key, (e.target as HTMLInputElement).checked);
      });
    }
  };

  setupCheckbox('setting-system-cursor', 'useSystemCursor');
  setupCheckbox('setting-clock-cursor', 'enableClockCursor');
  setupCheckbox('setting-bg-playback', 'disableBgPlayback');
  setupCheckbox('setting-disable-comments', 'disableComments');
  setupCheckbox('setting-reduced-motion', 'reducedMotion');

  const systemCursorCheckbox = document.getElementById('setting-system-cursor') as HTMLInputElement | null;
  const clockCursorCheckbox = document.getElementById('setting-clock-cursor') as HTMLInputElement | null;
  const clockCursorLabel = document.querySelector('.setting-item-clock-cursor') as HTMLElement | null;

  if (systemCursorCheckbox && clockCursorCheckbox && clockCursorLabel) {
    const updateClockCursorState = () => {
      if (systemCursorCheckbox.checked) {
        clockCursorLabel.style.opacity = '0.5';
        clockCursorLabel.style.pointerEvents = 'none';
        clockCursorCheckbox.disabled = true;
      } else {
        clockCursorLabel.style.opacity = '1';
        clockCursorLabel.style.pointerEvents = 'auto';
        clockCursorCheckbox.disabled = false;
      }
    };
    systemCursorCheckbox.addEventListener('change', updateClockCursorState);
    updateClockCursorState();
  }

  const syncLanguage = (lang: string) => {
    // Normalize language string
    const isEn = lang.toLowerCase().startsWith('en');
    const textAttr = isEn ? 'data-i18n-en' : 'data-i18n-zh';
    const ariaAttr = isEn ? 'data-i18n-aria-en' : 'data-i18n-aria-zh';

    const overlay = document.getElementById('settings-overlay');
    if (!overlay) return;

    overlay.querySelectorAll(`[${textAttr}]`).forEach((el) => {
      const translation = el.getAttribute(textAttr);
      if (translation) el.textContent = translation;
    });

    overlay.querySelectorAll(`[${ariaAttr}]`).forEach((el) => {
      const translation = el.getAttribute(ariaAttr);
      if (translation) el.setAttribute('aria-label', translation);
    });
  };

  // Sync on initialization
  syncLanguage(document.documentElement.lang);

  // Sync on dynamic SPA language change
  document.addEventListener('daybook:lang-change', (e: any) => {
    if (e.detail && e.detail.lang) {
      syncLanguage(e.detail.lang);
    }
  });
}
