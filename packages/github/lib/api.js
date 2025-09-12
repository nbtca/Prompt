import https from "https";

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "nbtca-tracker" } }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

export async function getOrgRepos(org) {
  return fetchJSON(`https://api.github.com/orgs/${org}/repos?per_page=10`);
}

export async function getOrgEvents(org) {
  return fetchJSON(`https://api.github.com/orgs/${org}/events`);
}
