package main

import (
	"fmt"
	"os"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/site"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) < 2 {
		return fmt.Errorf("用法: go run ./cmd/daybook [build|serve]")
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	options := site.Options{
		Config:       cfg,
		ContentDir:   "content",
		NotesDir:     "content/notes",
		TemplatesDir: "templates",
		StaticDir:    "static",
		PublicDir:    "public",
	}

	switch os.Args[1] {
	case "build":
		result, err := site.Build(options)
		if err != nil {
			return err
		}

		for _, skipped := range result.Skipped {
			fmt.Fprintf(os.Stderr, "跳过无效笔记: %s\n", skipped)
		}

		fmt.Printf("构建完成: 生成 %d 篇笔记到 public/\n", len(result.Notes))
		return nil
	case "serve":
		fmt.Println("预览地址: http://localhost:1313")
		return site.Serve(options.PublicDir, ":1313")
	default:
		return fmt.Errorf("未知命令: %s", os.Args[1])
	}
}
