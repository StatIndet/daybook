package main

import (
	"fmt"
	"io/fs"
	"path"

	"github.com/StatIndet/daybook/internal/embedded"
)

func main() {
	root := "static/css"
	err := fs.WalkDir(embedded.FS, root, func(filePath string, entry fs.DirEntry, err error) error {
		if err != nil {
			fmt.Println("Error:", filePath, err)
			return nil
		}
		if entry.IsDir() || !entry.Type().IsRegular() {
			return nil
		}
		if path.Ext(filePath) != ".css" {
			return nil
		}
		fmt.Println("Found:", filePath)
		return nil
	})
	if err != nil {
		fmt.Println("WalkDir err:", err)
	}
}
