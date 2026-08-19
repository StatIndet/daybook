// assets/ts/settings-overlay.ts
import { loadSettings, updateSetting } from "../../../../assets/ts/settings-store.js";
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
//# sourceMappingURL=settings-overlay.js.map
