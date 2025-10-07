import { PTYManager, PTYProcess } from './pty-manager';
import { XtermManager } from './xterm-manager';
import { EventEmitter } from 'events';

export interface ShellProfile {
	name: string;
	shell: string;
	args?: string[];
	env?: { [key: string]: string };
}

/**
 * ShellManager orchestrates shell profile selection and manages the lifecycle
 * of shell sessions by coordinating between PTY and xterm.
 *
 * Responsibilities:
 * - Load and manage shell profiles
 * - Create shell sessions with proper configuration
 * - Wire PTY output to xterm and xterm input to PTY
 * - Handle shell lifecycle events
 */
export class ShellManager extends EventEmitter {
	private ptyManager: PTYManager;
	private xtermManager: XtermManager;
	private ptyProcess: PTYProcess | null = null;
	private currentProfile: ShellProfile | null = null;

	constructor(xtermManager: XtermManager) {
		super();
		this.ptyManager = new PTYManager();
		this.xtermManager = xtermManager;
	}

	/**
	 * Start a shell session with the specified profile
	 */
	start(profile: ShellProfile, cwd?: string): void {
		if (this.ptyProcess) {
			console.warn('Shell already running, killing existing process');
			this.stop();
		}

		this.currentProfile = profile;

		// Get terminal dimensions
		const { cols, rows } = this.xtermManager.getDimensions();

		// Spawn the PTY process
		try {
			this.ptyProcess = this.ptyManager.spawn({
				shell: profile.shell,
				args: profile.args,
				cwd,
				env: profile.env,
				cols,
				rows,
			});

			// Wire PTY data output to xterm
			this.ptyProcess.onData((data) => {
				this.xtermManager.write(data);
			});

			// Wire PTY exit event
			this.ptyProcess.onExit((code, signal) => {
				this.emit('exit', code, signal);
				this.ptyProcess = null;
			});

			// Wire xterm user input to PTY
			this.xtermManager.onData((data) => {
				if (this.ptyProcess) {
					this.ptyProcess.write(data);
				}
			});

			// Wire xterm resize to PTY
			this.xtermManager.onResize(({ cols, rows }) => {
				if (this.ptyProcess) {
					this.ptyProcess.resize(cols, rows);
				}
			});

			this.emit('start', this.ptyProcess.pid);
		} catch (error) {
			console.error('Failed to start shell:', error);
			this.emit('error', error);
			throw error;
		}
	}

	/**
	 * Stop the current shell session
	 */
	stop(signal?: string): void {
		if (this.ptyProcess) {
			this.ptyProcess.kill(signal);
			this.ptyProcess = null;
		}
	}

	/**
	 * Check if a shell is currently running
	 */
	isRunning(): boolean {
		return this.ptyProcess !== null;
	}

	/**
	 * Get the current process ID
	 */
	getPid(): number | null {
		return this.ptyProcess?.pid ?? null;
	}

	/**
	 * Resize the terminal
	 */
	resize(): void {
		this.xtermManager.fit();
	}

	/**
	 * Get the current shell profile
	 */
	getCurrentProfile(): ShellProfile | null {
		return this.currentProfile;
	}

	/**
	 * Create a default PowerShell profile
	 */
	static getDefaultPowerShellProfile(): ShellProfile {
		return {
			name: 'PowerShell Core',
			shell: 'pwsh',
			args: ['-NoLogo'],
		};
	}

	/**
	 * Create a Windows PowerShell profile (fallback)
	 */
	static getWindowsPowerShellProfile(): ShellProfile {
		return {
			name: 'Windows PowerShell',
			shell: 'powershell',
			args: ['-NoLogo'],
		};
	}

	/**
	 * Detect available shells on the system
	 */
	static async detectAvailableShells(): Promise<ShellProfile[]> {
		const profiles: ShellProfile[] = [];

		// Check for PowerShell Core (pwsh)
		if (await this.isCommandAvailable('pwsh')) {
			profiles.push(this.getDefaultPowerShellProfile());
		}

		// Check for Windows PowerShell (powershell)
		if (await this.isCommandAvailable('powershell')) {
			profiles.push(this.getWindowsPowerShellProfile());
		}

		return profiles;
	}

	/**
	 * Check if a command is available in PATH
	 */
	private static async isCommandAvailable(command: string): Promise<boolean> {
		try {
			const { exec } = require('child_process');
			const util = require('util');
			const execPromise = util.promisify(exec);

			const checkCommand = process.platform === 'win32'
				? `where ${command}`
				: `which ${command}`;

			await execPromise(checkCommand);
			return true;
		} catch {
			return false;
		}
	}
}
