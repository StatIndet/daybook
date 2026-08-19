package main
import (
	"os"
	"strings"
)
func main() {
	content, _ := os.ReadFile("internal/site/site.go")
	s := string(content)
	
	// rename current copyDirFiltered to copyEmbeddedDirFiltered
	s = strings.Replace(s, "func copyDirFiltered(sourceDir, targetDir string, skip func(string, fs.DirEntry) bool) error {", "func copyEmbeddedDirFiltered(sourceDir, targetDir string, skip func(string, fs.DirEntry) bool) error {", 1)
	
	// Add back copyDirFiltered for OS files
	osCopy := `func copyDirFiltered(sourceDir, targetDir string, skip func(string, os.DirEntry) bool) error {
	if _, err := os.Stat(sourceDir); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return fmt.Errorf("读取 static 目录: %w", err)
	}

	return filepath.WalkDir(sourceDir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("读取 static 路径 %s: %w", path, err)
		}

		relativePath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return fmt.Errorf("计算 static 相对路径: %w", err)
		}
		if skip != nil && skip(relativePath, entry) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		targetPath := filepath.Join(targetDir, relativePath)

		if entry.IsDir() {
			return os.MkdirAll(targetPath, 0755)
		}

		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("复制 static 文件 %s: %w", path, err)
		}
		if err := os.WriteFile(targetPath, content, 0644); err != nil {
			return fmt.Errorf("写入 static 文件 %s: %w", targetPath, err)
		}

		return nil
	})
}`
	s = strings.Replace(s, "func copyAttachments", osCopy+"\n\nfunc copyAttachments", 1)
	os.WriteFile("internal/site/site.go", []byte(s), 0644)
	
	// update assets.go to use copyEmbeddedDirFiltered
	contentAssets, _ := os.ReadFile("internal/site/assets.go")
	a := string(contentAssets)
	a = strings.Replace(a, "copyDirFiltered(sourceDir, targetDir, func(relativePath string, entry fs.DirEntry) bool", "copyEmbeddedDirFiltered(sourceDir, targetDir, func(relativePath string, entry fs.DirEntry) bool", 1)
	os.WriteFile("internal/site/assets.go", []byte(a), 0644)
}
