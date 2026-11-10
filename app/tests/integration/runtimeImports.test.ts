import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

describe("native server module loading", () => {
  test("loads the SQL guard through Node and tsx", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        "await import('./server/src/sqlGuard.ts'); console.log('loaded')"
      ],
      { cwd: process.cwd() }
    );

    expect(stdout.trim()).toBe("loaded");
  });
});
