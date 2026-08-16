import type { CandidateProfile } from "@/lib/interview/profile/profile";

/**
 * The review model: what the candidate sees after their PIQ has been read, and
 * how their corrections are written back.
 *
 * This module is deliberately free of React and of `server-only` — it is plain
 * data and pure functions, so the browser can use it and a test can exercise
 * every rule without rendering anything. Only *types* are imported from the
 * profile schema, which erase at compile time.
 *
 * The important idea here is the difference between a field the form leaves
 * BLANK and a field whose options the form PRINTS. A blank that came back empty
 * simply was not filled in. A printed choice — "Male/Female", "Yes/No",
 * "A/B/C" — that came back empty means the candidate ringed one on paper and
 * the mark is not text, so no amount of extraction will ever recover it. Those
 * fields must be put to the candidate, never guessed. `printedChoice` is what
 * separates the two, and nothing in this file ever picks a default for one.
 */

export type ReviewSectionId =
  | "header"
  | "personal"
  | "family"
  | "presentOccupation"
  | "education"
  | "sports"
  | "hobbies"
  | "extracurricular"
  | "ncc"
  | "previousSsb"
  | "declaration";

export interface ReviewSectionMeta {
  readonly id: ReviewSectionId;
  readonly title: string;
  /** The questions of the form this section covers. */
  readonly questions: string;
}

/** Section order follows the form, so the review reads like the document. */
export const REVIEW_SECTIONS: readonly ReviewSectionMeta[] = [
  { id: "header", title: "Application details", questions: "Q1–Q6" },
  { id: "personal", title: "Personal details", questions: "Q7–Q19" },
  { id: "family", title: "Family", questions: "Q20–Q21" },
  { id: "presentOccupation", title: "Your occupation", questions: "Q22" },
  { id: "education", title: "Education", questions: "Q23–Q26" },
  { id: "sports", title: "Sports", questions: "Q27" },
  { id: "hobbies", title: "Hobbies and interests", questions: "Q28" },
  { id: "extracurricular", title: "Extra-curricular activities", questions: "Q29" },
  { id: "ncc", title: "NCC and appointments", questions: "Q30" },
  { id: "previousSsb", title: "Previous SSB attendance", questions: "Q31–Q33" },
  { id: "declaration", title: "Declaration", questions: "Dated" },
];

/**
 * - `extracted` — a value was read from the PDF; the candidate may correct it.
 * - `needs-confirmation` — a printed choice the PDF cannot express. Must be
 *   answered by the candidate; never inferred.
 * - `blank` — an ordinary empty field. Optional to fill.
 */
export type FieldStatus = "extracted" | "needs-confirmation" | "blank";

export interface ReviewField {
  readonly id: string;
  readonly label: string;
  readonly section: ReviewSectionId;
  /** Sub-heading within a section, e.g. which qualification a field belongs to. */
  readonly group: string | null;
  /** The options the form prints. Empty for a free-text field. */
  readonly options: readonly string[];
  /** True when the form prints options instead of a blank line. */
  readonly printedChoice: boolean;
  readonly value: string | null;
  readonly status: FieldStatus;
}

interface FieldDescriptor {
  readonly id: string;
  readonly label: string;
  readonly section: ReviewSectionId;
  readonly group?: string;
  readonly options?: readonly string[];
  readonly printedChoice?: boolean;
  readonly read: (profile: CandidateProfile) => string | null;
  readonly write: (profile: CandidateProfile, value: string | null) => CandidateProfile;
}

// ---------------------------------------------------------------------------
// Option lists, transcribed from the form
// ---------------------------------------------------------------------------

const GENDER = ["Male", "Female"] as const;
const MARITAL_STATUS = ["Married", "Single", "Widower"] as const;
const COMMUNITY = ["General", "OBC", "SC", "ST"] as const;
const RELIGION = ["Hinduism", "Christianity", "Islam", "Sikhism", "Other"] as const;
const YES_NO = ["Yes", "No"] as const;
const OCCUPATION_TYPE = ["Govt", "Private", "Self-employed"] as const;
const NCC_WING = ["Army", "Navy", "Air Force"] as const;
const NCC_DIVISION = ["Senior", "Junior"] as const;
const NCC_CERTIFICATE = ["A", "B", "C"] as const;
const BOARD = ["CBSE", "ICSE", "State Board", "Other"] as const;
const INSTITUTION_TYPE = ["Govt", "Private"] as const;
const MEDIUM = ["English", "Hindi", "Regional"] as const;
const RESIDENCE = ["Day scholar", "Boarder"] as const;
const PROGRESS = ["Pursuing", "Completed"] as const;
const GRADUATION_COURSE = ["BTech", "BE", "B.Sc", "B.Com", "BA"] as const;
const POST_GRADUATION_COURSE = ["MTech", "M.E", "M.Sc", "M.Com", "MA"] as const;

// ---------------------------------------------------------------------------
// Small helpers for writing into the frozen profile shape
// ---------------------------------------------------------------------------

function withPersonal(
  profile: CandidateProfile,
  patch: Partial<CandidateProfile["personal"]>,
): CandidateProfile {
  return { ...profile, personal: { ...profile.personal, ...patch } };
}

function withHeader(
  profile: CandidateProfile,
  patch: Partial<CandidateProfile["header"]>,
): CandidateProfile {
  return { ...profile, header: { ...profile.header, ...patch } };
}

function withNcc(
  profile: CandidateProfile,
  patch: Partial<CandidateProfile["ncc"]>,
): CandidateProfile {
  return { ...profile, ncc: { ...profile.ncc, ...patch } };
}

/** Q8 and Q9 are split into parts on the form, so each part is its own field. */
function writeDatePart(
  profile: CandidateProfile,
  part: "day" | "month" | "year",
  value: string | null,
): CandidateProfile {
  const current = profile.personal.dateOfBirth ?? {
    text: "",
    day: null,
    month: null,
    year: null,
  };
  return withPersonal(profile, { dateOfBirth: { ...current, [part]: value } });
}

function writeAgePart(
  profile: CandidateProfile,
  part: "years" | "months",
  value: string | null,
): CandidateProfile {
  const current = profile.personal.age ?? { text: "", years: null, months: null };
  return withPersonal(profile, { age: { ...current, [part]: value } });
}

type SchoolKey = "matricHigherSecondary" | "seniorSecondary";
type DegreeKey = "graduation" | "postGraduation";

function writeSchool(
  profile: CandidateProfile,
  key: SchoolKey,
  patch: Partial<NonNullable<CandidateProfile["education"][SchoolKey]>>,
): CandidateProfile {
  const record = profile.education[key];
  if (!record) return profile;
  return {
    ...profile,
    education: { ...profile.education, [key]: { ...record, ...patch } },
  };
}

function writeDegree(
  profile: CandidateProfile,
  key: DegreeKey,
  patch: Partial<NonNullable<CandidateProfile["education"][DegreeKey]>>,
): CandidateProfile {
  const record = profile.education[key];
  if (!record) return profile;
  return {
    ...profile,
    education: { ...profile.education, [key]: { ...record, ...patch } },
  };
}

// ---------------------------------------------------------------------------
// Field descriptors
// ---------------------------------------------------------------------------

const HEADER_FIELDS: readonly FieldDescriptor[] = [
  {
    id: "header.selectionBoardNo",
    label: "Selection Board No.",
    section: "header",
    read: (p) => p.header.selectionBoardNo,
    write: (p, v) => withHeader(p, { selectionBoardNo: v }),
  },
  {
    id: "header.city",
    label: "City",
    section: "header",
    read: (p) => p.header.city,
    write: (p, v) => withHeader(p, { city: v }),
  },
  {
    id: "header.upscRollNumber",
    label: "UPSC Roll Number",
    section: "header",
    read: (p) => p.header.upscRollNumber,
    write: (p, v) => withHeader(p, { upscRollNumber: v }),
  },
  {
    id: "header.entry",
    label: "Entry",
    section: "header",
    read: (p) => p.header.entry,
    write: (p, v) => withHeader(p, { entry: v }),
  },
  {
    id: "header.batchNumber",
    label: "Batch Number",
    section: "header",
    read: (p) => p.header.batchNumber,
    write: (p, v) => withHeader(p, { batchNumber: v }),
  },
  {
    id: "header.chestNumber",
    label: "Chest Number",
    section: "header",
    read: (p) => p.header.chestNumber,
    write: (p, v) => withHeader(p, { chestNumber: v }),
  },
  {
    id: "header.choiceOfService",
    label: "Choice of Service",
    section: "header",
    read: (p) => p.header.choiceOfService,
    write: (p, v) => withHeader(p, { choiceOfService: v }),
  },
];

const PERSONAL_FIELDS: readonly FieldDescriptor[] = [
  {
    id: "personal.name",
    label: "Name (as in the application form)",
    section: "personal",
    read: (p) => p.personal.name,
    write: (p, v) => withPersonal(p, { name: v }),
  },
  {
    id: "personal.dateOfBirth.day",
    label: "Date of birth — day",
    section: "personal",
    read: (p) => p.personal.dateOfBirth?.day ?? null,
    write: (p, v) => writeDatePart(p, "day", v),
  },
  {
    id: "personal.dateOfBirth.month",
    label: "Date of birth — month",
    section: "personal",
    read: (p) => p.personal.dateOfBirth?.month ?? null,
    write: (p, v) => writeDatePart(p, "month", v),
  },
  {
    id: "personal.dateOfBirth.year",
    label: "Date of birth — year",
    section: "personal",
    read: (p) => p.personal.dateOfBirth?.year ?? null,
    write: (p, v) => writeDatePart(p, "year", v),
  },
  {
    id: "personal.age.years",
    label: "Age — years",
    section: "personal",
    read: (p) => p.personal.age?.years ?? null,
    write: (p, v) => writeAgePart(p, "years", v),
  },
  {
    id: "personal.age.months",
    label: "Age — months",
    section: "personal",
    read: (p) => p.personal.age?.months ?? null,
    write: (p, v) => writeAgePart(p, "months", v),
  },
  {
    id: "personal.gender",
    label: "Gender",
    section: "personal",
    options: GENDER,
    printedChoice: true,
    read: (p) => p.personal.gender,
    write: (p, v) => withPersonal(p, { gender: v }),
  },
  {
    id: "personal.height",
    label: "Height (cm)",
    section: "personal",
    read: (p) => p.personal.height,
    write: (p, v) => withPersonal(p, { height: v }),
  },
  {
    id: "personal.weight",
    label: "Weight (kg)",
    section: "personal",
    read: (p) => p.personal.weight,
    write: (p, v) => withPersonal(p, { weight: v }),
  },
  {
    id: "personal.maritalStatus",
    label: "Marital status",
    section: "personal",
    options: MARITAL_STATUS,
    printedChoice: true,
    read: (p) => p.personal.maritalStatus,
    write: (p, v) => withPersonal(p, { maritalStatus: v }),
  },
  {
    id: "personal.religion",
    label: "Religion",
    section: "personal",
    options: RELIGION,
    printedChoice: true,
    read: (p) => p.personal.religion,
    write: (p, v) => withPersonal(p, { religion: v }),
  },
  {
    id: "personal.motherTongue",
    label: "Mother tongue",
    section: "personal",
    read: (p) => p.personal.motherTongue,
    write: (p, v) => withPersonal(p, { motherTongue: v }),
  },
  {
    id: "personal.community",
    label: "Community",
    section: "personal",
    options: COMMUNITY,
    printedChoice: true,
    read: (p) => p.personal.community,
    write: (p, v) => withPersonal(p, { community: v }),
  },
  {
    id: "personal.placeOfMaximumResidence",
    label: "Place of maximum residence (with state)",
    section: "personal",
    read: (p) => p.personal.placeOfMaximumResidence,
    write: (p, v) => withPersonal(p, { placeOfMaximumResidence: v }),
  },
  {
    id: "personal.presentAddress",
    label: "Present address (including state)",
    section: "personal",
    read: (p) => p.personal.presentAddress,
    write: (p, v) => withPersonal(p, { presentAddress: v }),
  },
  {
    id: "personal.presentAddressPopulationInLacs",
    label: "Present address — population (in lacs)",
    section: "personal",
    read: (p) => p.personal.presentAddressPopulationInLacs,
    write: (p, v) => withPersonal(p, { presentAddressPopulationInLacs: v }),
  },
  {
    id: "personal.permanentAddress",
    label: "Permanent address (including state)",
    section: "personal",
    read: (p) => p.personal.permanentAddress,
    write: (p, v) => withPersonal(p, { permanentAddress: v }),
  },
  {
    id: "personal.permanentAddressPopulationInLacs",
    label: "Permanent address — population (in lacs)",
    section: "personal",
    read: (p) => p.personal.permanentAddressPopulationInLacs,
    write: (p, v) => withPersonal(p, { permanentAddressPopulationInLacs: v }),
  },
];

const FAMILY_FIELDS: readonly FieldDescriptor[] = [
  {
    id: "family.parentsAlive",
    label: "Parents alive?",
    section: "family",
    options: YES_NO,
    printedChoice: true,
    read: (p) => p.family.parentsAlive,
    write: (p, v) => ({ ...p, family: { ...p.family, parentsAlive: v } }),
  },
  {
    id: "family.ageAtTimeOfParentsDeath",
    label: "If not, your age at the time of their death (years)",
    section: "family",
    read: (p) => p.family.ageAtTimeOfParentsDeath,
    write: (p, v) => ({ ...p, family: { ...p.family, ageAtTimeOfParentsDeath: v } }),
  },
];

const OCCUPATION_FIELDS: readonly FieldDescriptor[] = [
  {
    id: "presentOccupation.occupation",
    label: "Present occupation",
    section: "presentOccupation",
    options: OCCUPATION_TYPE,
    printedChoice: true,
    read: (p) => p.presentOccupation.occupation,
    write: (p, v) => ({
      ...p,
      presentOccupation: { ...p.presentOccupation, occupation: v },
    }),
  },
  {
    id: "presentOccupation.incomePerMonth",
    label: "Income per month",
    section: "presentOccupation",
    read: (p) => p.presentOccupation.incomePerMonth,
    write: (p, v) => ({
      ...p,
      presentOccupation: { ...p.presentOccupation, incomePerMonth: v },
    }),
  },
  {
    id: "presentOccupation.designationAppointment",
    label: "Designation / appointment",
    section: "presentOccupation",
    read: (p) => p.presentOccupation.designationAppointment,
    write: (p, v) => ({
      ...p,
      presentOccupation: { ...p.presentOccupation, designationAppointment: v },
    }),
  },
  {
    id: "presentOccupation.departmentFirm",
    label: "Department / firm",
    section: "presentOccupation",
    read: (p) => p.presentOccupation.departmentFirm,
    write: (p, v) => ({
      ...p,
      presentOccupation: { ...p.presentOccupation, departmentFirm: v },
    }),
  },
];

const NCC_FIELDS: readonly FieldDescriptor[] = [
  {
    id: "ncc.nccTraining",
    label: "NCC training",
    section: "ncc",
    options: YES_NO,
    printedChoice: true,
    read: (p) => p.ncc.nccTraining,
    write: (p, v) => withNcc(p, { nccTraining: v }),
  },
  {
    id: "ncc.totalTrainingInMonths",
    label: "Total training (months)",
    section: "ncc",
    read: (p) => p.ncc.totalTrainingInMonths,
    write: (p, v) => withNcc(p, { totalTrainingInMonths: v }),
  },
  {
    id: "ncc.wing",
    label: "Wing",
    section: "ncc",
    options: NCC_WING,
    printedChoice: true,
    read: (p) => p.ncc.wing,
    write: (p, v) => withNcc(p, { wing: v }),
  },
  {
    id: "ncc.division",
    label: "Division",
    section: "ncc",
    options: NCC_DIVISION,
    printedChoice: true,
    read: (p) => p.ncc.division,
    write: (p, v) => withNcc(p, { division: v }),
  },
  {
    id: "ncc.certificateObtained",
    label: "Certificate obtained",
    section: "ncc",
    options: NCC_CERTIFICATE,
    printedChoice: true,
    read: (p) => p.ncc.certificateObtained,
    write: (p, v) => withNcc(p, { certificateObtained: v }),
  },
  {
    id: "ncc.achievements",
    label: "Achievements, if any",
    section: "ncc",
    read: (p) => p.ncc.achievements,
    write: (p, v) => withNcc(p, { achievements: v }),
  },
];

const PREVIOUS_SSB_FIELDS: readonly FieldDescriptor[] = [
  {
    id: "previousSsb.natureOfCommissionAppliedFor",
    label: "Nature of commission applied for",
    section: "previousSsb",
    read: (p) => p.previousSsb.natureOfCommissionAppliedFor,
    write: (p, v) => ({
      ...p,
      previousSsb: { ...p.previousSsb, natureOfCommissionAppliedFor: v },
    }),
  },
  {
    id: "previousSsb.choiceOfService",
    label: "Choice of service",
    section: "previousSsb",
    read: (p) => p.previousSsb.choiceOfService,
    write: (p, v) => ({
      ...p,
      previousSsb: { ...p.previousSsb, choiceOfService: v },
    }),
  },
  {
    id: "previousSsb.numberOfChancesAvailed",
    label: "Number of chances availed",
    section: "previousSsb",
    read: (p) => p.previousSsb.numberOfChancesAvailed,
    write: (p, v) => ({
      ...p,
      previousSsb: { ...p.previousSsb, numberOfChancesAvailed: v },
    }),
  },
];

const DECLARATION_FIELDS: readonly FieldDescriptor[] = [
  {
    id: "declaration.dated",
    label: "Dated",
    section: "declaration",
    read: (p) => p.declaration.dated,
    write: (p, v) => ({ ...p, declaration: { dated: v } }),
  },
];

/** Q23 and Q24 share a field set; built per record so absent ones are skipped. */
function schoolFields(key: SchoolKey, group: string): readonly FieldDescriptor[] {
  return [
    {
      id: `education.${key}.nameOfInstitution`,
      label: "Name of institution",
      section: "education",
      group,
      read: (p) => p.education[key]?.nameOfInstitution ?? null,
      write: (p, v) => writeSchool(p, key, { nameOfInstitution: v }),
    },
    {
      id: `education.${key}.locationOfInstitution`,
      label: "Location of institution",
      section: "education",
      group,
      read: (p) => p.education[key]?.locationOfInstitution ?? null,
      write: (p, v) => writeSchool(p, key, { locationOfInstitution: v }),
    },
    {
      id: `education.${key}.nameOfBoard`,
      label: "Name of board",
      section: "education",
      group,
      options: BOARD,
      printedChoice: true,
      read: (p) => p.education[key]?.nameOfBoard ?? null,
      write: (p, v) => writeSchool(p, key, { nameOfBoard: v }),
    },
    {
      id: `education.${key}.typeOfInstitution`,
      label: "Type of institution",
      section: "education",
      group,
      options: INSTITUTION_TYPE,
      printedChoice: true,
      read: (p) => p.education[key]?.typeOfInstitution ?? null,
      write: (p, v) => writeSchool(p, key, { typeOfInstitution: v }),
    },
    {
      id: `education.${key}.mediumOfInstruction`,
      label: "Medium of instruction",
      section: "education",
      group,
      options: MEDIUM,
      printedChoice: true,
      read: (p) => p.education[key]?.mediumOfInstruction ?? null,
      write: (p, v) => writeSchool(p, key, { mediumOfInstruction: v }),
    },
    {
      id: `education.${key}.dayScholarOrBoarder`,
      label: "Day scholar or boarder",
      section: "education",
      group,
      options: RESIDENCE,
      printedChoice: true,
      read: (p) => p.education[key]?.dayScholarOrBoarder ?? null,
      write: (p, v) => writeSchool(p, key, { dayScholarOrBoarder: v }),
    },
    {
      id: `education.${key}.yearOfPassing`,
      label: "Year of passing",
      section: "education",
      group,
      read: (p) => p.education[key]?.yearOfPassing ?? null,
      write: (p, v) => writeSchool(p, key, { yearOfPassing: v }),
    },
    {
      id: `education.${key}.overallPercentageOfMarks`,
      label: "Overall percentage of marks",
      section: "education",
      group,
      read: (p) => p.education[key]?.overallPercentageOfMarks ?? null,
      write: (p, v) => writeSchool(p, key, { overallPercentageOfMarks: v }),
    },
    {
      id: `education.${key}.division`,
      label: "Division",
      section: "education",
      group,
      read: (p) => p.education[key]?.division ?? null,
      write: (p, v) => writeSchool(p, key, { division: v }),
    },
  ];
}

function degreeFields(
  key: DegreeKey,
  group: string,
  courses: readonly string[],
): readonly FieldDescriptor[] {
  return [
    {
      id: `education.${key}.nameOfInstitution`,
      label: "Name of institution",
      section: "education",
      group,
      read: (p) => p.education[key]?.nameOfInstitution ?? null,
      write: (p, v) => writeDegree(p, key, { nameOfInstitution: v }),
    },
    {
      id: `education.${key}.locationOfInstitution`,
      label: "Location of institution",
      section: "education",
      group,
      read: (p) => p.education[key]?.locationOfInstitution ?? null,
      write: (p, v) => writeDegree(p, key, { locationOfInstitution: v }),
    },
    {
      id: `education.${key}.university`,
      label: "University",
      section: "education",
      group,
      read: (p) => p.education[key]?.university ?? null,
      write: (p, v) => writeDegree(p, key, { university: v }),
    },
    {
      id: `education.${key}.course`,
      label: "Course",
      section: "education",
      group,
      options: courses,
      printedChoice: true,
      read: (p) => p.education[key]?.course ?? null,
      write: (p, v) => writeDegree(p, key, { course: v }),
    },
    {
      id: `education.${key}.branchStream`,
      label: "Branch / stream",
      section: "education",
      group,
      read: (p) => p.education[key]?.branchStream ?? null,
      write: (p, v) => writeDegree(p, key, { branchStream: v }),
    },
    {
      id: `education.${key}.yearOfAdmission`,
      label: "Year of admission",
      section: "education",
      group,
      read: (p) => p.education[key]?.yearOfAdmission ?? null,
      write: (p, v) => writeDegree(p, key, { yearOfAdmission: v }),
    },
    {
      id: `education.${key}.pursuingOrCompleted`,
      label: "Pursuing or completed",
      section: "education",
      group,
      options: PROGRESS,
      printedChoice: true,
      read: (p) => p.education[key]?.pursuingOrCompleted ?? null,
      write: (p, v) => writeDegree(p, key, { pursuingOrCompleted: v }),
    },
    {
      id: `education.${key}.yearOfCompletion`,
      label: "Year of completion",
      section: "education",
      group,
      read: (p) => p.education[key]?.yearOfCompletion ?? null,
      write: (p, v) => writeDegree(p, key, { yearOfCompletion: v }),
    },
    {
      id: `education.${key}.dayScholarOrBoarder`,
      label: "Day scholar or boarder",
      section: "education",
      group,
      options: RESIDENCE,
      printedChoice: true,
      read: (p) => p.education[key]?.dayScholarOrBoarder ?? null,
      write: (p, v) => writeDegree(p, key, { dayScholarOrBoarder: v }),
    },
    {
      id: `education.${key}.mediumOfInstruction`,
      label: "Medium of instruction",
      section: "education",
      group,
      options: MEDIUM,
      printedChoice: true,
      read: (p) => p.education[key]?.mediumOfInstruction ?? null,
      write: (p, v) => writeDegree(p, key, { mediumOfInstruction: v }),
    },
    {
      id: `education.${key}.division`,
      label: "Division",
      section: "education",
      group,
      read: (p) => p.education[key]?.division ?? null,
      write: (p, v) => writeDegree(p, key, { division: v }),
    },
    {
      id: `education.${key}.aggregatePercentage`,
      label: "Aggregate percentage",
      section: "education",
      group,
      read: (p) => p.education[key]?.aggregatePercentage ?? null,
      write: (p, v) => writeDegree(p, key, { aggregatePercentage: v }),
    },
  ];
}

/**
 * Every field the candidate may review, in form order. Education entries appear
 * only for qualifications the upload actually contained.
 */
export function describeFields(profile: CandidateProfile): readonly FieldDescriptor[] {
  const education: FieldDescriptor[] = [];
  if (profile.education.matricHigherSecondary) {
    education.push(...schoolFields("matricHigherSecondary", "Matric / Higher Secondary"));
  }
  if (profile.education.seniorSecondary) {
    education.push(...schoolFields("seniorSecondary", "Senior Secondary / 10+2"));
  }
  if (profile.education.graduation) {
    education.push(...degreeFields("graduation", "Graduation", GRADUATION_COURSE));
  }
  if (profile.education.postGraduation) {
    education.push(
      ...degreeFields("postGraduation", "Post Graduation", POST_GRADUATION_COURSE),
    );
  }

  return [
    ...HEADER_FIELDS,
    ...PERSONAL_FIELDS,
    ...FAMILY_FIELDS,
    ...OCCUPATION_FIELDS,
    ...education,
    ...NCC_FIELDS,
    ...PREVIOUS_SSB_FIELDS,
    ...DECLARATION_FIELDS,
  ];
}

function statusFor(value: string | null, printedChoice: boolean): FieldStatus {
  if (value !== null && value.trim().length > 0) return "extracted";
  return printedChoice ? "needs-confirmation" : "blank";
}

/** The reviewable fields with their current values and status. Pure. */
export function buildReviewFields(profile: CandidateProfile): readonly ReviewField[] {
  return describeFields(profile).map((descriptor) => {
    const value = descriptor.read(profile);
    const printedChoice = descriptor.printedChoice ?? false;
    return {
      id: descriptor.id,
      label: descriptor.label,
      section: descriptor.section,
      group: descriptor.group ?? null,
      options: descriptor.options ?? [],
      printedChoice,
      value,
      status: statusFor(value, printedChoice),
    };
  });
}

/** Fields the candidate must answer because the page cannot express them. */
export function fieldsNeedingConfirmation(
  profile: CandidateProfile,
): readonly ReviewField[] {
  return buildReviewFields(profile).filter(
    (field) => field.status === "needs-confirmation",
  );
}

/**
 * Applies one correction and returns a new profile.
 *
 * An empty string clears the field back to null rather than storing "", so a
 * cleared value stays indistinguishable from one the form never carried.
 * An unknown id returns the profile untouched — a stale id must never
 * silently write somewhere else.
 */
export function applyCorrection(
  profile: CandidateProfile,
  fieldId: string,
  value: string,
): CandidateProfile {
  const descriptor = describeFields(profile).find((entry) => entry.id === fieldId);
  if (!descriptor) return profile;

  const trimmed = value.trim();
  return descriptor.write(profile, trimmed.length === 0 ? null : trimmed);
}

/** Applies a whole set of corrections, in a stable order. */
export function applyCorrections(
  profile: CandidateProfile,
  corrections: Readonly<Record<string, string>>,
): CandidateProfile {
  return Object.keys(corrections)
    .sort()
    .reduce(
      (current, fieldId) => applyCorrection(current, fieldId, corrections[fieldId]),
      profile,
    );
}

export interface ReviewSummary {
  readonly totalFields: number;
  readonly extracted: number;
  readonly needsConfirmation: number;
  readonly blank: number;
  readonly unparsedLines: number;
  /** True when nothing is left for the candidate to answer. */
  readonly readyToConfirm: boolean;
}

export function summariseReview(profile: CandidateProfile): ReviewSummary {
  const fields = buildReviewFields(profile);
  const needsConfirmation = fields.filter(
    (f) => f.status === "needs-confirmation",
  ).length;

  return {
    totalFields: fields.length,
    extracted: fields.filter((f) => f.status === "extracted").length,
    needsConfirmation,
    blank: fields.filter((f) => f.status === "blank").length,
    unparsedLines: profile.unparsed.length,
    readyToConfirm: needsConfirmation === 0,
  };
}
