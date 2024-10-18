declare module 'isomorphic-lolcat' {
  export interface LolcatColor {
    red: number;
    green: number;
    blue: number;
  }

  export interface LolcatOptions {
    seed?: number;
    spread?: number;
    freq?: number;
    animate?: boolean;
    duration?: number;
  }

  export const options: LolcatOptions;

  export function format(
    formatter: (char: string, color: LolcatColor) => string,
    text: string,
    callback: () => void
  ): string[];

  export default {
    options,
    format
  };
}
