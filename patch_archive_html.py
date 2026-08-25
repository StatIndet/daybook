with open("internal/embedded/templates/pages/archive.html", "r") as f:
    content = f.read()

content = content.replace('    </section>', '      <div id="archive-sentinel" data-next-chunk="{{.NextChunkURL}}"></div>\n    </section>')

with open("internal/embedded/templates/pages/archive.html", "w") as f:
    f.write(content)
