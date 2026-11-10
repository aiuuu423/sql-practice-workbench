import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = await createApp({ config, serveStatic: process.env.NODE_ENV === "production" });

await app.listen({
  host: "127.0.0.1",
  port: config.apiPort
});
