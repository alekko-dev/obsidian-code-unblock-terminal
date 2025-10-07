import { Plugin, WorkspaceLeaf } from 'obsidian';
import { CodeUnblockTerminalSettings, CodeUnblockTerminalSettingTab, DEFAULT_SETTINGS } from './settings';
import { TerminalView, TERMINAL_VIEW_TYPE } from './terminal/terminal-view';

/**
 * CodeUnblockTerminalPlugin - Main plugin class
 *
 * Provides terminal integration for Obsidian with seamless code block execution.
 */
export default class CodeUnblockTerminalPlugin extends Plugin {
	settings: CodeUnblockTerminalSettings = DEFAULT_SETTINGS;
	private terminalView: TerminalView | null = null;

	async onload() {
		console.log('Loading Code Unblock Terminal plugin');

		// Load settings
		await this.loadSettings();

		// Register terminal view
		this.registerView(
			TERMINAL_VIEW_TYPE,
			(leaf) => {
				this.terminalView = new TerminalView(leaf, this);
				return this.terminalView;
			}
		);

		// Add ribbon icon
		this.addRibbonIcon('terminal', 'Toggle terminal', async (evt: MouseEvent) => {
			await this.toggleTerminalView();
		});

		// Add commands
		this.addCommand({
			id: 'toggle-terminal',
			name: 'Toggle terminal panel',
			callback: async () => {
				await this.toggleTerminalView();
			},
		});

		this.addCommand({
			id: 'open-terminal',
			name: 'Open terminal',
			callback: async () => {
				await this.openTerminalView();
			},
		});

		this.addCommand({
			id: 'close-terminal',
			name: 'Close terminal',
			callback: async () => {
				await this.closeTerminalView();
			},
		});

		// Add settings tab
		this.addSettingTab(new CodeUnblockTerminalSettingTab(this.app, this));

		// Open terminal on startup if configured
		if (this.settings.restoreTerminalsOnStartup) {
			// Wait for workspace to be ready
			this.app.workspace.onLayoutReady(async () => {
				await this.openTerminalView();
			});
		}
	}

	async onunload() {
		console.log('Unloading Code Unblock Terminal plugin');

		// Close terminal view
		await this.closeTerminalView();

		// Detach all leaves of our view type
		this.app.workspace.detachLeavesOfType(TERMINAL_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Open the terminal view in the configured position
	 */
	async openTerminalView(): Promise<void> {
		const { workspace } = this.app;

		// Check if terminal view already exists
		let leaf = workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)[0];

		if (!leaf) {
			// Create new leaf based on panel position
			const position = this.settings.panelPosition;

			if (position === 'bottom') {
				// Create a split at the bottom
				const mainLeaf = workspace.getLeaf('split', 'vertical');
				leaf = mainLeaf;
			} else if (position === 'left') {
				leaf = workspace.getLeftLeaf(false) as WorkspaceLeaf;
			} else if (position === 'right') {
				leaf = workspace.getRightLeaf(false) as WorkspaceLeaf;
			} else {
				// Default to bottom
				const mainLeaf = workspace.getLeaf('split', 'vertical');
				leaf = mainLeaf;
			}

			// Set the view
			await leaf.setViewState({
				type: TERMINAL_VIEW_TYPE,
				active: true,
			});
		}

		// Reveal the leaf
		workspace.revealLeaf(leaf);
	}

	/**
	 * Close the terminal view
	 */
	async closeTerminalView(): Promise<void> {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(TERMINAL_VIEW_TYPE);

		for (const leaf of leaves) {
			leaf.detach();
		}

		this.terminalView = null;
	}

	/**
	 * Toggle the terminal view visibility
	 */
	async toggleTerminalView(): Promise<void> {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(TERMINAL_VIEW_TYPE);

		if (leaves.length > 0) {
			// Terminal is open, close it
			await this.closeTerminalView();
		} else {
			// Terminal is closed, open it
			await this.openTerminalView();
		}
	}

	/**
	 * Get the current terminal view instance
	 */
	getTerminalView(): TerminalView | null {
		return this.terminalView;
	}
}
