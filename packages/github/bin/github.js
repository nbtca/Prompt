#!/usr/bin/env node
import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import ora from "ora";

const args = process.argv.slice(2);
const asJson = args.includes("--json");

const GITHUB_ORG = process.env.GITHUB_ORG || "nbtca";
const TOKEN = process.env.GITHUB_TOKEN || "";

async function main() {
  const spinner = ora("获取 GitHub 更新...").start();
  try {
    if (!TOKEN) throw new Error("请设置 GITHUB_TOKEN 环境变量");
    const oct = new Octokit({ auth: TOKEN });
    const { data: repos } = await oct.rest.repos.listForOrg({
      org: GITHUB_ORG,
      type: "public",
      per_page: 5,
      sort: "updated",
    });
    spinner.succeed("加载完成");

    if (asJson) console.log(JSON.stringify({ repos }, null, 2));
    else {
      console.log(chalk.bold("GitHub 最新更新:"));
      repos.forEach((r) => {
        console.log(chalk.yellow(r.name), chalk.dim(r.pushed_at));
        console.log(chalk.blue(r.html_url));
      });
    }
  } catch (err) {
    spinner.fail("加载失败");
    console.error(err);
    process.exit(1);
  }
}

main();
