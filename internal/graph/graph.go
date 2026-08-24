package graph

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"os"
)

type TagNode struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type AttachmentNode struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	URL   string `json:"url"`
}

type Node struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	URL         string           `json:"url"`
	Tags        []TagNode        `json:"tags"`
	Attachments []AttachmentNode `json:"attachments,omitempty"`
	Date        string           `json:"date"`
	Degree      int              `json:"degree"`
	Exists      bool             `json:"exists"`
}

type Link struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Type   string `json:"type"`
}

type GraphMeta struct {
	NodeCount      int     `json:"nodeCount"`
	LinkCount      int     `json:"linkCount"`
	MaxDegree      int     `json:"maxDegree"`
	LayoutDiameter float64 `json:"layoutDiameter"`
}

type Data struct {
	Nodes []Node    `json:"nodes"`
	Links []Link    `json:"links"`
	Meta  GraphMeta `json:"meta"`
}

type InputNode struct {
	ID          string
	Title       string
	URL         string
	Tags        []TagNode
	Attachments []AttachmentNode
	Date        string
}

type InputLink struct {
	Source string
	Target string // The slug of the target
	Exists bool
}

func computeLayoutDiameter(nodeCount int, linkCount int, maxDegree int) float64 {
	if nodeCount <= 0 {
		return 1.0
	}
	
	diameter := math.Sqrt(float64(nodeCount))
	
	// Adjust slightly for density
	avgDegree := 0.0
	if nodeCount > 0 {
		avgDegree = float64(linkCount*2) / float64(nodeCount)
	}
	
	if avgDegree > 2.0 {
		diameter *= 1.1 // Give a bit more space for dense graphs
	}
	
	// Add some safety clamping
	if diameter < 2.5 {
		diameter = 2.5 // Minimum logical extent for very small graphs
	}
	
	return diameter
}

func BuildJSON(nodes []InputNode, links []InputLink, outputPath string) error {
	degreeMap := make(map[string]int)
	linkSet := make(map[string]bool)
	var finalLinks []Link

	// 1. Canonicalize undirected edges and deduplicate
	for _, link := range links {
		if link.Source == link.Target {
			continue // ignore self-link
		}
		
		a := link.Source
		b := link.Target
		
		if a > b {
			a, b = b, a
		}

		key := a + "|" + b
		if linkSet[key] {
			continue // duplicate undirected edge
		}
		linkSet[key] = true

		finalLinks = append(finalLinks, Link{
			Source: link.Source,
			Target: link.Target, // Keep original directedness for source/target fields, but effectively it's one edge
			Type:   "wikilink",
		})
	}

	// 2. Calculate degree strictly from finalLinks
	for _, link := range finalLinks {
		degreeMap[link.Source]++
		degreeMap[link.Target]++
	}

	existsMap := make(map[string]bool)
	seenIDs := make(map[string]bool)
	
	var finalNodes []Node
	for _, node := range nodes {
		if strings.TrimSpace(node.ID) == "" {
			return fmt.Errorf("graph node has empty id: %q", node.Title)
		}
		if seenIDs[node.ID] {
			return fmt.Errorf("duplicate graph node id: %q", node.ID)
		}
		seenIDs[node.ID] = true
		existsMap[node.ID] = true
		
		finalNodes = append(finalNodes, Node{
			ID:          node.ID,
			Title:       node.Title,
			URL:         node.URL,
			Tags:        node.Tags,
			Attachments: node.Attachments,
			Date:        node.Date,
			Degree:      degreeMap[node.ID],
			Exists:      true,
		})
	}

	// 3. Process missing nodes
	for _, link := range links {
		if !link.Exists {
			// Initialize as false if not explicitly added by nodes
			if _, ok := existsMap[link.Target]; !ok {
				existsMap[link.Target] = false
			}
		}
	}

	// Add non-existent nodes that are targets of links
	for target, exists := range existsMap {
		if !exists {
			finalNodes = append(finalNodes, Node{
				ID:     target,
				Title:  target,
				URL:    "",
				Tags:   []TagNode{},
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

	diameter := computeLayoutDiameter(len(finalNodes), len(finalLinks), maxDegree)

	meta := GraphMeta{
		NodeCount:      len(finalNodes),
		LinkCount:      len(finalLinks),
		MaxDegree:      maxDegree,
		LayoutDiameter: diameter,
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
