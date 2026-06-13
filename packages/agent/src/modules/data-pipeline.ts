/**
 * Data Pipeline Module
 *
 * Handles data operations:
 * - Database connections (MySQL, PostgreSQL, SQLite, MongoDB)
 * - SQL query execution
 * - Data export (CSV, JSON, Excel)
 * - Data visualization (charts, graphs)
 * - Statistical analysis
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from '../config/logger.js';

const execAsync = promisify(exec);

export interface QueryResult {
  success: boolean;
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTimeMs: number;
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'doughnut' | 'radar' | 'heatmap';
  title: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
  width?: number;
  height?: number;
}

export class DataPipeline {
  /**
   * Execute SQL query on SQLite database
   */
  async executeSqlite(dbPath: string, query: string): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const { stdout } = await execAsync(
        `sqlite3 -json "${dbPath}" "${query.replace(/"/g, '\\"')}"`,
        { timeout: 30000 }
      );

      const rows = JSON.parse(stdout || '[]');
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        success: true,
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute SQL query on MySQL
   */
  async executeMySQL(config: { host: string; port: number; user: string; password: string; database: string }, query: string): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const cmd = `mysql -h ${config.host} -P ${config.port} -u ${config.user} -p${config.password} ${config.database} -e "${query.replace(/"/g, '\\"')}" --json`;
      const { stdout } = await execAsync(cmd, { timeout: 30000 });

      const rows = JSON.parse(stdout || '[]');
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        success: true,
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute SQL query on PostgreSQL
   */
  async executePostgreSQL(config: { host: string; port: number; user: string; password: string; database: string }, query: string): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const env = `PGPASSWORD=${config.password}`;
      const cmd = `${env} psql -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database} -c "${query.replace(/"/g, '\\"')}" --json`;
      const { stdout } = await execAsync(cmd, { timeout: 30000 });

      const rows = JSON.parse(stdout || '[]');
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        success: true,
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Export data to CSV
   */
  async exportToCSV(data: { columns: string[]; rows: any[] }, outputPath: string): Promise<string> {
    const header = data.columns.join(',');
    const rows = data.rows.map(row =>
      data.columns.map(col => {
        const val = row[col];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val ?? '';
      }).join(',')
    );

    const csv = [header, ...rows].join('\n');
    await writeFile(outputPath, csv, 'utf-8');

    logger.info({ path: outputPath, rowCount: data.rows.length }, 'CSV exported');
    return outputPath;
  }

  /**
   * Export data to JSON
   */
  async exportToJSON(data: any, outputPath: string): Promise<string> {
    await writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info({ path: outputPath }, 'JSON exported');
    return outputPath;
  }

  /**
   * Export data to Excel using Python
   */
  async exportToExcel(data: { columns: string[]; rows: any[] }, outputPath: string): Promise<string> {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const script = `
import json
import sys
try:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    data = json.loads(sys.argv[1])
    ws.append(data['columns'])
    for row in data['rows']:
        ws.append([row.get(col, '') for col in data['columns']])
    wb.save(r'${outputPath}')
    print('OK')
except ImportError:
    print('ERROR: pip install openpyxl')
except Exception as e:
    print(f'ERROR: {e}')
`;

    const dataJson = JSON.stringify(data).replace(/'/g, "\\'");
    await execAsync(`${pythonCmd} -c "${script.replace(/"/g, '\\"')}" '${dataJson}'`, { timeout: 30000 });

    logger.info({ path: outputPath }, 'Excel exported');
    return outputPath;
  }

  /**
   * Generate HTML chart using Chart.js
   */
  async generateChart(config: ChartConfig): Promise<string> {
    const outputPath = join(tmpdir(), 'remoteos-charts', `chart-${Date.now()}.html`);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${config.title}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: ${config.width || 800}px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { text-align: center; color: #333; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${config.title}</h1>
        <canvas id="chart"></canvas>
    </div>
    <script>
        new Chart(document.getElementById('chart'), {
            type: '${config.type}',
            data: {
                labels: ${JSON.stringify(config.labels)},
                datasets: ${JSON.stringify(config.datasets.map(ds => ({
                  label: ds.label,
                  data: ds.data,
                  backgroundColor: ds.color || 'rgba(54, 162, 235, 0.5)',
                  borderColor: ds.color || 'rgba(54, 162, 235, 1)',
                  borderWidth: 1,
                })))}
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } }
            }
        });
    </script>
</body>
</html>`;

    await writeFile(outputPath, html, 'utf-8');

    // Open in browser
    if (process.platform === 'win32') {
      await execAsync(`start "" "${outputPath}"`, { timeout: 5000 }).catch(() => {});
    }

    logger.info({ path: outputPath, type: config.type }, 'Chart generated');
    return outputPath;
  }

  /**
   * Generate bar chart
   */
  async barChart(title: string, labels: string[], data: number[], label: string = 'Value'): Promise<string> {
    return this.generateChart({
      type: 'bar',
      title,
      labels,
      datasets: [{ label, data }],
    });
  }

  /**
   * Generate line chart
   */
  async lineChart(title: string, labels: string[], datasets: Array<{ label: string; data: number[] }>): Promise<string> {
    return this.generateChart({
      type: 'line',
      title,
      labels,
      datasets,
    });
  }

  /**
   * Generate pie chart
   */
  async pieChart(title: string, labels: string[], data: number[]): Promise<string> {
    const colors = [
      'rgba(255, 99, 132, 0.8)',
      'rgba(54, 162, 235, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(153, 102, 255, 0.8)',
      'rgba(255, 159, 64, 0.8)',
      'rgba(199, 199, 199, 0.8)',
      'rgba(83, 102, 255, 0.8)',
    ];

    return this.generateChart({
      type: 'pie',
      title,
      labels,
      datasets: [{ label: 'Value', data, color: undefined }],
    });
  }

  /**
   * Perform statistical analysis
   */
  analyzeStatistics(data: number[]): {
    count: number;
    sum: number;
    mean: number;
    median: number;
    mode: number[];
    min: number;
    max: number;
    range: number;
    variance: number;
    stdDev: number;
    q1: number;
    q3: number;
    iqr: number;
  } {
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    // Median
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // Mode
    const freq: Record<number, number> = {};
    sorted.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    const maxFreq = Math.max(...Object.values(freq));
    const mode = Object.entries(freq)
      .filter(([_, f]) => f === maxFreq)
      .map(([v]) => Number(v));

    // Variance & StdDev
    const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Quartiles
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;

    return {
      count: n,
      sum,
      mean,
      median,
      mode,
      min: sorted[0],
      max: sorted[n - 1],
      range: sorted[n - 1] - sorted[0],
      variance,
      stdDev,
      q1,
      q3,
      iqr,
    };
  }

  /**
   * Parse CSV string to structured data
   */
  parseCSV(csvString: string, delimiter: string = ','): { columns: string[]; rows: any[] } {
    const lines = csvString.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { columns: [], rows: [] };

    const columns = lines[0].split(delimiter).map(col => col.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(delimiter);
      const row: Record<string, string> = {};
      columns.forEach((col, i) => {
        row[col] = values[i]?.trim().replace(/^"|"$/g, '') || '';
      });
      return row;
    });

    return { columns, rows };
  }

  /**
   * Parse JSON to structured data
   */
  parseJSON(jsonString: string): { columns: string[]; rows: any[] } {
    const data = JSON.parse(jsonString);

    if (Array.isArray(data) && data.length > 0) {
      const columns = Object.keys(data[0]);
      return { columns, rows: data };
    }

    if (typeof data === 'object') {
      const columns = Object.keys(data);
      return { columns, rows: [data] };
    }

    return { columns: [], rows: [] };
  }
}
