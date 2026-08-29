package content

import "testing"

func TestGroupNotes(t *testing.T) {
	notes := []Note{
		{Slug: "foo", Lang: "zh_CN", I18nKey: "my-group"},
		{Slug: "foo-en", Lang: "en_US", I18nKey: "my-group"},
		{Slug: "bar", Lang: "zh_CN"}, // no i18n_key
		{Slug: "baz", Lang: "en_US"},    // no i18n_key
	}
	
	groups, err := GroupNotes(notes)
	if err != nil {
		t.Fatalf("GroupNotes error: %v", err)
	}
	
	if len(groups) != 3 {
		t.Fatalf("Expected 3 groups, got %d", len(groups))
	}
	
	groupsMap := make(map[string]*ArticleGroup)
	for _, g := range groups {
		groupsMap[g.Key] = g
	}

	// Bilingual article
	myGroup := groupsMap["my-group"]
	if myGroup == nil {
		t.Fatalf("my-group not found")
	}
	if len(myGroup.Versions) != 2 {
		t.Fatalf("my-group should have 2 versions")
	}
	if myGroup.Key != "my-group" {
		t.Fatalf("my-group key should be my-group")
	}
	if myGroup.I18nKey != "my-group" {
		t.Fatalf("my-group i18n_key should be my-group")
	}

	// Single language zh_CN
	barKey := "single:zh_CN:bar"
	barGroup := groupsMap[barKey]
	if barGroup == nil {
		t.Fatalf("bar group not found")
	}
	if barGroup.Key != barKey {
		t.Errorf("Expected Key %s, got %s", barKey, barGroup.Key)
	}
	if barGroup.I18nKey != "" {
		t.Errorf("Expected I18nKey empty, got %s", barGroup.I18nKey)
	}

	// Single language en_US
	bazKey := "single:en_US:baz"
	bazGroup := groupsMap[bazKey]
	if bazGroup == nil {
		t.Fatalf("baz group not found")
	}
	if bazGroup.Key != bazKey {
		t.Errorf("Expected Key %s, got %s", bazKey, bazGroup.Key)
	}
	if bazGroup.I18nKey != "" {
		t.Errorf("Expected I18nKey empty, got %s", bazGroup.I18nKey)
	}
	
	if barGroup.Key == bazGroup.Key {
		t.Errorf("Two different single-language notes should have different keys")
	}
}
