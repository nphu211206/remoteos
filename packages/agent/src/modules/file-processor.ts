/**
 * File Processor Module
 *
 * Handles advanced file processing:
 * - Read PDFs
 * - Process Excel/CSV files
 * - Edit Word documents
 * - Analyze images
 * - Extract text from documents
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface ProcessedFile {
  type: string;
  path: string;
  content: string;
  metadata: Record<string, unknown>;
}

export class FileProcessor {
  /**
   * Process any file based on its extension
   */
  async processFile(filePath: string): Promise<ProcessedFile> {
    const ext = extname(filePath).toLowerCase();

    switch (ext) {
      case '.pdf':
        return this.processPDF(filePath);
      case '.xlsx':
      case '.xls':
      case '.csv':
        return this.processSpreadsheet(filePath);
      case '.docx':
      case '.doc':
        return this.processWord(filePath);
      case '.txt':
      case '.md':
      case '.json':
      case '.xml':
      case '.yaml':
      case '.yml':
      case '.toml':
      case '.ini':
      case '.cfg':
      case '.conf':
        return this.processText(filePath);
      case '.py':
      case '.js':
      case '.ts':
      case '.jsx':
      case '.tsx':
      case '.html':
      case '.css':
      case '.java':
      case '.c':
      case '.cpp':
      case '.cs':
      case '.go':
      case '.rs':
      case '.rb':
      case '.php':
      case '.swift':
      case '.kt':
      case '.dart':
      case '.r':
      case '.sql':
      case '.sh':
      case '.bat':
      case '.ps1':
        return this.processCode(filePath);
      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.gif':
      case '.bmp':
      case '.webp':
      case '.svg':
        return this.processImage(filePath);
      default:
        return this.processText(filePath);
    }
  }

  /**
   * Process PDF file
   */
  async processPDF(filePath: string): Promise<ProcessedFile> {
    try {
      // Try using pdftotext (poppler)
      const { stdout } = await execAsync(`pdftotext "${filePath}" -`, { timeout: 30000 });
      return {
        type: 'pdf',
        path: filePath,
        content: stdout,
        metadata: { format: 'PDF' },
      };
    } catch {
      // Fallback: use Python with PyPDF2
      try {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const script = `
import sys
try:
    import PyPDF2
    with open(r'${filePath}', 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        text = ''
        for page in reader.pages:
            text += page.extract_text() + '\\n'
        print(text)
except ImportError:
    print('ERROR: PyPDF2 not installed. Run: pip install PyPDF2')
except Exception as e:
    print(f'ERROR: {e}')
`;
        const { stdout } = await execAsync(`${pythonCmd} -c "${script.replace(/"/g, '\\"')}"`, { timeout: 30000 });
        return {
          type: 'pdf',
          path: filePath,
          content: stdout,
          metadata: { format: 'PDF' },
        };
      } catch {
        return {
          type: 'pdf',
          path: filePath,
          content: 'ERROR: Cannot read PDF. Install poppler (pdftotext) or PyPDF2.',
          metadata: { format: 'PDF', error: true },
        };
      }
    }
  }

  /**
   * Process Excel/CSV file
   */
  async processSpreadsheet(filePath: string): Promise<ProcessedFile> {
    const ext = extname(filePath).toLowerCase();

    if (ext === '.csv') {
      // CSV: read directly
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const preview = lines.slice(0, 100).join('\n');

      return {
        type: 'csv',
        path: filePath,
        content: preview,
        metadata: {
          format: 'CSV',
          totalRows: lines.length,
          columns: lines[0]?.split(',').length || 0,
        },
      };
    }

    // Excel: use Python with openpyxl
    try {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const script = `
import sys
try:
    import openpyxl
    wb = openpyxl.load_workbook(r'${filePath}', read_only=True)
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        print(f'=== Sheet: {sheet_name} ===')
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i >= 100:
                print(f'... ({ws.max_row} total rows)')
                break
            print('\\t'.join(str(cell) if cell is not None else '' for cell in row))
        print()
    wb.close()
except ImportError:
    print('ERROR: openpyxl not installed. Run: pip install openpyxl')
except Exception as e:
    print(f'ERROR: {e}')
`;
      const { stdout } = await execAsync(`${pythonCmd} -c "${script.replace(/"/g, '\\"')}"`, { timeout: 30000 });
      return {
        type: 'excel',
        path: filePath,
        content: stdout,
        metadata: { format: 'Excel' },
      };
    } catch {
      return {
        type: 'excel',
        path: filePath,
        content: 'ERROR: Cannot read Excel. Install openpyxl: pip install openpyxl',
        metadata: { format: 'Excel', error: true },
      };
    }
  }

  /**
   * Process Word document
   */
  async processWord(filePath: string): Promise<ProcessedFile> {
    try {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const script = `
import sys
try:
    from docx import Document
    doc = Document(r'${filePath}')
    text = ''
    for para in doc.paragraphs:
        text += para.text + '\\n'
    for table in doc.tables:
        text += '\\n--- TABLE ---\\n'
        for row in table.rows:
            text += '\\t'.join(cell.text for cell in row.cells) + '\\n'
    print(text)
except ImportError:
    print('ERROR: python-docx not installed. Run: pip install python-docx')
except Exception as e:
    print(f'ERROR: {e}')
`;
      const { stdout } = await execAsync(`${pythonCmd} -c "${script.replace(/"/g, '\\"')}"`, { timeout: 30000 });
      return {
        type: 'word',
        path: filePath,
        content: stdout,
        metadata: { format: 'Word' },
      };
    } catch {
      return {
        type: 'word',
        path: filePath,
        content: 'ERROR: Cannot read Word document. Install python-docx: pip install python-docx',
        metadata: { format: 'Word', error: true },
      };
    }
  }

  /**
   * Process text file
   */
  async processText(filePath: string): Promise<ProcessedFile> {
    const content = await readFile(filePath, 'utf-8');
    return {
      type: 'text',
      path: filePath,
      content,
      metadata: { format: 'Text', size: content.length },
    };
  }

  /**
   * Process code file
   */
  async processCode(filePath: string): Promise<ProcessedFile> {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    return {
      type: 'code',
      path: filePath,
      content,
      metadata: {
        format: extname(filePath).slice(1).toUpperCase(),
        lines: lines.length,
        size: content.length,
      },
    };
  }

  /**
   * Process image file
   */
  async processImage(filePath: string): Promise<ProcessedFile> {
    const buffer = await readFile(filePath);
    const base64 = buffer.toString('base64');

    return {
      type: 'image',
      path: filePath,
      content: `[Image: ${extname(filePath).slice(1).toUpperCase()}, ${buffer.length} bytes]`,
      metadata: {
        format: extname(filePath).slice(1).toUpperCase(),
        size: buffer.length,
        base64Length: base64.length,
        base64Preview: base64.substring(0, 100) + '...',
      },
    };
  }

  /**
   * Analyze image with AI
   */
  async analyzeImage(filePath: string, prompt: string, apiKey: string): Promise<string> {
    const buffer = await readFile(filePath);
    const base64 = buffer.toString('base64');
    const ext = extname(filePath).slice(1).toLowerCase();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp',
    };

    const axios = (await import('axios')).default;
    const model = 'gemini-2.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await axios.post(url, {
      contents: [{
        parts: [
          { text: prompt || 'Describe this image in detail.' },
          {
            inline_data: {
              mime_type: mimeTypes[ext] || 'image/jpeg',
              data: base64,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }, { timeout: 30000 });

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Cannot analyze image';
  }

  /**
   * Extract data from structured file
   */
  async extractData(filePath: string): Promise<Record<string, unknown>> {
    const processed = await this.processFile(filePath);

    if (processed.type === 'csv') {
      const lines = processed.content.split('\n');
      const headers = lines[0]?.split(',') || [];
      const rows = lines.slice(1).map(line => {
        const values = line.split(',');
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h.trim()] = values[i]?.trim() || ''; });
        return row;
      });

      return {
        format: 'CSV',
        headers,
        rowCount: rows.length,
        preview: rows.slice(0, 10),
      };
    }

    return {
      format: processed.type,
      contentLength: processed.content.length,
      metadata: processed.metadata,
    };
  }
}
