import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send, StopCircle, RefreshCw, ChevronDown, Sparkles,
  Terminal, Cpu, Zap, AlertCircle, Copy, Check,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─────────────────────────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'done' | 'streaming' | 'error';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  timestamp: number;
}

interface ModelOption {
  id: string;
  label: string;
  provider: string;
  badge?: string;
  badgeColor?: string;
}

// OpenClaw 配置的模型列表（与 openclaw.json 保持同步）
const OPENCLAW_MODELS: ModelOption[] = [
  { id: 'deepseek/deepseek-v4-pro',   label: 'DeepSeek V4 Pro',    provider: 'DeepSeek', badge: '默认', badgeColor: 'text-brand-400 bg-brand-400/10' },
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash',  provider: 'DeepSeek', badge: '快速', badgeColor: 'text-emerald-400 bg-emerald-400/10' },
  { id: 'hajimi/gpt-5.5',             label: 'GPT 5.5',            provider: 'hajimi' },
  { id: 'hajimi/gpt-5.3-codex',       label: 'GPT 5.3 Codex',     provider: 'hajimi', badge: '推理', badgeColor: 'text-purple-400 bg-purple-400/10' },
  { id: 'hajimi/claude-sonnet-4-6',   label: 'Claude Sonnet 4.6', provider: 'hajimi' },
  { id: 'hajimi/claude-opus-4-7',     label: 'Claude Opus 4.7',   provider: 'hajimi', badge: '强力', badgeColor: 'text-amber-400 bg-amber-400/10' },
  { id: 'hajimi/gemini-3.1-pro-high', label: 'Gemini 3.1 Pro',    provider: 'hajimi' },
];

// 快捷指令（针对 ClawComply 系统自我迭代场景）
const QUICK_COMMANDS = [
  { label: '查看系统状态', text: '请检查 ClawComply 系统当前的运行状态，包括各服务健康情况和最近的错误日志。' },
  { label: '代码审查', text: '请审查最近修改的代码，检查是否有潜在的 bug 或可以优化的地方。' },
  { label: '功能规划', text: '基于当前 ClawComply 的功能现状，建议下一步可以优化或新增的功能。' },
  { label: '性能分析', text: '分析当前系统的性能瓶颈，特别是 AI 对话响应时间和文件解析效率。' },
];

// ─────────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────────

const ClawPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState(OPENCLAW_MODELS[0]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [sessionKey] = useState(() => `claw-direct-${Date.now()}`);
  const [totalTokens, setTotalTokens] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdRef = useRef<string | null>(null);
  const abortRef = useRef<boolean>(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 关闭模型选择器（点击外部）
  useEffect(() => {
    if (!showModelPicker) return;
    const handler = () => setShowModelPicker(false);
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [showModelPicker]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // 添加用户消息
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      status: 'done',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    // 添加 AI 占位消息
    const asstId = `asst-${Date.now()}`;
    streamingIdRef.current = asstId;
    abortRef.current = false;
    setIsStreaming(true);
    setMessages(prev => [...prev, {
      id: asstId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model: selectedModel.id,
      timestamp: Date.now(),
    }]);

    try {
      // 直连 OpenClaw Gateway（原生 agent 模式，带完整工作区上下文）
      // 通过主进程的 chatSend，但强制走直连模式（不经过 Spring Boot）
      const result = await window.electronAPI.chatSend(text, {
        sessionKey,
        // 传入选中的模型 ID，让 OpenClaw 使用对应模型
        // OpenClaw 通过 user 字段路由，model 字段在 openclaw.json 中配置
      });

      if (!result.success) {
        setMessages(prev => prev.map(m => m.id === asstId
          ? { ...m, status: 'error', content: `⚠️ ${result.error || '发送失败'}` }
          : m
        ));
        setIsStreaming(false);
        return;
      }

      // 监听流式事件
      const unsub = window.electronAPI.onChatEvent((payload: any) => {
        if (abortRef.current) return;
        const { state, deltaText, errorMessage } = payload;

        if (state === 'delta' && deltaText) {
          setMessages(prev => prev.map(m => m.id === asstId
            ? { ...m, content: m.content + deltaText, status: 'streaming' }
            : m
          ));
        } else if (state === 'final') {
          setMessages(prev => prev.map(m => m.id === asstId
            ? { ...m, status: 'done' }
            : m
          ));
          setIsStreaming(false);
          streamingIdRef.current = null;
          unsub();
        } else if (state === 'error') {
          setMessages(prev => prev.map(m => m.id === asstId
            ? { ...m, status: 'error', content: m.content || `⚠️ ${errorMessage || '出错了'}` }
            : m
          ));
          setIsStreaming(false);
          streamingIdRef.current = null;
          unsub();
        }
      });

    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === asstId
        ? { ...m, status: 'error', content: `⚠️ ${e.message}` }
        : m
      ));
      setIsStreaming(false);
    }
  }, [input, isStreaming, selectedModel, sessionKey]);

  const handleAbort = async () => {
    abortRef.current = true;
    if (streamingIdRef.current) {
      setMessages(prev => prev.map(m => m.id === streamingIdRef.current
        ? { ...m, status: 'done', content: m.content + '\n\n_[已中止]_' }
        : m
      ));
    }
    setIsStreaming(false);
    streamingIdRef.current = null;
    await window.electronAPI.chatAbort(sessionKey);
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

  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const clearChat = () => {
    setMessages([]);
    setTotalTokens(0);
    streamingIdRef.current = null;
    setIsStreaming(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* 顶部栏 */}
      <header className="h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <span className="text-lg">🦞</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">小龙虾</h2>
            <p className="text-xs text-slate-500">OpenClaw 原生对话 · 系统自我迭代</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Token 统计 */}
          {totalTokens > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Zap className="w-3 h-3" />
              <span>{totalTokens.toLocaleString()} tokens</span>
            </div>
          )}

          {/* 模型选择器 */}
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setShowModelPicker(!showModelPicker); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors text-sm"
            >
              <Cpu className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-slate-200 max-w-[140px] truncate">{selectedModel.label}</span>
              {selectedModel.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${selectedModel.badgeColor}`}>
                  {selectedModel.badge}
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {showModelPicker && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="px-3 py-2 border-b border-slate-800">
                  <p className="text-xs text-slate-500">选择模型（通过 OpenClaw Gateway）</p>
                </div>
                <div className="py-1 max-h-80 overflow-y-auto">
                  {OPENCLAW_MODELS.map(model => (
                    <button
                      key={model.id}
                      onClick={() => { setSelectedModel(model); setShowModelPicker(false); }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800 transition-colors text-left ${
                        selectedModel.id === model.id ? 'bg-slate-800/80' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-200">{model.label}</span>
                          {model.badge && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${model.badgeColor}`}>
                              {model.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{model.provider}</div>
                      </div>
                      {selectedModel.id === model.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/50">
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    ⚠️ 模型切换通过 OpenClaw Gateway 路由，实际使用的模型由 openclaw.json 中的
                    <code className="text-slate-500 mx-0.5">agents.defaults.model.primary</code>
                    决定。此处选择仅作为偏好记录，完整切换需修改配置。
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 清空 */}
          {messages.length > 0 && (
            <button onClick={clearChat}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              title="清空对话">
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-5">
              <span className="text-4xl">🦞</span>
            </div>
            <h3 className="text-lg font-medium text-slate-300 mb-2">小龙虾已就绪</h3>
            <p className="text-sm text-slate-500 max-w-md leading-relaxed mb-1">
              直连 OpenClaw 原生 Agent，具备完整的工具调用、记忆和自我迭代能力。
            </p>
            <p className="text-xs text-slate-600 max-w-md leading-relaxed mb-6">
              适合：修改代码、调试功能、系统分析、功能规划等需要 Agent 能力的任务。
            </p>

            {/* 快捷指令 */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {QUICK_COMMANDS.map(cmd => (
                <button
                  key={cmd.label}
                  onClick={() => { setInput(cmd.text); setTimeout(() => inputRef.current?.focus(), 0); }}
                  className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-left hover:border-slate-700 hover:bg-slate-800/80 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Terminal className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-300">{cmd.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 line-clamp-2 leading-relaxed">{cmd.text}</p>
                </button>
              ))}
            </div>

            {/* 说明 */}
            <div className="mt-6 flex items-start gap-2 px-4 py-3 rounded-xl bg-orange-500/5 border border-orange-500/20 max-w-lg text-left">
              <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                小龙虾直连 OpenClaw Gateway，每次对话会注入完整的工作区上下文（~28K tokens）。
                适合需要 Agent 能力的任务，日常合规对话请使用「AI 对话」功能（~1K tokens）。
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            copied={copied === msg.id}
            onCopy={() => copyMessage(msg.id, msg.content)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="border-t border-slate-800 bg-slate-900/50 p-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          {/* 快捷指令（输入框上方，有内容时隐藏） */}
          {!input && messages.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {QUICK_COMMANDS.map(cmd => (
                <button
                  key={cmd.label}
                  onClick={() => { setInput(cmd.text); inputRef.current?.focus(); }}
                  disabled={isStreaming}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-50"
                >
                  <Terminal className="w-3 h-3 text-orange-400" />
                  {cmd.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="向小龙虾发送指令... (Shift+Enter 换行)"
                rows={1}
                disabled={isStreaming}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30 resize-none transition-colors"
                autoFocus
              />
            </div>
            {isStreaming ? (
              <button
                onClick={handleAbort}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors"
                title="停止生成"
              >
                <StopCircle className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-orange-600 text-white flex items-center justify-center hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-slate-600">
              🦞 OpenClaw 原生 Agent · 工具调用 · 记忆 · 自我迭代
            </p>
            <p className="text-xs text-slate-600">
              当前模型：<span className="text-orange-400/70">{selectedModel.label}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// 消息气泡
// ─────────────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  message: Message;
  copied: boolean;
  onCopy: () => void;
}> = ({ message, copied, onCopy }) => {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';

  return (
    <div className={`flex gap-3 group ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* 头像 */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
        isUser ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300'
      }`}>
        {isUser ? '你' : '🦞'}
      </div>

      {/* 内容 */}
      <div className={`flex-1 min-w-0 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block text-left rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-orange-600 text-white rounded-br-md'
            : message.status === 'error'
              ? 'bg-red-900/40 text-red-200 rounded-bl-md border border-red-800/50'
              : 'bg-slate-800 text-slate-200 rounded-bl-md'
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          ) : (
            <div className={`prose-chat text-sm ${isStreaming ? 'streaming-cursor' : ''}`}>
              {message.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              ) : (
                <span className="text-slate-500 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  思考中...
                </span>
              )}
            </div>
          )}
        </div>

        {/* 消息底部：token 统计 + 复制 */}
        {!isUser && message.status === 'done' && (
          <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {(message.inputTokens || message.outputTokens) && (
              <span className="text-[10px] text-slate-600">
                {message.inputTokens}↑ {message.outputTokens}↓ tokens
              </span>
            )}
            <button
              onClick={onCopy}
              className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClawPage;
