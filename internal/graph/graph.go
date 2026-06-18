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

type GraphMeta struct {
	NodeCount    int     `json:"nodeCount"`
	LinkCount    int     `json:"linkCount"`
	MaxDegree    int     `json:"maxDegree"`
	DefaultScale float64 `json:"defaultScale"`
}

type Data struct {
	Nodes []Node    `json:"nodes"`
	Links []Link    `json:"links"`
	Meta  GraphMeta `json:"meta"`
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

func computeDefaultGraphScale(nodeCount int, maxDegree int) float64 {
	if nodeCount <= 0 {
		return 1.0
	}

	var scale float64

	switch {
	case nodeCount <= 10:
		scale = 1.75
	case nodeCount <= 20:
		if maxDegree >= 3 {
			scale = 1.60
		} else {
			scale = 1.45
		}
	case nodeCount <= 40:
		if maxDegree >= 4 {
			scale = 1.40
		} else {
			scale = 1.25
		}
	case nodeCount <= 80:
		scale = 1.10
	default:
		scale = 1.00
	}

	if scale < 0.9 {
		scale = 0.9
	}
	if scale > 1.8 {
		scale = 1.8
	}

	return scale
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

	maxDegree := 0
	for _, n := range finalNodes {
		if n.Degree > maxDegree {
			maxDegree = n.Degree
		}
	}

	scale := computeDefaultGraphScale(len(finalNodes), maxDegree)

	meta := GraphMeta{
		NodeCount:    len(finalNodes),
		LinkCount:    len(finalLinks),
		MaxDegree:    maxDegree,
		DefaultScale: scale,
	}

	data := Data{
		Nodes: finalNodes,
		Links: finalLinks,
		Meta:  meta,
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
