package site

import (
	"crypto/sha256"
	"fmt"
	"html/template"
	"net/url"
	"strings"

	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/render"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Each body was rendered as a standalone document. Give fragment identifiers a
// per-article namespace before combining documents, including footnote backlinks.
func buildMemoCard(link render.NoteLink, location, body string) (render.MemoCard, error) {
	nodes, err := html.ParseFragment(strings.NewReader(body), &html.Node{Type: html.ElementNode, Data: "div", DataAtom: atom.Div})
	if err != nil {
		return render.MemoCard{}, err
	}
	prefix := fmt.Sprintf("memo-%x-", sha256.Sum256([]byte(link.URL)))
	ids := make(map[string]string)
	var visit func(*html.Node, func(*html.Node))
	visit = func(n *html.Node, f func(*html.Node)) {
		f(n)
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c, f)
		}
	}
	for _, root := range nodes {
		visit(root, func(n *html.Node) {
			for i, attr := range n.Attr {
				if attr.Key == "id" {
					ids[attr.Val] = prefix + attr.Val
					n.Attr[i].Val = ids[attr.Val]
				}
			}
		})
	}
	var plain, rendered strings.Builder
	for _, root := range nodes {
		visit(root, func(n *html.Node) {
			if n.Type == html.TextNode {
				if n.Parent == nil || (n.Parent.Data != "script" && n.Parent.Data != "style") {
					plain.WriteString(n.Data)
				}
			} else if n.Type == html.ElementNode {
				switch n.Data {
				case "p", "div", "li", "br", "h1", "h2", "h3", "h4", "h5", "h6", "tr":
					plain.WriteByte(' ')
				}
			}
			for i, attr := range n.Attr {
				switch attr.Key {
				case "href":
					if strings.HasPrefix(attr.Val, "#") {
						id, err := url.PathUnescape(strings.TrimPrefix(attr.Val, "#"))
						if err == nil && ids[id] != "" {
							n.Attr[i].Val = "#" + ids[id]
						}
					}
				case "for", "aria-describedby", "aria-labelledby", "aria-controls":
					refs := strings.Fields(attr.Val)
					for j, ref := range refs {
						if ids[ref] != "" {
							refs[j] = ids[ref]
						}
					}
					n.Attr[i].Val = strings.Join(refs, " ")
				case "alt":
					plain.WriteString(" " + attr.Val + " ")
				}
			}
		})
		if err := html.Render(&rendered, root); err != nil {
			return render.MemoCard{}, err
		}
	}
	date, err := content.ParseDate(link.Date)
	if err != nil {
		return render.MemoCard{}, err
	}
	dateDisplay := date.Format("2006-01-02")
	updatedDisplay := ""
	if link.Updated != "" {
		updated, err := content.ParseDate(link.Updated)
		if err != nil {
			return render.MemoCard{}, err
		}
		updatedDisplay = updated.Format("2006-01-02")
	}
	return render.MemoCard{
		UpdatedDisplay: updatedDisplay,
		NoteLink:       link, HTML: template.HTML(rendered.String()), Location: location,
		DateDay: date.Format("2006-01-02"), DateDisplay: dateDisplay,
		SearchText: strings.Join(strings.Fields(plain.String()), " "),
	}, nil
}
