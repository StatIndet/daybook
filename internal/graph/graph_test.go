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
		{Source: "B", Target: "A", Exists: true}, // B->A duplicate reverse
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
	
	if len(data.Links) != 2 {
		t.Fatalf("Expected 2 links, got %d", len(data.Links))
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
