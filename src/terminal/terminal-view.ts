import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { XtermManager } from './xterm-manager';
import { ShellManager } from './shell-manager';
import CodeUnblockTerminalPlugin from '../main';

export const TERMINAL_VIEW_TYPE = 'code-unblock-terminal-view';

/**
 * TerminalView provides the main terminal panel UI and integrates with
 * Obsidian's workspace system.
 *
 * Responsibilities:
 * - Create and manage terminal UI container
 * - Integrate with Obsidian workspace (leaf, view)
 * - Handle panel visibility and resizing
 * - Coordinate xterm and shell managers
 */
export class TerminalView extends ItemView {
	private plugin: CodeUnblockTerminalPlugin;
	private xtermManager: XtermManager | null = null;
	private shellManager: ShellManager | null = null;
	private terminalContainer: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: CodeUnblockTerminalPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TERMINAL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Terminal';
	}

	getIcon(): string {
		return 'terminal';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('code-unblock-terminal-container');

		// Create terminal wrapper
		const terminalWrapper = container.createDiv('terminal-wrapper');

		// Create terminal controls
		const controls = terminalWrapper.createDiv('terminal-controls');

		// Shell selector
		const shellSelector = controls.createEl('select', {
			cls: 'terminal-shell-selector',
		});

		// Detect available shells
		const availableShells = await ShellManager.detectAvailableShells();
		if (availableShells.length === 0) {
			new Notice('No compatible shells found. Please install PowerShell Core (pwsh) or Windows PowerShell.');
			return;
		}

		// Populate shell selector
		availableShells.forEach((profile) => {
			const option = shellSelector.createEl('option', {
				text: profile.name,
				value: profile.shell,
			});
			if (profile.shell === this.plugin.settings.defaultShell) {
				option.selected = true;
			}
		});

		// New terminal button
		const newTerminalBtn = controls.createEl('button', {
			text: 'New Terminal',
			cls: 'terminal-new-btn',
		});

		// Clear terminal button
		const clearBtn = controls.createEl('button', {
			text: 'Clear',
			cls: 'terminal-clear-btn',
		});

		// Create terminal display area
		this.terminalContainer = terminalWrapper.createDiv('terminal-display');

		// Initialize xterm
		const theme = this.getTheme();
		this.xtermManager = new XtermManager({
			fontFamily: this.plugin.settings.fontFamily,
			fontSize: this.plugin.settings.fontSize,
			theme,
			scrollback: this.plugin.settings.scrollbackLines,
		});

		// Open xterm in container
		this.xtermManager.open(this.terminalContainer);

		// Initialize shell manager
		this.shellManager = new ShellManager(this.xtermManager);

		// Handle shell events
		this.shellManager.on('start', (pid: number) => {
			console.log('Shell started with PID:', pid);
		});

		this.shellManager.on('exit', (code: number) => {
			console.log('Shell exited with code:', code);
			if (this.plugin.settings.clearTerminalOnShellExit) {
				this.xtermManager?.clear();
			}
			this.xtermManager?.writeln(`\r\nProcess exited with code ${code}`);
		});

		this.shellManager.on('error', (error: Error) => {
			console.error('Shell error:', error);
			new Notice(`Terminal error: ${error.message}`);
		});

		// Start the default shell
		const defaultProfile = availableShells.find(
			(p) => p.shell === this.plugin.settings.defaultShell
		) || availableShells[0];

		try {
			this.shellManager.start(defaultProfile, this.getWorkingDirectory());
		} catch (error) {
			console.error('Failed to start shell:', error);
			new Notice('Failed to start terminal. Check console for details.');
		}

		// Button event handlers
		newTerminalBtn.addEventListener('click', () => {
			// TODO: Implement tabbed terminals in future phase
			new Notice('Multiple terminals will be available in a future update');
		});

		clearBtn.addEventListener('click', () => {
			this.xtermManager?.clear();
		});

		shellSelector.addEventListener('change', (e) => {
			const selectedShell = (e.target as HTMLSelectElement).value;
			const profile = availableShells.find((p) => p.shell === selectedShell);
			if (profile && this.shellManager) {
				try {
					this.shellManager.stop();
					this.shellManager.start(profile, this.getWorkingDirectory());
				} catch (error) {
					console.error('Failed to switch shell:', error);
					new Notice('Failed to switch shell. Check console for details.');
				}
			}
		});

		// Handle resize events
		this.resizeObserver = new ResizeObserver(() => {
			this.handleResize();
		});
		this.resizeObserver.observe(this.terminalContainer);

		// Focus terminal
		this.xtermManager.focus();
	}

	async onClose(): Promise<void> {
		// Clean up resize observer
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

		// Stop shell
		if (this.shellManager?.isRunning()) {
			if (this.plugin.settings.warnBeforeClosingRunningProcess) {
				// TODO: Add confirmation dialog
				console.log('Closing terminal with running process');
			}
			this.shellManager.stop();
		}

		// Dispose xterm
		this.xtermManager?.dispose();
		this.xtermManager = null;
		this.shellManager = null;
	}

	/**
	 * Handle terminal resize
	 */
	private handleResize(): void {
		if (this.xtermManager && this.terminalContainer) {
			// Use RAF to debounce resize events
			requestAnimationFrame(() => {
				this.shellManager?.resize();
			});
		}
	}

	/**
	 * Get the current theme based on settings
	 */
	private getTheme(): 'dark' | 'light' {
		const { theme } = this.plugin.settings;
		if (theme === 'follow') {
			// Check if Obsidian is in dark mode
			const isDark = document.body.hasClass('theme-dark');
			return isDark ? 'dark' : 'light';
		}
		return theme === 'dark' ? 'dark' : 'light';
	}

	/**
	 * Get the working directory for the terminal
	 */
	private getWorkingDirectory(): string {
		// Use vault root as working directory
		const vaultPath = (this.app.vault.adapter as any).basePath;
		return vaultPath || process.cwd();
	}

	/**
	 * Get the xterm manager instance
	 */
	getXtermManager(): XtermManager | null {
		return this.xtermManager;
	}

	/**
	 * Get the shell manager instance
	 */
	getShellManager(): ShellManager | null {
		return this.shellManager;
	}
}
