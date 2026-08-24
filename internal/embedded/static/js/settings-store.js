// assets/ts/settings-store.ts
var STORAGE_KEY = "daybook:user-settings";
var DEFAULT_SETTINGS = {
  useSystemCursor: false,
  enableClockCursor: true,
  disableComments: false,
  reducedMotion: false
};
var currentSettings = { ...DEFAULT_SETTINGS };
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error("[Daybook] Failed to parse settings from localStorage", e);
  }
  return currentSettings;
}
function getSettings() {
  return currentSettings;
}
function updateSetting(key, value) {
  currentSettings[key] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
  } catch (e) {
    console.error("[Daybook] Failed to save settings to localStorage", e);
  }
  syncSettingsToDOM();
  document.dispatchEvent(new CustomEvent("daybook:settings-change", { detail: currentSettings }));
}
function syncSettingsToDOM() {
  const html = document.documentElement;
  if (currentSettings.useSystemCursor) {
    html.setAttribute("data-use-system-cursor", "true");
  } else {
    html.removeAttribute("data-use-system-cursor");
  }
  if (currentSettings.enableClockCursor) {
    html.setAttribute("data-clock-cursor", "true");
  } else {
    html.removeAttribute("data-clock-cursor");
  }
  if (currentSettings.disableComments) {
    html.setAttribute("data-comments-disabled", "true");
  } else {
    html.removeAttribute("data-comments-disabled");
  }
  if (currentSettings.reducedMotion) {
    html.setAttribute("data-reduced-motion", "true");
  } else {
    html.removeAttribute("data-reduced-motion");
  }
}
loadSettings();
syncSettingsToDOM();
document.addEventListener("daybook:settings-change", (e) => {
  const customEvent = e;
  if (customEvent.detail) {
    currentSettings = { ...currentSettings, ...customEvent.detail };
  }
});
export {
  getSettings,
  loadSettings,
  syncSettingsToDOM,
  updateSetting
};
//# sourceMappingURL=settings-store.js.map
