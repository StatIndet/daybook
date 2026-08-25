with open("internal/embedded/templates/pages/archive.html", "r") as f:
    content = f.read()

# I want to remove the sentinel inside the loop
content = content.replace('            <div id="archive-sentinel" data-next-chunk="{{.NextChunkURL}}"></div>\n    </section>', '          </section>')

# Wait, `{{.NextChunkURL}}` at the end also uses `.` which is ArchiveData outside the loop, which is correct.
with open("internal/embedded/templates/pages/archive.html", "w") as f:
    f.write(content)
