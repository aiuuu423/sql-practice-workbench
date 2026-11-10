import { z } from "zod";
import {
  CoachFeedbackSchema,
  type CoachFeedback
} from "@shared/schemas";
import {
  buildCoachMessages,
  type CoachAnalysisRequest
} from "./coachPrompt";

const ArkResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string()
        })
      })
    )
    .min(1)
});

export type ArkErrorCategory =
  | "authentication"
  | "timeout"
  | "network"
  | "provider"
  | "invalid_model_response";

export class ArkClientError extends Error {
  constructor(
    readonly category: ArkErrorCategory,
    message: string
  ) {
    super(message);
    this.name = "ArkClientError";
  }
}

export interface ArkClientOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export function createArkClient(options: ArkClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  async function analyze(
    request: CoachAnalysisRequest
  ): Promise<CoachFeedback> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          messages: buildCoachMessages(request),
          response_format: { type: "json_object" },
          temperature: 0.2
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ArkClientError(
            "authentication",
            "Ark authentication failed"
          );
        }
        throw new ArkClientError("provider", "Ark request failed");
      }

      let providerPayload: unknown;
      try {
        providerPayload = await response.json();
      } catch {
        throw new ArkClientError(
          "invalid_model_response",
          "Ark returned an invalid response"
        );
      }

      const parsedProvider = ArkResponseSchema.safeParse(providerPayload);
      if (!parsedProvider.success) {
        throw new ArkClientError(
          "invalid_model_response",
          "Ark returned an invalid response"
        );
      }

      let feedbackPayload: unknown;
      try {
        feedbackPayload = JSON.parse(
          parsedProvider.data.choices[0].message.content
        );
      } catch {
        throw new ArkClientError(
          "invalid_model_response",
          "Ark returned invalid JSON feedback"
        );
      }

      const parsedFeedback = CoachFeedbackSchema.safeParse(feedbackPayload);
      if (!parsedFeedback.success) {
        throw new ArkClientError(
          "invalid_model_response",
          "Ark returned incomplete feedback"
        );
      }
      return parsedFeedback.data;
    } catch (error) {
      if (error instanceof ArkClientError) throw error;
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new ArkClientError("timeout", "Ark request timed out");
      }
      throw new ArkClientError("network", "Ark is unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  return { analyze };
}

export type ArkClient = ReturnType<typeof createArkClient>;
