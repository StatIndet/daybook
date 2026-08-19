package content

import "testing"

func TestGroupNotes(t *testing.T) {
	notes := []Note{
		{Slug: "foo", Lang: "zh-CN", I18nKey: "my-group"},
		{Slug: "en/foo", Lang: "en", I18nKey: "my-group"},
		{Slug: "bar", Lang: "zh-CN"}, // no i18n_key
		{Slug: "bar", Lang: "en"},    // no i18n_key
	}
	
	groups, err := GroupNotes(notes)
	if err != nil {
		t.Fatalf("GroupNotes error: %v", err)
	}
	
	if len(groups) != 3 {
		t.Fatalf("Expected 3 groups, got %d", len(groups))
	}
	
	// my-group
	var myGroup *ArticleGroup
	for _, g := range groups {
		if g.I18nKey == "my-group" {
			myGroup = g
		}
	}
	if myGroup == nil || len(myGroup.Versions) != 2 {
		t.Fatalf("my-group not found or versions != 2")
	}
}
