"use strict";
(() => {
  // assets/ts/code-copy.ts
  (function() {
    var resetDelay = 1400;
    function setButtonState(button, iconName) {
      const icon = button.querySelector(".material-symbol");
      if (icon) {
        icon.textContent = iconName;
      }
    }
    function fallbackCopy(text) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        return true;
      } finally {
        textarea.remove();
      }
    }
    async function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return fallbackCopy(text);
    }
    document.addEventListener("click", async function(event) {
      const target = event.target;
      const button = target.closest(".code-copy-button");
      if (!button) {
        return;
      }
      const block = button.closest(".highlight");
      const code = block && block.querySelector("pre code");
      if (!code) {
        return;
      }
      try {
        await copyText(code.textContent);
      } catch (error) {
        return;
      }
      window.clearTimeout(button._daybookCopyTimer);
      button.classList.add("is-copied");
      setButtonState(button, "check");
      button._daybookCopyTimer = window.setTimeout(function() {
        button.classList.remove("is-copied");
        setButtonState(button, "content_copy");
      }, resetDelay);
    });
  })();
})();
