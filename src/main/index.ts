/**
 * ClawComply Electron 主进程入口
 *
 * 服务器地址通过 .env 文件配置（项目根目录 claw-client/）：
 *   .env.development  — 开发环境（内网 IP）
 *   .env.production   — 生产环境（外网 IP）
 *   .env              — 默认（当前激活）
 *
 * 切换环境只需修改 .env 文件，不需要改代码。
 */
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { GatewayConnection } from './websocket';
import { AuthStore } from './auth-store';
import { ChatStore } from './chat-store';

// 加载 .env 文件（主进程 Node.js 环境）
function loadEnv() {
  const envFile = app.isPackaged
    ? path.join(process.resourcesPath, '.env.production')
    : path.join(__dirname, '../../.env');
  const envProd = path.join(__dirname, '../../.env.production');
  const envDev  = path.join(__dirname, '../../.env.development');

  // 优先级：.env.production（打包）> .env.development（dev）> .env（默认）
  const candidates = app.isPackaged
    ? [envProd, envFile]
    : [envDev, envFile];

  for (const f of candidates) {
    if (fs.existsSync(f)) {
      const lines = fs.readFileSync(f, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) {   // 不覆盖已有的系统环境变量
          process.env[key] = val;
        }
      }
      break;
    }
  }
}
loadEnv();

let mainWindow: BrowserWindow | null = null;
let gateway: GatewayConnection | null = null;
const authStore = new AuthStore();
const chatStore = new ChatStore();

const DEFAULT_WS_URL         = process.env.CLAW_GATEWAY_URL     || 'ws://124.128.153.62:18790';
const DEFAULT_PRIVATE_WS_URL = process.env.CLAW_GATEWAY_URL     || 'ws://192.168.3.3:18790';
const DEFAULT_API_URL        = process.env.CLAW_API_URL          || 'http://124.128.153.62:8989';
const DEFAULT_GATEWAY_TOKEN  = process.env.CLAW_GATEWAY_TOKEN    || 'ClawGateway2026';

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'ClawComply',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 打包后 dist/main/index.js → dist/renderer/index.html
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuTemplate = buildMenu();
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

function buildMenu(): any[] {
  return [
    {
      label: 'ClawComply',
      submenu: [
        { label: '关于 ClawComply', role: 'about' },
        { type: 'separator' },
        { label: '设置', accelerator: 'CmdOrCtrl+,', click: () => sendMenuAction('settings') },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { type: 'separator' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', role: 'close' },
      ],
    },
  ];
}

function sendMenuAction(action: string) {
  if (mainWindow) {
    mainWindow.webContents.send('menu-action', action);
  }
}

/** 绑定 gateway 实例的事件监听 */
function bindGatewayEvents(gw: GatewayConnection) {
  gw.on('connected', (info: any) => {
    const scopes: string[] = Array.isArray(info?.auth?.scopes) ? info.auth.scopes : [];
    mainWindow?.webContents.send('ws:status', { connected: true, serverInfo: info, scopes });
  });

  gw.on('event', (evt: any) => {
    if (evt.event === 'chat') {
      mainWindow?.webContents.send('chat:event', evt.payload);
    }
  });

  gw.on('error', (err: any) => {
    const message = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
    mainWindow?.webContents.send('ws:error', { message });
  });

  gw.on('disconnected', () => {
    mainWindow?.webContents.send('ws:status', { connected: false });
  });
}

/** 自动连接 Gateway（HTTP 模式） */
async function autoConnectGateway() {
  const wsMode = await authStore.getWsMode();
  const cloudWsUrl = await authStore.getCloudWsUrl();
  const privateWsUrl = await authStore.getPrivateWsUrl();
  const gatewayTokenRaw = await authStore.getGatewayToken();
  const gatewayToken = (gatewayTokenRaw && gatewayTokenRaw.trim()) ? gatewayTokenRaw.trim() : DEFAULT_GATEWAY_TOKEN;

  const wsUrl = wsMode === 'cloud' ? cloudWsUrl : privateWsUrl;

  if (!gatewayToken) {
    mainWindow?.webContents.send('ws:error', {
      message: '未配置 Gateway Token，请在设置页填写后再连接',
    });
    return;
  }

  if (gateway?.connected) return;

  if (gateway) {
    gateway.disconnect();
  }

  gateway = await createGateway(wsUrl, gatewayToken);
  bindGatewayEvents(gateway);
  // 恢复上次选中的模型
  const savedModel = await authStore.getSelectedModel();
  if (savedModel) gateway.setModel(savedModel);
  gateway.connect();
}
async function createGateway(wsUrl: string, gatewayToken: string): Promise<GatewayConnection> {
  const apiUrl = await authStore.getApiUrl();
  const apiToken = await authStore.getToken();
  return new GatewayConnection({
    wsUrl,
    token: gatewayToken,
    chatStore,
    apiBaseUrl: apiUrl || null,
    apiToken: apiToken || null,
  });
}

// ============ IPC Handlers ============

// 认证相关
ipcMain.handle('auth:login', async (_event, { email, password, apiUrl }: { email: string; password: string; apiUrl: string }) => {
  try {
    const axios = require('axios');
    const normalizedApiUrl = String(apiUrl || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(normalizedApiUrl)) {
      return { success: false, error: '网关地址必须是 http:// 或 https:// 开头' };
    }

    const res = await axios.post(`${normalizedApiUrl}/api/auth/login`, { email, password }, {
      timeout: 15000,
      proxy: false,
    });
    const payload = res.data?.data || res.data;
    const token = payload.accessToken;
    const user = {
      id: payload.userId,
      name: payload.name,
      email,
      role: payload.role || 'LAWYER',
    };
    await authStore.setToken(token);
    await authStore.setUser(user);
    await authStore.setApiUrl(normalizedApiUrl);
    await authStore.setWsMode('cloud');
    await authStore.setCloudWsUrl(DEFAULT_WS_URL);
    // 如后端返回网关 token，保存以便优先走 token 路径
    const gwToken = payload.gatewayToken || payload.wsToken || payload.openclawToken || null;
    if (gwToken) {
      await authStore.setGatewayToken(String(gwToken));
    }

    // 登录成功后自动连接 Gateway WS
    autoConnectGateway();

    return { success: true, token, user };
  } catch (err: any) {
    return { success: false, error: err.response?.data?.message || err.message || '登录失败' };
  }
});

ipcMain.handle('auth:logout', async () => {
  await authStore.clear();
  if (gateway) {
    gateway.disconnect();
    gateway = null;
  }
  return { success: true };
});

ipcMain.handle('auth:getStatus', async () => {
  const token = await authStore.getToken();
  const user = await authStore.getUser();
  const apiUrl = await authStore.getApiUrl();
  const gatewayToken = await authStore.getGatewayToken();
  const gatewayDeviceToken = await authStore.getGatewayDeviceToken();
  const wsMode = await authStore.getWsMode();
  const cloudWsUrl = await authStore.getCloudWsUrl();
  const privateWsUrl = await authStore.getPrivateWsUrl();
  return { isLoggedIn: !!token, token, user, apiUrl, gatewayToken, gatewayDeviceToken, wsMode, cloudWsUrl, privateWsUrl };
});

// WebSocket 连接管理（HTTP 模式）
ipcMain.handle('ws:connect', async (_event, config?: { wsUrl?: string; mode?: 'cloud' | 'private'; gatewayToken?: string; gatewayDeviceToken?: string }) => {
  const mode = config?.mode || await authStore.getWsMode();
  const cloudWsUrl = config?.wsUrl && mode === 'cloud' ? config.wsUrl : await authStore.getCloudWsUrl();
  const privateWsUrl = config?.wsUrl && mode === 'private' ? config.wsUrl : await authStore.getPrivateWsUrl();
  const wsUrl = mode === 'cloud' ? cloudWsUrl : privateWsUrl;

  const gatewayToken = typeof config?.gatewayToken === 'string'
    ? (config.gatewayToken.trim() || DEFAULT_GATEWAY_TOKEN)
    : ((await authStore.getGatewayToken())?.trim() || DEFAULT_GATEWAY_TOKEN);

  await authStore.setWsMode(mode);
  if (mode === 'cloud') await authStore.setCloudWsUrl(wsUrl);
  if (mode === 'private') await authStore.setPrivateWsUrl(wsUrl);
  await authStore.setGatewayToken(gatewayToken);

  if (gateway) {
    gateway.disconnect();
  }

  gateway = await createGateway(wsUrl, gatewayToken);
  bindGatewayEvents(gateway);
  const savedModel2 = await authStore.getSelectedModel();
  if (savedModel2) gateway.setModel(savedModel2);
  gateway.connect();
  return { success: true };
});

ipcMain.handle('ws:disconnect', async () => {
  if (gateway) {
    gateway.disconnect();
    gateway = null;
  }
  return { success: true };
});

ipcMain.handle('ws:saveConfig', async (_event, config: {
  mode: 'cloud' | 'private';
  cloudWsUrl: string;
  privateWsUrl: string;
  gatewayToken?: string;
  gatewayDeviceToken?: string;
}) => {
  const mode = config.mode;
  const cloudWsUrl = String(config.cloudWsUrl || '').trim() || DEFAULT_WS_URL;
  const privateWsUrl = String(config.privateWsUrl || '').trim() || DEFAULT_PRIVATE_WS_URL;
  const gatewayToken = String(config.gatewayToken || '').trim() || DEFAULT_GATEWAY_TOKEN;

  await authStore.setWsMode(mode);
  await authStore.setCloudWsUrl(cloudWsUrl);
  await authStore.setPrivateWsUrl(privateWsUrl);
  await authStore.setGatewayToken(gatewayToken);

  return { success: true };
});

// 对话相关 RPC
ipcMain.handle('chat:send', async (_event, { message, sessionKey, sessionId, thinking, attachments }: {
  message: string; sessionKey?: string; sessionId?: string; thinking?: string; attachments?: any[];
}) => {
  if (!gateway?.connected) return { success: false, error: '未连接 Gateway' };
  try {
    if (sessionId) gateway.setSessionId(sessionId);
    if (sessionKey) gateway.setSessionKey(sessionKey);
    // 读取律师选择的模型，传给后端（后端用于直连 DeepSeek 时选择模型）
    const selectedModel = await authStore.getSelectedModel();
    const result = await gateway.chatSend(message, { sessionKey, sessionId, thinking, attachments, modelId: selectedModel });
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('chat:history', async (_event, { sessionKey, sessionId }: { sessionKey?: string; sessionId?: string }) => {
  // 历史是本地存储，不需要 Gateway 连接也能读
  try {
    if (gateway) {
      const result = await gateway.chatHistory(sessionKey, sessionId);
      return { success: true, data: result };
    }
    // 无 gateway 实例时直接读 chatStore
    const sid = sessionId;
    if (!sid) return { success: true, data: { sessionKey: sessionKey || 'main', messages: [] } };
    const messages = chatStore.listMessages(sid).map(m => ({
      role: m.role, content: m.content, timestamp: m.timestamp, status: m.status, runId: m.runId, id: m.id,
    }));
    return { success: true, data: { sessionKey: sessionKey || 'main', sessionId: sid, messages } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('chat:abort', async (_event, { sessionKey, runId }: { sessionKey?: string; runId?: string }) => {
  if (!gateway?.connected) return { success: false, error: '未连接 Gateway' };
  try {
    const result = await gateway.chatAbort(sessionKey, runId);
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// 会话管理（基于本地 chatStore）
ipcMain.handle('chat:listSessions', async () => {
  return { success: true, data: chatStore.listSessions() };
});

ipcMain.handle('chat:createSession', async (_event, opts?: { title?: string; sessionKey?: string; projectId?: string | null }) => {
  const meta = chatStore.createSession(opts);
  // 创建后将 gateway 切换到该会话
  if (gateway) {
    gateway.setSessionId(meta.id);
    gateway.setSessionKey(meta.sessionKey);
  }
  return { success: true, data: meta };
});

ipcMain.handle('chat:updateSession', async (_event, { sessionId, patch }: { sessionId: string; patch: { title?: string; projectId?: string | null } }) => {
  const meta = chatStore.updateSession(sessionId, patch);
  return { success: !!meta, data: meta };
});

ipcMain.handle('chat:deleteSession', async (_event, { sessionId }: { sessionId: string }) => {
  chatStore.deleteSession(sessionId);
  // 如果删除的是当前激活会话，清空 gateway 的 sessionId
  if (gateway && gateway.getSessionId() === sessionId) {
    gateway.setSessionId(null);
  }
  return { success: true };
});

ipcMain.handle('chat:switchSession', async (_event, { sessionId }: { sessionId: string }) => {
  const meta = chatStore.getSession(sessionId);
  if (!meta) return { success: false, error: '会话不存在' };
  if (gateway) {
    gateway.setSessionId(sessionId);
    gateway.setSessionKey(meta.sessionKey);
  }
  return { success: true, data: meta };
});

ipcMain.handle('chat:clearAll', async () => {
  chatStore.clearAll();
  if (gateway) gateway.setSessionId(null);
  return { success: true };
});

// 获取连接状态
ipcMain.handle('ws:getStatus', async () => {
  const wsMode = await authStore.getWsMode();
  const cloudWsUrl = await authStore.getCloudWsUrl();
  const privateWsUrl = await authStore.getPrivateWsUrl();
  const gatewayToken = await authStore.getGatewayToken();
  return {
    connected: gateway?.connected ?? false,
    sessionKey: gateway?.getSessionKey() ?? 'main',
    wsMode,
    cloudWsUrl,
    privateWsUrl,
    wsUrl: wsMode === 'cloud' ? cloudWsUrl : privateWsUrl,
    hasGatewayToken: !!(gatewayToken?.trim()),
    hasGatewayDeviceToken: false,
    gatewayDeviceToken: null,
  };
});

// 设置 session key
ipcMain.handle('ws:setSessionKey', async (_event, { sessionKey }: { sessionKey: string }) => {
  if (gateway) {
    gateway.setSessionKey(sessionKey);
    return { success: true };
  }
  return { success: false, error: '未连接' };
});

// REST API 代理
ipcMain.handle('api:request', async (_event, { method, path, data, params }: {
  method: string; path: string; data?: any; params?: any;
}) => {
  try {
    const axios = require('axios');
    const apiUrl = await authStore.getApiUrl();
    const token = await authStore.getToken();
    // apiUrl 为 null 时 fallback 到外网后端
    const baseUrl = (apiUrl && apiUrl.trim()) ? apiUrl.trim() : DEFAULT_API_URL;
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
    const res = await axios({
      method,
      url,
      data,
      params,
      timeout: 20000,
      proxy: false,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { success: true, data: res.data?.data ?? res.data };
  } catch (err: any) {
    const status = err.response?.status;
    const body = err.response?.data;
    // Spring Boot /error 响应体是对象，提取 message 字段；否则用 err.message
    const message = (typeof body === 'object' && body !== null)
      ? (body.message || body.error || JSON.stringify(body))
      : (typeof body === 'string' ? body : err.message);
    return { success: false, status, error: message };
  }
});

// 用系统默认程序打开外部链接（PDF 用系统 PDF 阅读器，不走浏览器）
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// 模型管理
ipcMain.handle('models:list', async () => {
  try {
    const axios = require('axios');
    const wsUrl = await authStore.getWsMode() === 'cloud'
      ? await authStore.getCloudWsUrl()
      : await authStore.getPrivateWsUrl();
    const httpUrl = wsUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://').replace(/\/$/, '');
    const token = (await authStore.getGatewayToken()) || DEFAULT_GATEWAY_TOKEN;
    const res = await axios.get(`${httpUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
      proxy: false,
    });
    const models = (res.data?.data || []).map((m: any) => ({
      id: m.id,
      name: m.id,
      ownedBy: m.owned_by || 'openclaw',
    }));
    return { success: true, data: models };
  } catch (err: any) {
    // 拉取失败时返回默认模型
    return { success: true, data: [{ id: 'openclaw', name: 'openclaw (默认)', ownedBy: 'openclaw' }] };
  }
});

ipcMain.handle('models:getSelected', async () => {
  const stored = await authStore.getSelectedModel();
  return { success: true, data: stored || 'openclaw' };
});

ipcMain.handle('models:setSelected', async (_event, modelId: string) => {
  await authStore.setSelectedModel(modelId);
  // 通知 gateway 实例更新模型
  if (gateway) gateway.setModel(modelId);
  return { success: true };
});

// ============ App Lifecycle ============

app.whenReady().then(async () => {
  // 确保 gateway token 有默认值
  const storedToken = await authStore.getGatewayToken();
  if (!storedToken || !storedToken.trim()) {
    await authStore.setGatewayToken(DEFAULT_GATEWAY_TOKEN);
  }
  // 确保 apiUrl 有默认值
  const storedApiUrl = await authStore.getApiUrl();
  if (!storedApiUrl || !storedApiUrl.trim() || storedApiUrl === 'null') {
    await authStore.setApiUrl(DEFAULT_API_URL);
  }
  // 强制更新云端/私有化 WS 地址（覆盖旧 IP）
  const storedCloudUrl = await authStore.getCloudWsUrl();
  if (!storedCloudUrl) {
    await authStore.setCloudWsUrl(DEFAULT_WS_URL);
  }
  const storedPrivateUrl = await authStore.getPrivateWsUrl();
  if (!storedPrivateUrl) {
    await authStore.setPrivateWsUrl(DEFAULT_PRIVATE_WS_URL);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (gateway) {
    gateway.disconnect();
  }
});
