/**
 * Theme configuration for NBTCA Welcome.
 */

/**
 * Color palette for a theme.
 */
interface ThemeColors {
  primary: [number, number, number];
  secondary: [number, number, number];
  accent: [number, number, number];
  warning: [number, number, number];
  error: [number, number, number];
  success: [number, number, number];
  info: [number, number, number];
  text: [number, number, number];
  muted: [number, number, number];
}

/**
 * Symbols used in a theme.
 */
interface ThemeSymbols {
  logo: string;
  loading: string[];
  success: string;
  warning: string;
  error: string;
  info: string;
}

/**
 * Complete theme configuration.
 */
export interface Theme {
  name: string;
  colors: ThemeColors;
  symbols: ThemeSymbols;
}

/**
 * Collection of available themes.
 */
interface Themes {
  default: Theme;
  dark: Theme;
  light: Theme;
  nbtca: Theme;
  [key: string]: Theme;
}

export const themes: Themes = {
  default: {
    name: '默认主题',
    colors: {
      primary: [23, 147, 209],    // archBlue
      secondary: [34, 197, 94],    // nbtcaGreen
      accent: [147, 51, 234],      // nbtcaPurple
      warning: [249, 115, 22],     // nbtcaOrange
      error: [239, 68, 68],        // red
      success: [34, 197, 94],      // green
      info: [59, 130, 246],        // blue
      text: [255, 255, 255],       // white
      muted: [156, 163, 175]       // gray
    },
    symbols: {
      logo: '🎓',
      loading: ['⚡', '🚀', '💻', '🔧', '⚙️', '🎯', '🌟', '💡'],
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    }
  },

  dark: {
    name: '深色主题',
    colors: {
      primary: [59, 130, 246],     // blue
      secondary: [16, 185, 129],   // emerald
      accent: [139, 92, 246],      // violet
      warning: [245, 158, 11],     // amber
      error: [239, 68, 68],        // red
      success: [34, 197, 94],      // green
      info: [6, 182, 212],         // cyan
      text: [255, 255, 255],       // white
      muted: [107, 114, 128]       // gray
    },
    symbols: {
      logo: '🌙',
      loading: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    }
  },

  light: {
    name: '浅色主题',
    colors: {
      primary: [37, 99, 235],      // blue
      secondary: [5, 150, 105],    // emerald
      accent: [124, 58, 237],      // violet
      warning: [217, 119, 6],      // orange
      error: [220, 38, 38],        // red
      success: [22, 163, 74],      // green
      info: [8, 145, 178],         // cyan
      text: [17, 24, 39],          // gray-900
      muted: [107, 114, 128]       // gray
    },
    symbols: {
      logo: '☀️',
      loading: ['🌞', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '🌈'],
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    }
  },

  nbtca: {
    name: 'NBTCA主题',
    colors: {
      primary: [23, 147, 209],     // archBlue
      secondary: [34, 197, 94],    // nbtcaGreen
      accent: [147, 51, 234],      // nbtcaPurple
      warning: [249, 115, 22],     // nbtcaOrange
      error: [236, 72, 153],       // nbtcaPink
      success: [34, 197, 94],      // green
      info: [59, 130, 246],        // blue
      text: [255, 255, 255],       // white
      muted: [156, 163, 175]       // gray
    },
    symbols: {
      logo: '🎓',
      loading: ['⚡', '🚀', '💻', '🔧', '⚙️', '🎯', '🌟', '💡'],
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    }
  }
};

/**
 * Get current theme configuration.
 * @param themeName - Theme name.
 * @returns Theme configuration.
 */
export function getTheme(themeName: string = 'default'): Theme {
  return themes[themeName] || themes.default;
}

/**
 * Get color from theme.
 * @param themeName - Theme name.
 * @param colorName - Color name.
 * @returns RGB color array.
 */
export function getThemeColor(themeName: string, colorName: keyof ThemeColors): [number, number, number] {
  const theme = getTheme(themeName);
  return theme.colors[colorName] || theme.colors.primary;
}

/**
 * Get symbol from theme.
 * @param themeName - Theme name.
 * @param symbolName - Symbol name.
 * @returns Symbol or symbol array.
 */
export function getThemeSymbol(themeName: string, symbolName: keyof ThemeSymbols): string | string[] {
  const theme = getTheme(themeName);
  return theme.symbols[symbolName] || theme.symbols.logo;
}

/**
 * Theme list item for menu display.
 */
export interface ThemeListItem {
  name: string;
  value: string;
  description: string;
}

/**
 * List available themes.
 * @returns Array of theme names and descriptions.
 */
export function listThemes(): ThemeListItem[] {
  return Object.entries(themes).map(([key, theme]) => ({
    name: theme.name,
    value: key,
    description: `使用 ${theme.name}`
  }));
}
