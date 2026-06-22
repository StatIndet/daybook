let scrollListenerAdded = false;
let ticking = false;
let isHidden = false;
let lastScrollY = window.scrollY;

export function initReadingControls() {
  const isNotePage = document.querySelector('.note') !== null;
  
  if (!scrollListenerAdded) {
    window.addEventListener('scroll', onScroll, { passive: true });
    scrollListenerAdded = true;
  }
  
  initDesktopHoverEffects();
  
  // Initial update
  if (isNotePage) {
    requestAnimationFrame(updateReadingControls);
  } else {
    // Reset if leaving note page
    document.body.classList.remove('mobile-top-bar-hidden');
    isHidden = false;
  }
}

function onScroll() {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      updateReadingControls();
      ticking = false;
    });
    ticking = true;
  }
}

function updateReadingControls() {
  const isNotePage = document.querySelector('.note') !== null;
  if (!isNotePage) return;

  const topBar = document.getElementById('mobile-top-bar');
  const desktopTexts = document.querySelectorAll('[data-desktop-progress-text]');
  const mobileTexts = document.querySelectorAll('[data-mobile-progress-text]');
  const controlStrips = document.querySelectorAll('.mobile-reading-controls');
  const backToTopBtns = document.querySelectorAll('.back-to-top-btn, .mobile-top-btn');
  const goToBottomBtns = document.querySelectorAll('.reading-progress-btn, .mobile-bottom-btn');
  
  // Ensure click handlers are attached once per element
  backToTopBtns.forEach(btn => {
    const htmlBtn = btn as HTMLElement;
    if (!htmlBtn.dataset.rcBound) {
      htmlBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      htmlBtn.dataset.rcBound = 'true';
    }
  });

  goToBottomBtns.forEach(btn => {
    const htmlBtn = btn as HTMLElement;
    if (!htmlBtn.dataset.rcBound) {
      htmlBtn.addEventListener('click', () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
      htmlBtn.dataset.rcBound = 'true';
    }
  });

  const currentScrollY = window.scrollY;
  const SCROLL_THRESHOLD = 80;

  if (currentScrollY <= 0) {
    document.body.classList.add('is-at-top');
  } else {
    document.body.classList.remove('is-at-top');
  }

  // 1. Calculate reading progress
  const scrollHeight = document.documentElement.scrollHeight;
  const innerHeight = window.innerHeight;
  const scrollRange = scrollHeight - innerHeight;
  
  let progress = 0;
  if (scrollRange > 0) {
    progress = Math.round((currentScrollY / scrollRange) * 100);
    progress = Math.max(0, Math.min(100, progress));
  }

  desktopTexts.forEach(el => el.textContent = `${progress}`);
  mobileTexts.forEach(el => el.textContent = `${progress}%`);
  
  const progressStr = `${progress}%`;
  controlStrips.forEach(el => {
    (el as HTMLElement).style.setProperty('--reading-progress', progressStr);
  });

  // 2. Auto-hide mobile top bar logic
  if (topBar) {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      const overlaysOpen = document.body.classList.contains('is-mobile-drawer-open') || 
                           document.body.classList.contains('is-search-overlay-open') || 
                           document.body.classList.contains('is-tags-overlay-open');
      
      if (overlaysOpen) {
        if (isHidden) {
          document.body.classList.remove('mobile-top-bar-hidden');
          isHidden = false;
        }
      } else {
        if (currentScrollY <= 0) {
          if (isHidden) {
            document.body.classList.remove('mobile-top-bar-hidden');
            isHidden = false;
          }
        } else if (currentScrollY > lastScrollY) {
          document.body.classList.add('is-scrolling-down');
          document.body.classList.remove('is-scrolling-up');
          if (currentScrollY > SCROLL_THRESHOLD && !isHidden) {
            document.body.classList.add('mobile-top-bar-hidden');
            isHidden = true;
          }
        } else if (currentScrollY < lastScrollY) {
          document.body.classList.add('is-scrolling-up');
          document.body.classList.remove('is-scrolling-down');
          if (isHidden) {
            document.body.classList.remove('mobile-top-bar-hidden');
            isHidden = false;
          }
        }
      }
    } else {
      if (isHidden) {
        document.body.classList.remove('mobile-top-bar-hidden');
        isHidden = false;
      }
    }
  }

  lastScrollY = currentScrollY;
}

function initDesktopHoverEffects() {
  const btns = document.querySelectorAll('.reading-control-btn') as NodeListOf<HTMLElement>;
  
  btns.forEach(btn => {
    if (btn.dataset.hoverBound) return;
    btn.dataset.hoverBound = 'true';

    btn.addEventListener('mouseenter', (e: MouseEvent) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      btn.style.setProperty('--pointer-x', `${x}px`);
      btn.style.setProperty('--pointer-y', `${y}px`);
      
      // Force reflow
      void btn.offsetHeight;
      
      btn.classList.add('is-hovered');
    });

    btn.addEventListener('mouseleave', (e: MouseEvent) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      btn.style.setProperty('--pointer-x', `${x}px`);
      btn.style.setProperty('--pointer-y', `${y}px`);
      
      btn.classList.remove('is-hovered');
    });
  });
}
