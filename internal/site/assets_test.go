package site

import (
	"bytes"
	"io/fs"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
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
		relativePath, err := relativeCSSAssetPath("/css/common.css", fingerprinted)
		if err != nil {
			t.Fatal(err)
		}
		if fingerprinted == "" || fingerprinted == original || !strings.Contains(string(output), relativePath) {
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
	for _, rule := range []string{"/immutable/css/components/giscus-*", "/immutable/vendor/fonts/*"} {
		if !strings.Contains(string(headers), rule+"\n  Access-Control-Allow-Origin: *") {
			t.Fatalf("missing cross-origin access for giscus assets: %s", rule)
		}
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
		relativePath, err := relativeCSSAssetPath("/vendor/fonts/noto-serif-sc/wght.css", fingerprinted)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(output), relativePath) {
			t.Fatalf("font %s missing from hashed CSS", fingerprinted)
		}
	}
	if fonts < 2 {
		t.Fatalf("expected existing CJK font shards to remain split, got %d", fonts)
	}
}

func TestCrossOriginStylesheetReferencesStayOnBlogOrigin(t *testing.T) {
	builder := assetBuilder{staticDir: "static", publicDir: t.TempDir(), manifest: map[string]string{}, processingCSS: map[string]bool{}}
	sourcePath := "/css/components/giscus-default-light.css"
	input := []byte(`@import url("../../vendor/fonts/noto-serif-sc/wght.css"); @font-face{src:url("/vendor/fonts/material-symbols/material-symbols-rounded.woff2")}`)
	output, err := builder.rewriteCSSImports(input, sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	output, err = builder.rewriteCSSURLs(output, sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	themeURL, err := url.Parse("https://blog.example" + fingerprintedAssetPath(sourcePath, output))
	if err != nil {
		t.Fatal(err)
	}
	for _, original := range []string{"/vendor/fonts/noto-serif-sc/wght.css", "/vendor/fonts/material-symbols/material-symbols-rounded.woff2"} {
		fingerprinted := builder.manifest[original]
		relativePath, err := relativeCSSAssetPath(sourcePath, fingerprinted)
		if err != nil {
			t.Fatal(err)
		}
		if fingerprinted == "" || !strings.Contains(string(output), relativePath) || strings.HasPrefix(relativePath, "/") {
			t.Fatalf("theme reference must be a relative hashed asset: %s in %s", original, output)
		}
		reference, err := url.Parse(relativePath)
		if err != nil {
			t.Fatal(err)
		}
		resolved := themeURL.ResolveReference(reference)
		if resolved.Host != "blog.example" || resolved.Path != fingerprinted {
			t.Fatalf("giscus iframe stylesheet reference resolved to %s, want blog origin and %s", resolved, fingerprinted)
		}
	}
	// Vendor CSS is another external stylesheet from the iframe's perspective;
	// its nested font references must also resolve against the blog URL.
	vendorPath := builder.manifest["/vendor/fonts/noto-serif-sc/wght.css"]
	vendorCSS, err := os.ReadFile(filepath.Join(builder.publicDir, filepath.FromSlash(strings.TrimPrefix(vendorPath, "/"))))
	if err != nil {
		t.Fatal(err)
	}
	for _, match := range cssURLPattern.FindAllStringSubmatch(string(vendorCSS), -1) {
		reference := match[1] + match[2] + match[3]
		if strings.HasPrefix(reference, "/") {
			t.Fatalf("nested font URL would resolve to the iframe origin: %s", reference)
		}
		resolved := path.Clean(path.Join(path.Dir(vendorPath), reference))
		if !strings.HasPrefix(resolved, "/immutable/vendor/fonts/") || !fileExists(filepath.Join(builder.publicDir, filepath.FromSlash(strings.TrimPrefix(resolved, "/")))) {
			t.Fatalf("nested font reference does not resolve to a published font: %s", reference)
		}
	}
}

func TestGeneratedGiscusThemesPublishAllFontDependencies(t *testing.T) {
	// Use an independent matcher so this regression test catches @imports that
	// the asset builder fails to recognize, including esbuild's @import"...".
	allImports := regexp.MustCompile(`(?i)@import[^;]+;`)
	for _, variant := range []string{"default-light", "default-dark", "warm-light", "warm-dark"} {
		t.Run(variant, func(t *testing.T) {
			builder := assetBuilder{staticDir: "static", publicDir: t.TempDir(), manifest: map[string]string{}, processingCSS: map[string]bool{}}
			originalPath := "/css/components/giscus-" + variant + ".css"
			source, err := fs.ReadFile(embedded.FS, builder.sourcePath(originalPath))
			if err != nil {
				t.Fatal(err)
			}
			sourceImports := allImports.FindAllString(string(source), -1)
			if len(sourceImports) == 0 {
				t.Fatal("generated giscus theme must include the blog's vendor font CSS")
			}
			publishedPath, err := builder.processCSSAsset(originalPath)
			if err != nil {
				t.Fatal(err)
			}
			published := readPublicAsset(t, builder.publicDir, publishedPath)
			publishedImports := allImports.FindAllString(published, -1)
			if len(publishedImports) != len(sourceImports) {
				t.Fatalf("published theme has %d imports, source has %d", len(publishedImports), len(sourceImports))
			}
			for index, rule := range publishedImports {
				_, _, sourceReference, sourceOK := importPathRange(sourceImports[index])
				_, _, publishedReference, publishedOK := importPathRange(rule)
				if !sourceOK || !publishedOK {
					t.Fatalf("could not parse CSS import: %s", rule)
				}
				originalImport, local := resolveImportedAssetPath(originalPath, sourceReference)
				if !local {
					t.Fatalf("vendor font import must be local: %s", sourceReference)
				}
				wantPath := builder.manifest[originalImport]
				assertPublishedCSSReference(t, builder.publicDir, publishedPath, publishedReference, wantPath)
			}
			// Check every built stylesheet, including imported CJK font shards,
			// so a valid top-level import cannot hide a broken nested font URL.
			fontReferences := 0
			for _, stylesheetPath := range builder.manifest {
				if !strings.HasSuffix(stylesheetPath, ".css") {
					continue
				}
				stylesheet := readPublicAsset(t, builder.publicDir, stylesheetPath)
				for _, match := range cssURLPattern.FindAllStringSubmatch(stylesheet, -1) {
					reference := match[1] + match[2] + match[3]
					if isExternalAssetPath(reference) {
						continue
					}
					assertPublishedCSSReference(t, builder.publicDir, stylesheetPath, reference, "")
					fontReferences++
				}
			}
			if fontReferences == 0 {
				t.Fatal("generated theme must publish its referenced font files")
			}
		})
	}
}

func assertPublishedCSSReference(t *testing.T, publicDir, stylesheetPath, reference, wantPath string) {
	t.Helper()
	stylesheetURL, err := url.Parse("https://blog.example" + stylesheetPath)
	if err != nil {
		t.Fatal(err)
	}
	parsedReference, err := url.Parse(reference)
	if err != nil {
		t.Fatal(err)
	}
	resolved := stylesheetURL.ResolveReference(parsedReference)
	if strings.HasPrefix(reference, "/") || resolved.Host != "blog.example" || !strings.HasPrefix(resolved.Path, "/immutable/vendor/fonts/") {
		t.Fatalf("CSS reference must resolve to a relative immutable font dependency on the blog origin: %s", reference)
	}
	if wantPath != "" && resolved.Path != wantPath {
		t.Fatalf("CSS import resolved to %s, want hashed path %s", resolved.Path, wantPath)
	}
	if !fileExists(filepath.Join(publicDir, filepath.FromSlash(strings.TrimPrefix(resolved.Path, "/")))) {
		t.Fatalf("CSS dependency has not been published: %s", resolved.Path)
	}
}
