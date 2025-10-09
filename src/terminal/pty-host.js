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

// Track active PTY processes by ID
const ptyProcesses = new Map();
let nextPtyId = 1;

// node-pty module (loaded after initialization)
let pty = null;

/**
 * Initialize the PTY module
 */
function initializePTY() {
	try {
		// When running as forked process, __dirname is the script location
		// We need to resolve node-pty from the plugin's node_modules
		const scriptDir = __dirname;
		const pluginDir = path.resolve(scriptDir, '..', '..');

		// Try official node-pty first (preferred for production)
		let nodePtyPath = path.join(pluginDir, 'node_modules', 'node-pty');
		let ptyPackage = 'node-pty';

		// Check if node-pty binary exists
		const fs = require('fs');
		const nodePtyBuildPath = path.join(nodePtyPath, 'build', 'Release', 'pty.node');

		if (!fs.existsSync(nodePtyBuildPath)) {
			// Fallback to @homebridge/node-pty-prebuilt-multiarch for development
			console.error('[PTY Host] node-pty binary not found, trying @homebridge/node-pty-prebuilt-multiarch');
			nodePtyPath = path.join(pluginDir, 'node_modules', '@homebridge', 'node-pty-prebuilt-multiarch');
			ptyPackage = '@homebridge/node-pty-prebuilt-multiarch';
		}

		// Load node-pty from plugin directory
		pty = require(nodePtyPath);

		// Send ready signal to parent
		process.send({
			type: 'ready',
			message: `PTY host initialized successfully (using ${ptyPackage})`
		});

		console.error(`[PTY Host] Initialized successfully (using ${ptyPackage})`);
	} catch (error) {
		// Send error to parent
		process.send({
			type: 'error',
			error: {
				message: error.message,
				stack: error.stack,
				code: 'PTY_INIT_FAILED'
			}
		});

		console.error('[PTY Host] Failed to initialize:', error);
		process.exit(1);
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

		// Extract options with defaults
		const {
			cwd = process.cwd(),
			env = process.env,
			cols = 80,
			rows = 30
		} = options;

		// Spawn PTY process
		const ptyProcess = pty.spawn(shell, args, {
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
			process.send({
				type: 'data',
				id,
				data
			});
		});

		ptyProcess.onExit(({ exitCode, signal }) => {
			process.send({
				type: 'exit',
				id,
				exitCode,
				signal
			});

			// Clean up process reference
			ptyProcesses.delete(id);
		});

		// Send success response
		process.send({
			type: 'spawned',
			id,
			pid: ptyProcess.pid
		});

		console.error(`[PTY Host] Spawned process ${id} (PID: ${ptyProcess.pid})`);
	} catch (error) {
		process.send({
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
		process.send({
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
		process.send({
			type: 'resized',
			id,
			cols,
			rows
		});
	} catch (error) {
		process.send({
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
		process.send({
			type: 'killed',
			id
		});

		console.error(`[PTY Host] Killed process ${id}`);
	} catch (error) {
		process.send({
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
function handleShutdown() {
	console.error('[PTY Host] Shutting down, killing all PTY processes...');

	// Kill all active PTY processes
	for (const [id, ptyProcess] of ptyProcesses.entries()) {
		try {
			ptyProcess.kill();
			console.error(`[PTY Host] Killed process ${id}`);
		} catch (error) {
			console.error(`[PTY Host] Failed to kill process ${id}:`, error);
		}
	}

	ptyProcesses.clear();
	process.exit(0);
}

// Setup IPC message handler
process.on('message', handleMessage);

// Handle graceful shutdown
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
process.on('disconnect', handleShutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
	console.error('[PTY Host] Uncaught exception:', error);

	process.send({
		type: 'error',
		error: {
			message: error.message,
			stack: error.stack,
			code: 'UNCAUGHT_EXCEPTION'
		}
	});

	// Give time for message to be sent
	setTimeout(() => {
		process.exit(1);
	}, 100);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('[PTY Host] Unhandled rejection:', reason);

	process.send({
		type: 'error',
		error: {
			message: String(reason),
			code: 'UNHANDLED_REJECTION'
		}
	});
});

// Initialize PTY module
console.error('[PTY Host] Starting initialization...');
initializePTY();
