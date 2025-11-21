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
    name: chalk.cyan('› ') + chalk.white('近期活动    ') + chalk.gray('查看最近30天的社团活动'),
    value: 'events',
    short: '近期活动'
  },
  {
    name: chalk.cyan('› ') + chalk.white('维修服务    ') + chalk.gray('电脑维修、软件安装'),
    value: 'repair',
    short: '维修服务'
  },
  {
    name: chalk.cyan('› ') + chalk.white('知识库      ') + chalk.gray('技术文档、教程资源'),
    value: 'docs',
    short: '知识库'
  },
  {
    name: chalk.cyan('› ') + chalk.white('官方网站    ') + chalk.gray('访问NBTCA主页'),
    value: 'website',
    short: '官方网站'
  },
  {
    name: chalk.cyan('› ') + chalk.white('GitHub      ') + chalk.gray('开源项目与代码'),
    value: 'github',
    short: 'GitHub'
  },
  {
    name: chalk.cyan('› ') + chalk.white('关于        ') + chalk.gray('项目信息与帮助'),
    value: 'about',
    short: '关于'
  },
  {
    name: chalk.gray('─'.repeat(50)),
    value: 'separator',
    disabled: true
  },
  {
    name: chalk.red('› ') + chalk.white('退出'),
    value: 'exit',
    short: '退出'
  }
];

/**
 * 显示主菜单
 */
export async function showMainMenu(): Promise<void> {
  while (true) {
    try {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: chalk.bold('请选择功能:'),
          choices: MAIN_MENU,
          pageSize: 15,
          loop: false
        }
      ]);

      // 处理用户选择
      if (action === 'exit') {
        console.log();
        console.log(chalk.cyan('再见！感谢使用NBTCA工具'));
        console.log();
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
        console.log(chalk.cyan('再见！'));
        console.log();
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
  console.log(chalk.cyan.bold('  关于 NBTCA'));
  console.log();
  printDivider();
  console.log();
  console.log(chalk.white('  项目名称: ') + chalk.cyan(APP_INFO.name));
  console.log(chalk.white('  版本:     ') + chalk.cyan(`v${APP_INFO.version}`));
  console.log(chalk.white('  描述:     ') + chalk.gray(APP_INFO.fullDescription));
  console.log();
  console.log(chalk.white('  GitHub:   ') + chalk.cyan(APP_INFO.repository));
  console.log(chalk.white('  官网:     ') + chalk.cyan(URLS.homepage));
  console.log(chalk.white('  邮箱:     ') + chalk.cyan(URLS.email));
  console.log();
  console.log(chalk.gray('  功能特性:'));
  console.log(chalk.gray('  • 查看社团近期活动'));
  console.log(chalk.gray('  • 在线维修服务'));
  console.log(chalk.gray('  • 技术知识库访问'));
  console.log(chalk.gray('  • 快速访问官网和GitHub'));
  console.log();
  console.log(chalk.white('  开源协议: ') + chalk.cyan('MIT License'));
  console.log(chalk.white('  作者:     ') + chalk.cyan('m1ngsama <contact@m1ng.space>'));
  console.log();
}
