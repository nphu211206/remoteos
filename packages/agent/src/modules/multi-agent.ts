/**
 * Multi-Agent System
 *
 * Orchestrator that coordinates multiple specialized agents:
 * - Code Agent: Code generation, debugging, refactoring
 * - Data Agent: Data analysis, charts, reports
 * - Web Agent: Browser automation, web scraping
 * - File Agent: File operations, document processing
 * - System Agent: System monitoring, process management
 * - UI Agent: Screen understanding, desktop automation
 */

import { logger } from '../config/logger.js';
import { CodeExecutor } from './code-executor.js';
import { DataPipeline } from './data-pipeline.js';
import { ReportGenerator } from './report-generator.js';
import { BrowserEngine } from './browser-engine.js';
import { FileManager } from './file-manager.js';
import { ScreenUnderstanding } from './screen-understanding.js';
import { DesktopAutomation } from './desktop-automation.js';
import { SystemMonitor } from './system-monitor.js';

export interface AgentTask {
  id: string;
  type: 'code' | 'data' | 'web' | 'file' | 'system' | 'ui';
  description: string;
  params: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies?: string[];
}

export interface AgentResult {
  taskId: string;
  agentType: string;
  success: boolean;
  output: any;
  error?: string;
  executionTimeMs: number;
}

export interface WorkflowStep {
  agent: string;
  task: string;
  params: Record<string, unknown>;
  dependsOn?: string[];
}

export class OrchestratorAgent {
  private agents: Map<string, any> = new Map();
  private taskQueue: AgentTask[] = [];
  private results: Map<string, AgentResult> = new Map();

  constructor() {
    this.initializeAgents();
  }

  /**
   * Initialize all specialized agents
   */
  private initializeAgents(): void {
    this.agents.set('code', new CodeExecutor());
    this.agents.set('data', new DataPipeline());
    this.agents.set('report', new ReportGenerator());
    this.agents.set('browser', new BrowserEngine());
    this.agents.set('file', new FileManager());
    this.agents.set('screen', new ScreenUnderstanding());
    this.agents.set('desktop', new DesktopAutomation());
    this.agents.set('system', new SystemMonitor());

    logger.info('Multi-agent system initialized with 8 agents');
  }

  /**
   * Process complex request using multiple agents
   */
  async processRequest(request: string): Promise<AgentResult[]> {
    logger.info({ request }, 'Processing complex request');

    // 1. Analyze request and create tasks
    const tasks = await this.analyzeRequest(request);

    // 2. Execute tasks (parallel where possible)
    const results = await this.executeTasks(tasks);

    // 3. Merge and return results
    return results;
  }

  /**
   * Analyze request and create execution plan
   */
  private async analyzeRequest(request: string): Promise<AgentTask[]> {
    const tasks: AgentTask[] = [];
    const lower = request.toLowerCase();

    // Detect code generation
    if (lower.includes('code') || lower.includes('script') || lower.includes('program')) {
      tasks.push({
        id: 'code-1',
        type: 'code',
        description: 'Generate code based on request',
        params: { request },
        priority: 'high',
      });
    }

    // Detect data analysis
    if (lower.includes('data') || lower.includes('analyze') || lower.includes('chart')) {
      tasks.push({
        id: 'data-1',
        type: 'data',
        description: 'Analyze data and create visualizations',
        params: { request },
        priority: 'medium',
      });
    }

    // Detect web automation
    if (lower.includes('website') || lower.includes('browse') || lower.includes('scrape')) {
      tasks.push({
        id: 'web-1',
        type: 'web',
        description: 'Automate web tasks',
        params: { request },
        priority: 'medium',
      });
    }

    // Detect file operations
    if (lower.includes('file') || lower.includes('document') || lower.includes('report')) {
      tasks.push({
        id: 'file-1',
        type: 'file',
        description: 'Process files and documents',
        params: { request },
        priority: 'medium',
      });
    }

    // Detect system operations
    if (lower.includes('system') || lower.includes('process') || lower.includes('monitor')) {
      tasks.push({
        id: 'system-1',
        type: 'system',
        description: 'Monitor and manage system',
        params: { request },
        priority: 'low',
      });
    }

    // Detect UI automation
    if (lower.includes('click') || lower.includes('screen') || lower.includes('automate')) {
      tasks.push({
        id: 'ui-1',
        type: 'ui',
        description: 'Automate UI interactions',
        params: { request },
        priority: 'high',
      });
    }

    // Default: comprehensive analysis
    if (tasks.length === 0) {
      tasks.push({
        id: 'comprehensive-1',
        type: 'code',
        description: 'Comprehensive analysis and solution',
        params: { request },
        priority: 'high',
      });
    }

    return tasks;
  }

  /**
   * Execute tasks with parallel processing
   */
  async executeTasks(tasks: AgentTask[]): Promise<AgentResult[]> {
    const results: AgentResult[] = [];

    // Group tasks by priority
    const criticalTasks = tasks.filter(t => t.priority === 'critical');
    const highTasks = tasks.filter(t => t.priority === 'high');
    const mediumTasks = tasks.filter(t => t.priority === 'medium');
    const lowTasks = tasks.filter(t => t.priority === 'low');

    // Execute in priority order
    const allTasks = [...criticalTasks, ...highTasks, ...mediumTasks, ...lowTasks];

    // Find tasks that can run in parallel (no dependencies)
    const parallelTasks = allTasks.filter(t => !t.dependencies || t.dependencies.length === 0);
    const dependentTasks = allTasks.filter(t => t.dependencies && t.dependencies.length > 0);

    // Execute parallel tasks concurrently
    const parallelResults = await Promise.allSettled(
      parallelTasks.map(task => this.executeTask(task))
    );

    for (const result of parallelResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logger.error({ error: result.reason }, 'Parallel task failed');
      }
    }

    // Execute dependent tasks sequentially
    for (const task of dependentTasks) {
      try {
        const result = await this.executeTask(task);
        results.push(result);
      } catch (err: any) {
        logger.error({ err: err.message, taskId: task.id }, 'Dependent task failed');
      }
    }

    return results;
  }

  /**
   * Execute single task
   */
  private async executeTask(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const agent = this.agents.get(task.type);
      if (!agent) {
        throw new Error(`No agent found for type: ${task.type}`);
      }

      let output: any;

      switch (task.type) {
        case 'code':
          output = await this.executeCodeTask(agent, task);
          break;
        case 'data':
          output = await this.executeDataTask(agent, task);
          break;
        case 'web':
          output = await this.executeWebTask(agent, task);
          break;
        case 'file':
          output = await this.executeFileTask(agent, task);
          break;
        case 'system':
          output = await this.executeSystemTask(agent, task);
          break;
        case 'ui':
          output = await this.executeUITask(agent, task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      const result: AgentResult = {
        taskId: task.id,
        agentType: task.type,
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
      };

      this.results.set(task.id, result);
      return result;

    } catch (err: any) {
      const result: AgentResult = {
        taskId: task.id,
        agentType: task.type,
        success: false,
        output: null,
        error: err.message,
        executionTimeMs: Date.now() - startTime,
      };

      this.results.set(task.id, result);
      return result;
    }
  }

  /**
   * Execute code generation task
   */
  private async executeCodeTask(agent: CodeExecutor, task: AgentTask): Promise<any> {
    const { request } = task.params;

    // Generate code based on request
    const code = this.generateCodeFromRequest(request as string);
    const language = this.detectLanguage(request as string);

    return await agent.execute(code, language);
  }

  /**
   * Execute data analysis task
   */
  private async executeDataTask(agent: DataPipeline, task: AgentTask): Promise<any> {
    const { request } = task.params;

    // Create sample data for demonstration
    const data = {
      columns: ['Category', 'Value', 'Growth'],
      rows: [
        ['Technology', 150, 12.5],
        ['Healthcare', 120, 8.3],
        ['Finance', 180, 15.2],
        ['Education', 90, 6.7],
      ],
    };

    // Generate chart
    const chartPath = await agent.barChart(
      'Data Analysis',
      data.rows.map(r => r[0] as string),
      data.rows.map(r => r[1] as number)
    );

    return { data, chartPath };
  }

  /**
   * Execute web automation task
   */
  private async executeWebTask(agent: BrowserEngine, task: AgentTask): Promise<any> {
    const { request } = task.params;

    // Extract URL from request
    const urlMatch = (request as string).match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : 'https://example.com';

    await agent.goto(url);
    const pageInfo = await agent.getPageInfo();
    const screenshot = await agent.screenshot();

    return { pageInfo, screenshot };
  }

  /**
   * Execute file operation task
   */
  private async executeFileTask(agent: FileManager, task: AgentTask): Promise<any> {
    const { request } = task.params;

    // List files in current directory
    const files = await agent.listFiles({ path: '.' });

    return files;
  }

  /**
   * Execute system monitoring task
   */
  private async executeSystemTask(agent: SystemMonitor, task: AgentTask): Promise<any> {
    const state = await agent.collectState('self');
    const info = await agent.collectSystemInfo();

    return { state, info };
  }

  /**
   * Execute UI automation task
   */
  private async executeUITask(agent: ScreenUnderstanding, task: AgentTask): Promise<any> {
    const summary = await agent.getScreenSummary();
    const elements = await agent.detectElements();

    return { summary, elementCount: elements.length };
  }

  /**
   * Generate code from natural language request
   */
  private generateCodeFromRequest(request: string): string {
    const lower = request.toLowerCase();

    if (lower.includes('hello') || lower.includes('xin chào')) {
      return 'print("Hello, World!")';
    }

    if (lower.includes('fibonacci')) {
      return `
def fibonacci(n):
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

print(fibonacci(10))
`;
    }

    if (lower.includes('sort') || lower.includes('sắp xếp')) {
      return `
data = [5, 2, 8, 1, 9, 3, 7, 4, 6]
sorted_data = sorted(data)
print(f"Original: {data}")
print(f"Sorted: {sorted_data}")
`;
    }

    return `# Generated code for: ${request}
print("Executing request...")
`;
  }

  /**
   * Detect programming language from request
   */
  private detectLanguage(request: string): string {
    const lower = request.toLowerCase();

    if (lower.includes('python') || lower.includes('py')) return 'python';
    if (lower.includes('javascript') || lower.includes('js')) return 'javascript';
    if (lower.includes('typescript') || lower.includes('ts')) return 'typescript';
    if (lower.includes('java')) return 'java';
    if (lower.includes('c++') || lower.includes('cpp')) return 'cpp';
    if (lower.includes('c#') || lower.includes('csharp')) return 'csharp';
    if (lower.includes('go')) return 'go';
    if (lower.includes('rust')) return 'rust';
    if (lower.includes('ruby')) return 'ruby';
    if (lower.includes('php')) return 'php';
    if (lower.includes('shell') || lower.includes('bash')) return 'shell';

    return 'python'; // Default
  }

  /**
   * Get result by task ID
   */
  getResult(taskId: string): AgentResult | undefined {
    return this.results.get(taskId);
  }

  /**
   * Get all results
   */
  getAllResults(): AgentResult[] {
    return Array.from(this.results.values());
  }

  /**
   * Clear results
   */
  clearResults(): void {
    this.results.clear();
  }
}
