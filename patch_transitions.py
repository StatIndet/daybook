import re

with open("internal/embedded/static/css/transitions.css", "r") as f:
    content = f.read()

old_block = """  body.page-entering .archive-item {
    animation: archive-intro-fade-up 380ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    animation-delay: calc(var(--stagger-index, var(--i, 0)) * 55ms);
  }
  .reveal-trigger .archive-item {
    animation: archive-intro-fade-up 380ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    animation-delay: calc((var(--stagger-index, 0) % 15) * 55ms); /* limit max delay */
  }
}

body.page-entering .archive-item {
  opacity: 0;
}"""

new_block = """  .archive-item-row.is-intro-revealing .archive-item {
    animation: archive-intro-fade-up 380ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    animation-delay: calc(var(--stagger-index, 0) * 55ms);
  }
  .archive-item-row.reveal-trigger .archive-item {
    animation: archive-intro-fade-up 380ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    animation-delay: calc(var(--stagger-index, 0) * 55ms);
  }
}"""
content = content.replace(old_block, new_block)

with open("internal/embedded/static/css/transitions.css", "w") as f:
    f.write(content)
