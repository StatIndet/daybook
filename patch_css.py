import re

with open("internal/embedded/static/css/pages/archive.css", "r") as f:
    content = f.read()

prefix = content[:content.find("/* Virtual List Flattened Styles */")]

new_css = """/* Virtual List Flattened Styles */
.archive-virtual-list {
  position: relative;
  min-width: 0;
}
.archive-virtual-row {
  display: grid;
  gap: clamp(1.6rem, 4vw, 2.4rem);
  grid-template-columns: 5.2rem minmax(0, 1fr);
  position: relative;
}
.archive-year-row {
  padding-top: clamp(2.8rem, 6vw, 4.5rem);
}
.archive-year-row.is-first-year {
  padding-top: 0;
}
.archive-year-row h2 {
  color: var(--color-text);
  font-family: var(--font-meta);
  font-size: clamp(1.35rem, 2.6vw, 1.75rem);
  font-style: italic;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
  grid-column: 1;
}

.archive-item-track {
  --archive-dot-size: 9px;
  --archive-list-pad: 1.45rem;
  border-left: 1px solid var(--color-line);
  padding: 0 0 1.9rem var(--archive-list-pad);
  grid-column: 2;
  position: relative;
  height: 100%;
}
/* For mobile spacing override */
@media (max-width: 640px) {
  .archive-item-track {
    --archive-list-pad: 1.2rem;
  }
}

/* Adjust .archive-item which is now inside .archive-item-track */
.archive-item-track .archive-item {
  display: grid;
  gap: clamp(0.9rem, 3vw, 1.35rem);
  grid-template-columns: 4.2rem minmax(0, 1fr);
  position: relative;
  opacity: 1;
  transform: none;
}

.archive-item-row.is-pending-reveal .archive-item {
  opacity: 0;
}
.archive-item-row.is-seen .archive-item {
  opacity: 1 !important;
  animation: none !important;
  transform: none !important;
}

/* Mobile overrides for flattened rows */
@media (max-width: 640px) {
  .archive-virtual-row {
    display: block;
  }
  .archive-year-row h2 {
    margin-bottom: 1.4rem;
  }
}
"""

with open("internal/embedded/static/css/pages/archive.css", "w") as f:
    f.write(prefix + new_css)
