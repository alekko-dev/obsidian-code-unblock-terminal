# Code Unblock Terminal

An Obsidian plugin that integrates terminals with seamless code block execution. Run shell commands directly from markdown with automatic variable substitution — no more copy-paste friction between documentation and terminal.

## Features (Phase 1 - MVP)

✅ **Integrated Terminal Panel**
- Full-featured terminal powered by xterm.js
- Flexible positioning: bottom panel, left sidebar, or right sidebar
- Automatic resizing and theme support (light/dark)

✅ **PowerShell Support**
- PowerShell Core (pwsh) and Windows PowerShell
- Automatic shell detection
- Works with your vault's directory as working folder

✅ **Obsidian Integration**
- Ribbon icon to toggle terminal
- Command palette integration
- Comprehensive settings tab
- Session persistence

## Installation

### From Release (Coming Soon)
1. Download the latest release from GitHub
2. Extract to `<vault>/.obsidian/plugins/code-unblock-terminal/`
3. Enable in Obsidian Settings → Community Plugins

### Manual Build
See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions.

## Usage

### Opening the Terminal

- **Ribbon Icon**: Click the terminal icon in the left ribbon
- **Command Palette**: Search for "Toggle terminal panel"

### Settings

Configure the plugin in Settings → Code Unblock Terminal:
- **Panel position**: Bottom, left sidebar, or right sidebar
- **Default shell**: PowerShell Core (pwsh) or Windows PowerShell
- **Appearance**: Font family, size, theme, scrollback lines
- **Behavior**: Auto-hide, session persistence

## Roadmap

### Phase 1: Core Terminal Panel ✅ (Completed)
- [x] Basic terminal view with xterm.js
- [x] Panel positioning (bottom/sidebar)
- [x] PowerShell Core integration
- [x] Settings tab

### Phase 2: Shell Support (In Progress)
- [ ] Multiple shell profiles
- [ ] WSL support with path conversion
- [ ] Tabbed terminal interface
- [ ] Shell auto-detection improvements

### Phase 3: Code Block Integration (Planned)
- [ ] Detect code blocks in markdown
- [ ] Inline "Run" buttons
- [ ] Variable detection and substitution (`$VAR_NAME`)
- [ ] Variable persistence per vault

### Phase 4: Advanced Features (Planned)
- [ ] Native Windows resize helper
- [ ] Windows Terminal external launch
- [ ] Context menu integration
- [ ] Advanced session management

## Requirements

- **Windows 10/11** (macOS/Linux support planned)
- **PowerShell Core** (pwsh) or Windows PowerShell
- **Obsidian** v1.4.11 or later

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for developer setup and contribution guidelines.

## Architecture

This plugin uses a layered architecture:
- **UI Layer**: xterm.js for terminal rendering
- **PTY Layer**: node-pty for cross-platform process management
- **Shell Layer**: Profile orchestration and lifecycle management

See [PROJECT_SPEC.md](PROJECT_SPEC.md) for complete technical specification.

## License

MIT