with open("internal/embedded/templates/pages/archive.html", "r") as f:
    content = f.read()

content = content.replace(
    '<div class="archive-virtual-row archive-year-row" data-archive-row-id="{{.ID}}" data-archive-row-type="year">',
    '<div class="archive-virtual-row archive-year-row {{if .IsFirstYear}}is-first-year{{end}}" data-archive-row-id="{{.ID}}" data-archive-row-type="year">'
)

content = content.replace(
    '<div class="archive-virtual-row archive-item-row {{if .IsLastInYear}}is-last-in-year{{end}}" data-archive-row-id="{{.ID}}" data-archive-row-type="note" style="--stagger-index: {{.Index}}">',
    '<div class="archive-virtual-row archive-item-row" data-archive-row-id="{{.ID}}" data-archive-row-type="note" style="--stagger-index: {{.Index}}">'
)

with open("internal/embedded/templates/pages/archive.html", "w") as f:
    f.write(content)
