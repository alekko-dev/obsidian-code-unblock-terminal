import { EventEmitter } from 'events';

// Try to import node-pty with error handling
let pty: typeof import('node-pty') | null = null;
try {
	pty = require('node-pty');
} catch (error) {
	console.error('Failed to load node-pty module:', error);
	console.error('This is likely due to a missing or incompatible native build.');
	console.error('Please ensure node-pty is properly installed and compiled for your platform.');
}

export interface PTYOptions {
	shell: string;
	args?: string[];
	cwd?: string;
	env?: { [key: string]: string };
	cols?: number;
	rows?: number;
}

export interface PTYProcess {
	pid: number;
	onData: (callback: (data: string) => void) => void;
	onExit: (callback: (code: number, signal?: number) => void) => void;
	write: (data: string) => void;
	resize: (cols: number, rows: number) => void;
	kill: (signal?: string) => void;
}

/**
 * PTYManager provides a unified interface for spawning and managing shell processes
 * via node-pty (ConPTY on Windows, forkpty on Unix).
 *
 * Responsibilities:
 * - Spawn shell processes with proper PTY bindings
 * - Stream data between PTY and consumers (xterm)
 * - Handle resize events
 * - Manage process lifecycle
 */
export class PTYManager extends EventEmitter {
	private ptyProcess: import('node-pty').IPty | null = null;

	/**
	 * Spawn a new shell process with PTY
	 */
	spawn(options: PTYOptions): PTYProcess {
		if (!pty) {
			throw new Error(
				'node-pty module is not available. The terminal cannot function without it. ' +
				'Please check the console for details about the import failure.'
			);
		}

		const { shell, args = [], cwd, env, cols = 80, rows = 30 } = options;

		// Merge environment variables
		const processEnv = { ...process.env, ...env };

		// Spawn the PTY process
		this.ptyProcess = pty.spawn(shell, args, {
			name: 'xterm-256color',
			cols,
			rows,
			cwd: cwd || process.cwd(),
			env: processEnv,
			// Use ConPTY on Windows for better compatibility
			useConpty: process.platform === 'win32',
		});

		const ptyProcess = this.ptyProcess;
		const pid = ptyProcess.pid;

		// Create the PTYProcess interface
		const processInterface: PTYProcess = {
			pid,

			onData: (callback: (data: string) => void) => {
				ptyProcess.onData((data) => {
					callback(data);
				});
			},

			onExit: (callback: (code: number, signal?: number) => void) => {
				ptyProcess.onExit(({ exitCode, signal }) => {
					this.emit('exit', exitCode, signal);
					callback(exitCode, signal);
				});
			},

			write: (data: string) => {
				ptyProcess.write(data);
			},

			resize: (cols: number, rows: number) => {
				try {
					ptyProcess.resize(cols, rows);
					this.emit('resize', cols, rows, pid);
				} catch (error) {
					console.error('Failed to resize PTY:', error);
				}
			},

			kill: (signal?: string) => {
				try {
					ptyProcess.kill(signal);
				} catch (error) {
					console.error('Failed to kill PTY process:', error);
				}
			},
		};

		this.emit('spawn', pid);
		return processInterface;
	}

	/**
	 * Kill the current PTY process
	 */
	kill(signal?: string): void {
		if (this.ptyProcess) {
			try {
				this.ptyProcess.kill(signal);
				this.ptyProcess = null;
			} catch (error) {
				console.error('Failed to kill PTY:', error);
			}
		}
	}

	/**
	 * Check if a PTY process is currently running
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
}
