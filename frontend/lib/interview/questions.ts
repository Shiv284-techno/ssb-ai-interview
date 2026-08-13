import type { InterviewQuestion } from "@/lib/interview/types";

/**
 * Placeholder question set for the interview room UI. These are static for now —
 * the real board questions will come from the AI interviewer later.
 */
export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: "intro",
    prompt: "Good morning. Please introduce yourself.",
    focus: "Self awareness",
  },
  {
    id: "family",
    prompt:
      "Tell me about your family background and what you have learnt from them.",
    focus: "Background",
  },
  {
    id: "routine",
    prompt: "Walk me through a typical working day, from morning to night.",
    focus: "Discipline",
  },
  {
    id: "strengths",
    prompt:
      "What are your three greatest strengths, and one weakness you are working on?",
    focus: "Self appraisal",
  },
  {
    id: "leadership",
    prompt:
      "Describe a situation where you had to lead a group. What was the outcome?",
    focus: "Officer-like qualities",
  },
  {
    id: "motivation",
    prompt: "Why do you wish to join the armed forces?",
    focus: "Motivation",
  },
];
