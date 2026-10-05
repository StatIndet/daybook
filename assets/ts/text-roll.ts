const rolls = new WeakMap<HTMLElement, { text: string; timer: number }>();

export function reducedMotion(): boolean {
  return document.documentElement.dataset.reducedMotion === 'true' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The shared Copy → Copied motion, with cancellation for rapid state changes. */
export function animateTextChange(container: HTMLElement, text: string, immediate = false, onFinish?: () => void) {
  const pending = rolls.get(container);
  const oldText = pending?.text ?? container.textContent?.trim() ?? '';
  if (pending) clearTimeout(pending.timer);
  rolls.delete(container);

  const settle = () => {
    container.textContent = text;
    container.classList.remove('text-roll-active');
    rolls.delete(container);
    onFinish?.();
  };
  if (immediate || reducedMotion() || oldText === text) {
    settle();
    return;
  }

  const oldChars = Array.from(oldText), newChars = Array.from(text);
  const length = Math.max(oldChars.length, newChars.length);
  container.replaceChildren();
  container.classList.add('text-roll-active');
  for (let i = 0; i < length; i++) {
    const wrapper = document.createElement('span');
    wrapper.className = 'text-roll-char';
    wrapper.style.setProperty('--roll-delay', `${i * 30}ms`);
    if (oldChars[i]) {
      const old = document.createElement('span');
      old.textContent = oldChars[i]!;
      old.className = 'text-roll-old';
      if (newChars[i]) old.classList.add('text-roll-overlap');
      wrapper.append(old);
    }
    if (newChars[i]) {
      const next = document.createElement('span');
      next.textContent = newChars[i]!;
      next.className = 'text-roll-new';
      wrapper.append(next);
    }
    container.append(wrapper);
  }
  rolls.set(container, { text, timer: window.setTimeout(settle, 450 + length * 30) });
}
