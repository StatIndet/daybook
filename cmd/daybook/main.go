package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/site"
	"github.com/StatIndet/daybook/internal/progress"
)

var Version = "daybook dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Println("Usage:")
	fmt.Println("  daybook build    Build the current Daybook vault into ./public")
	fmt.Println("  daybook serve    Serve the existing ./public directory locally")
	fmt.Println("  daybook version  Print Daybook version")
}

func run() error {
	if len(os.Args) < 2 {
		printHelp()
		return nil
	}

	command := os.Args[1]

	if command == "version" || command == "--version" || command == "-v" {
		fmt.Println(Version)
		return nil
	}

	if command != "build" && command != "serve" {
		printHelp()
		return fmt.Errorf("unknown command: %s", command)
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get current working directory: %w", err)
	}

	contentDir := filepath.Join(cwd, "vault")
	notesDir := filepath.Join(cwd, "vault", "notes")
	publicDir := filepath.Join(cwd, "public")

	if command == "build" {
		if stat, err := os.Stat(contentDir); err != nil || !stat.IsDir() {
			return fmt.Errorf("daybook: vault directory not found: ./vault")
		}
		if stat, err := os.Stat(notesDir); err != nil || !stat.IsDir() {
			return fmt.Errorf("daybook: notes directory not found: ./vault/notes")
		}
	}

	var reporter *progress.Reporter
	if command == "build" {
		reporter = progress.NewReporter([]progress.Stage{
			{Name: "扫描及解析文章", Weight: 0.10},
			{Name: "抓取音乐元数据", Weight: 0.15},
			{Name: "构建双向链接索引", Weight: 0.25},
			{Name: "构建全局搜索索引", Weight: 0.15},
			{Name: "写入静态构建产物", Weight: 0.35},
		})
	}

	options := site.Options{
		Config:     cfg,
		ContentDir: contentDir,
		NotesDir:   notesDir,
		PublicDir:  publicDir,
		Reporter:   reporter,
	}

	if command == "build" {
		if cfg.Stats.Enabled {
			fmt.Println("[daybook] stats: enabled=true")
		} else {
			fmt.Println("[daybook] stats: disabled")
		}

		result, err := site.Build(options)
		if err != nil {
			if reporter != nil {
				reporter.Fail(err)
			}
			return err
		}

		if reporter != nil {
			reporter.Done(fmt.Sprintf("Built %d notes to public/", len(result.Notes)))
		}

		for _, skipped := range result.Skipped {
			fmt.Fprintf(os.Stderr, "跳过无效笔记: %s\n", skipped)
		}
	}

	if command == "serve" {
		
		
		return site.Serve(options.PublicDir, ":1313")
	}

	return nil
}
