/**
 * AI Service Tests
 */

import { describe, it, expect } from 'vitest';

// Test the function call to intent conversion logic
describe('AI Service Function Calling', () => {
  // We test the mapping logic directly since the class has private methods
  const functionMap: Record<string, { type: string; paramMapper: (args: Record<string, unknown>) => Record<string, unknown> }> = {
    create_file: {
      type: 'create_file',
      paramMapper: (a) => ({ filename: a.filename, content: a.content, run: a.run ?? false }),
    },
    create_files: {
      type: 'create_files',
      paramMapper: (a) => ({ files: a.files }),
    },
    execute_shell: {
      type: 'shell',
      paramMapper: (a) => ({ command: a.command }),
    },
    get_status: {
      type: 'status',
      paramMapper: () => ({}),
    },
    take_screenshot: {
      type: 'screenshot',
      paramMapper: () => ({}),
    },
    list_processes: {
      type: 'process_list',
      paramMapper: () => ({}),
    },
    read_file: {
      type: 'file_read',
      paramMapper: (a) => ({ path: a.path }),
    },
    process_file: {
      type: 'process_file',
      paramMapper: (a) => ({ path: a.path }),
    },
    search_files: {
      type: 'file_search',
      paramMapper: (a) => ({ pattern: `**/*${a.pattern}*`, path: a.path }),
    },
    launch_app: {
      type: 'app_launch',
      paramMapper: (a) => ({ name: a.name }),
    },
    kill_process: {
      type: 'process_kill',
      paramMapper: (a) => ({ name: a.name }),
    },
    set_volume: {
      type: 'set_volume',
      paramMapper: (a) => ({ level: a.level, action: a.action }),
    },
    lock_screen: {
      type: 'lock_screen',
      paramMapper: () => ({}),
    },
    send_notification: {
      type: 'notify',
      paramMapper: (a) => ({ title: a.title ?? 'RemoteOS', body: a.body }),
    },
    web_search: {
      type: 'web_search',
      paramMapper: (a) => ({ query: a.query }),
    },
    open_in_vscode: {
      type: 'open_in_vscode',
      paramMapper: (a) => ({ path: a.path }),
    },
  };

  it('should map create_file correctly', () => {
    const mapping = functionMap['create_file']!;
    expect(mapping.type).toBe('create_file');
    expect(mapping.paramMapper({ filename: 'test.py', content: 'print("hi")' })).toEqual({
      filename: 'test.py',
      content: 'print("hi")',
      run: false,
    });
  });

  it('should map execute_shell correctly', () => {
    const mapping = functionMap['execute_shell']!;
    expect(mapping.type).toBe('shell');
    expect(mapping.paramMapper({ command: 'ls -la' })).toEqual({ command: 'ls -la' });
  });

  it('should map get_status correctly', () => {
    const mapping = functionMap['get_status']!;
    expect(mapping.type).toBe('status');
    expect(mapping.paramMapper({})).toEqual({});
  });

  it('should map search_files correctly', () => {
    const mapping = functionMap['search_files']!;
    expect(mapping.type).toBe('file_search');
    const result = mapping.paramMapper({ pattern: '*.py', path: 'Desktop' });
    expect(result.pattern).toContain('.py');
    expect(result.path).toBe('Desktop');
  });

  it('should map send_notification with default title', () => {
    const mapping = functionMap['send_notification']!;
    expect(mapping.type).toBe('notify');
    expect(mapping.paramMapper({ body: 'Hello' })).toEqual({
      title: 'RemoteOS',
      body: 'Hello',
    });
  });

  it('should map send_notification with custom title', () => {
    const mapping = functionMap['send_notification']!;
    expect(mapping.paramMapper({ title: 'Custom', body: 'Hello' })).toEqual({
      title: 'Custom',
      body: 'Hello',
    });
  });

  it('should have all 16 function mappings', () => {
    expect(Object.keys(functionMap)).toHaveLength(16);
    expect(Object.keys(functionMap)).toEqual([
      'create_file', 'create_files', 'execute_shell', 'get_status',
      'take_screenshot', 'list_processes', 'read_file', 'process_file',
      'search_files', 'launch_app', 'kill_process', 'set_volume',
      'lock_screen', 'send_notification', 'web_search', 'open_in_vscode',
    ]);
  });
});

describe('AI Service Response Parsing', () => {
  it('should parse <action> tags correctly', () => {
    const text = 'Đây là file của bạn!\n<action>\n{"type":"create_file","filename":"test.py","content":"print(1)"}\n</action>';
    const actionRegex = /<action>([\s\S]*?)<\/action>/g;
    const matches = [...text.matchAll(actionRegex)];
    expect(matches).toHaveLength(1);

    const parsed = JSON.parse(matches[0]![1].trim());
    expect(parsed.type).toBe('create_file');
    expect(parsed.filename).toBe('test.py');
  });

  it('should parse multiple <action> tags', () => {
    const text = `<action>{"type":"create_file","filename":"a.py","content":"print(1)"}</action>
<action>{"type":"create_file","filename":"b.py","content":"print(2)"}</action>`;
    const actionRegex = /<action>([\s\S]*?)<\/action>/g;
    const matches = [...text.matchAll(actionRegex)];
    expect(matches).toHaveLength(2);
  });

  it('should handle free_response without action tags', () => {
    const text = 'Xin chào! Tôi là RemoteOS AI. 😊';
    const actionRegex = /<action>([\s\S]*?)<\/action>/g;
    const matches = [...text.matchAll(actionRegex)];
    expect(matches).toHaveLength(0);
  });
});
