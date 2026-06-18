package graph

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildJSON(t *testing.T) {
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "graph.json")

	nodes := []InputNode{
		{ID: "node1", Title: "Node 1", URL: "/node1"},
		{ID: "node2", Title: "Node 2", URL: "/node2"},
	}

	links := []InputLink{
		{Source: "node1", Target: "node2", Exists: true},
		{Source: "node1", Target: "node2", Exists: true}, // Duplicate
		{Source: "node2", Target: "node2", Exists: true}, // Self-link
		{Source: "node1", Target: "node3", Exists: false}, // Target doesn't exist
	}

	err := BuildJSON(nodes, links, outputPath)
	if err != nil {
		t.Fatalf("BuildJSON failed: %v", err)
	}

	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("Failed to read output: %v", err)
	}

	var data Data
	if err := json.Unmarshal(content, &data); err != nil {
		t.Fatalf("Failed to parse JSON: %v", err)
	}

	if len(data.Links) != 2 {
		t.Fatalf("Expected 2 links after deduplication, got %d", len(data.Links))
	}
	if data.Links[0].Source != "node1" || data.Links[0].Target != "node2" {
		t.Fatalf("Unexpected first link: %+v", data.Links[0])
	}
	if data.Links[1].Source != "node1" || data.Links[1].Target != "node3" {
		t.Fatalf("Unexpected second link: %+v", data.Links[1])
	}

	if len(data.Nodes) != 3 {
		t.Fatalf("Expected 3 nodes (2 exists, 1 missing), got %d", len(data.Nodes))
	}

	degreeMap := make(map[string]int)
	existsMap := make(map[string]bool)
	for _, n := range data.Nodes {
		degreeMap[n.ID] = n.Degree
		existsMap[n.ID] = n.Exists
	}

	if degreeMap["node1"] != 2 {
		t.Errorf("Expected node1 degree 2, got %d", degreeMap["node1"])
	}
	if degreeMap["node2"] != 1 {
		t.Errorf("Expected node2 degree 1, got %d", degreeMap["node2"])
	}
	if degreeMap["node3"] != 1 {
		t.Errorf("Expected node3 degree 1, got %d", degreeMap["node3"])
	}

	if !existsMap["node1"] || !existsMap["node2"] {
		t.Errorf("node1 and node2 should exist")
	}
	if existsMap["node3"] {
		t.Errorf("node3 should not exist")
	}
}
