// Use the site's tooltip skin outside the home's scrolling cards so hints are
// never clipped by the README or contribution calendar.
export function initHomeTooltips(): void {
  const tooltip = document.createElement("span");
  tooltip.id = "home-tooltip";
  tooltip.className = "floating-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  document.body.append(tooltip);
  let active: HTMLElement | null = null;
  let previousDescription: string | null = null;

  function hide(): void {
    tooltip.classList.remove("is-visible");
    tooltip.setAttribute("aria-hidden", "true");
    if (active) {
      if (previousDescription === null) active.removeAttribute("aria-describedby");
      else active.setAttribute("aria-describedby", previousDescription);
    }
    active = null;
  }

  function normalize(): void {
    hide();
    // Upstream Markdown can contain native title attributes too.
    document.querySelectorAll<HTMLElement>("[data-github-home] [title]").forEach(element => {
      element.dataset.tooltip = element.getAttribute("title") || "";
      element.removeAttribute("title");
    });
  }

  function position(element: HTMLElement): void {
    const target = element.getBoundingClientRect();
    if (target.bottom < 0 || target.top > innerHeight || target.right < 0 || target.left > innerWidth) {
      hide();
      return;
    }
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const x = Math.max(8, Math.min(target.left + target.width / 2 - width / 2, innerWidth - width - 8));
    const below = target.bottom + 9;
    const y = below + height <= innerHeight - 8 ? below : Math.max(8, target.top - height - 9);
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  function show(element: HTMLElement): void {
    const text = element.dataset.tooltip;
    if (!text || element === active) return;
    hide();
    active = element;
    previousDescription = element.getAttribute("aria-describedby");
    element.setAttribute("aria-describedby", [previousDescription, tooltip.id].filter(Boolean).join(" "));
    tooltip.textContent = text;
    position(element);
    if (!active) return;
    tooltip.setAttribute("aria-hidden", "false");
    tooltip.classList.add("is-visible");
  }

  const source = (target: EventTarget | null) => target instanceof Element
    ? target.closest<HTMLElement>("[data-github-home] [data-tooltip]") : null;
  document.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    const element = source(event.target);
    if (element) show(element);
  });
  document.addEventListener("pointerout", event => {
    if (active && source(event.target) === active && source(event.relatedTarget) !== active) hide();
  });
  document.addEventListener("focusin", event => {
    const element = source(event.target);
    if (element) show(element);
  });
  document.addEventListener("focusout", event => { if (source(event.target) === active) hide(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
  const reposition = () => {
    if (!active) return;
    if (active.matches(":hover") || document.activeElement === active) position(active);
    else hide();
  };
  document.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  document.addEventListener("daybook:before-swap", hide);
  document.addEventListener("daybook:page-load", normalize);
  normalize();
}
