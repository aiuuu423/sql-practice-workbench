export function shouldGenerateStageSummary(input: {
  verdict: "passed" | "failed" | "error";
  failedAttempts: number;
  errorAttempts: number;
}) {
  if (input.verdict === "passed") return true;
  const totalErrors = input.failedAttempts + input.errorAttempts;
  return totalErrors > 0 && totalErrors % 3 === 0;
}
