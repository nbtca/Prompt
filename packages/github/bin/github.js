#!/usr/bin/env node
import { getOrgRepos, getOrgEvents } from "../lib/api.js";
import {
  renderReposTable,
  renderEventsList,
  renderStarsChart,
} from "../lib/render.js";

(async () => {
  console.log("\n=== 🚀 nbtca GitHub 组织动态 ===\n");

  // 获取数据
  const repos = await getOrgRepos("nbtca");
  const events = await getOrgEvents("nbtca");

  // 渲染表格
  console.log("📦 仓库概览：");
  renderReposTable(repos);

  console.log("\n⭐ Star 数分布：");
  renderStarsChart(repos);

  console.log("\n📰 最新事件：");
  renderEventsList(events.slice(0, 5));
})();
