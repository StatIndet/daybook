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
	links := []config.SocialLink{cfg.ResolveSocialLink(p.HTMLURL, "github")}
	if p.Email != "" {
		links = append(links, cfg.ResolveSocialLink("mailto:"+p.Email, "email"))
	}
	if p.TwitterUsername != "" {
		links = append(links, cfg.ResolveSocialLink("https://x.com/"+p.TwitterUsername, "x"))
	}
	for _, account := range p.SocialAccounts {
		if link := cfg.ResolveSocialLink(account.URL, account.Provider); link.URL != "" {
			links = append(links, link)
		}
	}
	cfg.Profile.ParsedSocial = links
}
