import { App, PluginSettingTab, Setting } from 'obsidian';
import CodeUnblockTerminalPlugin from './main';

export type PanelPosition = 'bottom' | 'left' | 'right';

export interface CodeUnblockTerminalSettings {
	// Panel settings
	panelPosition: PanelPosition;
	defaultPanelHeight: number;
	rememberPanelSize: boolean;
	restoreTerminalsOnStartup: boolean;
	autoHideInReadingView: boolean;

	// Shell settings
	defaultShell: string;

	// Appearance
	fontFamily: string;
	fontSize: number;
	theme: 'follow' | 'dark' | 'light' | 'custom';
	scrollbackLines: number;
	enableFontLigatures: boolean;

	// Behavior
	warnBeforeClosingRunningProcess: boolean;
	clearTerminalOnShellExit: boolean;
}

export const DEFAULT_SETTINGS: CodeUnblockTerminalSettings = {
	// Panel settings
	panelPosition: 'bottom',
	defaultPanelHeight: 300,
	rememberPanelSize: true,
	restoreTerminalsOnStartup: true,
	autoHideInReadingView: false,

	// Shell settings
	defaultShell: 'pwsh',

	// Appearance
	fontFamily: 'Cascadia Code, Consolas, monospace',
	fontSize: 14,
	theme: 'follow',
	scrollbackLines: 1000,
	enableFontLigatures: true,

	// Behavior
	warnBeforeClosingRunningProcess: true,
	clearTerminalOnShellExit: true,
};

export class CodeUnblockTerminalSettingTab extends PluginSettingTab {
	plugin: CodeUnblockTerminalPlugin;

	constructor(app: App, plugin: CodeUnblockTerminalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Panel Behavior Section
		containerEl.createEl('h2', { text: 'Panel Behavior' });

		new Setting(containerEl)
			.setName('Default position')
			.setDesc('Where the terminal panel should appear')
			.addDropdown(dropdown => dropdown
				.addOption('bottom', 'Bottom panel')
				.addOption('left', 'Left sidebar')
				.addOption('right', 'Right sidebar')
				.setValue(this.plugin.settings.panelPosition)
				.onChange(async (value: PanelPosition) => {
					this.plugin.settings.panelPosition = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default panel height')
			.setDesc('Initial height of the terminal panel in pixels')
			.addText(text => text
				.setPlaceholder('300')
				.setValue(String(this.plugin.settings.defaultPanelHeight))
				.onChange(async (value) => {
					const height = parseInt(value);
					if (!isNaN(height) && height > 0) {
						this.plugin.settings.defaultPanelHeight = height;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Remember panel size')
			.setDesc('Save panel size when resized and restore on startup')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.rememberPanelSize)
				.onChange(async (value) => {
					this.plugin.settings.rememberPanelSize = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Restore terminals on startup')
			.setDesc('Reopen terminals that were open when Obsidian was closed')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.restoreTerminalsOnStartup)
				.onChange(async (value) => {
					this.plugin.settings.restoreTerminalsOnStartup = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-hide in reading view')
			.setDesc('Automatically hide terminal panel when switching to reading view')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoHideInReadingView)
				.onChange(async (value) => {
					this.plugin.settings.autoHideInReadingView = value;
					await this.plugin.saveSettings();
				}));

		// Shell Settings Section
		containerEl.createEl('h2', { text: 'Shell Settings' });

		new Setting(containerEl)
			.setName('Default shell')
			.setDesc('Shell to use when opening new terminals (pwsh = PowerShell Core, powershell = Windows PowerShell)')
			.addText(text => text
				.setPlaceholder('pwsh')
				.setValue(this.plugin.settings.defaultShell)
				.onChange(async (value) => {
					this.plugin.settings.defaultShell = value;
					await this.plugin.saveSettings();
				}));

		// Appearance Section
		containerEl.createEl('h2', { text: 'Terminal Appearance' });

		new Setting(containerEl)
			.setName('Font family')
			.setDesc('Font to use in terminal')
			.addText(text => text
				.setPlaceholder('Cascadia Code, Consolas, monospace')
				.setValue(this.plugin.settings.fontFamily)
				.onChange(async (value) => {
					this.plugin.settings.fontFamily = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Font size')
			.setDesc('Font size in pixels')
			.addText(text => text
				.setPlaceholder('14')
				.setValue(String(this.plugin.settings.fontSize))
				.onChange(async (value) => {
					const size = parseInt(value);
					if (!isNaN(size) && size > 0) {
						this.plugin.settings.fontSize = size;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Theme')
			.setDesc('Terminal color theme')
			.addDropdown(dropdown => dropdown
				.addOption('follow', 'Follow Obsidian theme')
				.addOption('dark', 'Always dark')
				.addOption('light', 'Always light')
				.setValue(this.plugin.settings.theme)
				.onChange(async (value: 'follow' | 'dark' | 'light') => {
					this.plugin.settings.theme = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Scrollback lines')
			.setDesc('Number of lines to keep in terminal history')
			.addText(text => text
				.setPlaceholder('1000')
				.setValue(String(this.plugin.settings.scrollbackLines))
				.onChange(async (value) => {
					const lines = parseInt(value);
					if (!isNaN(lines) && lines > 0) {
						this.plugin.settings.scrollbackLines = lines;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Enable font ligatures')
			.setDesc('Enable font ligatures (requires compatible font)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableFontLigatures)
				.onChange(async (value) => {
					this.plugin.settings.enableFontLigatures = value;
					await this.plugin.saveSettings();
				}));

		// Behavior Section
		containerEl.createEl('h2', { text: 'Terminal Behavior' });

		new Setting(containerEl)
			.setName('Warn before closing running process')
			.setDesc('Show confirmation when closing a terminal with a running process')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.warnBeforeClosingRunningProcess)
				.onChange(async (value) => {
					this.plugin.settings.warnBeforeClosingRunningProcess = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Clear terminal on shell exit')
			.setDesc('Clear terminal output when the shell process exits')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.clearTerminalOnShellExit)
				.onChange(async (value) => {
					this.plugin.settings.clearTerminalOnShellExit = value;
					await this.plugin.saveSettings();
				}));
	}
}
