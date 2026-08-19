package main

import (
	"fmt"
	"io/fs"
	"github.com/StatIndet/daybook/internal/embedded"
)

func main() {
	err := fs.WalkDir(embedded.FS, "static", func(filePath string, entry fs.DirEntry, err error) error {
		if err != nil {
			fmt.Println("Error:", filePath, err)
			return nil
		}
		fmt.Println("Found:", filePath)
		return nil
	})
	if err != nil {
		fmt.Println("WalkDir err:", err)
	}
}
