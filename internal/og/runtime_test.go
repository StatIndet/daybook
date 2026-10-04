package og

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/StatIndet/daybook/internal/embedded"
)

func TestValidateCardPaths(t *testing.T) {
	valid := Card{Section: "notes", PageURL: "/notes/中文/", OutputPath: "/generated/og/notes/safe-0123.png", HTML: "<!doctype html>"}
	for _, page := range []string{"/notes/中文/", "/en_US/notes/中文/", "/notes/a%20b/"} {
		card := valid
		card.PageURL = page
		if err := validateCard(card); err != nil {
			t.Errorf("valid URL %q: %v", page, err)
		}
	}
	for _, page := range []string{"https://example.com/notes/a/", "//example.com/notes/a/", "/notes/../../outside/", "/notes/%2e%2e/outside/", "/notes/a%5cb/", "/notes/a%00b/", "/memos/a/", "/notes/a/?x=1", "/notes/a/#x", "/notes/a//b/"} {
		card := valid
		card.PageURL = page
		if err := validateCard(card); err == nil {
			t.Errorf("accepted invalid page URL %q", page)
		}
	}
	for _, output := range []string{"/tmp/out.png", "/generated/og/memos/a.png", "/generated/og/notes/../out.png", "/generated/og/notes/a/b.png", "/generated/og/notes/a%2fb.png", "/generated/og/notes/a.svg", "/generated/og/notes/a\\b.png"} {
		card := valid
		card.OutputPath = output
		if err := validateCard(card); err == nil {
			t.Errorf("accepted unsafe output %q", output)
		}
	}
}

func TestGenerateEmptyDoesNotNeedRuntime(t *testing.T) {
	t.Setenv("PATH", "")
	if err := Generate(t.TempDir(), nil); err != nil {
		t.Fatal(err)
	}
}

func TestGenerateRejectsDuplicateOutputs(t *testing.T) {
	card := Card{Section: "memos", PageURL: "/memos/test/", OutputPath: "/generated/og/memos/test.png", HTML: "<html></html>"}
	if err := Generate(t.TempDir(), []Card{card, card}); err == nil || !strings.Contains(err.Error(), "duplicate output") {
		t.Fatalf("expected duplicate output error, got %v", err)
	}
}

func TestPlaywrightModuleSelection(t *testing.T) {
	dir := t.TempDir()
	metadata := `{"name":"playwright","version":"` + PlaywrightVersion + `"}`
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(metadata), 0600); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(dir, "index.mjs")
	if err := os.WriteFile(entry, []byte("export {}"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, candidate := range []string{dir, entry} {
		t.Setenv(playwrightModuleEnv, candidate)
		actual, err := playwrightModule()
		if err != nil || actual != entry {
			t.Fatalf("module %q => %q, %v", candidate, actual, err)
		}
	}
	t.Setenv(playwrightModuleEnv, "node_modules/playwright")
	if _, err := playwrightModule(); err == nil || !strings.Contains(err.Error(), "setup-og") {
		t.Fatalf("expected actionable absolute path error, got %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"playwright","version":"0.0.0"}`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv(playwrightModuleEnv, dir)
	if _, err := playwrightModule(); err == nil || !strings.Contains(err.Error(), "expected playwright "+PlaywrightVersion) {
		t.Fatalf("expected version error, got %v", err)
	}
}

func TestPlaywrightVersionMatchesLockfile(t *testing.T) {
	data, err := os.ReadFile("../../package-lock.json")
	if err != nil {
		t.Fatal(err)
	}
	var lock struct {
		Packages map[string]struct{ Version string } `json:"packages"`
	}
	if err := json.Unmarshal(data, &lock); err != nil {
		t.Fatal(err)
	}
	if version := lock.Packages["node_modules/playwright"].Version; version != PlaywrightVersion {
		t.Fatalf("runtime pins %s, lockfile pins %s; update both together", PlaywrightVersion, version)
	}
}

func TestVerifyPNG(t *testing.T) {
	for _, test := range []struct {
		name   string
		width  int
		height int
		valid  bool
	}{{"social card", 1200, 630, true}, {"wrong canvas", 600, 315, false}} {
		t.Run(test.name, func(t *testing.T) {
			filename := filepath.Join(t.TempDir(), "card.png")
			file, err := os.Create(filename)
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(file, image.NewRGBA(image.Rect(0, 0, test.width, test.height))); err != nil {
				t.Fatal(err)
			}
			if err := file.Close(); err != nil {
				t.Fatal(err)
			}
			if err := verifyPNG(filename); (err == nil) != test.valid {
				t.Fatalf("verifyPNG valid=%v: %v", test.valid, err)
			}
			data, err := os.ReadFile(filename)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filename, data[:len(data)/2], 0600); err != nil {
				t.Fatal(err)
			}
			if err := verifyPNG(filename); err == nil {
				t.Fatal("accepted truncated PNG")
			}
		})
	}
}

func TestRendererPathContainment(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node.js unavailable; renderer path tests require Node.js")
	}
	dir := t.TempDir()
	runner, err := embedded.FS.ReadFile("og/render.cjs")
	if err != nil {
		t.Fatal(err)
	}
	runnerPath := filepath.Join(dir, "render.cjs")
	if err := os.WriteFile(runnerPath, runner, 0600); err != nil {
		t.Fatal(err)
	}
	// Test the actual embedded path resolver, including encoded traversal and
	// preexisting symlinks, without launching a browser or making requests.
	script := `
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { assetPath, outputPath } = require(process.argv[1]);
(async () => {
  const dir = process.argv[2], root = path.join(dir, 'public'), outside = path.join(dir, 'private');
  await fs.mkdir(root); await fs.mkdir(outside);
  await fs.writeFile(path.join(root, '中文.png'), 'pixels');
  await fs.writeFile(path.join(outside, 'secret'), 'secret');
  assert.equal(await assetPath(root, '/%E4%B8%AD%E6%96%87.png'), path.join(root, '中文.png'));
  for (const value of ['/../private/secret', '/%2e%2e/private/secret', '/x%2f..%2f..%2fprivate/secret', '/x%00y', '/x%5cy', '/missing']) {
    await assert.rejects(assetPath(root, value), undefined, value);
  }
  await fs.symlink(outside, path.join(root, 'linked'));
  await assert.rejects(assetPath(root, '/linked/secret'), /symlink/);
  const card = {section: 'notes', outputPath: '/generated/og/notes/safe.png'};
  assert.equal(await outputPath(root, card), path.join(root, 'generated', 'og', 'notes', 'safe.png'));
  for (const value of ['/../private/a.png', '/generated/og/notes/../x.png', '/generated/og/memos/a.png']) {
    await assert.rejects(outputPath(root, {...card, outputPath: value}), /unsafe/);
  }
  await fs.rm(path.join(root, 'generated'), { recursive: true });
  await fs.symlink(outside, path.join(root, 'generated'));
  await assert.rejects(outputPath(root, card), /symlink/);
  assert.deepEqual(await fs.readdir(outside), ['secret']);
})().catch(error => { console.error(error); process.exitCode = 1; });
`
	if output, err := exec.Command(node, "-e", script, runnerPath, dir).CombinedOutput(); err != nil {
		t.Fatalf("renderer path tests: %v\n%s", err, output)
	}
}

func TestNPMWindowsShimUsesNodeWithoutShell(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "Node with spaces & symbols")
	cli := filepath.Join(dir, "node_modules", "npm", "bin", "npm-cli.js")
	if err := os.MkdirAll(filepath.Dir(cli), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cli, []byte("// npm"), 0600); err != nil {
		t.Fatal(err)
	}
	node := filepath.Join(dir, "node.exe")
	cmd, err := npmCommand(context.Background(), node, filepath.Join(dir, "npm.cmd"), "install", "--prefix", "cache & literal")
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Path != node || len(cmd.Args) != 5 || cmd.Args[1] != cli || cmd.Args[4] != "cache & literal" {
		t.Fatalf("unexpected invocation: path=%q args=%q", cmd.Path, cmd.Args)
	}
}

func TestGenerateReportsMissingAsset(t *testing.T) {
	if os.Getenv(playwrightModuleEnv) == "" {
		t.Skip("set DAYBOOK_OG_PLAYWRIGHT_MODULE to run browser integration tests")
	}
	card := Card{
		Section: "notes", PageURL: "/notes/missing-asset/", OutputPath: "/generated/og/notes/missing.png",
		HTML: `<!doctype html><html><body><img src="/missing.png"></body></html>`,
	}
	var events []Progress
	err := Generate(t.TempDir(), []Card{card}, func(event Progress) { events = append(events, event) })
	for _, event := range events {
		if event.Completed != 0 || event.Phase == "validating" {
			t.Fatalf("failed image was counted as complete: %+v", events)
		}
	}
	if err == nil || !strings.Contains(err.Error(), "/notes/missing-asset/") || !strings.Contains(err.Error(), "/missing.png") {
		t.Fatalf("expected page and failed asset in error, got %v", err)
	}
}

func TestGenerateCachesRemoteImagesAcrossCards(t *testing.T) {
	if os.Getenv(playwrightModuleEnv) == "" {
		t.Skip("set DAYBOOK_OG_PLAYWRIGHT_MODULE to run browser integration tests")
	}
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Header().Set("Content-Type", "image/png")
		if err := png.Encode(w, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
			t.Errorf("serve image: %v", err)
		}
	}))
	defer server.Close()
	cards := []Card{
		{Section: "notes", PageURL: "/notes/中文/", OutputPath: "/generated/og/notes/chinese.png"},
		{Section: "memos", PageURL: "/en_US/memos/example/", OutputPath: "/generated/og/memos/english.png"},
	}
	for i := range cards {
		cards[i].HTML = fmt.Sprintf(`<!doctype html><html><body><img src="%s/avatar.png"></body></html>`, server.URL)
	}
	dir := t.TempDir()
	var events []Progress
	if err := Generate(dir, cards, func(event Progress) {
		events = append(events, event)
		if event.Completed > 0 && event.PageURL == cards[event.Completed-1].PageURL {
			filename := filepath.Join(dir, filepath.FromSlash(strings.TrimPrefix(cards[event.Completed-1].OutputPath, "/")))
			if err := verifyPNG(filename); err != nil {
				t.Errorf("completion reported before image exists: %v", err)
			}
		}
	}); err != nil {
		t.Fatal(err)
	}
	if len(events) != 9 || events[1].Completed != 0 || events[2].Completed != 1 || events[3].Completed != 1 || events[4].Completed != 2 || events[5].Phase != "validating" || events[8].Completed != 2 {
		t.Fatalf("unexpected renderer lifecycle: %+v", events)
	}
	if actual := requests.Load(); actual != 1 {
		t.Fatalf("remote avatar fetched %d times, want once per batch", actual)
	}
	for _, card := range cards {
		if err := verifyPNG(filepath.Join(dir, filepath.FromSlash(strings.TrimPrefix(card.OutputPath, "/")))); err != nil {
			t.Fatal(err)
		}
	}
}

func TestRenderEventsReportCompletedWrites(t *testing.T) {
	var received []Progress
	cards := []Card{{PageURL: "/notes/first/"}, {PageURL: "/memos/second/"}}
	writer := &renderEvents{cards: cards, report: func(phase string, completed int, page string) {
		received = append(received, Progress{Phase: phase, Completed: completed, Total: 2, PageURL: page})
	}}
	// os/exec may split a JSON event anywhere, or deliver multiple lines together.
	input := "{\"event\":\"ready\"}\n{\"event\":\"start\",\"index\":0}\n{\"event\":\"done\",\"index\":0}\n{\"event\":\"start\",\"index\":1}\n{\"event\":\"done\",\"index\":1}\n"
	for _, b := range []byte(input) {
		if _, err := writer.Write([]byte{b}); err != nil {
			t.Fatal(err)
		}
	}
	if len(received) != 5 {
		t.Fatalf("events: %+v", received)
	}
	for i, want := range []int{0, 0, 1, 1, 2} {
		if received[i].Completed != want {
			t.Fatalf("event %d: %+v, want %d completed", i, received[i], want)
		}
	}
	if received[3].PageURL != cards[1].PageURL {
		t.Fatal(received)
	}
	if _, err := writer.Write([]byte("{\"event\":\"done\",\"index\":1}\n")); err == nil {
		t.Fatal("accepted duplicate completion")
	}
	for _, input := range []string{
		"not JSON\n", "{\"event\":\"done\",\"index\":0}\n",
		"{\"event\":\"ready\"}\n{\"event\":\"start\",\"index\":-1}\n",
		"{\"event\":\"ready\"}\n{\"event\":\"start\",\"index\":2}\n",
		strings.Repeat("x", 4097),
	} {
		writer := &renderEvents{cards: cards, report: func(string, int, string) {}}
		if _, err := writer.Write([]byte(input)); err == nil {
			t.Fatalf("accepted invalid protocol: %.80q", input)
		}
	}
}
