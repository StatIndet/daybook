export function initShareOverlay() {
  const overlay = document.getElementById('share-overlay');
  if (!overlay) return;

  const closeBtns = overlay.querySelectorAll('[data-share-close]');
  const textarea = overlay.querySelector('#share-textarea') as HTMLTextAreaElement;
  const xBtn = overlay.querySelector('[data-share-x]');
  const tgBtn = overlay.querySelector('[data-share-tg]');
  const copyBtn = overlay.querySelector('[data-share-copy]');
  const copyText = overlay.querySelector('.share-copy-text');

  // Prevent multiple bindings
  if (overlay.dataset.shareBound === 'true') {
    return;
  }
  overlay.dataset.shareBound = 'true';

  function openShare(title: string, url: string, shareText: string) {
    if (!overlay || !textarea) return;

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
      const url = btn.getAttribute('data-share-url') || '';
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

  if (tgBtn) {
    tgBtn.addEventListener('click', () => {
      const text = textarea.value;
      // For Telegram, url must be explicitly empty so it doesn't duplicate the url from the text
      const url = `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  if (copyBtn && copyText) {
    copyBtn.addEventListener('click', () => {
      const text = textarea.value;
      navigator.clipboard.writeText(text).then(() => {
        const lang = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';
        const originalText = copyText.getAttribute(`data-text-copy-${lang}`) || 'Copy';
        const copiedText = copyText.getAttribute(`data-text-copied-${lang}`) || 'Copied';
        
        copyText.textContent = copiedText;
        setTimeout(() => {
          copyText.textContent = originalText;
        }, 1500);
      });
    });
  }
}
