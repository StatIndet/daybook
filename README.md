# Daybook

Daybook is a minimalist static blog generator for Go and HTML beginners, featuring native Obsidian Markdown compatibility, zero-framework TypeScript interactions, and a clean, reading-focused design.

## Architecture

This repository (`StatIndet/daybook`) contains the Daybook CLI source code. It includes:
* **Go runtime**: Core CLI application and build engine.
* **Embedded assets**: Templates, CSS, and generated static files (`internal/embedded/`).
* **Frontend source**: TypeScript source files (`assets/ts/`).
* **Vendor pipeline**: npm-based asset generation for fonts, KaTeX, and Waline.
* **Release workflow**: GitHub Actions for building cross-platform standalone binaries.

### The Vault
Your blog content lives in an independent directory called a **Vault**, which is completely separated from this source repository.

The CLI runs inside your Vault and expects the following structure:
```
my-vault/
├── daybook.yaml
├── notes/
└── attachments/
```

## Installation

### Prebuilt Binaries (Recommended)
The easiest way to install Daybook is using our release installer. This script will automatically detect your OS and architecture, download the latest prebuilt CLI, verify its checksum, and install it to `~/.local/bin`.

```bash
curl -fsSL https://github.com/StatIndet/daybook/releases/latest/download/install.sh | bash
```
Alternatively, you can manually download the binaries from [GitHub Releases](https://github.com/StatIndet/daybook/releases).

### Build from Source
Building from source is recommended for development. Ensure you have **Go**, **Node.js** (>=24), and **npm** installed.

```bash
git clone https://github.com/StatIndet/daybook.git
cd daybook
./scripts/install-cli.sh
```
This script installs npm dependencies, builds frontend assets, and installs the `daybook` executable to your Go bin path (`$GOBIN` or `$(go env GOPATH)/bin`).

## CLI Commands

Run these commands inside your Vault directory:

* `daybook build`: Reads `daybook.yaml` and `notes/`, compiles your site, and outputs static HTML to `public/`.
* `daybook serve`: Starts a local web server at `http://localhost:1313` to preview your site.
* `daybook version`: Prints the current CLI version.

## Development

If you are modifying the Daybook CLI itself, follow this workflow:

```bash
# Install npm dependencies
npm ci

# Build first-party TypeScript files
npm run build:js

# Build third-party vendor assets (KaTeX, Waline, Fonts)
npm run build:vendor

# Run Go unit tests
go test ./...

# Build the temporary binary for local testing
go build -o daybook-cli ./cmd/daybook

# Run the complete integrity check suite
./scripts/check.sh
```

> **Note**: Do not modify generated files in `internal/embedded/static/js/` or `internal/embedded/static/vendor/` directly. Always modify the source TypeScript or update the npm package and run the corresponding build scripts.

## License

This project is open-sourced under the [MIT License](LICENSE).
