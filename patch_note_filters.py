import re
with open("assets/ts/note-filters.ts", "r") as f:
    content = f.read()

content = content.replace(
    'toolsContainer.classList.remove("is-search-open", "is-tags-open");',
    'toolsContainer.classList.remove("is-search-open", "is-tags-open", "has-open-panel");'
)
content = content.replace(
    'toolsContainer.classList.add(`is-${tool}-open`);',
    'toolsContainer.classList.add(`is-${tool}-open`, "has-open-panel");'
)

with open("assets/ts/note-filters.ts", "w") as f:
    f.write(content)
