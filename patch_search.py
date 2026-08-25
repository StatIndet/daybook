import re
with open("assets/ts/search-engine.ts", "r") as f:
    content = f.read()

content = content.replace(
    "const tagSlug = decodeURIComponent(parts[tagIdx + 1]);",
    "const tagSlug = decodeURIComponent(parts[tagIdx + 1] || '');"
)

with open("assets/ts/search-engine.ts", "w") as f:
    f.write(content)
