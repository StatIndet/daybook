package graph

import (
	"encoding/json"
	"fmt"
	"os"
)

type Node struct {
	ID     string   `json:"id"`
	Title  string   `json:"title"`
	URL    string   `json:"url"`
	Tags   []string `json:"tags"`
	Date   string   `json:"date"`
	Degree int      `json:"degree"`
	Exists bool     `json:"exists"`
}

type Link struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Type   string `json:"type"`
}

type Data struct {
	Nodes []Node `json:"nodes"`
	Links []Link `json:"links"`
}

type InputNode struct {
	ID    string
	Title string
	URL   string
	Tags  []string
	Date  string
}

type InputLink struct {
	Source string
	Target string // The slug of the target
	Exists bool
}

func BuildJSON(nodes []InputNode, links []InputLink, outputPath string) error {
	degreeMap := make(map[string]int)
	linkSet := make(map[string]bool)
	var finalLinks []Link

	for _, link := range links {
		if link.Source == link.Target {
			continue
		}

		key := link.Source + "|" + link.Target
		if linkSet[key] {
			continue
		}
		linkSet[key] = true

		finalLinks = append(finalLinks, Link{
			Source: link.Source,
			Target: link.Target,
			Type:   "wikilink",
		})

		degreeMap[link.Source]++
		degreeMap[link.Target]++
	}

	existsMap := make(map[string]bool)
	for _, node := range nodes {
		existsMap[node.ID] = true
	}

	for _, link := range links {
		if !link.Exists {
			existsMap[link.Target] = false
		}
	}

	var finalNodes []Node
	for _, node := range nodes {
		finalNodes = append(finalNodes, Node{
			ID:     node.ID,
			Title:  node.Title,
			URL:    node.URL,
			Tags:   node.Tags,
			Date:   node.Date,
			Degree: degreeMap[node.ID],
			Exists: true,
		})
	}

	// Add non-existent nodes that are targets of links
	for target, exists := range existsMap {
		if !exists {
			finalNodes = append(finalNodes, Node{
				ID:     target,
				Title:  target,
				URL:    "",
				Tags:   []string{},
				Date:   "",
				Degree: degreeMap[target],
				Exists: false,
			})
		}
	}

	data := Data{
		Nodes: finalNodes,
		Links: finalLinks,
	}

	if data.Nodes == nil {
		data.Nodes = []Node{}
	}
	if data.Links == nil {
		data.Links = []Link{}
	}

	file, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("create graph.json: %w", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(data); err != nil {
		return fmt.Errorf("encode graph.json: %w", err)
	}

	return nil
}
