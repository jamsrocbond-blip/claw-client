import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Send, Trash2, Wifi, WifiOff, StopCircle, Plus, MessageSquare, Edit2, X, FolderKanban, Search, Scale } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '../hooks/useChat';
import type { ChatMessage, Citation, ChatSessionMeta } from '../../../shared/types';

// 法规引用标签组件
const CitationBadge: React.FC<{ citation: Citation; index: number }> = ({ citation, index }) => {
  const [expanded, setExpanded] = useState(false);
  const isDoc = citation.source === 'document';
  return (
    <span className="inline-flex flex-col">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
          isDoc
            ? 'bg-amber-900/20 text-amber-300 border-amber-700/40 hover:bg-amber-900/30'
            : 'bg-blue-900/20 text-blue-300 border-blue-700/40 hover:bg-blue-900/30'
        }`}
      >
        <span className="text-[10px]">{isDoc ? '📄' : '📖'}</span>
        <span className="font-mono text-[10px] opacity-70">[{index + 1}]</span>
        <span className="truncate max-w-[160px]">{citation.lawName}</span>
        <span className="opacity-60 flex-shrink-0">{citation.article}</span>
      </button>
      {expanded && (
        <span className="mt-1.5 block px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 max-w-sm leading-relaxed">
          <span className="block text-[10px] text-slate-500 mb-1 font-medium">
            {citation.lawName} {citation.article}
          </span>
          {citation.text}
        </span>
      )}
    </span>
  );
};

// 单条消息组件
const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isAborted = message.status === 'aborted';

  return (
    <div className={`message-enter flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
        isUser ? 'bg-brand-600 text-white' : 'bg-slate-700 text-slate-300'
      }`}>
        {isUser ? '你' : '⚖️'}
      </div>
      <div className={`flex-1 min-w-0 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block text-left rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-brand-600 text-white rounded-br-md'
            : isError
              ? 'bg-red-900/40 text-red-200 rounded-bl-md border border-red-800/50'
              : 'bg-slate-800 text-slate-200 rounded-bl-md'
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className={`prose-chat ${message.status === 'streaming' ? 'streaming-cursor' : ''}`}>
              {message.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              ) : (
                <span className="text-slate-500">思考中...</span>
              )}
              {isAborted && <span className="text-xs text-slate-500 italic ml-1">[已中止]</span>}
            </div>
          )}
        </div>
        {message.citations && message.citations.length > 0 && !isUser && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((c, i) => <CitationBadge key={i} citation={c} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// 会话列表项
const SessionItem: React.FC<{
  session: ChatSessionMeta;
  active: boolean;
  projectName?: string;   // 从外部传入项目名称
  onClick: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
}> = ({ session, active, projectName, onClick, onRename, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const isProjectSession = !!session.projectId;

  useEffect(() => { setTitle(session.title); }, [session.title]);

  const submitRename = () => {
    setEditing(false);
    if (title.trim() && title.trim() !== session.title) {
      onRename(title.trim());
    } else {
      setTitle(session.title);
    }
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - ts) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  return (
    <div
      onClick={onClick}
      className={`group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        active ? 'bg-brand-600/20 border border-brand-500/40' : 'hover:bg-slate-800 border border-transparent'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* 图标：项目对话用文件夹，全局对话用消息图标 */}
        {isProjectSession
          ? <FolderKanban className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? 'text-emerald-400' : 'text-emerald-600'}`} />
          : <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? 'text-brand-400' : 'text-slate-500'}`} />
        }
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') { setTitle(session.title); setEditing(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-slate-900 border border-brand-500 text-sm text-slate-200 px-1 py-0.5 rounded focus:outline-none"
            />
          ) : (
            <div className={`text-sm truncate ${active ? 'text-slate-100 font-medium' : 'text-slate-300'}`}>
              {session.title}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {/* 项目标签：显示企业名称 */}
            {isProjectSession && projectName && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-800/40 max-w-[120px] truncate">
                <FolderKanban className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{projectName}</span>
              </span>
            )}
            {isProjectSession && !projectName && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/50">
                项目对话
              </span>
            )}
            <span className="text-xs text-slate-500">{formatTime(session.updatedAt)}</span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500">{session.messageCount} 条</span>
          </div>
        </div>
      </div>
      {!editing && (
        <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300"
            title="重命名"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`删除对话"${session.title}"？此操作不可撤销。`)) onDelete();
            }}
            className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400"
            title="删除"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

// 对话页面主组件
const ChatPage: React.FC = () => {
  const {
    messages,
    sessions,
    currentSessionId,
    isConnected,
    isStreaming,
    sendMessage,
    abortChat,
    clearMessages,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
  } = useChat();

  const [input, setInput] = useState('');
  const [showSessions, setShowSessions] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [sessionTab, setSessionTab] = useState<'project' | 'global'>('project');  // Tab 切换
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 拉取项目名称（用于在会话列表里显示企业名）
  useEffect(() => {
    (async () => {
      try {
        const res = await window.electronAPI.apiRequest('GET', '/api/projects?size=100');
        if (res.success) {
          const list = res.data?.content ?? res.data ?? [];
          const map: Record<string, string> = {};
          (Array.isArray(list) ? list : []).forEach((p: any) => {
            if (p.id) map[String(p.id)] = p.enterpriseName || p.name || `项目 ${p.id}`;
          });
          setProjectNames(map);
        }
      } catch { /* 静默失败 */ }
    })();
  }, []);

  // 搜索过滤 + 分组
  const { projectSessions, globalSessions } = useMemo(() => {
    const filtered = sessions.filter(s =>
      !searchText || s.title.toLowerCase().includes(searchText.toLowerCase()) ||
      (s.projectId && projectNames[s.projectId]?.toLowerCase().includes(searchText.toLowerCase()))
    );
    return {
      projectSessions: filtered.filter(s => !!s.projectId),
      globalSessions: filtered.filter(s => !s.projectId),
    };
  }, [sessions, searchText, projectNames]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  // 当前会话是否是项目对话
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const currentProjectName = currentSession?.projectId ? projectNames[currentSession.projectId] : null;

  // 切换会话时自动同步 Tab
  useEffect(() => {
    if (currentSession) {
      setSessionTab(currentSession.projectId ? 'project' : 'global');
    }
  }, [currentSessionId]);

  return (
    <div className="flex-1 flex h-full">
      {/* 左侧会话列表 */}
      {showSessions && (
        <aside className="w-64 flex-shrink-0 bg-slate-900/30 border-r border-slate-800 flex flex-col">
          {/* 顶栏：标题 + 新建 */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-200">对话历史</span>
            <button
              onClick={() => createSession('新对话')}
              className="p-1.5 rounded-md text-slate-400 hover:text-brand-400 hover:bg-slate-800 transition-colors"
              title="新建对话"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Tab 切换：项目对话 / 通用对话 */}
          <div className="flex border-b border-slate-800 flex-shrink-0">
            <button
              onClick={() => setSessionTab('project')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                sessionTab === 'project'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              项目对话
              {projectSessions.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  sessionTab === 'project' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-800 text-slate-500'
                }`}>{projectSessions.length}</span>
              )}
            </button>
            <button
              onClick={() => setSessionTab('global')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                sessionTab === 'global'
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              通用对话
              {globalSessions.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  sessionTab === 'global' ? 'bg-brand-900/40 text-brand-400' : 'bg-slate-800 text-slate-500'
                }`}>{globalSessions.length}</span>
              )}
            </button>
          </div>

          {/* 搜索框 */}
          <div className="px-3 py-2 border-b border-slate-800/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder={sessionTab === 'project' ? '搜索项目对话...' : '搜索通用对话...'}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/50 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* 会话列表 */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {sessionTab === 'project' ? (
              <>
                {projectSessions.length === 0 ? (
                  <div className="text-center py-8">
                    <FolderKanban className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">
                      {searchText ? '未找到匹配的项目对话' : '暂无项目对话'}
                    </p>
                    <p className="text-[10px] text-slate-700 mt-1">在项目详情页发起对话后会显示在这里</p>
                  </div>
                ) : (
                  projectSessions.map(s => (
                    <SessionItem
                      key={s.id}
                      session={s}
                      active={s.id === currentSessionId}
                      projectName={s.projectId ? projectNames[s.projectId] : undefined}
                      onClick={() => switchSession(s.id)}
                      onRename={(t) => renameSession(s.id, t)}
                      onDelete={() => deleteSession(s.id)}
                    />
                  ))
                )}
              </>
            ) : (
              <>
                {globalSessions.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">
                      {searchText ? '未找到匹配的对话' : '暂无通用对话'}
                    </p>
                    <button onClick={() => createSession('新对话')} className="mt-3 text-xs text-brand-400 hover:underline">
                      新建一个对话
                    </button>
                  </div>
                ) : (
                  globalSessions.map(s => (
                    <SessionItem
                      key={s.id}
                      session={s}
                      active={s.id === currentSessionId}
                      onClick={() => switchSession(s.id)}
                      onRename={(t) => renameSession(s.id, t)}
                      onDelete={() => deleteSession(s.id)}
                    />
                  ))
                )}
              </>
            )}
          </div>
        </aside>
      )}

      {/* 右侧对话区 */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        <header className="h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSessions(!showSessions)}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              title={showSessions ? '隐藏会话列表' : '显示会话列表'}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">AI 合规助手</h2>
              {/* 当前会话是项目对话时，显示项目名 */}
              {currentProjectName && (
                <div className="flex items-center gap-1 mt-0.5">
                  <FolderKanban className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs text-emerald-400">{currentProjectName}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {isConnected
                ? <Wifi className="w-4 h-4 text-emerald-400" />
                : <WifiOff className="w-4 h-4 text-amber-400" />
              }
              <span className="text-xs text-slate-500">{isConnected ? '已连接' : '未连接'}</span>
            </div>
            <button
              onClick={clearMessages}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              title="清空当前视图"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-600/20 flex items-center justify-center mb-4">
                <Scale className="w-8 h-8 text-brand-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-300 mb-2">合规助手已就绪</h3>
              <p className="text-sm text-slate-500 max-w-md">
                您可以咨询任何合规问题，我将基于现行法律法规为您提供专业分析。
                所有结论均附带法规引用，确保有据可依。
              </p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                {[
                  '数据出境安全评估如何申报？',
                  '企业需要做个人信息保护影响评估吗？',
                  '跨境数据传输有哪些合规要求？',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 0); }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 hover:border-slate-600 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-slate-800 bg-slate-900/50 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder="输入合规问题... (Shift+Enter 换行)"
                  rows={1}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none transition-colors"
                  disabled={isStreaming}
                  autoFocus
                />
              </div>
              {isStreaming ? (
                <button onClick={abortChat} className="flex-shrink-0 w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors" title="停止生成">
                  <StopCircle className="w-5 h-5" />
                </button>
              ) : (
                <button onClick={handleSend} disabled={!input.trim()} className="flex-shrink-0 w-11 h-11 rounded-xl bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-2 text-center">
              AI 回答仅供参考，不构成法律意见 · 所有结论均引用现行法规条文
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
