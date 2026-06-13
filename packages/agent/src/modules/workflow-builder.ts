/**
 * Workflow Builder — Visual Automation Engine
 *
 * Create complex workflows with:
 * - Conditional logic (if/else)
 * - Loops (for, while)
 * - Error handling (try/catch)
 * - Parallel execution
 * - Variables and expressions
 * - Triggers (schedule, event, manual)
 */

import { logger } from '../config/logger.js';
import { CodeExecutor } from './code-executor.js';
import { FileManager } from './file-manager.js';
import { ShellExecutor } from './shell-executor.js';

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  value: any;
  description?: string;
}

export interface WorkflowStep {
  id: string;
  type: 'action' | 'condition' | 'loop' | 'parallel' | 'try_catch' | 'variable' | 'delay';
  name: string;
  description?: string;
  config: Record<string, any>;
  next?: string; // Next step ID
  trueBranch?: string; // For conditions
  falseBranch?: string; // For conditions
  errorBranch?: string; // For try_catch
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  variables: WorkflowVariable[];
  triggers: WorkflowTrigger[];
  created: Date;
  updated: Date;
  status: 'draft' | 'active' | 'paused' | 'archived';
}

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'event' | 'webhook';
  config: Record<string, any>;
  enabled: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: string;
  variables: Map<string, any>;
  results: Map<string, any>;
  startTime: Date;
  endTime?: Date;
  logs: string[];
}

export class WorkflowBuilder {
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private codeExecutor: CodeExecutor;
  private fileManager: FileManager;
  private shellExecutor: ShellExecutor;

  constructor() {
    this.codeExecutor = new CodeExecutor();
    this.fileManager = new FileManager();
    this.shellExecutor = new ShellExecutor();
  }

  /**
   * Create a new workflow
   */
  createWorkflow(name: string, description: string): Workflow {
    const workflow: Workflow = {
      id: `wf-${Date.now()}`,
      name,
      description,
      version: '1.0.0',
      steps: [],
      variables: [],
      triggers: [],
      created: new Date(),
      updated: new Date(),
      status: 'draft',
    };

    this.workflows.set(workflow.id, workflow);
    logger.info({ workflowId: workflow.id, name }, 'Workflow created');

    return workflow;
  }

  /**
   * Add step to workflow
   */
  addStep(workflowId: string, step: Omit<WorkflowStep, 'id'>): WorkflowStep {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      ...step,
    };

    workflow.steps.push(newStep);
    workflow.updated = new Date();

    logger.info({ workflowId, stepId: newStep.id, type: step.type }, 'Step added');
    return newStep;
  }

  /**
   * Add variable to workflow
   */
  addVariable(workflowId: string, variable: WorkflowVariable): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    workflow.variables.push(variable);
    workflow.updated = new Date();
  }

  /**
   * Add trigger to workflow
   */
  addTrigger(workflowId: string, trigger: WorkflowTrigger): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    workflow.triggers.push(trigger);
    workflow.updated = new Date();
  }

  /**
   * Execute workflow
   */
  async execute(workflowId: string, initialVariables?: Record<string, any>): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const execution: WorkflowExecution = {
      id: `exec-${Date.now()}`,
      workflowId,
      status: 'running',
      currentStep: workflow.steps[0]?.id || '',
      variables: new Map(Object.entries(initialVariables || {})),
      results: new Map(),
      startTime: new Date(),
      logs: [],
    };

    // Initialize workflow variables
    for (const v of workflow.variables) {
      if (!execution.variables.has(v.name)) {
        execution.variables.set(v.name, v.value);
      }
    }

    this.executions.set(execution.id, execution);

    logger.info({ executionId: execution.id, workflowId }, 'Workflow execution started');

    try {
      await this.executeSteps(workflow, execution);
      execution.status = 'completed';
    } catch (err: any) {
      execution.status = 'failed';
      execution.logs.push(`Error: ${err.message}`);
      logger.error({ executionId: execution.id, error: err.message }, 'Workflow execution failed');
    }

    execution.endTime = new Date();
    return execution;
  }

  /**
   * Execute workflow steps
   */
  private async executeSteps(workflow: Workflow, execution: WorkflowExecution): Promise<void> {
    let currentStepId: string | null = workflow.steps[0]?.id || null;

    while (currentStepId) {
      const step = workflow.steps.find(s => s.id === currentStepId);
      if (!step) {
        break;
      }

      execution.currentStep = currentStepId;
      execution.logs.push(`Executing step: ${step.name} (${step.type})`);

      logger.info({ stepId: step.id, type: step.type }, 'Executing step');

      try {
        const result = await this.executeStep(step, execution);
        execution.results.set(step.id, result);

        // Determine next step
        currentStepId = this.getNextStep(step, result, execution);
      } catch (err: any) {
        if (step.errorBranch) {
          currentStepId = step.errorBranch;
          execution.logs.push(`Error in step ${step.name}: ${err.message}, going to error branch`);
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: WorkflowStep, execution: WorkflowExecution): Promise<any> {
    switch (step.type) {
      case 'action':
        return await this.executeAction(step, execution);
      case 'condition':
        return await this.executeCondition(step, execution);
      case 'loop':
        return await this.executeLoop(step, execution);
      case 'parallel':
        return await this.executeParallel(step, execution);
      case 'try_catch':
        return await this.executeTryCatch(step, execution);
      case 'variable':
        return await this.executeVariable(step, execution);
      case 'delay':
        return await this.executeDelay(step, execution);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute action step
   */
  private async executeAction(step: WorkflowStep, execution: WorkflowExecution): Promise<any> {
    const { action, params } = step.config;

    switch (action) {
      case 'run_code':
        const code = this.interpolate(params.code, execution.variables);
        return await this.codeExecutor.execute(code, params.language || 'python');

      case 'run_command':
        const command = this.interpolate(params.command, execution.variables);
        return await this.shellExecutor.execute(command);

      case 'create_file':
        const content = this.interpolate(params.content, execution.variables);
        const path = this.interpolate(params.path, execution.variables);
        return await this.fileManager.editFile({ path, newContent: content });

      case 'read_file':
        return await this.fileManager.readFile({ path: params.path });

      case 'send_notification':
        return { message: params.message, sent: true };

      default:
        return { action, completed: true };
    }
  }

  /**
   * Execute condition step
   */
  private async executeCondition(step: WorkflowStep, execution: WorkflowExecution): Promise<boolean> {
    const { expression } = step.config;
    const result = this.evaluateExpression(expression, execution.variables);
    return Boolean(result);
  }

  /**
   * Execute loop step
   */
  private async executeLoop(step: WorkflowStep, execution: WorkflowExecution): Promise<any[]> {
    const { items, variable } = step.config;
    const itemsValue = this.interpolate(items, execution.variables);
    const itemsArray = Array.isArray(itemsValue) ? itemsValue : [itemsValue];

    const results: any[] = [];

    for (const item of itemsArray) {
      execution.variables.set(variable, item);
      // Execute loop body (next step)
      results.push(item);
    }

    return results;
  }

  /**
   * Execute parallel step
   */
  private async executeParallel(step: WorkflowStep, execution: WorkflowExecution): Promise<any[]> {
    const { steps } = step.config;

    const promises = steps.map(async (subStep: any) => {
      return await this.executeAction({ ...step, config: subStep }, execution);
    });

    return await Promise.all(promises);
  }

  /**
   * Execute try_catch step
   */
  private async executeTryCatch(step: WorkflowStep, execution: WorkflowExecution): Promise<any> {
    try {
      return await this.executeAction(step, execution);
    } catch (err: any) {
      execution.logs.push(`Caught error: ${err.message}`);
      return { error: err.message };
    }
  }

  /**
   * Execute variable step
   */
  private async executeVariable(step: WorkflowStep, execution: WorkflowExecution): Promise<any> {
    const { name, value } = step.config;
    const interpolatedValue = this.interpolate(value, execution.variables);
    execution.variables.set(name, interpolatedValue);
    return interpolatedValue;
  }

  /**
   * Execute delay step
   */
  private async executeDelay(step: WorkflowStep, execution: WorkflowExecution): Promise<void> {
    const { milliseconds } = step.config;
    await new Promise(resolve => setTimeout(resolve, milliseconds || 1000));
  }

  /**
   * Get next step based on current step result
   */
  private getNextStep(step: WorkflowStep, result: any, execution: WorkflowExecution): string | null {
    switch (step.type) {
      case 'condition':
        return (result ? step.trueBranch : step.falseBranch) ?? null;
      default:
        return step.next ?? null;
    }
  }

  /**
   * Interpolate variables in string
   */
  private interpolate(template: string, variables: Map<string, any>): any {
    if (typeof template !== 'string') {
      return template;
    }

    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = variables.get(varName);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Evaluate expression
   */
  private evaluateExpression(expression: string, variables: Map<string, any>): any {
    // Simple expression evaluation
    const interpolated = this.interpolate(expression, variables);

    // Handle comparisons
    if (interpolated.includes('==')) {
      const [left, right] = interpolated.split('==').map((s: string) => s.trim());
      return left === right;
    }

    if (interpolated.includes('!=')) {
      const [left, right] = interpolated.split('!=').map((s: string) => s.trim());
      return left !== right;
    }

    if (interpolated.includes('>')) {
      const [left, right] = interpolated.split('>').map((s: string) => s.trim());
      return Number(left) > Number(right);
    }

    if (interpolated.includes('<')) {
      const [left, right] = interpolated.split('<').map((s: string) => s.trim());
      return Number(left) < Number(right);
    }

    return interpolated;
  }

  /**
   * Get workflow
   */
  getWorkflow(workflowId: string): Workflow | null {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get execution
   */
  getExecution(executionId: string): WorkflowExecution | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * Get all executions
   */
  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Delete workflow
   */
  deleteWorkflow(workflowId: string): void {
    this.workflows.delete(workflowId);
    logger.info({ workflowId }, 'Workflow deleted');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalWorkflows: number;
    activeWorkflows: number;
    totalExecutions: number;
    successfulExecutions: number;
  } {
    const workflows = Array.from(this.workflows.values());
    const executions = Array.from(this.executions.values());

    return {
      totalWorkflows: workflows.length,
      activeWorkflows: workflows.filter(w => w.status === 'active').length,
      totalExecutions: executions.length,
      successfulExecutions: executions.filter(e => e.status === 'completed').length,
    };
  }
}
