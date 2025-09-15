import { downloadICS } from "./fetchICS.js";
import { preprocessICS, parseEvents, getUpcomingEvents } from "./parseICS.js";
import { displayEvents } from "./display.js";

const ICS_URL = "https://ical.nbtca.space/your_calendar.ics"; // 替换成实际 URL
const FILE_PATH = "./events.ics";

async function main() {
  await downloadICS(ICS_URL, FILE_PATH);
  const icsText = preprocessICS(FILE_PATH);
  const events = parseEvents(icsText);
  const upcoming = getUpcomingEvents(events, 10);
  displayEvents(upcoming);
}

main().catch((err) => console.error(err));
