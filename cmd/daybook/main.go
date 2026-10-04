package main

import (
	"context"
	"errors"
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

type reportedError struct{ error }

func main() {
	if err := run(); err != nil {
		var reported *reportedError
		if !errors.As(err, &reported) {
			fmt.Fprintln(os.Stderr, err)
		}
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Println("Usage:")
	fmt.Println("  daybook build [--verbose]  Build the current Daybook vault into ./public")
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
	verbose := false
	if command == "build" {
		flags := flag.NewFlagSet("build", flag.ContinueOnError)
		flags.BoolVar(&verbose, "verbose", false, "Print stage timings and file details without animation")
		if err := flags.Parse(os.Args[2:]); err != nil {
			if err == flag.ErrHelp {
				return nil
			}
			return err
		}
		if flags.NArg() > 0 {
			return fmt.Errorf("daybook build: unexpected argument: %s", flags.Arg(0))
		}
	}
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

	var configWarnings []string
	cfg, err := config.LoadWithWarnings(func(message string) { configWarnings = append(configWarnings, message) })
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
		reporter = progress.NewReporter(site.BuildStages(cfg), progress.Options{Verbose: verbose})
		defer reporter.Close()
		for _, warning := range configWarnings {
			reporter.Warnf("%s", warning)
		}
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
		reporter.Verbosef("stats: enabled=%t", cfg.Stats.Enabled)

		result, err := site.Build(options)
		if err != nil {
			reporter.Fail(err)
			return &reportedError{err}
		}

		reporter.Done(fmt.Sprintf("Built %d notes and %d memos → public/", len(result.Notes), len(result.Memos)), fmt.Sprintf("%d social cards", result.SocialCards))
	}

	if command == "serve" {
		for _, warning := range configWarnings {
			fmt.Fprintln(os.Stderr, "WARN  "+warning)
		}
		return site.Serve(options.PublicDir, serveAddr)
	}

	return nil
}
