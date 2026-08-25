import re

with open("assets/ts/archive.ts", "r") as f:
    content = f.read()
content = content.replace("const entry = entries[0];\n            if (entry.isIntersecting && !isFetching) {", 
                          "const entry = entries[0];\n            if (entry && entry.isIntersecting && !isFetching) {")
with open("assets/ts/archive.ts", "w") as f:
    f.write(content)

with open("assets/ts/note-filters.ts", "r") as f:
    content = f.read()
content = content.replace("currentTagSlug = decodeURIComponent(parts[idx+1]);", 
                          "currentTagSlug = decodeURIComponent(parts[idx+1] || '');")
with open("assets/ts/note-filters.ts", "w") as f:
    f.write(content)
