export {};

declare global {
  interface Window {
    ipcRenderer?: {
      on: (channel: string, listener: (...args: any[]) => void) => void;
      off: (channel: string, listener: (...args: any[]) => void) => void;
      send: (channel: string, ...args: any[]) => void;
      invoke: <T = unknown>(channel: string, ...args: any[]) => Promise<T>;
    };
  }
}

