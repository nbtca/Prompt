import { cpSync, mkdirSync } from 'fs';

mkdirSync('dist/logo', { recursive: true });
mkdirSync('dist/i18n/locales', { recursive: true });

cpSync('src/logo', 'dist/logo', { recursive: true });
cpSync('src/i18n/locales', 'dist/i18n/locales', { recursive: true });
