package seo

import (
	"encoding/json"
	"html/template"
	"regexp"
	"strings"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/i18n"
)

type BuilderArgs struct {
	Config      config.Config
	Lang        string
	Title       string
	Description string
	PageURL     string
	Image       string
	Published   string
	Modified    string
	Tags        []string
	Alternates  []Alternate
}

func TagSlug(tag string) string {
	tag = strings.TrimSpace(tag)

	reSpace := regexp.MustCompile(`\s+`)
	tag = reSpace.ReplaceAllString(tag, "-")

	unsafeChars := []string{"/", "?", "#", "[", "]", "@", "!", "$", "&", "'", "(", ")", "*", "+", ",", ";", "="}
	for _, char := range unsafeChars {
		tag = strings.ReplaceAll(tag, char, "")
	}

	reDash := regexp.MustCompile(`-+`)
	tag = reDash.ReplaceAllString(tag, "-")
	tag = strings.Trim(tag, "-")

	return tag
}

func CleanDescription(desc string) string {
	desc = strings.ReplaceAll(desc, "\n", " ")
	reSpace := regexp.MustCompile(`\s+`)
	desc = reSpace.ReplaceAllString(desc, " ")
	desc = strings.TrimSpace(desc)

	runes := []rune(desc)
	if len(runes) > 160 {
		return string(runes[:157]) + "..."
	}
	return desc
}

func buildJSONLD(graph []any) template.JS {
	wrapper := JSONLDGraph{
		Context: "https://schema.org",
		Graph:   graph,
	}
	b, err := json.Marshal(wrapper)
	if err != nil {
		return ""
	}
	return template.JS(string(b))
}

func absURL(cfg config.Config, path string) string {
	baseURL := strings.TrimSuffix(cfg.BaseURL, "/")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return baseURL + path
}

func BuildForHome(args BuilderArgs) SEOData {
	for i := range args.Alternates {
		args.Alternates[i].URL = absURL(args.Config, args.Alternates[i].URL)
	}

	url := absURL(args.Config, args.PageURL)
	desc := CleanDescription(args.Description)

	graph := []any{
		Person{
			Type:          "Person",
			ID:            absURL(args.Config, "/#person"),
			Name:          "史帙",
			AlternateName: "Stat Indet",
			URL:           absURL(args.Config, "/about/"),
		},
		WebSite{
			Type:        "WebSite",
			ID:          url + "#website",
			URL:         url,
			Name:        args.Title,
			Description: desc,
			Author: &Person{
				ID: absURL(args.Config, "/#person"),
			},
			Publisher: &Organization{
				Type: "Organization",
				ID:   absURL(args.Config, "/") + "#organization",
				Name: args.Config.Title,
				URL:  absURL(args.Config, "/"),
			},
		},
	}

	return SEOData{
		Title:        args.Title,
		Description:  desc,
		CanonicalURL: url,
		PageURL:      url,
		SiteName:     args.Config.Title,
		Lang:         args.Lang,
		Type:         "website",
		Alternates:   args.Alternates,
		JSONLD:       buildJSONLD(graph),
	}
}

func BuildForNote(args BuilderArgs) SEOData {
	for i := range args.Alternates {
		args.Alternates[i].URL = absURL(args.Config, args.Alternates[i].URL)
	}

	url := absURL(args.Config, args.PageURL)
	desc := CleanDescription(args.Description)

	homePath := "/"
	if args.Lang == "en" {
		homePath = "/en/"
	}
	notesPath := homePath + "notes/"

	modTime := args.Modified
	if modTime == "" {
		modTime = args.Published
	}

	graph := []any{
		BlogPosting{
			Type:             "BlogPosting",
			ID:               url + "#article",
			URL:              url,
			Headline:         args.Title,
			Description:      desc,
			DatePublished:    args.Published,
			DateModified:     modTime,
			MainEntityOfPage: url,
			Keywords:         strings.Join(args.Tags, ", "),
			Image:            args.Image,
			Author: &Person{
				ID: absURL(args.Config, "/#person"),
			},
		},
		BreadcrumbList{
			Type: "BreadcrumbList",
			ID:   url + "#breadcrumb",
			ItemListElement: []ListItem{
				{Type: "ListItem", Position: 1, Name: i18n.T(args.Lang, "nav.home"), Item: absURL(args.Config, homePath)},
				{Type: "ListItem", Position: 2, Name: i18n.T(args.Lang, "nav.notes"), Item: absURL(args.Config, notesPath)},
				{Type: "ListItem", Position: 3, Name: args.Title, Item: url},
			},
		},
	}

	return SEOData{
		Title:        args.Title + " | " + args.Config.Title,
		Description:  desc,
		CanonicalURL: url,
		PageURL:      url,
		SiteName:     args.Config.Title,
		Lang:         args.Lang,
		Type:         "article",
		Published:    args.Published,
		Modified:     modTime,
		Tags:         args.Tags,
		Alternates:   args.Alternates,
		JSONLD:       buildJSONLD(graph),
	}
}

func BuildForAbout(args BuilderArgs) SEOData {
	for i := range args.Alternates {
		args.Alternates[i].URL = absURL(args.Config, args.Alternates[i].URL)
	}

	url := absURL(args.Config, args.PageURL)
	desc := CleanDescription(args.Description)
	modTime := args.Modified
	if modTime == "" {
		modTime = args.Published
	}

	graph := []any{
		Person{
			Type:          "Person",
			ID:            absURL(args.Config, "/#person"),
			Name:          "史帙",
			AlternateName: "Stat Indet",
			URL:           absURL(args.Config, "/about/"),
		},
		AboutPage{
			Type:             "AboutPage",
			ID:               url + "#about",
			URL:              url,
			Name:             args.Title,
			Description:      desc,
			DatePublished:    args.Published,
			DateModified:     modTime,
			MainEntityOfPage: url,
		},
	}

	return SEOData{
		Title:        args.Title + " | " + args.Config.Title,
		Description:  desc,
		CanonicalURL: url,
		PageURL:      url,
		SiteName:     args.Config.Title,
		Lang:         args.Lang,
		Type:         "profile",
		Alternates:   args.Alternates,
		JSONLD:       buildJSONLD(graph),
	}
}

func BuildForCollection(args BuilderArgs) SEOData {
	for i := range args.Alternates {
		args.Alternates[i].URL = absURL(args.Config, args.Alternates[i].URL)
	}

	url := absURL(args.Config, args.PageURL)
	desc := CleanDescription(args.Description)

	graph := []any{
		CollectionPage{
			Type:        "CollectionPage",
			ID:          url + "#collection",
			URL:         url,
			Name:        args.Title,
			Description: desc,
		},
	}

	return SEOData{
		Title:        args.Title + " | " + args.Config.Title,
		Description:  desc,
		CanonicalURL: url,
		PageURL:      url,
		SiteName:     args.Config.Title,
		Lang:         args.Lang,
		Type:         "website",
		Alternates:   args.Alternates,
		JSONLD:       buildJSONLD(graph),
	}
}

func BuildForGraph(args BuilderArgs) SEOData {
	for i := range args.Alternates {
		args.Alternates[i].URL = absURL(args.Config, args.Alternates[i].URL)
	}

	url := absURL(args.Config, args.PageURL)
	desc := CleanDescription(args.Description)

	graph := []any{
		WebPage{
			Type:        "WebPage",
			ID:          url + "#webpage",
			URL:         url,
			Name:        args.Title,
			Description: desc,
		},
	}

	return SEOData{
		Title:        args.Title + " | " + args.Config.Title,
		Description:  desc,
		CanonicalURL: url,
		PageURL:      url,
		SiteName:     args.Config.Title,
		Lang:         args.Lang,
		Type:         "website",
		Alternates:   args.Alternates,
		JSONLD:       buildJSONLD(graph),
	}
}

func BuildForTag(args BuilderArgs) SEOData {
	for i := range args.Alternates {
		args.Alternates[i].URL = absURL(args.Config, args.Alternates[i].URL)
	}

	url := absURL(args.Config, args.PageURL)
	desc := CleanDescription(args.Description)

	homePath := "/"
	if args.Lang == "en" {
		homePath = "/en/"
	}

	graph := []any{
		CollectionPage{
			Type:        "CollectionPage",
			ID:          url + "#collection",
			URL:         url,
			Name:        args.Title,
			Description: desc,
		},
		BreadcrumbList{
			Type: "BreadcrumbList",
			ID:   url + "#breadcrumb",
			ItemListElement: []ListItem{
				{Type: "ListItem", Position: 1, Name: i18n.T(args.Lang, "nav.home"), Item: absURL(args.Config, homePath)},
				{Type: "ListItem", Position: 2, Name: i18n.T(args.Lang, "action.tags"), Item: absURL(args.Config, homePath+"tags/")},
				{Type: "ListItem", Position: 3, Name: args.Title, Item: url},
			},
		},
	}

	return SEOData{
		Title:        args.Title + " | " + args.Config.Title,
		Description:  desc,
		CanonicalURL: url,
		PageURL:      url,
		SiteName:     args.Config.Title,
		Lang:         args.Lang,
		Type:         "website",
		Alternates:   args.Alternates,
		JSONLD:       buildJSONLD(graph),
	}
}
