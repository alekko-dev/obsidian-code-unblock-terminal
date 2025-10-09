import { EventEmitter } from 'events';
import { Notice } from 'obsidian';
import * as path from 'path';
import { ChildProcess, fork } from 'child_process';

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
 * IPC Message types for PTY host communication
 */
interface IPCMessage {
	type: string;
	id?: number;
	[key: string]: any;
}

/**
 * PTYManager provides a unified interface for spawning and managing shell processes
 * via a separate PTY host process. This architecture bypasses Electron's renderer
 * process security restrictions that prevent loading non-context-aware native modules.
 *
 * Architecture:
 * Plugin (Renderer) <-> IPC <-> PTY Host (Node.js) <-> node-pty <-> Shell Process
 *
 * Responsibilities:
 * - Manage PTY host process lifecycle (start, stop, restart)
 * - Spawn shell processes via IPC
 * - Stream data between PTY and consumers (xterm)
 * - Handle resize events
 * - Manage process lifecycle
 * - Auto-restart on crash
 */
export class PTYManager extends EventEmitter {
	private hostProcess: ChildProcess | null = null;
	private hostReady: boolean = false;
	private hostInitPromise: Promise<void> | null = null;
	private pluginDir: string | null = null;
	private nextPtyId: number = 1;
	private activePTYs: Map<number, {
		dataCallbacks: Array<(data: string) => void>;
		exitCallbacks: Array<(code: number, signal?: number) => void>;
		pid?: number;
	}> = new Map();
	private restartAttempts: number = 0;
	private readonly MAX_RESTART_ATTEMPTS = 3;
	private readonly RESTART_DELAY = 1000; // 1 second

	/**
	 * Initialize the PTY manager with the plugin directory path
	 * @param pluginDir - Absolute path to the plugin directory
	 */
	initialize(pluginDir: string): void {
		this.pluginDir = pluginDir;
		console.log('[PTYManager] Initialized with plugin directory:', pluginDir);
	}

	/**
	 * Start the PTY host process
	 * @returns Promise that resolves when host is ready
	 */
	private async startHost(): Promise<void> {
		if (this.hostProcess && this.hostReady) {
			return; // Already running
		}

		if (this.hostInitPromise) {
			return this.hostInitPromise; // Already starting
		}

		if (!this.pluginDir) {
			throw new Error('PTYManager not initialized. Call initialize() first.');
		}

		this.hostInitPromise = new Promise<void>((resolve, reject) => {
			// Try multiple paths for pty-host.js (production and development)
			const possiblePaths = [
				path.join(this.pluginDir!, 'pty-host.js'),           // Production (copied to plugin root)
				path.join(this.pluginDir!, 'src', 'terminal', 'pty-host.js')  // Development
			];

			const ptyHostPath = possiblePaths.find(p => {
				try {
					const fs = require('fs');
					return fs.existsSync(p);
				} catch {
					return false;
				}
			});

			if (!ptyHostPath) {
				const error = new Error(
					'PTY host script not found. Searched paths:\n' +
					possiblePaths.join('\n')
				);
				reject(error);
				return;
			}

			console.log('[PTYManager] Starting PTY host process:', ptyHostPath);

			try {
				// Fork the PTY host process with ELECTRON_RUN_AS_NODE to use Node.js runtime
				this.hostProcess = fork(ptyHostPath, [], {
					stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
					env: {
						...process.env,
						ELECTRON_RUN_AS_NODE: '1',
					},
				});

				// Handle host ready message
				const readyHandler = (message: IPCMessage) => {
					if (message.type === 'ready') {
						this.hostReady = true;
						console.log('[PTYManager] PTY host ready');
						// Remove this listener to prevent memory leak
						this.hostProcess!.off('message', readyHandler);
						resolve();
					}
				};

				this.hostProcess.on('message', readyHandler);

				// Setup message handlers
				this.hostProcess.on('message', this.handleHostMessage.bind(this));

				// Handle host exit
				this.hostProcess.on('exit', (code, signal) => {
					console.error('[PTYManager] PTY host exited', { code, signal });
					this.hostReady = false;
					this.hostProcess = null;
					this.hostInitPromise = null;

					// Emit event for all active PTYs
					this.emit('host-exit', code, signal);

					// Attempt restart if not intentional
					if (code !== 0 && this.restartAttempts < this.MAX_RESTART_ATTEMPTS) {
						this.attemptHostRestart();
					} else if (this.restartAttempts >= this.MAX_RESTART_ATTEMPTS) {
						new Notice(
							`Code Unblock Terminal: PTY host crashed ${this.MAX_RESTART_ATTEMPTS} times. ` +
							`Please restart Obsidian. Check the console for details.`,
							10000
						);
					}
				});

				// Handle host errors
				this.hostProcess.on('error', (error) => {
					console.error('[PTYManager] PTY host error:', error);
					this.emit('host-error', error);
					reject(error);
				});

				// Log host stderr for debugging
				this.hostProcess.stderr?.on('data', (data) => {
					console.log('[PTY Host stderr]', data.toString());
				});

				// Timeout if host doesn't respond
				setTimeout(() => {
					if (!this.hostReady) {
						reject(new Error('PTY host initialization timeout'));
					}
				}, 5000);

			} catch (error) {
				console.error('[PTYManager] Failed to start PTY host:', error);
				reject(error);
			}
		});

		return this.hostInitPromise;
	}

	/**
	 * Attempt to restart the PTY host after a crash
	 */
	private async attemptHostRestart(): Promise<void> {
		this.restartAttempts++;
		console.log(`[PTYManager] Attempting to restart PTY host (attempt ${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS})`);

		// Wait before restarting
		await new Promise(resolve => setTimeout(resolve, this.RESTART_DELAY));

		try {
			await this.startHost();
			this.restartAttempts = 0; // Reset counter on successful restart
			console.log('[PTYManager] PTY host restarted successfully');

			new Notice('Code Unblock Terminal: Reconnected successfully', 3000);
		} catch (error) {
			console.error('[PTYManager] Failed to restart PTY host:', error);
		}
	}

	/**
	 * Handle messages from PTY host process
	 */
	private handleHostMessage(message: IPCMessage): void {
		if (!message || !message.type) {
			console.error('[PTYManager] Received invalid message from host:', message);
			return;
		}

		const { type, id } = message;

		switch (type) {
			case 'ready':
				// Already handled in startHost()
				break;

			case 'spawned':
				if (typeof id === 'number') {
					const pty = this.activePTYs.get(id);
					if (pty) {
						pty.pid = message.pid;
						this.emit('spawn', id, message.pid);
					}
				}
				break;

			case 'data':
				if (typeof id === 'number') {
					const pty = this.activePTYs.get(id);
					if (pty) {
						pty.dataCallbacks.forEach(callback => callback(message.data));
					}
				}
				break;

			case 'exit':
				if (typeof id === 'number') {
					const pty = this.activePTYs.get(id);
					if (pty) {
						pty.exitCallbacks.forEach(callback =>
							callback(message.exitCode, message.signal)
						);
						this.activePTYs.delete(id);
						this.emit('exit', id, message.exitCode, message.signal);
					}
				}
				break;

			case 'error':
				console.error('[PTYManager] PTY host error:', message.error);
				if (typeof id === 'number') {
					this.emit('error', id, message.error);
				}
				break;

			case 'resized':
				if (typeof id === 'number') {
					this.emit('resize', id, message.cols, message.rows);
				}
				break;

			case 'killed':
				if (typeof id === 'number') {
					this.activePTYs.delete(id);
				}
				break;

			default:
				console.warn('[PTYManager] Unknown message type from host:', type);
		}
	}

	/**
	 * Send message to PTY host process
	 */
	private sendToHost(message: IPCMessage): void {
		if (!this.hostProcess || !this.hostReady) {
			throw new Error('PTY host not ready. Cannot send message.');
		}

		this.hostProcess.send(message);
	}

	/**
	 * Spawn a new shell process with PTY
	 * Automatically starts host process if not running
	 */
	async spawn(options: PTYOptions): Promise<PTYProcess> {
		// Ensure host is started
		await this.startHost();

		const { shell, args = [], cwd, env, cols = 80, rows = 30 } = options;

		// Generate unique PTY ID
		const id = this.nextPtyId++;

		// Create PTY tracking structure
		const ptyData = {
			dataCallbacks: [] as Array<(data: string) => void>,
			exitCallbacks: [] as Array<(code: number, signal?: number) => void>,
			pid: undefined as number | undefined,
		};

		this.activePTYs.set(id, ptyData);

		// Send spawn request to host
		this.sendToHost({
			type: 'spawn',
			id,
			shell,
			args,
			options: {
				cwd: cwd || process.cwd(),
				env: env ? { ...process.env, ...env } : process.env,
				cols,
				rows,
			},
		});

		// Create PTYProcess interface
		const processInterface: PTYProcess = {
			get pid() {
				return ptyData.pid || -1;
			},

			onData: (callback: (data: string) => void) => {
				ptyData.dataCallbacks.push(callback);
			},

			onExit: (callback: (code: number, signal?: number) => void) => {
				ptyData.exitCallbacks.push(callback);
			},

			write: (data: string) => {
				this.sendToHost({
					type: 'write',
					id,
					data,
				});
			},

			resize: (cols: number, rows: number) => {
				this.sendToHost({
					type: 'resize',
					id,
					cols,
					rows,
				});
			},

			kill: (signal?: string) => {
				this.sendToHost({
					type: 'kill',
					id,
					signal,
				});
			},
		};

		return processInterface;
	}

	/**
	 * Stop the PTY host process and all active PTYs
	 */
	async stopHost(): Promise<void> {
		if (this.hostProcess) {
			console.log('[PTYManager] Stopping PTY host process');

			this.hostProcess.kill();
			this.hostProcess = null;
			this.hostReady = false;
			this.hostInitPromise = null;
			this.activePTYs.clear();
		}
	}

	/**
	 * Check if PTY host is running
	 */
	isHostRunning(): boolean {
		return this.hostReady && this.hostProcess !== null;
	}

	/**
	 * Get count of active PTY processes
	 */
	getActivePTYCount(): number {
		return this.activePTYs.size;
	}
}
