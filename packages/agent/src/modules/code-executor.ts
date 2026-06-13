/**
 * Code Execution Engine
 *
 * Runs code in multiple languages and returns output.
 * Supports: Python, JavaScript, TypeScript, C++, Java, C#, Go, Rust, Ruby, PHP, Shell
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  language: string;
}

export interface CodeFile {
  filename: string;
  content: string;
  language?: string;
}

export class CodeExecutor {
  private tempDir: string;

  constructor() {
    this.tempDir = join(tmpdir(), 'remoteos-code');
  }

  /**
   * Execute code in the specified language
   */
  async execute(code: string, language: string, args?: string[]): Promise<ExecutionResult> {
    await mkdir(this.tempDir, { recursive: true });

    const id = randomUUID().slice(0, 8);
    const startTime = Date.now();

    try {
      switch (language.toLowerCase()) {
        case 'python':
        case 'py':
          return await this.executePython(code, id, args);
        case 'javascript':
        case 'js':
          return await this.executeJavaScript(code, id, args);
        case 'typescript':
        case 'ts':
          return await this.executeTypeScript(code, id, args);
        case 'c':
          return await this.executeC(code, id, args);
        case 'cpp':
        case 'c++':
          return await this.executeCpp(code, id, args);
        case 'java':
          return await this.executeJava(code, id, args);
        case 'csharp':
        case 'cs':
          return await this.executeCSharp(code, id, args);
        case 'go':
          return await this.executeGo(code, id, args);
        case 'rust':
        case 'rs':
          return await this.executeRust(code, id, args);
        case 'ruby':
        case 'rb':
          return await this.executeRuby(code, id, args);
        case 'php':
          return await this.executePhp(code, id, args);
        case 'shell':
        case 'bash':
        case 'sh':
          return await this.executeShell(code, id, args);
        case 'powershell':
        case 'ps1':
          return await this.executePowerShell(code, id, args);
        case 'sql':
          return await this.executeSql(code, id, args);
        case 'r':
          return await this.executeR(code, id, args);
        case 'perl':
        case 'pl':
          return await this.executePerl(code, id, args);
        case 'lua':
          return await this.executeLua(code, id, args);
        case 'swift':
          return await this.executeSwift(code, id, args);
        case 'kotlin':
        case 'kt':
          return await this.executeKotlin(code, id, args);
        case 'dart':
          return await this.executeDart(code, id, args);
        case 'html':
          return await this.executeHtml(code, id);
        default:
          return {
            success: false,
            stdout: '',
            stderr: `Unsupported language: ${language}`,
            exitCode: 1,
            executionTimeMs: Date.now() - startTime,
            language,
          };
      }
    } catch (err: any) {
      return {
        success: false,
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
        language,
      };
    }
  }

  /**
   * Execute multiple files as a project
   */
  async executeProject(files: CodeFile[], mainFile: string, args?: string[]): Promise<ExecutionResult> {
    await mkdir(this.tempDir, { recursive: true });

    const projectDir = join(this.tempDir, randomUUID().slice(0, 8));
    await mkdir(projectDir, { recursive: true });

    // Write all files
    for (const file of files) {
      const filePath = join(projectDir, file.filename);
      await writeFile(filePath, file.content, 'utf-8');
    }

    const mainPath = join(projectDir, mainFile);
    const ext = mainFile.split('.').pop()?.toLowerCase() || '';

    // Execute based on file extension
    const code = await readFile(mainPath, 'utf-8');
    return this.execute(code, ext, args);
  }

  /**
   * Execute Python code
   */
  private async executePython(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.py`);
    await writeFile(filePath, code, 'utf-8');

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const cmd = `${pythonCmd} "${filePath}"${args ? ' ' + args.join(' ') : ''}`;

    return this.runCommand(cmd, 'python');
  }

  /**
   * Execute JavaScript code
   */
  private async executeJavaScript(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.js`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `node "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'javascript');
  }

  /**
   * Execute TypeScript code
   */
  private async executeTypeScript(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.ts`);
    await writeFile(filePath, code, 'utf-8');

    // Try tsx first, then ts-node
    try {
      const cmd = `npx tsx "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
      return await this.runCommand(cmd, 'typescript');
    } catch (err) {
      logger.debug({ err, filePath }, 'tsx failed, falling back to ts-node');
      const cmd = `npx ts-node "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
      return this.runCommand(cmd, 'typescript');
    }
  }

  /**
   * Execute C code
   */
  private async executeC(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const srcPath = join(this.tempDir, `${id}.c`);
    const outPath = join(this.tempDir, `${id}${process.platform === 'win32' ? '.exe' : ''}`);
    await writeFile(srcPath, code, 'utf-8');

    await execAsync(`gcc "${srcPath}" -o "${outPath}"`, { timeout: 30000 });
    const cmd = `"${outPath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'c');
  }

  /**
   * Execute C++ code
   */
  private async executeCpp(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const srcPath = join(this.tempDir, `${id}.cpp`);
    const outPath = join(this.tempDir, `${id}${process.platform === 'win32' ? '.exe' : ''}`);
    await writeFile(srcPath, code, 'utf-8');

    await execAsync(`g++ "${srcPath}" -o "${outPath}"`, { timeout: 30000 });
    const cmd = `"${outPath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'cpp');
  }

  /**
   * Execute Java code
   */
  private async executeJava(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    // Extract class name from code
    const classMatch = code.match(/public\s+class\s+(\w+)/);
    const className = classMatch?.[1] || 'Main';

    const filePath = join(this.tempDir, `${className}.java`);
    await writeFile(filePath, code, 'utf-8');

    await execAsync(`javac "${filePath}"`, { timeout: 30000 });
    const cmd = `java -cp "${this.tempDir}" ${className}${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'java');
  }

  /**
   * Execute C# code
   */
  private async executeCSharp(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.cs`);
    await writeFile(filePath, code, 'utf-8');

    // Use dotnet script or csc
    try {
      const cmd = `dotnet script "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
      return await this.runCommand(cmd, 'csharp');
    } catch (err) {
      logger.debug({ err, filePath }, 'dotnet script failed, falling back to csc');
      // Fallback: use csc (Windows)
      const outPath = join(this.tempDir, `${id}.exe`);
      await execAsync(`csc "${filePath}" /out:"${outPath}"`, { timeout: 30000 });
      const cmd = `"${outPath}"${args ? ' ' + args.join(' ') : ''}`;
      return this.runCommand(cmd, 'csharp');
    }
  }

  /**
   * Execute Go code
   */
  private async executeGo(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.go`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `go run "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'go');
  }

  /**
   * Execute Rust code
   */
  private async executeRust(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const srcPath = join(this.tempDir, `${id}.rs`);
    const outPath = join(this.tempDir, `${id}${process.platform === 'win32' ? '.exe' : ''}`);
    await writeFile(srcPath, code, 'utf-8');

    await execAsync(`rustc "${srcPath}" -o "${outPath}"`, { timeout: 60000 });
    const cmd = `"${outPath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'rust');
  }

  /**
   * Execute Ruby code
   */
  private async executeRuby(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.rb`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `ruby "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'ruby');
  }

  /**
   * Execute PHP code
   */
  private async executePhp(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.php`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `php "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'php');
  }

  /**
   * Execute Shell script
   */
  private async executeShell(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.sh`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = process.platform === 'win32'
      ? `bash "${filePath}"${args ? ' ' + args.join(' ') : ''}`
      : `bash "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'shell');
  }

  /**
   * Execute PowerShell script
   */
  private async executePowerShell(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.ps1`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `powershell -ExecutionPolicy Bypass -File "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'powershell');
  }

  /**
   * Execute SQL query
   */
  private async executeSql(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    // For SQL, we need a database connection
    // This is a placeholder - in production, connect to actual DB
    return {
      success: false,
      stdout: '',
      stderr: 'SQL execution requires database connection. Use shell command with mysql/psql/sqlite3.',
      exitCode: 1,
      executionTimeMs: 0,
      language: 'sql',
    };
  }

  /**
   * Execute R code
   */
  private async executeR(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.R`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `Rscript "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'r');
  }

  /**
   * Execute Perl code
   */
  private async executePerl(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.pl`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `perl "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'perl');
  }

  /**
   * Execute Lua code
   */
  private async executeLua(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.lua`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `lua "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'lua');
  }

  /**
   * Execute Swift code
   */
  private async executeSwift(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.swift`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `swift "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'swift');
  }

  /**
   * Execute Kotlin code
   */
  private async executeKotlin(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.kt`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `kotlinc "${filePath}" -include-runtime -d "${this.tempDir}/${id}.jar" && java -jar "${this.tempDir}/${id}.jar"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'kotlin');
  }

  /**
   * Execute Dart code
   */
  private async executeDart(code: string, id: string, args?: string[]): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.dart`);
    await writeFile(filePath, code, 'utf-8');

    const cmd = `dart "${filePath}"${args ? ' ' + args.join(' ') : ''}`;
    return this.runCommand(cmd, 'dart');
  }

  /**
   * Execute HTML (open in browser)
   */
  private async executeHtml(code: string, id: string): Promise<ExecutionResult> {
    const filePath = join(this.tempDir, `${id}.html`);
    await writeFile(filePath, code, 'utf-8');

    // Open in default browser
    if (process.platform === 'win32') {
      await execAsync(`start "" "${filePath}"`, { timeout: 5000 });
    } else if (process.platform === 'darwin') {
      await execAsync(`open "${filePath}"`, { timeout: 5000 });
    } else {
      await execAsync(`xdg-open "${filePath}"`, { timeout: 5000 });
    }

    return {
      success: true,
      stdout: `HTML file opened in browser: ${filePath}`,
      stderr: '',
      exitCode: 0,
      executionTimeMs: 0,
      language: 'html',
    };
  }

  /**
   * Run a command and capture output
   */
  private async runCommand(cmd: string, language: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });

      return {
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
        executionTimeMs: Date.now() - startTime,
        language,
      };
    } catch (err: any) {
      return {
        success: false,
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.code || 1,
        executionTimeMs: Date.now() - startTime,
        language,
      };
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [
      'python', 'py',
      'javascript', 'js',
      'typescript', 'ts',
      'c',
      'cpp', 'c++',
      'java',
      'csharp', 'cs',
      'go',
      'rust', 'rs',
      'ruby', 'rb',
      'php',
      'shell', 'bash', 'sh',
      'powershell', 'ps1',
      'sql',
      'r',
      'perl', 'pl',
      'lua',
      'swift',
      'kotlin', 'kt',
      'dart',
      'html',
    ];
  }
}
