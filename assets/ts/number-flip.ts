// All counter writers share the same transition: update the real value at once,
// then flip the previous visual away. Repeated values never restart the motion.
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
export function updateNumber(element: Element, value: string): void {
  if (!(element instanceof HTMLElement) || element.textContent === value) return;
  const previous = element.textContent || '';
  clearTimeout(timers.get(element));
  element.classList.remove('is-number-flipping');
  element.removeAttribute('data-number-previous');
  element.classList.add('number-flip');
  const current = document.createElement('span');
  current.className = 'number-flip-current';
  current.textContent = value;
  element.replaceChildren(current);
  if (!previous || !element.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reducedMotion === 'true') return;
  element.dataset.numberPrevious = previous;
  // Restart cleanly when updates arrive before the last flip has completed.
  void element.offsetWidth;
  element.classList.add('is-number-flipping');
  timers.set(element, setTimeout(() => {
    element.classList.remove('is-number-flipping');
    element.removeAttribute('data-number-previous');
    timers.delete(element);
  }, 440));
}
