import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';

export interface XtermOptions {
	fontFamily?: string;
	fontSize?: number;
	theme?: 'dark' | 'light';
	scrollback?: number;
	enableLigatures?: boolean;
}

/**
 * XtermManager wraps xterm.js and provides a clean interface for terminal UI
 * rendering and interaction.
 *
 * Responsibilities:
 * - Initialize and configure xterm.js instance
 * - Manage terminal addons (fit, web-links, webgl)
 * - Handle terminal rendering and user input
 * - Provide interface for writing output and reading input
 */
export class XtermManager {
	private terminal: Terminal;
	private fitAddon: FitAddon;
	private containerElement: HTMLElement | null = null;

	constructor(options: XtermOptions = {}) {
		// Create terminal with theme
		this.terminal = new Terminal({
			fontFamily: options.fontFamily || 'Cascadia Code, Consolas, monospace',
			fontSize: options.fontSize || 14,
			theme: this.getTheme(options.theme || 'dark'),
			scrollback: options.scrollback || 1000,
			cursorBlink: true,
			allowProposedApi: true,
		});

		// Initialize addons
		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);

		// Web links addon - makes URLs clickable
		const webLinksAddon = new WebLinksAddon();
		this.terminal.loadAddon(webLinksAddon);

		// Try to load WebGL renderer for better performance
		try {
			const webglAddon = new WebglAddon();
			this.terminal.loadAddon(webglAddon);
		} catch (error) {
			console.warn('WebGL addon failed to load, falling back to canvas renderer:', error);
		}
	}

	/**
	 * Open the terminal in the specified container element
	 */
	open(container: HTMLElement): void {
		this.containerElement = container;
		this.terminal.open(container);

		// Fit to container size
		setTimeout(() => {
			this.fit();
		}, 0);
	}

	/**
	 * Fit the terminal to its container
	 */
	fit(): void {
		try {
			this.fitAddon.fit();
		} catch (error) {
			console.error('Failed to fit terminal:', error);
		}
	}

	/**
	 * Get the current terminal dimensions
	 */
	getDimensions(): { cols: number; rows: number } {
		return {
			cols: this.terminal.cols,
			rows: this.terminal.rows,
		};
	}

	/**
	 * Write data to the terminal
	 */
	write(data: string): void {
		this.terminal.write(data);
	}

	/**
	 * Write a line to the terminal (adds newline)
	 */
	writeln(data: string): void {
		this.terminal.writeln(data);
	}

	/**
	 * Clear the terminal screen
	 */
	clear(): void {
		this.terminal.clear();
	}

	/**
	 * Listen for user input (key presses)
	 */
	onData(callback: (data: string) => void): void {
		this.terminal.onData(callback);
	}

	/**
	 * Listen for terminal resize events
	 */
	onResize(callback: (dimensions: { cols: number; rows: number }) => void): void {
		this.terminal.onResize(callback);
	}

	/**
	 * Update terminal theme
	 */
	setTheme(theme: 'dark' | 'light'): void {
		this.terminal.options.theme = this.getTheme(theme);
	}

	/**
	 * Update font settings
	 */
	setFont(fontFamily: string, fontSize: number): void {
		this.terminal.options.fontFamily = fontFamily;
		this.terminal.options.fontSize = fontSize;
		this.fit();
	}

	/**
	 * Focus the terminal
	 */
	focus(): void {
		this.terminal.focus();
	}

	/**
	 * Dispose of the terminal and clean up resources
	 */
	dispose(): void {
		this.terminal.dispose();
	}

	/**
	 * Get the underlying xterm.js instance
	 */
	getTerminal(): Terminal {
		return this.terminal;
	}

	/**
	 * Get theme configuration for xterm
	 */
	private getTheme(theme: 'dark' | 'light') {
		if (theme === 'light') {
			return {
				foreground: '#000000',
				background: '#ffffff',
				cursor: '#000000',
				cursorAccent: '#ffffff',
				selection: '#0000ff40',
				black: '#000000',
				red: '#cd3131',
				green: '#00BC00',
				yellow: '#949800',
				blue: '#0451a5',
				magenta: '#bc05bc',
				cyan: '#0598bc',
				white: '#555555',
				brightBlack: '#666666',
				brightRed: '#cd3131',
				brightGreen: '#14ce14',
				brightYellow: '#b5ba00',
				brightBlue: '#0451a5',
				brightMagenta: '#bc05bc',
				brightCyan: '#0598bc',
				brightWhite: '#a5a5a5',
			};
		} else {
			// Dark theme
			return {
				foreground: '#cccccc',
				background: '#1e1e1e',
				cursor: '#ffffff',
				cursorAccent: '#000000',
				selection: '#ffffff40',
				black: '#000000',
				red: '#cd3131',
				green: '#0dbc79',
				yellow: '#e5e510',
				blue: '#2472c8',
				magenta: '#bc3fbc',
				cyan: '#11a8cd',
				white: '#e5e5e5',
				brightBlack: '#666666',
				brightRed: '#f14c4c',
				brightGreen: '#23d18b',
				brightYellow: '#f5f543',
				brightBlue: '#3b8eea',
				brightMagenta: '#d670d6',
				brightCyan: '#29b8db',
				brightWhite: '#e5e5e5',
			};
		}
	}
}
