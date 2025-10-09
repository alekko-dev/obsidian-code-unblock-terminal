/**
 * PTY Host Process
 *
 * Standalone Node.js process that loads node-pty native addon and communicates
 * with the plugin renderer process via IPC. This architecture bypasses Electron's
 * renderer process security restrictions that prevent loading non-context-aware
 * native modules.
 *
 * Architecture: Plugin (Renderer) <-> IPC <-> PTY Host (Node.js) <-> node-pty <-> Shell
 *
 * IPC Protocol:
 * - spawn: Create new PTY process
 * - write: Write data to PTY stdin
 * - resize: Resize PTY dimensions
 * - kill: Terminate PTY process
 *
 * Events sent to parent:
 * - ready: Host initialized successfully
 * - data: PTY stdout/stderr data
 * - exit: PTY process exited
 * - error: Error occurred
 */

const path = require('path');
const fs = require('fs');

// Track active PTY processes by ID
const ptyProcesses = new Map();

// node-pty module (loaded after initialization)
let pty = null;

// Debug logging helper (logs to both file and stderr for troubleshooting)
const DEBUG = false; // Set to true for detailed logging
const logFile = path.join(require('os').tmpdir(), 'pty-host-debug.log');

function debugLog(message) {
	if (!DEBUG) {
		console.error(message); // Always log to stderr (captured by parent)
		return;
	}

	// Full debug mode: log to file with timestamp
	const timestamp = new Date().toISOString();
	const logMessage = `[${timestamp}] ${message}\n`;
	try {
		fs.appendFileSync(logFile, logMessage, 'utf8');
	} catch (error) {
		// Ignore file write errors
	}
	console.error(message);
}

/**
 * Safely send a message to the parent process.
 * Prevents crashes if parent is disconnected or send fails.
 *
 * @param {object} message - The IPC message to send
 * @returns {boolean} - True if message was sent successfully
 */
function safeSend(message) {
	if (!process.send || !process.connected) {
		debugLog('[PTY Host] Cannot send message: parent process disconnected');
		return false;
	}

	try {
		debugLog('[PTY Host] Sending IPC message: ' + message.type);
		return process.send(message);
	} catch (error) {
		debugLog('[PTY Host] Failed to send message: ' + error);
		return false;
	}
}

/**
 * Initialize the PTY module
 */
function initializePTY() {
	try {
		// Determine plugin directory based on script location
		// In production: pty-host.js is in plugin root
		// In development: pty-host.js is in src/terminal/
		const scriptDir = __dirname;
		let pluginDir;

		// Check if we're in plugin root by looking for manifest.json
		if (fs.existsSync(path.join(scriptDir, 'manifest.json'))) {
			pluginDir = scriptDir;  // Production
		} else {
			pluginDir = path.resolve(scriptDir, '..', '..');  // Development
		}

		// Try official node-pty first (preferred for production)
		let nodePtyPath = path.join(pluginDir, 'node_modules', 'node-pty');
		let ptyPackage = 'node-pty';

		// Check if node-pty binary exists, fallback to prebuilt version for development
		const nodePtyBuildPath = path.join(nodePtyPath, 'build', 'Release', 'pty.node');
		if (!fs.existsSync(nodePtyBuildPath)) {
			nodePtyPath = path.join(pluginDir, 'node_modules', '@homebridge', 'node-pty-prebuilt-multiarch');
			ptyPackage = '@homebridge/node-pty-prebuilt-multiarch';
		}

		// Verify the path exists before requiring
		if (!fs.existsSync(nodePtyPath)) {
			throw new Error(`node-pty module not found at ${nodePtyPath}. Please ensure dependencies are installed.`);
		}

		// Load and validate node-pty
		pty = require(nodePtyPath);
		if (!pty || typeof pty.spawn !== 'function') {
			throw new Error(`Failed to load node-pty from ${nodePtyPath}: spawn function not available`);
		}

		// Send ready signal to parent (using nextTick to avoid race condition)
		process.nextTick(() => {
			safeSend({
				type: 'ready',
				message: `PTY host initialized successfully (using ${ptyPackage})`
			});
		});
	} catch (error) {
		console.error('[PTY Host] CRITICAL ERROR during initialization:', error);

		// Send error to parent
		process.nextTick(() => {
			safeSend({
				type: 'error',
				error: {
					message: error.message,
					stack: error.stack,
					code: 'PTY_INIT_FAILED'
				}
			});
		});

		// Delay exit to allow error message to be sent
		setTimeout(() => process.exit(1), 100);
	}
}

/**
 * Resolve shell command to full path
 * node-pty on Windows requires full executable path, not just command name
 */
function resolveShellPath(shell) {
	const { execSync } = require('child_process');

	// If already an absolute path, return as-is
	if (path.isAbsolute(shell)) {
		return shell;
	}

	// Resolve command name to full path
	try {
		const cmd = process.platform === 'win32' ? `where ${shell}` : `which ${shell}`;
		const fullPath = execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0];
		debugLog(`[PTY Host] Resolved "${shell}" to "${fullPath}"`);
		return fullPath;
	} catch (error) {
		throw new Error(`Shell not found: ${shell}. Make sure it is installed and in PATH.`);
	}
}

/**
 * Handle spawn request from parent
 */
function handleSpawn(message) {
	const { id, shell, args = [], options = {} } = message;

	try {
		if (!pty) {
			throw new Error('PTY module not initialized');
		}

		// Resolve shell to full path (required by node-pty on Windows)
		const shellPath = resolveShellPath(shell);

		// Extract options with defaults
		const {
			cwd = process.cwd(),
			env = process.env,
			cols = 80,
			rows = 30
		} = options;

		// Spawn PTY process
		const ptyProcess = pty.spawn(shellPath, args, {
			name: 'xterm-256color',
			cols,
			rows,
			cwd,
			env: { ...process.env, ...env },
			useConpty: process.platform === 'win32',
		});

		// Store process reference
		ptyProcesses.set(id, ptyProcess);

		// Setup event handlers
		ptyProcess.onData((data) => {
			safeSend({
				type: 'data',
				id,
				data
			});
		});

		ptyProcess.onExit(({ exitCode, signal }) => {
			safeSend({
				type: 'exit',
				id,
				exitCode,
				signal
			});

			// Clean up process reference
			ptyProcesses.delete(id);
		});

		// Send success response
		safeSend({
			type: 'spawned',
			id,
			pid: ptyProcess.pid
		});
	} catch (error) {
		safeSend({
			type: 'error',
			id,
			error: {
				message: error.message,
				stack: error.stack,
				code: 'PTY_SPAWN_FAILED'
			}
		});

		console.error(`[PTY Host] Failed to spawn process ${id}:`, error);
	}
}

/**
 * Handle write request from parent
 */
function handleWrite(message) {
	const { id, data } = message;

	try {
		const ptyProcess = ptyProcesses.get(id);

		if (!ptyProcess) {
			throw new Error(`PTY process ${id} not found`);
		}

		ptyProcess.write(data);
	} catch (error) {
		safeSend({
			type: 'error',
			id,
			error: {
				message: error.message,
				stack: error.stack,
				code: 'PTY_WRITE_FAILED'
			}
		});

		console.error(`[PTY Host] Failed to write to process ${id}:`, error);
	}
}

/**
 * Handle resize request from parent
 */
function handleResize(message) {
	const { id, cols, rows } = message;

	try {
		const ptyProcess = ptyProcesses.get(id);

		if (!ptyProcess) {
			throw new Error(`PTY process ${id} not found`);
		}

		ptyProcess.resize(cols, rows);

		// Send acknowledgment
		safeSend({
			type: 'resized',
			id,
			cols,
			rows
		});
	} catch (error) {
		safeSend({
			type: 'error',
			id,
			error: {
				message: error.message,
				stack: error.stack,
				code: 'PTY_RESIZE_FAILED'
			}
		});

		console.error(`[PTY Host] Failed to resize process ${id}:`, error);
	}
}

/**
 * Handle kill request from parent
 */
function handleKill(message) {
	const { id, signal } = message;

	try {
		const ptyProcess = ptyProcesses.get(id);

		if (!ptyProcess) {
			throw new Error(`PTY process ${id} not found`);
		}

		ptyProcess.kill(signal);
		ptyProcesses.delete(id);

		// Send acknowledgment
		safeSend({
			type: 'killed',
			id
		});

		console.error(`[PTY Host] Killed process ${id}`);
	} catch (error) {
		safeSend({
			type: 'error',
			id,
			error: {
				message: error.message,
				stack: error.stack,
				code: 'PTY_KILL_FAILED'
			}
		});

		console.error(`[PTY Host] Failed to kill process ${id}:`, error);
	}
}

/**
 * Main message handler
 */
function handleMessage(message) {
	if (!message || !message.type) {
		console.error('[PTY Host] Received invalid message:', message);
		return;
	}

	switch (message.type) {
		case 'spawn':
			handleSpawn(message);
			break;
		case 'write':
			handleWrite(message);
			break;
		case 'resize':
			handleResize(message);
			break;
		case 'kill':
			handleKill(message);
			break;
		default:
			console.error('[PTY Host] Unknown message type:', message.type);
	}
}

/**
 * Handle process termination
 */
function handleShutdown(reason) {
	debugLog('[PTY Host] Shutting down, reason: ' + reason);
	debugLog('[PTY Host] Killing all PTY processes...');

	// Kill all active PTY processes
	for (const [id, ptyProcess] of ptyProcesses.entries()) {
		try {
			ptyProcess.kill();
			debugLog(`[PTY Host] Killed process ${id}`);
		} catch (error) {
			debugLog(`[PTY Host] Failed to kill process ${id}: ${error}`);
		}
	}

	ptyProcesses.clear();

	// Only exit if we have active PTYs or this is an intentional shutdown
	// Don't exit on early disconnect during initialization
	if (reason !== 'disconnect' || ptyProcesses.size > 0) {
		debugLog('[PTY Host] Exiting process');
		process.exit(0);
	} else {
		debugLog('[PTY Host] Ignoring early disconnect during initialization');
	}
}

// Setup IPC message handler
process.on('message', handleMessage);

// Handle graceful shutdown
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('disconnect', () => {
	debugLog('[PTY Host] Disconnect event fired, process.connected: ' + process.connected);
	handleShutdown('disconnect');
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
	debugLog('[PTY Host] Uncaught exception: ' + error);
	debugLog('[PTY Host] Stack: ' + error.stack);

	safeSend({
		type: 'error',
		error: {
			message: error.message,
			stack: error.stack,
			code: 'UNCAUGHT_EXCEPTION'
		}
	});

	// Give time for message to be sent
	setTimeout(() => {
		debugLog('[PTY Host] Exiting due to uncaught exception');
		process.exit(1);
	}, 100);
});

process.on('unhandledRejection', (reason, promise) => {
	debugLog('[PTY Host] Unhandled rejection: ' + reason);

	safeSend({
		type: 'error',
		error: {
			message: String(reason),
			code: 'UNHANDLED_REJECTION'
		}
	});
});

// Initialize PTY module
debugLog('[PTY Host] Starting initialization...');
initializePTY();
