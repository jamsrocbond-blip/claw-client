/**
 * OpenClaw Gateway 连接管理器
 *
 * 鉴权方案（双模式，自动切换）：
 * 1. 后端代理模式（优先）：通过 Spring Boot /api/chat/sessions/{id}/messages/stream
 *    - JWT/test-token 鉴权，对话记录持久化到 PostgreSQL，Token 消耗统计
 * 2. 直连模式（降级）：直接 POST /v1/chat/completions 到 OpenClaw Gateway
 *    - 仅需 gateway token，对话历史存本地 electron-store
 *
 * 切换逻辑：
 * - apiUrl 已配置且后端可达 → 后端代理模式
 * - 后端不可达或未配置 → 直连模式
 */
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import type { ChatStore, StoredMessage } from './chat-store';

// ============ 调试工具 ============
function maskToken(token?: string | null): string {
  if (!token) return '<empty>';
  if (token.length <= 8) return `${token[0] ?? ''}***${token[token.length - 1] ?? ''}`;
  return `${token.slice(0, 4)}***${token.slice(-4)}`;
}

// ============ GatewayConnection ============
export class GatewayConnection extends EventEmitter {
  private baseUrl: string;
  private token: string;
  private sessionKey: string = 'main';
  private sessionId: string | null = null;
  private chatStore: ChatStore | null = null;
  private isConnected = false;
  private abortControllers = new Map<string, AbortController>();
  private streamingMessageIds = new Map<string, string>();
  private currentModel: string = 'openclaw';  // 当前选中的模型

  // 后端代理模式
  private apiBaseUrl: string | null = null;
  private apiToken: string | null = null;
  // 后端会话 ID 缓存（sessionKey → backendSessionId）
  private backendSessionIds = new Map<string, number | null>();

  constructor(config: {
    wsUrl?: string;
    token: string;
    deviceToken?: string | null;
    privateKeyPem?: string | null;
    publicKeyPem?: string | null;
    deviceId?: string | null;
    chatStore?: ChatStore;
    apiBaseUrl?: string | null;
    apiToken?: string | null;
  }) {
    super();
    const rawUrl = config.wsUrl || 'ws://192.168.3.3:18790';
    this.baseUrl = rawUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://').replace(/\/$/, '');
    this.token = (config.token || '').trim();
    this.chatStore = config.chatStore || null;
    this.apiBaseUrl = config.apiBaseUrl ? config.apiBaseUrl.replace(/\/+$/, '') : null;
    this.apiToken = config.apiToken || null;
  }

  /** 模拟连接（HTTP 模式下直接标记为已连接） */
  connect() {
    console.log(`[GW] HTTP mode, baseUrl=${this.baseUrl}, token=${maskToken(this.token)}`);
    // 发一个 health check 验证连通性
    this.healthCheck().then(ok => {
      if (ok) {
        this.isConnected = true;
        this.emit('connected', {
          type: 'hello-ok',
          protocol: 4,
          server: { version: 'http-mode' },
          auth: { role: 'operator', scopes: ['operator.read', 'operator.write'] },
        });
        console.log('[GW] HTTP connection verified');
      } else {
        this.emit('error', new Error('Gateway health check failed，请检查网关地址和 Token'));
      }
    });
  }

  private async healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      const url = new URL(`${this.baseUrl}/health`);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'GET',
        timeout: 5000,
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  /** 发送对话消息（流式 SSE）— 优先走后端代理，降级直连 */
  async chatSend(
    message: string,
    options?: { sessionKey?: string; sessionId?: string; thinking?: string; attachments?: any[]; modelId?: string }
  ): Promise<{ runId: string; status: string; sessionId?: string; userMessageId?: string; assistantMessageId?: string }> {
    // 尝试后端代理模式
    if (this.apiBaseUrl && this.apiToken) {
      try {
        return await this.chatSendViaProxy(message, options);
      } catch (e: any) {
        console.warn('[GW] 后端代理失败，降级直连:', e.message);
      }
    }
    // 降级：直连 OpenClaw
    return this.chatSendDirect(message, options);
  }

  /** 后端代理模式：通过 Spring Boot /api/chat/sessions/{id}/messages/stream */
  private async chatSendViaProxy(
    message: string,
    options?: { sessionKey?: string; sessionId?: string; thinking?: string; attachments?: any[]; modelId?: string }
  ): Promise<{ runId: string; status: string; sessionId?: string; userMessageId?: string; assistantMessageId?: string }> {
    const runId = randomUUID();
    const sessionKey = options?.sessionKey || this.sessionKey;

    // 获取或创建后端会话
    let backendSessionId = this.backendSessionIds.get(sessionKey);
    if (!backendSessionId) {
      backendSessionId = await this.getOrCreateBackendSession(sessionKey);
      if (!backendSessionId) throw new Error('无法创建后端会话');
      this.backendSessionIds.set(sessionKey, backendSessionId);
    }

    // 本地消息预存
    const localSessionId = options?.sessionId || this.sessionId;
    let userMessageId: string | undefined;
    let assistantMessageId: string | undefined;
    if (this.chatStore && localSessionId) {
      userMessageId = randomUUID();
      this.chatStore.appendMessage(localSessionId, { id: userMessageId, role: 'user', content: message, timestamp: Date.now(), status: 'done' });
      this.chatStore.autoTitleIfEmpty(localSessionId, message);
      assistantMessageId = randomUUID();
      this.chatStore.appendMessage(localSessionId, { id: assistantMessageId, role: 'assistant', content: '', timestamp: Date.now(), status: 'streaming', runId });
      this.streamingMessageIds.set(runId, assistantMessageId);
    }

    // 请求体：带上 modelId 供后端选择模型
    const body = JSON.stringify({
      content: message,
      sessionKey,
      modelId: options?.modelId || null,
    });
    const url = new URL(`${this.apiBaseUrl}/api/chat/sessions/${backendSessionId}/messages/stream`);
    const lib = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Length': Buffer.byteLength(body),
          'Accept': 'text/event-stream',
        },
        timeout: 120000,
      }, (res) => {
        if (res.statusCode !== 200) {
          let errBody = '';
          res.on('data', (c: Buffer) => errBody += c.toString());
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errBody.slice(0, 200)}`)));
          return;
        }

        resolve({ runId, status: 'streaming', sessionId: localSessionId ?? undefined, userMessageId, assistantMessageId });

        let buffer = '';
        let accumulated = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            // 跳过 event: 行（有空格或无空格均兼容）
            if (line.startsWith('event:') || line.startsWith(':') || line.trim() === '') continue;
            // 兼容 "data: " 和 "data:" 两种格式
            if (line.startsWith('data:')) {
              const data = line.slice(line.startsWith('data: ') ? 6 : 5).trim();
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  accumulated += parsed.text;
                  if (this.chatStore && localSessionId && assistantMessageId) {
                    this.chatStore.updateMessage(localSessionId, assistantMessageId, { content: accumulated, status: 'streaming' });
                  }
                  this.emit('event', { type: 'event', event: 'chat', payload: { runId, sessionKey, state: 'delta', deltaText: parsed.text } });
                } else if (parsed.messageId !== undefined) {
                  // done 事件
                  this.persistMessageState(localSessionId, assistantMessageId, runId, 'done', accumulated);
                  this.emit('event', { type: 'event', event: 'chat', payload: { runId, sessionKey, state: 'final' } });
                } else if (parsed.message) {
                  // error 事件
                  this.persistMessageState(localSessionId, assistantMessageId, runId, 'error', accumulated || parsed.message);
                  this.emit('event', { type: 'event', event: 'chat', payload: { runId, sessionKey, state: 'error', errorMessage: parsed.message } });
                }
              } catch (e) { /* 忽略解析错误 */ }
            }
          }
        });

        res.on('end', () => {
          this.persistMessageState(localSessionId, assistantMessageId, runId, 'done', accumulated);
          this.emit('event', { type: 'event', event: 'chat', payload: { runId, sessionKey, state: 'final' } });
        });

        res.on('error', (err: Error) => {
          this.persistMessageState(localSessionId, assistantMessageId, runId, 'error', err.message);
          this.emit('event', { type: 'event', event: 'chat', payload: { runId, sessionKey, state: 'error', errorMessage: err.message } });
        });
      });

      req.on('error', (err: Error) => reject(err));
      req.write(body);
      req.end();
    });
  }

  /** 获取或创建后端会话，返回 backendSessionId */
  private async getOrCreateBackendSession(sessionKey: string): Promise<number | null> {
    return new Promise((resolve) => {
      const body = JSON.stringify({ sessionKey, title: sessionKey });
      const url = new URL(`${this.apiBaseUrl}/api/chat/sessions`);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => data += c.toString());
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const id = parsed?.data?.id ?? parsed?.id ?? null;
            resolve(id ? Number(id) : null);
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.write(body);
      req.end();
    });
  }

  /** 直连模式（原有逻辑，重命名） */
  private async chatSendDirect(
    message: string,
    options?: { sessionKey?: string; sessionId?: string; thinking?: string; attachments?: any[] }
  ): Promise<{ runId: string; status: string; sessionId?: string; userMessageId?: string; assistantMessageId?: string }> {
    const runId = randomUUID();
    const sessionKey = options?.sessionKey || this.sessionKey;
    const sessionId = options?.sessionId || this.sessionId;

    // 1) 用户消息先入库
    let userMessageId: string | undefined;
    let assistantMessageId: string | undefined;
    if (this.chatStore && sessionId) {
      userMessageId = randomUUID();
      this.chatStore.appendMessage(sessionId, {
        id: userMessageId,
        role: 'user',
        content: message,
        timestamp: Date.now(),
        status: 'done',
      });
      // 首条用户消息时自动取标题
      this.chatStore.autoTitleIfEmpty(sessionId, message);

      // 预创建助手消息（streaming 状态），后续边推边更新
      assistantMessageId = randomUUID();
      this.chatStore.appendMessage(sessionId, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'streaming',
        runId,
      });
      this.streamingMessageIds.set(runId, assistantMessageId);
    }

    // 2) 构造上下文消息数组（让 OpenClaw 看到完整对话）
    let contextMessages: Array<{ role: string; content: string }>;
    if (this.chatStore && sessionId) {
      const history = this.chatStore.listMessages(sessionId);
      // 排除当前用户消息之后的内容（包括刚预创建的空 assistant 消息）
      const trimmed = history
        .filter(m => m.id !== assistantMessageId)
        .filter(m => m.role !== 'system')
        .filter(m => !(m.role === 'assistant' && (!m.content || m.status === 'streaming')));
      // 只取最近 N 条（避免超长，OpenClaw 内部还有 RAG 注入）
      const MAX_CONTEXT = 20;
      const sliced = trimmed.slice(-MAX_CONTEXT);
      contextMessages = sliced.map(m => ({ role: m.role, content: m.content }));
    } else {
      contextMessages = [{ role: 'user', content: message }];
    }

    const body = JSON.stringify({
      model: 'openclaw',  // Gateway 只接受 openclaw，底层模型由 openclaw.json 配置决定
      messages: contextMessages,
      stream: true,
      user: sessionKey,
    });

    const url = new URL(`${this.baseUrl}/v1/chat/completions`);
    const lib = url.protocol === 'https:' ? https : http;

    const abortController = new AbortController();
    this.abortControllers.set(runId, abortController);

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 120000,
    }, (res) => {
      if (res.statusCode !== 200) {
        let errBody = '';
        res.on('data', (c: Buffer) => errBody += c.toString());
        res.on('end', () => {
          this.abortControllers.delete(runId);
          const errMsg = `HTTP ${res.statusCode}: ${errBody.slice(0, 200)}`;
          this.persistMessageState(sessionId, assistantMessageId, runId, 'error', errMsg);
          this.emit('event', {
            type: 'event',
            event: 'chat',
            payload: { runId, sessionKey, state: 'error', errorMessage: errMsg },
          });
        });
        return;
      }

      let buffer = '';
      let accumulated = '';

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            this.abortControllers.delete(runId);
            this.persistMessageState(sessionId, assistantMessageId, runId, 'done', accumulated);
            this.emit('event', {
              type: 'event',
              event: 'chat',
              payload: { runId, sessionKey, state: 'final' },
            });
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              accumulated += delta;
              // 边推边写本地历史
              if (this.chatStore && sessionId && assistantMessageId) {
                this.chatStore.updateMessage(sessionId, assistantMessageId, {
                  content: accumulated,
                  status: 'streaming',
                });
              }
              this.emit('event', {
                type: 'event',
                event: 'chat',
                payload: { runId, sessionKey, state: 'delta', deltaText: delta },
              });
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      });

      res.on('end', () => {
        this.abortControllers.delete(runId);
        this.persistMessageState(sessionId, assistantMessageId, runId, 'done', accumulated);
        this.emit('event', {
          type: 'event',
          event: 'chat',
          payload: { runId, sessionKey, state: 'final' },
        });
      });

      res.on('error', (err: Error) => {
        this.abortControllers.delete(runId);
        this.persistMessageState(sessionId, assistantMessageId, runId, 'error', accumulated || err.message);
        this.emit('event', {
          type: 'event',
          event: 'chat',
          payload: { runId, sessionKey, state: 'error', errorMessage: err.message },
        });
      });
    });

    req.on('error', (err: Error) => {
      this.abortControllers.delete(runId);
      this.persistMessageState(sessionId, assistantMessageId, runId, 'error', err.message);
      this.emit('event', {
        type: 'event',
        event: 'chat',
        payload: { runId, sessionKey, state: 'error', errorMessage: err.message },
      });
    });

    req.on('timeout', () => {
      req.destroy();
      this.abortControllers.delete(runId);
      this.persistMessageState(sessionId, assistantMessageId, runId, 'error', '请求超时');
      this.emit('event', {
        type: 'event',
        event: 'chat',
        payload: { runId, sessionKey, state: 'error', errorMessage: '请求超时' },
      });
    });

    req.write(body);
    req.end();

    return { runId, status: 'streaming', sessionId: sessionId ?? undefined, userMessageId, assistantMessageId };
  }

  /** 流式结束/出错时统一更新本地消息状态 */
  private persistMessageState(
    sessionId: string | null | undefined,
    assistantMessageId: string | undefined,
    runId: string,
    status: 'done' | 'error' | 'aborted',
    finalContent?: string
  ): void {
    if (!this.chatStore || !sessionId || !assistantMessageId) return;
    this.chatStore.updateMessage(sessionId, assistantMessageId, {
      ...(finalContent !== undefined ? { content: finalContent } : {}),
      status,
      runId,
    });
    this.streamingMessageIds.delete(runId);
  }

  /** 获取对话历史（从本地 ChatStore 读取） */
  async chatHistory(sessionKey?: string, sessionId?: string): Promise<any> {
    const sid = sessionId || this.sessionId;
    if (this.chatStore && sid) {
      const messages = this.chatStore.listMessages(sid);
      return {
        sessionKey: sessionKey || this.sessionKey,
        sessionId: sid,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          status: m.status,
          runId: m.runId,
          id: m.id,
        })),
      };
    }
    return { sessionKey: sessionKey || this.sessionKey, messages: [] };
  }

  /** 中止对话 */
  async chatAbort(sessionKey?: string, runId?: string): Promise<any> {
    if (runId) {
      const controller = this.abortControllers.get(runId);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(runId);
      }
      // 同步更新本地消息为 aborted
      const assistantMessageId = this.streamingMessageIds.get(runId);
      if (assistantMessageId && this.chatStore && this.sessionId) {
        this.chatStore.updateMessage(this.sessionId, assistantMessageId, {
          status: 'aborted',
          runId,
        });
        this.streamingMessageIds.delete(runId);
      }
    }
    return { ok: true };
  }

  /** 设置当前 session key（OpenClaw 上下文键） */
  setSessionKey(key: string) {
    this.sessionKey = key;
  }

  getSessionKey(): string {
    return this.sessionKey;
  }

  /** 设置当前使用的模型 */
  setModel(modelId: string) {
    this.currentModel = modelId || 'openclaw';
  }

  getModel(): string {
    return this.currentModel;
  }

  /** 设置当前本地会话 id（历史归档键） */
  setSessionId(id: string | null) {
    this.sessionId = id;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  disconnect() {
    this.isConnected = false;
    // 中止所有进行中的请求
    for (const [, controller] of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.emit('disconnected');
  }

  get connected(): boolean {
    return this.isConnected;
  }

  /** 静态方法：生成密钥对（保留接口兼容性，HTTP 模式不需要） */
  static generateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
    const { generateKeyPairSync } = require('crypto');
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    };
  }
}
