package og

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image/png"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/StatIndet/daybook/internal/embedded"
)

// PlaywrightVersion is kept in sync with package-lock.json. A dedicated cache
// lets a standalone Daybook binary render cards outside its source checkout.
const PlaywrightVersion = "1.63.0"

const playwrightModuleEnv = "DAYBOOK_OG_PLAYWRIGHT_MODULE"

var outputFilename = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]*\.png$`)

type renderManifest struct {
	PublicDir   string `json:"publicDir"`
	Module      string `json:"module"`
	Cards       []Card `json:"cards"`
	LibraryPath string `json:"libraryPath,omitempty"`
	FontConfig  string `json:"fontConfig,omitempty"`
}

// Progress is emitted by the renderer after it is ready, before each card, and
// after each successful write/validation. Completed never counts started work.
type Progress struct {
	Phase            string
	Completed, Total int
	PageURL          string
}

// Generate renders one batch with a single local Chromium instance. It never
// installs dependencies or starts a server; setup is an explicit CLI command.
func Generate(publicDir string, cards []Card, onProgress ...func(Progress)) error {
	if len(cards) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(cards))
	for _, card := range cards {
		if err := validateCard(card); err != nil {
			return fmt.Errorf("OG %q: %w", card.PageURL, err)
		}
		if seen[card.OutputPath] {
			return fmt.Errorf("OG %q: duplicate output path %q", card.PageURL, card.OutputPath)
		}
		seen[card.OutputPath] = true
	}

	node, err := nodeExecutable()
	if err != nil {
		return err
	}
	module, err := playwrightModule()
	if err != nil {
		return err
	}
	publicDir, err = filepath.Abs(publicDir)
	if err != nil {
		return fmt.Errorf("OG output directory: %w", err)
	}
	publicDir, err = filepath.EvalSymlinks(publicDir)
	if err != nil {
		return fmt.Errorf("OG output directory: %w", err)
	}

	workDir, err := os.MkdirTemp("", "daybook-og-")
	if err != nil {
		return fmt.Errorf("prepare OG renderer: %w", err)
	}
	defer os.RemoveAll(workDir)
	runner, err := embedded.FS.ReadFile("og/render.cjs")
	if err != nil {
		return fmt.Errorf("load embedded OG renderer: %w", err)
	}
	runnerPath := filepath.Join(workDir, "render.cjs")
	if err := os.WriteFile(runnerPath, runner, 0600); err != nil {
		return fmt.Errorf("write OG renderer: %w", err)
	}
	manifest, err := json.Marshal(renderManifest{PublicDir: publicDir, Module: module, Cards: cards, LibraryPath: userLibraryPath(), FontConfig: userFontConfig()})
	if err != nil {
		return fmt.Errorf("prepare OG cards: %w", err)
	}
	manifestPath := filepath.Join(workDir, "cards.json")
	if err := os.WriteFile(manifestPath, manifest, 0600); err != nil {
		return fmt.Errorf("write OG cards: %w", err)
	}

	// The renderer also enforces per-card deadlines, including remote assets.
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute+time.Duration(len(cards))*45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, node, runnerPath, manifestPath)
	var diagnostics bytes.Buffer
	cmd.Stderr = &diagnostics
	report := func(phase string, completed int, pageURL string) {
		for _, callback := range onProgress {
			callback(Progress{Phase: phase, Completed: completed, Total: len(cards), PageURL: pageURL})
		}
	}
	events := &renderEvents{cards: cards, report: report}
	cmd.Stdout = events
	cmd.WaitDelay = 3 * time.Second
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("OG rendering exceeded its time limit: %w", ctx.Err())
		}
		return fmt.Errorf("OG rendering failed: %w\n%s", err, strings.TrimSpace(diagnostics.String()))
	}
	if !events.ready || events.completed != len(cards) || len(events.pending) != 0 {
		return fmt.Errorf("OG renderer ended with incomplete progress (%d/%d cards)", events.completed, len(cards))
	}
	for i, card := range cards {
		report("validating", i, card.PageURL)
		filename := filepath.Join(publicDir, filepath.FromSlash(strings.TrimPrefix(card.OutputPath, "/")))
		if err := verifyPNG(filename); err != nil {
			return fmt.Errorf("OG %q (%s): %w", card.PageURL, card.OutputPath, err)
		}
		report("validating", i+1, card.PageURL)
	}
	return nil
}

// Stdout is a small NDJSON protocol, separate from stderr diagnostics. os/exec
// drains it while the process runs and joins the writer before Run returns.
type renderEvents struct {
	cards          []Card
	report         func(string, int, string)
	pending        []byte
	ready, started bool
	completed      int
}

func (w *renderEvents) Write(p []byte) (int, error) {
	w.pending = append(w.pending, p...)
	for {
		i := bytes.IndexByte(w.pending, '\n')
		if i < 0 {
			break
		}
		var event struct {
			Event string `json:"event"`
			Index int    `json:"index"`
		}
		if err := json.Unmarshal(w.pending[:i], &event); err != nil {
			return 0, fmt.Errorf("invalid OG progress event: %w", err)
		}
		w.pending = w.pending[i+1:]
		switch {
		case event.Event == "ready" && !w.ready:
			w.ready = true
			w.report("rendering", 0, "")
		case event.Event == "start" && w.ready && !w.started && event.Index == w.completed && event.Index < len(w.cards):
			w.started = true
			w.report("rendering", w.completed, w.cards[event.Index].PageURL)
		case event.Event == "done" && w.started && event.Index == w.completed:
			w.started = false
			w.completed++
			w.report("rendering", w.completed, w.cards[event.Index].PageURL)
		default:
			return 0, fmt.Errorf("unexpected OG progress event %q at card %d", event.Event, event.Index)
		}
	}
	if len(w.pending) > 4096 {
		return 0, fmt.Errorf("OG progress event exceeds size limit")
	}
	return len(p), nil
}

func validateCard(card Card) error {
	if card.Section != "notes" && card.Section != "memos" {
		return fmt.Errorf("unsupported section %q", card.Section)
	}
	if path.Dir(card.OutputPath) != "/generated/og/"+card.Section || !outputFilename.MatchString(path.Base(card.OutputPath)) || path.Clean(card.OutputPath) != card.OutputPath {
		return fmt.Errorf("unsafe output path %q", card.OutputPath)
	}
	pageURL, err := url.Parse(card.PageURL)
	if err != nil || pageURL.IsAbs() || pageURL.Host != "" || strings.ContainsAny(pageURL.Path, "\\\x00") || pageURL.RawQuery != "" || pageURL.Fragment != "" {
		return fmt.Errorf("invalid page URL %q", card.PageURL)
	}
	pagePath := strings.TrimPrefix(pageURL.Path, "/en_US")
	if !strings.HasPrefix(pagePath, "/"+card.Section+"/") || strings.Contains(pagePath, "//") || path.Clean(pageURL.Path) != strings.TrimSuffix(pageURL.Path, "/") {
		return fmt.Errorf("invalid page URL %q", card.PageURL)
	}
	if strings.TrimSpace(card.HTML) == "" {
		return fmt.Errorf("empty HTML template")
	}
	return nil
}

func verifyPNG(filename string) error {
	f, err := os.Open(filename)
	if err != nil {
		return fmt.Errorf("read generated PNG: %w", err)
	}
	defer f.Close()
	config, err := png.DecodeConfig(f)
	if err != nil {
		return fmt.Errorf("invalid generated PNG: %w", err)
	}
	if config.Width != 1200 || config.Height != 630 {
		return fmt.Errorf("generated PNG has size %dx%d, want 1200x630", config.Width, config.Height)
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("read generated PNG: %w", err)
	}
	if _, err := png.Decode(f); err != nil {
		return fmt.Errorf("incomplete generated PNG: %w", err)
	}
	return nil
}

func nodeExecutable() (string, error) {
	node, err := exec.LookPath("node")
	if err != nil {
		return "", fmt.Errorf("OG rendering requires Node.js 24 or newer; install Node.js and run `daybook setup-og`: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	version, err := exec.CommandContext(ctx, node, "--version").Output()
	if err != nil {
		return "", fmt.Errorf("check Node.js for OG rendering: %w", err)
	}
	major, err := strconv.Atoi(strings.Split(strings.TrimPrefix(strings.TrimSpace(string(version)), "v"), ".")[0])
	if err != nil || major < 24 {
		return "", fmt.Errorf("OG rendering requires Node.js 24 or newer (found %q); update Node.js and run `daybook setup-og`", strings.TrimSpace(string(version)))
	}
	return node, nil
}

func runtimeDirectory() (string, error) {
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("locate OG runtime cache: %w", err)
	}
	return filepath.Join(cache, "daybook", "og", "playwright-"+PlaywrightVersion), nil
}

func playwrightModule() (string, error) {
	module := os.Getenv(playwrightModuleEnv)
	if module == "" {
		dir, err := runtimeDirectory()
		if err != nil {
			return "", err
		}
		module = filepath.Join(dir, "node_modules", "playwright")
	}
	entry, err := validatePlaywrightModule(module)
	if err != nil {
		return "", fmt.Errorf("OG renderer is unavailable: %w; run `daybook setup-og` (or set %s to an absolute Playwright %s package or entry point)", err, playwrightModuleEnv, PlaywrightVersion)
	}
	return entry, nil
}

func validatePlaywrightModule(module string) (string, error) {
	if !filepath.IsAbs(module) {
		return "", fmt.Errorf("Playwright path must be absolute: %q", module)
	}
	info, err := os.Stat(module)
	if err != nil {
		return "", fmt.Errorf("locate Playwright at %q: %w", module, err)
	}
	dir := module
	if info.IsDir() {
		module = filepath.Join(dir, "index.mjs")
	} else {
		if filepath.Base(module) != "index.mjs" && filepath.Base(module) != "index.js" {
			return "", fmt.Errorf("Playwright entry point must be index.mjs or index.js: %q", module)
		}
		dir = filepath.Dir(module)
	}
	metadata, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return "", fmt.Errorf("read Playwright package: %w", err)
	}
	var pkg struct{ Name, Version string }
	if err := json.Unmarshal(metadata, &pkg); err != nil {
		return "", fmt.Errorf("read Playwright package: %w", err)
	}
	if pkg.Name != "playwright" || pkg.Version != PlaywrightVersion {
		return "", fmt.Errorf("expected playwright %s, found %s %s", PlaywrightVersion, pkg.Name, pkg.Version)
	}
	if info, err := os.Stat(module); err != nil || info.IsDir() {
		return "", fmt.Errorf("Playwright entry point does not exist: %q", module)
	}
	return module, nil
}

// Setup installs the pinned renderer into the user's cache and explicitly
// downloads its matching Chromium. Normal builds never invoke this function.
func Setup(ctx context.Context, options SetupOptions) error {
	node, err := nodeExecutable()
	if err != nil {
		return err
	}
	npm, err := exec.LookPath("npm")
	if err != nil {
		return fmt.Errorf("`daybook setup-og` requires npm (included with Node.js): %w", err)
	}
	dir, err := runtimeDirectory()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create OG runtime cache: %w", err)
	}
	install, err := npmCommand(ctx, node, npm, "install", "--prefix", dir, "--no-audit", "--no-fund", "--ignore-scripts", "--save-exact", "playwright@"+PlaywrightVersion)
	if err != nil {
		return err
	}
	install.Stdout, install.Stderr = os.Stdout, os.Stderr
	if err := install.Run(); err != nil {
		return fmt.Errorf("install OG Playwright runtime: %w", err)
	}
	moduleDir := filepath.Join(dir, "node_modules", "playwright")
	if _, err := validatePlaywrightModule(moduleDir); err != nil {
		return err
	}
	if options.UserDeps {
		if err := setupUserLibraries(ctx, node, moduleDir, dir); err != nil {
			return fmt.Errorf("install OG user libraries: %w", err)
		}
	}
	args := []string{filepath.Join(moduleDir, "cli.js"), "install", "chromium", "--only-shell"}
	if options.WithDeps {
		args = append(args, "--with-deps")
	}
	installBrowser := exec.CommandContext(ctx, node, args...)
	if options.UserDeps {
		// The renderer supplies these libraries at launch, outside the host's
		// loader paths inspected by Playwright's installation-time preflight.
		installBrowser.Env = append(os.Environ(), "PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1")
	}
	installBrowser.Stdout, installBrowser.Stderr = os.Stdout, os.Stderr
	if err := installBrowser.Run(); err != nil {
		return fmt.Errorf("install OG Chromium browser: %w", err)
	}
	return nil
}

// Official Windows Node distributions expose npm.cmd, which os/exec cannot
// launch directly. Invoke its JavaScript entry point through Node without a
// shell, so spaces and shell metacharacters in cache paths remain literal.
func npmCommand(ctx context.Context, node, npm string, args ...string) (*exec.Cmd, error) {
	ext := strings.ToLower(filepath.Ext(npm))
	if ext != ".cmd" && ext != ".bat" {
		return exec.CommandContext(ctx, npm, args...), nil
	}
	cli := filepath.Join(filepath.Dir(npm), "node_modules", "npm", "bin", "npm-cli.js")
	if info, err := os.Stat(cli); err != nil || info.IsDir() {
		return nil, fmt.Errorf("locate npm's JavaScript entry point next to %q; reinstall Node.js with npm", npm)
	}
	return exec.CommandContext(ctx, node, append([]string{cli}, args...)...), nil
}
