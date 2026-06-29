package seo

import (
	"html/template"
)

type Alternate struct {
	Lang string
	URL  string
}

type SEOData struct {
	Title        string
	Description  string
	CanonicalURL string
	PageURL      string
	SiteName     string
	Lang         string
	Type         string // e.g. website, article, profile
	Image        string
	AuthorName   string
	AuthorURL    string
	Robots       string
	Published    string
	Modified     string
	Tags         []string
	Alternates   []Alternate

	JSONLD template.JS // Populated with marshaled JSON-LD graph
}

type Person struct {
	Type          string `json:"@type,omitempty"`
	ID            string `json:"@id"`
	Name          string `json:"name,omitempty"`
	AlternateName string `json:"alternateName,omitempty"`
	URL           string `json:"url,omitempty"`
}

type JSONLDGraph struct {
	Context string `json:"@context"`
	Graph   []any  `json:"@graph"`
}

type WebSite struct {
	Type        string        `json:"@type"`
	ID          string        `json:"@id"`
	URL         string        `json:"url"`
	Name        string        `json:"name"`
	Description string        `json:"description,omitempty"`
	Author      *Person       `json:"author,omitempty"`
	Publisher   *Organization `json:"publisher,omitempty"`
}

type Organization struct {
	Type string `json:"@type"`
	ID   string `json:"@id"`
	Name string `json:"name"`
	URL  string `json:"url"`
}

type BlogPosting struct {
	Type             string  `json:"@type"`
	ID               string  `json:"@id"`
	URL              string  `json:"url"`
	Headline         string  `json:"headline"`
	Description      string  `json:"description,omitempty"`
	DatePublished    string  `json:"datePublished,omitempty"`
	DateModified     string  `json:"dateModified,omitempty"`
	Author           *Person `json:"author,omitempty"`
	MainEntityOfPage string  `json:"mainEntityOfPage,omitempty"`
	Keywords         string  `json:"keywords,omitempty"`
	Image            string  `json:"image,omitempty"`
}

type AboutPage struct {
	Type             string `json:"@type"`
	ID               string `json:"@id"`
	URL              string `json:"url"`
	Name             string `json:"name"`
	Description      string `json:"description,omitempty"`
	DatePublished    string `json:"datePublished,omitempty"`
	DateModified     string `json:"dateModified,omitempty"`
	MainEntityOfPage string `json:"mainEntityOfPage,omitempty"`
}

type CollectionPage struct {
	Type        string `json:"@type"`
	ID          string `json:"@id"`
	URL         string `json:"url"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type WebPage struct {
	Type        string `json:"@type"`
	ID          string `json:"@id"`
	URL         string `json:"url"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type BreadcrumbList struct {
	Type            string     `json:"@type"`
	ID              string     `json:"@id"`
	ItemListElement []ListItem `json:"itemListElement"`
}

type ListItem struct {
	Type     string `json:"@type"`
	Position int    `json:"position"`
	Name     string `json:"name"`
	Item     string `json:"item"`
}
