package embedded

import (
	"embed"
)

//go:embed templates static static/_headers og
var FS embed.FS
