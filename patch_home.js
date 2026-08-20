const fs = require('fs');
let css = fs.readFileSync('internal/embedded/static/css/pages/home.css', 'utf-8');
css = css.replace(/\.hero-avatar-wrap\s*\{[^}]*\}/, `.hero-avatar-wrap {
  flex: 0 0 auto;
  aspect-ratio: 1;
  border-radius: 50%;
  height: var(--hero-avatar-size);
  width: var(--hero-avatar-size);
  background-color: var(--color-surface-variant);
  box-shadow: var(--shadow-avatar);
  view-transition-name: site-avatar;
}`);
css = css.replace(/\.hero-avatar\s*\{[^}]*\}/, `.hero-avatar {
  border-radius: inherit;
  display: block;
  height: 100%;
  object-fit: cover;
  width: 100%;
}`);
css = css.replace(/\.hero-avatar\s*\{([^}]*)height:\s*var\(--hero-avatar-size-mobile\);([^}]*)\}/g, `.hero-avatar-wrap {$1height: var(--hero-avatar-size-mobile);$2}`); // Fix mobile query
fs.writeFileSync('internal/embedded/static/css/pages/home.css', css);
