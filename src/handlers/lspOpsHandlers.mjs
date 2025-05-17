import lspService from '../lsp/lspService.mjs';
import { log } from '../config.mjs';
import { getAbsolutePath } from '../utils/fileUtils.mjs'; // For path validation if needed by LLM
import { z } from 'zod'; // For defining languageId schema

export const languageIdSchema = z.enum(['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'vue', 'json', 'html', 'css'])
    .describe('The language identifier for the file (e.g., typescript, vue).');


export async function getDiagnosticsHandler({ filePath }) {
  try {
    log(`LSP Handler: Getting diagnostics for ${filePath}`);
    // filePath is relative from BASE_DIR
    const diagnostics = await lspService.getDiagnostics(filePath);
    return {
      content: [
        { type: "text", text: `Diagnostics for ${filePath}:` },
        { type: "json", data: diagnostics }
      ]
    };
  } catch (error) {
    log(`LSP GetDiagnostics Error for ${filePath}: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error getting diagnostics: ${error.message}` }],
      isError: true
    };
  }
}

export async function getCompletionsHandler({ filePath, line, character }) {
  try {
    log(`LSP Handler: Getting completions for ${filePath} at ${line}:${character}`);
    const completions = await lspService.getCompletions(filePath, line, character);
    return {
      content: [
        { type: "text", text: `Completions for ${filePath} at line ${line+1}, char ${character+1}:` },
        { type: "json", data: completions }
      ]
    };
  } catch (error) {
    log(`LSP GetCompletions Error for ${filePath}: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error getting completions: ${error.message}` }],
      isError: true
    };
  }
}

export async function findDefinitionHandler({ filePath, line, character }) {
  try {
    log(`LSP Handler: Finding definition for ${filePath} at ${line}:${character}`);
    const definition = await lspService.findDefinition(filePath, line, character);
    // Definition can be a single Location or Location[] or LocationLink[]
    return {
      content: [
        { type: "text", text: `Definition(s) for ${filePath} at line ${line+1}, char ${character+1}:` },
        { type: "json", data: definition }
      ]
    };
  } catch (error) {
    log(`LSP FindDefinition Error for ${filePath}: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error finding definition: ${error.message}` }],
      isError: true
    };
  }
}

export async function formatDocumentHandler({ filePath }) {
  try {
    log(`LSP Handler: Formatting document ${filePath}`);
    const result = await lspService.formatDocument(filePath);
     if (result.applied) {
        return {
            content: [{ type: "text", text: `Document ${filePath} formatted successfully.` }]
        };
    } else {
        return {
            content: [{ type: "text", text: result.message || `Document ${filePath} was not modified by formatting.` }]
        };
    }
  } catch (error) {
    log(`LSP FormatDocument Error for ${filePath}: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error formatting document: ${error.message}` }],
      isError: true
    };
  }
}
