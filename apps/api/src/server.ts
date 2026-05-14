import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

buildApp(config)
  .then((app) => app.listen({ port: config.port, host: config.host }))
  .then((address) => {
    // eslint-disable-next-line no-console
    console.log(`opensearch-analyzer API listening on ${address}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
