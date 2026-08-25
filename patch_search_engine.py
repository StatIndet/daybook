import re
with open("assets/ts/search-engine.ts", "r") as f:
    content = f.read()

content = content.replace(
    'const text = lower(item.title + " " + item.summary + " " + item.tags.join(" "));',
    'const text = lower(item.title + " " + (item.summary || "") + " " + (item.tags || []).join(" "));'
)

with open("assets/ts/search-engine.ts", "w") as f:
    f.write(content)
