import re
with open("internal/embedded/templates/partials/head.html", "r") as f:
    content = f.read()

content = content.replace(
    '<script src="{{.Assets.Path "/js/heading-anchors.js"}}" defer></script>\n  <script src="{{.Assets.Path "/js/note-filters.js"}}" defer></script>',
    '<script src="{{.Assets.Path "/js/heading-anchors.js"}}" defer></script>\n  <script src="{{.Assets.Path "/js/search-engine.js"}}" defer></script>\n  <script src="{{.Assets.Path "/js/note-filters.js"}}" defer></script>'
)

with open("internal/embedded/templates/partials/head.html", "w") as f:
    f.write(content)
