package embedded

import (
	"embed"
)

//go:embed templates static
var FS embed.FS
