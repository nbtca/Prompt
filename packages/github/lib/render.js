import chalk from "chalk";
import Table from "cli-table3";
import asciichart from "asciichart";

export function renderReposTable(repos) {
  const table = new Table({
    head: [
      chalk.blue("仓库"),
      chalk.yellow("⭐ Stars"),
      chalk.green("🍴 Forks"),
    ],
    colWidths: [25, 10, 10],
  });

  repos.forEach((r) => {
    table.push([r.name, r.stargazers_count, r.forks_count]);
  });

  console.log(table.toString());
}

export function renderStarsChart(repos) {
  const stars = repos.map((r) => r.stargazers_count);
  console.log(asciichart.plot(stars, { height: 10 }));
}

export function renderEventsList(events) {
  events.forEach((e) => {
    console.log(
      chalk.green(`[${e.type}]`),
      chalk.cyan(e.actor?.login || "someone"),
      chalk.yellow(e.repo?.name || ""),
    );
  });
}
