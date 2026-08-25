import re

with open("scripts/build-js.mjs", "r") as f:
    content = f.read()

content = content.replace("'code-copy',", "'archive',\n  'code-copy',")

with open("scripts/build-js.mjs", "w") as f:
    f.write(content)

with open("internal/embedded/templates/partials/head.html", "r") as f:
    head = f.read()

head = head.replace('<script src="{{.Assets.Path "/js/note-filters.js"}}" defer></script>', 
                    '<script src="{{.Assets.Path "/js/note-filters.js"}}" defer></script>\n  <script src="{{.Assets.Path "/js/archive.js"}}" defer></script>')

with open("internal/embedded/templates/partials/head.html", "w") as f:
    f.write(head)
