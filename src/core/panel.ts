import boxen, { type Options as BoxenOptions } from 'boxen';

export interface PanelOptions {
  title?: string;
  titleAlign?: BoxenOptions['titleAlignment'];
  padding?: BoxenOptions['padding'];
  borderColor?: string;
  dim?: boolean;
  width?: number;
}

export function panel(content: string, options: PanelOptions = {}): string {
  return boxen(content, {
    title: options.title,
    titleAlignment: options.titleAlign ?? 'left',
    borderStyle: 'round',
    padding: options.padding ?? { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: options.dim ? 'gray' : (options.borderColor ?? 'cyan'),
    width: options.width,
  });
}

export function printPanel(content: string, options: PanelOptions = {}): void {
  console.log(panel(content, options));
}
