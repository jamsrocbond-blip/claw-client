/**
 * 认证信息存储（使用 electron-store）
 * HTTP 模式：只需要 gateway token，不需要 device token 和密钥对
 *
 * 服务器地址通过环境变量配置：
 *   CLAW_API_URL      — 后端 API 地址
 *   CLAW_GATEWAY_URL  — OpenClaw Gateway WebSocket 地址
 *   CLAW_GATEWAY_TOKEN — Gateway Token
 *
 * 开发环境：.env.development（内网 192.168.3.3）
 * 生产环境：.env.production（外网 124.128.153.62）
 */
import Store from 'electron-store';

// 从环境变量读取，构建时注入；运行时未设置则用生产外网地址作为最终兜底
const ENV_API_URL       = process.env.CLAW_API_URL       || 'http://124.128.153.62:8989';
const ENV_GATEWAY_URL   = process.env.CLAW_GATEWAY_URL   || 'ws://124.128.153.62:18790';
const ENV_GATEWAY_TOKEN = process.env.CLAW_GATEWAY_TOKEN || 'ClawGateway2026';

interface AuthData {
  token: string | null;
  user: any | null;
  apiUrl: string | null;
  gatewayToken: string | null;
  wsMode: 'cloud' | 'private';
  cloudWsUrl: string;
  privateWsUrl: string;
}

const store = new Store<AuthData>({
  name: 'clawcomply-auth',
  defaults: {
    token: null,
    user: null,
    apiUrl: ENV_API_URL,
    gatewayToken: ENV_GATEWAY_TOKEN,
    wsMode: 'cloud',
    cloudWsUrl: ENV_GATEWAY_URL,
    privateWsUrl: ENV_GATEWAY_URL,   // 私有化默认也用环境变量，用户可在设置页覆盖
  },
  encryptionKey: 'clawcomply-2026-mvp',
});

export class AuthStore {
  async getToken(): Promise<string | null> {
    return store.get('token', null);
  }

  async setToken(token: string): Promise<void> {
    store.set('token', token);
  }

  async getUser(): Promise<any | null> {
    return store.get('user', null);
  }

  async setUser(user: any): Promise<void> {
    store.set('user', user);
  }

  async getApiUrl(): Promise<string | null> {
    return store.get('apiUrl', null);
  }

  async setApiUrl(url: string): Promise<void> {
    store.set('apiUrl', url);
  }

  async getGatewayToken(): Promise<string | null> {
    return store.get('gatewayToken') as string | null;
  }

  async setGatewayToken(token: string | null): Promise<void> {
    store.set('gatewayToken', token);
  }

  // 兼容旧接口（不再使用，返回 null）
  async getGatewayDeviceToken(): Promise<string | null> { return null; }
  async setGatewayDeviceToken(_token: string | null): Promise<void> {}
  async getGatewayDeviceId(): Promise<string | null> { return null; }
  async setGatewayDeviceId(_id: string | null): Promise<void> {}
  async getGatewayPrivateKeyPem(): Promise<string | null> { return null; }
  async setGatewayPrivateKeyPem(_pem: string | null): Promise<void> {}
  async getGatewayPublicKeyPem(): Promise<string | null> { return null; }
  async setGatewayPublicKeyPem(_pem: string | null): Promise<void> {}

  async getWsMode(): Promise<'cloud' | 'private'> {
    return store.get('wsMode', 'cloud');
  }

  async setWsMode(mode: 'cloud' | 'private'): Promise<void> {
    store.set('wsMode', mode);
  }

  async getCloudWsUrl(): Promise<string> {
    return store.get('cloudWsUrl', ENV_GATEWAY_URL);
  }

  async setCloudWsUrl(url: string): Promise<void> {
    store.set('cloudWsUrl', url);
  }

  async getPrivateWsUrl(): Promise<string> {
    return store.get('privateWsUrl', ENV_GATEWAY_URL);
  }

  async setPrivateWsUrl(url: string): Promise<void> {
    store.set('privateWsUrl', url);
  }

  async getSelectedModel(): Promise<string> {
    return store.get('selectedModel', 'deepseek-v4-pro') as string;
  }

  async setSelectedModel(modelId: string): Promise<void> {
    store.set('selectedModel', modelId);
  }

  async clear(): Promise<void> {
    store.clear();
  }
}
