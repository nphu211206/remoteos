/**
 * Report Generator Module
 *
 * Generates professional reports in multiple formats:
 * - Word (.docx)
 * - PDF
 * - Excel (.xlsx)
 * - PowerPoint (.pptx)
 * - HTML
 * - Markdown
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface ReportSection {
  title: string;
  content: string;
  level?: number; // heading level 1-6
  type?: 'text' | 'table' | 'chart' | 'code' | 'list';
  data?: any;
}

export interface ReportConfig {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  sections: ReportSection[];
  format: 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'html' | 'md';
  outputPath?: string;
}

export class ReportGenerator {
  private tempDir: string;

  constructor() {
    this.tempDir = join(tmpdir(), 'remoteos-reports');
  }

  /**
   * Generate report in specified format
   */
  async generate(config: ReportConfig): Promise<string> {
    const outputDir = config.outputPath || this.tempDir;
    await import('node:fs/promises').then(fs => fs.mkdir(outputDir, { recursive: true }));

    const filename = `${config.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    const outputPath = join(outputDir, `${filename}.${config.format}`);

    switch (config.format) {
      case 'docx':
        return this.generateDocx(config, outputPath);
      case 'pdf':
        return this.generatePdf(config, outputPath);
      case 'xlsx':
        return this.generateExcel(config, outputPath);
      case 'pptx':
        return this.generatePowerPoint(config, outputPath);
      case 'html':
        return this.generateHtml(config, outputPath);
      case 'md':
        return this.generateMarkdown(config, outputPath);
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }
  }

  /**
   * Generate Word document using Python
   */
  private async generateDocx(config: ReportConfig, outputPath: string): Promise<string> {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const sectionsPython = config.sections.map(s => {
      if (s.type === 'table' && s.data) {
        return `
doc.add_heading('${s.title.replace(/'/g, "\\'")}', level=${s.level || 2})
table = doc.add_table(rows=${s.data.rows.length + 1}, cols=${s.data.columns.length}, style='Table Grid')
for i, col in enumerate(${JSON.stringify(s.data.columns)}):
    table.rows[0].cells[i].text = col
for r_idx, row in enumerate(${JSON.stringify(s.data.rows)}):
    for c_idx, val in enumerate(row):
        table.rows[r_idx + 1].cells[c_idx].text = str(val)
`;
      } else if (s.type === 'list' && Array.isArray(s.data)) {
        return `
doc.add_heading('${s.title.replace(/'/g, "\\'")}', level=${s.level || 2})
for item in ${JSON.stringify(s.data)}:
    doc.add_paragraph(item, style='List Bullet')
`;
      } else {
        return `
doc.add_heading('${s.title.replace(/'/g, "\\'")}', level=${s.level || 2})
doc.add_paragraph("""${s.content.replace(/"""/g, '\\"\\"\\"')}""")
`;
      }
    }).join('\n');

    const script = `
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# Title
doc.add_heading('${config.title.replace(/'/g, "\\'")}', 0)
${config.subtitle ? `doc.add_paragraph('${config.subtitle.replace(/'/g, "\\'")}').alignment = WD_ALIGN_PARAGRAPH.CENTER` : ''}
${config.author ? `doc.add_paragraph('Tác giả: ${config.author.replace(/'/g, "\\'")}').alignment = WD_ALIGN_PARAGRAPH.CENTER` : ''}
${config.date ? `doc.add_paragraph('Ngày: ${config.date.replace(/'/g, "\\'")}').alignment = WD_ALIGN_PARAGRAPH.CENTER` : ''}
doc.add_page_break()

# Sections
${sectionsPython}

doc.save(r'${outputPath.replace(/\\/g, '\\\\')}')
print(r'${outputPath.replace(/\\/g, '\\\\')}')
`;

    const scriptPath = join(this.tempDir, 'gen_docx.py');
    await writeFile(scriptPath, script, 'utf-8');

    await execAsync(`${pythonCmd} "${scriptPath}"`, { timeout: 60000 });

    logger.info({ path: outputPath }, 'Word document generated');
    return outputPath;
  }

  /**
   * Generate PDF using Python
   */
  private async generatePdf(config: ReportConfig, outputPath: string): Promise<string> {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const sectionsPython = config.sections.map(s => {
      if (s.type === 'table' && s.data) {
        return `
pdf.set_font('Arial', 'B', 14)
pdf.cell(0, 10, '${s.title.replace(/'/g, "\\'")}', ln=True)
pdf.set_font('Arial', '', 10)
for row in ${JSON.stringify(s.data.rows)}:
    pdf.cell(0, 8, ' | '.join(str(v) for v in row), ln=True)
pdf.ln(5)
`;
      } else {
        return `
pdf.set_font('Arial', 'B', 14)
pdf.cell(0, 10, '${s.title.replace(/'/g, "\\'")}', ln=True)
pdf.set_font('Arial', '', 11)
pdf.multi_cell(0, 6, """${s.content.replace(/"""/g, '\\"\\"\\"')}""")
pdf.ln(5)
`;
      }
    }).join('\n');

    const script = `
from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font('Arial', 'B', 24)
pdf.cell(0, 20, '${config.title.replace(/'/g, "\\'")}', ln=True, align='C')
${config.subtitle ? `pdf.set_font('Arial', 'I', 14)\npdf.cell(0, 10, '${config.subtitle.replace(/'/g, "\\'")}', ln=True, align='C')` : ''}
pdf.ln(20)

${sectionsPython}

pdf.output(r'${outputPath.replace(/\\/g, '\\\\')}')
print(r'${outputPath.replace(/\\/g, '\\\\')}')
`;

    const scriptPath = join(this.tempDir, 'gen_pdf.py');
    await writeFile(scriptPath, script, 'utf-8');

    await execAsync(`${pythonCmd} "${scriptPath}"`, { timeout: 60000 });

    logger.info({ path: outputPath }, 'PDF generated');
    return outputPath;
  }

  /**
   * Generate Excel report
   */
  private async generateExcel(config: ReportConfig, outputPath: string): Promise<string> {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const sheetsPython = config.sections
      .filter(s => s.type === 'table' && s.data)
      .map(s => {
        const sheetTitle = s.title.replace(/'/g, "\\'").substring(0, 31);
        const columnsJson = JSON.stringify(s.data.columns);
        const rowsJson = JSON.stringify(s.data.rows);
        return `
ws = wb.create_sheet(title='${sheetTitle}')
for i, col in enumerate(${columnsJson}):
    ws.cell(row=1, column=i+1, value=col)
for r_idx, row in enumerate(${rowsJson}):
    for c_idx, val in enumerate(row):
        ws.cell(row=r_idx+2, column=c_idx+1, value=val)
`;
      }).join('\n');

    const script = `
import openpyxl

wb = openpyxl.Workbook()
wb.remove(wb.active)

${sheetsPython}

wb.save(r'${outputPath.replace(/\\/g, '\\\\')}')
print(r'${outputPath.replace(/\\/g, '\\\\')}')
`;

    const scriptPath = join(this.tempDir, 'gen_xlsx.py');
    await writeFile(scriptPath, script, 'utf-8');

    await execAsync(`${pythonCmd} "${scriptPath}"`, { timeout: 60000 });

    logger.info({ path: outputPath }, 'Excel generated');
    return outputPath;
  }

  /**
   * Generate PowerPoint presentation
   */
  private async generatePowerPoint(config: ReportConfig, outputPath: string): Promise<string> {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const slidesPython = config.sections.map(s => `
slide = prs.slides.add_slide(prs.slide_layouts[1])
title = slide.shapes.title
title.text = '${s.title.replace(/'/g, "\\'")}'
body = slide.placeholders[1]
body.text = """${s.content.replace(/"""/g, '\\"\\"\\"')}"""
`).join('\n');

    const script = `
from pptx import Presentation
from pptx.util import Inches

prs = Presentation()

# Title slide
slide = prs.slides.add_slide(prs.slide_layouts[0])
title = slide.shapes.title
title.text = '${config.title.replace(/'/g, "\\'")}'
subtitle = slide.placeholders[1]
subtitle.text = '${(config.subtitle || config.author || '').replace(/'/g, "\\'")}'

${slidesPython}

prs.save(r'${outputPath.replace(/\\/g, '\\\\')}')
print(r'${outputPath.replace(/\\/g, '\\\\')}')
`;

    const scriptPath = join(this.tempDir, 'gen_pptx.py');
    await writeFile(scriptPath, script, 'utf-8');

    await execAsync(`${pythonCmd} "${scriptPath}"`, { timeout: 60000 });

    logger.info({ path: outputPath }, 'PowerPoint generated');
    return outputPath;
  }

  /**
   * Generate HTML report
   */
  private async generateHtml(config: ReportConfig, outputPath: string): Promise<string> {
    const sectionsHtml = config.sections.map(s => {
      if (s.type === 'table' && s.data) {
        const headers = s.data.columns.map((c: string) => `<th>${c}</th>`).join('');
        const rows = s.data.rows.map((row: any[]) =>
          `<tr>${row.map((cell: any) => `<td>${cell}</td>`).join('')}</tr>`
        ).join('');
        return `<h${s.level || 2}>${s.title}</h${s.level || 2}><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
      } else if (s.type === 'code') {
        return `<h${s.level || 2}>${s.title}</h${s.level || 2}><pre><code>${s.content}</code></pre>`;
      } else if (s.type === 'list' && Array.isArray(s.data)) {
        return `<h${s.level || 2}>${s.title}</h${s.level || 2}><ul>${s.data.map((item: string) => `<li>${item}</li>`).join('')}</ul>`;
      } else {
        return `<h${s.level || 2}>${s.title}</h${s.level || 2}><p>${s.content.replace(/\n/g, '<br>')}</p>`;
      }
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>${config.title}</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px; line-height: 1.6; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #2980b9; margin-top: 30px; }
        h3 { color: #7f8c8d; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: #3498db; color: white; }
        tr:nth-child(even) { background: #f2f2f2; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        code { font-family: 'Consolas', monospace; }
        ul { margin: 10px 0; }
        li { margin: 5px 0; }
        .meta { color: #7f8c8d; font-style: italic; }
    </style>
</head>
<body>
    <h1>${config.title}</h1>
    ${config.subtitle ? `<p class="meta">${config.subtitle}</p>` : ''}
    ${config.author ? `<p class="meta">Tác giả: ${config.author}</p>` : ''}
    ${config.date ? `<p class="meta">Ngày: ${config.date}</p>` : ''}
    <hr>
    ${sectionsHtml}
</body>
</html>`;

    await writeFile(outputPath, html, 'utf-8');

    // Open in browser
    if (process.platform === 'win32') {
      await execAsync(`start "" "${outputPath}"`, { timeout: 5000 }).catch(() => {});
    }

    logger.info({ path: outputPath }, 'HTML report generated');
    return outputPath;
  }

  /**
   * Generate Markdown report
   */
  private async generateMarkdown(config: ReportConfig, outputPath: string): Promise<string> {
    const sectionsMd = config.sections.map(s => {
      const heading = '#'.repeat(s.level || 2);

      if (s.type === 'table' && s.data) {
        const headers = '| ' + s.data.columns.join(' | ') + ' |';
        const separator = '| ' + s.data.columns.map(() => '---').join(' | ') + ' |';
        const rows = s.data.rows.map((row: any[]) => '| ' + row.join(' | ') + ' |').join('\n');
        return heading + ' ' + s.title + '\n\n' + headers + '\n' + separator + '\n' + rows + '\n';
      } else if (s.type === 'code') {
        return heading + ' ' + s.title + '\n\n```\n' + s.content + '\n```\n';
      } else if (s.type === 'list' && Array.isArray(s.data)) {
        return heading + ' ' + s.title + '\n\n' + s.data.map((item: string) => '- ' + item).join('\n') + '\n';
      } else {
        return heading + ' ' + s.title + '\n\n' + s.content + '\n';
      }
    }).join('\n');

    const md = '# ' + config.title + '\n\n' +
      (config.subtitle ? '*' + config.subtitle + '*\n' : '') +
      (config.author ? '**Tác giả:** ' + config.author + '\n' : '') +
      (config.date ? '**Ngày:** ' + config.date + '\n' : '') +
      '\n---\n\n' +
      sectionsMd;

    await writeFile(outputPath, md, 'utf-8');

    logger.info({ path: outputPath }, 'Markdown report generated');
    return outputPath;
  }

  /**
   * Quick report from data
   */
  async quickReport(title: string, data: any, format: string): Promise<string> {
    const reportFormat = format || 'html';
    return this.generate({
      title,
      sections: [
        {
          title: 'Dữ liệu',
          content: '',
          type: 'table',
          data,
          level: 2,
        },
      ],
      format: reportFormat as any,
    });
  }
}
