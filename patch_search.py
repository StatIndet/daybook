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

new_struct = """import "github.com/StatIndet/daybook/internal/morphable"
import "html/template"

type IndexVersion struct {
	Title          string        `json:"title"`
	Summary        string        `json:"summary"`
	Tags           []string      `json:"tags"`
	TagIDs         []string      `json:"tagIDs"`
	Date           string        `json:"date"`
	URL            string        `json:"url"`
	ReadingTime    string        `json:"readingTime"`
	ReadingMinutes int           `json:"readingMinutes"`
	Updated        string        `json:"updated"`
	Slug           string        `json:"slug"`
	Pin            bool          `json:"pin"`
	HasMusic       bool          `json:"hasMusic"`
	HasTranslation bool          `json:"hasTranslation"`
	TitleLayout    template.HTML `json:"titleLayout"`
}"""

content = content.replace('import (\n\t"encoding/json"', 'import (\n\t"encoding/json"')
content = content.replace(old_struct, new_struct)
# Clean up duplicate imports if we introduced any via new_struct... wait, the replacement puts import at top-level. 
# Better to replace the whole file.

