import re

def patch_file(filepath):
    with open(filepath, "r") as f:
        content = f.read()

    replacement = """    const hasTitleMatch = keyword && titleHtml !== engine.escapeHTML(item.title);
    const titleLayout = (keyword && hasTitleMatch) ? titleHtml : (item.titleLayout || titleHtml);"""

    content = content.replace(
        "const titleLayout = item.titleLayout || titleHtml;",
        replacement
    )

    with open(filepath, "w") as f:
        f.write(content)

patch_file("assets/ts/note-filters.ts")
patch_file("assets/ts/search-overlay.ts")
