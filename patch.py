import re

with open("internal/render/render.go", "r") as f:
    content = f.read()

pagination_struct = """
type PaginationItem struct {
	PageNumber int
	URL        string
	IsCurrent  bool
	IsEllipsis bool
}

type PaginationData struct {
	CurrentPage int
	TotalPages  int
	PrevURL     string
	NextURL     string
	Items       []PaginationItem
}

"""

content = content.replace("type NotesData struct {", pagination_struct + "type NotesData struct {")
content = content.replace("SEO          seo.SEOData\n}", "SEO          seo.SEOData\n\tPagination   PaginationData\n}")

with open("internal/render/render.go", "w") as f:
    f.write(content)
