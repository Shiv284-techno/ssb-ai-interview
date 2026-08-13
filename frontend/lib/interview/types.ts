/** Which screen of the mock interview flow the candidate is on. */
export type InterviewPhase = "welcome" | "live" | "ended";

/** What the AI interviewing officer is currently doing. */
export type AiStatus = "ready" | "speaking" | "listening" | "thinking";

export interface InterviewQuestion {
  id: string;
  /** The question as the interviewing officer asks it. */
  prompt: string;
  /** The quality the board is assessing with this question. */
  focus: string;
}

export interface AiStatusMeta {
  label: string;
  /** Short line shown under the status, aimed at the candidate. */
  hint: string;
  chip: string;
  dot: string;
  accent: string;
}

export const AI_STATUS_META: Record<AiStatus, AiStatusMeta> = {
  ready: {
    label: "Ready",
    hint: "The board is ready to begin.",
    chip: "border-slate-400/25 bg-slate-400/10 text-slate-200",
    dot: "bg-slate-300",
    accent: "text-slate-300",
  },
  speaking: {
    label: "Speaking",
    hint: "The interviewing officer is putting a question to you.",
    chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    dot: "bg-emerald-400",
    accent: "text-emerald-300",
  },
  listening: {
    label: "Listening",
    hint: "Answer aloud, calmly and in your own words.",
    chip: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    dot: "bg-sky-400",
    accent: "text-sky-300",
  },
  thinking: {
    label: "Thinking",
    hint: "The board is considering your response.",
    chip: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    dot: "bg-amber-400",
    accent: "text-amber-300",
  },
};
