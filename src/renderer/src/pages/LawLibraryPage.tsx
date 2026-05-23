/**
 * 法规知识库管理页
 * 律师可以：查看已有法规、审核待审核法规、手动添加法规、触发爬虫
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, RefreshCw, AlertCircle, CheckCircle2, XCircle,
  Search, Filter, Plus, Trash2, Eye, EyeOff, Zap,
  ChevronDown, ChevronRight, Globe, Clock, Tag,
} from 'lucide-react';

interface LawItem {
  id: number;
  title: string;
  content: string;
  sourceUrl?: string;
  sourceSite?: string;
  publishDate?: string;
  lawCategory?: string;
  lawYear?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  enabled: boolean;
  vectorized: boolean;
  createdAt: string;
  reviewedAt?: string;
}

interface Stats {
  pending: number;
  approved: number;
  rejected: number;
  enabled: number;
  unvectorized: number;
}

type FilterStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

const STATUS_CONFIG = {
  PENDING:  { label: '待审核', color: 'text-amber-400 bg-amber-400/10', icon: Clock },
  APPROVED: { label: '已通过', color: 'text-emerald-400 bg-emerald-400/10', icon: CheckCircle2 },
  REJECTED: { label: '已拒绝', color: 'text-red-400 bg-red-400/10', icon: XCircle },
};

const LawLibraryPage: React.FC = () => {
  const [laws, setLaws] = useState<LawItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [searchText, setSearchText] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [vectorizing, setVectorizing] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const showMsg = (type: 'ok' | 'err', text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 3000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [lawsRes, statsRes] = await Promise.all([
        window.electronAPI.apiRequest('GET', `/api/admin/laws/query?size=100&page=0${filterStatus !== 'ALL' ? `&status=${filterStatus}` : ''}`),
        window.electronAPI.apiRequest('GET', '/api/admin/laws/stats'),
      ]);
      if (lawsRes.success) {
        const data = lawsRes.data?.content ?? lawsRes.data ?? [];
        setLaws(Array.isArray(data) ? data : []);
      }
      if (statsRes.success) setStats(statsRes.data);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleApprove = async (id: number) => {
    const res = await window.electronAPI.apiRequest('POST', `/api/admin/laws/${id}/approve`);
    if (res.success) { showMsg('ok', '审核通过，正在向量化...'); loadData(); }
    else showMsg('err', res.error || '操作失败');
  };

  const handleReject = async (id: number) => {
    const res = await window.electronAPI.apiRequest('POST', `/api/admin/laws/${id}/reject`);
    if (res.success) { showMsg('ok', '已拒绝'); loadData(); }
    else showMsg('err', res.error || '操作失败');
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除该法规？将同时从知识库中移除。')) return;
    const res = await window.electronAPI.apiRequest('DELETE', `/api/admin/laws/${id}`);
    if (res.success) { showMsg('ok', '已删除'); loadData(); }
    else showMsg('err', res.error || '删除失败');
  };

  const handleToggleEnabled = async (law: LawItem) => {
    const endpoint = law.enabled ? `/api/admin/laws/${law.id}/disable` : `/api/admin/laws/${law.id}/enable`;
    const res = await window.electronAPI.apiRequest('POST', endpoint);
    if (res.success) { showMsg('ok', law.enabled ? '已停用' : '已启用'); loadData(); }
    else showMsg('err', res.error || '操作失败');
  };

  const handleVectorizeAll = async () => {
    setVectorizing(true);
    const res = await window.electronAPI.apiRequest('POST', '/api/admin/laws/vectorize');
    setVectorizing(false);
    if (res.success) { showMsg('ok', res.data?.message || '向量化完成'); loadData(); }
    else showMsg('err', res.error || '向量化失败');
  };

  const handleTriggerCrawler = async () => {
    setTriggering(true);
    const res = await window.electronAPI.apiRequest('POST', '/api/admin/laws/crawler/trigger');
    setTriggering(false);
    if (res.success) showMsg('ok', '爬虫已触发，稍后刷新查看新法规');
    else showMsg('err', res.error || '触发失败，请检查爬虫配置');
  };

  const filtered = laws.filter(l => {
    if (searchText && !l.title.includes(searchText) && !(l.lawCategory || '').includes(searchText)) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* 顶栏 */}
      <header className="h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-slate-200">法规知识库</h2>
        </div>
        <div className="flex items-center gap-2">
          {actionMsg && (
            <span className={`flex items-center gap-1.5 text-xs ${actionMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {actionMsg.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {actionMsg.text}
            </span>
          )}
          <button onClick={handleTriggerCrawler} disabled={triggering}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 disabled:opacity-50 transition-colors">
            {triggering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
            触发爬虫
          </button>
          <button onClick={handleVectorizeAll} disabled={vectorizing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 disabled:opacity-50 transition-colors">
            {vectorizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
            批量向量化
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs hover:bg-brand-700 transition-colors">
            <Plus className="w-3.5 h-3.5" />手动添加
          </button>
          <button onClick={loadData} className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 统计卡片 */}
      {stats && (
        <div className="flex gap-3 px-5 py-3 border-b border-slate-800 flex-shrink-0">
          {[
            { label: '待审核', value: stats.pending, color: 'text-amber-400', bg: 'bg-amber-400/10' },
            { label: '已通过', value: stats.approved, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
            { label: '已启用', value: stats.enabled, color: 'text-brand-400', bg: 'bg-brand-400/10' },
            { label: '未向量化', value: stats.unvectorized, color: 'text-red-400', bg: 'bg-red-400/10' },
            { label: '已拒绝', value: stats.rejected, color: 'text-slate-400', bg: 'bg-slate-400/10' },
          ].map(s => (
            <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${s.bg}`}>
              <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
              <span className="text-xs text-slate-400">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* 过滤栏 */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as FilterStatus[]).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-md text-xs transition-colors ${filterStatus === s ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {s === 'ALL' ? '全部' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="搜索法规名称或分类..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500" />
        </div>
        <span className="text-xs text-slate-500">{filtered.length} 条</span>
      </div>

      {/* 法规列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <BookOpen className="w-10 h-10 mb-2 text-slate-700" />
            <p className="text-sm">暂无法规数据</p>
            <p className="text-xs mt-1 text-slate-600">点击「触发爬虫」获取最新法规，或「手动添加」录入</p>
          </div>
        ) : (
          filtered.map(law => (
            <LawCard key={law.id} law={law}
              expanded={expandedId === law.id}
              onToggleExpand={() => setExpandedId(expandedId === law.id ? null : law.id)}
              onApprove={() => handleApprove(law.id)}
              onReject={() => handleReject(law.id)}
              onDelete={() => handleDelete(law.id)}
              onToggleEnabled={() => handleToggleEnabled(law)} />
          ))
        )}
      </div>

      {/* 手动添加弹窗 */}
      {showAddModal && (
        <AddLawModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); loadData(); showMsg('ok', '法规已添加并审核通过'); }} />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// 法规卡片
// ─────────────────────────────────────────────────────────────────

const LawCard: React.FC<{
  law: LawItem; expanded: boolean;
  onToggleExpand: () => void;
  onApprove: () => void; onReject: () => void;
  onDelete: () => void; onToggleEnabled: () => void;
}> = ({ law, expanded, onToggleExpand, onApprove, onReject, onDelete, onToggleEnabled }) => {
  const statusCfg = STATUS_CONFIG[law.status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${law.status === 'PENDING' ? 'border-amber-700/40' : 'border-slate-800'}`}>
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/50">
        <button onClick={onToggleExpand} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200 truncate">{law.title}</span>
            {law.lawCategory && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-xs text-slate-400 flex-shrink-0">
                <Tag className="w-3 h-3" />{law.lawCategory}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
            {law.sourceSite && <span>{law.sourceSite}</span>}
            {law.publishDate && <span>{law.publishDate}</span>}
            {law.vectorized && <span className="text-emerald-500">✓ 已向量化</span>}
            {!law.vectorized && law.status === 'APPROVED' && <span className="text-amber-500">⚠ 未向量化</span>}
          </div>
        </div>

        {/* 状态标签 */}
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusCfg.color}`}>
          <StatusIcon className="w-3 h-3" />{statusCfg.label}
        </span>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {law.status === 'PENDING' && (
            <>
              <button onClick={onApprove} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700/20 text-emerald-300 text-xs hover:bg-emerald-700/30 transition-colors">
                <CheckCircle2 className="w-3.5 h-3.5" />通过
              </button>
              <button onClick={onReject} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-700/20 text-red-300 text-xs hover:bg-red-700/30 transition-colors">
                <XCircle className="w-3.5 h-3.5" />拒绝
              </button>
            </>
          )}
          {law.status === 'APPROVED' && (
            <button onClick={onToggleEnabled} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors ${law.enabled ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-brand-700/20 text-brand-300 hover:bg-brand-700/30'}`}>
              {law.enabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {law.enabled ? '停用' : '启用'}
            </button>
          )}
          <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/50">
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-6">{law.content}</p>
          {law.sourceUrl && (
            <a href={law.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-brand-400 hover:text-brand-300">
              <Globe className="w-3 h-3" />查看原文
            </a>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// 手动添加法规弹窗
// ─────────────────────────────────────────────────────────────────

const AddLawModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({ title: '', content: '', sourceUrl: '', sourceSite: '', lawCategory: '', lawYear: '', publishDate: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) { setError('法规名称和内容不能为空'); return; }
    setSaving(true); setError('');
    const res = await window.electronAPI.apiRequest('POST', '/api/admin/laws/manual', {
      title: form.title.trim(),
      content: form.content.trim(),
      sourceUrl: form.sourceUrl.trim() || null,
      sourceSite: form.sourceSite.trim() || null,
      lawCategory: form.lawCategory.trim() || null,
      lawYear: form.lawYear ? parseInt(form.lawYear) : null,
      publishDate: form.publishDate || null,
    });
    setSaving(false);
    if (res.success) onSuccess();
    else setError(res.error || '添加失败');
  };

  const field = (label: string, key: keyof typeof form, placeholder?: string, multiline?: boolean) => (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {multiline ? (
        <textarea value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder} rows={6}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 resize-none" />
      ) : (
        <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500" />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold text-slate-100 mb-4">手动添加法规</h3>
        <div className="space-y-3">
          {field('法规名称 *', 'title', '如：中华人民共和国公司法（2023修订）')}
          {field('法规内容 *', 'content', '粘贴法规条文内容...', true)}
          <div className="grid grid-cols-2 gap-3">
            {field('来源网站', 'sourceSite', '如：全国人大')}
            {field('原文链接', 'sourceUrl', 'https://...')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('法规分类', 'lawCategory', '如：公司法、数据合规')}
            {field('发布年份', 'lawYear', '如：2023')}
          </div>
          {field('发布日期', 'publishDate', '如：2023-12-29')}
        </div>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">取消</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            添加并审核通过
          </button>
        </div>
      </div>
    </div>
  );
};

export default LawLibraryPage;
