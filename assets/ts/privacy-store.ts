export interface PrivacyChoice { analytics: boolean }
export const PRIVACY_KEY = 'daybook:privacy:v1';

function readChoice(): PrivacyChoice | null {
  try {
    const value = JSON.parse(localStorage.getItem(PRIVACY_KEY) || 'null');
    return typeof value?.analytics === 'boolean' ? { analytics: value.analytics } : null;
  } catch { return null; }
}

let choice = readChoice();
let synchronization: Promise<boolean> | null = null;

export function getPrivacyChoice(): PrivacyChoice | null { return choice; }
export function analyticsAllowed(): boolean { return choice?.analytics === true; }

function synchronize(): Promise<boolean> {
  const previous = synchronization;
  const analytics = analyticsAllowed();
  synchronization = (async () => {
    await previous;
    if (document.body.dataset.statsEnabled !== 'true') return true;
    try {
      const response = await fetch('/api/privacy', {
        method: 'PUT', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics }), signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return false;
      const result = await response.json();
      return result.version === 1 && result.analytics === analytics;
    } catch { return false; }
  })();
  return synchronization;
}

// Every runtime API waits for cookie cleanup/consent synchronization. Older
// Workers without this protocol fail closed instead of creating visitor IDs.
export async function privacyReady(): Promise<boolean> {
  if (!synchronization) synchronize();
  let pending: Promise<boolean> | null;
  let ready: boolean;
  do {
    pending = synchronization;
    ready = await pending!;
  } while (pending !== synchronization);
  return ready;
}

export async function savePrivacyChoice(analytics: boolean): Promise<boolean> {
  choice = { analytics };
  try { localStorage.setItem(PRIVACY_KEY, JSON.stringify(choice)); } catch {}
  const ready = await synchronize();
  document.dispatchEvent(new CustomEvent('daybook:privacy-change'));
  return ready;
}

window.addEventListener('storage', event => {
  if (event.key !== PRIVACY_KEY && event.key !== null) return;
  choice = readChoice();
  void synchronize().then(() => document.dispatchEvent(new CustomEvent('daybook:privacy-change')));
});
