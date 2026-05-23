import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const DEFAULT_WS = import.meta.env.VITE_GATEWAY_URL || 'ws://124.128.153.62:18790';
const DEFAULT_PRIVATE_WS = import.meta.env.VITE_GATEWAY_URL || 'ws://192.168.3.3:18790';
const DEFAULT_GATEWAY_TOKEN = import.meta.env.VITE_GATEWAY_TOKEN || 'ClawGateway2026';

// ===== 模型配置 =====
interface ModelOption {
  id: string;
  name: string;
  ownedBy: string;
}

const MODEL_STORAGE_KEY = 'clawcomply-model-config';

function loadModelConfig(): { selectedId: string; modelType: 'cloud' | 'private' } {
  try {
    const raw = localStorage.getItem(MODEL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { selectedId: 'deepseek-v4-pro', modelType: 'cloud' };
}

function saveModelConfig(config: { selectedId: string; modelType: 'cloud' | 'private' }) {
  localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('model-config-changed', { detail: config }));
}

export function useModelConfig() {
  const [config, setConfig] = useState(loadModelConfig);
  useEffect(() => {
    const handler = (e: Event) => setConfig((e as CustomEvent).detail);
    window.addEventListener('model-config-changed', handler);
    return () => window.removeEventListener('model-config-changed', handler);
  }, []);
  return config;
}

const SettingsPage: React.FC = () => {
  const { user, logout, apiUrl: savedApiUrl } = useAuth();
  const [mode, setMode] = useState<'cloud' | 'private'>('cloud');
  const [cloudUrl, setCloudUrl] = useState(DEFAULT_WS);
  const [privateUrl, setPrivateUrl] = useState(DEFAULT_PRIVATE_WS);
  const [gatewayToken, setGatewayToken] = useState(DEFAULT_GATEWAY_TOKEN);
  const [apiUrl, setApiUrl] = useState(savedApiUrl || import.meta.env.VITE_API_URL || 'http://124.128.153.62:8989');
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [saveMsg, setSaveMsg] = useState('');

  // 模型配置 — 从 Gateway 动态拉取
  const [models, setModels] = useState<ModelOption[]>([{ id: 'openclaw', name: 'openclaw (默认)', ownedBy: 'openclaw' }]);
  const [selectedModelId, setSelectedModelId] = useState('openclaw');
  const [modelsLoading, setModelsLoading] = useState(false);

  const loadModels = async () => {
    setModelsLoading(true);
    try {
      // OpenClaw Gateway 的 /v1/models 只返回 agent 路由，不返回底层 provider 模型
      // 直连 DeepSeek 支持的模型列表（其他模型暂时降级到 DeepSeek）
      const CONFIGURED_MODELS = [
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash ⚡ 推荐', ownedBy: 'DeepSeek 官方' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro 🧠 深度推理', ownedBy: 'DeepSeek 官方' },
        { id: 'gpt-5.5', name: 'GPT 5.5（通过 OpenClaw）', ownedBy: 'hajimi' },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6（通过 OpenClaw）', ownedBy: 'hajimi' },
      ];
      setModels(CONFIGURED_MODELS);

      // 读取已保存的选中模型
      const selectedRes = await window.electronAPI.getSelectedModel();
      if (selectedRes.success && selectedRes.data) {
        setSelectedModelId(selectedRes.data);
      }
    } catch (e) {
      console.warn('[Settings] 加载模型配置失败', e);
    } finally {
      setModelsLoading(false);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    setSelectedModelId(modelId);
    saveModelConfig({ selectedId: modelId, modelType: 'cloud' });
    await window.electronAPI.setSelectedModel(modelId);
    // 注：切换底层模型需要修改 openclaw.json 并重启 OpenClaw
    // 当前选择已保存，下次重启 OpenClaw 时生效
  };

  useEffect(() => {
    if (savedApiUrl) setApiUrl(savedApiUrl);
    loadModels();  // 拉取 Gateway 模型列表
    (async () => {
      try {
        const authStatus = await window.electronAPI.getAuthStatus();
        if (authStatus.wsMode) setMode(authStatus.wsMode);
        if (authStatus.cloudWsUrl) setCloudUrl(authStatus.cloudWsUrl);
        if (authStatus.privateWsUrl) setPrivateUrl(authStatus.privateWsUrl);
        if (authStatus.gatewayToken) setGatewayToken(authStatus.gatewayToken);
        const ws = await window.electronAPI.wsGetStatus();
        setWsStatus(ws.connected ? 'connected' : 'disconnected');
      } catch (err) {
        console.warn('[Settings] load ws config failed', err);
      }
    })();
    const unsubStatus = window.electronAPI.onWsStatus((status) => {
      setWsStatus(status.connected ? 'connected' : 'disconnected');
    });
    const unsubError = window.electronAPI.onWsError(() => setWsStatus('disconnected'));
    return () => { unsubStatus(); unsubError(); };
  }, [savedApiUrl]);

  const handleConnect = async () => {
    setWsStatus('connecting');
    try {
      const saveRes = await window.electronAPI.wsSaveConfig({
        mode, cloudWsUrl: cloudUrl, privateWsUrl: privateUrl, gatewayDeviceToken: gatewayToken,
      });
      if (!saveRes.success) {
        setWsStatus('disconnected');
        setSaveMsg(`保存失败: ${saveRes.error || '未知错误'}`);
        setTimeout(() => setSaveMsg(''), 3000);
        return;
      }
      const result = await window.electronAPI.wsConnect({
        mode, wsUrl: mode === 'cloud' ? cloudUrl : privateUrl, gatewayDeviceToken: gatewayToken,
      });
      if (result.success) {
        setWsStatus('connected');
        setSaveMsg('连接成功');
      } else {
        setWsStatus('disconnected');
        setSaveMsg(`连接失败: ${result.error}`);
      }
    } catch {
      setWsStatus('disconnected');
      setSaveMsg('连接异常');
    }
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const handleDisconnect = async () => {
    await window.electronAPI.wsDisconnect();
    setWsStatus('disconnected');
  };

  const currentModels = models;
  const selectedModel = models.find(m => m.id === selectedModelId);

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="h-14 flex items-center px-5 border-b border-slate-800 bg-slate-900/50">
        <h2 className="text-sm font-semibold text-slate-200">设置</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl space-y-6">

          {/* ===== 账户信息 ===== */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">账户信息</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">姓名</span>
                <span className="text-sm text-slate-200">{user?.name || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">邮箱</span>
                <span className="text-sm text-slate-200">{user?.email || '-'}</span>
              </div>
            </div>
            <button
              onClick={logout}
              className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
            >
              退出登录
            </button>
          </section>

          {/* ===== Token 用量统计 ===== */}
          <TokenUsageSection />

          {/* ===== AI 模型配置 ===== */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-200">AI 模型</h3>
              <div className="flex items-center gap-2">
                {selectedModel && (
                  <span className="text-xs text-slate-500">
                    当前：<span className="text-brand-400 font-medium">{selectedModel.name}</span>
                  </span>
                )}
                <button onClick={loadModels} disabled={modelsLoading}
                  className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors" title="刷新模型列表">
                  <RefreshCw className={`w-3.5 h-3.5 ${modelsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              选择 AI 对话使用的模型。DeepSeek 系列直连官方 API，响应快、成本低；其他模型通过 OpenClaw 中转。
              <br />
              <span className="text-brand-400/80">💡 对话记忆：每次对话自动携带最近 3 轮历史，跨会话记忆存储在服务端数据库。</span>
            </p>

            {modelsLoading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="w-5 h-5 text-brand-400 animate-spin" />
                <span className="ml-2 text-sm text-slate-400">正在获取模型列表...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {currentModels.map(model => (
                  <button
                    key={model.id}
                    onClick={() => handleSelectModel(model.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                      selectedModelId === model.id
                        ? 'bg-brand-900/20 border-brand-500/60'
                        : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${selectedModelId === model.id ? 'text-brand-300' : 'text-slate-200'}`}>
                            {model.name}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">{model.ownedBy}</span>
                        </div>
                      </div>
                      {selectedModelId === model.id
                        ? <CheckCircle2 className="w-4 h-4 text-brand-400 flex-shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-slate-600 flex-shrink-0" />
                      }
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-600 mt-3">
              DeepSeek 系列直连官方 API，prompt_tokens ~500（vs OpenClaw 的 28K）。
            </p>
          </section>

          {/* ===== 网关连接 ===== */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">网关连接</h3>

            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setMode('cloud')}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  mode === 'cloud'
                    ? 'bg-brand-600/20 border-brand-500 text-brand-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                ☁️ 云端模式（默认）
              </button>
              <button
                onClick={() => setMode('private')}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  mode === 'private'
                    ? 'bg-brand-600/20 border-brand-500 text-brand-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                🏠 私有化模式
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">REST API 地址</label>
                <input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Gateway Token（必填）</label>
                <input
                  value={gatewayToken}
                  onChange={(e) => setGatewayToken(e.target.value)}
                  placeholder="填写 Gateway Token"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                />
              </div>
              {mode === 'cloud' ? (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">云端 WebSocket 地址</label>
                  <input
                    value={cloudUrl}
                    onChange={(e) => setCloudUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">私有化网关地址</label>
                  <input
                    value={privateUrl}
                    onChange={(e) => setPrivateUrl(e.target.value)}
                    placeholder={import.meta.env.VITE_GATEWAY_URL || "ws://192.168.3.3:18790"}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-2">
                {wsStatus === 'connected' ? (
                  <Wifi className="w-5 h-5 text-emerald-400" />
                ) : wsStatus === 'connecting' ? (
                  <RefreshCw className="w-5 h-5 text-brand-400 animate-spin" />
                ) : (
                  <WifiOff className="w-5 h-5 text-slate-500" />
                )}
                <span className="text-sm text-slate-400">
                  {wsStatus === 'connected' ? '已连接' : wsStatus === 'connecting' ? '连接中...' : '未连接'}
                </span>
              </div>
              {wsStatus === 'connected' ? (
                <button onClick={handleDisconnect} className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition-colors">
                  断开
                </button>
              ) : (
                <button onClick={handleConnect} disabled={wsStatus === 'connecting'} className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
                  连接
                </button>
              )}
            </div>
            {saveMsg && (
              <p className={`text-xs mt-2 ${saveMsg.includes('失败') ? 'text-red-400' : 'text-emerald-400'}`}>
                {saveMsg}
              </p>
            )}
          </section>

        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Token 用量统计组件
// ─────────────────────────────────────────────────────────────────

interface QuotaData {
  period: string;
  usedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  usagePercent: number;
}

const TokenUsageSection: React.FC = () => {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadQuota = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await window.electronAPI.apiRequest('GET', '/api/chat/quota');
      if (res.success && res.data) {
        setQuota(res.data);
      } else {
        setError(res.error || '获取用量失败');
      }
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadQuota(); }, []);

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return { bar: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
    if (percent >= 70) return { bar: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
    return { bar: 'bg-brand-500', text: 'text-brand-400', bg: 'bg-brand-500/10 border-brand-500/30' };
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-200">Token 用量</h3>
        </div>
        <button onClick={loadQuota} disabled={loading}
          className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !quota && (
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="w-5 h-5 text-brand-400 animate-spin" />
          <span className="ml-2 text-sm text-slate-400">加载中...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
          <button onClick={loadQuota} className="ml-auto underline">重试</button>
        </div>
      )}

      {quota && (() => {
        const colors = getUsageColor(quota.usagePercent);
        return (
          <div className="space-y-4">
            {/* 当前月份 */}
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                {quota.period} 月度用量
              </span>
              <span className={`font-medium ${colors.text}`}>{quota.usagePercent}%</span>
            </div>

            {/* 进度条 */}
            <div>
              <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                  style={{ width: `${Math.min(quota.usagePercent, 100)}%` }}
                />
              </div>
            </div>

            {/* 数字详情 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className={`text-lg font-bold ${colors.text}`}>{formatTokens(quota.usedTokens)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">已使用</div>
              </div>
              <div className="text-center px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-lg font-bold text-slate-300">{formatTokens(quota.remainingTokens)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">剩余</div>
              </div>
              <div className="text-center px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div className="text-lg font-bold text-slate-400">{formatTokens(quota.maxTokens)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">月度上限</div>
              </div>
            </div>

            {/* 预警提示 */}
            {quota.usagePercent >= 80 && (
              <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs ${colors.bg}`}>
                <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${colors.text}`} />
                <span className={colors.text}>
                  {quota.usagePercent >= 90
                    ? '⚠️ Token 用量已超过 90%，请联系管理员提升额度或减少对话频率'
                    : '本月 Token 用量已超过 80%，请注意控制使用频率'}
                </span>
              </div>
            )}

            <p className="text-[10px] text-slate-600 text-center">
              Token 统计每次对话后自动更新 · 1K Token ≈ 750 个汉字
            </p>
          </div>
        );
      })()}
    </section>
  );
};

export default SettingsPage;
