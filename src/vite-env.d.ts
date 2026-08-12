/// <reference types="vite/client" />

declare global {
  interface Window {
    __MAIPROP_RUNTIME_CONFIG__?: Record<string, string>;
    gtag?: (...args: unknown[]) => void;
  }
}

export {};
