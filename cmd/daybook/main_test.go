package main

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func runCaptured(t *testing.T, args ...string) (string, error) {
	t.Helper()
	oldArgs, oldOut := os.Args, os.Stdout
	defer func() { os.Args, os.Stdout = oldArgs, oldOut }()
	os.Args = append([]string{"daybook"}, args...)
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = writer
	var output bytes.Buffer
	drained := make(chan struct{})
	go func() { _, _ = io.Copy(&output, reader); close(drained) }()
	result := run()
	writer.Close()
	<-drained
	reader.Close()
	return output.String(), result
}

func TestBuildFlagsAreValidatedBeforeLoadingVault(t *testing.T) {
	t.Chdir(t.TempDir())
	for _, args := range [][]string{{"build", "unexpected"}, {"build", "--unknown"}} {
		_, err := runCaptured(t, args...)
		if err == nil || strings.Contains(err.Error(), "daybook.yaml") {
			t.Fatalf("%v: %v", args, err)
		}
	}
	if _, err := runCaptured(t, "build", "--help"); err != nil {
		t.Fatal(err)
	}
}

func TestSetupOGFlagsAreValidatedBeforeInstalling(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("PATH", "")
	for _, args := range [][]string{
		{"setup-og", "unexpected"},
		{"setup-og", "--unknown"},
		{"setup-og", "--with-deps", "unexpected"},
	} {
		_, err := runCaptured(t, args...)
		if err == nil || strings.Contains(err.Error(), "Node.js") {
			t.Fatalf("%v: must reject invalid flags before installing: %v", args, err)
		}
	}
	if _, err := runCaptured(t, "setup-og", "--help"); err != nil {
		t.Fatal(err)
	}
	if _, err := runCaptured(t, "setup-og", "--with-deps"); err == nil || !strings.Contains(err.Error(), "Node.js") {
		t.Fatalf("valid setup flag should reach runtime setup: %v", err)
	}
}

func TestBuildSummaryAndFailureOutput(t *testing.T) {
	t.Chdir(t.TempDir())
	if err := os.MkdirAll("vault/notes", 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll("vault/pages", 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("daybook.yaml", []byte("comment:\n  enabled: true\n  provider: unsupported\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("vault/pages/about.md", []byte("---\ntitle: About\n---\nHello"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, verbose := range []bool{false, true} {
		args := []string{"build"}
		if verbose {
			args = append(args, "--verbose")
		}
		output, err := runCaptured(t, args...)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Count(output, "✓ Built") != 1 || !strings.Contains(output, "0 social cards · 1 warnings") || strings.Count(output, "WARN  unsupported comment provider") != 1 {
			t.Fatal(output)
		}
		if strings.Contains(output, "stats:") != verbose || strings.ContainsAny(output, "\x1b\r") {
			t.Fatal(output)
		}
	}
	// Failure after a real build stage preserves its location, leaves no success
	// summary and returns the marker main uses to avoid printing the error twice.
	if err := os.Remove(filepath.Join("vault", "pages", "about.md")); err != nil {
		t.Fatal(err)
	}
	output, err := runCaptured(t, "build")
	var reported *reportedError
	if !errors.As(err, &reported) || strings.Contains(output, "✓") || strings.Count(output, "✗ Build failed") != 1 || !strings.Contains(output, "pages/about.md") {
		t.Fatalf("error=%v\n%s", err, output)
	}
}
