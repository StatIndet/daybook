import re
with open("assets/ts/daybook-router.ts", "r") as f:
    content = f.read()

replacement = """  (window as any).daybookNavigate = (url: string) => navigate(url);
  (window as any).daybookNavigateTo = (url: string) => navigate(url);

  (window as any).daybookReplaceURL = (urlStr: string) => {
    const url = new URL(urlStr, location.origin);
    const current = history.state;
    if (isRouterState(current)) {
      history.replaceState(
        {
          ...current,
          url: url.href
        },
        "",
        url.href
      );
    } else {
      history.replaceState({
        __daybook: true,
        index: currentIndex,
        url: url.href,
        fromUrl: null,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      } as RouterState, "", url.href);
    }
    currentRouterUrl = url.href;
  };

  initRouter();"""

content = content.replace("  (window as any).daybookNavigate = (url: string) => navigate(url);\n  (window as any).daybookNavigateTo = (url: string) => navigate(url);\n\n  initRouter();", replacement)

with open("assets/ts/daybook-router.ts", "w") as f:
    f.write(content)
