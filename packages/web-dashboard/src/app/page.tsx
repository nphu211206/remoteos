'use client';

import { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:3000/api/v1';

// ─── Types ────────────────────────────────────────────────────

interface Device {
  id: string;
  name: string;
  status: string;
  os: string;
  cpuModel?: string;
  totalRamGb?: number;
}

interface SystemStatus {
  cpu: { usage: number; model: string; cores: number };
  ram: { usedGb: number; totalGb: number; usagePercent: number };
  disk: { usedGb: number; totalGb: number; usagePercent: number };
  uptime: { formatted: string };
  processes: { total: number };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ─── API Client ───────────────────────────────────────────────

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  return res.json();
}

// ─── Main Dashboard ───────────────────────────────────────────

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'devices' | 'files' | 'schedules'>('chat');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch devices
  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchDevices() {
    try {
      const data = await api('/devices');
      if (data?.data?.devices) {
        setDevices(data.data.devices);
        // Auto-fetch status for first online device
        const online = data.data.devices.find((d: Device) => d.status === 'online');
        if (online) fetchStatus(online.id);
      }
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    }
  }

  async function fetchStatus(deviceId: string) {
    try {
      const data = await api('/interpret-and-execute', {
        method: 'POST',
        body: JSON.stringify({ text: 'máy tính thế nào', deviceId }),
      });
      if (data?.result) setStatus(data.result);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const data = await api('/interpret-and-execute', {
        method: 'POST',
        body: JSON.stringify({ text: input }),
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data?.formattedResponse ?? data?.error ?? 'Không có phản hồi.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Lỗi kết nối server.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: '260px',
        background: '#1e293b',
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
      }}>
        <div style={{ padding: '0 20px', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #667eea, #764ba2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🖥️ RemoteOS
          </h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>Your computer, anywhere</p>
        </div>

        <nav style={{ flex: 1 }}>
          {[
            { id: 'chat', icon: '💬', label: 'AI Chat' },
            { id: 'devices', icon: '📱', label: 'Devices' },
            { id: 'files', icon: '📁', label: 'Files' },
            { id: 'schedules', icon: '⏰', label: 'Schedules' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '12px 20px',
                border: 'none',
                background: activeTab === tab.id ? '#334155' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#94a3b8',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tab.id ? 600 : 400,
                transition: 'all 0.2s',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Device Status */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #334155' }}>
          {devices.length > 0 ? (
            <div>
              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Devices</p>
              {devices.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: d.status === 'online' ? '#22c55e' : '#ef4444' }} />
                  <span style={{ fontSize: '13px', color: '#cbd5e1' }}>{d.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '12px', color: '#64748b' }}>No devices connected</p>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{
          padding: '16px 24px',
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            {activeTab === 'chat' && '💬 AI Chat'}
            {activeTab === 'devices' && '📱 Devices'}
            {activeTab === 'files' && '📁 Files'}
            {activeTab === 'schedules' && '⏰ Schedules'}
          </h2>
          <button
            onClick={() => fetchDevices()}
            style={{
              padding: '8px 16px',
              background: '#334155',
              border: '1px solid #475569',
              borderRadius: '8px',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            🔄 Refresh
          </button>
        </header>

        {/* Content Area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {activeTab === 'chat' && (
            <ChatView
              messages={messages}
              input={input}
              setInput={setInput}
              loading={loading}
              sendMessage={sendMessage}
              chatEndRef={chatEndRef}
            />
          )}
          {activeTab === 'devices' && <DevicesView devices={devices} />}
          {activeTab === 'files' && <FilesView />}
          {activeTab === 'schedules' && <SchedulesView />}
        </div>

        {/* System Status Bar */}
        {status && (
          <div style={{
            padding: '12px 24px',
            background: '#1e293b',
            borderTop: '1px solid #334155',
            display: 'flex',
            gap: '24px',
            fontSize: '12px',
            color: '#94a3b8',
          }}>
            <span>🔲 CPU: {status.cpu.usage.toFixed(1)}%</span>
            <span>💾 RAM: {status.ram.usagePercent.toFixed(1)}%</span>
            <span>💿 Disk: {status.disk.usagePercent.toFixed(1)}%</span>
            <span>⏱️ Uptime: {status.uptime.formatted}</span>
            <span>📊 Processes: {status.processes.total}</span>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────

function ChatView({ messages, input, setInput, loading, sendMessage, chatEndRef }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', marginBottom: '16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
            <h3 style={{ margin: '0 0 8px', color: '#94a3b8' }}>RemoteOS AI Assistant</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>Hỏi bất cứ điều gì về máy tính của bạn</p>
            <div style={{ marginTop: '24px', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {['máy tính thế nào?', 'chụp màn hình', 'tạo file Python', 'mở VS Code'].map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  style={{
                    padding: '8px 16px',
                    background: '#334155',
                    border: '1px solid #475569',
                    borderRadius: '20px',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg: ChatMessage, i: number) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '12px',
            }}
          >
            <div style={{
              maxWidth: '70%',
              padding: '12px 16px',
              borderRadius: '12px',
              background: msg.role === 'user' ? '#667eea' : '#1e293b',
              border: msg.role === 'user' ? 'none' : '1px solid #334155',
              color: '#fff',
              fontSize: '14px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              fontSize: '14px',
            }}>
              🤔 Đang suy nghĩ...
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '16px',
        background: '#1e293b',
        borderRadius: '12px',
        border: '1px solid #334155',
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Nhập lệnh hoặc câu hỏi..."
          style={{
            flex: 1,
            padding: '12px 16px',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          style={{
            padding: '12px 24px',
            background: loading ? '#475569' : '#667eea',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          {loading ? '⏳' : '➤'}
        </button>
      </div>
    </div>
  );
}

// ─── Devices View ─────────────────────────────────────────────

function DevicesView({ devices }: { devices: Device[] }) {
  return (
    <div>
      {devices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
          <h3 style={{ margin: '0 0 8px', color: '#94a3b8' }}>Chưa có thiết bị nào</h3>
          <p style={{ margin: 0, fontSize: '14px' }}>Chạy agent trên máy tính để kết nối</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {devices.map(device => (
            <div
              key={device.id}
              style={{
                padding: '20px',
                background: '#1e293b',
                borderRadius: '12px',
                border: '1px solid #334155',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{device.name}</h3>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: device.status === 'online' ? '#065f46' : '#7f1d1d',
                  color: device.status === 'online' ? '#34d399' : '#fca5a5',
                }}>
                  {device.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                <p style={{ margin: '4px 0' }}>💻 {device.os}</p>
                {device.cpuModel && <p style={{ margin: '4px 0' }}>🔲 {device.cpuModel}</p>}
                {device.totalRamGb && <p style={{ margin: '4px 0' }}>💾 {device.totalRamGb} GB RAM</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Files View ───────────────────────────────────────────────

function FilesView() {
  const [path, setPath] = useState('C:\\Users\\Admin');
  const [files, setFiles] = useState<Array<{ name: string; type: string; sizeBytes: number }>>([]);
  const [loading, setLoading] = useState(false);

  async function loadFiles() {
    setLoading(true);
    try {
      const data = await api('/interpret-and-execute', {
        method: 'POST',
        body: JSON.stringify({ text: `xem thư mục ${path}` }),
      });
      if (data?.result?.entries) setFiles(data.result.entries);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFiles(); }, [path]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadFiles()}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          onClick={loadFiles}
          style={{
            padding: '10px 20px',
            background: '#667eea',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          📂 Open
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#64748b', textAlign: 'center' }}>Loading...</p>
      ) : (
        <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
          {files.map((file, i) => (
            <div
              key={i}
              onClick={() => file.type === 'directory' && setPath(`${path}\\${file.name}`)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: i < files.length - 1 ? '1px solid #334155' : 'none',
                cursor: file.type === 'directory' ? 'pointer' : 'default',
                background: 'transparent',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => file.type === 'directory' && ((e.target as HTMLElement).style.background = '#334155')}
              onMouseLeave={e => ((e.target as HTMLElement).style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '18px' }}>
                  {file.type === 'directory' ? '📁' : '📄'}
                </span>
                <span style={{ fontSize: '14px', color: '#e2e8f0' }}>{file.name}</span>
              </div>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {file.type === 'directory' ? 'Folder' : `${(file.sizeBytes / 1024).toFixed(1)} KB`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Schedules View ───────────────────────────────────────────

function SchedulesView() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadSchedules() {
    setLoading(true);
    try {
      const data = await api('/schedules');
      if (data?.schedules) setSchedules(data.schedules);
    } catch (err) {
      console.error('Failed to load schedules:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSchedules(); }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: '#94a3b8' }}>Scheduled Tasks</h3>
        <button
          onClick={loadSchedules}
          style={{
            padding: '8px 16px',
            background: '#334155',
            border: '1px solid #475569',
            borderRadius: '8px',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#64748b', textAlign: 'center' }}>Loading...</p>
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏰</div>
          <h3 style={{ margin: '0 0 8px', color: '#94a3b8' }}>Chưa có lịch nào</h3>
          <p style={{ margin: 0, fontSize: '14px' }}>Dùng AI Chat để tạo lịch: "tạo lịch chụp màn hình 8h sáng"</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {schedules.map((schedule: any) => (
            <div
              key={schedule.id}
              style={{
                padding: '16px',
                background: '#1e293b',
                borderRadius: '12px',
                border: '1px solid #334155',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>{schedule.name}</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                  ⏰ {schedule.cronExpression} | 🔧 {schedule.commandType} | 📊 {schedule.runCount} runs
                </p>
              </div>
              <span style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                background: schedule.isActive ? '#065f46' : '#7f1d1d',
                color: schedule.isActive ? '#34d399' : '#fca5a5',
              }}>
                {schedule.isActive ? '🟢 Active' : '🔴 Inactive'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
