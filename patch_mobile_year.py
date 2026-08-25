import re
with open("internal/embedded/static/css/pages/archive.css", "r") as f:
    content = f.read()

content = content.replace(
    ".archive-year-row h2 {\n    margin-bottom: 1.4rem;\n  }",
    ".archive-year-row h2 {\n    margin-bottom: 1.4rem;\n    padding-left: var(--archive-list-pad, 1.2rem);\n  }"
)

with open("internal/embedded/static/css/pages/archive.css", "w") as f:
    f.write(content)
