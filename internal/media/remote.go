package media

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/StatIndet/daybook/internal/media/flac"
)

const maxMetadataBytes = 2 * 1024 * 1024 // 2MB

// FetchMusicMetadata reads a remote FLAC file partially using Range requests
// and extracts metadata. It saves the cover into publicDir/generated/music/
func FetchMusicMetadata(urlStr string, publicDir string) (MusicMetadata, error) {
	meta := MusicMetadata{}
	
	if !strings.HasPrefix(urlStr, "http://") && !strings.HasPrefix(urlStr, "https://") {
		return meta, fmt.Errorf("invalid scheme, only http/https allowed")
	}

	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return meta, err
	}

	// Request just enough to get headers and metadata blocks
	req.Header.Set("Range", fmt.Sprintf("bytes=0-%d", maxMetadataBytes))

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return meta, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return meta, fmt.Errorf("unexpected HTTP status: %d", resp.StatusCode)
	}

	// Use a LimitReader to ensure we don't read more than maxMetadataBytes,
	// even if the server ignores our Range request.
	limitedReader := io.LimitReader(resp.Body, int64(maxMetadataBytes))

	flacMeta, err := flac.Parse(limitedReader)
	if err != nil {
		return meta, fmt.Errorf("failed to parse FLAC metadata: %w", err)
	}

	meta.Duration = flacMeta.Duration
	meta.Title = flacMeta.Title
	meta.Artist = flacMeta.Artist

	if len(flacMeta.CoverData) > 0 {
		hash := sha256.Sum256([]byte(urlStr))
		hashStr := hex.EncodeToString(hash[:])[:12]
		
		ext := ".jpg"
		if strings.Contains(strings.ToLower(flacMeta.CoverMime), "png") {
			ext = ".png"
		} else if strings.Contains(strings.ToLower(flacMeta.CoverMime), "webp") {
			ext = ".webp"
		}

		filename := hashStr + ext
		outDir := filepath.Join(publicDir, "generated", "music")
		if err := os.MkdirAll(outDir, 0755); err != nil {
			return meta, fmt.Errorf("failed to create music cover dir: %w", err)
		}

		outPath := filepath.Join(outDir, filename)
		if err := os.WriteFile(outPath, flacMeta.CoverData, 0644); err != nil {
			return meta, fmt.Errorf("failed to write cover image: %w", err)
		}

		meta.Cover = "/generated/music/" + filename
	}

	return meta, nil
}
