export interface GraphSettings {
  query: string;
  showTags: boolean;
  showAttachments: boolean;
  existingOnly: boolean;
  showOrphans: boolean;
  arrows: boolean;
  textFade: number;
  nodeSize: number;
  lineWidth: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

const SETTINGS_VERSION = 1;

export function defaultSettings(): GraphSettings {
  return {
    query: '',
    showTags: false,
    showAttachments: false,
    existingOnly: true,
    showOrphans: true,
    arrows: false,
    textFade: 0,
    nodeSize: 1,
    lineWidth: 1,
    centerForce: 1,
    repelForce: 1,
    linkForce: 1,
    linkDistance: 120,
  };
}

/** Share preferences across graph locales, but never across site subdirectories. */
export function settingsStorageKey(pathname: string = window.location.pathname): string {
  const sitePath = pathname.replace(/\/graph\/?$/, '').replace(/\/(?:en_US|zh_CN)$/, '').replace(/\/$/, '');
  return `daybook:graph:${sitePath || '/'}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Treat stored data as untrusted: stale or malformed values cannot reach D3. */
export function validateSettings(value: unknown): GraphSettings {
  const settings = defaultSettings();
  if (!isRecord(value)) return settings;
  if (typeof value.query === 'string') settings.query = value.query;
  for (const key of ['showTags', 'showAttachments', 'existingOnly', 'showOrphans', 'arrows'] as const) {
    if (typeof value[key] === 'boolean') settings[key] = value[key];
  }
  const ranges = {
    textFade: [-1, 1], nodeSize: [0.25, 3], lineWidth: [0.25, 3],
    centerForce: [0, 3], repelForce: [0, 3], linkForce: [0, 3], linkDistance: [30, 400],
  } as const;
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      settings[key] = Math.min(ranges[key][1], Math.max(ranges[key][0], candidate));
    }
  }
  return settings;
}

export function loadSettings(key: string): GraphSettings {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultSettings();
    const record: unknown = JSON.parse(raw);
    if (!isRecord(record) || record.version !== SETTINGS_VERSION) return defaultSettings();
    return validateSettings(record.settings);
  } catch {
    // Private browsing, disabled storage, and malformed JSON still allow using the graph.
    return defaultSettings();
  }
}

export function saveSettings(key: string, state: GraphSettings): void {
  try {
    localStorage.setItem(key, JSON.stringify({ version: SETTINGS_VERSION, settings: validateSettings(state) }));
  } catch {
    // Persistence is optional; the caller's in-memory state remains authoritative.
  }
}
