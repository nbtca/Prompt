// Handle user actions from the main menu.

import chalk from "chalk";
import open from "open";

/**
 * Handle the selected action from the main menu.
 * @param {string} action - The selected action.
 */
export async function handleUserAction(action) {
  switch (action) {
    case "official":
      console.log(chalk.blue("Opening NBTCA homepage..."));
      await open("https://nbtca.space/");
      break;
    case "repair":
      console.log(chalk.blue("Opening repair team homepage..."));
      await open("https://nbtca.space/repair/");
      break;
    case "mirror":
      console.log(chalk.blue("Opening NBTCA internal mirror site..."));
      await open("https://i.nbtca.space/");
      break;
    default:
      console.log(chalk.yellow("Unknown action: " + action));
  }
}
