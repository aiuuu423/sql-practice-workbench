import { loadEnvFile } from "node:process";
import { z } from "zod";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const EnvironmentSchema = z.object({
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number().int().positive(),
  MYSQL_DATABASE: z.string().min(1),
  MYSQL_RUNNER_USER: z.string().min(1),
  MYSQL_RUNNER_PASSWORD: z.string().min(1),
  MYSQL_RESET_USER: z.string().min(1),
  MYSQL_RESET_PASSWORD: z.string().min(1),
  API_PORT: z.coerce.number().int().positive(),
  MAX_EXECUTION_MS: z.coerce.number().int().positive(),
  MAX_RESULT_ROWS: z.coerce.number().int().positive()
});

export interface AppConfig {
  mysql: {
    host: string;
    port: number;
    database: string;
    runnerUser: string;
    runnerPassword: string;
    resetUser: string;
    resetPassword: string;
  };
  apiPort: number;
  maxExecutionMs: number;
  maxResultRows: number;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): AppConfig {
  const parsed = EnvironmentSchema.safeParse(environment);

  if (!parsed.success) {
    const variableNames = parsed.error.issues
      .map((issue) => String(issue.path[0]))
      .join(", ");
    throw new Error(`Missing or invalid environment variables: ${variableNames}`);
  }

  const env = parsed.data;
  return {
    mysql: {
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      database: env.MYSQL_DATABASE,
      runnerUser: env.MYSQL_RUNNER_USER,
      runnerPassword: env.MYSQL_RUNNER_PASSWORD,
      resetUser: env.MYSQL_RESET_USER,
      resetPassword: env.MYSQL_RESET_PASSWORD
    },
    apiPort: env.API_PORT,
    maxExecutionMs: env.MAX_EXECUTION_MS,
    maxResultRows: env.MAX_RESULT_ROWS
  };
}
