import re

with open("internal/render/render.go", "r") as f:
    content = f.read()

content = content.replace("Total        int\n\tYearGroups   []ArchiveYearGroup", "Total        int\n\tYearGroups   []ArchiveYearGroup\n\tNextChunkURL string")

with open("internal/render/render.go", "w") as f:
    f.write(content)
