import React, { useState } from 'react';
import {
  ThumbsUp, ThumbsDown, MessageSquarePlus, X,
  RefreshCw, CheckCircle2, AlertCircle, Sparkles,
} from 'lucide-react';

interface AgentFeedbackProps {
  agentId: number;
  projectId?: number;
  reportId?: number;
  targetModule: string;     // 模块名，如 corporate_status
  targetExcerpt?: string;   // 反馈针对的内容摘要
  size?: 'sm' | 'md';
  /** 反馈成功后的回调 */
  onSubmitted?: (type: 'LIKE' | 'DISLIKE' | 'NOTE') => void;
}

const AgentFeedback: React.FC<AgentFeedbackProps> = ({
  agentId, projectId, reportId, targetModule, targetExcerpt,
  size = 'sm', onSubmitted,
}) => {
  const [showNote, setShowNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedType, setSubmittedType] = useState<'LIKE' | 'DISLIKE' | 'NOTE' | null>(null);
  const [noteText, setNoteText] = useState('');
  const [severity, setSeverity] = useState<'NORMAL' | 'IMPORTANT' | 'CRITICAL'>('NORMAL');
  const [feedbackType, setFeedbackType] = useState<'NOTE' | 'DISLIKE'>('DISLIKE');

  const submit = async (
    type: 'LIKE' | 'DISLIKE' | 'NOTE',
    text: string,
    sev: 'NORMAL' | 'IMPORTANT' | 'CRITICAL' = 'NORMAL'
  ) => {
    setSubmitting(true);
    const res = await window.electronAPI.apiRequest('POST', '/api/agent-lessons', {
      agentId, projectId, reportId, targetModule, targetExcerpt,
      feedbackType: type,
      lessonText: text,
      severity: sev,
    });
    setSubmitting(false);
    if (res.success) {
      setSubmittedType(type);
      onSubmitted?.(type);
      setShowNote(false);
      setTimeout(() => setSubmittedType(null), 3000);
    }
  };

  const handleQuickLike = () => {
    submit('LIKE', `这段分析准确，符合该案件实际情况（模块：${targetModule}）`, 'NORMAL');
  };

  const handleSubmitNote = () => {
    if (!noteText.trim()) return;
    submit(feedbackType, noteText.trim(), severity);
    setNoteText('');
  };

  const btnSize = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  // 已反馈成功的提示
  if (submittedType) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs">
        <CheckCircle2 className="w-3 h-3" />
        {submittedType === 'LIKE' ? '已记录为正确判断' : submittedType === 'DISLIKE' ? '已记录纠正' : '批注已保存'}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      {/* 赞 */}
      <button
        onClick={handleQuickLike}
        disabled={submitting}
        className={`${btnSize} flex items-center justify-center rounded-md text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors`}
        title="判断准确（智能体下次会保持）"
      >
        {submitting
          ? <RefreshCw className={`${iconSize} animate-spin`} />
          : <ThumbsUp className={iconSize} />
        }
      </button>

      {/* 踩 */}
      <button
        onClick={() => { setFeedbackType('DISLIKE'); setShowNote(true); }}
        disabled={submitting}
        className={`${btnSize} flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors`}
        title="判断有问题（请说明，智能体下次会避免）"
      >
        <ThumbsDown className={iconSize} />
      </button>

      {/* 补充批注 */}
      <button
        onClick={() => { setFeedbackType('NOTE'); setShowNote(true); }}
        disabled={submitting}
        className={`${btnSize} flex items-center justify-center rounded-md text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors`}
        title="补充批注（智能体下次会注意）"
      >
        <MessageSquarePlus className={iconSize} />
      </button>

      {/* 批注弹窗 */}
      {showNote && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowNote(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-lg shadow-xl">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  {feedbackType === 'DISLIKE' ? '纠正智能体' : '补充批注'}
                </h3>
              </div>
              <button onClick={() => setShowNote(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-500 mb-3">
              你的反馈会沉淀为智能体的经验，下次执行时会自动应用，让智能体越来越懂你的判断标准。
            </div>

            {targetExcerpt && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/30 text-xs text-slate-400 max-h-24 overflow-y-auto">
                <div className="text-slate-600 mb-1">针对的内容：</div>
                <div className="line-clamp-3">{targetExcerpt}</div>
              </div>
            )}

            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder={feedbackType === 'DISLIKE'
                ? '请说明这段分析的问题，以及正确的判断应该是什么。例如：\n• 应该按《公司法》第X条判断\n• 此类企业还需要关注 XX 风险'
                : '补充注意事项或行业惯例。例如：\n• 这类客户通常关心 XX\n• 报告需要特别突出 XX'
              }
              rows={5}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder:text-slate-600 text-sm focus:outline-none focus:border-brand-500 resize-none leading-relaxed"
              autoFocus
            />

            {/* 严重性 */}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-slate-500">重要程度：</span>
              {([
                { value: 'NORMAL', label: '一般', color: 'slate' },
                { value: 'IMPORTANT', label: '重要', color: 'amber' },
                { value: 'CRITICAL', label: '强制', color: 'red' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSeverity(opt.value)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    severity === opt.value
                      ? opt.color === 'red'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : opt.color === 'amber'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'bg-slate-700 text-slate-200 border border-slate-600'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-1.5">
              {severity === 'CRITICAL' ? '⚠️ 强制：智能体下次必须遵循' :
               severity === 'IMPORTANT' ? '⚡ 重要：智能体会优先考虑' :
               '一般：作为参考'}
            </p>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowNote(false)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                取消
              </button>
              <button
                onClick={handleSubmitNote}
                disabled={!noteText.trim() || submitting}
                className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5 hover:bg-brand-700 transition-colors"
              >
                {submitting
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />提交中...</>
                  : <><CheckCircle2 className="w-3.5 h-3.5" />沉淀为经验</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentFeedback;
