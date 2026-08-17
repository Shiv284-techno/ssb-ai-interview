import {
  activityDefinitionId,
  type ActivityDefinitionId,
} from "@/lib/assessment/types";
import type {
  AssessmentActivity,
  AssessmentActivityKind,
} from "@/lib/assessment/activities";

/**
 * One definition per in-scope activity.
 *
 * This is configuration, not implementation: how long an activity runs, how it
 * is introduced, whether it is individual or group work, and which slices of
 * the PIQ it may see. No activity is *implemented* here, and no content lives
 * here — the definition says how the room is run, the bank says what is asked.
 *
 * Durations follow the widely published shape of the selection procedure and
 * are configuration a board could change; nothing in this file reproduces
 * examination material. Instructions are written for this platform.
 *
 * Client-safe: a candidate is shown these instructions and timings.
 */

const id = (value: string): ActivityDefinitionId => activityDefinitionId(value);

export const OIR_DEFINITION: Extract<AssessmentActivity, { kind: "oir" }> = {
  kind: "oir",
  id: id("oir-standard"),
  title: "OIR",
  fullTitle: "Officer Intelligence Rating",
  instructions: [
    "Two timed sets of reasoning questions.",
    "Answer as many as you can; you may not return to a set once it closes.",
    "Each question has exactly one correct option.",
  ],
  participation: "individual",
  timing: { totalSeconds: 34 * 60, enforcement: "hard" },
  piqAspects: [],
  sections: [
    { label: "Verbal reasoning", questionCount: 50, timeLimitSeconds: 17 * 60 },
    { label: "Non-verbal reasoning", questionCount: 50, timeLimitSeconds: 17 * 60 },
  ],
  negativeMarking: false,
};

export const PPDT_DEFINITION: Extract<AssessmentActivity, { kind: "ppdt" }> = {
  kind: "ppdt",
  id: id("ppdt-standard"),
  title: "PP&DT",
  fullTitle: "Picture Perception and Description Test",
  instructions: [
    "You will see one indistinct picture for a short time.",
    "Note what you perceive, then write a story about it.",
    "You will narrate your story, and the group will then discuss.",
  ],
  participation: "group",
  timing: { totalSeconds: null, enforcement: "hard" },
  piqAspects: [],
  perceptionSeconds: 30,
  storyWritingSeconds: 4 * 60,
  narrationSeconds: 60,
  groupDiscussionSeconds: 20 * 60,
};

export const TAT_DEFINITION: Extract<AssessmentActivity, { kind: "tat" }> = {
  kind: "tat",
  id: id("tat-standard"),
  title: "TAT",
  fullTitle: "Thematic Apperception Test",
  instructions: [
    "A series of pictures is shown, each for a short time.",
    "After each picture, write the story it suggests to you.",
    "The final slide is blank — write a story of your own choosing.",
  ],
  participation: "individual",
  timing: { totalSeconds: null, enforcement: "hard" },
  piqAspects: [],
  slideCount: 12,
  includesBlankSlide: true,
  viewingSecondsPerSlide: 30,
  writingSecondsPerSlide: 4 * 60,
};

export const WAT_DEFINITION: Extract<AssessmentActivity, { kind: "wat" }> = {
  kind: "wat",
  id: id("wat-standard"),
  title: "WAT",
  fullTitle: "Word Association Test",
  instructions: [
    "Words are shown one at a time, briefly.",
    "Write the first sentence that comes to mind for each.",
    "Do not go back; the next word follows automatically.",
  ],
  participation: "individual",
  timing: { totalSeconds: 60 * 15, enforcement: "hard" },
  piqAspects: [],
  wordCount: 60,
  secondsPerWord: 15,
};

export const SRT_DEFINITION: Extract<AssessmentActivity, { kind: "srt" }> = {
  kind: "srt",
  id: id("srt-standard"),
  title: "SRT",
  fullTitle: "Situation Reaction Test",
  instructions: [
    "You will be given a booklet of everyday situations.",
    "Write what you would do in each, as briefly as you like.",
    "Work through as many as you can in the time allowed.",
  ],
  participation: "individual",
  timing: { totalSeconds: 30 * 60, enforcement: "hard" },
  piqAspects: [],
  situationCount: 60,
  totalSeconds: 30 * 60,
};

export const SD_DEFINITION: Extract<AssessmentActivity, { kind: "sd" }> = {
  kind: "sd",
  id: id("sd-standard"),
  title: "SD",
  fullTitle: "Self Description",
  instructions: [
    "Write short paragraphs describing yourself from several points of view.",
    "Write what you believe to be true rather than what you think is wanted.",
  ],
  participation: "individual",
  timing: { totalSeconds: 15 * 60, enforcement: "hard" },
  piqAspects: [],
  parts: ["parents", "teachers", "friends", "self", "aspirations"],
  totalSeconds: 15 * 60,
};

export const GD_DEFINITION: Extract<AssessmentActivity, { kind: "gd" }> = {
  kind: "gd",
  id: id("gd-standard"),
  title: "GD",
  fullTitle: "Group Discussion",
  instructions: [
    "The group is offered topics and settles on one.",
    "Discuss it together; there is no chairperson and no vote.",
  ],
  participation: "group",
  timing: { totalSeconds: 20 * 60, enforcement: "soft" },
  piqAspects: [],
  topicChoices: 2,
  discussionSeconds: 20 * 60,
  groupSize: 8,
};

export const GPE_DEFINITION: Extract<AssessmentActivity, { kind: "gpe" }> = {
  kind: "gpe",
  id: id("gpe-standard"),
  title: "GPE",
  fullTitle: "Group Planning Exercise",
  instructions: [
    "A situation with several problems is narrated, with a sketch map.",
    "Write your own plan first, then agree a common plan with the group.",
  ],
  participation: "group",
  timing: { totalSeconds: null, enforcement: "soft" },
  piqAspects: [],
  narrationSeconds: 5 * 60,
  individualWritingSeconds: 10 * 60,
  groupDiscussionSeconds: 20 * 60,
  groupSize: 8,
};

export const LECTURETTE_DEFINITION: Extract<AssessmentActivity, { kind: "lecturette" }> = {
  kind: "lecturette",
  id: id("lecturette-standard"),
  title: "Lecturette",
  fullTitle: "Lecturette",
  instructions: [
    "Choose one topic from the card you are given.",
    "Prepare briefly, then speak to the group on it.",
  ],
  participation: "group",
  timing: { totalSeconds: 6 * 60, enforcement: "hard" },
  piqAspects: [],
  topicChoices: 4,
  preparationSeconds: 3 * 60,
  speakingSeconds: 3 * 60,
};

export const COMMAND_TASK_DEFINITION: Extract<AssessmentActivity, { kind: "command-task" }> = {
  kind: "command-task",
  id: id("command-task-standard"),
  title: "Command Task",
  fullTitle: "Command Task",
  instructions: [
    "You are the commander for this task and may choose subordinates.",
    "Brief them, then complete the task within the rules given.",
  ],
  participation: "group",
  timing: { totalSeconds: 15 * 60, enforcement: "soft" },
  piqAspects: [],
  subordinateCount: 2,
  totalSeconds: 15 * 60,
};

export const FGT_DEFINITION: Extract<AssessmentActivity, { kind: "fgt" }> = {
  kind: "fgt",
  id: id("fgt-standard"),
  title: "FGT",
  fullTitle: "Final Group Task",
  instructions: [
    "One last task for the whole group, under the same rules as before.",
  ],
  participation: "group",
  timing: { totalSeconds: 15 * 60, enforcement: "soft" },
  piqAspects: [],
  totalSeconds: 15 * 60,
  groupSize: 8,
};

export const INTERVIEW_DEFINITION: Extract<AssessmentActivity, { kind: "interview" }> = {
  kind: "interview",
  id: id("interview-standard"),
  title: "Interview",
  fullTitle: "Personal Interview",
  instructions: [
    "A conversation with the interviewing officer.",
    "Answer in your own words; there is no time limit on any answer.",
  ],
  participation: "individual",
  timing: { totalSeconds: null, enforcement: "none" },
  // The one activity that reads the form in depth — it is an interview about
  // the candidate's own account of themselves.
  piqAspects: ["identity", "family", "education", "activities", "service-background"],
  expectedSeconds: 45 * 60,
  usesCandidateProfile: true,
};

export const CONFERENCE_DEFINITION: Extract<AssessmentActivity, { kind: "conference" }> = {
  kind: "conference",
  id: id("conference-standard"),
  title: "Conference",
  fullTitle: "Board Conference",
  instructions: [
    "A short appearance before the board at the end of the assessment.",
  ],
  participation: "individual",
  timing: { totalSeconds: null, enforcement: "none" },
  piqAspects: ["identity"],
  expectedSeconds: 5 * 60,
};

/** Every in-scope activity definition, keyed by kind. */
export const ACTIVITY_DEFINITIONS: Readonly<
  Record<AssessmentActivityKind, AssessmentActivity>
> = {
  oir: OIR_DEFINITION,
  ppdt: PPDT_DEFINITION,
  tat: TAT_DEFINITION,
  wat: WAT_DEFINITION,
  srt: SRT_DEFINITION,
  sd: SD_DEFINITION,
  gd: GD_DEFINITION,
  gpe: GPE_DEFINITION,
  lecturette: LECTURETTE_DEFINITION,
  "command-task": COMMAND_TASK_DEFINITION,
  fgt: FGT_DEFINITION,
  interview: INTERVIEW_DEFINITION,
  conference: CONFERENCE_DEFINITION,
};

export function definitionFor(kind: AssessmentActivityKind): AssessmentActivity {
  return ACTIVITY_DEFINITIONS[kind];
}
