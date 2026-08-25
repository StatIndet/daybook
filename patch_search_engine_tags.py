import re
with open("assets/ts/search-engine.ts", "r") as f:
    content = f.read()

content = content.replace(
    'for (const tag of item.tags) {',
    'for (const tag of (item.tags || [])) {'
)

with open("assets/ts/search-engine.ts", "w") as f:
    f.write(content)
