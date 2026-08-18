package media

// MusicMetadata represents the data extracted from a ::music remote URL
type MusicMetadata struct {
	Title    string  `json:"title"`
	Artist   string  `json:"artist"`
	Duration float64 `json:"duration"`
	Cover    string  `json:"cover"` // Path to the generated cover image in public/generated/music/
}
