package graph

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildJSON_EmptyID(t *testing.T) {
	nodes := []InputNode{
		{ID: "", Title: "Empty"},
	}
	err := BuildJSON(nodes, nil, "dummy.json")
	if err == nil {
		t.Errorf("Expected error for empty ID, got nil")
	}
}

func TestBuildJSON_DuplicateID(t *testing.T) {
	nodes := []InputNode{
		{ID: "A", Title: "A1"},
		{ID: "A", Title: "A2"},
	}
	err := BuildJSON(nodes, nil, "dummy.json")
	if err == nil {
		t.Errorf("Expected error for duplicate ID, got nil")
	}
}

func TestBuildJSON_EdgeCases(t *testing.T) {
	nodes := []InputNode{
		{ID: "A"},
		{ID: "B"},
		{ID: "C"},
	}
	links := []InputLink{
		{Source: "A", Target: "A", Exists: true}, // Self edge
		{Source: "A", Target: "B", Exists: true}, // A->B
		{Source: "A", Target: "B", Exists: true}, // A->B duplicate
		{Source: "B", Target: "A", Exists: true}, // B->A is a distinct citation
		{Source: "A", Target: "C", Exists: true}, // A->C
	}

	tmpDir := t.TempDir()
	out := filepath.Join(tmpDir, "graph.json")
	err := BuildJSON(nodes, links, out)
	if err != nil {
		t.Fatalf("BuildJSON failed: %v", err)
	}

	b, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("Failed to read output: %v", err)
	}

	var data Data
	if err := json.Unmarshal(b, &data); err != nil {
		t.Fatalf("Failed to unmarshal output: %v", err)
	}

	if data.Version != 1 || len(data.Links) != 3 {
		t.Fatalf("Expected v1 graph with 3 directed links, got %+v", data)
	}

	degree := make(map[string]int)
	for _, n := range data.Nodes {
		degree[n.ID] = n.Degree
	}

	if degree["A"] != 2 {
		t.Errorf("Expected A degree 2, got %d", degree["A"])
	}
	if degree["B"] != 1 {
		t.Errorf("Expected B degree 1, got %d", degree["B"])
	}
	if degree["C"] != 1 {
		t.Errorf("Expected C degree 1, got %d", degree["C"])
	}
}

func TestBuildJSONKeepsSameNamedContentDistinct(t *testing.T) {
	out := filepath.Join(t.TempDir(), "graph.json")
	err := BuildJSON([]InputNode{
		{ID: "/notes/foo/", Title: "foo", URL: "/notes/foo/"},
		{ID: "/memos/foo/", Title: "foo", URL: "/memos/foo/"},
		{ID: "/en_US/memos/foo/", Title: "foo", URL: "/en_US/memos/foo/"},
	}, []InputLink{
		{Source: "/notes/foo/", Target: "/memos/foo/", Exists: true},
		{Source: "/memos/foo/", Target: "/notes/foo/", Exists: true},
		{Source: "/en_US/memos/foo/", Target: "/notes/foo/", Exists: true},
	}, out)
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	var graph Data
	if err := json.Unmarshal(b, &graph); err != nil {
		t.Fatal(err)
	}
	if len(graph.Nodes) != 3 || len(graph.Links) != 3 || graph.Nodes[0].Degree != 2 {
		t.Fatalf("graph conflated content with the same filename: %+v", graph)
	}
}
