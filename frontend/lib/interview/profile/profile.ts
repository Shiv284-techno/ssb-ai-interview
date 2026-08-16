import "server-only";

/**
 * The candidate's PIQ profile, modelled directly on the supplied form
 * `docs/SSB PIQ-FORM-pdf.pdf` — 33 numbered questions across four pages.
 *
 * The form is the only source of truth for this file. Every field below exists
 * because it exists on that form, and nothing has been added because it would
 * be convenient for an interviewer to know. Where the form uses a particular
 * word ("Division", "Day scholar/boarder", "Places of SSB"), that word is kept.
 *
 * This model holds only what the candidate *wrote down*. It contains no
 * inferred attributes: no confidence rating, no leadership score, no
 * personality type, no honesty or OLQ or intelligence or suitability score, no
 * nervousness reading, no psychological diagnosis. Those would be conclusions
 * drawn about a person from a form, and this file is not a place to launder a
 * guess into a data field. Assessment, if it is ever built, belongs elsewhere.
 *
 * It also holds no account material by construction: no password, no password
 * hash, no session token, no user id, and no configuration such as the signing
 * secret or the account-service URL. The form has no email field, so this model
 * has none either. A PIQ is candidate-supplied interview information, not an
 * authentication object, and the two must not be joined together here.
 *
 * Everything is plain JSON so a profile can be serialised, stored, diffed, and
 * compared in tests without special handling.
 */

/**
 * Bumped from 1 to 2: the Step 3A model was a generic nine-section text bucket
 * built before the form was available. This version is the real schema, and the
 * two are not compatible.
 */
export const PROFILE_VERSION = 2;

/** The form's numbered questions run 1 to 33. */
export const PIQ_QUESTION_COUNT = 33;

/** How the profile was obtained. Extend deliberately, not incidentally. */
export type ProfileSource = "piq-upload" | "manual";

/**
 * A line the parser could not confidently attribute to a field. Kept rather
 * than dropped, so a gap in the parser is visible instead of silent.
 */
export interface PIQUnparsedLine {
  readonly text: string;
  /** 1-based line number in the source text. */
  readonly sourceLine: number;
}

// ---------------------------------------------------------------------------
// Q1 - Q6: form header
// ---------------------------------------------------------------------------

export interface PIQHeader {
  /** Q1 "Selection Board No." */
  readonly selectionBoardNo: string | null;
  /** Q1 "City" */
  readonly city: string | null;
  /** Q2 */
  readonly upscRollNumber: string | null;
  /** Q3 */
  readonly entry: string | null;
  /** Q4 */
  readonly batchNumber: string | null;
  /** Q5 */
  readonly chestNumber: string | null;
  /** Q6 — the form asks this again at Q31; that one is kept separately. */
  readonly choiceOfService: string | null;
}

// ---------------------------------------------------------------------------
// Q7 - Q19: personal details
// ---------------------------------------------------------------------------

/** Q8, which the form splits into Day / Month / Year blanks. */
export interface PIQDateOfBirth {
  /** The value as written, always preserved even when the parts are null. */
  readonly text: string;
  readonly day: string | null;
  readonly month: string | null;
  readonly year: string | null;
}

/** Q9, which the form splits into Years / Months blanks. */
export interface PIQAge {
  readonly text: string;
  readonly years: string | null;
  readonly months: string | null;
}

export interface PIQPersonalDetails {
  /** Q7 "Name (in block capitals) as in the Application Form" */
  readonly name: string | null;
  /** Q8 */
  readonly dateOfBirth: PIQDateOfBirth | null;
  /** Q9 */
  readonly age: PIQAge | null;
  /** Q10 — the form offers Male/Female; stored as written. */
  readonly gender: string | null;
  /** Q11, in cm per the form. */
  readonly height: string | null;
  /** Q12, in kg per the form. */
  readonly weight: string | null;
  /** Q13 — Married/Single/Widower. */
  readonly maritalStatus: string | null;
  /** Q14 — Hinduism/Christianity/Islam/Sikhism/Other. */
  readonly religion: string | null;
  /** Q15 */
  readonly motherTongue: string | null;
  /** Q16 — General/OBC/SC/ST. */
  readonly community: string | null;
  /** Q17 "Place of maximum residence (with state)" */
  readonly placeOfMaximumResidence: string | null;
  /** Q18 — may span several lines; joined with a single space. */
  readonly presentAddress: string | null;
  /** Q18 "(Population in Lacs)" */
  readonly presentAddressPopulationInLacs: string | null;
  /** Q19 */
  readonly permanentAddress: string | null;
  /** Q19 "(Population in Lacs)" */
  readonly permanentAddressPopulationInLacs: string | null;
}

// ---------------------------------------------------------------------------
// Q20 - Q21: family
// ---------------------------------------------------------------------------

/**
 * One row of the Q20 table. The form prints fixed relation rows — Father,
 * Mother, Guardian, Wife, Brother x3, Sister x3 — so relations repeat and the
 * table is modelled as an array rather than as named slots.
 */
export interface PIQFamilyMember {
  /** The relation as written: Father, Mother, Guardian, Wife, Brother, Sister. */
  readonly relation: string;
  readonly name: string | null;
  /** Column header is "Age(years)". */
  readonly ageYears: string | null;
  readonly education: string | null;
  readonly occupation: string | null;
  readonly incomePerMonth: string | null;
  readonly sourceLine: number;
}

export interface PIQFamily {
  /** Q20 */
  readonly members: readonly PIQFamilyMember[];
  /** Q21 "Parents alive? Yes/No" — stored as written. */
  readonly parentsAlive: string | null;
  /** Q21 "If parents not alive, your age at the time of their death ___ Years" */
  readonly ageAtTimeOfParentsDeath: string | null;
}

// ---------------------------------------------------------------------------
// Q22: the candidate's own occupation
// ---------------------------------------------------------------------------

export interface PIQPresentOccupation {
  /** Q22 — Govt/private/self-employed. */
  readonly occupation: string | null;
  readonly incomePerMonth: string | null;
  /** Form label: "Designation /appointment". */
  readonly designationAppointment: string | null;
  /** Form label: "Department / firm". */
  readonly departmentFirm: string | null;
}

// ---------------------------------------------------------------------------
// Q23 - Q26: education
// ---------------------------------------------------------------------------

/**
 * One marks group. The form repeats Max Marks / Marks Obtained / % three times
 * per row, under Theory, Practical/Sessionals, and Total.
 */
export interface PIQMarksCell {
  readonly maxMarks: string | null;
  readonly marksObtained: string | null;
  readonly percentage: string | null;
}

/**
 * One row of a marks table. In Q23 and Q24 the label is a subject; in Q25 and
 * Q26 it is a year or semester number. The form also prints a final "Total"
 * row, which arrives here as an ordinary row labelled "Total".
 *
 * The form spells the column "Theroy"; the field is spelled correctly here and
 * the parser accepts both spellings.
 */
export interface PIQMarksRow {
  /** Subject name, year/semester number, or "Total". */
  readonly label: string;
  readonly theory: PIQMarksCell;
  /** Form label: "Practical/Sessionals". */
  readonly practical: PIQMarksCell;
  readonly total: PIQMarksCell;
  /** Form label: "Outstanding achievements ( if any )". */
  readonly outstandingAchievements: string | null;
  readonly sourceLine: number;
}

/** Q23 and Q24, which share a field set. */
export interface PIQSchoolQualification {
  /** Q23 or Q24. */
  readonly questionNumber: 23 | 24;
  /** The form's own heading for this block. */
  readonly qualification: "Matric/Higher Secondary" | "Senior / 10+2/ Equivalent";
  readonly nameOfInstitution: string | null;
  /** Form label: "Location of institution (City town village)". */
  readonly locationOfInstitution: string | null;
  /** Q23/Q24 — CBSE/ICSE/State Board/Other. */
  readonly nameOfBoard: string | null;
  /** Govt/private. */
  readonly typeOfInstitution: string | null;
  /** English/Hindi/Regional. */
  readonly mediumOfInstruction: string | null;
  readonly yearOfPassing: string | null;
  readonly overallPercentageOfMarks: string | null;
  readonly division: string | null;
  /** Form label: "Day scholar/boarder". */
  readonly dayScholarOrBoarder: string | null;
  readonly subjects: readonly PIQMarksRow[];
}

/** Q25 and Q26, which share a field set. */
export interface PIQDegreeQualification {
  /** Q25 or Q26. */
  readonly questionNumber: 25 | 26;
  readonly qualification: "Graduation" | "Post Graduation";
  readonly nameOfInstitution: string | null;
  /** Form label: "Location of institution (city/town/village)". */
  readonly locationOfInstitution: string | null;
  readonly university: string | null;
  /** Q25 offers BTech/BE/B.Sc/B.Com/BA; Q26 offers MTech/M.E/M.Sc/M.Com/MA. */
  readonly course: string | null;
  /** Form label: "Branch/stream". */
  readonly branchStream: string | null;
  readonly yearOfAdmission: string | null;
  /** Form label: "Pursuing/completed". */
  readonly pursuingOrCompleted: string | null;
  readonly yearOfCompletion: string | null;
  readonly dayScholarOrBoarder: string | null;
  readonly mediumOfInstruction: string | null;
  readonly division: string | null;
  readonly aggregatePercentage: string | null;
  /** Form label for the row axis: "Year/Semester". */
  readonly semesters: readonly PIQMarksRow[];
}

export interface PIQEducation {
  /** Q23 */
  readonly matricHigherSecondary: PIQSchoolQualification | null;
  /** Q24 */
  readonly seniorSecondary: PIQSchoolQualification | null;
  /** Q25 */
  readonly graduation: PIQDegreeQualification | null;
  /** Q26 */
  readonly postGraduation: PIQDegreeQualification | null;
}

// ---------------------------------------------------------------------------
// Q27 - Q29: sports, hobbies, extra-curricular activities
// ---------------------------------------------------------------------------

/** Q27 "Participation in sports". */
export interface PIQSportsRecord {
  /** Form column: "Ser No.". */
  readonly serNo: string | null;
  /** Form column: "Sports/ game played". */
  readonly sportOrGamePlayed: string | null;
  /** Form column "Period" is split into From and To. */
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  /** "school / collage / university / district state / national / international" */
  readonly levelAtWhichPlayed: string | null;
  /** "Unit/brigade/division/corps/command/services" — service candidates only. */
  readonly levelForServiceCandidates: string | null;
  readonly specialAchievements: string | null;
  readonly sourceLine: number;
}

/** Q28 "Hobbies / interest". */
export interface PIQHobbyRecord {
  readonly serNo: string | null;
  readonly hobby: string | null;
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly levelAtWhichParticipated: string | null;
  readonly specialAchievements: string | null;
  readonly sourceLine: number;
}

/** Q29 "Extra-curricular activities". */
export interface PIQExtracurricularRecord {
  readonly serNo: string | null;
  readonly extracurricularActivity: string | null;
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly levelAtWhichParticipated: string | null;
  readonly specialAchievements: string | null;
  readonly sourceLine: number;
}

// ---------------------------------------------------------------------------
// Q30: NCC and appointments
// ---------------------------------------------------------------------------

export interface PIQNcc {
  /** "NCC training Yes/No" — stored as written. */
  readonly nccTraining: string | null;
  /** "Total training (in months)". */
  readonly totalTrainingInMonths: string | null;
  /** "Wing Army / Navy / Air Force". */
  readonly wing: string | null;
  /** "Division Senior / Junior". */
  readonly division: string | null;
  /** "Certificate obtained A/B/C". */
  readonly certificateObtained: string | null;
  /** "Achievements, if any". */
  readonly achievements: string | null;
  /**
   * "Position of Responsibility /Appointments Held in NCC/Scouting/ Sports
   * /Sports Teams /Extra curricular Group and in any other field".
   *
   * An array because the form's own label spans several domains and candidates
   * routinely list more than one. Each supplied line becomes one entry; no
   * structure is imposed on the text itself.
   */
  readonly positionsOfResponsibility: readonly string[];
}

// ---------------------------------------------------------------------------
// Q31 - Q33: previous attendance in SSB
// ---------------------------------------------------------------------------

/** One row of the Q33 table. */
export interface PIQPreviousSsbAttempt {
  readonly serNo: string | null;
  /** Form column: "SSB". */
  readonly ssb: string | null;
  readonly entry: string | null;
  /** Form column: "Places of SSB". */
  readonly placesOfSsb: string | null;
  readonly date: string | null;
  /** Form column: "Batch & Chest No.". */
  readonly batchAndChestNo: string | null;
  /**
   * Form column: "Recommended(R) / Not Recommended (NR) / Screened Out (s/o)".
   * Stored exactly as written; no normalisation to a code is attempted.
   */
  readonly result: string | null;
  readonly sourceLine: number;
}

export interface PIQPreviousSsbAttendance {
  /** Q31 */
  readonly natureOfCommissionAppliedFor: string | null;
  /** Q31 — asked separately from Q6. */
  readonly choiceOfService: string | null;
  /** Q32 "Number of chances availed for commission in Armed forces". */
  readonly numberOfChancesAvailed: string | null;
  /** Q33 */
  readonly attempts: readonly PIQPreviousSsbAttempt[];
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export interface PIQDeclaration {
  /** The form's "Dated :" line. The signature itself is not text. */
  readonly dated: string | null;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * How much of the FORM was populated.
 *
 * This measures extraction coverage of the questionnaire — how many of its 33
 * questions produced a value — and nothing else. It is not a rating of the
 * candidate, their achievements, or their suitability. A low score means the
 * upload was thin or the parser did not recognise the layout; it never means
 * the candidate is lacking.
 */
export interface ProfileCompleteness {
  /** Question numbers, ascending, that produced at least one value. */
  readonly populatedQuestions: readonly number[];
  readonly questionsPopulated: number;
  /** Always `PIQ_QUESTION_COUNT`, carried so the score is auditable. */
  readonly questionCount: number;
  /** `questionsPopulated / questionCount`, 0..1, rounded to 2 decimals. */
  readonly score: number;
  /** Lines that could not be attributed to any field. */
  readonly unparsedLineCount: number;
}

export interface ProfileMetadata {
  readonly profileVersion: number;
  readonly source: ProfileSource;
  /**
   * ISO 8601 timestamp, or null when the caller did not supply one.
   *
   * The parser never reads the clock: a pure function that stamps the current
   * time is neither reproducible nor testable, and the difference would show up
   * as a spurious diff on every re-parse. Whoever performs the upload passes the
   * timestamp in.
   */
  readonly parsedAt: string | null;
  readonly completeness: ProfileCompleteness;
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

export interface CandidateProfile {
  readonly metadata: ProfileMetadata;
  /** Q1 - Q6 */
  readonly header: PIQHeader;
  /** Q7 - Q19 */
  readonly personal: PIQPersonalDetails;
  /** Q20 - Q21 */
  readonly family: PIQFamily;
  /** Q22 */
  readonly presentOccupation: PIQPresentOccupation;
  /** Q23 - Q26 */
  readonly education: PIQEducation;
  /** Q27 */
  readonly sports: readonly PIQSportsRecord[];
  /** Q28 */
  readonly hobbies: readonly PIQHobbyRecord[];
  /** Q29 */
  readonly extracurricularActivities: readonly PIQExtracurricularRecord[];
  /** Q30 */
  readonly ncc: PIQNcc;
  /** Q31 - Q33 */
  readonly previousSsb: PIQPreviousSsbAttendance;
  readonly declaration: PIQDeclaration;
  /** Everything the parser could not place. Never silently discarded. */
  readonly unparsed: readonly PIQUnparsedLine[];
}

/** An empty marks group, so cells are never undefined. */
export function emptyMarksCell(): PIQMarksCell {
  return { maxMarks: null, marksObtained: null, percentage: null };
}

/**
 * Derives completeness from the question numbers the parser populated. Pure.
 */
export function summariseCompleteness(
  populatedQuestions: Iterable<number>,
  unparsedLineCount: number,
): ProfileCompleteness {
  const sorted = [...new Set(populatedQuestions)].sort((a, b) => a - b);

  return {
    populatedQuestions: sorted,
    questionsPopulated: sorted.length,
    questionCount: PIQ_QUESTION_COUNT,
    score: Math.round((sorted.length / PIQ_QUESTION_COUNT) * 100) / 100,
    unparsedLineCount,
  };
}
