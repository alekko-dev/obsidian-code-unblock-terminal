import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { XtermManager } from './xterm-manager';
import { ShellManager, ShellProfile } from './shell-manager';
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
	private windowResizeHandler: (() => void) | null = null;
	private pendingResizeFrame: number | null = null;
	private switchInProgress = false;

	// Track DOM event listeners for cleanup
	private buttonListeners: Array<{
		element: HTMLElement;
		type: string;
		handler: EventListener;
	}> = [];

	// Track shell event listeners for cleanup
	private shellEventListeners: Array<{
		event: string;
		handler: (...args: any[]) => void;
	}> = [];

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

		// Handle shell events - store handlers for cleanup
		const startHandler = (pid: number) => {
			console.log('Shell started with PID:', pid);
		};

		const exitHandler = (code: number) => {
			console.log('Shell exited with code:', code);
			if (this.plugin.settings.clearTerminalOnShellExit) {
				this.xtermManager?.clear();
			}
			this.xtermManager?.writeln(`\r\nProcess exited with code ${code}`);
		};

		const errorHandler = (error: Error) => {
			console.error('Shell error:', error);
			new Notice(`Terminal error: ${error.message}`);
		};

		this.shellManager.on('start', startHandler);
		this.shellManager.on('exit', exitHandler);
		this.shellManager.on('error', errorHandler);

		// Store for cleanup
		this.shellEventListeners = [
			{ event: 'start', handler: startHandler },
			{ event: 'exit', handler: exitHandler },
			{ event: 'error', handler: errorHandler },
		];

		// Handle resize events - setup before starting shell
		this.setupResizeHandling();

		// Start the default shell
		const defaultProfile = availableShells.find(
			(p) => p.shell === this.plugin.settings.defaultShell
		) || availableShells[0];

		// Button event handlers - store for cleanup
		const newTerminalHandler = () => {
			// TODO: Implement tabbed terminals in future phase
			new Notice('Multiple terminals will be available in a future update');
		};

		const clearHandler = () => {
			this.xtermManager?.clear();
		};

		const shellSelectorHandler = async (e: Event) => {
			const selectedShell = (e.target as HTMLSelectElement).value;
			const profile = availableShells.find((p) => p.shell === selectedShell);
			if (profile && this.shellManager) {
				try {
					await this.switchShell(profile);
				} catch (error) {
					console.error('Failed to switch shell:', error);
					new Notice('Failed to switch shell. Check console for details.');
				}
			}
		};

		newTerminalBtn.addEventListener('click', newTerminalHandler);
		clearBtn.addEventListener('click', clearHandler);
		shellSelector.addEventListener('change', shellSelectorHandler);

		// Store for cleanup
		this.buttonListeners = [
			{ element: newTerminalBtn, type: 'click', handler: newTerminalHandler },
			{ element: clearBtn, type: 'click', handler: clearHandler },
			{ element: shellSelector, type: 'change', handler: shellSelectorHandler },
		];

		try {
			this.shellManager.start(defaultProfile, this.getWorkingDirectory());
		} catch (error) {
			console.error('Failed to start shell:', error);
			new Notice('Failed to start terminal. Check console for details.');
			// Clean up ALL resources on error
			this.cleanupResources();
			return;
		}

		// Focus terminal
		this.xtermManager.focus();
	}

	async onClose(): Promise<void> {
		this.cleanupResources();
	}

	/**
	 * Clean up all resources (event listeners, observers, managers)
	 */
	private cleanupResources(): void {
		// Cancel pending resize frame
		if (this.pendingResizeFrame !== null) {
			cancelAnimationFrame(this.pendingResizeFrame);
			this.pendingResizeFrame = null;
		}

		// Clean up resize observer
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

		// Clean up fallback window resize handler
		if (this.windowResizeHandler) {
			window.removeEventListener('resize', this.windowResizeHandler);
			this.windowResizeHandler = null;
		}

		// Remove DOM event listeners
		this.buttonListeners.forEach(({ element, type, handler }) => {
			element.removeEventListener(type, handler);
		});
		this.buttonListeners = [];

		// Remove shell event listeners
		this.shellEventListeners.forEach(({ event, handler }) => {
			this.shellManager?.off(event, handler);
		});
		this.shellEventListeners = [];

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
	 * Switch to a different shell profile
	 * Protected against race conditions and includes timeout
	 */
	private async switchShell(profile: ShellProfile): Promise<void> {
		// Prevent concurrent shell switches
		if (!this.shellManager || this.switchInProgress) {
			return;
		}

		this.switchInProgress = true;

		try {
			return new Promise<void>((resolve, reject) => {
				if (!this.shellManager) {
					reject(new Error('Shell manager not initialized'));
					return;
				}

				// 5 second timeout for shell to exit
				const timeoutId = setTimeout(() => {
					if (this.shellManager) {
						this.shellManager.off('exit', onExit);
					}
					reject(new Error('Shell switch timeout - shell did not exit cleanly'));
				}, 5000);

				// Listen for exit event to ensure clean shutdown
				const onExit = () => {
					clearTimeout(timeoutId);

					if (!this.shellManager) {
						reject(new Error('Shell manager not initialized'));
						return;
					}

					// Start the new shell
					try {
						this.shellManager.start(profile, this.getWorkingDirectory());
						resolve();
					} catch (error) {
						reject(error);
					}
				};

				// If shell is running, wait for it to exit
				if (this.shellManager.isRunning()) {
					this.shellManager.once('exit', onExit);
					this.shellManager.stop();
				} else {
					// Shell not running, start immediately
					clearTimeout(timeoutId);
					try {
						this.shellManager.start(profile, this.getWorkingDirectory());
						resolve();
					} catch (error) {
						reject(error);
					}
				}
			});
		} finally {
			this.switchInProgress = false;
		}
	}

	/**
	 * Setup resize handling with ResizeObserver or fallback to window resize
	 */
	private setupResizeHandling(): void {
		if (!this.terminalContainer) {
			return;
		}

		// Try to use ResizeObserver (modern browsers)
		if (typeof ResizeObserver !== 'undefined') {
			try {
				this.resizeObserver = new ResizeObserver(() => {
					this.handleResize();
				});
				this.resizeObserver.observe(this.terminalContainer);
			} catch (error) {
				console.warn('Failed to observe terminal container resize:', error);
				this.setupFallbackResize();
			}
		} else {
			console.warn('ResizeObserver not supported, using fallback resize handling');
			this.setupFallbackResize();
		}
	}

	/**
	 * Fallback resize handling using window resize events
	 */
	private setupFallbackResize(): void {
		this.windowResizeHandler = () => this.handleResize();
		window.addEventListener('resize', this.windowResizeHandler);
	}

	/**
	 * Handle terminal resize with proper debouncing
	 */
	private handleResize(): void {
		if (!this.xtermManager || !this.terminalContainer) {
			return;
		}

		// Cancel pending resize if already scheduled
		if (this.pendingResizeFrame !== null) {
			cancelAnimationFrame(this.pendingResizeFrame);
		}

		// Schedule new resize
		this.pendingResizeFrame = requestAnimationFrame(() => {
			this.pendingResizeFrame = null;
			this.shellManager?.resize();
		});
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
	 * Falls back to home directory if vault path unavailable
	 */
	private getWorkingDirectory(): string {
		try {
			// Type-safe access to vault path
			const adapter = this.app.vault.adapter;
			if ('basePath' in adapter && typeof adapter.basePath === 'string') {
				// Validate path exists and is accessible
				const fs = require('fs');
				if (fs.existsSync(adapter.basePath)) {
					const stats = fs.statSync(adapter.basePath);
					if (stats.isDirectory()) {
						return adapter.basePath;
					}
				}
			}
		} catch (error) {
			console.warn('Could not determine vault path:', error);
		}

		// Fallback to user home directory
		return require('os').homedir();
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
