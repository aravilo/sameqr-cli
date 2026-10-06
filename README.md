# sameqr

Same-QR from the command line: dynamic QR codes, hosted pages (menus, price
lists, opening hours …) and menu import — for you, your scripts and your
coding agent. Node.js 18+, no dependencies.

```bash
npm install -g sameqr
sameqr login                 # paste your key (hidden input)
sameqr qr list
sameqr qr create --name "Menu" --url https://example.com/menu
sameqr qr update <id> --url https://example.com/menu-new
sameqr seite publish menu/zum-loewen
sameqr karte import menu.pdf --seite menu/zum-loewen
sameqr mcp                   # MCP setup for Claude Code, Cursor, Codex
sameqr --help                # German help with --lang de
```

Create a key at https://sameqr.com/dashboard → Account → Access for CLI,
scripts and agents. In scripts, set `SAMEQR_API_KEY`. The key is never passed
as an argument; `sameqr login` stores it in `~/.config/sameqr/config.json`
(mode 0600). `--json` makes every command machine-readable.

Docs: https://sameqr.com/entwickler · API: https://sameqr.com/api/v1/openapi.json

## Issues and security

Bugs and ideas: https://github.com/aravilo/sameqr-cli/issues.
Security issues please privately to office@aravilo.com, not as a public issue.

Released by GitHub Actions with npm Trusted Publishing (provenance). MIT License.
