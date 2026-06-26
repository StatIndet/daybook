package i18n

var dictionary = map[string]map[string]string{
	"zh-CN": {
		"nav.home":           "首页",
		"nav.notes":          "笔记",
		"nav.archive":        "归档",
		"nav.graph":          "图谱",
		"nav.about":          "关于",
		"action.search":      "搜索",
		"action.tags":        "标签",
		"action.back":        "返回",
		"action.top":         "回到顶部",
		"action.bottom":      "直达底部",
		"action.theme":       "切换主题",
		"action.rss":         "RSS订阅",
		"tooltip.search":     "搜索",
		"tooltip.tags":       "标签",
		"tooltip.theme":      "切换主题",
		"tooltip.back":       "返回",
		"post.bilingual":     "中/EN",
		"post.no_translation": "本文暂无中文译文，以下显示英文原文。",
		"post.min_read":      "min",
		"post.words":         "chars",
		"search.placeholder": "搜索：标题/摘要/标签",
		"search.empty":       "没有找到相关内容",
		"home.hero_label":    "个人介绍",
		"home.slogan":        "笑一个吧，功成名就不是目的。",
		"archive.title":      "归档",
		"archive.posts":      "篇文章",
		"archive.empty":      "还没有发布的文章。",
		"graph.title":        "图谱",
		"graph.search":       "搜索文章标题...",
		"graph.orphans":      "孤立节点",
		"graph.reset":        "重置",
		"about.title":        "关于",
		"tag.empty":          "暂无标签",
		"footer.visitors":    "访客",
		"footer.views":       "访问",
		"footer.words":       "字数",
		"footer.uptime":      "历时",
	},
	"en": {
		"nav.home":           "Home",
		"nav.notes":          "Notes",
		"nav.archive":        "Archive",
		"nav.graph":          "Graph",
		"nav.about":          "About",
		"action.search":      "Search",
		"action.tags":        "Tags",
		"action.back":        "Back",
		"action.top":         "Top",
		"action.bottom":      "Bottom",
		"action.theme":       "Theme",
		"action.rss":         "RSS",
		"tooltip.search":     "Search",
		"tooltip.tags":       "Tags",
		"tooltip.theme":      "Toggle Theme",
		"tooltip.back":       "Back",
		"post.bilingual":     "Bilingual",
		"post.no_translation": "This post is not available in English yet. The original Chinese version is shown below.",
		"post.min_read":      "min",
		"post.words":         "words",
		"search.placeholder": "Search: Title/Summary/Tag",
		"search.empty":       "No results found",
		"home.hero_label":    "Introduction",
		"home.slogan":        "笑一个吧，功成名就不是目的。",
		"archive.title":      "Archive",
		"archive.posts":      "posts",
		"archive.empty":      "No posts found.",
		"graph.title":        "Graph",
		"graph.search":       "Search titles...",
		"graph.orphans":      "Orphans",
		"graph.reset":        "Reset",
		"about.title":        "About",
		"tag.empty":          "No tags",
		"footer.visitors":    "Visitors",
		"footer.views":       "Views",
		"footer.words":       "Words",
		"footer.uptime":      "Uptime",
	},
}

func T(lang, key string) string {
	if dict, ok := dictionary[lang]; ok {
		if val, ok := dict[key]; ok {
			return val
		}
	}
	// Fallback to zh-CN
	if dict, ok := dictionary["zh-CN"]; ok {
		if val, ok := dict[key]; ok {
			return val
		}
	}
	return key
}
