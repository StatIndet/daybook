package markdown

import "github.com/StatIndet/daybook/internal/media"

var musicMetadataRegistry map[string]media.MusicMetadata

func SetMusicMetadataRegistry(registry map[string]media.MusicMetadata) {
	musicMetadataRegistry = registry
}

func GetMusicMetadata(urlStr string) (media.MusicMetadata, bool) {
	if musicMetadataRegistry == nil {
		return media.MusicMetadata{}, false
	}
	meta, ok := musicMetadataRegistry[urlStr]
	return meta, ok
}
