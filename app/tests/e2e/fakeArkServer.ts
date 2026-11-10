import { createServer } from "node:http";

const server = createServer((request, response) => {
  if (
    request.method !== "POST" ||
    request.url !== "/api/v3/chat/completions"
  ) {
    response.writeHead(404).end();
    return;
  }

  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    try {
      const payload = JSON.parse(body);
      const userMessage = payload.messages.find(
        (message: { role: string }) => message.role === "user"
      );
      const analysis = JSON.parse(userMessage.content);
      const isExecutionError = analysis.outcome.verdict === "error";
      const attemptNumber = isExecutionError
        ? analysis.attempt.errorAttempts
        : analysis.attempt.failedAttempts;
      const diagnosis = isExecutionError
        ? `第 ${attemptNumber} 次执行错误`
        : `第 ${attemptNumber} 次筛选条件缺失`;
      const feedback = {
        diagnosis,
        explanation: "当前查询与题目要求仍有差异。",
        nextHint: "逐项核对时间、状态和城市条件。",
        reviewTopics: ["WHERE", "日期边界"],
        mistakeTags: [
          isExecutionError ? "execution_error" : "missing_filter"
        ],
        stageSummary: analysis.includeStageSummary
          ? "需要继续巩固多条件筛选"
          : null
      };
      const result = {
        choices: [
          {
            message: {
              content: JSON.stringify(feedback)
            }
          }
        ]
      };

      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
      }, 300);
    } catch {
      response.writeHead(400).end();
    }
  });
});

server.listen(3999, "127.0.0.1", () => {
  process.stderr.write("fake-ark-ready\n");
});

function close() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
