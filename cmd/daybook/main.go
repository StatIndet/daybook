package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/og"
	"github.com/StatIndet/daybook/internal/progress"
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
	fmt.Println("  daybook setup-og Install local Playwright and Chromium for static social cards")
	fmt.Println("  daybook serve [--addr :1313]  Serve the existing ./public directory locally")
	fmt.Println("  daybook version  Print Daybook version")
}

func run() error {
	if len(os.Args) < 2 {
		printHelp()
		return nil
	}

	command := os.Args[1]
	if command == "setup-og" {
		if len(os.Args) != 2 {
			return fmt.Errorf("daybook setup-og: no arguments expected")
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()
		return og.Setup(ctx)
	}

	if command == "version" || command == "--version" || command == "-v" {
		fmt.Println(Version)
		return nil
	}

	if command != "build" && command != "serve" {
		printHelp()
		return fmt.Errorf("unknown command: %s", command)
	}
	serveAddr := ":1313"
	if command == "serve" {
		flags := flag.NewFlagSet("serve", flag.ContinueOnError)
		flags.StringVar(&serveAddr, "addr", serveAddr, "HTTP listen address")
		if err := flags.Parse(os.Args[2:]); err != nil {
			if err == flag.ErrHelp {
				return nil
			}
			return err
		}
		if flags.NArg() > 0 {
			return fmt.Errorf("daybook serve: unexpected argument: %s", flags.Arg(0))
		}
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
	memosDir := filepath.Join(cwd, "vault", "memos")
	publicDir := filepath.Join(cwd, "public")

	if command == "build" {
		if stat, err := os.Stat(contentDir); err != nil || !stat.IsDir() {
			return fmt.Errorf("daybook: vault directory not found: ./vault")
		}
		notesStat, notesErr := os.Stat(notesDir)
		memosStat, memosErr := os.Stat(memosDir)
		if (notesErr != nil || !notesStat.IsDir()) && (memosErr != nil || !memosStat.IsDir()) {
			return fmt.Errorf("daybook: content directory not found: create ./vault/notes or ./vault/memos")
		}
	}

	var reporter *progress.Reporter
	if command == "build" {
		reporter = progress.NewReporter([]progress.Stage{
			{Name: "扫描及解析文章", Weight: 0.10},
			{Name: "抓取音乐元数据", Weight: 0.15},
			{Name: "构建双向链接索引", Weight: 0.25},
			{Name: "构建全局搜索索引", Weight: 0.15},
			{Name: "写入静态构建产物", Weight: 0.20},
			{Name: "生成静态分享图片", Weight: 0.15},
		})
	}

	options := site.Options{
		Config:     cfg,
		ContentDir: contentDir,
		NotesDir:   notesDir,
		MemosDir:   memosDir,
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
			reporter.Done(fmt.Sprintf("Built %d notes and %d memos to public/", len(result.Notes), len(result.Memos)))
		}

		for _, skipped := range result.Skipped {
			fmt.Fprintf(os.Stderr, "跳过无效笔记: %s\n", skipped)
		}
	}

	if command == "serve" {
		return site.Serve(options.PublicDir, serveAddr)
	}

	return nil
}
