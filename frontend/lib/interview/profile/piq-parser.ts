import "server-only";

import {
  PROFILE_VERSION,
  emptyMarksCell,
  summariseCompleteness,
  type CandidateProfile,
  type PIQAge,
  type PIQDateOfBirth,
  type PIQDegreeQualification,
  type PIQExtracurricularRecord,
  type PIQFamilyMember,
  type PIQHobbyRecord,
  type PIQMarksRow,
  type PIQPreviousSsbAttempt,
  type PIQSchoolQualification,
  type PIQSportsRecord,
  type PIQUnparsedLine,
  type ProfileSource,
} from "@/lib/interview/profile/profile";

/**
 * Parser for a normalised text rendering of the supplied PIQ form
 * (`docs/SSB PIQ-FORM-pdf.pdf`, 33 questions over four pages).
 *
 * SCOPE. This is not PDF extraction. It does not open a PDF, read coordinates,
 * reconstruct table geometry, run OCR, or read handwriting. It consumes text
 * that some earlier step has already extracted, and its job is to attribute
 * that text to the form's fields — or to admit that it could not.
 *
 * INPUT CONTRACT. Line-oriented text, one field per line:
 *
 *     15. Mother Tongue: Hindi
 *     Mother Tongue Hindi            <- the colon is optional
 *
 * The question number is optional. Labels are matched case-insensitively and
 * punctuation-insensitively, longest label first, against the form's own
 * wording. Runs of underscores left over from the blank form are removed, and a
 * field that reduces to nothing is recorded as null rather than as "".
 *
 * TABLES. The form has six tables. A table row is a single pipe-delimited line
 * placed under its question's heading, with cells in the form's own column
 * order and trailing cells optional:
 *
 *     20. Particulars of parents / guardian / brothers/ sisters
 *     Father | Sample Father | 52 | B.A. | Farmer | 30000
 *
 * A row repeating the column headings is recognised and skipped. An empty cell,
 * or one containing only a dash, becomes null.
 *
 * MULTI-FIELD LINES. The form itself prints several questions per line
 * ("11. Height ___ cm 12. Weight ___kg."). A line is split at an embedded
 * `<number>.` only when the text right after it begins with a known label, so a
 * value that merely contains a number is never torn apart.
 *
 * WHAT IS DELIBERATELY NOT ATTEMPTED. The form offers printed choices —
 * "Male/Female", "Yes/No", "CBSE / ICSE / State Board / Other", "A/B/C". Which
 * one a candidate ticked or circled is a mark on paper, not text, so values are
 * stored exactly as they arrive and no guess is made about the intended option.
 *
 * Pure and deterministic: no model, no network, no environment variable, no
 * clock, no filesystem, no browser API.
 */

export interface ParsePIQOptions {
  /** Defaults to `"piq-upload"`, since this parser reads uploaded form text. */
  readonly source?: ProfileSource;
  /** ISO 8601 timestamp supplied by the caller; the parser never reads a clock. */
  readonly parsedAt?: string;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Splits a label into comparable words: "Day scholar/boarder" -> day scholar boarder. */
function labelWords(label: string): string[] {
  return label.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

interface Token {
  readonly word: string;
  /** Index just past this token in the original line. */
  readonly end: number;
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /[A-Za-z0-9]+/g;
  let match = pattern.exec(line);
  while (match !== null) {
    tokens.push({ word: match[0].toLowerCase(), end: match.index + match[0].length });
    match = pattern.exec(line);
  }
  return tokens;
}

/**
 * Removes blank-form underscores and collapses space; "" becomes null.
 *
 * The leading strip also clears punctuation left over where a label ended
 * mid-phrase — the closing bracket of "(Population in Lacs)", the question mark
 * of "Parents alive?" — so the value starts at the candidate's own text.
 */
function cleanValue(raw: string): string | null {
  const value = raw
    .replace(/^[\s:;.,?)\]}–—-]+/, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value.length === 0 ? null : value;
}

/** A table cell: empty, or a lone dash, counts as unfilled. */
function cleanCell(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const value = raw.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  if (value.length === 0) return null;
  if (/^[-–—]+$/.test(value)) return null;
  return value;
}

/**
 * Reads values sitting beside sub-labels, in whichever order they appear.
 * The form prints "____ Day ____Month ____Year", but an extractor may just as
 * easily emit "Day 12 Month 05 Year 2003", so both orders are handled — decided
 * once per value, so "12 Month" is never misread when the labels come first.
 */
function extractLabelled(
  value: string,
  labels: readonly string[],
): readonly (string | null)[] {
  const firstWord = /[A-Za-z0-9]+/.exec(value)?.[0].toLowerCase();
  const labelFirst =
    firstWord !== undefined && labels.some((label) => label.toLowerCase() === firstWord);

  return labels.map((label) => {
    const pattern = labelFirst
      ? new RegExp(`\\b${label}\\b\\s*[:-]?\\s*([A-Za-z0-9./-]+)`, "i")
      : new RegExp(`([A-Za-z0-9./-]+)\\s*\\b${label}\\b`, "i");
    return pattern.exec(value)?.[1] ?? null;
  });
}

// ---------------------------------------------------------------------------
// The mutable draft the parser fills in
// ---------------------------------------------------------------------------

interface SchoolDraft {
  questionNumber: 23 | 24;
  qualification: "Matric/Higher Secondary" | "Senior / 10+2/ Equivalent";
  nameOfInstitution: string | null;
  locationOfInstitution: string | null;
  nameOfBoard: string | null;
  typeOfInstitution: string | null;
  mediumOfInstruction: string | null;
  yearOfPassing: string | null;
  overallPercentageOfMarks: string | null;
  division: string | null;
  dayScholarOrBoarder: string | null;
  subjects: PIQMarksRow[];
}

interface DegreeDraft {
  questionNumber: 25 | 26;
  qualification: "Graduation" | "Post Graduation";
  nameOfInstitution: string | null;
  locationOfInstitution: string | null;
  university: string | null;
  course: string | null;
  branchStream: string | null;
  yearOfAdmission: string | null;
  pursuingOrCompleted: string | null;
  yearOfCompletion: string | null;
  dayScholarOrBoarder: string | null;
  mediumOfInstruction: string | null;
  division: string | null;
  aggregatePercentage: string | null;
  semesters: PIQMarksRow[];
}

function newSchool(questionNumber: 23 | 24): SchoolDraft {
  return {
    questionNumber,
    qualification:
      questionNumber === 23 ? "Matric/Higher Secondary" : "Senior / 10+2/ Equivalent",
    nameOfInstitution: null,
    locationOfInstitution: null,
    nameOfBoard: null,
    typeOfInstitution: null,
    mediumOfInstruction: null,
    yearOfPassing: null,
    overallPercentageOfMarks: null,
    division: null,
    dayScholarOrBoarder: null,
    subjects: [],
  };
}

function newDegree(questionNumber: 25 | 26): DegreeDraft {
  return {
    questionNumber,
    qualification: questionNumber === 25 ? "Graduation" : "Post Graduation",
    nameOfInstitution: null,
    locationOfInstitution: null,
    university: null,
    course: null,
    branchStream: null,
    yearOfAdmission: null,
    pursuingOrCompleted: null,
    yearOfCompletion: null,
    dayScholarOrBoarder: null,
    mediumOfInstruction: null,
    division: null,
    aggregatePercentage: null,
    semesters: [],
  };
}

type BlockKind =
  | "none"
  | "family"
  | "school"
  | "degree"
  | "sports"
  | "hobbies"
  | "extracurricular"
  | "ncc"
  | "ssb-attempts";

interface Draft {
  header: {
    selectionBoardNo: string | null;
    city: string | null;
    upscRollNumber: string | null;
    entry: string | null;
    batchNumber: string | null;
    chestNumber: string | null;
    choiceOfService: string | null;
  };
  personal: {
    name: string | null;
    dateOfBirth: PIQDateOfBirth | null;
    age: PIQAge | null;
    gender: string | null;
    height: string | null;
    weight: string | null;
    maritalStatus: string | null;
    religion: string | null;
    motherTongue: string | null;
    community: string | null;
    placeOfMaximumResidence: string | null;
    presentAddress: string | null;
    presentAddressPopulationInLacs: string | null;
    permanentAddress: string | null;
    permanentAddressPopulationInLacs: string | null;
  };
  family: {
    members: PIQFamilyMember[];
    parentsAlive: string | null;
    ageAtTimeOfParentsDeath: string | null;
  };
  presentOccupation: {
    occupation: string | null;
    incomePerMonth: string | null;
    designationAppointment: string | null;
    departmentFirm: string | null;
  };
  school23: SchoolDraft | null;
  school24: SchoolDraft | null;
  degree25: DegreeDraft | null;
  degree26: DegreeDraft | null;
  sports: PIQSportsRecord[];
  hobbies: PIQHobbyRecord[];
  extracurricular: PIQExtracurricularRecord[];
  ncc: {
    nccTraining: string | null;
    totalTrainingInMonths: string | null;
    wing: string | null;
    division: string | null;
    certificateObtained: string | null;
    achievements: string | null;
    positionsOfResponsibility: string[];
  };
  previousSsb: {
    natureOfCommissionAppliedFor: string | null;
    choiceOfService: string | null;
    numberOfChancesAvailed: string | null;
    attempts: PIQPreviousSsbAttempt[];
  };
  declaration: { dated: string | null };
  unparsed: PIQUnparsedLine[];
  populated: Set<number>;

  // Parsing position.
  block: BlockKind;
  /** Which address a following "(Population in Lacs)" belongs to. */
  lastAddress: "present" | "permanent" | null;
  /** Where an unlabelled continuation line should be appended, if anywhere. */
  continuation: "presentAddress" | "permanentAddress" | "positions" | null;
  /** Q31 onwards, "Choice of service" means Q31 rather than Q6. */
  inPreviousSsbSection: boolean;
}

function newDraft(): Draft {
  return {
    header: {
      selectionBoardNo: null,
      city: null,
      upscRollNumber: null,
      entry: null,
      batchNumber: null,
      chestNumber: null,
      choiceOfService: null,
    },
    personal: {
      name: null,
      dateOfBirth: null,
      age: null,
      gender: null,
      height: null,
      weight: null,
      maritalStatus: null,
      religion: null,
      motherTongue: null,
      community: null,
      placeOfMaximumResidence: null,
      presentAddress: null,
      presentAddressPopulationInLacs: null,
      permanentAddress: null,
      permanentAddressPopulationInLacs: null,
    },
    family: { members: [], parentsAlive: null, ageAtTimeOfParentsDeath: null },
    presentOccupation: {
      occupation: null,
      incomePerMonth: null,
      designationAppointment: null,
      departmentFirm: null,
    },
    school23: null,
    school24: null,
    degree25: null,
    degree26: null,
    sports: [],
    hobbies: [],
    extracurricular: [],
    ncc: {
      nccTraining: null,
      totalTrainingInMonths: null,
      wing: null,
      division: null,
      certificateObtained: null,
      achievements: null,
      positionsOfResponsibility: [],
    },
    previousSsb: {
      natureOfCommissionAppliedFor: null,
      choiceOfService: null,
      numberOfChancesAvailed: null,
      attempts: [],
    },
    declaration: { dated: null },
    unparsed: [],
    populated: new Set<number>(),
    block: "none",
    lastAddress: null,
    continuation: null,
    inPreviousSsbSection: false,
  };
}

// ---------------------------------------------------------------------------
// Section and block headings, taken from the form
// ---------------------------------------------------------------------------

/** Page banners. They set context but hold no value of their own. */
const SECTION_HEADINGS: readonly { readonly words: string; readonly previousSsb: boolean }[] = [
  { words: "personal information questionnaire", previousSsb: false },
  { words: "personal family", previousSsb: false },
  { words: "educational qualifications", previousSsb: false },
  { words: "sports hobbies extra curricular activites ncc training and miscellaneous", previousSsb: false },
  { words: "previous attendance in ssb", previousSsb: true },
];

interface BlockHeading {
  readonly label: string;
  readonly question: number;
  readonly open: (draft: Draft) => void;
}

/** Longest label first, so "Post Graduation" is never read as "Graduation". */
const BLOCK_HEADINGS: readonly BlockHeading[] = [
  {
    label: "Particulars of parents guardian brothers sisters",
    question: 20,
    open: (draft) => {
      draft.block = "family";
    },
  },
  {
    label: "Chances availed for commission in Armed forces",
    question: 33,
    open: (draft) => {
      draft.block = "ssb-attempts";
      draft.inPreviousSsbSection = true;
    },
  },
  {
    label: "Matric/Higher Secondary",
    question: 23,
    open: (draft) => {
      draft.school23 = draft.school23 ?? newSchool(23);
      draft.block = "school";
    },
  },
  {
    label: "Senior / 10+2/ Equivalent",
    question: 24,
    open: (draft) => {
      draft.school24 = draft.school24 ?? newSchool(24);
      draft.block = "school";
    },
  },
  {
    label: "Post Graduation",
    question: 26,
    open: (draft) => {
      draft.degree26 = draft.degree26 ?? newDegree(26);
      draft.block = "degree";
    },
  },
  {
    label: "Graduation",
    question: 25,
    open: (draft) => {
      draft.degree25 = draft.degree25 ?? newDegree(25);
      draft.block = "degree";
    },
  },
  {
    label: "Participation in sports",
    question: 27,
    open: (draft) => {
      draft.block = "sports";
    },
  },
  {
    label: "Hobbies / interest",
    question: 28,
    open: (draft) => {
      draft.block = "hobbies";
    },
  },
  {
    label: "Extra-curricular activities",
    question: 29,
    open: (draft) => {
      draft.block = "extracurricular";
    },
  },
  {
    label: "NCC",
    question: 30,
    open: (draft) => {
      draft.block = "ncc";
    },
  },
];

// ---------------------------------------------------------------------------
// Field labels
// ---------------------------------------------------------------------------

interface FieldLabel {
  readonly label: string;
  readonly question: number;
  /** Only match when the line carried this explicit question number. */
  readonly requiresQuestionNumber?: number;
  readonly apply: (draft: Draft, value: string) => void;
}

/** The school qualification currently being filled, if any. */
function currentSchool(draft: Draft): SchoolDraft | null {
  if (draft.block !== "school") return null;
  // The most recently opened of the two.
  return draft.school24 ?? draft.school23;
}

function currentDegree(draft: Draft): DegreeDraft | null {
  if (draft.block !== "degree") return null;
  return draft.degree26 ?? draft.degree25;
}

/**
 * Labels that only apply inside an education block.
 *
 * Both the form's full wording and a bare variant are registered. The full one
 * wins when present, so a printed choice list — "CBSE / ICSE / State Board /
 * Other" — is consumed as part of the label rather than mistaken for an answer.
 */
const SCHOOL_LABELS: readonly FieldLabel[] = [
  { label: "Name of institution (In full, no abberviations)", question: 0, apply: (d, v) => assignSchool(d, "nameOfInstitution", v) },
  { label: "Name of institution", question: 0, apply: (d, v) => assignSchool(d, "nameOfInstitution", v) },
  { label: "Location of institution (City town village)", question: 0, apply: (d, v) => assignSchool(d, "locationOfInstitution", v) },
  { label: "Location of institution", question: 0, apply: (d, v) => assignSchool(d, "locationOfInstitution", v) },
  { label: "Name of board CBSE / ICSE / State Board / Other", question: 0, apply: (d, v) => assignSchool(d, "nameOfBoard", v) },
  { label: "Name of board", question: 0, apply: (d, v) => assignSchool(d, "nameOfBoard", v) },
  { label: "Type of institution Govt/private", question: 0, apply: (d, v) => assignSchool(d, "typeOfInstitution", v) },
  { label: "Type of institution", question: 0, apply: (d, v) => assignSchool(d, "typeOfInstitution", v) },
  { label: "Medium of instruction English / Hindi / Regional", question: 0, apply: (d, v) => assignSchool(d, "mediumOfInstruction", v) },
  { label: "Medium of instruction", question: 0, apply: (d, v) => assignSchool(d, "mediumOfInstruction", v) },
  { label: "Year of passing", question: 0, apply: (d, v) => assignSchool(d, "yearOfPassing", v) },
  {
    label: "Overall percentage of marks obtained",
    question: 0,
    apply: (d, v) => assignSchool(d, "overallPercentageOfMarks", v),
  },
  { label: "Overall percentage", question: 0, apply: (d, v) => assignSchool(d, "overallPercentageOfMarks", v) },
  { label: "Division", question: 0, apply: (d, v) => assignSchool(d, "division", v) },
  { label: "Day scholar/boarder", question: 0, apply: (d, v) => assignSchool(d, "dayScholarOrBoarder", v) },
];

const DEGREE_LABELS: readonly FieldLabel[] = [
  { label: "Name of Institution (In full, no abbreviations)", question: 0, apply: (d, v) => assignDegree(d, "nameOfInstitution", v) },
  { label: "Name of Institution", question: 0, apply: (d, v) => assignDegree(d, "nameOfInstitution", v) },
  { label: "Location of institution (city/town/village)", question: 0, apply: (d, v) => assignDegree(d, "locationOfInstitution", v) },
  { label: "Location of institution", question: 0, apply: (d, v) => assignDegree(d, "locationOfInstitution", v) },
  { label: "University", question: 0, apply: (d, v) => assignDegree(d, "university", v) },
  { label: "Branch/stream", question: 0, apply: (d, v) => assignDegree(d, "branchStream", v) },
  // Q25 prints one course list, Q26 another.
  { label: "Course BTech/BE/B.Sc/B.Com/BA", question: 0, apply: (d, v) => assignDegree(d, "course", v) },
  { label: "Course MTech/M EM. Sc/M.Com/MA", question: 0, apply: (d, v) => assignDegree(d, "course", v) },
  { label: "Course", question: 0, apply: (d, v) => assignDegree(d, "course", v) },
  { label: "Year of admission", question: 0, apply: (d, v) => assignDegree(d, "yearOfAdmission", v) },
  { label: "Pursuing/completed", question: 0, apply: (d, v) => assignDegree(d, "pursuingOrCompleted", v) },
  { label: "Year of completion", question: 0, apply: (d, v) => assignDegree(d, "yearOfCompletion", v) },
  { label: "Day scholar/boarder", question: 0, apply: (d, v) => assignDegree(d, "dayScholarOrBoarder", v) },
  { label: "Medium of Instruction English/Hindi/Regional", question: 0, apply: (d, v) => assignDegree(d, "mediumOfInstruction", v) },
  { label: "Medium of Instruction", question: 0, apply: (d, v) => assignDegree(d, "mediumOfInstruction", v) },
  { label: "Aggregate percentage", question: 0, apply: (d, v) => assignDegree(d, "aggregatePercentage", v) },
  { label: "Division", question: 0, apply: (d, v) => assignDegree(d, "division", v) },
];

const NCC_LABELS: readonly FieldLabel[] = [
  { label: "NCC training Yes/No", question: 30, apply: (d, v) => { d.ncc.nccTraining = v; } },
  { label: "NCC training", question: 30, apply: (d, v) => { d.ncc.nccTraining = v; } },
  { label: "Total training in months", question: 30, apply: (d, v) => { d.ncc.totalTrainingInMonths = v; } },
  { label: "Total training", question: 30, apply: (d, v) => { d.ncc.totalTrainingInMonths = v; } },
  { label: "Wing Army / Navy / Air Force", question: 30, apply: (d, v) => { d.ncc.wing = v; } },
  { label: "Wing", question: 30, apply: (d, v) => { d.ncc.wing = v; } },
  { label: "Division Senior / Junior", question: 30, apply: (d, v) => { d.ncc.division = v; } },
  { label: "Division", question: 30, apply: (d, v) => { d.ncc.division = v; } },
  { label: "Certificate obtained A/B/C", question: 30, apply: (d, v) => { d.ncc.certificateObtained = v; } },
  { label: "Certificate obtained", question: 30, apply: (d, v) => { d.ncc.certificateObtained = v; } },
  { label: "Achievements if any", question: 30, apply: (d, v) => { d.ncc.achievements = v; } },
  { label: "Achievements", question: 30, apply: (d, v) => { d.ncc.achievements = v; } },
];

/** Labels valid anywhere on the form. */
const GLOBAL_LABELS: readonly FieldLabel[] = [
  { label: "Selection Board No", question: 1, apply: (d, v) => { d.header.selectionBoardNo = v; } },
  { label: "City", question: 1, apply: (d, v) => { d.header.city = v; } },
  { label: "UPSC Roll Number", question: 2, apply: (d, v) => { d.header.upscRollNumber = v; } },
  {
    label: "Entry",
    question: 3,
    requiresQuestionNumber: 3,
    apply: (d, v) => { d.header.entry = v; },
  },
  { label: "Batch Number", question: 4, apply: (d, v) => { d.header.batchNumber = v; } },
  { label: "Chest Number", question: 5, apply: (d, v) => { d.header.chestNumber = v; } },
  {
    label: "Choice of Service",
    question: 6,
    apply: (d, v) => {
      // The form asks this twice; after the SSB section it belongs to Q31.
      if (d.inPreviousSsbSection) d.previousSsb.choiceOfService = v;
      else d.header.choiceOfService = v;
    },
  },
  {
    label: "Name in block capitals as in the Application Form",
    question: 7,
    apply: (d, v) => { d.personal.name = v; },
  },
  { label: "Name", question: 7, apply: (d, v) => { d.personal.name = v; } },
  {
    label: "Date of birth",
    question: 8,
    apply: (d, v) => {
      const [day, month, year] = extractLabelled(v, ["Day", "Month", "Year"]);
      d.personal.dateOfBirth = { text: v, day, month, year };
    },
  },
  {
    label: "Age",
    question: 9,
    apply: (d, v) => {
      const [years, months] = extractLabelled(v, ["Years", "Months"]);
      d.personal.age = { text: v, years, months };
    },
  },
  { label: "Gender Male/Female", question: 10, apply: (d, v) => { d.personal.gender = v; } },
  { label: "Gender", question: 10, apply: (d, v) => { d.personal.gender = v; } },
  { label: "Height", question: 11, apply: (d, v) => { d.personal.height = v; } },
  { label: "Weight", question: 12, apply: (d, v) => { d.personal.weight = v; } },
  { label: "Marital Status Married/Single/Widower", question: 13, apply: (d, v) => { d.personal.maritalStatus = v; } },
  { label: "Marital Status", question: 13, apply: (d, v) => { d.personal.maritalStatus = v; } },
  { label: "Religion Hinduism / Christianity / Islam / Sikhism / Other", question: 14, apply: (d, v) => { d.personal.religion = v; } },
  { label: "Religion", question: 14, apply: (d, v) => { d.personal.religion = v; } },
  { label: "Mother Tongue", question: 15, apply: (d, v) => { d.personal.motherTongue = v; } },
  { label: "Community General / OBC /SC/ST", question: 16, apply: (d, v) => { d.personal.community = v; } },
  { label: "Community", question: 16, apply: (d, v) => { d.personal.community = v; } },
  {
    label: "Place of maximum residence (with state)",
    question: 17,
    apply: (d, v) => { d.personal.placeOfMaximumResidence = v; },
  },
  {
    label: "Place of maximum residence",
    question: 17,
    apply: (d, v) => { d.personal.placeOfMaximumResidence = v; },
  },
  {
    label: "Present address (including state) with approximate population (in lacs) of city/town/village",
    question: 18,
    apply: (d, v) => {
      d.personal.presentAddress = v;
      d.lastAddress = "present";
      d.continuation = "presentAddress";
    },
  },
  {
    label: "Present address (including state)",
    question: 18,
    apply: (d, v) => {
      d.personal.presentAddress = v;
      d.lastAddress = "present";
      d.continuation = "presentAddress";
    },
  },
  {
    label: "Present address",
    question: 18,
    apply: (d, v) => {
      d.personal.presentAddress = v;
      d.lastAddress = "present";
      d.continuation = "presentAddress";
    },
  },
  {
    label: "Permanent address (including state)",
    question: 19,
    apply: (d, v) => {
      d.personal.permanentAddress = v;
      d.lastAddress = "permanent";
      d.continuation = "permanentAddress";
    },
  },
  {
    label: "Permanent address",
    question: 19,
    apply: (d, v) => {
      d.personal.permanentAddress = v;
      d.lastAddress = "permanent";
      d.continuation = "permanentAddress";
    },
  },
  {
    label: "Population in Lacs",
    question: 18,
    apply: (d, v) => {
      if (d.lastAddress === "permanent") d.personal.permanentAddressPopulationInLacs = v;
      else d.personal.presentAddressPopulationInLacs = v;
    },
  },
  { label: "Parents alive? Yes/No", question: 21, apply: (d, v) => { d.family.parentsAlive = v; } },
  { label: "Parents alive", question: 21, apply: (d, v) => { d.family.parentsAlive = v; } },
  {
    label: "If parents not alive your age at the time of their death",
    question: 21,
    apply: (d, v) => { d.family.ageAtTimeOfParentsDeath = v; },
  },
  {
    label: "your age at the time of their death",
    question: 21,
    apply: (d, v) => { d.family.ageAtTimeOfParentsDeath = v; },
  },
  {
    label: "Candidate's present occupation Govt / private / self-employed",
    question: 22,
    apply: (d, v) => { d.presentOccupation.occupation = v; },
  },
  {
    label: "Candidate's present occupation",
    question: 22,
    apply: (d, v) => { d.presentOccupation.occupation = v; },
  },
  {
    label: "Income per Month",
    question: 22,
    apply: (d, v) => { d.presentOccupation.incomePerMonth = v; },
  },
  {
    label: "Designation /appointment",
    question: 22,
    apply: (d, v) => { d.presentOccupation.designationAppointment = v; },
  },
  {
    label: "Department / firm",
    question: 22,
    apply: (d, v) => { d.presentOccupation.departmentFirm = v; },
  },
  {
    label: "Position of Responsibility /Appointments Held in NCC/Scouting/ Sports /Sports Teams /Extra curricular Group and in any other field",
    question: 30,
    apply: (d, v) => {
      d.ncc.positionsOfResponsibility.push(v);
      d.continuation = "positions";
    },
  },
  {
    label: "Position of Responsibility",
    question: 30,
    apply: (d, v) => {
      d.ncc.positionsOfResponsibility.push(v);
      d.continuation = "positions";
    },
  },
  {
    label: "Positions of Responsibility",
    question: 30,
    apply: (d, v) => {
      d.ncc.positionsOfResponsibility.push(v);
      d.continuation = "positions";
    },
  },
  {
    label: "Appointments Held",
    question: 30,
    apply: (d, v) => {
      d.ncc.positionsOfResponsibility.push(v);
      d.continuation = "positions";
    },
  },
  {
    label: "Nature of commission applied for",
    question: 31,
    apply: (d, v) => {
      d.previousSsb.natureOfCommissionAppliedFor = v;
      d.inPreviousSsbSection = true;
    },
  },
  {
    label: "Number of chances availed for commission in Armed forces",
    question: 32,
    apply: (d, v) => { d.previousSsb.numberOfChancesAvailed = v; },
  },
  {
    // The form's own text layer misspells this as "Amed forces".
    label: "Number of chances availed for commission in Amed forces",
    question: 32,
    apply: (d, v) => { d.previousSsb.numberOfChancesAvailed = v; },
  },
  { label: "Number of chances availed", question: 32, apply: (d, v) => { d.previousSsb.numberOfChancesAvailed = v; } },
  { label: "Dated", question: 0, apply: (d, v) => { d.declaration.dated = v; } },
];

type SchoolScalarKey = Exclude<keyof SchoolDraft, "subjects" | "questionNumber" | "qualification">;
type DegreeScalarKey = Exclude<keyof DegreeDraft, "semesters" | "questionNumber" | "qualification">;

function assignSchool(draft: Draft, key: SchoolScalarKey, value: string): void {
  const school = currentSchool(draft);
  if (!school) return;
  school[key] = value;
  draft.populated.add(school.questionNumber);
}

function assignDegree(draft: Draft, key: DegreeScalarKey, value: string): void {
  const degree = currentDegree(draft);
  if (!degree) return;
  degree[key] = value;
  draft.populated.add(degree.questionNumber);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

interface CompiledLabel {
  readonly words: readonly string[];
  readonly spec: FieldLabel;
}

/** Compiled once, sorted longest-first so the most specific label wins. */
function compile(labels: readonly FieldLabel[]): readonly CompiledLabel[] {
  return labels
    .map((spec) => ({ words: labelWords(spec.label), spec }))
    .sort((a, b) => b.words.length - a.words.length);
}

const COMPILED_GLOBAL = compile(GLOBAL_LABELS);
const COMPILED_SCHOOL = compile(SCHOOL_LABELS);
const COMPILED_DEGREE = compile(DEGREE_LABELS);
const COMPILED_NCC = compile(NCC_LABELS);

const COMPILED_BLOCKS = BLOCK_HEADINGS.map((heading) => ({
  words: labelWords(heading.label),
  heading,
})).sort((a, b) => b.words.length - a.words.length);

function tokensStartWith(tokens: readonly Token[], words: readonly string[]): boolean {
  if (words.length === 0 || tokens.length < words.length) return false;
  for (let index = 0; index < words.length; index += 1) {
    if (tokens[index].word !== words[index]) return false;
  }
  return true;
}

/** Strips a leading "12." or "12)" and reports the number it carried. */
function takeQuestionNumber(line: string): { rest: string; questionNumber: number | null } {
  const match = /^\s*(\d{1,2})[.)]\s*/.exec(line);
  if (!match) return { rest: line, questionNumber: null };
  return { rest: line.slice(match[0].length), questionNumber: Number(match[1]) };
}

/**
 * Splits "11. Height 170 cm 12. Weight 65 kg" into two segments.
 *
 * A split happens only where a `<number>.` is immediately followed by a known
 * label, so a value that merely contains a number is left intact.
 */
function splitNumberedFields(line: string): string[] {
  const boundaries: number[] = [];
  const pattern = /(?:^|\s)(\d{1,2})[.)]\s+/g;

  let match = pattern.exec(line);
  while (match !== null) {
    const start = match.index === 0 ? 0 : match.index + 1;
    if (start > 0) {
      const tokens = tokenize(line.slice(match.index + match[0].length));
      const known =
        COMPILED_GLOBAL.some((entry) => tokensStartWith(tokens, entry.words)) ||
        COMPILED_BLOCKS.some((entry) => tokensStartWith(tokens, entry.words));
      if (known) boundaries.push(start);
    }
    match = pattern.exec(line);
  }

  if (boundaries.length === 0) return [line];

  const segments: string[] = [];
  let previous = 0;
  for (const boundary of boundaries) {
    segments.push(line.slice(previous, boundary));
    previous = boundary;
  }
  segments.push(line.slice(previous));
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Column headings, so a repeated header row is skipped rather than stored. */
const TABLE_HEADER_FIRST_CELLS = new Set([
  "relation",
  "ser no",
  "serno",
  "ser",
  "subject",
  "year semester",
  "yearsemester",
  "year",
]);

function looksLikeHeaderRow(cells: readonly string[]): boolean {
  const first = (cells[0] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (TABLE_HEADER_FIRST_CELLS.has(first)) {
    // "Year" alone is a heading only when the rest of the row is headings too.
    const joined = cells.join(" ").toLowerCase();
    return (
      first !== "year" ||
      joined.includes("semester") ||
      joined.includes("theroy") ||
      joined.includes("theory")
    );
  }
  return false;
}

function marksCellsFrom(cells: readonly string[], offset: number) {
  return {
    maxMarks: cleanCell(cells[offset]),
    marksObtained: cleanCell(cells[offset + 1]),
    percentage: cleanCell(cells[offset + 2]),
  };
}

function marksRowFrom(cells: readonly string[], sourceLine: number): PIQMarksRow {
  return {
    label: cleanCell(cells[0]) ?? "",
    theory: cells.length > 1 ? marksCellsFrom(cells, 1) : emptyMarksCell(),
    practical: cells.length > 4 ? marksCellsFrom(cells, 4) : emptyMarksCell(),
    total: cells.length > 7 ? marksCellsFrom(cells, 7) : emptyMarksCell(),
    outstandingAchievements: cleanCell(cells[10]),
    sourceLine,
  };
}

function handleTableRow(draft: Draft, cells: readonly string[], sourceLine: number): boolean {
  switch (draft.block) {
    case "family": {
      const relation = cleanCell(cells[0]);
      if (relation === null) return false;
      draft.family.members.push({
        relation,
        name: cleanCell(cells[1]),
        ageYears: cleanCell(cells[2]),
        education: cleanCell(cells[3]),
        occupation: cleanCell(cells[4]),
        incomePerMonth: cleanCell(cells[5]),
        sourceLine,
      });
      draft.populated.add(20);
      return true;
    }
    case "school": {
      const school = currentSchool(draft);
      if (!school) return false;
      school.subjects.push(marksRowFrom(cells, sourceLine));
      draft.populated.add(school.questionNumber);
      return true;
    }
    case "degree": {
      const degree = currentDegree(draft);
      if (!degree) return false;
      degree.semesters.push(marksRowFrom(cells, sourceLine));
      draft.populated.add(degree.questionNumber);
      return true;
    }
    case "sports": {
      draft.sports.push({
        serNo: cleanCell(cells[0]),
        sportOrGamePlayed: cleanCell(cells[1]),
        periodFrom: cleanCell(cells[2]),
        periodTo: cleanCell(cells[3]),
        levelAtWhichPlayed: cleanCell(cells[4]),
        levelForServiceCandidates: cleanCell(cells[5]),
        specialAchievements: cleanCell(cells[6]),
        sourceLine,
      });
      draft.populated.add(27);
      return true;
    }
    case "hobbies": {
      draft.hobbies.push({
        serNo: cleanCell(cells[0]),
        hobby: cleanCell(cells[1]),
        periodFrom: cleanCell(cells[2]),
        periodTo: cleanCell(cells[3]),
        levelAtWhichParticipated: cleanCell(cells[4]),
        specialAchievements: cleanCell(cells[5]),
        sourceLine,
      });
      draft.populated.add(28);
      return true;
    }
    case "extracurricular": {
      draft.extracurricular.push({
        serNo: cleanCell(cells[0]),
        extracurricularActivity: cleanCell(cells[1]),
        periodFrom: cleanCell(cells[2]),
        periodTo: cleanCell(cells[3]),
        levelAtWhichParticipated: cleanCell(cells[4]),
        specialAchievements: cleanCell(cells[5]),
        sourceLine,
      });
      draft.populated.add(29);
      return true;
    }
    case "ssb-attempts": {
      draft.previousSsb.attempts.push({
        serNo: cleanCell(cells[0]),
        ssb: cleanCell(cells[1]),
        entry: cleanCell(cells[2]),
        placesOfSsb: cleanCell(cells[3]),
        date: cleanCell(cells[4]),
        batchAndChestNo: cleanCell(cells[5]),
        result: cleanCell(cells[6]),
        sourceLine,
      });
      draft.populated.add(33);
      return true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Line handling
// ---------------------------------------------------------------------------

function matchFieldLabel(
  draft: Draft,
  rest: string,
  questionNumber: number | null,
): boolean {
  const tokens = tokenize(rest);
  if (tokens.length === 0) return false;

  const scoped: readonly CompiledLabel[] =
    draft.block === "school"
      ? COMPILED_SCHOOL
      : draft.block === "degree"
        ? COMPILED_DEGREE
        : draft.block === "ncc"
          ? COMPILED_NCC
          : [];

  for (const candidates of [scoped, COMPILED_GLOBAL]) {
    const isGlobal = candidates === COMPILED_GLOBAL;

    for (const entry of candidates) {
      if (
        entry.spec.requiresQuestionNumber !== undefined &&
        entry.spec.requiresQuestionNumber !== questionNumber
      ) {
        continue;
      }
      if (!tokensStartWith(tokens, entry.words)) continue;

      const after = rest.slice(tokens[entry.words.length - 1].end);

      // A one-word global label — "Name", "Age", "City", "Height" — is a prefix
      // of a great deal of ordinary prose, and matching it on sight would file
      // "Name of my favourite book" as the candidate's name. So it counts only
      // when the line either punctuates the label ("Name: ...") or carries that
      // question's own number ("7. Name ..."), which is how the blank form
      // presents it. Longer labels are specific enough to stand on their own,
      // and labels scoped to a block are drawn from a small, unambiguous set.
      if (isGlobal && entry.words.length === 1 && entry.spec.question !== questionNumber) {
        if (!/^\s*[:;.,–—-]/.test(after) && after.trim().length > 0) continue;
      }

      const value = cleanValue(after);
      // A recognised label with a blank value still closes any continuation:
      // the previous field has ended even though this one is empty.
      draft.continuation = null;
      if (value === null) return true;

      entry.spec.apply(draft, value);
      if (entry.spec.question > 0) draft.populated.add(entry.spec.question);
      return true;
    }
  }

  return false;
}

function appendContinuation(draft: Draft, text: string): boolean {
  switch (draft.continuation) {
    case "presentAddress":
      draft.personal.presentAddress =
        draft.personal.presentAddress === null ? text : `${draft.personal.presentAddress} ${text}`;
      draft.populated.add(18);
      return true;
    case "permanentAddress":
      draft.personal.permanentAddress =
        draft.personal.permanentAddress === null
          ? text
          : `${draft.personal.permanentAddress} ${text}`;
      draft.populated.add(19);
      return true;
    case "positions":
      draft.ncc.positionsOfResponsibility.push(text);
      draft.populated.add(30);
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parsePIQText(
  text: string,
  options: ParsePIQOptions = {},
): CandidateProfile {
  const draft = newDraft();
  const lines = text.split(/\r\n|\r|\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const sourceLine = index + 1;
    const rawLine = lines[index].trim();
    if (rawLine.length === 0) continue;

    // Section banners first: one of them contains pipe characters and would
    // otherwise be mistaken for a table row.
    // Matched as a prefix, because the form's banners carry trailing
    // parentheticals such as "(COMMEENCING FROM MATRICULATION ...)".
    const bannerWords = labelWords(rawLine).join(" ");
    const banner = SECTION_HEADINGS.find((heading) => bannerWords.startsWith(heading.words));
    if (banner) {
      if (banner.previousSsb) draft.inPreviousSsbSection = true;
      draft.block = "none";
      draft.continuation = null;
      continue;
    }

    if (rawLine.includes("|")) {
      const cells = rawLine.split("|").map((cell) => cell.trim());
      draft.continuation = null;
      if (looksLikeHeaderRow(cells)) continue;
      if (handleTableRow(draft, cells, sourceLine)) continue;
      draft.unparsed.push({ text: rawLine, sourceLine });
      continue;
    }

    for (const segment of splitNumberedFields(rawLine)) {
      const { rest, questionNumber } = takeQuestionNumber(segment);
      const trimmedRest = rest.trim();
      if (trimmedRest.length === 0) continue;

      const blockTokens = tokenize(trimmedRest);
      const blockEntry = COMPILED_BLOCKS.find((entry) =>
        tokensStartWith(blockTokens, entry.words),
      );
      if (blockEntry) {
        // Only treat it as a block heading when nothing meaningful follows it,
        // so "Graduation: 2024" is a value rather than a new section.
        const trailing = cleanValue(
          trimmedRest.slice(blockTokens[blockEntry.words.length - 1].end),
        );
        if (trailing === null) {
          blockEntry.heading.open(draft);
          draft.continuation = null;
          continue;
        }
      }

      if (matchFieldLabel(draft, trimmedRest, questionNumber)) continue;
      if (appendContinuation(draft, trimmedRest)) continue;

      draft.unparsed.push({ text: segment.trim(), sourceLine });
    }
  }

  const toSchool = (school: SchoolDraft | null): PIQSchoolQualification | null =>
    school === null ? null : { ...school, subjects: school.subjects };
  const toDegree = (degree: DegreeDraft | null): PIQDegreeQualification | null =>
    degree === null ? null : { ...degree, semesters: degree.semesters };

  return {
    metadata: {
      profileVersion: PROFILE_VERSION,
      source: options.source ?? "piq-upload",
      parsedAt: options.parsedAt ?? null,
      completeness: summariseCompleteness(draft.populated, draft.unparsed.length),
    },
    header: draft.header,
    personal: draft.personal,
    family: draft.family,
    presentOccupation: draft.presentOccupation,
    education: {
      matricHigherSecondary: toSchool(draft.school23),
      seniorSecondary: toSchool(draft.school24),
      graduation: toDegree(draft.degree25),
      postGraduation: toDegree(draft.degree26),
    },
    sports: draft.sports,
    hobbies: draft.hobbies,
    extracurricularActivities: draft.extracurricular,
    ncc: draft.ncc,
    previousSsb: draft.previousSsb,
    declaration: draft.declaration,
    unparsed: draft.unparsed,
  };
}
