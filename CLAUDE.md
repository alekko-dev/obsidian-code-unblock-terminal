# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**obsidian-code-unblock-terminal** is an Obsidian plugin that integrates terminals with seamless code block execution. Users can run shell commands directly from markdown with automatic variable substitution, eliminating copy-paste friction between documentation and terminal.

**Current Status**: Phase 1 (Core Terminal Panel) implemented. Basic terminal integration with PowerShell support is functional.

**Target Platform**: Windows-first (PowerShell, WSL), with planned macOS/Linux support via platform abstraction layer.

## Core Architecture

### Terminal Stack
- **UI Layer**: xterm.js with addons (fit, web-links, rendering, ligatures, unicode11)
- **PTY Layer**: node-pty (ConPTY on Windows, forkpty on Unix) - manages shell process lifecycle
- **Native Layer**: Windows-specific addon for console buffer resize and window management
- **Clear Separation**: PTY layer owns process creation/lifecycle; native helpers handle platform-specific resize/window operations

### Key Modules

**Phase 1 (Implemented):**
```
src/
├── main.ts                   # ✅ Plugin entry, commands, ribbon icon
├── settings.ts               # ✅ Settings interface and tab UI
└── terminal/
    ├── terminal-view.ts      # ✅ Main panel view (Obsidian workspace integration)
    ├── xterm-manager.ts      # ✅ xterm.js wrapper (UI rendering, themes)
    ├── pty-manager.ts        # ✅ node-pty abstraction (process lifecycle)
    └── shell-manager.ts      # ✅ Profile orchestration + PTY lifecycle hooks
```

**Future Phases (Planned):**
```
src/
├── terminal/
│   ├── profile-manager.ts    # Phase 2: Advanced shell profile configuration
│   └── native-resize.ts      # Phase 4: Windows console buffer adjustment
├── codeblock/
│   ├── detector.ts           # Phase 3: Parse markdown for executable code blocks
│   ├── executor.ts           # Phase 3: Execute commands in terminal
│   ├── variable-parser.ts    # Phase 3: Detect $VARS in scripts
│   └── variable-manager.ts   # Phase 3: Variable substitution + persistence
├── context/
│   └── context-menu.ts       # Phase 5: Right-click file explorer integration
└── utils/
    ├── wsl.ts                # Phase 2: WSL detection, path conversion
    └── windows-terminal.ts   # Phase 5: External Windows Terminal launch
```

### Data Flow
1. **Terminal Session**: xterm-manager → pty-manager (node-pty) → shell process
2. **Resize**: Panel drag → xterm-manager.resize() → pty-manager.resize() → native-resize helper (Windows buffer adjustment)
3. **Code Block Execution**: detector → variable-parser (detect $VARS) → executor → pty-manager.write()
4. **Variable Substitution**: User clicks "Run" → variable-manager checks for undefined vars → prompt dialog → substitute → execute

## Technology Stack

### Dependencies
- **Obsidian API**: ~1.4.11
- **xterm.js**: ^5.5.0 + addons (@xterm/addon-fit, @xterm/addon-web-links, etc.)
- **node-pty**: ^1.0.0 (primary PTY backend for all platforms)
- **Native Addon**: C++/Rust with Node-API (NAPI) or napi-rs

### Build System
- **Bundler**: esbuild
- **TypeScript**: Strict mode
- **Native Compilation**: node-gyp (C++) or cargo (Rust)
- **Pre-built Binaries**: Ship compiled .node files for Windows x64/ARM

### Native Addon Scope
**Windows addon responsibilities**:
- Console buffer resize (Win32 console manipulation)
- Process enumeration (replaces psutil)
- Window management (replaces pywinctl)

**NOT responsible for**:
- PTY creation (handled by node-pty/ConPTY)
- Process lifecycle (handled by pty-manager.ts)

## Cross-Platform Strategy

### Platform-Agnostic Components
- Terminal UI (xterm.js)
- Code block detection/parsing (pure TypeScript)
- Variable substitution (string parsing)
- Settings management (Obsidian API)

### Platform-Specific Isolation
All platform code will be isolated in `src/platform/{windows,macos,linux}/`:
- Windows: Win32 console APIs, ConPTY via node-pty
- macOS (future): CoreFoundation/AppKit, forkpty via node-pty
- Linux (future): X11/Wayland, forkpty via node-pty

**Design Principle**: node-pty provides cross-platform PTY abstraction; native addons handle only platform-specific UI/window concerns.

## Development Workflow

### Build Commands

```bash
# Install dependencies
npm install

# Development mode (watch mode with hot reload)
npm run dev

# Production build
npm run build
```

### Build Process
1. Install dependencies: `npm install` (includes node-pty with pre-built binaries)
2. Development: `npm run dev` - runs esbuild in watch mode with sourcemaps
3. Production: `npm run build` - creates minified main.js for distribution
4. Testing: Copy main.js, manifest.json, and styles.css to Obsidian vault plugins folder

### Project Structure (Implemented)
```
src/
├── main.ts                     # Plugin entry point, workspace integration
├── settings.ts                 # Settings interface and tab UI
└── terminal/
    ├── terminal-view.ts        # Main terminal panel view (Obsidian ItemView)
    ├── xterm-manager.ts        # xterm.js wrapper with theme/resize handling
    ├── pty-manager.ts          # node-pty abstraction layer
    └── shell-manager.ts        # Shell orchestration (PowerShell/WSL profiles)
```

### node-pty Integration
- node-pty is marked as external in esbuild config (native module)
- Pre-built binaries are included in node_modules after npm install
- No custom native addon compilation required for Phase 1
- Native Windows addon (resize helper) planned for Phase 4

## Key Features (MVP)

1. **Terminal Panel**: Bottom/sidebar positioning, tabbed interface, multiple shells (PowerShell, WSL)
2. **Code Block Integration**:
   - Detect code blocks with `bash`, `sh`, `powershell`, `ps` languages
   - Inline "Run" buttons (viewing + editing mode)
   - Variable detection: `$VarName` (PowerShell), `$VAR_NAME` (Bash)
   - Prompt for undefined variables before execution
   - Per-vault variable persistence
3. **WSL Support**: Auto-detect distributions, automatic path conversion (C:\ ↔ /mnt/c)
4. **Windows Terminal**: Launch external Windows Terminal at vault/folder context
5. **Session Persistence**: Restore terminal tabs, working directories, saved variables

## Important Design Constraints

- **Zero Python Dependencies**: Use native Node.js addons instead
- **PTY Ownership**: node-pty handles all process creation; native helpers are strictly for resize/window affordances
- **Windows-First**: MVP targets Windows 10/11; macOS/Linux support is future work
- **Graceful Degradation**: If native addon fails to load, continue with limited functionality (warn about resize issues)

## Architecture Decisions

### Why node-pty?
- Cross-platform PTY abstraction (ConPTY on Windows, forkpty on Unix)
- Reduces platform-specific process code
- Simplifies future macOS/Linux phases (Phase 7/8)
- Battle-tested in VS Code, Hyper, other terminal apps

### Why Native Addon?
- Replace Python dependencies (psutil, pywinctl)
- Windows console buffer manipulation requires Win32 APIs
- Future: macOS/Linux equivalents for platform-specific features

### Why Separate PTY and Native Layers?
- Clear responsibility boundaries
- PTY manager is cross-platform (via node-pty)
- Native helpers are platform-specific (Windows console, macOS AppKit, Linux X11)
- Easier to test and maintain

## Variable Substitution Details

### Supported Formats
- **PowerShell**: `$VarName`, `${VarName}`
- **Bash/WSL**: `$VAR_NAME`, `${VAR_NAME}`

### Exclusions
- Environment variables (PATH, HOME, USER, etc.) are NOT prompted
- Only user-defined variables in scripts trigger dialogs

### Persistence
- Variables saved per vault in plugin data
- Option to remember values per session or permanently
- Dialog shows previous values for editing

## Windows Terminal Integration

**Click ribbon**: Toggle terminal panel
**Ctrl+Click ribbon**: Launch Windows Terminal (external)

External launch behavior:
- Opens at vault root or context folder (right-click file explorer)
- Respects Windows Terminal profile settings
- Falls back gracefully if wt.exe not found
