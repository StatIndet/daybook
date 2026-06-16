package site

import (
	"testing"

	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/render"
)

func TestMonthGroups(t *testing.T) {
	notes := []render.NoteLink{
		{Title: "A", Date: "2026-06-14"},
		{Title: "B", Date: "2026-06-01"},
		{Title: "C", Date: "2026-05-30"},
	}

	groups := monthGroups(notes)
	if len(groups) != 2 {
		t.Fatalf("groups length = %d, want 2", len(groups))
	}
	if groups[0].Key != "2026-06" || groups[0].Label != "2026 年 06 月" || len(groups[0].Notes) != 2 {
		t.Fatalf("first group = %#v, want June group with two notes", groups[0])
	}
	if groups[1].Key != "2026-05" || len(groups[1].Notes) != 1 {
		t.Fatalf("second group = %#v, want May group with one note", groups[1])
	}
}

func TestCollectTagLinks(t *testing.T) {
	notes := []content.Note{
		{Tags: []string{"ssh", "debian", "ssh"}},
		{Tags: []string{"Debian", "虚拟机"}},
		{Tags: []string{"  ", "Go"}},
	}

	tags := collectTagLinks(notes)
	wantNames := []string{"debian", "Go", "ssh", "虚拟机"}

	if len(tags) != len(wantNames) {
		t.Fatalf("tags length = %d, want %d: %#v", len(tags), len(wantNames), tags)
	}
	for index, wantName := range wantNames {
		if tags[index].Name != wantName {
			t.Fatalf("tag %d name = %q, want %q", index, tags[index].Name, wantName)
		}
		if tags[index].Index != index {
			t.Fatalf("tag %d Index = %d, want %d", index, tags[index].Index, index)
		}
		if tags[index].ReverseIndex != len(wantNames)-index-1 {
			t.Fatalf("tag %d ReverseIndex = %d, want %d", index, tags[index].ReverseIndex, len(wantNames)-index-1)
		}
	}
	if tags[3].URL != "/notes/?tag=%E8%99%9A%E6%8B%9F%E6%9C%BA" {
		t.Fatalf("Chinese tag URL = %q", tags[3].URL)
	}
}
