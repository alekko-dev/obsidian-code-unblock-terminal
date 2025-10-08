# Development Guide

## Prerequisites

### Required
- **Node.js**: v20.x or v22.x (for running build tools)
- **npm**: v9.0+ (comes with Node.js)

### Important: Runtime vs Development Node.js Versions

This plugin runs in **Obsidian's Electron 37 environment** which uses **Node.js 22**.
The node-pty native module is compiled specifically for Electron 37 (not your local Node.js).

- **Development**: Use Node.js 20 or 22 to run build tools (esbuild, TypeScript)
- **Plugin Runtime**: Runs in Electron 37 with Node.js 22 (provided by Obsidian)
- **node-pty Compilation**: Done via `@electron/rebuild` for Electron 37's ABI

### For Building node-pty Locally (Optional)

**Note**: Local node-pty compilation requires complete build tools and is optional.
The CI pipeline handles native compilation automatically.

If you want to compile node-pty locally for testing:
- **Windows**:
  - Python 3.11 (Python 3.12+ removed distutils needed by node-gyp)
  - Visual Studio Build Tools 2017 or later with:
    - "Desktop development with C++" workload
    - MSVC Spectre-mitigated libraries (latest)
    - Windows SDK
- **macOS**: Xcode Command Line Tools
- **Linux**: build-essential, python3

## Installation

### Quick Start (Recommended for Development)

```bash
# Install dependencies (skip native compilation)
npm install --ignore-scripts

# Build the plugin
npm run build
```

This approach:
- Installs all dependencies except native modules
- Faster setup, no build tools required
- Plugin builds successfully but won't run terminal features locally
- CI pipeline compiles native modules for release

### Full Installation (For Local Testing)

If you have complete build tools installed and want to test terminal features locally:

```bash
# Install dependencies
npm install

# Install Electron for rebuild
npm install --save-dev electron@37.0.0

# Rebuild node-pty for Electron 37
npx @electron/rebuild -f -w node-pty

# Build the plugin
npm run build
```

**Note**: This requires complete Visual Studio build tools on Windows.
Most developers should use the Quick Start and test in Obsidian directly.

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

**Important**: The plugin requires platform-specific node-pty binaries to run.

#### Option 1: Use CI-Built Release (Recommended)
1. Download the appropriate package from GitHub releases
2. Extract to `<vault>/.obsidian/plugins/code-unblock-terminal/`
3. Enable in Settings → Community Plugins

#### Option 2: Build and Test Locally
1. Follow "Full Installation" steps above to compile node-pty
2. Build the plugin: `npm run build`
3. Copy to your Obsidian vault's plugins folder:
   ```
   <vault>/.obsidian/plugins/code-unblock-terminal/
   ├── main.js
   ├── manifest.json
   ├── styles.css
   └── node_modules/node-pty/  (with compiled binaries)
   ```
4. Reload Obsidian or enable the plugin in Settings → Community Plugins

**Note**: If you only run `npm run build` without compiling node-pty,
the plugin will load but terminal features won't work (you'll see a
"Failed to load node-pty module" error).

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

**Problem**: `gyp ERR! find Python - Python is not set` or `ModuleNotFoundError: No module named 'distutils'`

**Solution**:
1. **Quick fix**: Use `npm install --ignore-scripts` to skip native compilation
2. **For local testing**: Install Python 3.11 (not 3.12+) and add to PATH
3. **Best approach**: Use CI-built releases which include pre-compiled binaries

**Problem**: `error MSB8040: Spectre-mitigated libraries are required`

**Solution**:
- Install "MSVC v142+ Spectre-mitigated libs" from Visual Studio Installer
- Or use the Quick Start installation (skip native compilation)
- CI builds handle this automatically

**Problem**: `Cannot open include file: 'GenVersion.h'`

**Solution**:
- This indicates incomplete Visual Studio installation
- Easiest fix: Use `npm install --ignore-scripts` and test with CI-built releases
- Alternative: Install complete Visual Studio Build Tools

### Module Not Found Errors

**Problem**: `Cannot find module 'node-pty'` or `Failed to load node-pty module`

**Solution**:
- **In development**: This is expected if you used `--ignore-scripts`
- **In Obsidian**: You need the CI-built release with platform-specific binaries
- **For local testing**: Follow "Full Installation" steps to compile node-pty for Electron 37
- Check that `node-pty` is listed as external in `esbuild.config.mjs`

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
