/**
 * Preload 脚本 - 安全暴露API给渲染进程
 * 适配 OpenClaw Gateway WS 协议
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ========== 认证 ==========
  login: (email: string, password: string, apiUrl: string) =>
    ipcRenderer.invoke('auth:login', { email, password, apiUrl }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getAuthStatus: () => ipcRenderer.invoke('auth:getStatus'),

  // ========== WebSocket 连接 ==========
  wsConnect: (config?: { wsUrl?: string; mode?: 'cloud' | 'private'; gatewayDeviceToken?: string }) =>
    ipcRenderer.invoke('ws:connect', config),
  wsDisconnect: () => ipcRenderer.invoke('ws:disconnect'),
  wsGetStatus: () => ipcRenderer.invoke('ws:getStatus'),
  wsSaveConfig: (config: { mode: 'cloud' | 'private'; cloudWsUrl: string; privateWsUrl: string; gatewayDeviceToken: string }) =>
    ipcRenderer.invoke('ws:saveConfig', config),
  wsSetSessionKey: (sessionKey: string) =>
    ipcRenderer.invoke('ws:setSessionKey', { sessionKey }),

  // ========== 对话 RPC ==========
  chatSend: (message: string, options?: { sessionKey?: string; sessionId?: string; thinking?: string; attachments?: any[] }) =>
    ipcRenderer.invoke('chat:send', { message, ...options }),
  chatHistory: (sessionKey?: string, sessionId?: string) =>
    ipcRenderer.invoke('chat:history', { sessionKey, sessionId }),
  chatAbort: (sessionKey?: string, runId?: string) =>
    ipcRenderer.invoke('chat:abort', { sessionKey, runId }),

  // ========== 会话管理 ==========
  chatListSessions: () => ipcRenderer.invoke('chat:listSessions'),
  chatCreateSession: (opts?: { title?: string; sessionKey?: string; projectId?: string | null }) =>
    ipcRenderer.invoke('chat:createSession', opts),
  chatUpdateSession: (sessionId: string, patch: { title?: string; projectId?: string | null }) =>
    ipcRenderer.invoke('chat:updateSession', { sessionId, patch }),
  chatDeleteSession: (sessionId: string) =>
    ipcRenderer.invoke('chat:deleteSession', { sessionId }),
  chatSwitchSession: (sessionId: string) =>
    ipcRenderer.invoke('chat:switchSession', { sessionId }),
  chatClearAll: () => ipcRenderer.invoke('chat:clearAll'),

  // ========== 事件监听 ==========
  onWsStatus: (callback: (status: { connected: boolean; serverInfo?: any }) => void) => {
    const handler = (_event: any, status: any) => callback(status);
    ipcRenderer.on('ws:status', handler);
    return () => ipcRenderer.removeListener('ws:status', handler);
  },
  onWsError: (callback: (err: any) => void) => {
    const handler = (_event: any, err: any) => callback(err);
    ipcRenderer.on('ws:error', handler);
    return () => ipcRenderer.removeListener('ws:error', handler);
  },
  /** 监听 Gateway chat 事件 (delta/final/aborted/error) */
  onChatEvent: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('chat:event', handler);
    return () => ipcRenderer.removeListener('chat:event', handler);
  },

  // ========== REST API 代理 ==========
  apiRequest: (method: string, path: string, data?: any, params?: any) =>
    ipcRenderer.invoke('api:request', { method, path, data, params }),

  // ========== 菜单事件 ==========
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action);
    ipcRenderer.on('menu-action', handler);
    return () => ipcRenderer.removeListener('menu-action', handler);
  },

  // ========== 外部链接（用系统默认程序打开，不弹浏览器登录框）==========
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // ========== 模型管理 ==========
  getModels: () => ipcRenderer.invoke('models:list'),
  getSelectedModel: () => ipcRenderer.invoke('models:getSelected'),
  setSelectedModel: (modelId: string) => ipcRenderer.invoke('models:setSelected', modelId),
});
