import { animateTextChange } from "./text-roll";

export function initShareOverlay() {
  const overlay = document.getElementById('share-overlay');
  if (!overlay) return;

  const closeBtns = overlay.querySelectorAll('[data-share-close]');
  const textarea = overlay.querySelector('#share-textarea') as HTMLTextAreaElement;
  const xBtn = overlay.querySelector('[data-share-x]');
  const tgBtn = overlay.querySelector('[data-share-tg]');
  const copyBtn = overlay.querySelector('[data-share-copy]');
  const copyText = overlay.querySelector<HTMLElement>('.share-copy-text');

  // Prevent multiple bindings
  if (overlay.dataset.shareBound === 'true') {
    return;
  }
  overlay.dataset.shareBound = 'true';

  let currentShareURL = '';

  function openShare(title: string, url: string, shareText: string) {
    if (!overlay || !textarea) return;

    currentShareURL = url;
    // The backend provides shareText with {Title} already replaced.
    // We just need to append the URL on a new line.
    const defaultText = shareText + '\n' + url;
    textarea.value = defaultText;

    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeShare() {
    if (!overlay) return;
    overlay.setAttribute('inert', '');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  // Delegated click handler on document to open share dialogs
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-share-open]');
    if (btn) {
      const title = btn.getAttribute('data-share-title') || '';
      const url = btn.getAttribute('data-share-link') || '';
      const shareText = btn.getAttribute('data-share-text') || '';
      openShare(title, url, shareText);
    }
  });

  closeBtns.forEach(btn => {
    btn.addEventListener('click', closeShare);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
      closeShare();
    }
  });

  if (xBtn) {
    xBtn.addEventListener('click', () => {
      const text = textarea.value;
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  function buildTelegramPayload(text: string, shareURL: string) {
    if (!shareURL || !text.includes(shareURL)) {
      return text;
    }
    
    const idx = text.indexOf(shareURL);
    let before = text.substring(0, idx);
    let after = text.substring(idx + shareURL.length);
    
    if (before.endsWith('\n') && after.startsWith('\n')) {
      before = before.substring(0, before.length - 1);
    } else if (before.trim() === '' && after.startsWith('\n')) {
      after = after.substring(1);
    } else if (after.trim() === '' && before.endsWith('\n')) {
      before = before.substring(0, before.length - 1);
    }
    
    return (before + after).trim();
  }

  if (tgBtn) {
    tgBtn.addEventListener('click', () => {
      const text = textarea.value;
      const tgText = buildTelegramPayload(text, currentShareURL);
      const url = `https://t.me/share/url?url=${encodeURIComponent(currentShareURL)}&text=${encodeURIComponent(tgText)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  if (copyBtn && copyText) {
    copyBtn.addEventListener('click', () => {
      const text = textarea.value;
      navigator.clipboard.writeText(text).then(() => {
        const lang = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en_US' : 'zh';
        const copiedText = copyText.getAttribute(`data-text-copied-${lang}`) || 'Copied';
        
        animateTextChange(copyText, copiedText);
        
        setTimeout(() => {
          // Re-fetch language in case user changed it during the timeout
          const currentLang = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en_US' : 'zh';
          const freshOriginal = copyText.getAttribute(`data-text-copy-${currentLang}`) || 'Copy';
          animateTextChange(copyText, freshOriginal);
        }, 1500);
      });
    });
  }
}
