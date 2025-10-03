declare module 'asciinema-player' {
  export interface AsciinemaPlayerOptions {
    cols?: number;
    rows?: number;
    autoPlay?: boolean;
    preload?: boolean;
    loop?: boolean | number;
    startAt?: number | string;
    speed?: number;
    idleTimeLimit?: number;
    theme?: string;
    poster?: string;
    fit?: 'width' | 'height' | 'both' | false;
    terminalFontSize?: string;
    terminalFontFamily?: string;
    terminalLineHeight?: number;
  }

  export interface AsciinemaPlayerInstance {
    dispose(): void;
    play(): void;
    pause(): void;
    seek(time: number): void;
    getCurrentTime(): number;
    getDuration(): number;
  }

  export function create(
    source: string | object,
    element: HTMLElement,
    options?: AsciinemaPlayerOptions
  ): AsciinemaPlayerInstance;

  export default {
    create
  };
}