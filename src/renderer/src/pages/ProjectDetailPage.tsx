import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Upload, FileText, MessageSquare, ClipboardList,
  Send, StopCircle, Download, RefreshCw, AlertCircle,
  Clock, ChevronDown, ChevronRight as ChevronRightIcon,
  Trash2, X, Sparkles, RotateCcw, ChevronLeft, ChevronRight,
  BookOpen, Scale, Zap, PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '../hooks/useChat';
import AgentWorkbench from '../components/AgentWorkbench';
import AgentFeedback from '../components/AgentFeedback';
import type { ChatMessage, Citation } from '../../../shared/types';

// ===== 类型定义 =====
type ChecklistItem = {
  id: string;
  name: string;
  required?: boolean;
  status?: string;
  phase_id?: string;
  phase_name?: string;
  content_requirement?: string;
  format?: string;
};

type FileItem = {
  id: number;
  originalName: string;
  checklistItemId?: string;
  fileSize: number;
  parseStatus: string;
  createdAt: string;
};

type ReportItem = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  pdfPath?: string | null;
  skillOutput?: Record<string, any> | null;
};

type Tab = 'checklist' | 'files' | 'reports';

const PARSE_STATUS: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待解析', color: 'text-slate-400' },
  PARSING:  { label: '解析中', color: 'text-amber-400' },
  PARSED:   { label: '已解析', color: 'text-emerald-400' },
  FAILED:   { label: '失败',   color: 'text-red-400' },
};

// ===== 主组件 =====
const ProjectDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const projectId = Number(id);

  const [project, setProject] = useState<any>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [tab, setTab] = useState<Tab>('checklist');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [chatCollapsed, setChatCollapsed] = useState(false);  // AI 面板折叠状态
  const [activeExecutionId, setActiveExecutionId] = useState<number | null>(null);  // 当前正在执行的智能体执行 ID

  // 解析进度轮询：有 PENDING/PARSING 文件时每 5 秒刷新一次
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      const r = await window.electronAPI.apiRequest('GET', `/api/projects/${projectId}/files`);
      if (r.success) {
        const newFiles: FileItem[] = r.data || [];
        setFiles(newFiles);
        // 如果没有 PENDING/PARSING 文件，停止轮询
        const hasActive = newFiles.some(f => f.parseStatus === 'PENDING' || f.parseStatus === 'PARSING');
        if (!hasActive) stopPolling();
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // 文件列表变化时，检查是否需要启动/停止轮询
  useEffect(() => {
    const hasActive = files.some(f => f.parseStatus === 'PENDING' || f.parseStatus === 'PARSING');
    if (hasActive) startPolling();
    else stopPolling();
    return () => stopPolling();
  }, [files.map(f => f.parseStatus).join(',')]);

  // 组件卸载时清理轮询
  useEffect(() => () => stopPolling(), []);

  const { messages, isConnected, isStreaming, sendMessage, abortChat, clearMessages } = useChat({ projectId: String(projectId) });
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!projectId) return;
    loadAll();
  }, [projectId]);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [p, f, r] = await Promise.all([
        window.electronAPI.apiRequest('GET', `/api/projects/${projectId}`),
        window.electronAPI.apiRequest('GET', `/api/projects/${projectId}/files`),
        window.electronAPI.apiRequest('GET', `/api/projects/${projectId}/reports`),
      ]);
      if (p.success && p.data) {
        setProject(p.data);
        // checklist 字段：后端返回 List<Map<String,Object>>，每个 map 就是 ChecklistItem
        const cl = p.data.checklist || [];
        setChecklist(Array.isArray(cl) ? cl : []);
      } else {
        setError(p.error || '加载项目失败');
      }
      if (f.success) setFiles(f.data || []);
      if (r.success) setReports(r.data || []);
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (itemId: string, file: File) => {
    const markId = itemId || `noitem-${file.name}`;
    setUploadingIds(prev => new Set(prev).add(markId));
    try {
      const auth = await window.electronAPI.getAuthStatus();
      const baseUrl = (auth.apiUrl && auth.apiUrl.trim()) ? auth.apiUrl.trim() : 'http://localhost:8080';
      const headers: Record<string, string> = auth.token ? { Authorization: `Bearer ${auth.token}` } : {};

      // Step 1: 计算 SHA-256（去重检查）
      let fileHash = '';
      try {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        fileHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        // 检查是否已存在
        const checkRes = await fetch(`${baseUrl}/api/projects/${projectId}/files/check-hash`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ hash: fileHash }),
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const exists = checkData?.data?.exists ?? checkData?.exists;
          if (exists) {
            console.info('[Upload] 文件已存在（SHA-256 去重），跳过上传:', file.name);
            await loadAll();
            return;
          }
        }
      } catch (hashErr) {
        console.warn('[Upload] SHA-256 计算失败，跳过去重检查:', hashErr);
      }

      // Step 2: 根据文件大小选择上传方式
      const CHUNK_THRESHOLD = 10 * 1024 * 1024; // 10MB 以上用分片
      if (file.size > CHUNK_THRESHOLD) {
        await uploadChunked(file, itemId, fileHash, baseUrl, headers);
      } else {
        await uploadSingle(file, itemId, fileHash, baseUrl, headers);
      }
      await loadAll();
    } catch (e: any) {
      console.warn('[Upload] error', e.message);
    } finally {
      setUploadingIds(prev => { const s = new Set(prev); s.delete(markId); return s; });
    }
  };

  /** 单文件上传（<10MB） */
  const uploadSingle = async (file: File, itemId: string, fileHash: string, baseUrl: string, headers: Record<string, string>) => {
    const form = new FormData();
    form.append('file', file);
    if (itemId) form.append('checklistItemId', itemId);
    if (fileHash) form.append('hash', fileHash);
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST', headers, body: form,
    });
    if (!res.ok) console.warn('[Upload] single failed', res.status, await res.text());
  };

  /** 分片上传（≥10MB）：5MB/片，支持大文件 */
  const uploadChunked = async (file: File, itemId: string, fileHash: string, baseUrl: string, headers: Record<string, string>) => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB/片（MinIO 最小分片要求）
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

    // 1. 初始化
    const initRes = await fetch(`${baseUrl}/api/projects/${projectId}/files/multipart/init`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ filename: file.name, fileSize: file.size, contentType: file.type || 'application/octet-stream' }),
    });
    if (!initRes.ok) throw new Error(`分片初始化失败: ${initRes.status}`);
    const { uploadId, storageKey } = (await initRes.json()).data ?? await initRes.json();

    // 2. 逐片上传
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const form = new FormData();
      form.append('chunk', chunk, file.name);

      const chunkRes = await fetch(
        `${baseUrl}/api/projects/${projectId}/files/multipart/chunk?uploadId=${encodeURIComponent(uploadId)}&partNumber=${i + 1}&storageKey=${encodeURIComponent(storageKey)}`,
        { method: 'PUT', headers, body: form }
      );
      if (!chunkRes.ok) {
        // 取消上传
        await fetch(`${baseUrl}/api/projects/${projectId}/files/multipart/abort?uploadId=${encodeURIComponent(uploadId)}&storageKey=${encodeURIComponent(storageKey)}`, { method: 'DELETE', headers });
        throw new Error(`分片 ${i + 1}/${totalChunks} 上传失败: ${chunkRes.status}`);
      }
      console.info(`[Upload] 分片 ${i + 1}/${totalChunks} 完成`);
    }

    // 3. 合并
    const completeRes = await fetch(`${baseUrl}/api/projects/${projectId}/files/multipart/complete`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ uploadId, storageKey, filename: file.name, fileSize: file.size, contentType: file.type || 'application/octet-stream', checklistItemId: itemId || null, fileHash }),
    });
    if (!completeRes.ok) throw new Error(`分片合并失败: ${completeRes.status}`);
    console.info('[Upload] 分片上传完成:', file.name);
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setChatInput('');
    const res = await window.electronAPI.apiRequest('POST', `/api/projects/${projectId}/reports`);
    setGeneratingReport(false);
    if (res.success) {
      setTab('reports');
      // 切到报告 Tab 后查询最新执行 ID 用于工作台展示
      setTimeout(async () => {
        try {
          const execRes = await window.electronAPI.apiRequest('GET', `/api/agent-executions/by-project/${projectId}`);
          if (execRes.success && execRes.data && execRes.data.length > 0) {
            // 第一个就是最新的（按 startedAt 倒序）
            setActiveExecutionId(execRes.data[0].id);
          }
        } catch { /* 静默 */ }
      }, 500);
      loadAll();
      // 生成成功后，通过 AI 对话通知用户（带项目上下文）
      const projectContext = project ? `你是「${project.enterpriseName}」项目的专属合规助手。` : '';
      await sendMessage(
        `已为「${project?.enterpriseName}」触发报告生成，左侧「报告」Tab 顶部可看到智能体的实时工作过程。`,
        projectContext
      );
    }
  };

  const handleSignReport = async (reportId: number) => {
    await window.electronAPI.apiRequest('PUT', `/api/projects/${projectId}/reports/${reportId}/sign`);
    loadAll();
  };

  const handleDeleteReport = async (reportId: number) => {
    await window.electronAPI.apiRequest('DELETE', `/api/projects/${projectId}/reports/${reportId}`);
    loadAll();
  };

  const handleSendChat = async (overrideText?: string) => {
    const text = (overrideText ?? chatInput).trim();
    if (!text || isStreaming) return;
    if (!overrideText) setChatInput('');

    // 构建丰富的项目上下文系统提示
    const required = checklist.filter(i => i.required !== false);
    const uploadedCount = new Set(files.filter(f => f.checklistItemId).map(f => f.checklistItemId)).size;
    const parsedFiles = files.filter(f => f.parseStatus === 'PARSED');
    const pendingFiles = files.filter(f => f.parseStatus === 'PENDING' || f.parseStatus === 'PARSING');

    const projectContext = [
      `## 项目上下文`,
      `你是「${project.enterpriseName}」合规项目的专属 AI 合规助手。`,
      ``,
      `**项目信息**`,
      `- 项目名称：${project.name}`,
      `- 企业名称：${project.enterpriseName}`,
      `- 项目 ID：${projectId}`,
      ``,
      `**资料清单状态**`,
      `- 必填项完成：${uploadedCount} / ${required.length} 项`,
      parsedFiles.length > 0 ? `- 已解析文件（${parsedFiles.length}个）：${parsedFiles.map(f => f.originalName).join('、')}` : '- 暂无已解析文件',
      pendingFiles.length > 0 ? `- 解析中文件（${pendingFiles.length}个）：${pendingFiles.map(f => f.originalName).join('、')}` : '',
      reports.length > 0 ? `- 已生成报告：${reports.length} 份` : '- 暂无报告',
      ``,
      `**回答规则**`,
      `1. 所有分析仅针对本项目（${project.enterpriseName}），不讨论其他项目`,
      `2. 引用法规时注明名称和条款号：《法规名称》第X条`,
      `3. 回答末尾用 [引用] 格式列出法规依据`,
      `4. 如资料不足，明确说明需要补充哪些资料`,
    ].filter(Boolean).join('\n');

    await sendMessage(text, projectContext);
  };

  // 快捷指令：直接发送（不经过输入框）
  const handleQuickCommand = async (cmd: { text?: string; action?: () => void }) => {
    if (cmd.action) { cmd.action(); return; }
    if (cmd.text) await handleSendChat(cmd.text);
  };

  // 点击 Checklist 某项（待上传状态）→ AI 主动提示内容要求（REQ-CHAT-03）
  // 必须在所有提前 return 之前定义，遵守 Rules of Hooks
  const handleChecklistItemClick = useCallback((item: ChecklistItem) => {
    if (!item.content_requirement) return;
    const prompt = `关于「${item.name}」这份资料：${item.content_requirement}${item.format ? `，格式要求：${item.format}` : ''}。请问收集这份资料时需要注意什么？`;
    setChatInput(prompt);
  }, []);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !project) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <p className="text-red-400">{error || '项目不存在'}</p>
      <button onClick={() => navigate('/projects')} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm">返回项目列表</button>
    </div>
  );

  // 计算 Checklist 进度
  const required = checklist.filter(i => i.required !== false);
  const uploadedItemIds = new Set(files.filter(f => f.checklistItemId).map(f => f.checklistItemId));
  const done = required.filter(i => uploadedItemIds.has(i.id)).length;

  // 按阶段分组
  const phases = new Map<string, { name: string; items: ChecklistItem[] }>();
  checklist.forEach(item => {
    const key = item.phase_id || 'default';
    if (!phases.has(key)) phases.set(key, { name: item.phase_name || '资料清单', items: [] });
    phases.get(key)!.items.push(item);
  });

  const quickCommands: { label: string; icon: React.ElementType; text?: string; action?: () => void; color?: string }[] = [
    { label: '检查清单', icon: ClipboardList, text: `请检查「${project?.enterpriseName}」的资料清单完成情况，列出所有未上传的必填项，并说明每项的重要性。`, color: 'text-brand-400' },
    { label: '分析风险', icon: Scale, text: `请基于已上传的资料，对「${project?.enterpriseName}」进行合规风险分析，按高/中/低风险分级列出，每项风险附上法规依据和建议措施。`, color: 'text-amber-400' },
    { label: '资料要求', icon: BookOpen, text: `请详细说明「${project?.enterpriseName}」项目还需要补充哪些资料，以及每份资料的具体内容要求和格式要求。`, color: 'text-emerald-400' },
    { label: '生成报告', icon: Zap, action: handleGenerateReport, color: 'text-purple-400' },
  ];

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* ===== 左侧工作区 ===== */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800">
        {/* 顶栏 */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/projects')} className="text-slate-400 hover:text-slate-200 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-sm font-semibold text-slate-200 truncate max-w-xs">{project.name}</h2>
              <p className="text-xs text-slate-500">{project.enterpriseName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadAll} className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleGenerateReport}
              disabled={generatingReport}
              className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1.5 hover:bg-brand-700 transition-colors"
            >
              {generatingReport ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              生成报告
            </button>
          </div>
        </header>

        {/* Tab 栏 */}
        <div className="flex border-b border-slate-800 flex-shrink-0">
          {([
            ['checklist', '资料清单', ClipboardList],
            ['files', '项目网盘', Upload],
            ['reports', '报告', FileText],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                tab === key ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />{label}
              {key === 'checklist' && required.length > 0 && (
                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${done === required.length ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                  {done}/{required.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'checklist' && <ChecklistTab checklist={checklist} files={files} phases={phases} required={required} done={done} uploadedItemIds={uploadedItemIds} uploadingIds={uploadingIds} onUpload={handleUpload} onItemClick={handleChecklistItemClick} />}
          {tab === 'files' && <FilesTab files={files} projectId={projectId} uploadingIds={uploadingIds} onUpload={handleUpload} onRefresh={loadAll} />}
          {tab === 'reports' && <ReportsTab reports={reports} onSign={handleSignReport} onDelete={handleDeleteReport} projectId={projectId} agentId={project?.appId || 0} activeExecutionId={activeExecutionId} onExecutionComplete={() => loadAll()} />}
        </div>
      </div>

      {/* ===== 右侧 AI 对话面板 ===== */}
      <div className={`flex-shrink-0 flex flex-col bg-slate-950 border-l border-slate-800 transition-all duration-300 ${chatCollapsed ? 'w-10' : 'w-96'}`}>

        {/* 折叠时只显示图标条 */}
        {chatCollapsed ? (
          <div className="flex flex-col items-center py-4 gap-3">
            <button onClick={() => setChatCollapsed(false)} className="p-2 rounded-lg text-slate-400 hover:text-brand-400 hover:bg-slate-800 transition-colors" title="展开 AI 助手">
              <PanelRightOpen className="w-4 h-4" />
            </button>
            <div className="w-px flex-1 bg-slate-800" />
            <MessageSquare className="w-4 h-4 text-slate-600" />
          </div>
        ) : (
          <>
            {/* 面板头部 */}
            <div className="h-14 flex items-center px-4 border-b border-slate-800 flex-shrink-0 gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-600/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-200">AI 合规助手</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-slate-500 truncate">{project.enterpriseName}</span>
                  {/* 记忆状态指示器 */}
                  <span className="flex items-center gap-0.5 text-[10px] text-brand-400/70 flex-shrink-0" title="三层记忆已启用：项目状态 + 会话摘要 + 实时历史">
                    <span>🧠</span>
                    <span>记忆</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} title={isConnected ? '已连接' : '未连接'} />
                {messages.length > 0 && (
                  <button onClick={() => clearMessages()} className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors" title="清空对话">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setChatCollapsed(true)} className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors" title="收起">
                  <PanelRightClose className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 消息区 */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
              {messages.length === 0 ? (
                <div className="py-6">
                  {/* 欢迎提示 */}
                  <div className="text-center mb-5">
                    <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center mx-auto mb-3">
                      <Scale className="w-5 h-5 text-brand-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-300 mb-1">合规分析助手</p>
                    <p className="text-xs text-slate-500 leading-relaxed">基于项目资料和法规库，提供专业合规分析</p>
                  </div>
                  {/* 快捷指令卡片 */}
                  <div className="space-y-2">
                    {quickCommands.map(cmd => (
                      <button key={cmd.label} onClick={() => handleQuickCommand(cmd)}
                        disabled={(cmd.label === '生成报告' && generatingReport) || isStreaming}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 transition-all text-left disabled:opacity-50 group">
                        <div className={`w-7 h-7 rounded-lg bg-slate-800 group-hover:bg-slate-700 flex items-center justify-center flex-shrink-0 transition-colors`}>
                          <cmd.icon className={`w-3.5 h-3.5 ${cmd.color || 'text-slate-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-300">
                            {cmd.label === '生成报告' && generatingReport ? '生成中...' : cmd.label}
                          </div>
                          <div className="text-[10px] text-slate-600 truncate mt-0.5">
                            {cmd.label === '检查清单' && '查看未完成的必填资料'}
                            {cmd.label === '分析风险' && '基于已上传资料分析合规风险'}
                            {cmd.label === '资料要求' && '了解每份资料的具体要求'}
                            {cmd.label === '生成报告' && '触发 AI 分析并生成报告'}
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                  <p className="text-center text-[10px] text-slate-700 mt-4">或直接在下方输入问题</p>
                </div>
              ) : (
                <>
                  {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
                  {/* 快捷指令（有消息时显示在底部，更紧凑） */}
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-800/50">
                    {quickCommands.map(cmd => (
                      <button key={cmd.label} onClick={() => handleQuickCommand(cmd)}
                        disabled={(cmd.label === '生成报告' && generatingReport) || isStreaming}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors disabled:opacity-50 ${
                          cmd.label === '生成报告'
                            ? 'bg-purple-900/20 border-purple-700/40 text-purple-300 hover:bg-purple-900/30'
                            : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}>
                        <cmd.icon className={`w-3 h-3 ${cmd.color || ''}`} />
                        {cmd.label === '生成报告' && generatingReport ? '生成中...' : cmd.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 输入区 */}
            <div className="px-3 pb-3 flex-shrink-0">
              <div className={`flex gap-2 items-end rounded-xl border transition-colors ${isStreaming ? 'border-brand-500/50 bg-slate-900' : 'border-slate-700 bg-slate-900 focus-within:border-brand-500/70'}`}>
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
                  }}
                  placeholder={isConnected ? '输入问题，Enter 发送，Shift+Enter 换行' : '未连接 Gateway'}
                  rows={3}
                  className="flex-1 px-3 py-2.5 bg-transparent text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none resize-none leading-relaxed"
                  disabled={isStreaming || !isConnected}
                />
                <div className="flex flex-col gap-1 p-2 flex-shrink-0">
                  {isStreaming ? (
                    <button onClick={abortChat} className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center hover:bg-red-600/30 transition-colors" title="停止">
                      <StopCircle className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={() => handleSendChat()} disabled={!chatInput.trim() || !isConnected}
                      className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-brand-700 transition-colors" title="发送 (Enter)">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-center text-[10px] text-slate-700 mt-1.5">⚖️ AI 生成，仅供参考，不构成法律意见</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ===== Checklist Tab =====
const ChecklistTab: React.FC<{
  checklist: ChecklistItem[];
  files: FileItem[];
  phases: Map<string, { name: string; items: ChecklistItem[] }>;
  required: ChecklistItem[];
  done: number;
  uploadedItemIds: Set<string | undefined>;
  uploadingIds: Set<string>;
  onUpload: (itemId: string, file: File) => void;
  onItemClick?: (item: ChecklistItem) => void;
}> = ({ checklist, files, phases, required, done, uploadedItemIds, uploadingIds, onUpload, onItemClick }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const togglePhase = (key: string) => {
    setCollapsed(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  };

  if (checklist.length === 0) return (
    <div className="text-center py-12 text-slate-500">
      <ClipboardList className="w-10 h-10 mx-auto mb-2 text-slate-700" />
      <p>暂无资料清单</p>
      <p className="text-xs mt-1 text-slate-600">该项目未关联智能体，或智能体未配置 Checklist</p>
    </div>
  );

  return (
    <div>
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>必填资料完成进度</span>
          <span className={done === required.length && required.length > 0 ? 'text-emerald-400' : ''}>{done}/{required.length}</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${required.length ? (done / required.length) * 100 : 0}%` }} />
        </div>
      </div>

      {Array.from(phases.entries()).map(([phaseId, phase]) => {
        const phaseUploaded = phase.items.filter(i => uploadedItemIds.has(i.id)).length;
        const isCollapsed = collapsed.has(phaseId);
        return (
          <div key={phaseId} className="mb-4">
            <button onClick={() => togglePhase(phaseId)} className="w-full flex items-center justify-between py-1.5 text-left group">
              <div className="flex items-center gap-2">
                {isCollapsed ? <ChevronRightIcon className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{phase.name}</span>
              </div>
              <span className="text-xs text-slate-600">{phaseUploaded}/{phase.items.length}</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-1.5 mt-1">
                {phase.items.map(item => {
                  const hasFile = uploadedItemIds.has(item.id);
                  const fileForItem = files.find(f => f.checklistItemId === item.id);
                  const isUploading = uploadingIds.has(item.id);
                  return (
                    <div key={item.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${hasFile ? 'border-emerald-800/50 bg-emerald-900/10' : 'border-slate-800 bg-slate-900/50'}`}>
                      <span className="text-base flex-shrink-0">{hasFile ? '✅' : item.required !== false ? '⬜' : '🔲'}</span>
                      <div
                        className={`flex-1 min-w-0 ${!hasFile && onItemClick ? 'cursor-pointer' : ''}`}
                        onClick={() => !hasFile && onItemClick?.(item)}
                        title={!hasFile && item.content_requirement ? '点击询问 AI 该资料的要求' : undefined}
                      >
                        <div className="text-sm text-slate-200 truncate">{item.name}</div>
                        {item.content_requirement && <div className="text-xs text-slate-500 truncate">{item.content_requirement}</div>}
                      </div>
                      {fileForItem && (
                        <span className={`text-xs flex-shrink-0 ${PARSE_STATUS[fileForItem.parseStatus]?.color || 'text-slate-400'}`}>
                          {PARSE_STATUS[fileForItem.parseStatus]?.label || fileForItem.parseStatus}
                        </span>
                      )}
                      <label className={`cursor-pointer px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs flex items-center gap-1 hover:bg-slate-700 flex-shrink-0 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {isUploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        上传
                        <input type="file" className="hidden" onChange={e => e.target.files?.[0] && onUpload(item.id, e.target.files[0])} disabled={isUploading} />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ===== Files Tab =====
const FilesTab: React.FC<{
  files: FileItem[];
  projectId: number;
  uploadingIds: Set<string>;
  onUpload: (itemId: string, file: File) => void;
  onRefresh: () => void;
}> = ({ files, projectId, uploadingIds, onUpload, onRefresh }) => {
  const isUploading = uploadingIds.size > 0;
  return (
    <div>
      <label className={`block w-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${isUploading ? 'border-brand-600/50 bg-brand-900/10' : 'border-slate-700 hover:border-slate-600'}`}>
        {isUploading ? (
          <>
            <RefreshCw className="w-8 h-8 text-brand-400 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-brand-400">上传中...</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-400">拖拽文件到此处，或点击选择文件</p>
            <p className="text-xs text-slate-600 mt-1">支持 PDF / Word / Excel / 图片，单文件 ≤ 50MB</p>
          </>
        )}
        <input type="file" multiple className="hidden" disabled={isUploading} onChange={e => {
          Array.from(e.target.files || []).forEach(f => onUpload('', f));
        }} />
      </label>

      <div className="space-y-2">
        {files.map(f => (
          <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg">
            <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 truncate">{f.originalName}</div>
              <div className="text-xs text-slate-500">{Math.round(f.fileSize / 1024)} KB · {new Date(f.createdAt).toLocaleDateString('zh-CN')}</div>
            </div>
            <span className={`text-xs flex-shrink-0 ${PARSE_STATUS[f.parseStatus]?.color || 'text-slate-400'}`}>
              {PARSE_STATUS[f.parseStatus]?.label || f.parseStatus}
            </span>
            <button
              onClick={async () => {
                const res = await window.electronAPI.apiRequest('GET', `/api/projects/${projectId}/files/${f.id}/presign`);
                if (res.success && res.data) window.electronAPI.openExternal(res.data);
              }}
              className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
              title="下载"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        ))}
        {files.length === 0 && (
          <div className="text-center py-10 text-slate-500">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-700" />
            <p className="text-sm">暂无文件</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ===== Reports Tab =====

/** 把 skillOutput 渲染成专业法律文书 HTML */
function buildReportHtml(report: ReportItem): string {
  const d = report.skillOutput || {};
  const merger = (d.modules?.merger_decision) || {};
  const corp = (d.modules?.corporate_status) || {};
  const assets = (d.modules?.assets_ip) || {};
  const biz = (d.modules?.business_compliance) || {};
  const debts = (d.modules?.debts_guarantees) || {};
  const hr = (d.modules?.hr_labor) || {};
  const tax = (d.modules?.tax_compliance) || {};
  const aeo = (d.modules?.aeo_valuation) || null;
  const risks: any[] = d.risk_summary || [];
  const citations: any[] = d.law_citations || [];

  const riskTag = (level: string) => {
    if (level === 'high') return '<span class="risk-tag high">高风险</span>';
    if (level === 'low') return '<span class="risk-tag low">低风险</span>';
    return '<span class="risk-tag mid">中等风险</span>';
  };

  const rows = (obj: Record<string, any>) =>
    Object.entries(obj).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

  const listItems = (arr: string[]) =>
    arr?.length ? `<ul>${arr.map(f => `<li>${f}</li>`).join('')}</ul>` : '';

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"SimSun","宋体","Times New Roman",serif;font-size:12pt;line-height:1.9;color:#1a1a1a;background:#fff;max-width:900px;margin:0 auto;padding:30px 40px}
.cover{text-align:center;padding:60px 0 40px;border-bottom:3px double #1a3a6b;margin-bottom:50px}
.cover-logo{font-size:10pt;color:#1a3a6b;letter-spacing:4px;margin-bottom:40px;font-family:Arial,sans-serif}
.cover-badge{display:inline-block;border:1px solid #1a3a6b;color:#1a3a6b;font-size:10pt;padding:3px 16px;letter-spacing:2px;margin-bottom:30px}
.cover-title{font-size:24pt;font-weight:bold;color:#0d1f3c;line-height:1.4;margin-bottom:8px;letter-spacing:2px}
.cover-subtitle{font-size:14pt;color:#1a3a6b;margin-bottom:40px;letter-spacing:3px}
.cover-divider{width:60px;height:2px;background:#1a3a6b;margin:0 auto 36px}
.cover-meta{margin:0 auto;font-size:11pt;line-height:2.8;text-align:left;display:inline-block}
.cover-meta td:first-child{color:#666;padding-right:20px;white-space:nowrap}
.cover-meta td:last-child{font-weight:bold;color:#0d1f3c}
.cover-footer{margin-top:40px;font-size:9.5pt;color:#888}
h1{font-size:18pt;font-weight:bold;color:#0d1f3c;text-align:center;margin:36px 0 20px;padding-bottom:8px;border-bottom:2px solid #1a3a6b;letter-spacing:2px}
h2{font-size:13pt;font-weight:bold;color:#0d1f3c;margin:24px 0 12px;padding:5px 0 5px 10px;border-left:4px solid #1a3a6b;background:#f5f7fa}
h3{font-size:12pt;font-weight:bold;color:#1a3a6b;margin:18px 0 8px}
p{margin:8px 0;text-indent:2em;text-align:justify;line-height:1.9}
p.ni{text-indent:0}
ul,ol{margin:8px 0 8px 2.5em}li{margin:4px 0;line-height:1.8}
.summary-box{border:1px solid #1a3a6b;padding:16px 20px;margin:16px 0;background:#f8faff}
.summary-box p{text-indent:0}
.conclusion-box{border:2px solid #1a3a6b;background:#eef2ff;padding:14px 18px;margin:14px 0}
.conclusion-box p{text-indent:0;margin:4px 0}
.conclusion-box .label{font-weight:bold;color:#0d1f3c;font-size:11pt}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:10.5pt}
.tcap{font-size:10pt;color:#555;text-align:center;margin-bottom:5px;font-style:italic}
thead tr th{background:#1a3a6b;color:#fff;padding:7px 10px;text-align:center;font-weight:bold;border:1px solid #1a3a6b;font-size:10pt}
tbody tr td{padding:6px 10px;border:1px solid #c8d0dc;vertical-align:top;line-height:1.6}
tbody tr:nth-child(even) td{background:#f5f7fa}
tfoot tr td,tfoot tr th{background:#e8edf5;font-weight:bold;padding:6px 10px;border:1px solid #c8d0dc}
.risk-tag{display:inline-block;padding:1px 7px;border-radius:2px;font-size:9pt;font-weight:bold}
.risk-tag.high{background:#fde8e8;color:#c00;border:1px solid #f5c6c6}
.risk-tag.mid{background:#fff3e0;color:#c67000;border:1px solid #ffd699}
.risk-tag.low{background:#e8f5e9;color:#1a7a1a;border:1px solid #b2dfb2}
.finding-item{border:1px solid #dde3ec;padding:12px 16px;margin:10px 0;background:#fafbfd}
.finding-item .ft{font-weight:bold;font-size:11pt;color:#0d1f3c;margin-bottom:5px}
.finding-item p{text-indent:0;margin:3px 0;font-size:10.5pt}
.finding-item .fl{font-size:10pt;color:#555;font-style:italic;margin-top:5px}
.finding-item .fr{font-size:10.5pt;color:#1a3a6b;margin-top:3px}
.citation-item{font-size:10pt;color:#444;background:#f5f7fa;border-left:3px solid #1a3a6b;padding:5px 12px;margin:5px 0;line-height:1.7}
.cite-ref{font-weight:bold;color:#1a3a6b;margin-right:5px}
.disclaimer{font-size:9.5pt;color:#666;border-top:1px solid #ccc;margin-top:36px;padding-top:12px;line-height:1.8}
.disclaimer p{text-indent:0;margin:3px 0}
.section{margin-top:40px}
</style></head><body>

<div class="cover">
  <div class="cover-logo">ClawComply · 合规平台</div>
  <div class="cover-badge">法律尽职调查报告</div>
  <div class="cover-title">${d.enterprise_name || '企业名称'}</div>
  <div class="cover-subtitle">外商投资企业吸收合并专项</div>
  <div class="cover-divider"></div>
  <table class="cover-meta">
    <tr><td>报告日期</td><td>${d.report_date || ''}</td></tr>
    <tr><td>报告编号</td><td>${d.report_id || ''}</td></tr>
    <tr><td>编制单位</td><td>${d.law_firm || '某律师事务所'}</td></tr>
    <tr><td>主理律师</td><td>${d.lawyer_name || '主理律师'}</td></tr>
    <tr><td>报告状态</td><td>中期稿</td></tr>
  </table>
  <div class="cover-footer">本报告仅供委托方内部使用，未经书面授权不得对外披露</div>
</div>

<div class="section">
<h1>核心摘要与关键发现</h1>
<h2>一、核心结论</h2>
<div class="conclusion-box">
  <p class="label ni">【推荐方案】${merger.recommendation || '待律师确认'}</p>
  ${merger.recommendation_rationale ? `<p class="ni">${merger.recommendation_rationale}</p>` : ''}
  ${merger.lawyer_judgment ? `<p class="ni"><strong>律师综合判断：</strong>${merger.lawyer_judgment}</p>` : ''}
</div>

<h2>二、关键风险发现</h2>
${risks.length ? risks.map(r => `
<div class="finding-item">
  <div class="ft">${riskTag(r.level)} &nbsp;${r.title}</div>
  <p>${r.description}</p>
  ${r.law_citation ? `<p class="fl">法规依据：${r.law_citation}</p>` : ''}
  ${r.recommendation ? `<p class="fr">建议措施：${r.recommendation}</p>` : ''}
</div>`).join('') : '<p>（待分析）</p>'}

<h2>三、四情景税务净收益对比</h2>
${merger.tax_scenarios ? `
<p class="tcap">表1：四种合并情景税务净收益对比（单位：万元）</p>
<table>
  <thead><tr><th style="width:10%">情景</th><th style="width:35%">方案描述</th><th style="width:18%">税务净收益</th><th style="width:37%">核心说明</th></tr></thead>
  <tbody>${merger.tax_scenarios.map((s: any) => `
  <tr>
    <td style="text-align:center;font-weight:bold">${s.id}</td>
    <td>${s.name}</td>
    <td style="text-align:center;font-weight:bold;color:${s.net_benefit?.includes('+') ? '#1a7a1a' : '#c00'}">${s.net_benefit}</td>
    <td style="font-size:9.5pt">${s.description}</td>
  </tr>`).join('')}</tbody>
</table>` : ''}
</div>

<div class="section">
<h1>第一章　主体资格与公司治理</h1>
<h2>1.1　设立与存续合法性</h2>
<p>${corp['MOD-003-01']?.summary || '（待资料上传后自动分析）'}</p>
${listItems(corp['MOD-003-01']?.findings)}
<h2>1.2　股东与股权结构</h2>
<p>${corp['MOD-003-02']?.summary || '（待资料上传后自动分析）'}</p>
${listItems(corp['MOD-003-02']?.findings)}
<h2>1.3　公司治理</h2>
<p>${corp['MOD-003-03']?.summary || '（待资料上传后自动分析）'}</p>
${listItems(corp['MOD-003-03']?.findings)}
</div>

<div class="section">
<h1>第二章　主要资产与知识产权</h1>
<h2>2.1　土地及不动产</h2>
<p>${assets['MOD-004-01']?.summary || '（待资料上传后自动分析）'}</p>
${assets['MOD-004-01']?.key_data ? `
<p class="tcap">表2：不动产关键数据</p>
<table><thead><tr><th>项目</th><th>数据</th></tr></thead>
<tbody>${rows(assets['MOD-004-01'].key_data)}</tbody></table>` : ''}
<h2>2.2　核心生产设备</h2>
<p>${assets['MOD-004-02']?.summary || '（待资料上传后自动分析）'}</p>
<h2>2.3　知识产权（许可使用）</h2>
<p>${assets['MOD-004-03']?.summary || '（待资料上传后自动分析）'}</p>
${listItems(assets['MOD-004-03']?.findings)}
</div>

<div class="section">
<h1>第三章　业务合规与经营资质</h1>
<p>${biz['MOD-005-01']?.summary || '（待资料上传后自动分析）'}</p>
${biz['MOD-005-01']?.qualifications ? `
<h2>3.1　经营资质清单（共48项）</h2>
<p class="tcap">表3：主要经营资质合并处理方式</p>
<table>
  <thead><tr><th style="width:35%">资质名称</th><th style="width:12%">类型</th><th style="width:38%">合并处理方式</th><th style="width:15%">难度</th></tr></thead>
  <tbody>${biz['MOD-005-01'].qualifications.map((q: any) => `
  <tr>
    <td>${q.name}</td>
    <td style="text-align:center">${q.type}</td>
    <td style="font-size:9.5pt">${q.merger_action}</td>
    <td style="text-align:center">${riskTag(q.difficulty === '高' ? 'high' : q.difficulty === '低' ? 'low' : 'mid').replace(/高风险|中等风险|低风险/, q.difficulty)}</td>
  </tr>`).join('')}</tbody>
</table>` : ''}
</div>

<div class="section">
<h1>第四章　债务、人力与财税合规</h1>
<h2>4.1　债务与或有负债</h2>
<p>${debts['MOD-006-01']?.summary || '（待资料上传后自动分析）'}</p>
${listItems(debts['MOD-006-01']?.findings)}
<h2>4.2　人力资源与劳动关系</h2>
<p>${hr['MOD-007-01']?.summary || '（待资料上传后自动分析）'}</p>
${listItems(hr['MOD-007-01']?.findings)}
<h2>4.3　财税合规评价</h2>
<p>${tax['MOD-008-01']?.summary || '（待资料上传后自动分析）'}</p>
${tax['MOD-008-01']?.key_data ? `
<p class="tcap">表4：财税关键数据</p>
<table><thead><tr><th>项目</th><th>数据</th></tr></thead>
<tbody>${rows(tax['MOD-008-01'].key_data)}</tbody></table>` : ''}
</div>

<div class="section">
<h1>第五章　吸收合并决策分析</h1>
${merger.tax_scenarios ? merger.tax_scenarios.map((s: any) => `
<h2>${s.id}：${s.name}</h2>
<p>${s.description}</p>`).join('') : ''}
${merger.weighted_scores ? `
<h2>5.2　多维度加权评分排名</h2>
<p class="tcap">表5：多维度加权评分排名</p>
<table>
  <thead><tr><th>排名</th><th>情景</th><th>加权得分</th></tr></thead>
  <tbody>${merger.weighted_scores.map((s: any) => `
  <tr>
    <td style="text-align:center;font-weight:bold">第${s.rank}名</td>
    <td>${s.scenario_id}</td>
    <td style="text-align:center;font-weight:bold">${s.weighted_score}</td>
  </tr>`).join('')}</tbody>
</table>` : ''}
<h2>5.3　综合结论与建议</h2>
<div class="conclusion-box">
  <p class="label ni">【推荐方案】${merger.recommendation || '待律师确认'}</p>
  ${merger.recommendation_rationale ? `<p class="ni">${merger.recommendation_rationale}</p>` : ''}
  ${merger.lawyer_judgment ? `<p class="ni"><strong>律师综合判断：</strong>${merger.lawyer_judgment}</p>` : ''}
</div>
</div>

${aeo ? `
<div class="section">
<h1>第六章　AEO 资质影响评估</h1>
<p>${aeo.summary || ''}</p>
<p class="tcap">表6：AEO资质价值量化</p>
<table>
  <thead><tr><th>评估维度</th><th>金额</th></tr></thead>
  <tbody>
    <tr><td>查验成本增加额（年）</td><td>${aeo.inspection_cost_increase}</td></tr>
    <tr><td>资金占用成本（年）</td><td>${aeo.capital_occupation_cost}</td></tr>
    <tr><td>订单潜在损失</td><td>${aeo.order_loss}</td></tr>
    <tr><td>恢复资质投入</td><td>${aeo.recovery_investment}</td></tr>
  </tbody>
  <tfoot><tr><td><strong>AEO 资质综合价值区间</strong></td><td><strong>${aeo.value_range}</strong></td></tr></tfoot>
</table>
</div>` : ''}

<div class="section">
<h1>附　录　法规引用</h1>
${citations.length ? `<div>${citations.map((c: any, i: number) => `
<div class="citation-item">
  <span class="cite-ref">[${i + 1}]</span>
  《${c.law_name}》${c.article}：${c.text}
</div>`).join('')}</div>` : '<p>（法规引用将在 Skill 执行后自动汇总）</p>'}

<div class="disclaimer">
  <p>⚖️ <strong>免责声明</strong></p>
  <p>本报告由 AI 辅助生成，经律师审核确认。报告内容仅供参考，不构成正式法律意见。所有结论均基于委托方提供的资料，律师对资料真实性不承担核实责任。</p>
  <p>报告编号：${d.report_id || ''} &nbsp;|&nbsp; 生成时间：${d.report_date || ''} &nbsp;|&nbsp; 编制单位：${d.law_firm || '某律师事务所'}</p>
</div>
</div>

</body></html>`;
}

const ReportsTab: React.FC<{
  reports: ReportItem[];
  projectId: number;
  agentId: number;
  activeExecutionId: number | null;
  onSign: (id: number) => void;
  onDelete: (id: number) => void;
  onExecutionComplete?: () => void;
}> = ({ reports, projectId, agentId, activeExecutionId, onSign, onDelete, onExecutionComplete }) => {
  const [previewReport, setPreviewReport] = useState<ReportItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handlePreview = async (r: ReportItem) => {
    // 优先展示内嵌 HTML 预览（基于 skillOutput 渲染，不依赖外部 URL）
    if (r.skillOutput) {
      setPreviewReport(r);
      return;
    }
    // skillOutput 为空但有 PDF 路径：尝试获取预签名 URL 用系统 PDF 阅读器打开
    if (r.pdfPath) {
      const res = await window.electronAPI.apiRequest('GET', `/api/projects/${projectId}/reports/${r.id}/download`);
      if (res.success && res.data) {
        window.electronAPI.openExternal(res.data);
        return;
      }
    }
    // 兜底：展示空预览
    setPreviewReport(r);
  };

  const confirmDelete = (id: number) => setConfirmDeleteId(id);

  const doDelete = () => {
    if (confirmDeleteId !== null) {
      onDelete(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* 智能体工作台（执行时实时显示） */}
      {activeExecutionId && (
        <AgentWorkbench
          executionId={activeExecutionId}
          onComplete={() => onExecutionComplete?.()}
          className="mb-2"
        />
      )}

      {reports.map(r => (
        <div key={r.id} className="px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 truncate">{r.title}</div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(r.createdAt).toLocaleString('zh-CN')}
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
              r.status === 'SIGNED' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-slate-800 text-slate-400'
            }`}>
              {r.status === 'DRAFT' ? '草稿' : r.status === 'SIGNED' ? '已发布' : r.status}
            </span>
          </div>

          {/* 智能体反馈：让律师对整份报告作出快速反馈 */}
          {r.skillOutput && agentId > 0 && (
            <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-slate-800/50">
              <span className="text-xs text-slate-500">这份报告：</span>
              <AgentFeedback
                agentId={agentId}
                projectId={projectId}
                reportId={r.id}
                targetModule="overall"
                targetExcerpt={r.title}
                size="sm"
              />
              <span className="text-xs text-slate-600 ml-auto">
                反馈会沉淀为智能体的经验
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800">
            {/* 预览 */}
            <button
              onClick={() => handlePreview(r)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              预览
            </button>
            {/* 下载 */}
            <button
              onClick={async () => {
                const res = await window.electronAPI.apiRequest('GET', `/api/projects/${projectId}/reports/${r.id}/download`);
                if (res.success && res.data) window.electronAPI.openExternal(res.data);
              }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              下载
            </button>
            {/* 发布 */}
            {r.status === 'DRAFT' && (
              <button
                onClick={() => onSign(r.id)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-brand-600/20 text-brand-300 hover:bg-brand-600/30 transition-colors"
              >
                发布
              </button>
            )}
            {/* 删除 */}
            <button
              onClick={() => confirmDelete(r.id)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除
            </button>
          </div>
        </div>
      ))}

      {reports.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <FileText className="w-10 h-10 mx-auto mb-2 text-slate-700" />
          <p>暂无报告</p>
          <p className="text-xs mt-1 text-slate-600">点击右上角「生成报告」开始分析</p>
        </div>
      )}

      {/* 预览弹窗 */}
      {previewReport && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setPreviewReport(null)}>
          <div className="bg-white rounded-xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* 弹窗顶栏 */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-medium text-slate-200 truncate max-w-lg">{previewReport.title}</span>
              </div>
              <button onClick={() => setPreviewReport(null)} className="text-slate-400 hover:text-slate-200 transition-colors ml-4 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* 报告内容 */}
            {previewReport.skillOutput ? (
              <iframe
                srcDoc={buildReportHtml(previewReport)}
                className="flex-1 w-full border-0"
                sandbox="allow-same-origin"
                title="报告预览"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-slate-50">
                <FileText className="w-12 h-12 mb-3 text-slate-300" />
                <p className="text-sm">报告内容尚未生成</p>
                <p className="text-xs mt-1 text-slate-400">PDF 正在生成中，请稍后刷新</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">确认删除报告</h3>
                <p className="text-xs text-slate-500 mt-0.5">此操作不可撤销，报告将被永久删除</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={doDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== 引用标签 =====
const CitationBadge: React.FC<{ citation: Citation; index: number }> = ({ citation, index }) => {
  const [expanded, setExpanded] = useState(false);
  const isDoc = citation.source === 'document';
  return (
    <span className="inline-flex flex-col">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-colors border ${
          isDoc
            ? 'bg-amber-900/20 text-amber-300 border-amber-700/40 hover:bg-amber-900/30'
            : 'bg-blue-900/20 text-blue-300 border-blue-700/40 hover:bg-blue-900/30'
        }`}
      >
        <span className="text-[10px]">{isDoc ? '📄' : '📖'}</span>
        <span className="font-mono text-[10px] opacity-70">[{index + 1}]</span>
        <span className="truncate max-w-[120px]">{citation.lawName}</span>
        <span className="opacity-60 flex-shrink-0">{citation.article}</span>
      </button>
      {expanded && (
        <span className="mt-1 block px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 max-w-xs leading-relaxed">
          <span className="block text-[10px] text-slate-500 mb-1 font-medium">
            {citation.lawName} {citation.article}
          </span>
          {citation.text}
        </span>
      )}
    </span>
  );
};

// ===== 消息气泡 =====
const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const timeStr = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* 头像 */}
      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mt-0.5 ${isUser ? 'bg-brand-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
        {isUser ? '律' : <Scale className="w-3 h-3" />}
      </div>

      <div className={`flex-1 min-w-0 flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* 消息内容 */}
        <div className={`max-w-[92%] rounded-xl px-3 py-2.5 text-sm ${
          isUser
            ? 'bg-brand-600 text-white rounded-br-sm'
            : message.status === 'error'
              ? 'bg-red-900/20 border border-red-700/40 text-red-300 rounded-bl-sm'
              : 'bg-slate-800/80 text-slate-200 rounded-bl-sm'
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <div className={`prose prose-sm prose-invert max-w-none ${message.status === 'streaming' ? 'streaming-cursor' : ''}`}>
              {message.content
                ? <ReactMarkdown remarkPlugins={[remarkGfm]}
                    components={{
                      // 表格样式
                      table: ({children}) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
                      th: ({children}) => <th className="border border-slate-600 px-2 py-1 bg-slate-700 text-slate-200 text-left">{children}</th>,
                      td: ({children}) => <td className="border border-slate-700 px-2 py-1 text-slate-300">{children}</td>,
                      // 代码块
                      code: ({children, className}) => className
                        ? <code className="block bg-slate-900 rounded p-2 text-xs text-emerald-300 overflow-x-auto my-1">{children}</code>
                        : <code className="bg-slate-700 rounded px-1 text-xs text-emerald-300">{children}</code>,
                    }}
                  >{message.content}</ReactMarkdown>
                : <span className="text-slate-500 animate-pulse text-xs">正在思考...</span>
              }
            </div>
          )}
        </div>

        {/* 法规引用 */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="max-w-[92%] w-full space-y-1">
            {message.citations.map((c, i) => <CitationBadge key={i} citation={c} index={i} />)}
          </div>
        )}

        {/* 时间戳 */}
        {timeStr && (
          <span className="text-[10px] text-slate-600 px-1">{timeStr}</span>
        )}
      </div>
    </div>
  );
};

export default ProjectDetailPage;
