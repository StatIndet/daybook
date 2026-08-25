import re

with open("internal/search/index.go", "r") as f:
    content = f.read()

old_struct = """type IndexVersion struct {
	Title       string   `json:"title"`
	Summary     string   `json:"summary"`
	Tags        []string `json:"tags"`
	Date        string   `json:"date"`
	URL         string   `json:"url"`
	ReadingTime string   `json:"readingTime"`
}"""

new_struct = """type IndexVersion struct {
	Title          string   `json:"title"`
	Summary        string   `json:"summary"`
	Tags           []string `json:"tags"`
	TagIDs         []string `json:"tagIDs"`
	Date           string   `json:"date"`
	URL            string   `json:"url"`
	ReadingTime    string   `json:"readingTime"`
	ReadingMinutes int      `json:"readingMinutes"`
	Updated        string   `json:"updated"`
	Slug           string   `json:"slug"`
	Pin            bool     `json:"pin"`
	HasMusic       bool     `json:"hasMusic"`
	HasTranslation bool     `json:"hasTranslation"`
	TitleLayout    string   `json:"titleLayout"`
}"""

content = content.replace(old_struct, new_struct)

# Also update the instantiation inside BuildIndex
old_inst = """				Title:       note.Title,
				Summary:     note.Summary,
				Tags:        tags,
				Date:        note.Date,
				URL:         note.URL,
				ReadingTime: estimateReadingTime(note.Body),
			}"""

# Actually, I need to know how to get `HasMusic`, `TagIDs`, `TitleLayout`, `ReadingMinutes`, etc.
# Wait, index.go doesn't have tagRegistry or hasMusic parsing.
# The prompt says: "如果现有索引已经包含所需数据，则直接复用。如为保持动态搜索结果中的现有 View Transition / note-card 行为确实需要额外字段，可以最小扩展索引。" 
# It might be easier to just change `note-filters.ts` to construct the HTML string for the search result matching the `note-card` as close as possible. It might not need all fields perfectly.
# Wait, for `Slug` we can just extract it from `URL` or `Title`. Or I can just add `Slug` to `IndexVersion`.

