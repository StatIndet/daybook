import re
with open("scripts/build-js.mjs", "r") as f:
    content = f.read()

content = content.replace(
    "'search-overlay',\n  'theme',",
    "'search-engine',\n  'search-overlay',\n  'theme',"
)

with open("scripts/build-js.mjs", "w") as f:
    f.write(content)
