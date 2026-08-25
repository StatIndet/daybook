import re

with open("internal/content/note.go", "r") as f:
    content = f.read()

reserved_check = """
		slug := strings.TrimSuffix(rel, filepath.Ext(rel))

		if strings.HasPrefix(slug, "page/") || slug == "page" {
			return fmt.Errorf("\\"page\\" is reserved for Daybook pagination. Conflict: %s", path)
		}
"""

content = content.replace('slug := strings.TrimSuffix(rel, filepath.Ext(rel))', reserved_check)

with open("internal/content/note.go", "w") as f:
    f.write(content)
