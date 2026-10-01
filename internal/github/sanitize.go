package github

import (
	"bytes"
	"html/template"
	"net/url"
	"strings"

	"github.com/microcosm-cc/bluemonday"
	"golang.org/x/net/html"
)

// GitHub renders Markdown upstream. Treat the returned HTML and persisted cache
// as untrusted, and resolve repository-relative links before template rendering.
func cleanReadme(raw, login string) template.HTML {
	root, err := html.Parse(strings.NewReader(raw))
	if err != nil {
		return ""
	}
	var visit func(*html.Node)
	visit = func(n *html.Node) {
		if n.Type == html.ElementNode {
			for i, attr := range n.Attr {
				if attr.Key != "href" && attr.Key != "src" && attr.Key != "srcset" {
					continue
				}
				if attr.Key == "srcset" {
					n.Attr[i].Val = ""
					continue
				}
				u, err := url.Parse(attr.Val)
				if err != nil || u.Scheme != "" || u.Host != "" || strings.HasPrefix(attr.Val, "#") {
					continue
				}
				base := "https://github.com/" + login + "/" + login + "/blob/HEAD/"
				if attr.Key == "src" {
					base = "https://raw.githubusercontent.com/" + login + "/" + login + "/HEAD/"
				}
				if strings.HasPrefix(attr.Val, "/") {
					base = "https://github.com/"
				}
				baseURL, _ := url.Parse(base)
				n.Attr[i].Val = baseURL.ResolveReference(u).String()
			}
			if n.Data == "img" {
				n.Attr = append(n.Attr, html.Attribute{Key: "loading", Val: "lazy"}, html.Attribute{Key: "decoding", Val: "async"})
			}
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(root)
	var out bytes.Buffer
	if err := html.Render(&out, root); err != nil {
		return ""
	}
	policy := bluemonday.UGCPolicy()
	policy.AllowElements("details", "summary", "picture", "source")
	policy.AllowAttrs("open").OnElements("details")
	policy.AllowAttrs("loading", "decoding", "width", "height").OnElements("img")
	policy.AllowAttrs("class", "id").Globally()
	return template.HTML(policy.Sanitize(out.String()))
}

func sanitizeProfile(p *Profile) {
	p.HTMLURL = safeURL(p.HTMLURL)
	p.AvatarURL = safeURL(p.AvatarURL)
	p.Blog = safeURL(p.Blog)
	p.ReadmeURL = safeURL(p.ReadmeURL)
	p.ReadmeHTML = cleanReadme(string(p.ReadmeHTML), p.Login)
	for i := range p.SocialAccounts {
		p.SocialAccounts[i].URL = safeURL(p.SocialAccounts[i].URL)
	}
	for i := range p.Organizations {
		p.Organizations[i].HTMLURL = safeURL(p.Organizations[i].HTMLURL)
		p.Organizations[i].AvatarURL = safeURL(p.Organizations[i].AvatarURL)
	}
	for _, list := range [][]Repository{p.Repositories, p.PinnedRepositories} {
		for i := range list {
			list[i].HTMLURL = safeURL(list[i].HTMLURL)
			list[i].Homepage = safeURL(list[i].Homepage)
		}
	}
	for i := range p.Events {
		p.Events[i].URL = safeURL(p.Events[i].URL)
		p.Events[i].RepoURL = safeURL(p.Events[i].RepoURL)
	}
}
