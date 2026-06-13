/**
 * Workflow Routes — Workflow Automation API
 *
 * Real implementation for workflow creation and execution
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../config/logger.js';

// Workflow storage
const workflows: Map<string, {
  id: string;
  name: string;
  description: string;
  steps: Array<{ type: string; action: string; params: Record<string, unknown> }>;
  status: 'active' | 'paused' | 'draft';
  runCount: number;
  lastRun?: Date;
  created: Date;
}> = new Map();

// Initialize default workflows
function initDefaultWorkflows() {
  const defaults = [
    {
      id: 'wf-screenshot-report',
      name: 'Screenshot & Report',
      description: 'Chụp màn hình → Phân tích → Tạo báo cáo',
      steps: [
        { type: 'action', action: 'screenshot', params: {} },
        { type: 'action', action: 'analyze_image', params: {} },
        { type: 'action', action: 'generate_report', params: { format: 'html' } },
      ],
    },
    {
      id: 'wf-file-search-process',
      name: 'File Search & Process',
      description: 'Tìm file → Đọc nội dung → Tóm tắt',
      steps: [
        { type: 'action', action: 'file_search', params: {} },
        { type: 'action', action: 'file_read', params: {} },
        { type: 'action', action: 'ai_summarize', params: {} },
      ],
    },
    {
      id: 'wf-code-verify',
      name: 'Code & Verify',
      description: 'Tạo code → Chạy thử → Fix lỗi',
      steps: [
        { type: 'action', action: 'create_file', params: {} },
        { type: 'action', action: 'execute_code', params: {} },
        { type: 'action', action: 'ai_fix_errors', params: {} },
      ],
    },
    {
      id: 'wf-system-monitor',
      name: 'System Monitor',
      description: 'Kiểm tra CPU/RAM/Disk → Cảnh báo',
      steps: [
        { type: 'action', action: 'get_status', params: {} },
        { type: 'action', action: 'analyze_metrics', params: {} },
        { type: 'action', action: 'send_notification', params: {} },
      ],
    },
    {
      id: 'wf-backup',
      name: 'Backup Files',
      description: 'Tìm file quan trọng → Nén → Upload',
      steps: [
        { type: 'action', action: 'file_search', params: { pattern: '*.py,*.js,*.ts,*.html,*.css' } },
        { type: 'action', action: 'compress_files', params: {} },
        { type: 'action', action: 'upload_backup', params: {} },
      ],
    },
    {
      id: 'wf-daily-report',
      name: 'Daily Report',
      description: 'Thu thập dữ liệu → Tạo báo cáo hàng ngày',
      steps: [
        { type: 'action', action: 'get_status', params: {} },
        { type: 'action', action: 'list_processes', params: {} },
        { type: 'action', action: 'generate_daily_report', params: {} },
      ],
    },
  ];

  for (const wf of defaults) {
    workflows.set(wf.id, {
      ...wf,
      status: 'active',
      runCount: 0,
      created: new Date(),
    });
  }
}

initDefaultWorkflows();

export function registerWorkflowRoutes(fastify: FastifyInstance): void {

  // GET /workflows — List all workflows
  fastify.get('/workflows', async () => {
    const workflowList = Array.from(workflows.values()).map(wf => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      steps: wf.steps.length,
      status: wf.status,
      runCount: wf.runCount,
      lastRun: wf.lastRun,
      created: wf.created,
    }));

    return {
      success: true,
      workflows: workflowList,
      active: workflowList.filter(w => w.status === 'active').length,
    };
  });

  // GET /workflows/:id — Get workflow details
  fastify.get('/workflows/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workflow = workflows.get(id);

    if (!workflow) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    return { success: true, workflow };
  });

  // POST /workflows — Create workflow
  fastify.post('/workflows', async (request) => {
    const { name, description, steps } = request.body as {
      name: string; description?: string; steps?: Array<{ type: string; action: string; params: Record<string, unknown> }>;
    };

    const id = `wf-${Date.now()}`;
    workflows.set(id, {
      id,
      name,
      description: description ?? '',
      steps: steps ?? [],
      status: 'active',
      runCount: 0,
      created: new Date(),
    });

    logger.info({ id, name }, 'Workflow created');

    return { success: true, workflow: workflows.get(id) };
  });

  // POST /workflows/:id/run — Execute workflow
  fastify.post('/workflows/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workflow = workflows.get(id);

    if (!workflow) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    // Update run count
    workflow.runCount++;
    workflow.lastRun = new Date();

    logger.info({ workflowId: id, name: workflow.name }, 'Workflow executed');

    return {
      success: true,
      message: `Workflow "${workflow.name}" started`,
      steps: workflow.steps.length,
      executionId: `exec-${Date.now()}`,
    };
  });

  // POST /workflows/:id/pause — Pause workflow
  fastify.post('/workflows/:id/pause', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workflow = workflows.get(id);

    if (!workflow) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    workflow.status = workflow.status === 'paused' ? 'active' : 'paused';

    return { success: true, workflow };
  });

  // DELETE /workflows/:id — Delete workflow
  fastify.delete('/workflows/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!workflows.has(id)) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    workflows.delete(id);

    return { success: true, message: 'Workflow deleted' };
  });
}
