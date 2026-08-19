package main

import (
	"fmt"
	"os"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/site"
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
	fmt.Println("  daybook serve    Build and serve the current Daybook vault locally")
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

	options := site.Options{
		Config:     cfg,
		ContentDir: cwd,
		NotesDir:   "notes",
		PublicDir:  "public",
	}

	if command == "build" || command == "serve" {
		if cfg.Stats.Enabled {
			fmt.Println("[daybook] stats: enabled=true")
		} else {
			fmt.Println("[daybook] stats: disabled")
		}

		result, err := site.Build(options)
		if err != nil {
			return err
		}

		for _, skipped := range result.Skipped {
			fmt.Fprintf(os.Stderr, "跳过无效笔记: %s\n", skipped)
		}

		fmt.Printf("构建完成: 生成 %d 篇笔记到 public/\n", len(result.Notes))
	}

	if command == "serve" {
		fmt.Println("预览地址: http://localhost:1313")
		return site.Serve(options.PublicDir, ":1313")
	}

	return nil
}
