/**
 * 渲染进程与主进程通信的类型定义
 * 适配 OpenClaw Gateway WS 协议
 */
export interface ElectronAPI {
  // 认证
  login: (email: string, password: string, apiUrl: string) => Promise<LoginResult>;
  logout: () => Promise<{ success: boolean }>;
  getAuthStatus: () => Promise<AuthStatus>;

  // WebSocket 连接
  wsConnect: (config?: { wsUrl?: string; mode?: 'cloud' | 'private'; gatewayToken?: string; gatewayDeviceToken?: string }) => Promise<{ success: boolean; error?: string }>;
  wsDisconnect: () => Promise<{ success: boolean }>;
  wsGetStatus: () => Promise<{ connected: boolean; sessionKey: string; wsMode: 'cloud' | 'private'; cloudWsUrl: string; privateWsUrl: string; wsUrl: string; hasGatewayToken: boolean; hasGatewayDeviceToken: boolean; gatewayDeviceToken?: string | null }>;
  wsSaveConfig: (config: { mode: 'cloud' | 'private'; cloudWsUrl: string; privateWsUrl: string; gatewayToken?: string; gatewayDeviceToken?: string }) => Promise<{ success: boolean; error?: string }>;
  wsSetSessionKey: (sessionKey: string) => Promise<{ success: boolean }>;

  // 对话 RPC
  chatSend: (message: string, options?: { sessionKey?: string; sessionId?: string; thinking?: string; attachments?: any[] }) => Promise<ChatSendResult>;
  chatHistory: (sessionKey?: string, sessionId?: string) => Promise<ChatHistoryResult>;
  chatAbort: (sessionKey?: string, runId?: string) => Promise<{ success: boolean; data?: any }>;

  // 会话管理
  chatListSessions: () => Promise<{ success: boolean; data?: ChatSessionMeta[] }>;
  chatCreateSession: (opts?: { title?: string; sessionKey?: string; projectId?: string | null }) => Promise<{ success: boolean; data?: ChatSessionMeta }>;
  chatUpdateSession: (sessionId: string, patch: { title?: string; projectId?: string | null }) => Promise<{ success: boolean; data?: ChatSessionMeta }>;
  chatDeleteSession: (sessionId: string) => Promise<{ success: boolean }>;
  chatSwitchSession: (sessionId: string) => Promise<{ success: boolean; data?: ChatSessionMeta; error?: string }>;
  chatClearAll: () => Promise<{ success: boolean }>;

  // 事件监听
  onWsStatus: (callback: (status: { connected: boolean; serverInfo?: any }) => void) => () => void;
  onWsError: (callback: (err: any) => void) => () => void;
  onChatEvent: (callback: (payload: ChatEventPayload) => void) => () => void;

  // REST API
  apiRequest: (method: string, path: string, data?: any, params?: any) => Promise<ApiResult>;

  // 菜单
  onMenuAction: (callback: (action: string) => void) => () => void;

  // 外部链接（用系统默认程序打开，避免浏览器弹登录框）
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;

  // 模型管理
  getModels: () => Promise<{ success: boolean; data?: Array<{ id: string; name: string; ownedBy: string }> }>;
  getSelectedModel: () => Promise<{ success: boolean; data?: string }>;
  setSelectedModel: (modelId: string) => Promise<{ success: boolean }>;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

export interface AuthStatus {
  isLoggedIn: boolean;
  token?: string | null;
  user?: User | null;
  apiUrl?: string | null;
  gatewayToken?: string | null;
  gatewayDeviceToken?: string | null;  // 兼容旧字段
  wsMode?: 'cloud' | 'private';
  cloudWsUrl?: string;
  privateWsUrl?: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'LAWYER' | 'ENTERPRISE' | 'ADMIN';
  tenantId?: number;
}

export interface ApiResult {
  success: boolean;
  data?: any;
  status?: number;
  error?: any;
}

// ============ Chat 相关类型 ============

export interface ChatSendResult {
  success: boolean;
  data?: {
    runId: string;
    status: string;
    sessionId?: string;
    userMessageId?: string;
    assistantMessageId?: string;
  };
  error?: string;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sessionKey: string;
  projectId?: string | null;
  messageCount: number;
}

export interface ChatHistoryResult {
  success: boolean;
  data?: {
    sessionKey: string;
    sessionId: string;
    messages: HistoryMessage[];
  };
  error?: string;
}

export interface HistoryMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  status?: 'sending' | 'streaming' | 'done' | 'error' | 'aborted';
  runId?: string;
  attachments?: any[];
}

/** Gateway chat 事件 payload (delta/final/aborted/error) */
export interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: 'delta' | 'final' | 'aborted' | 'error';
  deltaText?: string;        // delta 时有
  message?: any;             // final/aborted/error 时有
  usage?: any;
  stopReason?: string;
  errorMessage?: string;     // error 时有
  errorKind?: string;        // error 时有
  replace?: boolean;         // delta 时，是否替换已有内容
  seq?: number;
  spawnedBy?: string;
}

// 对话消息类型 (UI 展示用)
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  citations?: Citation[];
  status?: 'sending' | 'streaming' | 'done' | 'error' | 'aborted';
  runId?: string;
}

export interface Citation {
  lawName: string;
  article: string;
  text: string;
  source: 'regulation' | 'document';
}

// 项目类型
export interface Project {
  id: string;
  tenantId: number;
  lawyerId: number;
  enterpriseName: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

// 资料清单项
export interface ChecklistItem {
  id: string;
  parentId?: string;
  title: string;
  description?: string;
  required: boolean;
  sortOrder: number;
  status?: 'PENDING' | 'SUBMITTED' | 'PARSED' | 'ACCEPTED' | 'REJECTED' | 'MISSING';
  fileIds?: string[];
  requirements?: string;
  children?: ChecklistItem[];
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
