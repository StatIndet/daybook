import re

with open("internal/embedded/templates/pages/tag.html", "r") as f:
    content = f.read()

content = content.replace('    {{else}}\n      <p class="notes-empty">{{T .Lang "archive.empty"}}</p>\n    {{end}}\n  </section>', 
                          '    {{else}}\n      <p class="notes-empty">{{T .Lang "archive.empty"}}</p>\n    {{end}}\n    {{template "pagination" .}}\n    <p class="notes-empty notes-filter-empty" hidden>{{T .Lang "search.empty"}}</p>\n  </section>')

with open("internal/embedded/templates/pages/tag.html", "w") as f:
    f.write(content)
