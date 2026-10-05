package og

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

// SetupOptions selects one explicit method of installing OS dependencies.
type SetupOptions struct {
	WithDeps bool // Playwright's privileged system installer.
	UserDeps bool // Signed Debian packages extracted into the user cache.
}

// setupUserLibraries uses the host's authenticated APT sources and Playwright's
// dependency simulation, including transitive packages. It never installs a
// system package, executes a package maintainer script, or invokes sudo/su.
func setupUserLibraries(ctx context.Context, node, moduleDir, cache string) error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("--user-deps requires Debian/Ubuntu Linux")
	}
	for _, tool := range []string{"apt-get", "dpkg-deb"} {
		if _, err := exec.LookPath(tool); err != nil {
			return fmt.Errorf("--user-deps requires %s: %w", tool, err)
		}
	}
	work, err := os.MkdirTemp(cache, "user-deps-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(work)
	if strings.ContainsAny(work, "\\\"\r\n") {
		return fmt.Errorf("APT cannot represent this cache path: %q", work)
	}
	for _, dir := range []string{"apt.conf.d", "lists/partial", "archives/partial", "downloads", "root"} {
		if err := os.MkdirAll(filepath.Join(work, dir), 0755); err != nil {
			return err
		}
	}
	// APT_CONFIG is read before apt.conf.d. Disable system hooks (which may
	// write system caches), but retain the default sources and trusted keyrings.
	config := "Dir::Etc::parts " + strconv.Quote(filepath.Join(work, "apt.conf.d")) + ";\nDir::Etc::main \"/dev/null\";\n" +
		"Dir::State::lists " + strconv.Quote(filepath.Join(work, "lists")) + ";\n" +
		"Dir::Cache::archives " + strconv.Quote(filepath.Join(work, "archives")) + ";\n" +
		"Dir::Cache::pkgcache \"\";\nDir::Cache::srcpkgcache \"\";\n" +
		"Debug::NoLocking \"true\";\nAPT::Update::Error-Mode \"any\";\n"
	configPath := filepath.Join(work, "apt.conf")
	if err := os.WriteFile(configPath, []byte(config), 0600); err != nil {
		return err
	}
	command := func(name string, args ...string) *exec.Cmd {
		cmd := exec.CommandContext(ctx, name, args...)
		cmd.Dir = filepath.Join(work, "downloads")
		cmd.Env = append(os.Environ(), "APT_CONFIG="+configPath, "LC_ALL=C")
		return cmd
	}
	run := func(cmd *exec.Cmd) error {
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		return cmd.Run()
	}
	fmt.Fprintln(os.Stdout, "Preparing Chromium libraries in the user cache (no root required)...")
	if err := run(command("apt-get", "update")); err != nil {
		return fmt.Errorf("refresh authenticated APT indexes: %w", err)
	}
	probe := command(node, filepath.Join(moduleDir, "cli.js"), "install-deps", "--dry-run", "chromium")
	output, probeErr := probe.CombinedOutput()
	packages, err := missingPackages(string(output))
	var exitError *exec.ExitError
	missingExit := errors.As(probeErr, &exitError) && exitError.ExitCode() == 1 && len(packages) > 0
	if err != nil || (probeErr != nil && !missingExit) {
		return fmt.Errorf("inspect Playwright system dependencies: %v (%v)\n%s", probeErr, err, output)
	}
	if len(packages) > 0 {
		if err := run(command("apt-get", append([]string{"download"}, packages...)...)); err != nil {
			return fmt.Errorf("download authenticated system packages: %w", err)
		}
		archives, err := filepath.Glob(filepath.Join(work, "downloads", "*.deb"))
		if err != nil || len(archives) != len(packages) {
			return fmt.Errorf("downloaded %d archives for %d packages", len(archives), len(packages))
		}
		for _, archive := range archives {
			if err := run(command("dpkg-deb", "--extract", archive, filepath.Join(work, "root"))); err != nil {
				return fmt.Errorf("extract %s: %w", filepath.Base(archive), err)
			}
		}
	}
	root := filepath.Join(cache, "system-libraries")
	// Fontconfig otherwise searches /etc/fonts, which is absent in minimal
	// images. Supply a private configuration including the extracted fonts and
	// any existing host configuration; Chromium still uses Daybook's web fonts.
	var fontConfig strings.Builder
	fontConfig.WriteString("<?xml version=\"1.0\"?><fontconfig><include ignore_missing=\"yes\">/etc/fonts/fonts.conf</include><dir>")
	if err := xml.EscapeText(&fontConfig, []byte(filepath.Join(root, "usr", "share", "fonts"))); err != nil {
		return err
	}
	fontConfig.WriteString("</dir><cachedir>")
	if err := xml.EscapeText(&fontConfig, []byte(filepath.Join(cache, "fontconfig"))); err != nil {
		return err
	}
	fontConfig.WriteString("</cachedir></fontconfig>\n")
	if err := os.WriteFile(filepath.Join(work, "root", "fonts.conf"), []byte(fontConfig.String()), 0600); err != nil {
		return err
	}
	if err := os.RemoveAll(root); err != nil {
		return err
	}
	if err := os.Rename(filepath.Join(work, "root"), root); err != nil {
		return err
	}
	fmt.Fprintf(os.Stdout, "Prepared %d system packages in %s.\n", len(packages), root)
	return nil
}

var missingHeader = regexp.MustCompile(`^Missing system dependencies \(([0-9]+)\):$`)
var debianPackage = regexp.MustCompile(`^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9][a-z0-9-]*)?$`)

// Parse the public dry-run output of the pinned Playwright version. Unknown
// output fails closed instead of silently omitting required dependencies.
func missingPackages(output string) ([]string, error) {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) == 1 && lines[0] == "All system dependencies are installed." {
		return nil, nil
	}
	header := missingHeader.FindStringSubmatch(lines[0])
	if len(header) != 2 {
		return nil, fmt.Errorf("unexpected Playwright dependency report")
	}
	count, _ := strconv.Atoi(header[1])
	if count == 0 || count != len(lines)-1 {
		return nil, fmt.Errorf("incomplete Playwright dependency report")
	}
	packages := make([]string, 0, count)
	seen := make(map[string]bool, count)
	for _, line := range lines[1:] {
		name := strings.TrimSpace(line)
		if !debianPackage.MatchString(name) || seen[name] {
			return nil, fmt.Errorf("invalid dependency name %q", name)
		}
		seen[name] = true
		packages = append(packages, name)
	}
	return packages, nil
}

func userLibraryPath() string {
	if runtime.GOOS != "linux" {
		return ""
	}
	cache, err := runtimeDirectory()
	if err != nil {
		return ""
	}
	root := filepath.Join(cache, "system-libraries")
	var paths []string
	for _, base := range []string{"lib", "usr/lib"} {
		dir := filepath.Join(root, base)
		multiarch, _ := filepath.Glob(filepath.Join(dir, "*-linux-gnu"))
		for _, candidate := range append(multiarch, dir) {
			if info, err := os.Stat(candidate); err == nil && info.IsDir() {
				paths = append(paths, candidate)
			}
		}
	}
	return strings.Join(paths, ":")
}

func userFontConfig() string {
	if runtime.GOOS == "linux" {
		if cache, err := runtimeDirectory(); err == nil {
			config := filepath.Join(cache, "system-libraries", "fonts.conf")
			if info, err := os.Stat(config); err == nil && !info.IsDir() {
				return config
			}
		}
	}
	return ""
}
