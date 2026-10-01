package embedded

import (
	"embed"
)

//go:embed templates static static/_headers
var FS embed.FS
