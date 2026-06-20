// @ts-ignore
import { init } from '/vendor/waline/waline.js';

let walineInstance: any = null;

export function setupWaline() {
  const container = document.getElementById('waline');
  if (!container) {
    if (walineInstance) {
      walineInstance.destroy();
      walineInstance = null;
    }
    return;
  }

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

