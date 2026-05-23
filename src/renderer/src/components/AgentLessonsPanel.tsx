import React, { useEffect, useState } from 'react';
import {
  Sparkles, RefreshCw, ThumbsUp, ThumbsDown, MessageSquarePlus,
  Trash2, ToggleLeft, ToggleRight, AlertCircle, BookOpen,
} from 'lucide-react';

interface Lesson {
  id: number;
  agentId: number;
  lawyerId: number;
  projectId?: number;
  reportId?: number;
  targetModule?: string;
  targetExcerpt?: string;
  feedbackType: 'LIKE' | 'DISLIKE' | 'NOTE';
  lessonText: string;
  severity: 'NORMAL' | 'IMPORTANT' | 'CRITICAL';
  active: boolean;
  timesApplied: number;
  createdAt: string;
  updatedAt: string;
}

interface AgentLessonsPanelProps {
  agentId: number;
}

const TYPE_META: Record<Lesson['feedbackType'], { label: string; icon: React.ElementType; color: string }> = {
  LIKE:    { label: '正确判断', icon: ThumbsUp,        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  DISLIKE: { label: '纠正',     icon: ThumbsDown,      color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  NOTE:    { label: '补充',     icon: MessageSquarePlus, color: 'text-brand-400 bg-brand-500/10 border-brand-500/30' },
};

const SEVERITY_LABEL: Record<string, string> = {
  NORMAL: '一般',
  IMPORTANT: '重要',
  CRITICAL: '强制',
};

const AgentLessonsPanel: React.FC<AgentLessonsPanelProps> = ({ agentId }) => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await window.electronAPI.apiRequest('GET', `/api/agent-lessons?agentId=${agentId}`);
    setLoading(false);
    if (res.success) setLessons(res.data || []);
    else setError(res.error || '加载失败');
  };

  useEffect(() => { load(); }, [agentId]);

  const toggleActive = async (lesson: Lesson) => {
    setUpdatingId(lesson.id);
    const res = await window.electronAPI.apiRequest('PUT', `/api/agent-lessons/${lesson.id}`, {
      active: !lesson.active,
    });
    setUpdatingId(null);
    if (res.success) {
      setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, active: !lesson.active } : l));
    }
  };

  const deleteLesson = async (lesson: Lesson) => {
    if (!confirm('删除后智能体下次执行不再应用这条经验，确认删除吗？')) return;
    const res = await window.electronAPI.apiRequest('DELETE', `/api/agent-lessons/${lesson.id}`);
    if (res.success) {
      setLessons(prev => prev.filter(l => l.id !== lesson.id));
    }
  };

  const updateSeverity = async (lesson: Lesson, severity: string) => {
    setUpdatingId(lesson.id);
    const res = await window.electronAPI.apiRequest('PUT', `/api/agent-lessons/${lesson.id}`, { severity });
    setUpdatingId(null);
    if (res.success) {
      setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, severity: severity as any } : l));
    }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw className="w-5 h-5 text-slate-500 animate-spin" />
    </div>
  );

  const activeCount = lessons.filter(l => l.active).length;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* 顶部说明 */}
      <div className="flex items-start gap-3 px-4 py-3 mb-5 rounded-xl bg-brand-600/10 border border-brand-600/20">
        <Sparkles className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm text-slate-200 font-medium leading-relaxed">
            智能体的经验沉淀
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            当你在报告中点「赞」「踩」或写批注时，反馈会自动沉淀到这里。智能体下次执行会自动应用这些经验，
            让它越来越懂你的判断标准。这是这个智能体相比通用 AI 的核心价值。
          </p>
        </div>
      </div>

      {/* 统计 */}
      <div className="flex items-center gap-4 mb-5">
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="w-4 h-4 text-brand-400" />
          <span className="text-slate-300">共 {lessons.length} 条经验</span>
          <span className="text-slate-600">·</span>
          <span className="text-emerald-400">{activeCount} 条生效中</span>
        </div>
        <button onClick={load} className="ml-auto p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {lessons.length === 0 && !error && (
        <div className="text-center py-16 text-slate-500">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-700" />
          <p className="text-sm mb-1">暂无经验沉淀</p>
          <p className="text-xs text-slate-600">
            在生成的报告页对每段分析点「赞」「踩」或写批注，<br />
            智能体会自动学习你的判断标准。
          </p>
        </div>
      )}

      {/* 经验列表 */}
      <div className="space-y-3">
        {lessons.map(lesson => {
          const meta = TYPE_META[lesson.feedbackType];
          const Icon = meta.icon;
          return (
            <div key={lesson.id}
              className={`border rounded-xl p-4 transition-colors ${
                lesson.active
                  ? 'bg-slate-900/80 border-slate-700/50'
                  : 'bg-slate-900/30 border-slate-800/50 opacity-50'
              }`}>
              <div className="flex items-start gap-3">
                {/* 类型图标 */}
                <div className={`px-2 py-1 rounded-md border flex items-center gap-1 text-xs ${meta.color} flex-shrink-0`}>
                  <Icon className="w-3 h-3" />{meta.label}
                </div>

                <div className="flex-1 min-w-0">
                  {/* 经验内容 */}
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {lesson.lessonText}
                  </p>

                  {/* 元信息 */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    {lesson.targetModule && (
                      <span>模块：<span className="text-slate-400">{lesson.targetModule}</span></span>
                    )}
                    <span>已应用 <span className="text-brand-400">{lesson.timesApplied}</span> 次</span>
                    <span>{new Date(lesson.updatedAt).toLocaleDateString()}</span>
                  </div>

                  {/* 反馈针对的内容（折叠展示） */}
                  {lesson.targetExcerpt && (
                    <details className="mt-2">
                      <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-400">
                        针对的原文
                      </summary>
                      <p className="text-xs text-slate-500 mt-1 px-3 py-2 rounded bg-slate-800/50 border-l-2 border-slate-700">
                        {lesson.targetExcerpt}
                      </p>
                    </details>
                  )}
                </div>

                {/* 操作 */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {/* 严重性切换 */}
                  <select
                    value={lesson.severity}
                    onChange={e => updateSeverity(lesson, e.target.value)}
                    disabled={updatingId === lesson.id}
                    className={`text-xs px-2 py-0.5 rounded border bg-slate-800 cursor-pointer ${
                      lesson.severity === 'CRITICAL'
                        ? 'text-red-400 border-red-500/40'
                        : lesson.severity === 'IMPORTANT'
                          ? 'text-amber-400 border-amber-500/40'
                          : 'text-slate-400 border-slate-700'
                    }`}
                  >
                    {Object.entries(SEVERITY_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>

                  <div className="flex items-center gap-0.5">
                    <button onClick={() => toggleActive(lesson)} disabled={updatingId === lesson.id}
                      title={lesson.active ? '点击禁用' : '点击启用'}
                      className="p-1 hover:bg-slate-800 rounded">
                      {lesson.active
                        ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                        : <ToggleLeft className="w-4 h-4 text-slate-600" />
                      }
                    </button>
                    <button onClick={() => deleteLesson(lesson)} title="删除"
                      className="p-1 text-slate-600 hover:text-red-400 hover:bg-slate-800 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgentLessonsPanel;
