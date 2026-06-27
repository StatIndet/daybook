export interface DaybookSettings {
  useSystemCursor: boolean;
  disableBackgroundPlayback: boolean;
  disableComments: boolean;
  disableTitleTransition: boolean;
}

const STORAGE_KEY = 'daybook:user-settings';

const DEFAULT_SETTINGS: DaybookSettings = {
  useSystemCursor: false,
  disableBackgroundPlayback: false,
  disableComments: false,
  disableTitleTransition: false
};

let currentSettings: DaybookSettings = { ...DEFAULT_SETTINGS };

export function loadSettings(): DaybookSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('[Daybook] Failed to parse settings from localStorage', e);
  }
  return currentSettings;
}

export function getSettings(): DaybookSettings {
  return currentSettings;
}

export function updateSetting<K extends keyof DaybookSettings>(key: K, value: DaybookSettings[K]) {
  currentSettings[key] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
  } catch (e) {
    console.error('[Daybook] Failed to save settings to localStorage', e);
  }
  
  syncSettingsToDOM();
  document.dispatchEvent(new CustomEvent('daybook:settings-change', { detail: currentSettings }));
}

export function syncSettingsToDOM() {
  const html = document.documentElement;
  if (currentSettings.useSystemCursor) {
    html.setAttribute('data-use-system-cursor', 'true');
  } else {
    html.removeAttribute('data-use-system-cursor');
  }

  if (currentSettings.disableComments) {
    html.setAttribute('data-comments-disabled', 'true');
  } else {
    html.removeAttribute('data-comments-disabled');
  }

  if (currentSettings.disableTitleTransition) {
    html.setAttribute('data-title-transition-disabled', 'true');
  } else {
    html.removeAttribute('data-title-transition-disabled');
  }
}

// Ensure state is loaded and synced when module initializes
loadSettings();
syncSettingsToDOM();
