/**
 * Electron 类型桩声明
 * 开发时使用，生产构建用真正的electron包
 */
declare module 'electron' {
  export class BrowserWindow {
    constructor(options?: any);
    loadURL(url: string): Promise<void>;
    loadFile(path: string): Promise<void>;
    webContents: {
      send(channel: string, ...args: any[]): void;
      openDevTools(): void;
    };
    on(event: string, listener: (...args: any[]) => void): this;
    static getAllWindows(): BrowserWindow[];
  }

  export const app: {
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    quit(): void;
    getPath(name: string): string;
  };

  export const ipcMain: {
    handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
    on(channel: string, listener: (event: any, ...args: any[]) => void): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    send(channel: string, ...args: any[]): void;
    on(channel: string, listener: (event: any, ...args: any[]) => void): () => void;
    removeListener(channel: string, listener: (...args: any[]) => void): void;
  };

  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: any): void;
  };

  export class Menu {
    static buildFromTemplate(template: any[]): Menu;
    static setApplicationMenu(menu: Menu | null): void;
  }
}

declare module 'electron-store' {
  class Store<T = any> {
    constructor(options?: { name?: string; defaults?: T; encryptionKey?: string });
    get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K];
    set<K extends keyof T>(key: K, value: T[K]): void;
    clear(): void;
  }
  export = Store;
}
