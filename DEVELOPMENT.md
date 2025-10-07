# Development Guide

## Prerequisites

### Required
- **Node.js**: v18.x or v20.x (Node.js 22+ has issues with node-pty pre-built binaries)
- **npm**: v9.0+ (comes with Node.js)

### For Building node-pty from Source (Optional)
If pre-built binaries are not available for your Node.js version, you'll need:
- **Windows**:
  - Python 3.6+ (not Python 2.x)
  - Visual Studio Build Tools 2017 or later with "Desktop development with C++" workload
  - Or install via: `npm install --global windows-build-tools` (requires admin)

## Installation

### Quick Start (Recommended)

```bash
# Install dependencies (skip native compilation)
npm install --ignore-scripts

# Build the plugin
npm run build
```

This approach installs dependencies without compiling native modules. The `node-pty` module will be marked as external in the build and needs to be available at runtime.

### Full Installation (With Native Compilation)

If you have Python and build tools installed:

```bash
# Install dependencies including native compilation
npm install

# Build the plugin
npm run build
```

## Development Workflow

### Build Commands

```bash
# Development mode with watch (auto-rebuild on changes)
npm run dev

# Production build (minified)
npm run build

# Type check only (no build)
npx tsc -noEmit
```

### Testing in Obsidian

1. Build the plugin: `npm run build`
2. Copy these files to your Obsidian vault's plugins folder:
   ```
   <vault>/.obsidian/plugins/code-unblock-terminal/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```
3. Reload Obsidian or enable the plugin in Settings → Community Plugins

### Development Tips

- Use `npm run dev` for active development - it watches for file changes
- The plugin will hot-reload in Obsidian when you rebuild (may need to toggle the plugin)
- Check the Obsidian developer console (Ctrl+Shift+I) for errors

## Project Structure

```
src/
├── main.ts                    # Plugin entry point
├── settings.ts                # Settings UI and configuration
└── terminal/
    ├── terminal-view.ts       # Main terminal panel (Obsidian ItemView)
    ├── xterm-manager.ts       # xterm.js wrapper
    ├── pty-manager.ts         # node-pty process management
    └── shell-manager.ts       # Shell orchestration layer
```

## Troubleshooting

### node-pty Build Errors

**Problem**: `gyp ERR! find Python - Python is not set`

**Solution**:
1. Use `npm install --ignore-scripts` to skip native compilation
2. Or install Python 3.6+ and add to PATH
3. Or use Node.js v18.x/v20.x which have pre-built binaries

### Module Not Found Errors

**Problem**: `Cannot find module 'node-pty'`

**Solution**:
- Ensure `node-pty` is in your `node_modules/` folder
- Check that `node-pty` is listed as external in `esbuild.config.mjs`
- The plugin requires `node-pty` binaries to be available at runtime

### Terminal Not Appearing

**Problem**: Terminal panel doesn't open

**Solution**:
1. Check Obsidian console for errors
2. Verify all three files (main.js, manifest.json, styles.css) are in the plugin folder
3. Try disabling and re-enabling the plugin
4. Check that PowerShell (pwsh or powershell) is installed

## Phase 1 Implementation Status

### ✅ Completed
- Basic terminal panel with xterm.js
- Panel positioning (bottom/left/right sidebar)
- Toggle show/hide with ribbon icon
- PowerShell Core (pwsh) and Windows PowerShell integration
- Basic settings tab
- Auto-resize on panel resize
- Theme support (dark/light, follow Obsidian)

### 🚧 Known Limitations
- Single terminal only (tabbed interface planned for Phase 2)
- No WSL support yet (Phase 2)
- No code block execution yet (Phase 3)
- Manual terminal switching via dropdown (multiple tabs planned)

### 📋 Next Steps (Phase 2)
- Multiple shell profiles
- WSL support with path conversion
- Tabbed terminal interface
- Shell auto-detection improvements

## Contributing

This project follows the architecture outlined in PROJECT_SPEC.md:
- PTY layer (node-pty) handles process lifecycle
- Native addons (future) handle only platform-specific window/resize operations
- Clean separation of concerns between modules

## License

MIT
