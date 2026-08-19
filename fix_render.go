package main

import (
	"bytes"
	"os"
	"strings"
)

func main() {
	content, err := os.ReadFile("internal/render/render.go")
	if err != nil { panic(err) }

	s := string(content)

	// Remove os.MkdirAll and os.Create replacements for now, just look at template parsing
	s = strings.Replace(s, "tmpl, err = tmpl.ParseFiles(files...)", `tmpl, err = tmpl.ParseFS(embedded.FS, files...)`, 1)

	// Wait, filepath.Glob won't work on embed.FS. We need fs.Glob.
	// But it's easier to use template.ParseFS(embedded.FS, "templates/layouts/base.html", "templates/partials/*.html", "templates/pages/" + pageTemplate)
	// That's standard and elegant!
	
	err = os.WriteFile("internal/render/render.go.test", []byte(s), 0644)
	if err != nil { panic(err) }
}
