export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };
export type HSV = { h: number; s: number; v: number };

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const hue = (value: number): number => ((value % 360) + 360) % 360;

export function normalizeHex(value: string): string | null {
  const clean = value.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(clean)) return `#${clean.toUpperCase()}`;
  if (/^[\da-f]{3}$/i.test(clean)) return `#${Array.from(clean, (char) => char + char).join('').toUpperCase()}`;
  return null;
}

export function hexToRGB(value: string): RGB {
  const normalized = normalizeHex(value);
  if (!normalized) throw new Error('Invalid color');
  return { r: parseInt(normalized.slice(1, 3), 16), g: parseInt(normalized.slice(3, 5), 16), b: parseInt(normalized.slice(5, 7), 16) };
}

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function rgbToHSV({ r, g, b }: RGB): HSV {
  const [red, green, blue] = [r / 255, g / 255, b / 255] as [number, number, number];
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
  let h = 0;
  if (delta) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }
  return { h: hue(h), s: max ? delta / max * 100 : 0, v: max * 100 };
}

export function hsvToRGB({ h, s, v }: HSV): RGB {
  const chroma = clamp(v, 0, 100) / 100 * clamp(s, 0, 100) / 100;
  const hPrime = hue(h) / 60, x = chroma * (1 - Math.abs(hPrime % 2 - 1));
  const channels = hPrime < 1 ? [chroma, x, 0] : hPrime < 2 ? [x, chroma, 0]
    : hPrime < 3 ? [0, chroma, x] : hPrime < 4 ? [0, x, chroma]
      : hPrime < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const offset = clamp(v, 0, 100) / 100 - chroma;
  const [r, g, b] = channels.map((channel) => (channel + offset) * 255) as [number, number, number];
  return { r, g, b };
}

export function rgbToHSL(rgb: RGB): HSL {
  const hsv = rgbToHSV(rgb);
  const max = hsv.v / 100, min = max * (1 - hsv.s / 100), lightness = (max + min) / 2;
  return { h: hsv.h, s: max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1)) * 100, l: lightness * 100 };
}

export function hslToRGB({ h, s, l }: HSL): RGB {
  const lightness = clamp(l, 0, 100) / 100;
  const value = lightness + clamp(s, 0, 100) / 100 * Math.min(lightness, 1 - lightness);
  return hsvToRGB({ h, s: value === 0 ? 0 : 2 * (1 - lightness / value) * 100, v: value * 100 });
}

export interface ColorPickerLabels {
  rgb?: string;
  hsl?: string;
  hex?: string;
  eyedropper?: string;
  square?: string;
  hue?: string;
  format?: string;
  invalid?: string;
}

interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
}

/** Mount an accessible, self-contained color editor. Destroy it when its group is removed. */
export function createColorPicker(
  host: HTMLElement,
  initialHex: string,
  onChange: (hex: string) => void,
  labels: ColorPickerLabels = {},
): { destroy(): void } {
  const english = document.documentElement.lang.startsWith('en');
  const text = {
    rgb: 'RGB', hsl: 'HSL', hex: 'HEX',
    eyedropper: english ? 'Pick a screen color' : '吸取屏幕颜色',
    square: english ? 'Saturation and brightness. Use arrow keys to adjust.' : '饱和度与亮度，使用方向键调整',
    hue: english ? 'Hue' : '色相', format: english ? 'Color format' : '颜色格式',
    invalid: english ? 'Enter a valid color value.' : '请输入有效的颜色值。',
    ...labels,
  };
  const abort = new AbortController();
  let fieldAbort = new AbortController();
  let destroyed = false;
  let hex = normalizeHex(initialHex) || '#E05252';
  let hsv = rgbToHSV(hexToRGB(hex));
  let mode: 'hex' | 'rgb' | 'hsl' = 'hex';
  let inputs: HTMLInputElement[] = [];
  let activePointer: number | null = null;
  const root = document.createElement('div');
  root.className = 'graph-color-picker';
  const square = document.createElement('div');
  square.className = 'graph-color-square';
  square.tabIndex = 0;
  square.setAttribute('role', 'slider');
  square.setAttribute('aria-label', text.square);
  square.setAttribute('aria-valuemin', '0');
  square.setAttribute('aria-valuemax', '100');
  square.style.touchAction = 'none';
  const cursor = document.createElement('span');
  cursor.className = 'graph-color-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  square.append(cursor);
  const row = document.createElement('div');
  row.className = 'graph-color-row';
  const preview = document.createElement('span');
  preview.className = 'graph-color-preview';
  preview.setAttribute('aria-hidden', 'true');
  const hueInput = document.createElement('input');
  hueInput.className = 'graph-color-hue';
  hueInput.type = 'range';
  hueInput.min = '0'; hueInput.max = '360'; hueInput.step = '1';
  hueInput.setAttribute('aria-label', text.hue);
  row.append(preview, hueInput);
  const format = document.createElement('select');
  format.className = 'graph-color-format';
  format.setAttribute('aria-label', text.format);
  for (const key of ['hex', 'rgb', 'hsl'] as const) {
    const option = document.createElement('option');
    option.value = key; option.textContent = text[key]; format.append(option);
  }
  const fields = document.createElement('div');
  fields.className = 'graph-color-fields';
  const status = document.createElement('span');
  status.className = 'graph-color-status';
  status.setAttribute('role', 'status');
  root.append(square, row, format, fields, status);
  host.append(root);

  function render(source?: HTMLInputElement): void {
    square.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h} 100% 50%)`;
    cursor.style.left = `${hsv.s}%`; cursor.style.top = `${100 - hsv.v}%`;
    square.setAttribute('aria-valuenow', String(Math.round(hsv.s)));
    square.setAttribute('aria-valuetext', english
      ? `${Math.round(hsv.s)}% saturation, ${Math.round(hsv.v)}% brightness`
      : `饱和度 ${Math.round(hsv.s)}%，亮度 ${Math.round(hsv.v)}%`);
    hueInput.value = String(Math.round(hsv.h));
    preview.style.backgroundColor = hex;
    const rgb = hexToRGB(hex), hsl = rgbToHSL(rgb);
    // Preserve the selected hue when a color becomes achromatic.
    if (!hsl.s) hsl.h = hsv.h;
    const values = mode === 'hex' ? [hex] : mode === 'rgb'
      ? [rgb.r, rgb.g, rgb.b].map(String)
      : [hsl.h, hsl.s, hsl.l].map((value) => String(Math.round(value * 10) / 10));
    inputs.forEach((input, index) => {
      if (input !== source) input.value = values[index] || '';
      input.removeAttribute('aria-invalid');
    });
    status.textContent = '';
  }

  function publish(source?: HTMLInputElement): void {
    const next = rgbToHex(hsvToRGB(hsv));
    const changed = next !== hex;
    hex = next;
    render(source);
    if (changed) onChange(hex);
  }

  function useRGB(rgb: RGB, source?: HTMLInputElement): void {
    const nextHSV = rgbToHSV(rgb);
    if (nextHSV.s === 0) nextHSV.h = hsv.h;
    hsv = nextHSV;
    publish(source);
  }

  function updateField(source: HTMLInputElement): void {
    if (mode === 'hex') {
      const next = normalizeHex(source.value);
      if (next) { useRGB(hexToRGB(next), source); return; }
    } else {
      const values = inputs.map((input) => input.value.trim() === '' ? NaN : Number(input.value));
      const limits = mode === 'rgb' ? [255, 255, 255] : [360, 100, 100];
      if (values.every((value, i) => Number.isFinite(value) && value >= 0 && value <= limits[i]!)) {
        const [a, b, c] = values as [number, number, number];
        if (mode === 'rgb') useRGB({ r: a, g: b, b: c }, source);
        else {
          hsv.h = hue(a);
          useRGB(hslToRGB({ h: a, s: b, l: c }), source);
        }
        return;
      }
    }
    source.setAttribute('aria-invalid', 'true');
    status.textContent = text.invalid;
  }

  function buildFields(): void {
    fieldAbort.abort();
    fieldAbort = new AbortController();
    fields.replaceChildren();
    inputs = [];
    const names = mode === 'hex' ? ['HEX'] : mode === 'rgb' ? ['R', 'G', 'B'] : ['H°', 'S%', 'L%'];
    names.forEach((name, index) => {
      const label = document.createElement('label');
      label.className = 'graph-color-field';
      const input = document.createElement('input');
      input.className = 'graph-color-input';
      input.type = mode === 'hex' ? 'text' : 'number';
      input.setAttribute('aria-label', name);
      input.autocomplete = 'off'; input.spellcheck = false;
      if (mode === 'hex') { input.maxLength = 7; input.placeholder = '#E05252'; }
      else {
        input.min = '0'; input.max = mode === 'rgb' ? '255' : index === 0 ? '360' : '100';
        input.step = mode === 'rgb' ? '1' : '0.1';
      }
      input.addEventListener('input', () => updateField(input), { signal: fieldAbort.signal });
      input.addEventListener('change', () => { updateField(input); if (!input.hasAttribute('aria-invalid')) render(); }, { signal: fieldAbort.signal });
      label.append(input, document.createTextNode(name)); fields.append(label); inputs.push(input);
    });
    render();
  }

  function pointerPosition(event: PointerEvent): void {
    const rect = square.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    hsv.s = clamp((event.clientX - rect.left) / rect.width * 100, 0, 100);
    hsv.v = clamp(100 - (event.clientY - rect.top) / rect.height * 100, 0, 100);
    publish();
  }
  square.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    activePointer = event.pointerId;
    square.setPointerCapture(event.pointerId); square.focus(); pointerPosition(event);
  }, { signal: abort.signal });
  square.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointer) pointerPosition(event);
  }, { signal: abort.signal });
  square.addEventListener('pointerup', () => { activePointer = null; }, { signal: abort.signal });
  square.addEventListener('pointercancel', () => { activePointer = null; }, { signal: abort.signal });
  square.addEventListener('lostpointercapture', () => { activePointer = null; }, { signal: abort.signal });
  square.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case 'ArrowLeft': hsv.s = clamp(hsv.s - step, 0, 100); break;
      case 'ArrowRight': hsv.s = clamp(hsv.s + step, 0, 100); break;
      case 'ArrowDown': hsv.v = clamp(hsv.v - step, 0, 100); break;
      case 'ArrowUp': hsv.v = clamp(hsv.v + step, 0, 100); break;
      case 'Home': hsv.s = 0; break;
      case 'End': hsv.s = 100; break;
      default: return;
    }
    event.preventDefault(); publish();
  }, { signal: abort.signal });
  hueInput.addEventListener('input', () => { hsv.h = Number(hueInput.value); publish(); }, { signal: abort.signal });
  format.addEventListener('change', () => { mode = format.value as typeof mode; buildFields(); }, { signal: abort.signal });
  const EyeDropperAPI = (window as Window & { EyeDropper?: new () => EyeDropperInstance }).EyeDropper;
  if (window.isSecureContext && EyeDropperAPI) {
    const eyedropper = document.createElement('button');
    eyedropper.type = 'button'; eyedropper.className = 'graph-color-eyedropper';
    eyedropper.textContent = text.eyedropper;
    eyedropper.addEventListener('click', async () => {
      eyedropper.disabled = true;
      try {
        const color = await new EyeDropperAPI().open({ signal: abort.signal });
        if (!destroyed && normalizeHex(color.sRGBHex)) useRGB(hexToRGB(color.sRGBHex));
      } catch {
        // Escape cancels the browser's screen picker without changing the color.
      } finally {
        if (!destroyed) eyedropper.disabled = false;
      }
    }, { signal: abort.signal });
    root.append(eyedropper);
  }
  buildFields();
  return { destroy(): void { destroyed = true; abort.abort(); fieldAbort.abort(); root.remove(); } };
}
