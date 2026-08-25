import re

with open("internal/embedded/templates/pages/notes.html", "r") as f:
    content = f.read()

# Replace tag-back-container
content = re.sub(r'<div class="tag-back-container".*?</div>', '', content, flags=re.DOTALL)

# Add {{template "pagination" .}} before notes-filter-empty
content = content.replace('<p class="notes-empty notes-filter-empty" hidden>{{T .Lang "search.empty"}}</p>', 
                          '{{template "pagination" .}}\n    <p class="notes-empty notes-filter-empty" hidden>{{T .Lang "search.empty"}}</p>')

with open("internal/embedded/templates/pages/notes.html", "w") as f:
    f.write(content)
