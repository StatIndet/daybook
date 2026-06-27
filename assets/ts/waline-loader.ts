// @ts-ignore
import { init } from '/vendor/waline/waline.js';

let walineInstance: any = null;

export function setupWaline() {
  const container = document.getElementById('waline');
  if (!container || document.documentElement.getAttribute('data-comments-disabled') === 'true') {
    if (walineInstance) {
      walineInstance.destroy();
      walineInstance = null;
    }
    if (container) {
      container.style.display = document.documentElement.getAttribute('data-comments-disabled') === 'true' ? 'none' : '';
    }
    return;
  }
  
  container.style.display = '';

  if (walineInstance) {
    walineInstance.destroy();
    walineInstance = null;
  }
  const config = {
    serverURL: container.dataset['serverUrl'],
    lang: container.dataset['lang'],
    pageSize: parseInt(container.dataset['pageSize'] || '10', 10) || 10,
    commentSorting: container.dataset['commentSorting'] || 'latest',
    search: container.dataset['search'] === 'true',
    imageUploader: container.dataset['imageUploader'] === 'true',
    path: container.dataset['path'],
  };

  try {
    walineInstance = init({
      el: '#waline',
      dark: 'html[data-theme="dark"]',
      requiredMeta: ['nick', 'mail'],
      highlighter: false,
      texRenderer: false,
      noCopyright: true,
      reaction: [],
      ...config
    });
  } catch (error) {
    console.error('[Waline] Failed to initialize:', error);
  }
}

// Global click listener for mobile adaptation of Waline RSS icon
if (typeof window !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const rssWrapper = target.closest('.wl-rss');

    if (rssWrapper) {
      if (window.matchMedia('(hover: none)').matches) {
        if (!rssWrapper.classList.contains('expanded')) {
          e.preventDefault(); // Stop navigation on first tap
          rssWrapper.classList.add('expanded');
        }
      }
    } else {
      if (window.matchMedia('(hover: none)').matches) {
        document.querySelectorAll('.wl-rss.expanded').forEach(el => {
          el.classList.remove('expanded');
        });
      }
    }
  });
}

document.addEventListener('daybook:settings-change', () => {
  setupWaline();
});
