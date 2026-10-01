package site

import (
	"bytes"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/StatIndet/daybook/internal/embedded"
)

func TestCSSURLsHashFontsAndTextureWithoutChangingVaultAssets(t *testing.T) {
	builder := assetBuilder{staticDir: "static", publicDir: t.TempDir(), manifest: map[string]string{}, processingCSS: map[string]bool{}}
	input := []byte(`@font-face{src:url("/vendor/fonts/material-symbols/material-symbols-rounded.woff2")}.paper{background:url('../images/settings-paper.webp')}.custom{background:url('/images/vault.png')}.external{background:url('https://example.com/paper.png')}`)
	output, err := builder.rewriteCSSURLs(input, "/css/common.css")
	if err != nil {
		t.Fatal(err)
	}
	for _, original := range []string{"/vendor/fonts/material-symbols/material-symbols-rounded.woff2", "/images/settings-paper.webp"} {
		fingerprinted := builder.manifest[original]
		if fingerprinted == "" || fingerprinted == original || !strings.Contains(string(output), fingerprinted) {
			t.Fatalf("missing content hash for %s in %s", original, output)
		}
		if !strings.HasPrefix(fingerprinted, "/immutable/") {
			t.Fatalf("versioned asset cannot use the immutable cache rule: %s", fingerprinted)
		}
		copied, err := os.ReadFile(filepath.Join(builder.publicDir, filepath.FromSlash(strings.TrimPrefix(fingerprinted, "/"))))
		if err != nil {
			t.Fatal(err)
		}
		source, err := fs.ReadFile(embedded.FS, builder.sourcePath(original))
		if err != nil || !bytes.Equal(copied, source) {
			t.Fatalf("hashed asset contents differ for %s: %v", original, err)
		}
	}
	for _, preserved := range []string{"/images/vault.png", "https://example.com/paper.png"} {
		if !strings.Contains(string(output), preserved) {
			t.Fatalf("custom/external asset URL changed: %s", output)
		}
	}
}

func TestStaticCopyIncludesDeploymentHeaders(t *testing.T) {
	publicDir := t.TempDir()
	if err := copyStaticDir("static", publicDir); err != nil {
		t.Fatal(err)
	}
	headers, err := os.ReadFile(filepath.Join(publicDir, "_headers"))
	if err != nil {
		t.Fatalf("cache rules must survive embedding and static output: %v", err)
	}
	if !strings.Contains(string(headers), "/immutable/*\n  Cache-Control: public, max-age=31536000, immutable") {
		t.Fatal("missing cache policy for content-addressed files")
	}
	if strings.Contains("\n"+string(headers), "\n/*\n  Cache-Control:") {
		t.Fatal("catch-all Cache-Control would merge with the immutable rule")
	}
}

func TestVendorFontCSSPropagatesFontHashes(t *testing.T) {
	builder := assetBuilder{staticDir: "static", publicDir: t.TempDir(), manifest: map[string]string{}, processingCSS: map[string]bool{}}
	cssPath, err := builder.processCSSAsset("/vendor/fonts/noto-serif-sc/wght.css")
	if err != nil {
		t.Fatal(err)
	}
	output, err := os.ReadFile(filepath.Join(builder.publicDir, filepath.FromSlash(strings.TrimPrefix(cssPath, "/"))))
	if err != nil {
		t.Fatal(err)
	}
	fonts := 0
	for original, fingerprinted := range builder.manifest {
		if !strings.HasSuffix(original, ".woff2") {
			continue
		}
		fonts++
		if !strings.Contains(string(output), fingerprinted) {
			t.Fatalf("font %s missing from hashed CSS", fingerprinted)
		}
	}
	if fonts < 2 {
		t.Fatalf("expected existing CJK font shards to remain split, got %d", fonts)
	}
}
