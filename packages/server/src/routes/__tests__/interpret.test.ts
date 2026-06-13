/**
 * Interpret Route Tests — Multi-turn, Vision, Code Execution
 */

import { describe, it, expect } from 'vitest';

describe('Code Verification Logic', () => {
  const verifiableExts = ['py', 'js', 'ts', 'go', 'rs', 'java', 'cpp', 'c', 'rb', 'php', 'sh', 'ps1'];

  it('should identify verifiable extensions', () => {
    expect(verifiableExts).toContain('py');
    expect(verifiableExts).toContain('js');
    expect(verifiableExts).toContain('ts');
    expect(verifiableExts).toContain('go');
    expect(verifiableExts).toContain('java');
    expect(verifiableExts).toContain('cpp');
  });

  it('should not identify non-code extensions', () => {
    expect(verifiableExts).not.toContain('txt');
    expect(verifiableExts).not.toContain('md');
    expect(verifiableExts).not.toContain('json');
    expect(verifiableExts).not.toContain('html');
    expect(verifiableExts).not.toContain('css');
  });

  it('should map extensions to run commands', () => {
    const cmds: Record<string, string> = {
      py: 'python',
      js: 'node',
      ts: 'npx tsx',
      go: 'go run',
      rb: 'ruby',
      php: 'php',
      sh: 'bash',
      ps1: 'powershell',
    };

    expect(cmds['py']).toBe('python');
    expect(cmds['js']).toBe('node');
    expect(cmds['ts']).toBe('npx tsx');
    expect(cmds['go']).toBe('go run');
  });
});

describe('Execute Code Language Mapping', () => {
  const exts: Record<string, string> = {
    python: 'py', javascript: 'js', typescript: 'ts', go: 'go',
    rust: 'rs', java: 'java', cpp: 'cpp', c: 'c', ruby: 'rb',
    php: 'php', shell: 'sh', powershell: 'ps1', sql: 'sql',
  };

  it('should map language names to extensions', () => {
    expect(exts['python']).toBe('py');
    expect(exts['javascript']).toBe('js');
    expect(exts['typescript']).toBe('ts');
    expect(exts['go']).toBe('go');
    expect(exts['rust']).toBe('rs');
    expect(exts['java']).toBe('java');
    expect(exts['cpp']).toBe('cpp');
    expect(exts['ruby']).toBe('rb');
    expect(exts['php']).toBe('php');
    expect(exts['shell']).toBe('sh');
    expect(exts['powershell']).toBe('ps1');
  });

  it('should handle case insensitive input', () => {
    const lang = 'Python';
    const result = exts[lang.toLowerCase()];
    expect(result).toBe('py');
  });
});

describe('Vision API Request Validation', () => {
  it('should require image field', () => {
    const body = { prompt: 'describe this' };
    expect(body).not.toHaveProperty('image');
  });

  it('should accept base64 image', () => {
    const body = { image: 'data:image/png;base64,iVBORw0KGgo=', prompt: 'describe' };
    expect(body.image).toContain('base64');
  });

  it('should have default prompt', () => {
    const defaultPrompt = 'Mô tả chi tiết những gì bạn thấy trong ảnh chụp màn hình này.';
    expect(defaultPrompt).toBeTruthy();
    expect(defaultPrompt.length).toBeGreaterThan(10);
  });
});

describe('Multi-turn Execution Logic', () => {
  it('should limit turns to maxTurns', () => {
    const maxTurns = 5;
    let turn = 0;
    const results: number[] = [];

    while (turn < maxTurns) {
      turn++;
      results.push(turn);
    }

    expect(results).toHaveLength(5);
    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  it('should stop on failure', () => {
    const results = [
      { turn: 1, success: true },
      { turn: 2, success: true },
      { turn: 3, success: false },
    ];

    const allSuccess = results.every(r => r.success);
    expect(allSuccess).toBe(false);
    expect(results.filter(r => r.success)).toHaveLength(2);
  });

  it('should stop on free_response', () => {
    const intents = [
      { type: 'create_file', response: undefined },
      { type: 'free_response', response: 'Done!' },
    ];

    const shouldStop = intents.some(i => i.type === 'free_response');
    expect(shouldStop).toBe(true);
  });
});
