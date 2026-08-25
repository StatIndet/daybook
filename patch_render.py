import re

with open("internal/render/render.go", "r") as f:
    content = f.read()

content = content.replace('IsLastInYear bool    `json:"isLastInYear,omitempty"`', 'IsLastInYear bool    `json:"isLastInYear,omitempty"`\n\tIsFirstYear  bool    `json:"isFirstYear,omitempty"`')

with open("internal/render/render.go", "w") as f:
    f.write(content)
