import { AiStatusPill } from "@/components/interview/ai-status-pill";
import { ArrowRightIcon, TimerIcon } from "@/components/icons";
import type { SpeechStatus } from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/interview/format";
import {
  AI_STATUS_META,
  type AiStatus,
  type InterviewQuestion,
} from "@/lib/interview/types";

interface InterviewerPanelProps {
  status: AiStatus;
  question: InterviewQuestion;
  questionNumber: number;
  totalQuestions: number;
  elapsedSeconds: number;
  micOn: boolean;
  speechStatus: SpeechStatus;
  speechErrorMessage: string | null;
  transcript: string;
  interimTranscript: string;
  canAdvance: boolean;
  onNextQuestion: () => void;
}

export function InterviewerPanel({
  status,
  question,
  questionNumber,
  totalQuestions,
  elapsedSeconds,
  micOn,
  speechStatus,
  speechErrorMessage,
  transcript,
  interimTranscript,
  canAdvance,
  onNextQuestion,
}: InterviewerPanelProps) {
  const meta = AI_STATUS_META[status];

  return (
    <section
      aria-label="AI interviewing officer"
      className="flex min-h-0 flex-col gap-5 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-black/40 backdrop-blur sm:p-6 lg:flex-1 lg:overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <InterviewerAvatar status={status} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">
              Interviewing Officer
            </p>
            <p className="truncate text-xs uppercase tracking-[0.16em] text-slate-400">
              AI Assessor · Board 3
            </p>
          </div>
        </div>
        <AiStatusPill status={status} className="shrink-0" />
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
        <SignalBars status={status} />
        <p className={cn("text-sm", meta.accent)}>
          {status === "listening" && !micOn
            ? "Your microphone is muted — unmute to answer."
            : meta.hint}
        </p>
      </div>

      <div
        aria-live="polite"
        className="rounded-xl border border-white/10 bg-slate-950/70 p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          <span>
            Question {String(questionNumber).padStart(2, "0")} /{" "}
            {String(totalQuestions).padStart(2, "0")}
          </span>
          <span className="rounded-full bg-white/5 px-2.5 py-1 tracking-[0.1em] text-slate-300">
            {question.focus}
          </span>
        </div>
        <p className="mt-4 text-xl font-medium leading-relaxed text-white sm:text-2xl sm:leading-relaxed">
          {question.prompt}
        </p>
      </div>

      <TranscriptBlock
        speechStatus={speechStatus}
        speechErrorMessage={speechErrorMessage}
        transcript={transcript}
        interimTranscript={interimTranscript}
      />

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Elapsed
          </p>
          <p className="mt-1 flex items-center gap-2 font-mono text-2xl tabular-nums text-white">
            <TimerIcon className="h-5 w-5 text-slate-500" />
            {formatDuration(elapsedSeconds)}
          </p>
        </div>

        <button
          type="button"
          onClick={onNextQuestion}
          disabled={!canAdvance}
          className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next question
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

interface TranscriptBlockProps {
  speechStatus: SpeechStatus;
  speechErrorMessage: string | null;
  transcript: string;
  interimTranscript: string;
}

function TranscriptBlock({
  speechStatus,
  speechErrorMessage,
  transcript,
  interimTranscript,
}: TranscriptBlockProps) {
  const hasSpeech = Boolean(transcript || interimTranscript);
  const hasFailed = speechStatus === "error" || speechStatus === "unsupported";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
        <span>Your answer</span>
        {speechStatus === "listening" && (
          <span className="flex items-center gap-1.5 text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 motion-safe:animate-pulse" />
            Transcribing
          </span>
        )}
      </div>

      {hasFailed ? (
        <p className="mt-3 text-sm leading-relaxed text-rose-300">
          {speechErrorMessage ??
            "Speech recognition is unavailable in this browser."}
        </p>
      ) : (
        <p className="mt-3 max-h-32 overflow-y-auto text-sm leading-relaxed text-slate-200">
          {hasSpeech ? (
            <>
              {transcript}
              {interimTranscript && (
                <span className="text-slate-500">
                  {transcript ? " " : ""}
                  {interimTranscript}
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-500">
              {speechStatus === "listening"
                ? "Listening — start speaking."
                : "Turn on the microphone to transcribe your answer."}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function InterviewerAvatar({ status }: { status: AiStatus }) {
  const meta = AI_STATUS_META[status];

  return (
    <span className="relative grid h-16 w-16 shrink-0 place-items-center">
      {status !== "ready" && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full opacity-30 animate-[ssb-ring_2s_ease-out_infinite]",
            meta.dot,
          )}
        />
      )}
      <span className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-gradient-to-b from-slate-600 to-slate-900 ring-2 ring-white/15">
        <svg viewBox="0 0 64 64" aria-hidden="true" className="h-16 w-16">
          <circle cx="32" cy="24" r="12" fill="#cbd5e1" opacity="0.9" />
          <path
            d="M8 64c0-13 11-21 24-21s24 8 24 21z"
            fill="#e2e8f0"
            opacity="0.85"
          />
          <path d="M24 45h16l-8 9z" fill="#0f172a" opacity="0.55" />
        </svg>
      </span>
    </span>
  );
}

function SignalBars({ status }: { status: AiStatus }) {
  const meta = AI_STATUS_META[status];
  const isActive = status === "speaking" || status === "listening";
  const duration = status === "speaking" ? "1s" : "1.8s";

  return (
    <span aria-hidden="true" className="flex h-6 shrink-0 items-end gap-[3px]">
      {[0, 1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-[3px] origin-bottom rounded-full",
            meta.dot,
            isActive ? "h-6 animate-[ssb-waveform_1s_ease-in-out_infinite]" : "h-2",
          )}
          style={
            isActive
              ? {
                  animationDelay: `${bar * 110}ms`,
                  animationDuration: duration,
                }
              : undefined
          }
        />
      ))}
    </span>
  );
}
