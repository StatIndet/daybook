import re

with open("internal/seo/models.go", "r") as f:
    content = f.read()

content = content.replace("Type         string // e.g. website, article, profile", "Type         string // e.g. website, article, profile\n\tPaginationPrev string\n\tPaginationNext string")

with open("internal/seo/models.go", "w") as f:
    f.write(content)

with open("internal/embedded/templates/partials/head.html", "r") as f:
    head = f.read()

head_patch = """{{ if .SEO.PaginationPrev }}
  <link rel="prev" href="{{ .SEO.PaginationPrev }}">
{{ end }}
{{ if .SEO.PaginationNext }}
  <link rel="next" href="{{ .SEO.PaginationNext }}">
{{ end }}"""

if "PaginationPrev" not in head:
    head = head.replace("{{ if .SEO.CanonicalURL }}", head_patch + "\n{{ if .SEO.CanonicalURL }}")
    with open("internal/embedded/templates/partials/head.html", "w") as f:
        f.write(head)
