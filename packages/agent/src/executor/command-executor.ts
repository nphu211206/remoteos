/**
 * Command Executor — Central Command Router
 *
 * Routes commands to the appropriate handler module.
 * Each command type has a dedicated handler for clean separation.
 *
 * Supported commands:
 * - System: status, system_info, lock_screen, sleep, hibernate
 * - Processes: process_list, process_kill
 * - Screen: screenshot
 * - Files: file_download, file_list, file_delete, file_search, file_info, file_read, file_edit
 * - Editor: open_editor
 * - Shell: shell
 * - Control: set_volume, get_clipboard, set_clipboard
 * - Notifications: notify
 * - Advanced: screen_vision, desktop_automation, browser, code_execution, data, reports
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Command, CommandOutput } from '@remoteos/shared';
import { logger } from '../config/logger.js';
import { SystemMonitor } from '../modules/system-monitor.js';
import { ProcessManager } from '../modules/process-manager.js';
import { ScreenshotManager } from '../modules/screenshot-manager.js';
import { FileManager } from '../modules/file-manager.js';
import { ShellExecutor } from '../modules/shell-executor.js';
import { NotificationManager } from '../modules/notification-manager.js';
import { VolumeController, ClipboardManager, ScreenLocker } from '../modules/system-control.js';
import { AppLauncher } from '../modules/app-launcher.js';
import { EditorLauncher } from '../modules/editor-launcher.js';
import { ScreenVision } from '../modules/screen-vision.js';
import { DesktopAutomation } from '../modules/desktop-automation.js';
import { BrowserAutomation } from '../modules/browser-automation.js';
import { FileProcessor } from '../modules/file-processor.js';
import { MemorySystem } from '../modules/memory-system.js';
import { ProactiveAI } from '../modules/proactive-ai.js';
import { CodeExecutor } from '../modules/code-executor.js';
import { DataPipeline } from '../modules/data-pipeline.js';
import { ReportGenerator } from '../modules/report-generator.js';
import { AIPlanner } from '../modules/ai-planner.js';
import { OrchestratorAgent } from '../modules/multi-agent.js';
import { SelfLearningSystem } from '../modules/self-learning.js';
import { WorkflowBuilder } from '../modules/workflow-builder.js';
import { RAGSystem } from '../modules/rag-system.js';
import { SecurityLayer } from '../modules/security-layer.js';
import { AdvancedAnalytics } from '../modules/advanced-analytics.js';
import { PluginSystem } from '../modules/plugin-system.js';
import { IntegrationHub } from '../modules/integration-hub.js';
import { EnterpriseSystem } from '../modules/enterprise.js';
import { BrowserEngine } from '../modules/browser-engine.js';
import { config } from '../config/index.js';

export class CommandExecutor {
  // Lazy-loaded module instances
  private _monitor?: SystemMonitor;
  private _processManager?: ProcessManager;
  private _screenshotManager?: ScreenshotManager;
  private _fileManager?: FileManager;
  private _shellExecutor?: ShellExecutor;
  private _notificationManager?: NotificationManager;
  private _volumeController?: VolumeController;
  private _clipboardManager?: ClipboardManager;
  private _screenLocker?: ScreenLocker;
  private _appLauncher?: AppLauncher;
  private _editorLauncher?: EditorLauncher;
  private _screenVision?: ScreenVision;
  private _desktopAutomation?: DesktopAutomation;
  private _browserAutomation?: BrowserAutomation;
  private _fileProcessor?: FileProcessor;
  private _memorySystem?: MemorySystem;
  private _proactiveAI?: ProactiveAI;
  private _codeExecutor?: CodeExecutor;
  private _dataPipeline?: DataPipeline;
  private _reportGenerator?: ReportGenerator;

  // Lazy getters — instantiate on first use
  private get monitor(): SystemMonitor {
    if (!this._monitor) this._monitor = new SystemMonitor();
    return this._monitor;
  }

  private get processManager(): ProcessManager {
    if (!this._processManager) this._processManager = new ProcessManager();
    return this._processManager;
  }

  private get screenshotManager(): ScreenshotManager {
    if (!this._screenshotManager) this._screenshotManager = new ScreenshotManager();
    return this._screenshotManager;
  }

  private get fileManager(): FileManager {
    if (!this._fileManager) this._fileManager = new FileManager();
    return this._fileManager;
  }

  private get shellExecutor(): ShellExecutor {
    if (!this._shellExecutor) this._shellExecutor = new ShellExecutor();
    return this._shellExecutor;
  }

  private get notificationManager(): NotificationManager {
    if (!this._notificationManager) this._notificationManager = new NotificationManager();
    return this._notificationManager;
  }

  private get volumeController(): VolumeController {
    if (!this._volumeController) this._volumeController = new VolumeController();
    return this._volumeController;
  }

  private get clipboardManager(): ClipboardManager {
    if (!this._clipboardManager) this._clipboardManager = new ClipboardManager();
    return this._clipboardManager;
  }

  private get screenLocker(): ScreenLocker {
    if (!this._screenLocker) this._screenLocker = new ScreenLocker();
    return this._screenLocker;
  }

  private get appLauncher(): AppLauncher {
    if (!this._appLauncher) this._appLauncher = new AppLauncher();
    return this._appLauncher;
  }

  private get editorLauncher(): EditorLauncher {
    if (!this._editorLauncher) this._editorLauncher = new EditorLauncher();
    return this._editorLauncher;
  }

  private get screenVision(): ScreenVision {
    if (!this._screenVision) this._screenVision = new ScreenVision();
    return this._screenVision;
  }

  private get desktopAutomation(): DesktopAutomation {
    if (!this._desktopAutomation) this._desktopAutomation = new DesktopAutomation();
    return this._desktopAutomation;
  }

  private get browserAutomation(): BrowserAutomation {
    if (!this._browserAutomation) this._browserAutomation = new BrowserAutomation();
    return this._browserAutomation;
  }

  private get fileProcessor(): FileProcessor {
    if (!this._fileProcessor) this._fileProcessor = new FileProcessor();
    return this._fileProcessor;
  }

  private get memorySystem(): MemorySystem {
    if (!this._memorySystem) this._memorySystem = new MemorySystem();
    return this._memorySystem;
  }

  private get proactiveAI(): ProactiveAI {
    if (!this._proactiveAI) this._proactiveAI = new ProactiveAI();
    return this._proactiveAI;
  }

  private get codeExecutor(): CodeExecutor {
    if (!this._codeExecutor) this._codeExecutor = new CodeExecutor();
    return this._codeExecutor;
  }

  private get dataPipeline(): DataPipeline {
    if (!this._dataPipeline) this._dataPipeline = new DataPipeline();
    return this._dataPipeline;
  }

  private get reportGenerator(): ReportGenerator {
    if (!this._reportGenerator) this._reportGenerator = new ReportGenerator();
    return this._reportGenerator;
  }

  // ─── New Modules (Phase 1: Wire Up Dead Modules) ──────────────

  private _aiPlanner?: AIPlanner;
  private _multiAgent?: OrchestratorAgent;
  private _selfLearning?: SelfLearningSystem;

  private get aiPlanner(): AIPlanner {
    if (!this._aiPlanner) this._aiPlanner = new AIPlanner();
    return this._aiPlanner;
  }

  private get multiAgent(): OrchestratorAgent {
    if (!this._multiAgent) this._multiAgent = new OrchestratorAgent();
    return this._multiAgent;
  }

  private get selfLearning(): SelfLearningSystem {
    if (!this._selfLearning) this._selfLearning = new SelfLearningSystem();
    return this._selfLearning;
  }

  // ─── Additional Modules (Phase 2: Wire Up More Modules) ─────

  private _workflowBuilder?: WorkflowBuilder;
  private _ragSystem?: RAGSystem;
  private _securityLayer?: SecurityLayer;
  private _advancedAnalytics?: AdvancedAnalytics;

  private get workflowBuilder(): WorkflowBuilder {
    if (!this._workflowBuilder) this._workflowBuilder = new WorkflowBuilder();
    return this._workflowBuilder;
  }

  private get ragSystem(): RAGSystem {
    if (!this._ragSystem) this._ragSystem = new RAGSystem();
    return this._ragSystem;
  }

  private get securityLayer(): SecurityLayer {
    if (!this._securityLayer) this._securityLayer = new SecurityLayer();
    return this._securityLayer;
  }

  private get advancedAnalytics(): AdvancedAnalytics {
    if (!this._advancedAnalytics) this._advancedAnalytics = new AdvancedAnalytics();
    return this._advancedAnalytics;
  }

  private _pluginSystem?: PluginSystem;

  private get pluginSystem(): PluginSystem {
    if (!this._pluginSystem) this._pluginSystem = new PluginSystem();
    return this._pluginSystem;
  }

  private _integrationHub?: IntegrationHub;

  private get integrationHub(): IntegrationHub {
    if (!this._integrationHub) this._integrationHub = new IntegrationHub();
    return this._integrationHub;
  }

  private _enterpriseSystem?: EnterpriseSystem;

  private get enterpriseSystem(): EnterpriseSystem {
    if (!this._enterpriseSystem) this._enterpriseSystem = new EnterpriseSystem();
    return this._enterpriseSystem;
  }

  private _browserEngine?: BrowserEngine;

  private get browserEngine(): BrowserEngine {
    if (!this._browserEngine) this._browserEngine = new BrowserEngine();
    return this._browserEngine;
  }

  /**
   * Execute a command and return the output
   */
  async execute(command: Command): Promise<CommandOutput> {
    const startTime = Date.now();
    logger.info({ type: command.type, id: command.id }, 'Executing command');

    let result: CommandOutput;
    let success = true;
    let error: string | undefined;

    try {
      result = await this.executeCommand(command);
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      // Self-learning: learn from every interaction
      try {
        await this.selfLearning.learnFromInteraction({
          userId: command.userId || 'default',
          input: command.type,
          output: success ? 'success' : error || 'unknown error',
          success,
        });
      } catch (learnErr) {
        logger.debug({ err: learnErr }, 'Self-learning update failed');
      }
    }

    return result!;
  }

  /**
   * Internal command execution (switch statement)
   */
  private async executeCommand(command: Command): Promise<CommandOutput> {
    switch (command.type) {
      // ─── System Monitoring ───────────────────────────────────
      case 'status':
        return this.executeStatus(command);
      case 'system_info':
        return this.executeSystemInfo(command);

      // ─── Process Management ──────────────────────────────────
      case 'process_list':
        return this.processManager.listProcesses();
      case 'process_kill': {
        const killResult = await this.processManager.killProcess(command.params);
        return { commandType: 'process_kill', ...killResult };
      }

      // ─── Screen ──────────────────────────────────────────────
      case 'screenshot':
        return this.executeScreenshot(command);

      // ─── File Operations ─────────────────────────────────────
      case 'file_download':
        return this.fileManager.downloadFile(command.params);
      case 'file_list':
        return this.fileManager.listFiles(command.params);
      case 'file_delete':
        return this.fileManager.deleteFile(command.params);
      case 'file_search':
        return this.fileManager.searchFiles(command.params);
      case 'file_info':
        return this.fileManager.getFileInfo(command.params);
      case 'file_read':
        return this.fileManager.readFile(command.params);
      case 'file_edit':
        return this.fileManager.editFile(command.params);

      // ─── Shell ───────────────────────────────────────────────
      case 'shell':
        return this.executeShell(command);

      // ─── Notifications ───────────────────────────────────────
      case 'notify':
        return this.notificationManager.notify(command.params);

      // ─── App Management ──────────────────────────────────────
      case 'app_launch':
        return this.executeAppLaunch(command);
      case 'app_close':
        return this.executeAppClose(command);
      case 'app_list':
        return this.executeAppList();

      // ─── System Control ──────────────────────────────────────
      case 'lock_screen':
        return this.executeLockScreen();
      case 'set_volume':
        return this.executeSetVolume(command);
      case 'get_clipboard':
        return this.executeGetClipboard();
      case 'set_clipboard':
        return this.executeSetClipboard(command);

      // ─── Editor ─────────────────────────────────────────────
      case 'open_editor':
        return this.editorLauncher.open({
          editor: command.params.editor as string | undefined,
          path: command.params.path as string,
          line: command.params.line as number | undefined,
        });

      // ─── Power ──────────────────────────────────────────────
      case 'sleep':
        return this.executeSleep(command.params);
      case 'hibernate':
        return this.executeHibernate();

      // ─── Screen Vision ──────────────────────────────────────
      case 'screen_vision':
        return this.executeScreenVision(command);

      // ─── Desktop Automation ─────────────────────────────────
      case 'desktop_click':
        return this.executeDesktopClick(command);
      case 'desktop_type':
        return this.executeDesktopType(command);
      case 'desktop_keys':
        return this.executeDesktopKeys(command);
      case 'desktop_drag':
        return this.executeDesktopDrag(command);
      case 'desktop_scroll':
        return this.executeDesktopScroll(command);

      // ─── Browser Automation ─────────────────────────────────
      case 'browser_open':
        return this.executeBrowserOpen(command);
      case 'browser_search':
        return this.executeBrowserSearch(command);
      case 'browser_navigate':
        return this.executeBrowserNavigate(command);

      // ─── File Processing ────────────────────────────────────
      case 'process_file':
        return this.executeProcessFile(command);
      case 'analyze_image':
        return this.executeAnalyzeImage(command);

      // ─── Memory ─────────────────────────────────────────────
      case 'memory_save':
        return this.executeMemorySave(command);
      case 'memory_load':
        return this.executeMemoryLoad(command);

      // ─── Proactive AI ───────────────────────────────────────
      case 'proactive_suggest':
        return this.executeProactiveSuggest();
      case 'daily_report':
        return this.executeDailyReport();

      // ─── Code Execution ─────────────────────────────────────
      case 'execute_code':
        return this.executeCode(command);
      case 'sql_query':
        return this.executeSqlQuery(command);
      case 'data_export':
        return this.executeDataExport(command);
      case 'generate_chart':
        return this.executeGenerateChart(command);
      case 'generate_report':
        return this.executeGenerateReport(command);

      // ─── AI Planner ────────────────────────────────────────────
      case 'plan_task':
        return this.executePlanTask(command);

      // ─── Multi-Agent ──────────────────────────────────────────
      case 'parallel_tasks':
        return this.executeParallelTasks(command);

      // ─── Workflow Builder ─────────────────────────────────────
      case 'workflow_create':
        return this.executeWorkflowCreate(command);
      case 'workflow_execute':
        return this.executeWorkflowExecute(command);

      // ─── RAG System ──────────────────────────────────────────
      case 'rag_query':
        return this.executeRagQuery(command);
      case 'rag_add_document':
        return this.executeRagAddDocument(command);

      // ─── Security Layer ──────────────────────────────────────
      case 'security_encrypt':
        return this.executeSecurityEncrypt(command);
      case 'security_decrypt':
        return this.executeSecurityDecrypt(command);

      // ─── Advanced Analytics ──────────────────────────────────
      case 'analytics_predict':
        return this.executeAnalyticsPredict(command);
      case 'analytics_anomaly':
        return this.executeAnalyticsAnomaly(command);

      // ─── Plugin System ──────────────────────────────────────
      case 'plugin_list':
        return this.executePluginList();
      case 'plugin_install':
        return this.executePluginInstall(command);
      case 'plugin_uninstall':
        return this.executePluginUninstall(command);

      // ─── Integration Hub ────────────────────────────────────
      case 'integration_github':
        return this.executeIntegrationGithub(command);

      // ─── Enterprise ─────────────────────────────────────────
      case 'enterprise_users':
        return this.executeEnterpriseUsers(command);
      case 'enterprise_teams':
        return this.executeEnterpriseTeams(command);

      // ─── Browser Engine ─────────────────────────────────────
      case 'browser_launch':
        return this.executeBrowserLaunch(command);
      case 'browser_goto':
        return this.executeBrowserGoto(command);
      case 'browser_click':
        return this.executeBrowserClick(command);
      case 'browser_type':
        return this.executeBrowserType(command);
      case 'browser_text':
        return this.executeBrowserText(command);
      case 'browser_screenshot':
        return this.executeBrowserScreenshot(command);

      // ─── Unknown ─────────────────────────────────────────────
      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }
  }

  // ─── System Monitoring ──────────────────────────────────────────

  private async executeStatus(_command: Command): Promise<CommandOutput> {
    const state = await this.monitor.collectState('self');
    const sysInfo = await this.monitor.collectSystemInfo();

    return {
      commandType: 'status',
      cpu: {
        usage: state.cpuUsage,
        model: sysInfo.cpuModel,
        cores: sysInfo.cpuCores,
        speed: sysInfo.cpuSpeed,
      },
      ram: {
        usedGb: Math.round((state.ramUsage / 100) * sysInfo.totalRamGb * 10) / 10,
        totalGb: sysInfo.totalRamGb,
        usagePercent: state.ramUsage,
      },
      disk: {
        usedGb: Math.round((state.diskUsage / 100) * sysInfo.totalDiskGb * 10) / 10,
        totalGb: sysInfo.totalDiskGb,
        usagePercent: state.diskUsage,
      },
      network: {
        downMbps: state.networkDownMbps,
        upMbps: state.networkUpMbps,
        latencyMs: 0,
      },
      uptime: {
        seconds: state.uptimeSeconds,
        formatted: formatUptime(state.uptimeSeconds),
      },
      processes: {
        total: state.processCount,
        top5: [],
      },
      battery: {
        percent: state.batteryPercent,
        isCharging: state.isCharging,
      },
      temperature: {
        cpu: state.cpuTemp,
        gpu: state.gpuTemp,
      },
    };
  }

  private async executeSystemInfo(_command: Command): Promise<CommandOutput> {
    const info = await this.monitor.collectSystemInfo();
    return {
      commandType: 'system_info',
      ...info,
    };
  }

  // ─── Screen ─────────────────────────────────────────────────────

  private async executeScreenshot(command: Command): Promise<CommandOutput> {
    if (!config.features.allowScreenshot) {
      throw new Error('Screenshot is disabled by configuration');
    }
    return this.screenshotManager.capture();
  }

  // ─── Shell ──────────────────────────────────────────────────────

  private async executeShell(command: Command): Promise<CommandOutput> {
    if (!config.features.allowShell) {
      throw new Error('Shell execution is disabled by configuration');
    }

    const shellCommand = command.params.command as string;
    if (!shellCommand) {
      throw new Error('Missing required parameter: command');
    }

    return this.shellExecutor.execute(shellCommand);
  }

  // ─── System Control ─────────────────────────────────────────────

  private async executeLockScreen(): Promise<CommandOutput> {
    await this.screenLocker.lockScreen();
    return {
      commandType: 'lock_screen',
      success: true,
      message: 'Screen locked',
    };
  }

  private async executeSetVolume(command: Command): Promise<CommandOutput> {
    const params = command.params;

    if (typeof params.level === 'number') {
      const result = await this.volumeController.setVolume(params.level as number);
      return {
        commandType: 'set_volume',
        ...result,
      };
    }

    if (params.action === 'up') {
      const result = await this.volumeController.volumeUp((params.step as number) ?? 10);
      return { commandType: 'set_volume', ...result };
    }

    if (params.action === 'down') {
      const result = await this.volumeController.volumeDown((params.step as number) ?? 10);
      return { commandType: 'set_volume', ...result };
    }

    if (params.action === 'mute') {
      const result = await this.volumeController.toggleMute();
      return { commandType: 'set_volume', ...result };
    }

    // Default: get current volume
    const result = await this.volumeController.getVolume();
    return { commandType: 'set_volume', ...result };
  }

  private async executeGetClipboard(): Promise<CommandOutput> {
    const content = await this.clipboardManager.getClipboard();
    return {
      commandType: 'get_clipboard',
      content,
      length: content.length,
    };
  }

  private async executeSetClipboard(command: Command): Promise<CommandOutput> {
    const text = command.params.text as string;
    if (!text) {
      throw new Error('Missing required parameter: text');
    }

    await this.clipboardManager.setClipboard(text);
    return {
      commandType: 'set_clipboard',
      success: true,
      length: text.length,
    };
  }

  // ─── App Management ─────────────────────────────────────────────

  private async executeAppLaunch(command: Command): Promise<CommandOutput> {
    const appName = command.params.name as string || command.params.app as string;
    if (!appName) {
      throw new Error('Missing required parameter: name');
    }

    const result = await this.appLauncher.launch(appName);
    return {
      commandType: 'app_launch',
      ...result,
      appName,
    };
  }

  private async executeAppClose(command: Command): Promise<CommandOutput> {
    const appName = command.params.name as string || command.params.app as string;
    if (!appName) {
      throw new Error('Missing required parameter: name');
    }

    const result = await this.appLauncher.close(appName);
    return {
      commandType: 'app_close',
      ...result,
      appName,
    };
  }

  private async executeAppList(): Promise<CommandOutput> {
    const apps = this.appLauncher.getAvailableApps();
    return {
      commandType: 'app_list',
      apps,
      total: apps.length,
    };
  }

  // ─── Power Management ─────────────────────────────────────────

  private async executeSleep(params: Record<string, unknown>): Promise<CommandOutput> {
    const minutes = (params.minutes as number) || 0;

    if (process.platform === 'win32') {
      // Windows: use rundll32 to suspend
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      await promisify(exec)('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
    } else if (process.platform === 'darwin') {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      await promisify(exec)('pmset sleepnow');
    } else {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      await promisify(exec)('systemctl suspend');
    }

    return {
      commandType: 'sleep',
      success: true,
      message: `Đã sleep máy${minutes > 0 ? ` sau ${minutes} phút` : ''}`,
    };
  }

  private async executeHibernate(): Promise<CommandOutput> {
    if (process.platform === 'win32') {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      await promisify(exec)('shutdown /h');
    } else if (process.platform === 'darwin') {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      await promisify(exec)('pmset hibernatemode 25 && pmset sleepnow');
    } else {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      await promisify(exec)('systemctl hibernate');
    }

    return {
      commandType: 'hibernate',
      success: true,
      message: 'Đã hibernate máy',
    };
  }

  // ─── Screen Vision ─────────────────────────────────────────────

  private async executeScreenVision(command: Command): Promise<CommandOutput> {
    const analysis = await this.screenVision.captureForAI();
    return {
      commandType: 'screen_vision',
      ...analysis,
    };
  }

  // ─── Desktop Automation ────────────────────────────────────────

  private async executeDesktopClick(command: Command): Promise<CommandOutput> {
    await this.desktopAutomation.click({
      x: command.params.x as number,
      y: command.params.y as number,
      button: (command.params.button as 'left' | 'right' | 'middle') || 'left',
      doubleClick: command.params.doubleClick as boolean,
    });
    return {
      commandType: 'desktop_click',
      success: true,
      x: command.params.x as number,
      y: command.params.y as number,
    };
  }

  private async executeDesktopType(command: Command): Promise<CommandOutput> {
    await this.desktopAutomation.type({
      text: command.params.text as string,
      delay: command.params.delay as number,
    });
    return {
      commandType: 'desktop_type',
      success: true,
      textLength: (command.params.text as string).length,
    };
  }

  private async executeDesktopKeys(command: Command): Promise<CommandOutput> {
    await this.desktopAutomation.pressKeys({
      keys: command.params.keys as string[],
    });
    return {
      commandType: 'desktop_keys',
      success: true,
      keys: command.params.keys as string[],
    };
  }

  private async executeDesktopDrag(command: Command): Promise<CommandOutput> {
    await this.desktopAutomation.drag(
      command.params.fromX as number,
      command.params.fromY as number,
      command.params.toX as number,
      command.params.toY as number,
    );
    return {
      commandType: 'desktop_drag',
      success: true,
    };
  }

  private async executeDesktopScroll(command: Command): Promise<CommandOutput> {
    await this.desktopAutomation.scroll(
      command.params.amount as number,
      (command.params.direction as 'up' | 'down') || 'down',
    );
    return {
      commandType: 'desktop_scroll',
      success: true,
    };
  }

  // ─── Browser Automation ────────────────────────────────────────

  private async executeBrowserOpen(command: Command): Promise<CommandOutput> {
    const url = command.params.url as string;
    const site = command.params.site as string;

    if (site) {
      await this.browserAutomation.openWebsite(site);
    } else if (url) {
      await this.browserAutomation.openUrl(url);
    }

    return {
      commandType: 'browser_open',
      success: true,
      url: url || site,
    };
  }

  private async executeBrowserSearch(command: Command): Promise<CommandOutput> {
    const query = command.params.query as string;
    const engine = (command.params.engine as string) || 'google';

    if (engine === 'youtube') {
      await this.browserAutomation.searchYouTube(query);
    } else {
      await this.browserAutomation.searchGoogle(query);
    }

    return {
      commandType: 'browser_search',
      success: true,
      query,
      engine,
    };
  }

  private async executeBrowserNavigate(command: Command): Promise<CommandOutput> {
    const action = command.params.action as string;

    switch (action) {
      case 'back':
        await this.browserAutomation.goBack();
        break;
      case 'forward':
        await this.browserAutomation.goForward();
        break;
      case 'refresh':
        await this.browserAutomation.refresh();
        break;
      case 'newtab':
        await this.browserAutomation.newTab();
        break;
      case 'closetab':
        await this.browserAutomation.closeTab();
        break;
      case 'devtools':
        await this.browserAutomation.openDevTools();
        break;
    }

    return {
      commandType: 'browser_navigate',
      success: true,
      action,
    };
  }

  // ─── File Processing ───────────────────────────────────────────

  private async executeProcessFile(command: Command): Promise<CommandOutput> {
    const result = await this.fileProcessor.processFile(command.params.path as string);
    return {
      commandType: 'process_file',
      ...result,
    };
  }

  private async executeAnalyzeImage(command: Command): Promise<CommandOutput> {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const result = await this.fileProcessor.analyzeImage(
      command.params.path as string,
      (command.params.prompt as string) || 'Describe this image in detail.',
      apiKey,
    );
    return {
      commandType: 'analyze_image',
      analysis: result,
    };
  }

  // ─── Memory ────────────────────────────────────────────────────

  private async executeMemorySave(command: Command): Promise<CommandOutput> {
    await this.memorySystem.updateContext(
      (command.params.userId as string) || 'default',
      command.params.key as string,
      command.params.value,
    );
    return {
      commandType: 'memory_save',
      success: true,
    };
  }

  private async executeMemoryLoad(command: Command): Promise<CommandOutput> {
    const value = await this.memorySystem.getContext(
      (command.params.userId as string) || 'default',
      command.params.key as string,
    );
    return {
      commandType: 'memory_load',
      value,
    };
  }

  // ─── Proactive AI ──────────────────────────────────────────────

  private async executeProactiveSuggest(): Promise<CommandOutput> {
    const suggestions = await this.proactiveAI.analyzeAndSuggest();
    return {
      commandType: 'proactive_suggest',
      suggestions,
    };
  }

  private async executeDailyReport(): Promise<CommandOutput> {
    const report = await this.proactiveAI.generateDailyReport();
    return {
      commandType: 'daily_report',
      report,
    };
  }

  // ─── Code Execution ────────────────────────────────────────────

  private async executeCode(command: Command): Promise<CommandOutput> {
    const code = command.params.code as string;
    const language = command.params.language as string;
    const args = command.params.args as string[] | undefined;

    if (!code) throw new Error('Missing required parameter: code');
    if (!language) throw new Error('Missing required parameter: language');

    const result = await this.codeExecutor.execute(code, language, args);
    return {
      commandType: 'execute_code',
      ...result,
    };
  }

  private async executeSqlQuery(command: Command): Promise<CommandOutput> {
    const dbPath = command.params.dbPath as string;
    const query = command.params.query as string;
    const dbType = (command.params.dbType as string) || 'sqlite';

    if (!query) throw new Error('Missing required parameter: query');

    let result;
    if (dbType === 'sqlite') {
      if (!dbPath) throw new Error('Missing required parameter: dbPath for SQLite');
      result = await this.dataPipeline.executeSqlite(dbPath, query);
    } else if (dbType === 'mysql') {
      result = await this.dataPipeline.executeMySQL(command.params.config as any, query);
    } else if (dbType === 'postgresql') {
      result = await this.dataPipeline.executePostgreSQL(command.params.config as any, query);
    } else {
      throw new Error(`Unsupported database type: ${dbType}`);
    }

    return {
      commandType: 'sql_query',
      ...result,
    };
  }

  private async executeDataExport(command: Command): Promise<CommandOutput> {
    const data = command.params.data as { columns: string[]; rows: any[] };
    const format = (command.params.format as string) || 'csv';
    const outputPath = command.params.outputPath as string;

    if (!data) throw new Error('Missing required parameter: data');

    let path;
    if (format === 'csv') {
      path = await this.dataPipeline.exportToCSV(data, outputPath || join(tmpdir(), 'export.csv'));
    } else if (format === 'json') {
      path = await this.dataPipeline.exportToJSON(data, outputPath || join(tmpdir(), 'export.json'));
    } else if (format === 'excel') {
      path = await this.dataPipeline.exportToExcel(data, outputPath || join(tmpdir(), 'export.xlsx'));
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }

    return {
      commandType: 'data_export',
      success: true,
      path,
      format,
      rowCount: data.rows.length,
    };
  }

  private async executeGenerateChart(command: Command): Promise<CommandOutput> {
    const chartType = command.params.type as string;
    const title = command.params.title as string;
    const labels = command.params.labels as string[];
    const data = command.params.data as number[];

    if (!title || !labels || !data) {
      throw new Error('Missing required parameters: title, labels, data');
    }

    let path;
    if (chartType === 'bar') {
      path = await this.dataPipeline.barChart(title, labels, data);
    } else if (chartType === 'line') {
      path = await this.dataPipeline.lineChart(title, labels, [{ label: 'Data', data }]);
    } else if (chartType === 'pie') {
      path = await this.dataPipeline.pieChart(title, labels, data);
    } else {
      throw new Error(`Unsupported chart type: ${chartType}`);
    }

    return {
      commandType: 'generate_chart',
      success: true,
      path,
      chartType,
    };
  }

  private async executeGenerateReport(command: Command): Promise<CommandOutput> {
    const reportConfig = command.params.config as any;

    if (!reportConfig) throw new Error('Missing required parameter: config');

    const path = await this.reportGenerator.generate(reportConfig);

    return {
      commandType: 'generate_report',
      success: true,
      path,
      format: reportConfig.format,
    };
  }

  // ─── AI Planner ────────────────────────────────────────────────

  private async executePlanTask(command: Command): Promise<CommandOutput> {
    const goal = command.params.goal as string;
    if (!goal) throw new Error('Missing required parameter: goal');

    const plan = await this.aiPlanner.createPlan(goal);
    const result = await this.aiPlanner.executePlan(plan.id);

    return {
      commandType: 'plan_task',
      success: result.success,
      plan: {
        id: plan.id,
        goal: plan.goal,
        taskCount: plan.tasks.length,
        status: plan.status,
      },
      results: result.results,
      errors: result.errors,
    };
  }

  // ─── Multi-Agent ───────────────────────────────────────────────

  private async executeParallelTasks(command: Command): Promise<CommandOutput> {
    const tasks = command.params.tasks as Array<{ type: string; description: string; params?: Record<string, unknown> }>;
    if (!tasks || !Array.isArray(tasks)) throw new Error('Missing required parameter: tasks');

    const results = await this.multiAgent.executeTasks(
      tasks.map((t, i) => ({
        id: `task-${i}`,
        type: t.type as 'code' | 'data' | 'web' | 'file' | 'system' | 'ui',
        description: t.description,
        params: t.params ?? {},
        priority: 'medium' as const,
      }))
    );

    return {
      commandType: 'parallel_tasks',
      success: results.every(r => r.success),
      results: results.map(r => ({
        taskId: r.taskId,
        agentType: r.agentType,
        success: r.success,
        output: r.output,
        error: r.error,
      })),
    };
  }

  // ─── Workflow Builder ──────────────────────────────────────

  private async executeWorkflowCreate(command: Command): Promise<CommandOutput> {
    const name = command.params.name as string;
    const description = command.params.description as string;
    if (!name) throw new Error('Missing required parameter: name');

    const workflow = this.workflowBuilder.createWorkflow(name, description || '');
    return {
      commandType: 'workflow_create',
      success: true,
      workflowId: workflow.id,
      name: workflow.name,
    };
  }

  private async executeWorkflowExecute(command: Command): Promise<CommandOutput> {
    const workflowId = command.params.workflowId as string;
    if (!workflowId) throw new Error('Missing required parameter: workflowId');

    const execution = await this.workflowBuilder.execute(workflowId);
    return {
      commandType: 'workflow_execute',
      success: execution.status === 'completed',
      executionId: execution.id,
      status: execution.status,
    };
  }

  // ─── RAG System ───────────────────────────────────────────

  private async executeRagQuery(command: Command): Promise<CommandOutput> {
    const query = command.params.query as string;
    const kbId = (command.params.kbId as string) || 'default';
    if (!query) throw new Error('Missing required parameter: query');

    const results = await this.ragSystem.searchAll(query);
    return {
      commandType: 'rag_query',
      success: true,
      query,
      results: results.map(r => ({
        content: r.relevantChunk.slice(0, 500),
        score: r.score,
        source: r.document.metadata?.source,
      })),
    };
  }

  private async executeRagAddDocument(command: Command): Promise<CommandOutput> {
    const content = command.params.content as string;
    const source = command.params.source as string;
    const kbId = (command.params.kbId as string) || 'default';
    if (!content) throw new Error('Missing required parameter: content');

    await this.ragSystem.addDocument(kbId, { content, title: source || 'Document', type: 'txt' as const });
    return {
      commandType: 'rag_add_document',
      success: true,
      source,
    };
  }

  // ─── Security Layer ───────────────────────────────────────

  private async executeSecurityEncrypt(command: Command): Promise<CommandOutput> {
    const data = command.params.data as string;
    const key = command.params.key as string;
    if (!data || !key) throw new Error('Missing required parameters: data, key');

    // Use crypto module for encryption
    const { createCipheriv, randomBytes } = await import('node:crypto');
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', Buffer.from(key.padEnd(32).slice(0, 32)), iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
      commandType: 'security_encrypt',
      success: true,
      encrypted: iv.toString('hex') + ':' + encrypted,
    };
  }

  private async executeSecurityDecrypt(command: Command): Promise<CommandOutput> {
    const data = command.params.data as string;
    const key = command.params.key as string;
    if (!data || !key) throw new Error('Missing required parameters: data, key');

    const { createDecipheriv } = await import('node:crypto');
    const [ivHex, encrypted] = data.split(':');
    const iv = Buffer.from(ivHex!, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', Buffer.from(key.padEnd(32).slice(0, 32)), iv);
    let decrypted = decipher.update(encrypted!, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return {
      commandType: 'security_decrypt',
      success: true,
      decrypted: decrypted.slice(0, 500),
    };
  }

  // ─── Advanced Analytics ───────────────────────────────────

  private async executeAnalyticsPredict(command: Command): Promise<CommandOutput> {
    const data = command.params.data as number[];
    const steps = command.params.steps as number;
    if (!data) throw new Error('Missing required parameter: data');

    // Convert to TimeSeriesPoint format
    const timeSeries = data.map((value, index) => ({
      timestamp: new Date(Date.now() - (data.length - index) * 86400000),
      value,
    }));
    const predictions = this.advancedAnalytics.predictLinear(timeSeries, steps || 5);
    return {
      commandType: 'analytics_predict',
      success: true,
      predictions: predictions.map(p => ({
        timestamp: p.timestamp,
        predicted: p.predicted,
        lower: p.lower,
        upper: p.upper,
      })),
    };
  }

  private async executeAnalyticsAnomaly(command: Command): Promise<CommandOutput> {
    const data = command.params.data as number[];
    const threshold = command.params.threshold as number;
    if (!data) throw new Error('Missing required parameter: data');

    const timeSeries = data.map((value, index) => ({
      timestamp: new Date(Date.now() - (data.length - index) * 86400000),
      value,
    }));
    const anomalies = this.advancedAnalytics.detectAnomalies(timeSeries, threshold || 2.5);
    return {
      commandType: 'analytics_anomaly',
      success: true,
      anomalies: anomalies.map(a => ({
        timestamp: a.timestamp,
        value: a.value,
        expected: a.expected,
        score: a.score,
        severity: a.severity,
      })),
    };
  }

  // ─── Plugin System ─────────────────────────────────────────

  private async executePluginList(): Promise<CommandOutput> {
    await this.pluginSystem.init();
    return {
      commandType: 'plugin_list',
      success: true,
      plugins: [],
    };
  }

  private async executePluginInstall(command: Command): Promise<CommandOutput> {
    const name = command.params.name as string;
    const code = command.params.code as string;
    if (!name || !code) throw new Error('Missing required parameters: name, code');

    await this.pluginSystem.installPlugin({
      name,
      version: '1.0.0',
      description: `Plugin: ${name}`,
      author: 'RemoteOS',
      main: 'index.js',
    }, code);

    return {
      commandType: 'plugin_install',
      success: true,
      name,
    };
  }

  private async executePluginUninstall(command: Command): Promise<CommandOutput> {
    const name = command.params.name as string;
    if (!name) throw new Error('Missing required parameter: name');

    await this.pluginSystem.uninstallPlugin(name);
    return {
      commandType: 'plugin_uninstall',
      success: true,
      name,
    };
  }

  // ─── Integration Hub ──────────────────────────────────────

  private async executeIntegrationGithub(command: Command): Promise<CommandOutput> {
    const action = command.params.action as string;
    const repo = command.params.repo as string;

    if (!action) throw new Error('Missing required parameter: action');

    // Use gh CLI for GitHub operations
    const { execSync } = await import('node:child_process');

    try {
      let result = '';
      switch (action) {
        case 'list_repos':
          result = execSync('gh repo list --limit 10 --json name,description,url', { encoding: 'utf-8', timeout: 30000 });
          break;
        case 'clone':
          if (!repo) throw new Error('Missing required parameter: repo');
          result = execSync(`gh repo clone ${repo}`, { encoding: 'utf-8', timeout: 60000 });
          break;
        case 'issues':
          result = execSync(`gh issue list --repo ${repo || ''} --limit 10`, { encoding: 'utf-8', timeout: 30000 });
          break;
        default:
          throw new Error(`Unknown GitHub action: ${action}`);
      }

      return {
        commandType: 'integration_github',
        success: true,
        action,
        result: result.slice(0, 2000),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        commandType: 'integration_github',
        success: false,
        error: message,
      };
    }
  }

  // ─── Enterprise ──────────────────────────────────────────

  private async executeEnterpriseUsers(command: Command): Promise<CommandOutput> {
    const action = command.params.action as string;

    try {
      await this.enterpriseSystem.init();

      switch (action) {
        case 'create': {
          const { UserRole } = await import('../modules/enterprise.js');
          const roleStr = (command.params.role as string) || 'developer';
          const role = Object.values(UserRole).includes(roleStr as any) ? (roleStr as typeof UserRole[keyof typeof UserRole]) : UserRole.DEVELOPER;
          const user = await this.enterpriseSystem.createUser({
            name: command.params.name as string,
            email: command.params.email as string,
            role,
          });
          return { commandType: 'enterprise_users', success: true, action: 'create', user };
        }
        case 'list':
          return { commandType: 'enterprise_users', success: true, action: 'list', users: [] };
        default:
          return { commandType: 'enterprise_users', success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { commandType: 'enterprise_users', success: false, error: String(err) };
    }
  }

  private async executeEnterpriseTeams(command: Command): Promise<CommandOutput> {
    const action = command.params.action as string;

    try {
      await this.enterpriseSystem.init();

      switch (action) {
        case 'create': {
          const team = await this.enterpriseSystem.createTeam({
            name: command.params.name as string,
            description: command.params.description as string || '',
            ownerId: command.params.ownerId as string || 'default',
          });
          return { commandType: 'enterprise_teams', success: true, action: 'create', team };
        }
        case 'list':
          return { commandType: 'enterprise_teams', success: true, action: 'list', teams: [] };
        default:
          return { commandType: 'enterprise_teams', success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { commandType: 'enterprise_teams', success: false, error: String(err) };
    }
  }

  // ─── Browser Engine ───────────────────────────────────────

  private async executeBrowserLaunch(command: Command): Promise<CommandOutput> {
    const headless = (command.params.headless as boolean) ?? true;
    await this.browserEngine.launch({ headless });
    return {
      commandType: 'browser_launch',
      success: true,
    };
  }

  private async executeBrowserGoto(command: Command): Promise<CommandOutput> {
    const url = command.params.url as string;
    if (!url) throw new Error('Missing required parameter: url');

    await this.browserEngine.goto(url);
    const pageInfo = await this.browserEngine.getPageInfo();
    return {
      commandType: 'browser_goto',
      success: true,
      url: pageInfo.url,
      title: pageInfo.title,
    };
  }

  private async executeBrowserClick(command: Command): Promise<CommandOutput> {
    const selector = command.params.selector as string;
    const text = command.params.text as string;
    if (!selector && !text) throw new Error('Missing required parameter: selector or text');

    if (selector) {
      await this.browserEngine.click(selector);
    } else if (text) {
      await this.browserEngine.clickByText(text);
    }
    return {
      commandType: 'browser_click',
      success: true,
    };
  }

  private async executeBrowserType(command: Command): Promise<CommandOutput> {
    const selector = command.params.selector as string;
    const text = command.params.text as string;
    if (!selector || !text) throw new Error('Missing required parameters: selector, text');

    await this.browserEngine.type(selector, text);
    return {
      commandType: 'browser_type',
      success: true,
    };
  }

  private async executeBrowserText(command: Command): Promise<CommandOutput> {
    const selector = command.params.selector as string;
    if (!selector) throw new Error('Missing required parameter: selector');

    const text = await this.browserEngine.getText(selector);
    return {
      commandType: 'browser_text',
      success: true,
      text,
    };
  }

  private async executeBrowserScreenshot(command: Command): Promise<CommandOutput> {
    const path = (command.params.path as string) || 'screenshot.png';
    const fullPath = await this.browserEngine.screenshot({ path });
    return {
      commandType: 'browser_screenshot',
      success: true,
      path: fullPath,
    };
  }
}

// ─── Utility ──────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}
