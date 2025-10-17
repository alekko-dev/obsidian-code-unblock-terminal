import { EventEmitter } from 'events';
import { Notice } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, spawn, execSync } from 'child_process';

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

type HostErrorPayload = {
  message: string;
  stack?: string;
  code?: string;
};

type HostEvent =
  | { type: 'ready'; message?: string }
  | { type: 'spawned'; id: number; pid: number }
  | { type: 'data'; id: number; data: string }
  | { type: 'exit'; id: number; exitCode: number; signal?: number }
  | { type: 'error'; id?: number; error: HostErrorPayload }
  | { type: 'resized'; id: number; cols: number; rows: number }
  | { type: 'killed'; id: number };

type EnvironmentVariables = Record<string, string | undefined>;

type HostRequest =
  | {
      type: 'spawn';
      id: number;
      shell: string;
      args: string[];
      options: {
        cwd: string;
        env: EnvironmentVariables;
        cols: number;
        rows: number;
      };
    }
  | { type: 'write'; id: number; data: string }
  | { type: 'resize'; id: number; cols: number; rows: number }
  | { type: 'kill'; id: number; signal?: string };

type SpawnRequest = Extract<HostRequest, { type: 'spawn' }>;

const isHostEvent = (message: unknown): message is HostEvent => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const { type } = message as { type?: unknown };

  if (typeof type !== 'string') {
    return false;
  }

  switch (type) {
    case 'ready':
      return true;
    case 'spawned': {
      const { id, pid } = message as { id?: unknown; pid?: unknown };
      return typeof id === 'number' && typeof pid === 'number';
    }
    case 'data': {
      const { id, data } = message as { id?: unknown; data?: unknown };
      return typeof id === 'number' && typeof data === 'string';
    }
    case 'exit': {
      const { id, exitCode, signal } = message as {
        id?: unknown;
        exitCode?: unknown;
        signal?: unknown;
      };
      return (
        typeof id === 'number' &&
        typeof exitCode === 'number' &&
        (typeof signal === 'number' || typeof signal === 'undefined')
      );
    }
    case 'error': {
      const { error } = message as { error?: unknown };
      return (
        !!error &&
        typeof error === 'object' &&
        typeof (error as { message?: unknown }).message === 'string'
      );
    }
    case 'resized': {
      const { id, cols, rows } = message as {
        id?: unknown;
        cols?: unknown;
        rows?: unknown;
      };
      return (
        typeof id === 'number' &&
        typeof cols === 'number' &&
        typeof rows === 'number'
      );
    }
    case 'killed': {
      const { id } = message as { id?: unknown };
      return typeof id === 'number';
    }
    default:
      return false;
  }
};

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

                        const ptyHostPath = possiblePaths.find((candidatePath) => fs.existsSync(candidatePath));

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
				// CRITICAL: ELECTRON_RUN_AS_NODE doesn't work when spawned from renderer process
				// This is a known Electron limitation - the environment variable is ignored
				// and Electron launches a new app window instead of running as Node.js.
				//
				// SOLUTION: Use system Node.js installation to run the PTY host process.
				// This bypasses Electron entirely and allows node-pty to load correctly.

                                let nodeExecutable: string;

                                try {
                                        // Find system Node.js executable (platform-specific command)
					const isWindows = process.platform === 'win32';
					const command = isWindows ? 'where node' : 'which node';
					const nodePath = execSync(command, { encoding: 'utf8' }).trim().split('\n')[0];
					console.log('[PTYManager] Using system Node.js:', nodePath);
					nodeExecutable = nodePath;
				} catch (error) {
					// Fallback to process.execPath (Electron's Node.js)
					// This may not work for loading node-pty, but it's better than failing completely
					console.warn('[PTYManager] Node.js not found in PATH, falling back to process.execPath');
					nodeExecutable = process.execPath;
					console.log('[PTYManager] Using fallback Node.js:', nodeExecutable);
				}

				this.hostProcess = spawn(nodeExecutable, [ptyHostPath], {
					stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
					env: process.env,
					detached: false,
					windowsHide: true,
				});

                                const handleRawMessage = (rawMessage: unknown) => {
                                        if (!isHostEvent(rawMessage)) {
                                                console.error('[PTYManager] Received invalid message from host:', rawMessage);
                                                return;
                                        }

                                        if (!this.hostReady) {
                                                if (rawMessage.type === 'ready') {
                                                        this.hostReady = true;
                                                        console.log('[PTYManager] PTY host ready');
                                                        resolve();
                                                } else if (rawMessage.type === 'error') {
                                                        const errorMessage = rawMessage.error.message || 'Unknown PTY host error';
                                                        const hostError = new Error(errorMessage);
                                                        this.emit('host-error', hostError);
                                                        reject(hostError);
                                                        return;
                                                }
                                        }

                                        this.handleHostMessage(rawMessage);
                                };

                                // Setup message handler
                                this.hostProcess.on('message', handleRawMessage);

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

				// Log host stdout for debugging
				this.hostProcess.stdout?.on('data', (data) => {
					console.log('[PTY Host stdout]', data.toString());
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
        private handleHostMessage(message: HostEvent): void {
                switch (message.type) {
                        case 'ready':
                                // Already handled in startHost()
                                break;

                        case 'spawned': {
                                const pty = this.activePTYs.get(message.id);
                                if (pty) {
                                        pty.pid = message.pid;
                                        this.emit('spawn', message.id, message.pid);
                                }
                                break;
                        }

                        case 'data': {
                                const pty = this.activePTYs.get(message.id);
                                if (pty) {
                                        pty.dataCallbacks.forEach(callback => callback(message.data));
                                }
                                break;
                        }

                        case 'exit': {
                                const pty = this.activePTYs.get(message.id);
                                if (pty) {
                                        pty.exitCallbacks.forEach(callback =>
                                                callback(message.exitCode, message.signal)
                                        );
                                        this.activePTYs.delete(message.id);
                                        this.emit('exit', message.id, message.exitCode, message.signal);
                                }
                                break;
                        }

                        case 'error': {
                                console.error('[PTYManager] PTY host error:', message.error);
                                if (typeof message.id === 'number') {
                                        this.emit('error', message.id, message.error);
                                }
                                break;
                        }

                        case 'resized':
                                this.emit('resize', message.id, message.cols, message.rows);
                                break;

                        case 'killed':
                                this.activePTYs.delete(message.id);
                                break;

                        default:
                                console.warn('[PTYManager] Unknown message type from host:', message);
                }
	}

	/**
	 * Send message to PTY host process
	 */
        private sendToHost(message: HostRequest): void {
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
                const spawnOptions: SpawnRequest['options'] = {
                        cwd: cwd ?? process.cwd(),
                        env: { ...process.env, ...(env ?? {}) },
                        cols,
                        rows,
                };

                this.sendToHost({
                        type: 'spawn',
                        id,
                        shell,
                        args,
                        options: spawnOptions,
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
