export {};

declare global {
  interface Window {
    DaybookTransitionEngine: any;
    DaybookRouter: any;
    DaybookGraph: any;
    d3: any;
    ThemeSettings: any;
    daybookSyncThemeButtons: () => void;
    daybookSetTheme: (theme: string, remember: boolean) => void;
    daybookSetEyeCare: (enabled: boolean, remember: boolean) => void;
    daybookShouldAnimateTheme: () => boolean;
    daybookClearThemeTransition: (attributeName: string) => void;
    daybookSyncNoteTocs: (toc?: any) => void;
    initWaline: () => void;
    daybookSyncHeadingAnchors: () => void;
    daybookSyncNoteFilters: () => void;
    daybookSyncEmbeds: () => void;
    DaybookMermaid: any;
    daybookNavigateTo: (url: string) => void;
    daybookSyncPageKey: (url: string) => void;
    daybookNavigate: (url: string) => void;
    daybookInitSearch: () => void;
    daybookInitTagsFilters: () => void;
    daybookCloseMobileOverlays: () => void;
    mermaid: any;
    twttr: any;
  }

  interface DocumentEventMap {
    "daybook:before-swap": CustomEvent<{ oldUrl: string, newUrl: string }>;
    "daybook:page-load": CustomEvent<{ url: URL, navigationType: string, oldUrl: string, newUrl: string }>;
    "daybook:transition-finished": CustomEvent<{ oldUrl: string, newUrl: string }>;
  }

  interface Document {
    startViewTransition?: (callback: () => void) => {
      finished: Promise<void>;
      ready: Promise<void>;
      updateCallbackDone: Promise<void>;
      skipTransition: () => void;
    };
  }
}

declare module '*waline.js' {
  export function init(options: any): any;
}
