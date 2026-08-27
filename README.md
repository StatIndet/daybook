# Daybook

Daybook is a minimalist static blog generator for Go and HTML beginners, featuring native Obsidian Markdown compatibility, zero-framework TypeScript interactions, and a clean, reading-focused design.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/StatIndet/daybook-vault)



## Desktop

|                           Homepage                           |                            Notes                             |                         Reading Mode                         |                          Footnotes                           |
| :----------------------------------------------------------: | :----------------------------------------------------------: | :----------------------------------------------------------: | :----------------------------------------------------------: |
| ![Daybook homepage](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E9%A6%96%E9%A1%B5.png) | ![Daybook notes page](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E7%AC%94%E8%AE%B0.png) | ![Daybook reading mode](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E9%98%85%E8%AF%BB%E6%A8%A1%E5%BC%8F.png) | ![Daybook footnotes](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E6%B3%A8%E9%87%8A.png) |
|                         Attachments                          |                       Knowledge Graph                        |                     Archive & Statistics                     |                            About                             |
| ![Daybook attachments](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E9%99%84%E4%BB%B6.png) | ![Daybook knowledge graph](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E5%85%B3%E7%B3%BB%E5%9B%BE%E8%B0%B1.png) | ![Daybook archive and statistics](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E5%BD%92%E6%A1%A3%E7%95%8C%E9%9D%A2%E4%B8%8E%E7%BB%9F%E8%AE%A1.png) | ![Daybook about page](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/about%E7%95%8C%E9%9D%A2.png) |

## Mobile

|                        Mobile Layout                         |                        Mobile Drawer                         |                       Reading Progress                       |
| :----------------------------------------------------------: | :----------------------------------------------------------: | :----------------------------------------------------------: |
| ![Daybook mobile layout](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E7%A7%BB%E5%8A%A8%E7%AB%AF%E5%B8%83%E5%B1%80.png) | ![Daybook mobile drawer](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E7%A7%BB%E5%8A%A8%E7%AB%AF%E6%8A%BD%E5%B1%89.png) | ![Daybook reading progress bar](https://raw.githubusercontent.com/StatIndet/picture/main/daybook/%E9%A1%B6%E9%83%A8%E8%BF%9B%E5%BA%A6%E6%9D%A1.png) |



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

The easiest way to install Daybook is using our release installer. This script will automatically detect your OS and architecture, download the latest prebuilt CLI, verify its checksum, and install it without requiring Go or Node.js.

#### Linux / macOS / BSD

```sh
curl -fsSL https://install.daybook.page | sh
```

By default, the executable is installed to `~/.local/bin/daybook`. You do not need root/sudo privileges. Ensure `~/.local/bin` is in your `$PATH`.

#### Windows

Open PowerShell and run:

```powershell
irm https://install.daybook.page/windows | iex
```

By default, the executable is installed to `%LOCALAPPDATA%\Programs\Daybook\bin\daybook.exe`. The installer will automatically add this directory to your User PATH. No administrator privileges or WSL are required.

### Platform Support

| Operating System | Architectures | Status |
|---|---|---|
| Linux | amd64, arm64 | Native tested |
| macOS | amd64, arm64 | Build-supported / experimental |
| Windows | amd64, arm64 | Native tested |
| FreeBSD | amd64 | Build-supported / experimental |
| OpenBSD | amd64, arm64 | Build-supported / experimental |
| NetBSD | amd64 | Build-supported / experimental |
| DragonFly BSD | amd64 | Build-supported / experimental |

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

## Acknowledge

[Retypeset](https://github.com/radishzzz/astro-theme-retypeset)

## License

This project is open-sourced under the [MIT License](LICENSE).
