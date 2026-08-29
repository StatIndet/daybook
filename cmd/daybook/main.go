package main

import (
	"fmt"
	"os"
	"path/filepath"

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

	options := site.Options{
		Config:     cfg,
		ContentDir: contentDir,
		NotesDir:   notesDir,
		PublicDir:  publicDir,
		OnProgress: func(current, total int) {
			width := 40
			percent := float64(current) / float64(total)
			filled := int(float64(width) * percent)
			
			// Build the bar string
			bar := ""
			for i := 0; i < width; i++ {
				if i < filled {
					bar += "="
				} else if i == filled && current < total {
					bar += ">"
				} else {
					bar += " "
				}
			}
			
			fmt.Printf("\r构建中 [%s] %d/%d", bar, current, total)
			if current == total {
				fmt.Println()
			}
		},
	}

	if command == "build" {
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
		
		
		return site.Serve(options.PublicDir, ":1313")
	}

	return nil
}
