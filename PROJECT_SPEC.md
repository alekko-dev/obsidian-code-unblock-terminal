# Code Unblock Terminal - Project Specification

## Project Overview

**Plugin Name:** obsidian-code-unblock-terminal
**Display Name:** Code Unblock Terminal

A Windows-first terminal integration plugin for Obsidian with planned cross-platform support. Enables users to work with shell commands alongside their markdown notes. The plugin provides an integrated terminal panel that appears below or beside the editor, allowing seamless interaction between documentation and command execution.

**Key Differentiators:**
- Zero external dependencies (no Python required) through native Node.js addons
- Seamless code block execution directly from markdown with variable substitution
- Built for Windows with PowerShell and WSL as first-class citizens

## Target Platform

- **Initial Release:** Windows 10/11
- **Planned:** macOS, Linux (future versions)
- **Shells Supported (Windows):**
  - PowerShell Core (pwsh)
  - Windows PowerShell (powershell)
  - WSL (Windows Subsystem for Linux) - all distributions
  - Command Prompt (cmd)
  - Git Bash
- **External Terminal:** Windows Terminal integration

## Core Use Case

Users can open a markdown file with command documentation and execute those commands in a terminal panel visible simultaneously:

```
┌─────────────────────────────────────────┐
│  setup-guide.md                         │
│  # Project Setup                        │
│                                         │
│  ```bash                                │
│  npm install                            │
│  npm run dev                            │
│  ```                                    │
├─────────────────────────────────────────┤
│ [PowerShell] [WSL Ubuntu] [+]           │
│ PS C:\vault> npm install                │
│ added 245 packages in 12s               │
│ PS C:\vault> ▊                          │
└─────────────────────────────────────────┘
```

## MVP Features

### 1. Terminal Panel Management

#### 1.1 Panel Positioning
- **Bottom Panel** (default): Terminal appears below editor
- **Right Sidebar**: Terminal in right sidebar
- **Left Sidebar**: Terminal in left sidebar
- User configurable in settings
- Uses Obsidian's native workspace API

#### 1.2 Panel Behavior
- Toggle show/hide with ribbon icon
- Hotkey support (default: `Ctrl+` `)
- Resizable via drag divider
- Panel size persists across sessions
- Terminals continue running when panel hidden
- Auto-hide option when switching to reading view

#### 1.3 Multiple Terminals
- Tabbed interface within terminal panel
- Each tab is independent shell session
- Click `[+]` button to add new terminal
- Click `[x]` on tab to close terminal
- Tab titles show shell type: `PowerShell`, `WSL Ubuntu`, etc.

### 2. Shell Integration

#### 2.1 Integrated Terminals (Windows)
All shells run inside Obsidian terminal panel using xterm.js:

**Note:** macOS (zsh, bash) and Linux (bash, zsh, fish) shells will be added in future releases.

Interactive sessions are powered by a dedicated PTY management layer (node-pty/ConPTY) that streams data between the shell processes and xterm.js while respecting per-profile configuration.

**PowerShell Core (pwsh):**
- Full interactive session
- Tab completion support
- Color/ANSI output
- Working directory: vault root by default

**Windows PowerShell (powershell):**
- Same features as PowerShell Core
- Fallback when pwsh not installed

**WSL (all distributions):**
- Auto-detect installed distributions (`wsl -l -q`)
- Automatic path conversion: `C:\vault` → `/mnt/c/vault`
- Full Linux environment support
- Tab completion and colors

**Command Prompt (cmd):**
- Basic cmd.exe integration
- Color support where available

**Git Bash:**
- Auto-detect installation location
- Unix-like commands on Windows

#### 2.2 External Terminal (Windows Terminal)
- Launch Windows Terminal in separate window
- Opens at vault directory or context folder
- Respects Windows Terminal profile settings
- Available via:
  - Ribbon icon (with Ctrl modifier)
  - Command palette
  - Context menu

### 3. Terminal Features

#### 3.1 Basic Operations
- **Input:** Full keyboard input, special keys (Ctrl+C, Ctrl+D, etc.)
- **Copy:** `Ctrl+Shift+C` on selected text
- **Paste:** `Ctrl+Shift+V` into terminal
- **Right-click:** Context menu with copy/paste options
- **Scrollback:** Configurable history buffer
- **Clear:** Command to clear terminal output

#### 3.2 Auto-resize
- Terminal resizes automatically when:
  - Panel is resized via drag
  - Obsidian window resizes
  - Sidebar is toggled
- PTY layer receives updated geometry and forwards it to the shell session
- Uses native Node.js addon for Windows console buffer manipulation focused on resize events
- No flickering or manual refresh needed

#### 3.3 Visual Features
- xterm.js rendering engine
- Font ligatures support
- Smooth scrolling
- Theme integration (matches Obsidian light/dark mode)
- Configurable font family and size

### 4. Code Block Integration

#### 4.1 Code Block Detection
**Automatic scanning of active markdown file:**
- Detects all code blocks in current document
- Supported languages: `bash`, `sh`, `powershell`, `ps`, `cmd`, `batch`
- Updates list when switching files or editing
- Shows code block preview with line numbers

**Code Block List View:**
```
┌─ Code Blocks in Current File ───────────┐
│ 1. Install dependencies (line 12)       │
│    bash                                  │
│    npm install                      [▶]  │
│                                          │
│ 2. Start dev server (line 18)           │
│    bash                                  │
│    npm run dev                      [▶]  │
│                                          │
│ 3. Run tests (line 25)                  │
│    powershell                            │
│    pytest tests/ -v                 [▶]  │
└──────────────────────────────────────────┘
```

#### 4.2 Quick Execute from Code Block List
**Click [▶] button to execute:**
- Command runs in active terminal tab
- If no terminal open, creates new terminal with appropriate shell
- Command appears in terminal as if typed manually
- User can see output immediately

**Execute flow:**
1. User clicks [▶] button next to code block
2. Plugin switches to terminal panel (opens if hidden)
3. Command is pasted and executed
4. User can interact with running process

#### 4.3 Inline Code Block Buttons
**Run button appears on hover over code blocks:**

```markdown
```bash
npm install
npm run dev
```  [▶ Run in Terminal]
```

**Button behavior:**
- Appears on mouse hover over code block
- Click executes entire code block in terminal
- Multi-line blocks execute line by line
- Respects shell syntax (e.g., line continuations)
- **Works in both viewing mode AND editing mode**
  - In viewing mode: Button overlays on rendered code block
  - In editing mode: Button appears in editor gutter or inline
  - Same functionality in both modes

#### 4.4 Parameter & Variable Detection
**Automatic detection of script parameters:**

```markdown
```bash
# Parameters detected: $PROJECT_NAME, $VERSION
docker build -t $PROJECT_NAME:$VERSION .
docker push $PROJECT_NAME:$VERSION
```
```

**Parameter definition UI:**
```
┌─ Script Parameters ──────────────────────┐
│ The following variables are undefined:   │
│                                          │
│ PROJECT_NAME: [myapp              ]     │
│ VERSION:      [1.0.0              ]     │
│                                          │
│ ☑ Remember values for this session       │
│                                          │
│          [Cancel]  [Run with Parameters] │
└──────────────────────────────────────────┘
```

**Variable formats detected:**
- PowerShell: `$VarName`, `${VarName}`
- Bash/WSL: `$VAR_NAME`, `${VAR_NAME}`
- Batch/CMD: `%VAR_NAME%`
- Environment variables are excluded (PATH, HOME, etc.)

**Smart substitution:**
- Prompts for undefined variables before execution
- Remembers values within session
- Option to save common variables in settings
- Shows preview of command with substituted values

#### 4.5 Context Integration

##### 4.5.1 Ribbon Menu
- **Click:** Toggle terminal panel
- **Ctrl+Click:** Open Windows Terminal (external)
- Icon: Terminal/command-line symbol

##### 4.5.2 Command Palette
Commands available (prefixed with "Code Unblock Terminal:"):
- `Code Unblock Terminal: Toggle panel`
- `Code Unblock Terminal: Open PowerShell`
- `Code Unblock Terminal: Open WSL (Ubuntu)`
- `Code Unblock Terminal: Open in Windows Terminal`
- `Code Unblock Terminal: Show code blocks`
- `Code Unblock Terminal: Run code block at cursor`
- `Code Unblock Terminal: Close current terminal`
- `Code Unblock Terminal: Close all terminals`

##### 4.5.3 Context Menu
**Right-click on folder in file explorer:**
- "Open terminal here" → Opens integrated terminal at folder path
- "Open in Windows Terminal" → Launches external Windows Terminal

**Right-click on file:**
- "Open terminal in file's folder" → Opens terminal at file's directory

**Right-click on code block:**
- "Run in terminal" → Execute code block
- "Run in PowerShell" → Execute in PowerShell specifically
- "Run in WSL" → Execute in WSL terminal
- "Copy to terminal" → Paste without executing

### 5. Settings

#### 5.1 Panel Settings
```
┌─ Panel Behavior ─────────────────────────┐
│ Default Position:                         │
│ ● Bottom panel                            │
│ ○ Right sidebar                           │
│ ○ Left sidebar                            │
│                                           │
│ Default Panel Height: [200px] ──────────  │
│ ☑ Remember panel size                     │
│ ☑ Restore terminals on startup            │
│ ☑ Auto-hide in reading view               │
└───────────────────────────────────────────┘
```

#### 5.2 Shell Settings
```
┌─ Default Shell ──────────────────────────┐
│ [PowerShell Core (pwsh)        ▼]        │
└───────────────────────────────────────────┘

┌─ Shell Profiles ─────────────────────────┐
│ Name: PowerShell Core                     │
│ Executable: pwsh                          │
│ Arguments: -NoLogo                        │
│ Working Dir: {vault}                      │
│                        [Add] [Edit] [✓]   │
│                                           │
│ Available Variables:                      │
│ • {vault} - Vault root directory          │
│ • {folder} - Current folder               │
│ • {file} - Current file's directory       │
└───────────────────────────────────────────┘

┌─ WSL Settings ───────────────────────────┐
│ ☑ Auto-convert paths (C:\ to /mnt/c)     │
│ ☑ Auto-detect WSL distributions           │
│                                           │
│ Detected distributions:                   │
│ • Ubuntu                                  │
│ • Debian                                  │
└───────────────────────────────────────────┘
```

#### 5.3 Windows Terminal Integration
```
┌─ Windows Terminal ───────────────────────┐
│ ☑ Enable Windows Terminal support        │
│                                           │
│ Executable path:                          │
│ [wt.exe                               ]   │
│                                           │
│ Default profile:                          │
│ [Windows.Terminal.PowerShell7     ▼]     │
└───────────────────────────────────────────┘
```

#### 5.4 Appearance
```
┌─ Terminal Appearance ────────────────────┐
│ Font Family: [Cascadia Code          ]   │
│ Font Size: [14                       ]   │
│                                           │
│ Theme:                                    │
│ ● Follow Obsidian theme                   │
│ ○ Always dark                             │
│ ○ Always light                            │
│ ○ Custom                                  │
│                                           │
│ Scrollback lines: [1000              ]   │
│ ☑ Enable font ligatures                  │
└───────────────────────────────────────────┘
```

#### 5.5 Code Block Settings
```
┌─ Code Block Execution ───────────────────┐
│ ☑ Show run buttons on code blocks        │
│ ☑ Show code block list in terminal panel │
│ ☑ Auto-detect script parameters           │
│ ☑ Prompt for undefined variables          │
│                                           │
│ Supported languages:                      │
│ ☑ bash/sh                                 │
│ ☑ PowerShell                              │
│ ☑ cmd/batch                               │
│                                           │
│ Button position:                          │
│ ● Top-right of code block                │
│ ○ Bottom-right of code block              │
│                                           │
│ Default execution shell:                  │
│ ○ Auto-detect from code block language    │
│ ● Use default shell                       │
│                                           │
│ Multi-line execution:                     │
│ ● Execute as single command               │
│ ○ Execute line by line                    │
└───────────────────────────────────────────┘

┌─ Variable Management ────────────────────┐
│ Saved Variables:                          │
│                                           │
│ PROJECT_NAME = "myapp"           [Edit]   │
│ VERSION = "1.0.0"                [Edit]   │
│ DOCKER_REGISTRY = "docker.io"    [Edit]   │
│                                [Add New]  │
│                                           │
│ ☑ Remember variables per vault            │
│ ☑ Exclude common env vars (PATH, etc)     │
└───────────────────────────────────────────┘
```

#### 5.6 Behavior
```
┌─ Terminal Behavior ──────────────────────┐
│ ☑ Warn before closing running process    │
│ ☑ Clear terminal on shell exit            │
│                                           │
│ Hotkey to toggle panel: [Ctrl+`      ]   │
│ Hotkey to run code block: [Ctrl+Enter]   │
└───────────────────────────────────────────┘
```

### 6. Session Persistence

#### 6.1 State Saved on Exit
- Panel visibility (shown/hidden)
- Panel size and position
- Open terminal tabs (shell type, working directory)
- Command history per terminal (optional)
- Saved script variables per vault
- Code block execution preferences

#### 6.2 Restore on Startup
- Reopens terminals that were open on exit
- Restores working directories
- Maintains panel configuration
- Restores saved variables
- User can disable in settings

### 7. Error Handling

#### 7.1 User-Friendly Error Messages

**Shell not found:**
```
⚠ Shell Not Found

PowerShell Core (pwsh) is not installed or not in PATH.

[Open Settings] [Use PowerShell Instead] [Cancel]
```

**WSL not available:**
```
⚠ WSL Not Enabled

Windows Subsystem for Linux is not installed on this system.

[Learn How to Install WSL] [Use PowerShell] [Cancel]
```

**Windows Terminal not found:**
```
⚠ Windows Terminal Not Installed

Could not find Windows Terminal (wt.exe).

[Install from Microsoft Store] [Cancel]
```

**Terminal crashed:**
```
⚠ Terminal Process Exited

The terminal process exited unexpectedly.
Exit code: 1

[View Logs] [Restart Terminal] [Close]
```

#### 7.2 Graceful Degradation
- If preferred shell unavailable, fallback to PowerShell
- If native addon fails to load, show warning but continue (limited resize)
- If Windows Terminal not found, disable external terminal features

## Technical Architecture

### 8. Technology Stack

#### 8.1 Core Dependencies
- **Obsidian API:** ~1.4.11
- **xterm.js:** ^5.5.0
- **xterm.js addons:**
  - @xterm/addon-fit (auto-sizing)
  - @xterm/addon-web-links (clickable URLs)
  - @xterm/addon-webgl or @xterm/addon-canvas (rendering)
  - @xterm/addon-ligatures (font ligatures)
  - @xterm/addon-unicode11 (Unicode support)
- **PTY layer:**
  - Preferred: **node-pty** ^1.0.0 (ConPTY bindings on Windows, forkpty on Unix)
  - Alternative: custom napi-based ConPTY bindings if node-pty cannot be bundled

#### 8.2 PTY Management Layer
**Purpose:** Provide a unified interface for spawning and managing shell processes via ConPTY/PTY APIs.

- `pty-manager.ts` wraps `node-pty` (or custom bindings) and exposes a strongly typed API to the rest of the plugin.
- `shell-manager.ts` orchestrates profile selection, environment injection, and delegates lifecycle events to the PTY manager.
- Integrates with `xterm-manager.ts` by streaming PTY output to xterm.js and writing user input back to the PTY.
- Emits resize notifications that are consumed by the native resize helper when Windows-specific buffer adjustments are required.
- Responsible for reconnect logic and detecting abnormal PTY exits to drive user-facing error handling.

**Cross-platform benefits:**
- `node-pty` ships with native backends for Windows (ConPTY), macOS, and Linux (forkpty), giving us a consistent API surface.
- Reduces the amount of platform-specific process code required for the planned macOS and Linux phases.
- Simplifies future Phase 7/8 work by keeping PTY responsibilities centralized in one module regardless of platform.

#### 8.3 Native Addons (Node.js)
**Purpose:** Replace Python dependency for terminal resizing

**Windows Native Addon (`terminal_windows.node`):**
- Receives resize instructions from the PTY manager to adjust underlying Win32 console buffers
- Performs process enumeration (replaces psutil) and lightweight window management (replaces pywinctl)
- Handles console resize operations that are outside the scope of node-pty's abstractions
- Explicitly **does not** own PTY creation; that responsibility is isolated in the PTY layer
- **Note:** macOS and Linux equivalents planned for future releases

**Built with:**
- C++ with Node-API (NAPI)
- Or Rust with napi-rs

**Functions exposed:**
```typescript
interface TerminalNative {
  resizeConsole(pid: number, cols: number, rows: number): void;
  findTerminalWindow(pid: number): WindowHandle | null;
  hideConsoleWindow(handle: WindowHandle): void;
}
```

#### 8.4 Build System
- **Bundler:** esbuild
- **TypeScript:** Strict mode
- **Native compilation:** node-gyp or cargo (for Rust)
- **Pre-built binaries:** Ship compiled .node files for Windows x64/ARM

### 9. File Structure

```
obsidian-code-unblock-terminal/
├── src/
│   ├── main.ts                 # Plugin entry point
│   ├── settings.ts             # Settings interface & data
│   ├── terminal/
│   │   ├── terminal-view.ts    # Main terminal panel view
│   │   ├── xterm-manager.ts    # xterm.js wrapper
│   │   ├── shell-manager.ts    # Shell profile orchestration + PTY lifecycle hooks
│   │   ├── profile-manager.ts  # Terminal profiles
│   │   ├── pty-manager.ts      # node-pty / ConPTY abstraction
│   │   └── native-resize.ts    # Windows-specific resize helper
│   ├── codeblock/
│   │   ├── detector.ts         # Code block detection in markdown
│   │   ├── executor.ts         # Code execution logic
│   │   ├── variable-parser.ts  # Parameter/variable detection
│   │   ├── variable-manager.ts # Variable storage & substitution
│   │   ├── run-button.ts       # Inline run button rendering
│   │   └── code-list-view.ts   # Code block list panel
│   ├── context/
│   │   ├── ribbon.ts           # Ribbon icon
│   │   ├── commands.ts         # Command palette commands
│   │   └── context-menu.ts     # File explorer context menu
│   └── utils/
│       ├── wsl.ts              # WSL detection & path conversion
│       └── windows-terminal.ts # Windows Terminal integration
├── native/
│   ├── windows/
│   │   ├── src/
│   │   │   └── terminal.cc     # C++ implementation
│   │   ├── binding.gyp         # node-gyp config
│   │   └── package.json
│   └── prebuilt/
│       └── win32-x64/
│           └── terminal.node   # Compiled binary
├── styles.css                  # Plugin styles
├── manifest.json
├── package.json
└── tsconfig.json
```

### 10. Development Phases

#### Phase 1: Core Terminal Panel (Week 1)
- [ ] Basic terminal view with xterm.js
- [ ] Panel positioning: vertical split (bottom) as default
- [ ] Alternative: sidebar positioning (left/right)
- [ ] Toggle show/hide
- [ ] PowerShell Core (pwsh) integration
- [ ] Basic settings tab

#### Phase 2: Shell Support (Week 1-2)
- [ ] Multiple shell profiles
- [ ] Shell auto-detection
- [ ] WSL support with path conversion
- [ ] Tabbed terminal interface
- [ ] Windows PowerShell fallback

#### Phase 3: Code Block Integration (Week 2)
- [ ] Code block detection in active file
- [ ] Variable/parameter parsing (PowerShell, Bash, CMD syntax)
- [ ] Code block list view in terminal panel
- [ ] Inline run buttons (viewing + editing mode)
- [ ] Variable substitution dialog
- [ ] Variable persistence per vault

#### Phase 4: PTY Integration & Native Helpers (Week 2-3)
- [ ] Integrate node-pty (or custom ConPTY bindings) with the PTY manager module
- [ ] Wire shell manager/xterm manager streams through the PTY layer
- [ ] Implement Windows native resize helper focused on console buffer adjustments
- [ ] Ensure clear separation: PTY layer owns process lifecycle; native helper handles resize/window affordances
- [ ] Build and bundle pre-compiled binaries for the native resize helper

#### Phase 5: Integration & Polish (Week 3-4)
- [ ] Context menu integration
- [ ] Windows Terminal external launch
- [ ] Session persistence (including variables)
- [ ] Error handling & user messaging
- [ ] Theming & appearance options

#### Phase 6: Testing & Release (Week 4)
- [ ] End-to-end testing
- [ ] WSL compatibility testing
- [ ] Code block execution testing (all shells)
- [ ] Variable detection edge cases
- [ ] Performance optimization
- [ ] Documentation with code block examples
- [ ] Community plugin submission

### 11. Cross-Platform Strategy

**Current (MVP):** Windows-only implementation
**Future:** Platform abstraction layer for macOS and Linux support

#### Platform-Specific Modules (Future)
```
src/platform/
├── windows/
│   ├── console-api.ts      # Win32 console manipulation
│   ├── process-mgmt.ts     # Windows process management
│   └── window-mgmt.ts      # Window handle management
├── macos/                   # Planned
│   ├── pty.ts              # macOS pseudoterminal
│   ├── terminal-api.ts     # CoreFoundation/AppKit APIs
│   └── process-mgmt.ts     # macOS process management
└── linux/                   # Planned
    ├── pty.ts              # Linux pseudoterminal
    ├── x11-api.ts          # X11/Wayland APIs
    └── process-mgmt.ts     # Linux process management
```

#### Shared Cross-Platform Core
These components are already platform-agnostic and will work on all platforms:
- **Terminal UI:** xterm.js (cross-platform web technology)
- **Code block detection:** Pure TypeScript, no platform dependencies
- **Variable substitution:** Platform-agnostic string parsing and replacement
- **Settings management:** Uses Obsidian API (cross-platform)
- **Build system:** esbuild works on all platforms

#### Architecture Design Principles
1. **Abstraction layer:** All platform-specific code isolated in `src/platform/`
2. **Interface-based:** Common interfaces for shell management, resize operations
3. **Graceful degradation:** Features degrade gracefully on unsupported platforms
4. **Conditional loading:** Platform-specific modules loaded only when needed

#### Implementation Notes
- Native addons will be built separately for each platform (Windows, macOS x64/ARM, Linux)
- Pre-built binaries distributed for common platforms
- Fallback to limited functionality if native addon unavailable

## Out of Scope (MVP)

The following features are **not included** in MVP but may be considered for future versions:

- ❌ Developer console (JavaScript REPL)
- ❌ SSH/remote terminal connections
- ❌ Terminal splitting within single tab
- ❌ Custom keybinding editor (uses Obsidian hotkeys)
- ❌ Advanced color scheme customization
- ❌ Terminal search functionality (Ctrl+F in terminal)
- ❌ Command history search (Ctrl+R)
- ❌ Terminal output capture/save to file
- ❌ Scheduled/automated script execution
- ❌ Git Bash support (future enhancement)
- ❌ Command Prompt support (future enhancement)
- ❌ Mobile support

## Planned Enhancements (Post-MVP)

The following features are planned for future releases after the initial Windows-only MVP:

### Phase 7: macOS Support
- [ ] Native addon for macOS (CoreFoundation/AppKit APIs)
- [ ] PTY (pseudoterminal) integration
- [ ] Shell profiles: zsh (default), bash, fish
- [ ] Terminal.app integration
- [ ] iTerm2 integration
- [ ] macOS-specific path handling
- [ ] Universal binary support (Intel + Apple Silicon)

### Phase 8: Linux Support
- [ ] Native addon for Linux (X11/Wayland APIs)
- [ ] PTY integration via node-pty
- [ ] Shell profiles: bash, zsh, fish
- [ ] GNOME Terminal integration
- [ ] Konsole integration (KDE)
- [ ] Distribution-specific testing (Ubuntu, Fedora, Arch)
- [ ] Flatpak/Snap compatibility considerations

## Success Criteria

### Functional Requirements
- ✅ Terminal panel opens as vertical split (bottom) by default
- ✅ PowerShell Core (pwsh) and WSL launch successfully
- ✅ WSL path conversion works automatically
- ✅ Terminal resizes smoothly without flickering
- ✅ Multiple terminals work simultaneously (tabbed interface)
- ✅ Code blocks detected and listed from active file
- ✅ Run buttons work in both viewing and editing modes
- ✅ Variables detected and substitution dialog appears
- ✅ Variables persist per vault across sessions
- ✅ Windows Terminal launches externally
- ✅ Context menu opens terminal at correct location
- ✅ Settings persist across restarts

### Performance Requirements
- Terminal startup < 500ms
- Resize latency < 100ms
- Code block detection < 100ms for typical files
- Variable parsing < 50ms per code block
- No UI blocking during command execution
- Supports scrollback of 10,000+ lines
- Memory usage < 100MB per terminal

### User Experience Requirements
- Zero setup required after installation
- No external dependencies (Python-free)
- Clear error messages for all failure cases
- Intuitive settings interface
- Consistent with Obsidian UI patterns

## Target Users

1. **Developers:** Running build scripts, git commands, npm/yarn
2. **DevOps:** Server management, deployment scripts
3. **Data Scientists:** Python scripts, data processing in WSL
4. **System Administrators:** PowerShell automation
5. **Technical Writers:** Testing documented commands while writing

## Competitive Analysis

**vs. Existing Obsidian Terminal Plugin:**
- ✅ No Python dependency (native Node.js addons)
- ✅ Native Windows console resize
- ✅ Better WSL support with path conversion
- ✅ Windows Terminal integration
- ✅ **Code block execution with variable substitution** (unique feature)
- ✅ Run buttons in viewing and editing modes

**vs. External Terminal (VS Code, Windows Terminal, etc.):**
- ✅ Integrated within Obsidian workflow
- ✅ Side-by-side with documentation
- ✅ Context-aware (opens at vault/folder location)
- ✅ **Direct code block execution from markdown**
- ❌ Less feature-rich (intentionally focused on documentation workflow)

## License & Distribution

- **License:** MIT (or user's choice)
- **Distribution:** Obsidian Community Plugins
- **Repository:** GitHub (public)
- **Documentation:** README.md with screenshots and usage guide
