import * as esbuild from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssRoot = path.join(root, 'internal', 'embedded', 'static', 'css');
const global = await readFile(path.join(cssRoot, 'global.css'), 'utf8');
const imports = [...global.matchAll(/@import\s+url\("([^"]+)"\);/g)].map(match => match[1]);
const pageImports = imports.filter(file => file.startsWith('pages/') && file !== 'pages/home.css');
const sharedMarkdown = ['markdown.css', 'components/embed-skeleton.css'];
const deferred = new Set(['pages/home.css', ...pageImports, ...sharedMarkdown, 'components/bilingual-toggle.css', 'transitions.css']);
const bundles = {
  common: [...imports.filter(file => !deferred.has(file)), 'decorative-fonts.css'],
  home: ['pages/home.css', ...sharedMarkdown, 'transitions.css'],
  pages: [...pageImports, 'components/bilingual-toggle.css', ...sharedMarkdown, 'transitions.css'],
};
await mkdir(path.join(cssRoot, 'bundles'), { recursive: true });
for (const [name, files] of Object.entries(bundles)) {
  await esbuild.build({
    stdin: { contents: files.map(file => `@import "./${file}";`).join('\n') + (name === 'common' ? '\nhtml[data-theme="dark"]{color-scheme:dark;}' : ''), resolveDir: cssRoot, loader: 'css' },
    outfile: path.join(cssRoot, 'bundles', `${name}.css`),
    bundle: true,
    minify: true,
    logLevel: 'info',
    plugins: [{
      name: 'keep-self-hosted-asset-urls',
      setup(build) {
        build.onResolve({ filter: /.*/ }, args => {
          if (args.kind !== 'url-token') return;
          if (/^(?:\/|data:|https?:)/.test(args.path)) return { path: args.path, external: true };
          const absolute = path.resolve(args.resolveDir, args.path);
          const relative = path.relative(path.join(root, 'internal', 'embedded', 'static'), absolute).split(path.sep).join('/');
          return { path: '/' + relative, external: true };
        });
      },
    }],
  });
}
