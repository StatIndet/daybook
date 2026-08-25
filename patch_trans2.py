import re
with open("internal/embedded/static/css/transitions.css", "r") as f:
    content = f.read()

content = content.replace(
"""  .archive-item-row.is-intro-revealing .archive-item {
    animation: archive-intro-fade-up 380ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    animation-delay: calc(var(--stagger-index, 0) * 55ms);
  }
  .archive-item-row.reveal-trigger .archive-item {
    animation: archive-intro-fade-up 380ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    animation-delay: calc(var(--stagger-index, 0) * 55ms);
  }""",
"""  .archive-item-row.is-intro-revealing .archive-item {
    opacity: 1;
    animation: archive-intro-fade-up 380ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    animation-delay: calc(var(--stagger-index, 0) * 55ms);
  }
  .archive-item-row.reveal-trigger .archive-item {
    opacity: 1;
    animation: archive-intro-fade-up 380ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
    animation-delay: calc(var(--stagger-index, 0) * 55ms);
  }""")

with open("internal/embedded/static/css/transitions.css", "w") as f:
    f.write(content)
