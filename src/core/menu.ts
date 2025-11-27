/**
 * 极简菜单系统
 * 6大核心功能菜单
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { showCalendar } from '../features/calendar.js';
import { openRepairService } from '../features/repair.js';
import { showDocsMenu } from '../features/docs.js';
import { openHomepage, openGithub } from '../features/website.js';
import { printDivider, printNewLine } from './ui.js';
import { APP_INFO, URLS } from '../config/data.js';

/**
 * 主菜单选项
 */
const MAIN_MENU = [
  {
    name: '[*] Recent Events    ' + chalk.gray('查看最近30天的社团活动'),
    value: 'events',
    short: 'Recent Events'
  },
  {
    name: '[*] Repair Service   ' + chalk.gray('电脑维修、软件安装'),
    value: 'repair',
    short: 'Repair Service'
  },
  {
    name: '[*] Knowledge Base   ' + chalk.gray('技术文档、教程资源'),
    value: 'docs',
    short: 'Knowledge Base'
  },
  {
    name: '[*] Official Website ' + chalk.gray('访问NBTCA主页'),
    value: 'website',
    short: 'Official Website'
  },
  {
    name: '[*] GitHub           ' + chalk.gray('开源项目与代码'),
    value: 'github',
    short: 'GitHub'
  },
  {
    name: '[?] About            ' + chalk.gray('项目信息与帮助'),
    value: 'about',
    short: 'About'
  },
  new inquirer.Separator(' '),
  {
    name: chalk.dim('[x] Exit'),
    value: 'exit',
    short: 'Exit'
  }
];

/**
 * 显示主菜单
 */
export async function showMainMenu(): Promise<void> {
  while (true) {
    try {
      // Show keybinding hints
      console.log(chalk.dim('  Navigation: j/k or ↑/↓ | Jump: g/G | Quit: q or Ctrl+C'));
      console.log();

      const { action } = await inquirer.prompt<{ action: string }>([
        {
          type: 'list',
          name: 'action',
          message: '选择功能',
          choices: MAIN_MENU,
          pageSize: 15,
          loop: false
        } as any
      ]);

      // 处理用户选择
      if (action === 'exit') {
        console.log();
        console.log(chalk.dim('再见！'));
        process.exit(0);
      }

      await handleAction(action);

      // 操作完成后显示分隔线
      printNewLine();
      printDivider();
      printNewLine();
    } catch (err: any) {
      // 处理Ctrl+C退出
      if (err.message?.includes('User force closed')) {
        console.log();
        console.log(chalk.dim('再见！'));
        process.exit(0);
      }
      throw err;
    }
  }
}

/**
 * 处理用户操作
 */
async function handleAction(action: string): Promise<void> {
  switch (action) {
    case 'events':
      await showCalendar();
      break;

    case 'repair':
      await openRepairService();
      break;

    case 'docs':
      await showDocsMenu();
      break;

    case 'website':
      await openHomepage();
      break;

    case 'github':
      await openGithub();
      break;

    case 'about':
      showAbout();
      break;

    default:
      console.log(chalk.gray('未知操作'));
  }
}

/**
 * 显示关于信息
 */
function showAbout(): void {
  console.log();
  console.log(chalk.bold('>> About NBTCA'));
  console.log();
  console.log(chalk.dim('Project     ') + APP_INFO.name);
  console.log(chalk.dim('Version     ') + `v${APP_INFO.version}`);
  console.log(chalk.dim('Description ') + APP_INFO.fullDescription);
  console.log();
  console.log(chalk.dim('GitHub      ') + chalk.cyan(APP_INFO.repository));
  console.log(chalk.dim('Website     ') + chalk.cyan(URLS.homepage));
  console.log(chalk.dim('Email       ') + chalk.cyan(URLS.email));
  console.log();
  console.log(chalk.dim('Features:'));
  console.log('  - View recent association events');
  console.log('  - Online repair service');
  console.log('  - Technical knowledge base access');
  console.log('  - Quick access to website and GitHub');
  console.log();
  console.log(chalk.dim('License     ') + 'MIT License');
  console.log(chalk.dim('Author      ') + 'm1ngsama');
  console.log();
}
