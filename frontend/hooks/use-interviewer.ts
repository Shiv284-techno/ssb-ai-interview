"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type InterviewerStatus = "idle" | "thinking" | "error";

export type InterviewerErrorKind = "request" | "server" | "response" | "network";

export interface InterviewerError {
  kind: InterviewerErrorKind;
  /** Message written for the candidate, not for the console. */
  message: string;
}

export interface InterviewTurn {
  role: "officer" | "candidate";
  text: string;
}

export interface InterviewerReply {
  question: string;
  isClosing: boolean;
}

export interface UseInterviewerResult {
  status: InterviewerStatus;
  error: InterviewerError | null;
  /** Resolves to null if the request fails or one is already in flight. */
  askInterviewer: (
    turns: InterviewTurn[],
    elapsedSeconds: number,
  ) => Promise<InterviewerReply | null>;
}

const ENDPOINT = "/api/interview";

function isReply(value: unknown): value is InterviewerReply {
  if (typeof value !== "object" || value === null) return false;

  const { question, isClosing } = value as {
    question?: unknown;
    isClosing?: unknown;
  };
  return typeof question === "string" && typeof isClosing === "boolean";
}

/** Prefers the route's own `{ error }` message, falling back to the status. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const { error } = body as { error?: unknown };
      if (typeof error === "string" && error.length > 0) return error;
    }
  } catch {
    // Body was not JSON — fall through to the status-based message.
  }

  return `The interviewer service responded with ${response.status}.`;
}

/**
 * Talks to the interview route. Owns the request lifecycle only — it does not
 * hold the transcript, and it never speaks or listens.
 */
export function useInterviewer(): UseInterviewerResult {
  const [status, setStatus] = useState<InterviewerStatus>("idle");
  const [error, setError] = useState<InterviewerError | null>(null);
  /** Non-null while a turn is in flight, which also serves as the busy flag. */
  const controllerRef = useRef<AbortController | null>(null);

  // Drop an in-flight request if the component unmounts mid-turn.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  const askInterviewer = useCallback(
    async (
      turns: InterviewTurn[],
      elapsedSeconds: number,
    ): Promise<InterviewerReply | null> => {
      // A turn is already running — ignore the overlapping call.
      if (controllerRef.current) return null;

      const controller = new AbortController();
      controllerRef.current = controller;
      setStatus("thinking");
      setError(null);

      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns, elapsedSeconds }),
          signal: controller.signal,
        });

        if (!response.ok) {
          setStatus("error");
          setError({
            kind: response.status >= 500 ? "server" : "request",
            message: await readErrorMessage(response),
          });
          return null;
        }

        const payload: unknown = await response.json();
        if (!isReply(payload)) {
          setStatus("error");
          setError({
            kind: "response",
            message: "The interviewer service returned an unexpected response.",
          });
          return null;
        }

        setStatus("idle");
        return payload;
      } catch {
        // Aborted on unmount — the component is gone, leave state alone.
        if (controller.signal.aborted) return null;

        setStatus("error");
        setError({
          kind: "network",
          message:
            "Could not reach the interviewer service. Check your connection and try again.",
        });
        return null;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    [],
  );

  return { status, error, askInterviewer };
}
