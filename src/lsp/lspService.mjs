import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { log, BASE_DIR } from '../config.mjs';
import { getAbsolutePath } from '../utils/fileUtils.mjs';

const lspServers = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    supportedLanguageIds: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
  }
};

class LspProcess {
  constructor(lspConfig) {
    this.config = lspConfig;
    this.process = null;
    this.messageBuffer = '';
    this.pendingRequests = new Map(); // id -> { resolve, reject, timeout }
    this.requestIdCounter = 1;
    this.diagnostics = new Map(); // filePath -> diagnostics[]
    this.openDocuments = new Map(); // filePath -> version
    this.isInitialized = false;
    this.initializationPromise = null;
    this._start();
  }

  _start() {
    log(`LSP Service: Starting ${this.config.command}`);
    this.process = spawn(this.config.command, this.config.args, {
      shell: false, // Important for security and direct stdio
      cwd: BASE_DIR, // LSPs should operate within the project root
    });

    this.process.stdout.on('data', (data) => this._handleData(data));
    this.process.stderr.on('data', (data) => log(`LSP ${this.config.command} STDERR: ${data.toString()}`));
    this.process.on('exit', (code, signal) => {
      log(`LSP ${this.config.command} exited with code ${code}, signal ${signal}`);
      this.isInitialized = false;
      this.process = null;
      // Potentially implement retry logic or notify clients
    });
    this.process.on('error', (err) => {
      log(`LSP ${this.config.command} error: ${err.message}`);
      this.isInitialized = false;
      this.process = null;
    });

    this.initializationPromise = this._initialize();
  }

  async _initialize() {
    if (!this.process) throw new Error('LSP process not running.');
    const params = {
      processId: process.pid,
      rootUri: `file://${BASE_DIR}`, // LSP expects URI format
      capabilities: {
        textDocument: {
          synchronization: {
            willSave: true,
            didSave: true,
            willSaveWaitUntil: true,
          },
          completion: {
            completionItem: {
              snippetSupport: true,
            },
          },
          // Add other capabilities your LLM tools might need
        },
      },
      workspace: {
        didChangeConfiguration: {
            dynamicRegistration: true
        }
      }
    };
    try {
      const result = await this.sendRequest('initialize', params, 15000); // 15s timeout
      log(`LSP ${this.config.command} initialized. Capabilities:`, Object.keys(result.capabilities));
      this.sendNotification('initialized', {});
      this.isInitialized = true;
      return true;
    } catch (error) {
      log(`LSP ${this.config.command} initialization failed: ${error.message}`);
      this.isInitialized = false;
      throw error;
    }
  }

  _handleData(data) {
    this.messageBuffer += data.toString();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const match = this.messageBuffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!match) break;

      const contentLength = parseInt(match[1], 10);
      const messageStartIndex = match[0].length;
      const messageEndIndex = messageStartIndex + contentLength;

      if (this.messageBuffer.length < messageEndIndex) break;

      const messageJson = this.messageBuffer.substring(messageStartIndex, messageEndIndex);
      this.messageBuffer = this.messageBuffer.substring(messageEndIndex);

      try {
        const message = JSON.parse(messageJson);
        this._handleMessage(message);
      } catch (error) {
        log(`LSP ${this.config.command} Error parsing message: ${error.message}. JSON: ${messageJson}`);
      }
    }
  }

  _handleMessage(message) {
    // log(`LSP ${this.config.command} RECV:`, JSON.stringify(message).substring(0, 200));
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timeout } = this.pendingRequests.get(message.id);
      clearTimeout(timeout);
      if (message.error) {
        reject(new Error(`LSP Error: ${message.error.message} (Code: ${message.error.code})`));
      } else {
        resolve(message.result);
      }
      this.pendingRequests.delete(message.id);
    } else if (message.method === 'textDocument/publishDiagnostics') {
      const filePath = this._uriToPath(message.params.uri);
      this.diagnostics.set(filePath, message.params.diagnostics);
      log(`LSP ${this.config.command} Diagnostics for ${path.relative(BASE_DIR, filePath)}: ${message.params.diagnostics.length} issues.`);
    } else if (message.method === 'window/showMessage') {
        log(`LSP ${this.config.command} ShowMessage: [${message.params.type}] ${message.params.message}`);
    } else if (message.method === 'window/logMessage') {
        log(`LSP ${this.config.command} LogMessage: [${message.params.type}] ${message.params.message}`);
    } else if (message.method) {
        log(`LSP ${this.config.command} Unhandled Notification: ${message.method}`);
    } else {
        log(`LSP ${this.config.command} Unhandled Message:`, message)
    }
  }

  _pathToUri(filePath) {
    // Ensure it's an absolute path before converting.
    // LSP expects URI with file:/// scheme
    const absPath = path.isAbsolute(filePath) ? filePath : getAbsolutePath(filePath);
    return `file://${absPath.replace(/\\/g, '/')}`;
  }

  _uriToPath(uri) {
    if (!uri.startsWith('file:///')) return uri; // Or throw error
    const decodedUri = decodeURIComponent(uri);
    const fsPath = decodedUri.substring('file:///'.length);
    // Handle Windows paths that might start with /C:
    if (process.platform === 'win32' && fsPath.match(/^\/[A-Za-z]:/)) {
      return fsPath.substring(1);
    }
    return fsPath;
  }

  sendRequest(method, params, timeoutMs = 5000) {
    if (!this.process || !this.isInitialized && method !== 'initialize') {
        return Promise.reject(new Error(`LSP ${this.config.command} not ready or process not running for method ${method}.`));
    }
    const id = this.requestIdCounter++;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    const messageStr = JSON.stringify(message);
    const framedMessage = `Content-Length: ${Buffer.byteLength(messageStr, 'utf-8')}\r\n\r\n${messageStr}`;

    // log(`LSP ${this.config.command} SEND: ${method} (id: ${id})`);
    this.process.stdin.write(framedMessage);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP ${this.config.command} Request ${method} (id: ${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingRequests.set(id, { resolve, reject, timeout });
    });
  }

  sendNotification(method, params) {
    if (!this.process || !this.isInitialized && method !== 'initialized') {
        log(`LSP ${this.config.command} not ready for notification ${method}.`);
        return;
    }
    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };
    const messageStr = JSON.stringify(message);
    const framedMessage = `Content-Length: ${Buffer.byteLength(messageStr, 'utf-8')}\r\n\r\n${messageStr}`;
    // log(`LSP ${this.config.command} NOTIFY: ${method}`);
    this.process.stdin.write(framedMessage);
  }

  async ensureDocumentOpen(relativeFilePath) {
    if (!this.isInitialized) await this.initializationPromise;
    if (!this.isInitialized) throw new Error(`LSP ${this.config.command} could not be initialized.`);

    const absolutePath = getAbsolutePath(relativeFilePath);
    const languageId = this.config.supportedLanguageIds.find(id => {
        if (id === 'vue' && absolutePath.endsWith('.vue')) return true;
        if ((id === 'javascript' || id === 'typescript') && (absolutePath.endsWith('.js') || absolutePath.endsWith('.ts'))) return true;
        if ((id === 'javascriptreact' || id === 'typescriptreact') && (absolutePath.endsWith('.jsx') || absolutePath.endsWith('.tsx'))) return true;
        return false;
    }) || (absolutePath.endsWith('.vue') ? 'vue' : 'typescript'); // Default guess

    if (!this.openDocuments.has(absolutePath)) {
      const content = await fs.readFile(absolutePath, 'utf-8');
      const version = 1;
      this.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: this._pathToUri(absolutePath),
          languageId: languageId,
          version,
          text: content,
        },
      });
      this.openDocuments.set(absolutePath, version);
      log(`LSP ${this.config.command} Opened document: ${relativeFilePath}`);
    }
    return absolutePath; // Return absolute path for consistency
  }

  getDiagnosticsForFile(absoluteFilePath) {
    return this.diagnostics.get(absoluteFilePath) || [];
  }

  async close() {
    if (this.process) {
      log(`LSP Service: Shutting down ${this.config.command}`);
      try {
        if (this.isInitialized) {
          await this.sendRequest('shutdown', null, 2000);
        }
      } catch (error) {
        log(`LSP ${this.config.command} shutdown error: ${error.message}`);
      } finally {
        this.sendNotification('exit', null);
        this.process.kill('SIGTERM'); // or SIGINT
        log(`LSP ${this.config.command} process killed.`);
        this.isInitialized = false;
        this.process = null;
      }
    }
  }
}

class LspService {
  constructor() {
    this.lspInstances = new Map(); // languageId (e.g., 'typescript', 'vue') -> LspProcess instance
    this._initializeInstances();
  }

  _initializeInstances() {
    for (const key in lspServers) {
      const config = lspServers[key];
      const instance = new LspProcess(config);
      // Store by a primary languageId or the key itself
      this.lspInstances.set(key, instance);
    }
  }

  _getLspInstanceForFile(filePath) {
    const ext = path.extname(filePath);
    if (ext === '.vue') return this.lspInstances.get('vue');
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return this.lspInstances.get('typescript');
    log(`LSP Service: No specific LSP found for extension ${ext}, defaulting to typescript.`);
    return this.lspInstances.get('typescript'); // Default or throw error
  }

  async getDiagnostics(relativeFilePath) {
    const lsp = this._getLspInstanceForFile(relativeFilePath);
    if (!lsp) throw new Error(`No LSP configured for file type of ${relativeFilePath}`);
    const absolutePath = await lsp.ensureDocumentOpen(relativeFilePath);
    // Diagnostics are pushed, so we wait a very short moment for them to arrive after opening.
    // A better way might be to return a promise that resolves when diagnostics for this version are published.
    // For now, a small delay after ensuring open.
    await new Promise(resolve => setTimeout(resolve, 200)); // Allow time for publishDiagnostics
    return lsp.getDiagnosticsForFile(absolutePath);
  }

  async getCompletions(relativeFilePath, line, character) { // 0-indexed
    const lsp = this._getLspInstanceForFile(relativeFilePath);
    if (!lsp) throw new Error(`No LSP configured for file type of ${relativeFilePath}`);
    const absolutePath = await lsp.ensureDocumentOpen(relativeFilePath);
    return lsp.sendRequest('textDocument/completion', {
      textDocument: { uri: lsp._pathToUri(absolutePath) },
      position: { line, character },
    });
  }

  async findDefinition(relativeFilePath, line, character) { // 0-indexed
    const lsp = this._getLspInstanceForFile(relativeFilePath);
    if (!lsp) throw new Error(`No LSP configured for file type of ${relativeFilePath}`);
    const absolutePath = await lsp.ensureDocumentOpen(relativeFilePath);
    return lsp.sendRequest('textDocument/definition', {
      textDocument: { uri: lsp._pathToUri(absolutePath) },
      position: { line, character },
    });
  }

  async formatDocument(relativeFilePath) {
    const lsp = this._getLspInstanceForFile(relativeFilePath);
    if (!lsp) throw new Error(`No LSP configured for file type of ${relativeFilePath}`);
    const absolutePath = await lsp.ensureDocumentOpen(relativeFilePath);
    // Formatting options can be passed if needed, e.g., from .prettierrc or editorconfig
    // For simplicity, using LSP's default options for now.
    const edits = await lsp.sendRequest('textDocument/formatting', {
      textDocument: { uri: lsp._pathToUri(absolutePath) },
      options: { tabSize: 2, insertSpaces: true }, // Example options
    });

    if (edits && edits.length > 0) {
      let content = await fs.readFile(absolutePath, 'utf-8');
      // Apply edits (simplified: assumes non-overlapping and processes from end to start)
      // A robust implementation would use a library for applying text edits.
      edits.sort((a, b) => b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character);
      const lines = content.split('\n');
      for (const edit of edits) {
        const startLine = edit.range.start.line;
        const startChar = edit.range.start.character;
        const endLine = edit.range.end.line;
        const endChar = edit.range.end.character;
        let prefix = '';
        let suffix = '';

        if (startLine === endLine) {
          prefix = lines[startLine].substring(0, startChar);
          suffix = lines[startLine].substring(endChar);
          lines[startLine] = prefix + edit.newText + suffix;
        } else {
          // Multi-line edit: more complex, for now, just replace the whole range
          const before = lines.slice(0, startLine);
          const after = lines.slice(endLine + 1);
          const firstLinePrefix = lines[startLine].substring(0, startChar);
          const lastLineSuffix = lines[endLine].substring(endChar);
          const middleLines = edit.newText.split('\n');

          if (middleLines.length === 1) {
            lines.splice(startLine, endLine - startLine + 1, firstLinePrefix + middleLines[0] + lastLineSuffix);
          } else {
            const newContentLines = [];
            newContentLines.push(firstLinePrefix + middleLines[0]); // First line of new text
            newContentLines.push(...middleLines.slice(1, middleLines.length -1)); // Middle lines of new text
            newContentLines.push(middleLines[middleLines.length -1] + lastLineSuffix); // Last line of new text
            lines.splice(startLine, endLine - startLine + 1, ...newContentLines);
          }
        }
      }
      const newContent = lines.join('\n');
      await fs.writeFile(absolutePath, newContent, 'utf-8');
      // Notify LSP of change (important!)
      const currentVersion = lsp.openDocuments.get(absolutePath) || 1;
      const newVersion = currentVersion + 1;
      lsp.openDocuments.set(absolutePath, newVersion);
      lsp.sendNotification('textDocument/didChange', {
        textDocument: { uri: lsp._pathToUri(absolutePath), version: newVersion },
        contentChanges: [{ text: newContent }] // Send full text for simplicity
      });
      return { applied: true, newContent };
    }
    return { applied: false, message: 'No formatting changes needed or returned by LSP.' };
  }

  async shutdownAll() {
    log('LSP Service: Shutting down all LSP instances...');
    for (const instance of this.lspInstances.values()) {
      await instance.close();
    }
    log('LSP Service: All LSP instances shut down.');
  }
}

// Singleton instance
const lspService = new LspService();
export default lspService;

// Graceful shutdown
let shuttingDown = false;
async function gracefulShutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Initiating graceful shutdown of LSP Service...');
    await lspService.shutdownAll();
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
