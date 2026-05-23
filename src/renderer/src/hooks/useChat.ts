import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage, ChatEventPayload, HistoryMessage, ChatSessionMeta } from '../../../shared/types';
import { matchCitations } from '../lib/citation-matcher';

interface UseChatOptions {
  /** 传入 projectId 时进入"项目模式"：自动查找/创建 project:{id} 会话，不走全局初始化 */
  projectId?: string | null;
}

interface UseChatReturn {
  messages: ChatMessage[];
  sessions: ChatSessionMeta[];
  currentSessionId: string | null;
  isConnected: boolean;
  isStreaming: boolean;
  sendMessage: (content: string, context?: string) => Promise<void>;
  abortChat: () => Promise<void>;
  loadHistory: (sessionId?: string) => Promise<void>;
  clearMessages: () => void;
  // 会话管理
  refreshSessions: () => Promise<void>;
  createSession: (title?: string, sessionKey?: string, projectId?: string | null) => Promise<ChatSessionMeta | null>;
  switchSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
}

export function useChat(options?: UseChatOptions): UseChatReturn {
  const projectId = options?.projectId ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lawyerId, setLawyerId] = useState<string | null>(null);

  const streamingMsgIdRef = useRef<string | null>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const sessionKeyRef = useRef<string>('main');
  const currentSessionIdRef = useRef<string | null>(null);

  // 获取当前律师 ID（用于构建隔离的 sessionKey）
  useEffect(() => {
    window.electronAPI.getAuthStatus().then(auth => {
      if (auth.user?.id !== undefined) {
        setLawyerId(String(auth.user.id));
      }
    }).catch(() => {});
  }, []);

  // 同步 ref（用于事件回调）
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // ========== 会话列表管理 ==========
  const refreshSessions = useCallback(async () => {
    const res = await window.electronAPI.chatListSessions();
    if (res.success && res.data) {
      setSessions(res.data);
    }
  }, []);

  const ensureCurrentSession = useCallback(async (): Promise<string> => {
    if (currentSessionIdRef.current) return currentSessionIdRef.current;
    // 没有当前会话，从列表里取第一个，或者新建一个
    const res = await window.electronAPI.chatListSessions();
    const list = res.data || [];
    if (list.length > 0) {
      const sid = list[0].id;
      sessionKeyRef.current = list[0].sessionKey;
      setCurrentSessionId(sid);
      currentSessionIdRef.current = sid;
      await window.electronAPI.chatSwitchSession(sid);
      return sid;
    }
    // 新建
    const created = await window.electronAPI.chatCreateSession({ title: '新对话' });
    if (created.success && created.data) {
      const sid = created.data.id;
      sessionKeyRef.current = created.data.sessionKey;
      setCurrentSessionId(sid);
      currentSessionIdRef.current = sid;
      setSessions(prev => [created.data!, ...prev]);
      return sid;
    }
    throw new Error('无法创建会话');
  }, []);

  const createSession = useCallback(async (title?: string, sessionKey?: string, projectId?: string | null) => {
    const res = await window.electronAPI.chatCreateSession({ title: title || '新对话', sessionKey, projectId });
    if (res.success && res.data) {
      sessionKeyRef.current = res.data.sessionKey;
      setCurrentSessionId(res.data.id);
      currentSessionIdRef.current = res.data.id;
      setMessages([]);
      await refreshSessions();
      return res.data;
    }
    return null;
  }, [refreshSessions]);

  const switchSession = useCallback(async (sessionId: string) => {
    const res = await window.electronAPI.chatSwitchSession(sessionId);
    if (!res.success || !res.data) return;
    sessionKeyRef.current = res.data.sessionKey;
    setCurrentSessionId(sessionId);
    currentSessionIdRef.current = sessionId;
    // 加载历史
    const hist = await window.electronAPI.chatHistory(res.data.sessionKey, sessionId);
    if (hist.success && hist.data?.messages) {
      const msgs: ChatMessage[] = hist.data.messages.map((m: HistoryMessage) => ({
        id: m.id || `hist-${m.timestamp}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
        status: (m.status as ChatMessage['status']) || 'done',
        runId: m.runId,
      }));
      setMessages(msgs);
    } else {
      setMessages([]);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    await window.electronAPI.chatDeleteSession(sessionId);
    await refreshSessions();
    // 如果删除的是当前会话，切到第一个或清空
    if (currentSessionIdRef.current === sessionId) {
      const res = await window.electronAPI.chatListSessions();
      const list = res.data || [];
      if (list.length > 0) {
        await switchSession(list[0].id);
      } else {
        setCurrentSessionId(null);
        currentSessionIdRef.current = null;
        setMessages([]);
      }
    }
  }, [refreshSessions, switchSession]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    await window.electronAPI.chatUpdateSession(sessionId, { title });
    await refreshSessions();
  }, [refreshSessions]);

  // ========== 加载历史 ==========
  const loadHistory = useCallback(async (sessionId?: string) => {
    const sid = sessionId || currentSessionIdRef.current;
    if (!sid) return;
    const hist = await window.electronAPI.chatHistory(sessionKeyRef.current, sid);
    if (hist.success && hist.data?.messages) {
      const msgs: ChatMessage[] = hist.data.messages.map((m: HistoryMessage) => ({
        id: m.id || `hist-${m.timestamp}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
        status: (m.status as ChatMessage['status']) || 'done',
        runId: m.runId,
      }));
      setMessages(msgs);
    }
  }, []);

  // ========== 启动初始化 ==========
  useEffect(() => {
    (async () => {
      try {
        await refreshSessions();
        const status = await window.electronAPI.wsGetStatus();
        setIsConnected(!!status.connected);

        const listRes = await window.electronAPI.chatListSessions();
        const list = listRes.data || [];

        if (projectId) {
          // 项目模式：sessionKey = lawyer:{id}:project:{projectId}（律师+项目双重隔离）
          const lid = lawyerId || '0';
          const targetKey = `lawyer:${lid}:project:${projectId}`;
          const existing = list.find(s => s.sessionKey === targetKey || s.projectId === projectId);
          if (existing) {
            await switchSession(existing.id);
          } else {
            const created = await window.electronAPI.chatCreateSession({
              title: `项目对话 · ${projectId}`,
              sessionKey: targetKey,
              projectId,
            });
            if (created.success && created.data) {
              sessionKeyRef.current = created.data.sessionKey;
              setCurrentSessionId(created.data.id);
              currentSessionIdRef.current = created.data.id;
              setMessages([]);
              await refreshSessions();
            }
          }
        } else {
          // 全局模式：sessionKey = lawyer:{id}:global（律师隔离）
          const lid = lawyerId || '0';
          const globalKey = `lawyer:${lid}:global`;
          const existing = list.find(s => s.sessionKey === globalKey && !s.projectId);
          if (existing) {
            await switchSession(existing.id);
          } else if (list.length > 0) {
            // 兼容旧会话（没有律师前缀的）
            const oldGlobal = list.find(s => !s.projectId);
            if (oldGlobal) await switchSession(oldGlobal.id);
          }
        }
      } catch (err) {
        console.warn('[Chat] init failed:', err);
      }
    })();

    const unsubStatus = window.electronAPI.onWsStatus((status) => {
      setIsConnected(status.connected);
    });
    const unsubError = window.electronAPI.onWsError(() => {
      setIsConnected(false);
    });

    return () => {
      unsubStatus();
      unsubError();
    };
  // projectId 或 lawyerId 变化时重新初始化（切换项目或用户）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, lawyerId]);

  // ========== 处理流式事件 ==========
  const handleChatEvent = useCallback((payload: ChatEventPayload) => {
    const { state, runId, deltaText, errorMessage, replace } = payload;

    switch (state) {
      case 'delta': {
        const text = deltaText || '';
        if (!text) return;
        if (streamingMsgIdRef.current) {
          setMessages(prev => prev.map(m => {
            if (m.id !== streamingMsgIdRef.current) return m;
            return {
              ...m,
              content: replace ? text : m.content + text,
              status: 'streaming',
            };
          }));
        }
        // 注意：流式消息的 id 在 sendMessage 中提前创建，这里只追加 delta
        break;
      }

      case 'final': {
        if (streamingMsgIdRef.current) {
          setMessages(prev => prev.map(m => {
            if (m.id !== streamingMsgIdRef.current) return m;
            // 消息完成时自动匹配法规引用
            const citations = matchCitations(m.content);
            return { ...m, status: 'done', runId, citations: citations.length > 0 ? citations : undefined };
          }));
        }
        streamingMsgIdRef.current = null;
        currentRunIdRef.current = null;
        setIsStreaming(false);
        // 刷新会话列表（更新 messageCount/updatedAt 排序）
        refreshSessions();
        break;
      }

      case 'aborted': {
        if (streamingMsgIdRef.current) {
          setMessages(prev => prev.map(m => {
            if (m.id !== streamingMsgIdRef.current) return m;
            return { ...m, status: 'aborted', runId };
          }));
        }
        streamingMsgIdRef.current = null;
        currentRunIdRef.current = null;
        setIsStreaming(false);
        break;
      }

      case 'error': {
        const errText = errorMessage || '对话出错';
        if (streamingMsgIdRef.current) {
          setMessages(prev => prev.map(m => {
            if (m.id !== streamingMsgIdRef.current) return m;
            return { ...m, status: 'error', content: m.content || errText, runId };
          }));
        } else {
          const id = `err-${Date.now()}`;
          setMessages(prev => [...prev, {
            id, role: 'assistant', content: `⚠️ ${errText}`,
            timestamp: Date.now(), status: 'error', runId,
          }]);
        }
        streamingMsgIdRef.current = null;
        currentRunIdRef.current = null;
        setIsStreaming(false);
        break;
      }

      default:
        console.warn('[Chat] Unknown event state:', state, payload);
    }
  }, [refreshSessions]);

  useEffect(() => {
    const unsub = window.electronAPI.onChatEvent((payload: ChatEventPayload) => {
      handleChatEvent(payload);
    });
    return () => unsub();
  }, [handleChatEvent]);

  // ========== 发送消息 ==========
  const sendMessage = useCallback(async (content: string, context?: string) => {
    if (!content.trim() || isStreaming) return;

    // 确保有当前会话
    let sid: string;
    try {
      sid = await ensureCurrentSession();
    } catch (err: any) {
      console.error('[Chat] ensureSession failed:', err);
      return;
    }

    if (!isConnected) {
      // 没连上时先尝试连一下
      try {
        await window.electronAPI.wsConnect();
      } catch {}
    }

    // 1) UI 立即显示用户消息
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      status: 'done',
    };
    setMessages(prev => [...prev, userMsg]);

    // 2) UI 立即创建流式占位
    const placeholderId = `asst-${Date.now()}`;
    streamingMsgIdRef.current = placeholderId;
    setIsStreaming(true);
    setMessages(prev => [...prev, {
      id: placeholderId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    }]);

    try {
      const result = await window.electronAPI.chatSend(content.trim(), {
        sessionKey: sessionKeyRef.current,
        sessionId: sid,
        thinking: context,  // 项目上下文作为系统提示注入
      });
      if (result.success && result.data) {
        currentRunIdRef.current = result.data.runId;
        // 更新 UI 占位消息的 id 为后端返回的 assistantMessageId（保证持久化一致）
        // 这里保持 UI id 不变，事件回调通过 streamingMsgIdRef 找到这条消息
      } else {
        // 失败，移除占位
        setMessages(prev => prev.filter(m => m.id !== placeholderId));
        streamingMsgIdRef.current = null;
        setIsStreaming(false);
        const errMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ 发送失败: ${result.error || '未知错误'}`,
          timestamp: Date.now(),
          status: 'error',
        };
        setMessages(prev => [...prev, errMsg]);
      }
    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== placeholderId));
      streamingMsgIdRef.current = null;
      setIsStreaming(false);
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ 发送异常: ${err.message}`,
        timestamp: Date.now(),
        status: 'error',
      };
      setMessages(prev => [...prev, errMsg]);
    }
  }, [isStreaming, isConnected, ensureCurrentSession]);

  const abortChat = useCallback(async () => {
    if (!currentRunIdRef.current) return;
    try {
      await window.electronAPI.chatAbort(sessionKeyRef.current, currentRunIdRef.current);
    } catch (err) {
      console.error('[Chat] Abort failed:', err);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    streamingMsgIdRef.current = null;
    currentRunIdRef.current = null;
    setIsStreaming(false);
  }, []);

  return {
    messages,
    sessions,
    currentSessionId,
    isConnected,
    isStreaming,
    sendMessage,
    abortChat,
    loadHistory,
    clearMessages,
    refreshSessions,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
  };
}
