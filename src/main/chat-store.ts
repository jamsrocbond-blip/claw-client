/**
 * 对话历史持久化（本地 JSON 文件）
 *
 * 存储结构：~/.clawcomply/chat-history.json
 * {
 *   sessions: [
 *     { id, title, createdAt, updatedAt, sessionKey, projectId? }
 *   ],
 *   messages: {
 *     [sessionId]: [
 *       { id, role, content, timestamp, status, citations?, runId? }
 *     ]
 *   }
 * }
 *
 * MVP 用 electron-store；数据量大后再迁移到 SQLite。
 */
import Store from 'electron-store';
import { randomUUID } from 'crypto';

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  status?: 'sending' | 'streaming' | 'done' | 'error' | 'aborted';
  citations?: any[];
  runId?: string;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sessionKey: string;       // OpenClaw sessionKey: lawyer:{id}:tenant:{tid} 等
  projectId?: string | null; // 关联项目（可选）
  messageCount: number;
}

interface ChatStoreData {
  sessions: ChatSessionMeta[];
  messages: Record<string, StoredMessage[]>;
}

const store = new Store<ChatStoreData>({
  name: 'clawcomply-chat',
  defaults: {
    sessions: [],
    messages: {},
  },
});

const MAX_MESSAGES_PER_SESSION = 1000;
const MAX_SESSIONS = 200;

export class ChatStore {
  /** 列出所有会话（按最近活跃排序） */
  listSessions(): ChatSessionMeta[] {
    const list = (store.get('sessions') as ChatSessionMeta[]) || [];
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** 创建新会话 */
  createSession(opts?: { title?: string; sessionKey?: string; projectId?: string | null }): ChatSessionMeta {
    const now = Date.now();
    const id = randomUUID();
    const meta: ChatSessionMeta = {
      id,
      title: opts?.title?.trim() || '新对话',
      createdAt: now,
      updatedAt: now,
      sessionKey: opts?.sessionKey || `local:${id}`,
      projectId: opts?.projectId ?? null,
      messageCount: 0,
    };
    const list = this.listSessions();
    list.unshift(meta);
    // 限制总会话数（按 updatedAt 保留最近 MAX_SESSIONS 个）
    if (list.length > MAX_SESSIONS) {
      const removed = list.splice(MAX_SESSIONS);
      const messages = (store.get('messages') as Record<string, StoredMessage[]>) || {};
      for (const r of removed) {
        delete messages[r.id];
      }
      store.set('messages', messages);
    }
    store.set('sessions', list);
    return meta;
  }

  /** 获取会话元数据 */
  getSession(sessionId: string): ChatSessionMeta | null {
    return this.listSessions().find(s => s.id === sessionId) ?? null;
  }

  /** 更新会话标题/项目绑定 */
  updateSession(sessionId: string, patch: Partial<Pick<ChatSessionMeta, 'title' | 'projectId'>>): ChatSessionMeta | null {
    const list = this.listSessions();
    const idx = list.findIndex(s => s.id === sessionId);
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
    store.set('sessions', list);
    return list[idx];
  }

  /** 删除会话（连同消息） */
  deleteSession(sessionId: string): boolean {
    const list = this.listSessions().filter(s => s.id !== sessionId);
    store.set('sessions', list);
    const messages = (store.get('messages') as Record<string, StoredMessage[]>) || {};
    if (messages[sessionId]) {
      delete messages[sessionId];
      store.set('messages', messages);
    }
    return true;
  }

  /** 读取某会话的全部消息 */
  listMessages(sessionId: string): StoredMessage[] {
    const messages = (store.get('messages') as Record<string, StoredMessage[]>) || {};
    return messages[sessionId] || [];
  }

  /** 追加单条消息（用户消息） */
  appendMessage(sessionId: string, msg: StoredMessage): void {
    const messages = (store.get('messages') as Record<string, StoredMessage[]>) || {};
    const list = messages[sessionId] || [];
    list.push(msg);
    // 单会话消息上限保护
    if (list.length > MAX_MESSAGES_PER_SESSION) {
      list.splice(0, list.length - MAX_MESSAGES_PER_SESSION);
    }
    messages[sessionId] = list;
    store.set('messages', messages);
    this.touchSession(sessionId);
  }

  /** 更新某条消息（用于流式：边推边写） */
  updateMessage(sessionId: string, messageId: string, patch: Partial<StoredMessage>): void {
    const messages = (store.get('messages') as Record<string, StoredMessage[]>) || {};
    const list = messages[sessionId];
    if (!list) return;
    const idx = list.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    list[idx] = { ...list[idx], ...patch };
    messages[sessionId] = list;
    store.set('messages', messages);
    this.touchSession(sessionId);
  }

  /** 用首条用户消息自动生成会话标题（截取前 30 字） */
  autoTitleIfEmpty(sessionId: string, firstUserContent: string): void {
    const session = this.getSession(sessionId);
    if (!session || (session.title && session.title !== '新对话')) return;
    const trimmed = firstUserContent.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (trimmed) {
      this.updateSession(sessionId, { title: trimmed });
    }
  }

  /** 触达会话（更新 updatedAt 和 messageCount） */
  private touchSession(sessionId: string): void {
    const list = this.listSessions();
    const idx = list.findIndex(s => s.id === sessionId);
    if (idx < 0) return;
    const messages = (store.get('messages') as Record<string, StoredMessage[]>) || {};
    list[idx] = {
      ...list[idx],
      updatedAt: Date.now(),
      messageCount: (messages[sessionId] || []).length,
    };
    store.set('sessions', list);
  }

  /** 清空所有历史（设置页用） */
  clearAll(): void {
    store.set('sessions', []);
    store.set('messages', {});
  }
}
