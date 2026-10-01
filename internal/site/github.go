package site

import (
	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/github"
)

func applyGitHubProfile(cfg *config.Config, p *github.Profile) {
	cfg.Profile.Author.Name = p.DisplayName()
	cfg.Profile.Author.NameEn = p.Login
	cfg.Profile.Author.Avatar = p.AvatarSize(260)
	cfg.Profile.Slogan = map[string]string{"zh_CN": p.Bio, "en_US": p.Bio, "zh": p.Bio}
	title := p.DisplayName()
	if p.Name != "" && p.Name != p.Login {
		title += " (" + p.Login + ")"
	}
	cfg.SEO.HomeTitle = map[string]string{"zh_CN": title, "en_US": title, "zh": title}
	cfg.SEO.HomeDescription = map[string]string{"zh_CN": p.Bio, "en_US": p.Bio, "zh": p.Bio}
	// The homepage and persistent social links use the same public upstream.
	links := []config.SocialLink{{Type: "github", Label: "GitHub", URL: p.HTMLURL, Icon: "/icons/social/github.svg"}}
	if p.Email != "" {
		links = append(links, config.SocialLink{Type: "email", Label: "Email", URL: "mailto:" + p.Email, Icon: "/icons/social/gmail.svg"})
	}
	for _, account := range p.SocialAccounts {
		if account.URL == "" {
			continue
		}
		provider := account.Provider
		if provider == "twitter" {
			provider = "x"
		}
		links = append(links, config.SocialLink{Type: provider, Label: account.Provider, URL: account.URL})
	}
	cfg.Profile.ParsedSocial = links
}
