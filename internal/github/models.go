// Package github synchronizes public GitHub profile data for static rendering.
package github

import (
	"fmt"
	"html/template"
	"net/url"
	"strings"
)

type Profile struct {
	Pronouns           string          `json:"pronouns"`
	Login              string          `json:"login"`
	Name               string          `json:"name"`
	Bio                string          `json:"bio"`
	AvatarURL          string          `json:"avatarURL"`
	HTMLURL            string          `json:"htmlURL"`
	Company            string          `json:"company"`
	Blog               string          `json:"blog"`
	Location           string          `json:"location"`
	Email              string          `json:"email"`
	TwitterUsername    string          `json:"twitterUsername"`
	Followers          int             `json:"followers"`
	Following          int             `json:"following"`
	PublicRepos        int             `json:"publicRepos"`
	PublicGists        int             `json:"publicGists"`
	Stars              int             `json:"stars"`
	StarsAvailable     bool            `json:"starsAvailable"`
	CreatedAt          string          `json:"createdAt"`
	UpdatedAt          string          `json:"updatedAt"`
	FetchedAt          string          `json:"fetchedAt"`
	ReadmeHTML         template.HTML   `json:"readmeHTML"`
	ReadmeURL          string          `json:"readmeURL"`
	SocialAccounts     []SocialAccount `json:"socialAccounts"`
	Organizations      []Organization  `json:"organizations"`
	Repositories       []Repository    `json:"repositories"`
	PinnedRepositories []Repository    `json:"pinnedRepositories"`
	Events             []Event         `json:"events"`
	Contributions      *Contributions  `json:"contributions,omitempty"`
	Status             *Status         `json:"status,omitempty"`
	Cached             bool            `json:"cached,omitempty"`
}

type SocialAccount struct {
	Provider string `json:"provider"`
	URL      string `json:"url"`
}
type Organization struct {
	Login       string `json:"login"`
	AvatarURL   string `json:"avatarURL"`
	HTMLURL     string `json:"htmlURL"`
	Description string `json:"description"`
}
type Repository struct {
	Name          string   `json:"name"`
	FullName      string   `json:"fullName"`
	HTMLURL       string   `json:"htmlURL"`
	Description   string   `json:"description"`
	Language      string   `json:"language"`
	LanguageColor string   `json:"languageColor,omitempty"`
	Stars         int      `json:"stars"`
	Forks         int      `json:"forks"`
	Archived      bool     `json:"archived"`
	Fork          bool     `json:"fork"`
	Topics        []string `json:"topics"`
	UpdatedAt     string   `json:"updatedAt"`
	Homepage      string   `json:"homepage"`
}
type Event struct {
	Type      string `json:"type"`
	RepoName  string `json:"repoName"`
	RepoURL   string `json:"repoURL"`
	URL       string `json:"url"`
	CreatedAt string `json:"createdAt"`
	Summary   string `json:"summary"`
}
type Contributions struct {
	Total int                `json:"total"`
	Weeks []ContributionWeek `json:"weeks"`
}
type ContributionWeek struct {
	Days []ContributionDay `json:"days"`
}
type ContributionDay struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
	Level int    `json:"level"`
}
type Status struct {
	Emoji   string `json:"emoji"`
	Message string `json:"message"`
}

func (p Profile) DisplayName() string {
	if p.Name != "" {
		return p.Name
	}
	return p.Login
}

func (p Profile) AvatarSize(size int) string {
	u, err := url.Parse(p.AvatarURL)
	if err != nil {
		return p.AvatarURL
	}
	q := u.Query()
	q.Set("s", fmt.Sprint(size))
	u.RawQuery = q.Encode()
	return u.String()
}

func (p Profile) AvatarSrcSet() string {
	return p.AvatarSize(96) + " 96w, " + p.AvatarSize(260) + " 260w, " + p.AvatarSize(520) + " 520w"
}

func safeURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err == nil && u.Scheme == "" {
		u, err = url.Parse("https://" + raw)
	}
	if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return ""
	}
	return u.String()
}
