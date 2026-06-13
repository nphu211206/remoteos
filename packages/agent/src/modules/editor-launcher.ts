/**
 * Editor Launcher
 *
 * Opens files in code editors (VS Code, Notepad, Sublime, etc.)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import type { OpenEditorOutput } from '@remoteos/shared';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

interface OpenEditorParams {
  editor?: string;  // 'vscode' | 'notepad' | 'sublime' | 'jetbrains' | 'webstorm' | 'pycharm'
  path: string;     // file or folder path
  line?: number;    // optional line number
}

export class EditorLauncher {
  private editorMappings: Record<string, Record<string, string>> = {
    windows: {
      vscode: 'code',
      notepad: 'notepad',
      notepadpp: 'notepad++',
      sublime: 'subl',
      atom: 'atom',
      jetbrains: 'idea64',
      webstorm: 'webstorm64',
      pycharm: 'pycharm64',
    },
    darwin: {
      vscode: 'code',
      sublime: 'subl',
      atom: 'atom',
      jetbrains: 'idea',
      webstorm: 'webstorm',
      vim: 'vim',
      nano: 'nano',
    },
    linux: {
      vscode: 'code',
      sublime: 'subl',
      atom: 'atom',
      vim: 'vim',
      nano: 'nano',
      gedit: 'gedit',
    },
  };

  /**
   * Open a file or folder in the specified editor
   */
  async open(params: OpenEditorParams): Promise<OpenEditorOutput> {
    const platform = process.platform === 'win32' ? 'windows' :
                    process.platform === 'darwin' ? 'darwin' : 'linux';
    const editor = params.editor || 'vscode';
    const mappings = this.editorMappings[platform];
    const editorCmd = mappings[editor];

    if (!editorCmd) {
      throw new Error(
        `Editor "${editor}" không hỗ trợ trên ${platform}. ` +
        `Editors khả dụng: ${Object.keys(mappings).join(', ')}`
      );
    }

    const resolvedPath = resolve(params.path);
    let cmd = `${editorCmd} "${resolvedPath}"`;

    // VS Code supports --goto for line number
    if (editor === 'vscode' && params.line) {
      cmd = `${editorCmd} --goto "${resolvedPath}:${params.line}"`;
    }

    logger.info({ editor, path: resolvedPath, cmd }, 'Opening editor');

    try {
      await execAsync(cmd, { timeout: 5000 });

      return {
        commandType: 'open_editor',
        editor,
        path: resolvedPath,
        success: true,
        message: `Đã mở ${editor}: ${resolvedPath}`,
      };
    } catch (err: any) {
      throw new Error(`Không thể mở ${editor}: ${err.message}`);
    }
  }

  /**
   * List available editors for the current platform
   */
  listEditors(): string[] {
    const platform = process.platform === 'win32' ? 'windows' :
                    process.platform === 'darwin' ? 'darwin' : 'linux';
    return Object.keys(this.editorMappings[platform] || {});
  }
}
