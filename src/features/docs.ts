/**
 * 知识库终端查看模块
 * 获取并渲染Markdown文档
 */

import axios from 'axios';
import { marked } from 'marked';
import markedTerminal from 'marked-terminal';
import chalk from 'chalk';
import open from 'open';
import inquirer from 'inquirer';
import { error, info, success, warning } from '../core/ui.js';

// 配置marked使用终端渲染器
marked.use(markedTerminal as any);

/**
 * 文档列表（硬编码常用文档）
 */
const DOCS_LIST = [
  { name: '返回主菜单', value: 'back' },
  { name: '在浏览器中打开知识库', value: 'browser' }
];

/**
 * 获取文档列表
 */
export async function fetchDocs(): Promise<string[]> {
  // 简化版：返回预设的文档列表
  // 实际项目中可以从API动态获取
  return [
    '首页',
    '技术文档',
    '教程资源'
  ];
}

/**
 * 查看指定文档
 */
export async function viewDoc(path: string): Promise<void> {
  try {
    info(`正在加载文档: ${path}`);

    const response = await axios.get(`https://docs.nbtca.space/${path}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'NBTCA-CLI/2.3.1'
      }
    });

    console.log('\r' + ' '.repeat(50) + '\r'); // 清除加载提示

    // 渲染Markdown
    const rendered = marked(response.data);
    console.log(rendered);
    console.log();

    success('文档加载完成');
  } catch (err) {
    error('无法加载文档');
    warning('建议在浏览器中查看');

    const { openBrowser } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'openBrowser',
        message: '是否在浏览器中打开？',
        default: true
      }
    ]);

    if (openBrowser) {
      await openDocsInBrowser();
    }
  }
}

/**
 * 在浏览器中打开知识库
 */
export async function openDocsInBrowser(): Promise<void> {
  try {
    info('正在打开浏览器...');
    await open('https://docs.nbtca.space');
    success('已在浏览器中打开知识库');
  } catch (err) {
    error('无法打开浏览器');
    console.log(chalk.gray('  请手动访问: https://docs.nbtca.space'));
  }
  console.log();
}

/**
 * 显示知识库菜单
 */
export async function showDocsMenu(): Promise<void> {
  while (true) {
    console.log();
    console.log(chalk.cyan.bold('  知识库'));
    console.log();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '选择操作:',
        choices: DOCS_LIST,
        pageSize: 10
      }
    ]);

    if (action === 'back') {
      break;
    } else if (action === 'browser') {
      await openDocsInBrowser();
      break;
    }
  }
}
