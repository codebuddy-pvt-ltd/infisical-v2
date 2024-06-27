import dotenv from "dotenv";
import fs from "fs";

import { initDbConnection } from "./db";
import { keyStoreFactory } from "./keystore/keystore";
import { formatSmtpConfig, initEnvConfig } from "./lib/config/env";
import { initLogger } from "./lib/logger";
import { queueServiceFactory } from "./queue";
import { main } from "./server/app";
import { bootstrapCheck } from "./server/boot-strap-check";
import { smtpServiceFactory } from "./services/smtp/smtp-service";

dotenv.config();
const run = async () => {
  const logger = await initLogger();
  const appCfg = initEnvConfig(logger);
  const dbRootCert = (await fs.promises.readFile("./global-bundle.pem", "utf-8")).toString();

  const db = initDbConnection({
    dbConnectionUri: appCfg.DB_CONNECTION_URI,
    dbRootCert
  });

  const smtp = smtpServiceFactory(formatSmtpConfig());
  const queue = queueServiceFactory(appCfg.REDIS_URL);
  const keyStore = keyStoreFactory(appCfg.REDIS_URL);

  const server = await main({ db, smtp, logger, queue, keyStore });
  const bootstrap = await bootstrapCheck({ db });
  // eslint-disable-next-line
  process.on("SIGINT", async () => {
    await server.close();
    await db.destroy();
    process.exit(0);
  });

  // eslint-disable-next-line
  process.on("SIGTERM", async () => {
    await server.close();
    await db.destroy();
    process.exit(0);
  });

  await server.listen({
    port: appCfg.PORT,
    host: appCfg.HOST,
    listenTextResolver: (address) => {
      void bootstrap();
      return address;
    }
  });
};

void run();
