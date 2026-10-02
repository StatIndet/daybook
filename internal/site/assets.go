package site

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/StatIndet/daybook/internal/embedded"
	"github.com/StatIndet/daybook/internal/render"
	"io/fs"
)

const assetHashLength = 10

var cssImportRulePattern = regexp.MustCompile(`(?i)@import\s*(?:"[^"]*"|'[^']*'|url\([^)]*\))[^;]*;`)
var cssURLPattern = regexp.MustCompile(`(?i)url\(\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\)\s]*))\s*\)`)

type assetBuilder struct {
	staticDir     string
	publicDir     string
	manifest      map[string]string
	processingCSS map[string]bool
}

func buildAssets(staticDir, publicDir string) (render.Assets, error) {
	builder := assetBuilder{
		staticDir:     staticDir,
		publicDir:     publicDir,
		manifest:      make(map[string]string),
		processingCSS: make(map[string]bool),
	}

	cssFiles, err := findAssetFiles(staticDir, "css", ".css")
	if err != nil {
		return render.Assets{}, err
	}
	for _, webPath := range cssFiles {
		if _, err := builder.processCSSAsset(webPath); err != nil {
			return render.Assets{}, err
		}
	}
	// Vendor CSS contains @font-face declarations for the existing CJK shards.
	// Hash their URLs as well so font updates invalidate the cached stylesheet.
	vendorCSS, err := findAssetFiles(staticDir, "vendor", ".css")
	if err != nil {
		return render.Assets{}, err
	}
	for _, webPath := range vendorCSS {
		if _, err := builder.processCSSAsset(webPath); err != nil {
			return render.Assets{}, err
		}
	}

	jsFiles, err := findAssetFiles(staticDir, "js", ".js")
	if err != nil {
		return render.Assets{}, err
	}
	for _, webPath := range jsFiles {
		if _, err := builder.processJSAsset(webPath); err != nil {
			return render.Assets{}, err
		}
	}
	if err := requireTemplateAssets(builder.manifest); err != nil {
		return render.Assets{}, err
	}

	assets := render.Assets{Paths: copyManifest(builder.manifest)}
	if err := writeAssetsManifest(publicDir, assets.Paths); err != nil {
		return render.Assets{}, err
	}

	return assets, nil
}

func requireTemplateAssets(manifest map[string]string) error {
	requiredPaths := []string{
		"/css/global.css",
		"/js/theme.js",
		"/js/code-copy.js",
		"/js/toc.js",
		"/js/heading-anchors.js",
		"/js/note-filters.js",
		"/js/lightbox.js",
		"/js/mermaid-loader.js",
		"/js/gallery.js",
		"/js/embeds.js",
		"/js/page-transition-engine.js",
		"/js/graph-loader.js",
		"/js/mobile-drawer.js",
		"/js/search-overlay.js",
		"/js/daybook-router.js",
		"/js/katex-loader.js",
		"/js/giscus-loader.js",
		"/css/components/giscus-default-light.css",
		"/css/components/giscus-default-dark.css",
		"/css/components/giscus-warm-light.css",
		"/css/components/giscus-warm-dark.css",
	}

	for _, originalPath := range requiredPaths {
		if _, ok := manifest[originalPath]; !ok {
			return fmt.Errorf("缺少模板引用的静态资源: %s", originalPath)
		}
	}
	return nil
}

func copyStaticDir(sourceDir, targetDir string) error {
	return copyEmbeddedDirFiltered(sourceDir, targetDir, func(relativePath string, entry fs.DirEntry) bool {
		if entry.IsDir() {
			return false
		}

		relativePath = filepath.ToSlash(relativePath)
		lowerPath := strings.ToLower(relativePath)
		return strings.HasPrefix(lowerPath, "css/") && strings.HasSuffix(lowerPath, ".css") ||
			strings.HasPrefix(lowerPath, "js/") && strings.HasSuffix(lowerPath, ".js")
	})
}

func findAssetFiles(staticDir, subDir, ext string) ([]string, error) {
	root := path.Join(staticDir, subDir)
	var files []string
	err := fs.WalkDir(embedded.FS, root, func(filePath string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() || !entry.Type().IsRegular() {
			return nil
		}
		if !strings.EqualFold(path.Ext(filePath), ext) {
			return nil
		}
		relativePath := filePath
		if strings.HasPrefix(filePath, staticDir+"/") {
			relativePath = filePath[len(staticDir)+1:]
		}
		files = append(files, "/"+relativePath)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	return files, nil
}

func (builder *assetBuilder) processCSSAsset(webPath string) (string, error) {
	webPath = cleanAssetWebPath(webPath)
	if fingerprintedPath, ok := builder.manifest[webPath]; ok {
		return fingerprintedPath, nil
	}
	if builder.processingCSS[webPath] {
		return "", fmt.Errorf("发现循环 CSS @import: %s", webPath)
	}

	builder.processingCSS[webPath] = true
	defer delete(builder.processingCSS, webPath)

	sourcePath := builder.sourcePath(webPath)
	content, err := fs.ReadFile(embedded.FS, sourcePath)
	if err != nil {
		return "", fmt.Errorf("读取 CSS 资源 %s: %w", webPath, err)
	}

	rewritten, err := builder.rewriteCSSImports(content, webPath)
	if err != nil {
		return "", err
	}
	rewritten, err = builder.rewriteCSSURLs(rewritten, webPath)
	if err != nil {
		return "", err
	}

	fingerprintedPath := fingerprintedAssetPath(webPath, rewritten)
	if err := writePublicAsset(builder.publicDir, fingerprintedPath, rewritten); err != nil {
		return "", err
	}

	builder.manifest[webPath] = fingerprintedPath
	return fingerprintedPath, nil
}

func (builder *assetBuilder) rewriteCSSURLs(content []byte, currentWebPath string) ([]byte, error) {
	var rewriteErr error
	rewritten := cssURLPattern.ReplaceAllStringFunc(string(content), func(rule string) string {
		if rewriteErr != nil {
			return rule
		}
		match := cssURLPattern.FindStringSubmatch(rule)
		assetURL := match[1] + match[2] + match[3]
		if assetURL == "" || strings.HasPrefix(assetURL, "#") || isExternalAssetPath(assetURL) {
			return rule
		}
		// @import url(...) was already rewritten relative to the output CSS
		// directory. Do not interpret it again relative to the source tree.
		if builder.isBuiltCSSReference(currentWebPath, assetURL) {
			return rule
		}
		assetPath, suffix, _ := strings.Cut(assetURL, "?")
		if suffix != "" {
			suffix = "?" + suffix
		}
		assetPath, fragment, _ := strings.Cut(assetPath, "#")
		if fragment != "" {
			suffix = "#" + fragment + suffix
		}
		webPath, local := resolveImportedAssetPath(currentWebPath, assetPath)
		if !local || path.Ext(webPath) == "" {
			return rule
		}
		fingerprinted, ok := builder.manifest[webPath]
		if !ok {
			// Custom vault assets are copied separately; leave those URLs intact.
			asset, err := fs.ReadFile(embedded.FS, builder.sourcePath(webPath))
			if os.IsNotExist(err) {
				return rule
			}
			if err != nil {
				rewriteErr = fmt.Errorf("读取 CSS 引用资源 %s: %w", webPath, err)
				return rule
			}
			if strings.EqualFold(path.Ext(webPath), ".css") {
				fingerprinted, rewriteErr = builder.processCSSAsset(webPath)
			} else {
				fingerprinted = fingerprintedAssetPath(webPath, asset)
				rewriteErr = writePublicAsset(builder.publicDir, fingerprinted, asset)
				if rewriteErr == nil {
					builder.manifest[webPath] = fingerprinted
				}
			}
			if rewriteErr != nil {
				return rule
			}
		}
		relativePath, err := relativeCSSAssetPath(currentWebPath, fingerprinted)
		if err != nil {
			rewriteErr = err
			return rule
		}
		return `url("` + relativePath + suffix + `")`
	})
	return []byte(rewritten), rewriteErr
}

func (builder *assetBuilder) processJSAsset(webPath string) (string, error) {
	webPath = cleanAssetWebPath(webPath)
	if fingerprintedPath, ok := builder.manifest[webPath]; ok {
		return fingerprintedPath, nil
	}

	sourcePath := builder.sourcePath(webPath)
	content, err := fs.ReadFile(embedded.FS, sourcePath)
	if err != nil {
		return "", fmt.Errorf("读取 JS 资源 %s: %w", webPath, err)
	}

	fingerprintedPath := fingerprintedAssetPath(webPath, content)
	if err := writePublicAsset(builder.publicDir, fingerprintedPath, content); err != nil {
		return "", err
	}

	builder.manifest[webPath] = fingerprintedPath
	return fingerprintedPath, nil
}

func (builder *assetBuilder) rewriteCSSImports(content []byte, currentWebPath string) ([]byte, error) {
	text := string(content)
	matches := cssImportRulePattern.FindAllStringIndex(text, -1)
	if len(matches) == 0 {
		return content, nil
	}

	var rewritten strings.Builder
	rewritten.Grow(len(text))
	lastIndex := 0

	for _, match := range matches {
		rewritten.WriteString(text[lastIndex:match[0]])

		rule := text[match[0]:match[1]]
		nextRule, err := builder.rewriteImportRule(rule, currentWebPath)
		if err != nil {
			return nil, err
		}
		rewritten.WriteString(nextRule)
		lastIndex = match[1]
	}

	rewritten.WriteString(text[lastIndex:])
	return []byte(rewritten.String()), nil
}

func (builder *assetBuilder) rewriteImportRule(rule, currentWebPath string) (string, error) {
	start, end, importPath, ok := importPathRange(rule)
	if !ok {
		return rule, nil
	}

	fingerprintedPath, shouldRewrite, err := builder.fingerprintImportedCSS(importPath, currentWebPath)
	if err != nil {
		return "", err
	}
	if !shouldRewrite {
		return rule, nil
	}

	relativePath, err := relativeCSSAssetPath(currentWebPath, fingerprintedPath)
	if err != nil {
		return "", err
	}
	return rule[:start] + relativePath + rule[end:], nil
}

func (builder *assetBuilder) fingerprintImportedCSS(importPath, currentWebPath string) (string, bool, error) {
	importedWebPath, isLocal := resolveImportedAssetPath(currentWebPath, importPath)
	if !isLocal {
		return "", false, nil
	}
	if (!strings.HasPrefix(importedWebPath, "/css/") && !strings.HasPrefix(importedWebPath, "/vendor/")) ||
		!strings.EqualFold(path.Ext(importedWebPath), ".css") {
		return "", false, nil
	}

	fingerprintedPath, err := builder.processCSSAsset(importedWebPath)
	if err != nil {
		return "", true, fmt.Errorf("处理 CSS import %q: %w", importPath, err)
	}
	return fingerprintedPath, true, nil
}

// Every generated stylesheet lives below /immutable with its original directory
// structure. Relative references keep custom giscus CSS and fonts on the blog's
// origin when the stylesheet is loaded inside the giscus.app iframe.
func relativeCSSAssetPath(currentWebPath, targetPath string) (string, error) {
	outputDir := path.Join("/immutable", path.Dir(cleanAssetWebPath(currentWebPath)))
	relativePath, err := filepath.Rel(filepath.FromSlash(outputDir), filepath.FromSlash(targetPath))
	if err != nil {
		return "", fmt.Errorf("生成 CSS 相对资源路径 %s: %w", targetPath, err)
	}
	return filepath.ToSlash(relativePath), nil
}

func (builder *assetBuilder) isBuiltCSSReference(currentWebPath, assetURL string) bool {
	outputDir := path.Join("/immutable", path.Dir(cleanAssetWebPath(currentWebPath)))
	resolved := path.Clean(path.Join(outputDir, assetURL))
	for _, builtPath := range builder.manifest {
		if builtPath == resolved {
			return true
		}
	}
	return false
}

func importPathRange(rule string) (int, int, string, bool) {
	if len(rule) < len("@import") || !strings.EqualFold(rule[:len("@import")], "@import") {
		return 0, 0, "", false
	}

	index := skipCSSSpaces(rule, len("@import"))
	if hasPrefixFold(rule[index:], "url(") {
		index += len("url(")
		index = skipCSSSpaces(rule, index)
		if index >= len(rule) {
			return 0, 0, "", false
		}

		if rule[index] == '"' || rule[index] == '\'' {
			quote := rule[index]
			start := index + 1
			endOffset := strings.IndexByte(rule[start:], quote)
			if endOffset < 0 {
				return 0, 0, "", false
			}
			end := start + endOffset
			return start, end, rule[start:end], true
		}

		closeOffset := strings.IndexByte(rule[index:], ')')
		if closeOffset < 0 {
			return 0, 0, "", false
		}
		start := index
		end := trimCSSSpacesRight(rule, start, index+closeOffset)
		return start, end, rule[start:end], true
	}

	if index < len(rule) && (rule[index] == '"' || rule[index] == '\'') {
		quote := rule[index]
		start := index + 1
		endOffset := strings.IndexByte(rule[start:], quote)
		if endOffset < 0 {
			return 0, 0, "", false
		}
		end := start + endOffset
		return start, end, rule[start:end], true
	}

	return 0, 0, "", false
}

func resolveImportedAssetPath(currentWebPath, importPath string) (string, bool) {
	importPath = strings.TrimSpace(importPath)
	if importPath == "" || isExternalAssetPath(importPath) {
		return "", false
	}

	if strings.HasPrefix(importPath, "/") {
		return cleanAssetWebPath(importPath), true
	}

	return cleanAssetWebPath(path.Join(path.Dir(currentWebPath), importPath)), true
}

func isExternalAssetPath(assetPath string) bool {
	lowerPath := strings.ToLower(assetPath)
	return strings.HasPrefix(lowerPath, "http://") ||
		strings.HasPrefix(lowerPath, "https://") ||
		strings.HasPrefix(lowerPath, "data:") ||
		strings.HasPrefix(assetPath, "//")
}

func cleanAssetWebPath(webPath string) string {
	if webPath == "" {
		return "/"
	}
	if strings.HasPrefix(webPath, "/") {
		return path.Clean(webPath)
	}
	return path.Clean("/" + webPath)
}

func (builder *assetBuilder) sourcePath(webPath string) string {
	webPath = cleanAssetWebPath(webPath)
	return path.Join(builder.staticDir, strings.TrimPrefix(webPath, "/"))
}

func fingerprintedAssetPath(webPath string, content []byte) string {
	extension := path.Ext(webPath)
	baseName := strings.TrimSuffix(path.Base(webPath), extension)
	sum := sha256.Sum256(content)
	hash := hex.EncodeToString(sum[:])[:assetHashLength]
	// Keep content-addressed files separate from unversioned vendor/vault files.
	// A single cache rule can then safely mark only this namespace immutable.
	return path.Join("/immutable", path.Dir(webPath), baseName+"."+hash+extension)
}

func writePublicAsset(publicDir, webPath string, content []byte) error {
	targetPath := filepath.Join(publicDir, filepath.FromSlash(strings.TrimPrefix(webPath, "/")))
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("创建资源输出目录: %w", err)
	}
	if err := os.WriteFile(targetPath, content, 0644); err != nil {
		return fmt.Errorf("写入资源文件 %s: %w", webPath, err)
	}
	return nil
}

func writeAssetsManifest(publicDir string, manifest map[string]string) error {
	content, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("生成 assets manifest: %w", err)
	}
	content = append(content, '\n')
	if err := writePublicAsset(publicDir, "/assets-manifest.json", content); err != nil {
		return err
	}
	return nil
}

func copyManifest(manifest map[string]string) map[string]string {
	result := make(map[string]string, len(manifest))
	for originalPath, fingerprintedPath := range manifest {
		result[originalPath] = fingerprintedPath
	}
	return result
}

func hasPrefixFold(text, prefix string) bool {
	if len(text) < len(prefix) {
		return false
	}
	return strings.EqualFold(text[:len(prefix)], prefix)
}

func skipCSSSpaces(text string, index int) int {
	for index < len(text) && isCSSSpace(text[index]) {
		index++
	}
	return index
}

func trimCSSSpacesRight(text string, start, end int) int {
	for end > start && isCSSSpace(text[end-1]) {
		end--
	}
	return end
}

func isCSSSpace(char byte) bool {
	return char == ' ' || char == '\n' || char == '\r' || char == '\t' || char == '\f'
}

func copyEmbeddedDirFiltered(sourceDir, targetDir string, skip func(string, fs.DirEntry) bool) error {
	return fs.WalkDir(embedded.FS, sourceDir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relativePath := path
		if path == sourceDir {
			relativePath = "."
		} else if strings.HasPrefix(path, sourceDir+"/") {
			relativePath = path[len(sourceDir)+1:]
		}

		if skip != nil && skip(relativePath, entry) {
			if entry.IsDir() {
				return fs.SkipDir
			}
			return nil
		}

		if relativePath == "." {
			return nil
		}

		targetPath := filepath.Join(targetDir, filepath.FromSlash(relativePath))

		if entry.IsDir() {
			return os.MkdirAll(targetPath, 0755)
		}

		content, err := fs.ReadFile(embedded.FS, path)
		if err != nil {
			return fmt.Errorf("复制 static 文件 %s: %w", path, err)
		}
		if err := os.WriteFile(targetPath, content, 0644); err != nil {
			return fmt.Errorf("写入 static 文件 %s: %w", targetPath, err)
		}

		return nil
	})
}
