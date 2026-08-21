import "dotenv/config";
import { createApp } from "./app";
import { logger } from "./utils/logger";

const port = process.env.PORT ?? 4000;
const app = createApp();

app.listen(port, () => {
  logger.info(`quickmart-inventory backend listening on port ${port}`);
});
