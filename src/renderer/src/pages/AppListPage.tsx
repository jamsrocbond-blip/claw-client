import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, ArrowRight, AlertCircle, RefreshCw,
  Settings2, Plus, Share2, Lock, Wand2,
} from 'lucide-react';

interface AppMeta {
  id: number;
  slug: string;
  name: string;
  version: string;
  description?: string;
  category?: string;
  author?: string;
  ownerLawyerId?: number | null;
  isPublic?: boolean;
}

const CATEGORY_ICON: Record<string, string> = {
  'M&A': '🏢',
  '知识产权合规': '🔐',
  '数据合规': '🛡️',
  '劳动合规': '👥',
  '税务合规': '💰',
  '合同合规': '📝',
  '环保合规': '🌿',
};

const AppListPage: React.FC = () => {
  const navigate = useNavigate();
  const [apps, setApps] = useState<AppMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AppMeta | null>(null);
  const [enterpriseName, setEnterpriseName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const loadApps = () => {
    setLoading(true);
    setError('');
    window.electronAPI.apiRequest('GET', '/api/apps')
      .then(res => {
        if (res.success) setApps(res.data || []);
        else setError(`加载失败: ${res.error || '请检查后端服务是否启动'}`);
      })
      .catch(e => setError(`网络错误: ${e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadApps(); }, []);

  const handleCreate = async () => {
    if (!selected || !enterpriseName.trim()) return;
    setCreating(true);
    setCreateError('');
    const res = await window.electronAPI.apiRequest('POST', '/api/projects', {
      name: `${enterpriseName.trim()} · ${selected.name}`,
      enterpriseName: enterpriseName.trim(),
      appId: selected.id,
    });
    setCreating(false);
    if (res.success && res.data?.id) {
      navigate(`/projects/${res.data.id}`);
    } else {
      setCreateError(res.error || '创建失败，请重试');
    }
  };

  const handleTogglePublic = async (app: AppMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingId(app.id);
    const res = await window.electronAPI.apiRequest('POST', `/api/apps/${app.id}/toggle-public`);
    setTogglingId(null);
    if (res.success) {
      setApps(prev => prev.map(a => a.id === app.id ? { ...a, isPublic: res.data?.isPublic } : a));
    }
  };

  // 分组：平台应用 vs 我的应用
  const platformApps = apps.filter(a => a.ownerLawyerId == null);
  const myApps = apps.filter(a => a.ownerLawyerId != null);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const AppCard: React.FC<{ app: AppMeta; isMine: boolean }> = ({ app, isMine }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all">
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl">{CATEGORY_ICON[app.category || ''] || '⚖️'}</span>
        <div className="flex items-center gap-1.5">
          {isMine && (
            <button
              onClick={e => handleTogglePublic(app, e)}
              disabled={togglingId === app.id}
              title={app.isPublic ? '已共享，点击取消共享' : '点击开启共享'}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                app.isPublic
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600 hover:text-slate-300'
              }`}>
              {togglingId === app.id
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : app.isPublic
                  ? <><Share2 className="w-3 h-3" />已共享</>
                  : <><Lock className="w-3 h-3" />私有</>
              }
            </button>
          )}
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
            {app.category || '合规'}
          </span>
        </div>
      </div>
      <h3 className="font-medium text-slate-100 mb-2">{app.name}</h3>
      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">{app.description}</p>
      <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-600">v{app.version} · {app.author || '平台'}</span>
        <div className="flex items-center gap-2">
          {isMine && (
            <button
              onClick={() => navigate(`/apps/${app.id}/edit`)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 hover:text-slate-200 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              管理
            </button>
          )}
          <button
            onClick={() => { setSelected(app); setEnterpriseName(''); setCreateError(''); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-white bg-brand-600 hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新建项目
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-900/50">
        <h2 className="text-sm font-semibold text-slate-200">合规智能体</h2>
        <div className="flex items-center gap-2">
          <button onClick={loadApps} className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors" title="刷新">
            <RefreshCw className="w-4 h-4" />
          </button>
          {/* 创建智能体入口 */}
          <button
            onClick={() => navigate('/apps/create')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5" />
            创建智能体
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={loadApps} className="ml-auto text-xs underline">重试</button>
          </div>
        )}

        {/* 我的智能体 */}
        {myApps.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">我的智能体</h3>
              <span className="text-xs text-slate-600">{myApps.length} 个</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myApps.map(app => <AppCard key={app.id} app={app} isMine={true} />)}
            </div>
          </section>
        )}

        {/* 平台智能体 */}
        {platformApps.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">平台智能体</h3>
              <span className="text-xs text-slate-600">{platformApps.length} 个</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {platformApps.map(app => <AppCard key={app.id} app={app} isMine={false} />)}
            </div>
          </section>
        )}

        {apps.length === 0 && !error && (
          <div className="text-center py-16 text-slate-500">
            <Briefcase className="w-12 h-12 mx-auto mb-3 text-slate-700" />
            <p className="mb-2">暂无可用智能体</p>
            <p className="text-xs text-slate-600 mb-4">点击「创建智能体」打造你的第一个合规智能体</p>
            <button onClick={() => navigate('/apps/create')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700 transition-colors">
              <Wand2 className="w-4 h-4" />创建智能体
            </button>
          </div>
        )}
      </div>

      {/* 创建项目弹窗 */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{CATEGORY_ICON[selected.category || ''] || '⚖️'}</span>
              <div>
                <h3 className="text-base font-semibold text-slate-100">启动智能体</h3>
                <p className="text-xs text-slate-500">{selected.name}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-1.5">企业名称</label>
              <input
                value={enterpriseName}
                onChange={e => setEnterpriseName(e.target.value)}
                placeholder="如：某某（广州）有限公司"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            {createError && (
              <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {createError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">取消</button>
              <button
                onClick={handleCreate}
                disabled={!enterpriseName.trim() || creating}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2 hover:bg-brand-700 transition-colors"
              >
                {creating
                  ? <><RefreshCw className="w-4 h-4 animate-spin" />创建中...</>
                  : <>创建项目<ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppListPage;
