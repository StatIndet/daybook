function setupKatex() {
  const mathElements = document.querySelectorAll('.math-inline, .math-display');
  if (mathElements.length === 0) return;

  if (!(window as any).katex) {
    if ((window as any).katexLoading) return;
    (window as any).katexLoading = true;
    const script = document.createElement('script');
    script.src = '/vendor/katex/katex.js';
    script.onload = () => {
      (window as any).katexLoading = false;
      renderAllMath(document.querySelectorAll('.math-inline, .math-display'));
    };
    document.head.appendChild(script);

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/vendor/katex/katex.min.css';
    document.head.appendChild(link);
  } else {
    renderAllMath(mathElements);
  }
}

function renderAllMath(elements: NodeListOf<Element>) {
  const katex = (window as any).katex;
  elements.forEach((el) => {
    if (el.getAttribute('data-rendered') === 'true') return;
    const tex = el.textContent || '';
    const isDisplay = el.classList.contains('math-display');
    const rawTex = isDisplay ? tex.replace(/^\$\$/, '').replace(/\$\$$/, '') : tex.replace(/^\\\(/, '').replace(/\\\)$/, '');
    try {
      katex.render(rawTex, el as HTMLElement, {
        displayMode: isDisplay,
        throwOnError: false
      });
      el.setAttribute('data-rendered', 'true');
    } catch (e) {
      console.error('KaTeX render error:', e);
    }
  });
}

document.addEventListener('daybook:page-load', () => {
  setupKatex();
});

document.addEventListener('daybook:article-content-swapped', () => {
  setupKatex();
});
