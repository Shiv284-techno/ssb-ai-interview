import { CheckIcon, PlayIcon } from "@/components/icons";

interface WelcomeScreenProps {
  onStart: () => void;
  questionCount: number;
}

const PREPARATION_POINTS = [
  "Sit upright in a quiet, well-lit room with the camera at eye level.",
  "Answer aloud in your own words — there are no model answers here.",
  "Stay natural. The board assesses consistency, not rehearsed lines.",
];

export function WelcomeScreen({ onStart, questionCount }: WelcomeScreenProps) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
          Mock session
        </span>

        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          SSB Personal Interview
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
          This is a practice run of the Services Selection Board personal
          interview. An AI interviewing officer will put questions to you one at
          a time, exactly as the board would. Speak your answers aloud and treat
          it as the real thing — the value of the rehearsal comes from taking it
          seriously.
        </p>

        <ul className="mt-8 grid gap-3 sm:grid-cols-3">
          {PREPARATION_POINTS.map((point) => (
            <li
              key={point}
              className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-300"
            >
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              {point}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onStart}
            className="flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            <PlayIcon className="h-5 w-5" />
            Start interview
          </button>
          <p className="text-sm text-slate-400">
            {questionCount} questions · roughly 15 minutes
          </p>
        </div>

        <p className="mt-8 border-t border-white/5 pt-5 text-xs leading-relaxed text-slate-500">
          Preview build: the camera and microphone are simulated placeholders.
          Nothing is captured, recorded or assessed yet.
        </p>
      </div>
    </main>
  );
}
