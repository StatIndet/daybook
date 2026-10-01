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

// assets/ts/settings-overlay.ts
function initSettingsOverlay() {
  const persistentLogo = document.querySelector(".persistent-logo");
  if (!persistentLogo) return;
  persistentLogo.addEventListener("click", (e) => {
    e.preventDefault();
    const overlay = document.getElementById("settings-overlay");
    if (!overlay) return;
    overlay.removeAttribute("inert");
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
  });
  const closeOverlay = (overlay) => {
    overlay.setAttribute("inert", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  };
  document.addEventListener("click", (e) => {
    const target = e.target;
    const overlay = document.getElementById("settings-overlay");
    if (!overlay || !overlay.classList.contains("is-open")) return;
    if (target.closest("[data-settings-close]")) {
      closeOverlay(overlay);
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".settings-overlay")) e.stopPropagation();
  });
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest(".settings-overlay")) e.stopPropagation();
  });
  document.addEventListener("touchstart", (e) => {
    if (e.target.closest(".settings-overlay")) e.stopPropagation();
  });
  document.addEventListener("keydown", (e) => {
    const overlay = document.getElementById("settings-overlay");
    if (e.key === "Escape" && overlay && overlay.classList.contains("is-open")) {
      closeOverlay(overlay);
    }
  });
  const settings = loadSettings();
  const setupCheckbox = (id, key) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.checked = settings[key];
      checkbox.addEventListener("change", (e) => {
        updateSetting(key, e.target.checked);
      });
    }
  };
  setupCheckbox("setting-system-cursor", "useSystemCursor");
  setupCheckbox("setting-clock-cursor", "enableClockCursor");
  setupCheckbox("setting-disable-comments", "disableComments");
  setupCheckbox("setting-reduced-motion", "reducedMotion");
  const systemCursorCheckbox = document.getElementById("setting-system-cursor");
  const clockCursorCheckbox = document.getElementById("setting-clock-cursor");
  const clockCursorLabel = document.querySelector(".setting-item-clock-cursor");
  if (systemCursorCheckbox && clockCursorCheckbox && clockCursorLabel) {
    const updateClockCursorState = () => {
      if (systemCursorCheckbox.checked) {
        clockCursorLabel.style.opacity = "0.5";
        clockCursorLabel.style.pointerEvents = "none";
        clockCursorCheckbox.disabled = true;
      } else {
        clockCursorLabel.style.opacity = "1";
        clockCursorLabel.style.pointerEvents = "auto";
        clockCursorCheckbox.disabled = false;
      }
    };
    systemCursorCheckbox.addEventListener("change", updateClockCursorState);
    updateClockCursorState();
  }
  const syncLanguage = (lang) => {
    const isEn = lang.toLowerCase().startsWith("en");
    const textAttr = isEn ? "data-i18n-en" : "data-i18n-zh";
    const ariaAttr = isEn ? "data-i18n-aria-en" : "data-i18n-aria-zh";
    document.body.querySelectorAll(`[${textAttr}]`).forEach((el) => {
      const translation = el.getAttribute(textAttr);
      if (translation) el.textContent = translation;
    });
    document.body.querySelectorAll(`[${ariaAttr}]`).forEach((el) => {
      const translation = el.getAttribute(ariaAttr);
      if (translation) el.setAttribute("aria-label", translation);
    });
  };
  syncLanguage(document.documentElement.lang);
  document.addEventListener("daybook:lang-change", (e) => {
    if (e.detail && e.detail.lang) {
      syncLanguage(e.detail.lang);
    }
  });
}
export {
  initSettingsOverlay
};
