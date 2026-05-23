import React, { useEffect, useState } from 'react';
import { MessageSquare, FolderKanban, Settings, Scale, Briefcase, BookOpen, Zap } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface MainLayoutProps {
  children: React.ReactNode;
}

// 小龙虾图标（自定义 SVG）
const ClawIcon: React.FC<{ className?: string }> = ({ className }) => (
  <span className={className} style={{ fontSize: '16px', lineHeight: 1 }}>🦞</span>
);

const navItems = [
  { path: '/chat', label: 'AI 对话', icon: MessageSquare },
  { path: '/apps', label: '合规智能体', icon: Briefcase },
  { path: '/projects', label: '项目管理', icon: FolderKanban },
  { path: '/laws', label: '法规知识库', icon: BookOpen },
  { path: '/claw', label: '小龙虾', icon: null, emoji: '🦞' },
  { path: '/settings', label: '设置', icon: Settings },
];

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isConnected, setIsConnected] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<{ used: number; max: number; percent: number } | null>(null);
  const [currentModel, setCurrentModel] = useState('deepseek-v4-pro');

  // 启动时读取实际选中的模型
  useEffect(() => {
    window.electronAPI.getSelectedModel().then(res => {
      if (res.success && res.data) setCurrentModel(res.data);
    }).catch(() => {});

    // 监听模型切换事件（SettingsPage 切换后广播）
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.selectedId) setCurrentModel(detail.selectedId);
    };
    window.addEventListener('model-config-changed', handler);
    return () => window.removeEventListener('model-config-changed', handler);
  }, []);

  // 轮询真实连接状态
  useEffect(() => {
    const check = async () => {
      try {
        const status = await window.electronAPI.wsGetStatus();
        setIsConnected(status?.connected ?? false);
      } catch {
        setIsConnected(false);
      }
    };
    check();
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, []);

  // 加载 Token 用量（每 2 分钟刷新一次）
  useEffect(() => {
    const loadQuota = async () => {
      try {
        const res = await window.electronAPI.apiRequest('GET', '/api/chat/quota');
        if (res.success && res.data) {
          setTokenUsage({
            used: res.data.usedTokens,
            max: res.data.maxTokens,
            percent: res.data.usagePercent,
          });
        }
      } catch { /* 静默失败 */ }
    };
    loadQuota();
    const timer = setInterval(loadQuota, 120_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="h-screen flex bg-slate-950">
      {/* 侧边栏 */}
      <aside className="w-[240px] flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center gap-3 px-5 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100">ClawComply</h1>
            <p className="text-[10px] text-slate-500">企业合规平台</p>
          </div>
        </div>

        {/* 导航 */}
        <nav className="flex-1 py-3 px-3 space-y-1">
          {navItems.map(({ path, label, icon: Icon, emoji }) => {
            const isActive = location.pathname === path || 
              (path === '/apps' && location.pathname.startsWith('/apps'));
            const isClaw = path === '/claw';
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? isClaw
                      ? 'bg-orange-500/20 text-orange-300'
                      : 'bg-brand-600/20 text-brand-300'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {emoji
                  ? <span className="w-[18px] h-[18px] flex items-center justify-center text-base leading-none">{emoji}</span>
                  : Icon && <Icon className="w-[18px] h-[18px]" />
                }
                {label}
                {isClaw && (
                  <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-normal">
                    Agent
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* 底部信息 */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          {/* 模型状态 */}
          <div className="px-3 py-2 rounded-lg bg-slate-800/50">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-brand-400" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-400 truncate">☁️ 当前模型</div>
                <div className="text-[10px] truncate font-medium text-brand-400">
                  {currentModel}
                </div>
              </div>
            </div>
          </div>
          {/* Token 用量 */}
          {tokenUsage && (
            <button onClick={() => navigate('/settings')}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors text-left"
              title="点击查看详细用量">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-brand-400" />
                  <span className="text-[10px] text-slate-400">Token 用量</span>
                </div>
                <span className={`text-[10px] font-medium ${
                  tokenUsage.percent >= 90 ? 'text-red-400' :
                  tokenUsage.percent >= 70 ? 'text-amber-400' : 'text-slate-400'
                }`}>{tokenUsage.percent}%</span>
              </div>
              <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  tokenUsage.percent >= 90 ? 'bg-red-500' :
                  tokenUsage.percent >= 70 ? 'bg-amber-500' : 'bg-brand-500'
                }`} style={{ width: `${Math.min(tokenUsage.percent, 100)}%` }} />
              </div>
            </button>
          )}
          {/* 连接状态 */}
          <div className="px-3 py-2 rounded-lg bg-slate-800/50">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors ${isConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span className="text-xs text-slate-400">{isConnected ? '已连接' : '未连接'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
};

export default MainLayout;
