import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, CheckCircle2, AlertCircle, RefreshCw,
  Search, FileText, Cpu, Sparkles, BookOpen, Save, ChevronDown, ChevronRight,
} from 'lucide-react';

interface ExecutionStep {
  step: number;
  type: string;
  timestamp: string;
  label: string;
  data?: any;
  status: 'running' | 'success' | 'failed';
}

interface AgentExecution {
  id: number;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  retrievalCount: number;
  lessonCount: number;
  inputTokens: number;
  outputTokens: number;
  trace: ExecutionStep[];
  errorMessage?: string;
}

interface AgentWorkbenchProps {
  executionId: number;
  onComplete?: (success: boolean) => void;
  className?: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  retrieval: Search,
  file_scan: FileText,
  lesson_inject: BookOpen,
  ai_call: Sparkles,
  compute: Cpu,
  render: FileText,
  save: Save,
  error: AlertCircle,
  complete: CheckCircle2,
};

const TYPE_COLOR: Record<string, string> = {
  retrieval: 'text-blue-400',
  file_scan: 'text-cyan-400',
  lesson_inject: 'text-amber-400',
  ai_call: 'text-purple-400',
  compute: 'text-emerald-400',
  render: 'text-pink-400',
  save: 'text-slate-400',
  error: 'text-red-400',
  complete: 'text-emerald-400',
};

const AgentWorkbench: React.FC<AgentWorkbenchProps> = ({ executionId, onComplete, className = '' }) => {
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [status, setStatus] = useState<'RUNNING' | 'SUCCESS' | 'FAILED'>('RUNNING');
  const [expanded, setExpanded] = useState(true);
  const [stats, setStats] = useState({ duration: 0, retrievals: 0, lessons: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps, expanded]);

  // 订阅 SSE
  useEffect(() => {
    if (!executionId) return;

    let cleanup = () => {};
    let isClosed = false;

    // 用 fetch + ReadableStream 订阅 SSE（Electron 主进程代理）
    // 简化做法：先用普通 GET 轮询 + 终端通过 fetch 直连
    const subscribe = async () => {
      try {
        // 先取一次完整数据
        const initRes = await window.electronAPI.apiRequest('GET', `/api/agent-executions/${executionId}`);
        if (initRes.success && initRes.data) {
          const data: AgentExecution = initRes.data;
          setSteps(data.trace || []);
          setStatus(data.status === 'RUNNING' ? 'RUNNING' : data.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED');
          setStats({
            duration: data.durationMs || 0,
            retrievals: data.retrievalCount || 0,
            lessons: data.lessonCount || 0,
          });

          // 已完成则不轮询
          if (data.status !== 'RUNNING') {
            onComplete?.(data.status === 'SUCCESS');
            return;
          }
        }

        // RUNNING 状态：1 秒轮询一次直到完成（简化版，未来可以改成 SSE）
        const timer = setInterval(async () => {
          if (isClosed) return;
          try {
            const res = await window.electronAPI.apiRequest('GET', `/api/agent-executions/${executionId}`);
            if (res.success && res.data) {
              const data: AgentExecution = res.data;
              setSteps(data.trace || []);
              setStatus(data.status === 'RUNNING' ? 'RUNNING'
                : data.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED');
              setStats({
                duration: data.durationMs || 0,
                retrievals: data.retrievalCount || 0,
                lessons: data.lessonCount || 0,
              });
              if (data.status !== 'RUNNING') {
                clearInterval(timer);
                onComplete?.(data.status === 'SUCCESS');
              }
            }
          } catch { /* 静默失败 */ }
        }, 1000);

        cleanup = () => { isClosed = true; clearInterval(timer); };
      } catch (e) {
        console.warn('订阅执行轨迹失败', e);
      }
    };

    subscribe();
    return () => { cleanup(); };
  }, [executionId]);

  const lastStep = steps[steps.length - 1];
  const isRunning = status === 'RUNNING';

  return (
    <div className={`bg-slate-900/80 border border-slate-700/50 rounded-xl overflow-hidden ${className}`}>
      {/* 头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors"
      >
        <div className="relative flex-shrink-0">
          {isRunning
            ? <Activity className="w-5 h-5 text-brand-400 animate-pulse" />
            : status === 'SUCCESS'
              ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              : <AlertCircle className="w-5 h-5 text-red-400" />
          }
          {isRunning && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
            </span>
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200">智能体工作台</span>
            {isRunning && lastStep && (
              <span className="text-xs text-brand-300 truncate">
                {lastStep.label}...
              </span>
            )}
            {!isRunning && (
              <span className={`text-xs ${status === 'SUCCESS' ? 'text-emerald-400' : 'text-red-400'}`}>
                {status === 'SUCCESS' ? '执行成功' : '执行失败'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
            <span>{steps.length} 步</span>
            {stats.retrievals > 0 && <span>检索 {stats.retrievals} 次</span>}
            {stats.lessons > 0 && (
              <span className="text-amber-500/80">📌 注入律师经验 {stats.lessons} 条</span>
            )}
            {stats.duration > 0 && <span>耗时 {(stats.duration / 1000).toFixed(1)}s</span>}
          </div>
        </div>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
        }
      </button>

      {/* 步骤列表 */}
      {expanded && (
        <div ref={scrollRef} className="max-h-64 overflow-y-auto border-t border-slate-800 px-4 py-3 space-y-1.5">
          {steps.length === 0 && (
            <div className="text-xs text-slate-600 text-center py-3 flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              智能体准备中...
            </div>
          )}
          {steps.map((step, idx) => {
            const Icon = TYPE_ICON[step.type] || Activity;
            const color = TYPE_COLOR[step.type] || 'text-slate-400';
            const isLast = idx === steps.length - 1;
            const showSpinner = isLast && isRunning && step.status === 'running';

            return (
              <div key={idx} className="flex items-start gap-2.5 group">
                <div className={`mt-0.5 flex-shrink-0 ${color}`}>
                  {showSpinner
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : step.status === 'failed'
                      ? <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                      : <Icon className="w-3.5 h-3.5" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-300 leading-relaxed">
                    {step.label}
                    {step.status === 'failed' && (
                      <span className="ml-2 text-red-400">失败</span>
                    )}
                  </div>
                  {step.data && Object.keys(step.data).length > 0 && (
                    <div className="text-xs text-slate-600 mt-0.5 truncate">
                      {Object.entries(step.data).slice(0, 3).map(([k, v]) => (
                        <span key={k} className="mr-2">
                          <span className="text-slate-700">{k}:</span> {formatValue(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-700 flex-shrink-0">
                  {formatTime(step.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function formatValue(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object') return Array.isArray(v) ? `[${v.length}]` : '{...}';
  return String(v).slice(0, 30);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  } catch { return ''; }
}

export default AgentWorkbench;
