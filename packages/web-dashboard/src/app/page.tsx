'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// ─── Types ────────────────────────────────────────────────────

interface Device {
  id: string;
  name: string;
  status: string;
  os: string;
  cpuUsage?: number | null;
  ramUsage?: number | null;
}

interface SystemStatus {
  cpu: { usage: number; model: string; cores: number };
  ram: { usedGb: number; totalGb: number; usagePercent: number };
  disk: { usedGb: number; totalGb: number; usagePercent: number };
  uptime: { formatted: string };
  processes: { total: number };
  temperature?: { cpu: number | null };
  battery?: { percent: number | null; isCharging: boolean | null };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'action' | 'error' | 'code';
}

interface CommandHistory {
  id: string;
  command: string;
  type: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: Date;
  duration?: number;
}

interface SystemMetric {
  timestamp: number;
  cpu: number;
  ram: number;
  disk: number;
}

interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  sizeBytes: number;
  modifiedAt: string;
}

// ─── API Client ───────────────────────────────────────────────

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  return res.json();
}

// ─── Components ───────────────────────────────────────────────

function MetricCard({ icon, label, value, unit, color }: {
  icon: string;
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="metric-card">
      <div className="metric-gauge">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
          <circle
            cx="22" cy="22" r="18" fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <span className="metric-gauge-icon">{icon}</span>
      </div>
      <div className="metric-info">
        <span className="metric-label">{label}</span>
        <span className="metric-value" style={{ color }}>{value.toFixed(1)}{unit}</span>
      </div>
    </div>
  );
}

function DeviceCard({ device, onSelect }: { device: Device; onSelect: () => void }) {
  return (
    <div className={`device-card ${device.status}`} onClick={onSelect}>
      <div className="device-status-dot" />
      <div className="device-info">
        <span className="device-name">{device.name}</span>
        <span className="device-os">{device.os}</span>
      </div>
      {device.status === 'online' && device.cpuUsage != null && (
        <div className="device-metrics">
          <span className="device-metric">CPU: {device.cpuUsage.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-ai'} fade-in`}>
      {!isUser && <div className="message-avatar">🤖</div>}
      <div className="message-content">
        <div className="message-text">
          {message.content.split('\n').map((line, i) => {
            if (line.startsWith('```')) return <pre key={i} className="code-block">{line.replace(/```\w*/, '')}</pre>;
            if (line.startsWith('  ')) return <pre key={i} className="code-inline">{line}</pre>;
            return <p key={i}>{line}</p>;
          })}
        </div>
        <span className="message-time">
          {message.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {isUser && <div className="message-avatar">👤</div>}
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span className="quick-action-icon">{icon}</span>
      <span className="quick-action-label">{label}</span>
    </button>
  );
}

function Sparkline({ data, color, height = 30 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 100);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} 100,${height}`} fill={`url(#gradient-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Real-time multi-metric chart
function MultiMetricChart({ data, height = 120 }: { data: SystemMetric[]; height?: number }) {
  if (data.length < 2) return null;

  const metrics = [
    { key: 'cpu', color: '#667eea', label: 'CPU' },
    { key: 'ram', color: '#764ba2', label: 'RAM' },
    { key: 'disk', color: '#22c55e', label: 'Disk' },
  ];

  const max = 100;
  const width = 300;

  return (
    <div className="multi-metric-chart">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {metrics.map((metric) => {
          const values = data.map(d => d[metric.key as keyof SystemMetric] as number);
          const points = values.map((value, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - (value / max) * height;
            return `${x},${y}`;
          }).join(' ');

          return (
            <g key={metric.key}>
              <polyline
                points={points}
                fill="none"
                stroke={metric.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {metrics.map(m => (
          <span key={m.key} className="legend-item">
            <span className="legend-dot" style={{ background: m.color }} />
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── File Browser Component ──────────────────────────────────

function FileBrowser({ onChatAction }: { onChatAction: (text: string) => void }) {
  const [currentPath, setCurrentPath] = useState('Desktop');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ name: string; content: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const data = await api('/interpret-and-execute', {
        method: 'POST',
        body: JSON.stringify({ text: `xem file ${path}` }),
      });
      if (data?.result?.entries) {
        setFiles(data.result.entries);
      }
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(currentPath); }, [currentPath, loadFiles]);

  const navigateTo = (name: string) => {
    if (name === '..') {
      const parts = currentPath.split(/[/\\]/);
      parts.pop();
      setCurrentPath(parts.join('\\') || 'Desktop');
    } else {
      setCurrentPath(`${currentPath}\\${name}`);
    }
  };

  const previewFile = async (name: string) => {
    try {
      const data = await api('/interpret-and-execute', {
        method: 'POST',
        body: JSON.stringify({ text: `đọc file ${currentPath}\\${name}` }),
      });
      if (data?.result?.content) {
        setPreview({ name, content: data.result.content.slice(0, 5000) });
      }
    } catch {}
  };

  // Drag & Drop upload
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setUploading(true);

    const droppedFiles = Array.from(e.dataTransfer.files);
    for (const file of droppedFiles) {
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          await api('/create-file', {
            method: 'POST',
            body: JSON.stringify({
              filename: `${currentPath}\\${file.name}`,
              content: atob(base64),
            }),
          });
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }

    setUploading(false);
    loadFiles(currentPath);
  };

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <div className="file-breadcrumb">
          <button onClick={() => navigateTo('..')} className="breadcrumb-btn">⬆️</button>
          <span className="breadcrumb-path">📁 {currentPath}</span>
        </div>
        <button onClick={() => loadFiles(currentPath)} className="refresh-btn">🔄</button>
      </div>

      <div
        className={`file-browser-content ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="drag-overlay">
            <span>📤</span>
            <p>Thả file vào đây để upload</p>
          </div>
        )}
        {uploading && (
          <div className="upload-indicator">⏳ Đang upload...</div>
        )}
        {loading ? (
          <div className="file-loading">⏳ Đang tải...</div>
        ) : (
          <div className="file-list">
            {currentPath !== 'Desktop' && (
              <div className="file-item directory" onClick={() => navigateTo('..')}>
                <span className="file-icon">📁</span>
                <span className="file-name">..</span>
                <span className="file-size">—</span>
              </div>
            )}
            {files.map((f, i) => (
              <div
                key={i}
                className={`file-item ${f.type}`}
                onClick={() => f.type === 'directory' ? navigateTo(f.name) : previewFile(f.name)}
              >
                <span className="file-icon">
                  {f.type === 'directory' ? '📁' : f.name.endsWith('.py') ? '🐍' : f.name.endsWith('.js') ? '⚡' : f.name.endsWith('.html') ? '🌐' : f.name.endsWith('.css') ? '🎨' : '📄'}
                </span>
                <span className="file-name">{f.name}</span>
                <span className="file-size">{f.type === 'file' ? `${(f.sizeBytes / 1024).toFixed(1)} KB` : '—'}</span>
              </div>
            ))}
            {files.length === 0 && (
              <div className="file-empty">📭 Thư mục trống</div>
            )}
          </div>
        )}
      </div>

      {preview && (
        <div className="file-preview">
          <div className="file-preview-header">
            <span>📄 {preview.name}</span>
            <button onClick={() => setPreview(null)}>✕</button>
          </div>
          <pre className="file-preview-content">{preview.content}</pre>
          <button className="file-preview-action" onClick={() => onChatAction(`đọc file ${currentPath}\\${preview.name}`)}>
            💬 Mở trong AI Chat
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Settings Component ──────────────────────────────────────

function SettingsPanel() {
  const [settings, setSettings] = useState({
    aiProvider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    heartbeat: 10,
    commandTimeout: 30,
    cpuThreshold: 90,
    diskThreshold: 90,
    autoConnect: true,
    telegramAlerts: false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Save settings via API
    setTimeout(() => setSaving(false), 1000);
  };

  return (
    <div className="settings-container">
      <div className="settings-section">
        <h3>🤖 AI Configuration</h3>
        <div className="settings-card">
          <div className="setting-item editable">
            <label>AI Provider</label>
            <select value={settings.aiProvider} onChange={e => setSettings(s => ({ ...s, aiProvider: e.target.value }))}>
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="local">Local (Ollama)</option>
            </select>
          </div>
          <div className="setting-item editable">
            <label>Model</label>
            <select value={settings.model} onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}>
              <option value="gemini-3.5-flash">gemini-3.5-flash (Best)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>🖥️ Device Settings</h3>
        <div className="settings-card">
          <div className="setting-item editable">
            <label>Auto-connect</label>
            <label className="toggle">
              <input type="checkbox" checked={settings.autoConnect} onChange={e => setSettings(s => ({ ...s, autoConnect: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="setting-item editable">
            <label>Heartbeat (giây)</label>
            <input type="number" value={settings.heartbeat} min={5} max={60}
              onChange={e => setSettings(s => ({ ...s, heartbeat: parseInt(e.target.value) || 10 }))} />
          </div>
          <div className="setting-item editable">
            <label>Command Timeout (giây)</label>
            <input type="number" value={settings.commandTimeout} min={10} max={300}
              onChange={e => setSettings(s => ({ ...s, commandTimeout: parseInt(e.target.value) || 30 }))} />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>🔔 Alert Thresholds</h3>
        <div className="settings-card">
          <div className="setting-item editable">
            <label>CPU Alert (%)</label>
            <input type="range" min={50} max={100} value={settings.cpuThreshold}
              onChange={e => setSettings(s => ({ ...s, cpuThreshold: parseInt(e.target.value) }))} />
            <span className="range-value">{settings.cpuThreshold}%</span>
          </div>
          <div className="setting-item editable">
            <label>Disk Alert (%)</label>
            <input type="range" min={50} max={100} value={settings.diskThreshold}
              onChange={e => setSettings(s => ({ ...s, diskThreshold: parseInt(e.target.value) }))} />
            <span className="range-value">{settings.diskThreshold}%</span>
          </div>
          <div className="setting-item editable">
            <label>Telegram Alerts</label>
            <label className="toggle">
              <input type="checkbox" checked={settings.telegramAlerts} onChange={e => setSettings(s => ({ ...s, telegramAlerts: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      <button className="settings-save" onClick={handleSave} disabled={saving}>
        {saving ? '⏳ Đang lưu...' : '💾 Lưu cài đặt'}
      </button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'Xin chào! 👋 Tôi là RemoteOS AI. Tôi có thể giúp bạn kiểm soát máy tính, tạo file, viết code, và nhiều thứ khác. Bạn cần gì?',
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'devices' | 'files' | 'settings' | 'history' | 'workflows' | 'plugins' | 'rag'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<SystemMetric[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // RAG, Plugin, Workflow state
  const [ragStats, setRagStats] = useState({ documents: 0, knowledgeBases: 0, searches: 0 });
  const [pluginsList, setPluginsList] = useState<Array<{ id: string; name: string; description: string; status: string; commands: string[] }>>([]);
  const [workflowsList, setWorkflowsList] = useState<Array<{ id: string; name: string; description: string; steps: number; status: string; runCount: number }>>([]);

  const fetchDevices = useCallback(async () => {
    try {
      const data = await api('/devices');
      if (data?.data?.devices) setDevices(data.data.devices);
    } catch {}
  }, []);

  const fetchStatus = useCallback(async (deviceId: string) => {
    try {
      const data = await api('/interpret-and-execute', {
        method: 'POST',
        body: JSON.stringify({ text: 'máy tính thế nào', deviceId }),
      });
      if (data?.result) {
        const result = data.result as SystemStatus;
        setStatus(result);
        setMetricsHistory(prev => {
          const newMetric: SystemMetric = { timestamp: Date.now(), cpu: result.cpu.usage, ram: result.ram.usagePercent, disk: result.disk.usagePercent };
          return [...prev, newMetric].slice(-60);
        });
      }
    } catch {}
  }, []);

  // Fetch RAG stats
  const fetchRagStats = useCallback(async () => {
    try {
      const data = await api('/rag/stats');
      if (data?.stats) setRagStats(data.stats);
    } catch {}
  }, []);

  // Fetch plugins
  const fetchPlugins = useCallback(async () => {
    try {
      const data = await api('/plugins');
      if (data?.plugins) setPluginsList(data.plugins);
    } catch {}
  }, []);

  // Fetch workflows
  const fetchWorkflows = useCallback(async () => {
    try {
      const data = await api('/workflows');
      if (data?.workflows) setWorkflowsList(data.workflows);
    } catch {}
  }, []);

  // WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout;

    function connect() {
      try {
        const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000') + '/ws?type=user&id=dashboard';
        ws = new WebSocket(wsUrl);
        ws.onopen = () => console.log('WebSocket connected');
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'device:status') {
              setDevices(prev => prev.map(d => d.id === msg.deviceId ? { ...d, status: msg.status?.status ?? d.status } : d));
            }
          } catch {}
        };
        ws.onclose = () => { reconnectTimer = setTimeout(connect, 5000); };
      } catch {}
    }

    connect();
    return () => { if (ws) ws.close(); if (reconnectTimer) clearTimeout(reconnectTimer); };
  }, []);

  // Poll devices
  useEffect(() => { fetchDevices(); const interval = setInterval(fetchDevices, 10000); return () => clearInterval(interval); }, [fetchDevices]);

  // Fetch RAG, plugins, workflows
  useEffect(() => { fetchRagStats(); fetchPlugins(); fetchWorkflows(); }, [fetchRagStats, fetchPlugins, fetchWorkflows]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-fetch status
  useEffect(() => {
    const online = devices.find(d => d.status === 'online');
    if (online) {
      fetchStatus(online.id);
      const interval = setInterval(() => fetchStatus(online.id), 15000);
      return () => clearInterval(interval);
    }
  }, [devices, fetchStatus]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const text = input;
    setInput('');

    const userMessage: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    // Add to command history
    const historyEntry: CommandHistory = {
      id: Date.now().toString(),
      command: text,
      type: 'chat',
      status: 'pending',
      timestamp: new Date(),
    };
    setCommandHistory(prev => [historyEntry, ...prev]);

    try {
      const startTime = Date.now();
      const data = await api('/interpret-and-execute', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      const duration = Date.now() - startTime;

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data?.formattedResponse ?? data?.error ?? 'Không có phản hồi.',
        timestamp: new Date(),
        type: data?.success ? 'text' : 'error',
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Update command history
      setCommandHistory(prev => prev.map(h =>
        h.id === historyEntry.id ? { ...h, status: data?.success ? 'success' : 'failed', duration } : h
      ));
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Lỗi kết nối server.', timestamp: new Date(), type: 'error' }]);
      setCommandHistory(prev => prev.map(h => h.id === historyEntry.id ? { ...h, status: 'failed' } : h));
    } finally {
      setLoading(false);
    }
  }

  function handleQuickAction(action: string) {
    setInput(action);
    setTimeout(() => {
      const userMessage: ChatMessage = { role: 'user', content: action, timestamp: new Date() };
      setMessages(prev => [...prev, userMessage]);
      setLoading(true);
      api('/interpret-and-execute', { method: 'POST', body: JSON.stringify({ text: action }) })
        .then(data => {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: data?.formattedResponse ?? data?.error ?? 'Không có phản hồi.',
            timestamp: new Date(),
            type: data?.success ? 'text' : 'error',
          }]);
        })
        .catch(() => {
          setMessages(prev => [...prev, { role: 'assistant', content: '❌ Lỗi kết nối.', timestamp: new Date(), type: 'error' }]);
        })
        .finally(() => { setLoading(false); setInput(''); });
    }, 50);
  }

  function handleChatAction(text: string) {
    setActiveTab('chat');
    setTimeout(() => handleQuickAction(text), 100);
  }

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h1 className="logo">
            <span className="logo-icon">🖥️</span>
            {sidebarOpen && <span className="logo-text">RemoteOS</span>}
          </h1>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {[
            { id: 'chat', icon: '💬', label: 'AI Chat' },
            { id: 'devices', icon: '📱', label: 'Thiết bị' },
            { id: 'files', icon: '📁', label: 'Files' },
            { id: 'workflows', icon: '🔄', label: 'Workflows' },
            { id: 'plugins', icon: '🧩', label: 'Plugins' },
            { id: 'rag', icon: '📚', label: 'Knowledge' },
            { id: 'history', icon: '📜', label: 'Lịch sử' },
            { id: 'settings', icon: '⚙️', label: 'Cài đặt' },
          ].map(tab => (
            <button key={tab.id} className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}>
              <span className="nav-icon">{tab.icon}</span>
              {sidebarOpen && <span className="nav-label">{tab.label}</span>}
            </button>
          ))}
        </nav>

        {sidebarOpen && (
          <div className="sidebar-devices">
            <h3 className="devices-title">Thiết bị</h3>
            {devices.length > 0 ? (
              devices.map(d => <DeviceCard key={d.id} device={d} onSelect={() => fetchStatus(d.id)} />)
            ) : (
              <p className="no-devices">Chưa có thiết bị</p>
            )}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <div className="header-left">
            <h2 className="header-title">
              {activeTab === 'chat' && '💬 AI Chat'}
              {activeTab === 'devices' && '📱 Thiết bị'}
              {activeTab === 'files' && '📁 Files'}
              {activeTab === 'workflows' && '🔄 Workflows'}
              {activeTab === 'plugins' && '🧩 Plugins'}
              {activeTab === 'rag' && '📚 Knowledge Base'}
              {activeTab === 'history' && '📜 Lịch sử'}
              {activeTab === 'settings' && '⚙️ Cài đặt'}
            </h2>
          </div>
          <div className="header-right">
            <div className="header-status">
              <span className="status-dot online" />
              <span className="status-text">{devices.filter(d => d.status === 'online').length} thiết bị online</span>
            </div>
          </div>
        </header>

        <div className="content-area">
          {/* ═══ CHAT TAB ═══ */}
          {activeTab === 'chat' && (
            <div className="chat-container">
              {status && (
                <div className="metrics-bar">
                  <div className="metric-card-with-chart">
                    <MetricCard icon="🔲" label="CPU" value={status.cpu.usage} unit="%"
                      color={status.cpu.usage > 80 ? '#ef4444' : status.cpu.usage > 60 ? '#eab308' : '#22c55e'} />
                    <Sparkline data={metricsHistory.map(m => m.cpu)} color={status.cpu.usage > 80 ? '#ef4444' : status.cpu.usage > 60 ? '#eab308' : '#22c55e'} />
                  </div>
                  <div className="metric-card-with-chart">
                    <MetricCard icon="💾" label="RAM" value={status.ram.usagePercent} unit="%"
                      color={status.ram.usagePercent > 80 ? '#ef4444' : status.ram.usagePercent > 60 ? '#eab308' : '#22c55e'} />
                    <Sparkline data={metricsHistory.map(m => m.ram)} color={status.ram.usagePercent > 80 ? '#ef4444' : status.ram.usagePercent > 60 ? '#eab308' : '#22c55e'} />
                  </div>
                  <div className="metric-card-with-chart">
                    <MetricCard icon="💿" label="Disk" value={status.disk.usagePercent} unit="%"
                      color={status.disk.usagePercent > 80 ? '#ef4444' : status.disk.usagePercent > 60 ? '#eab308' : '#22c55e'} />
                    <Sparkline data={metricsHistory.map(m => m.disk)} color={status.disk.usagePercent > 80 ? '#ef4444' : status.disk.usagePercent > 60 ? '#eab308' : '#22c55e'} />
                  </div>
                  <div className="metric-card">
                    <div className="metric-icon">⏱️</div>
                    <div className="metric-info">
                      <span className="metric-label">Uptime</span>
                      <span className="metric-value">{status.uptime.formatted}</span>
                    </div>
                  </div>
                  {status.temperature?.cpu != null && (
                    <div className="metric-card">
                      <div className="metric-icon">{status.temperature.cpu > 80 ? '🔴' : status.temperature.cpu > 60 ? '🟡' : '🟢'}</div>
                      <div className="metric-info">
                        <span className="metric-label">Temp</span>
                        <span className="metric-value">{status.temperature.cpu}°C</span>
                      </div>
                    </div>
                  )}
                  {status.battery?.percent != null && (
                    <div className="metric-card">
                      <div className="metric-icon">{status.battery.isCharging ? '🔌' : status.battery.percent < 20 ? '🪫' : '🔋'}</div>
                      <div className="metric-info">
                        <span className="metric-label">Battery</span>
                        <span className="metric-value">{status.battery.percent}%</span>
                      </div>
                    </div>
                  )}
                  {metricsHistory.length > 5 && (
                    <div className="metric-card-full">
                      <MultiMetricChart data={metricsHistory} />
                    </div>
                  )}
                </div>
              )}

              <div className="chat-messages">
                {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
                {loading && (
                  <div className="message message-ai fade-in">
                    <div className="message-avatar">🤖</div>
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="quick-actions">
                <QuickAction icon="📸" label="Screenshot" onClick={() => handleQuickAction('chụp màn hình')} />
                <QuickAction icon="📊" label="Status" onClick={() => handleQuickAction('máy tính thế nào')} />
                <QuickAction icon="📁" label="Files" onClick={() => handleQuickAction('xem file desktop')} />
                <QuickAction icon="🔧" label="Processes" onClick={() => handleQuickAction('tiến trình đang chạy')} />
                <QuickAction icon="🔄" label="Refresh" onClick={() => handleQuickAction('kiểm tra trạng thái')} />
              </div>

              <form className="chat-form" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
                <input type="text" className="chat-input" value={input} onChange={e => setInput(e.target.value)}
                  placeholder="Nhập lệnh hoặc câu hỏi..." disabled={loading} />
                <button type="submit" className="chat-send" disabled={loading || !input.trim()}>
                  {loading ? '⏳' : '→'}
                </button>
              </form>
            </div>
          )}

          {/* ═══ DEVICES TAB ═══ */}
          {activeTab === 'devices' && (
            <div className="devices-container">
              <div className="devices-grid">
                {devices.map(d => (
                  <div key={d.id} className={`device-card-full ${d.status}`}>
                    <div className="device-card-header">
                      <span className="device-status-dot" />
                      <h3>{d.name}</h3>
                    </div>
                    <div className="device-card-body">
                      <p>OS: {d.os}</p>
                      <p>Status: {d.status}</p>
                      {d.cpuUsage != null && <p>CPU: {d.cpuUsage.toFixed(1)}%</p>}
                      {d.ramUsage != null && <p>RAM: {d.ramUsage.toFixed(1)}%</p>}
                    </div>
                    <div className="device-card-actions">
                      <button onClick={() => fetchStatus(d.id)}>📊 Status</button>
                      <button onClick={() => handleQuickAction('chụp màn hình')}>📸 Screenshot</button>
                      <button onClick={() => handleQuickAction('tiến trình đang chạy')}>🔧 Processes</button>
                    </div>
                  </div>
                ))}
                {devices.length === 0 && (
                  <div className="devices-empty">
                    <span>📱</span>
                    <p>Chưa có thiết bị nào</p>
                    <p className="hint">Chạy agent trên máy tính để kết nối</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ FILES TAB (Real File Browser) ═══ */}
          {activeTab === 'files' && (
            <FileBrowser onChatAction={handleChatAction} />
          )}

          {/* ═══ HISTORY TAB ═══ */}
          {activeTab === 'history' && (
            <div className="history-container">
              <div className="history-header">
                <h3>📜 Lịch sử lệnh</h3>
                {commandHistory.length > 0 && (
                  <button className="history-clear" onClick={() => setCommandHistory([])}>🗑️ Xóa</button>
                )}
              </div>
              <div className="history-list">
                {commandHistory.length > 0 ? (
                  commandHistory.map((cmd) => (
                    <div key={cmd.id} className={`history-item ${cmd.status}`}>
                      <div className="history-icon">
                        {cmd.status === 'success' ? '✅' : cmd.status === 'failed' ? '❌' : '⏳'}
                      </div>
                      <div className="history-info">
                        <span className="history-command">{cmd.command}</span>
                        <span className="history-meta">
                          {cmd.type} • {cmd.timestamp.toLocaleTimeString('vi-VN')}
                          {cmd.duration && ` • ${cmd.duration}ms`}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="history-empty">
                    <span className="history-empty-icon">📜</span>
                    <p>Chưa có lệnh nào</p>
                    <p className="history-empty-hint">Gửi tin nhắn trong AI Chat để bắt đầu</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ SETTINGS TAB (Editable) ═══ */}
          {activeTab === 'settings' && <SettingsPanel />}

          {/* ═══ WORKFLOWS TAB ═══ */}
          {activeTab === 'workflows' && (
            <div className="workflows-container">
              <div className="workflows-header">
                <h3>🔄 Workflow Automation</h3>
                <p className="workflows-hint">Tạo và quản lý các workflow tự động</p>
              </div>
              <div className="workflows-list">
                {workflowsList.map(wf => {
                  const icons: Record<string, string> = {
                    'wf-screenshot-report': '📸', 'wf-file-search-process': '🔍',
                    'wf-code-verify': '💻', 'wf-system-monitor': '📊',
                    'wf-backup': '💾', 'wf-daily-report': '📋',
                  };
                  return (
                    <div key={wf.id} className="workflow-card">
                      <div className="workflow-icon">{icons[wf.id] || '🔄'}</div>
                      <div className="workflow-info">
                        <h4>{wf.name}</h4>
                        <p>{wf.description}</p>
                        <span className="workflow-meta">{wf.steps} steps • Run {wf.runCount} times</span>
                      </div>
                      <button className="workflow-run" onClick={async () => {
                        await api(`/workflows/${wf.id}/run`, { method: 'POST' });
                        fetchWorkflows();
                        handleQuickAction(`chạy workflow ${wf.name}`);
                      }}>▶️</button>
                    </div>
                  );
                })}
              </div>
              <div className="workflow-create">
                <p>💡 Hỏi AI để tạo workflow mới: "Tạo workflow tự động backup file mỗi ngày"</p>
              </div>
            </div>
          )}

          {/* ═══ PLUGINS TAB ═══ */}
          {activeTab === 'plugins' && (
            <div className="plugins-container">
              <div className="plugins-header">
                <h3>🧩 Plugin System</h3>
                <p className="plugins-hint">Mở rộng khả năng của RemoteOS</p>
              </div>
              <div className="plugins-grid">
                {pluginsList.map(plugin => {
                  const icons: Record<string, string> = {
                    'data-analytics': '📊', 'report-generator': '📝', 'web-automation': '🌐',
                    'security-suite': '🔐', 'voice-commands': '🎙️', 'vision-ai': '👁️',
                    'code-executor': '💻', 'file-processor': '📄', 'desktop-automation': '🖱️',
                    'multi-device': '📱',
                  };
                  return (
                    <div key={plugin.id} className={`plugin-card ${plugin.status === 'installed' ? 'installed' : ''}`}>
                      <div className="plugin-icon">{icons[plugin.id] || '🧩'}</div>
                      <div className="plugin-info">
                        <h4>{plugin.name}</h4>
                        <p>{plugin.description}</p>
                      </div>
                      <span className={`plugin-status ${plugin.status === 'installed' ? '' : 'available'}`}>
                        {plugin.status === 'installed' ? '✅ Installed' : 'Available'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ RAG KNOWLEDGE BASE TAB ═══ */}
          {activeTab === 'rag' && (
            <div className="rag-container">
              <div className="rag-header">
                <h3>📚 Knowledge Base</h3>
                <p className="rag-hint">Lưu trữ và tìm kiếm kiến thức</p>
              </div>
              <div className="rag-stats">
                <div className="rag-stat">
                  <span className="rag-stat-number">{ragStats.documents}</span>
                  <span className="rag-stat-label">Documents</span>
                </div>
                <div className="rag-stat">
                  <span className="rag-stat-number">{ragStats.knowledgeBases}</span>
                  <span className="rag-stat-label">Knowledge Bases</span>
                </div>
                <div className="rag-stat">
                  <span className="rag-stat-number">{ragStats.searches}</span>
                  <span className="rag-stat-label">Searches</span>
                </div>
              </div>
              <div className="rag-actions">
                <button className="rag-action-btn" onClick={() => handleQuickAction('tạo knowledge base mới')}>
                  ➕ Tạo Knowledge Base
                </button>
                <button className="rag-action-btn" onClick={() => handleQuickAction('thêm tài liệu vào knowledge base')}>
                  📄 Thêm tài liệu
                </button>
                <button className="rag-action-btn" onClick={() => handleQuickAction('tìm kiếm trong knowledge base')}>
                  🔍 Tìm kiếm
                </button>
              </div>
              <div className="rag-empty">
                <span>📚</span>
                <p>Chưa có tài liệu nào</p>
                <p className="rag-empty-hint">Hỏi AI để thêm tài liệu: "Thêm file báo cáo.docx vào knowledge base"</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
