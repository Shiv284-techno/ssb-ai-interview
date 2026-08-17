import "server-only";

import type {
  AssessmentActivityKind,
  PiqAspect,
} from "@/lib/assessment/activities";
import type { AssessmentSession } from "@/lib/assessment/session";
import type {
  AttemptId,
  CandidateRef,
  IsoTimestamp,
  SessionId,
} from "@/lib/assessment/types";
import type { CandidateProfile } from "@/lib/interview/profile/profile";

/**
 * What an activity is told about the candidate.
 *
 * The PIQ is the most sensitive thing this application holds — a name, a date
 * of birth, two addresses, a family's occupations and incomes. Handing the
 * whole of it to every activity would be the easy thing to build and the wrong
 * thing to have built: a word-association test has no business knowing where
 * someone lives, and the psychology tests must not be coloured by what the
 * candidate wrote about themselves elsewhere.
 *
 * So an activity declares the aspects it needs, and this module hands over
 * those and nothing more. `NEVER_PROJECTED` names the fields that no aspect
 * carries at any time: administrative identifiers, and the attributes that
 * would invite a judgement nobody should be making from a form.
 *
 * Server-only. The projection runs where the profile already is, and only the
 * result travels.
 */

/**
 * Fields no aspect ever includes.
 *
 * Addresses, dates, and identifiers because no activity needs them to ask a
 * question. Religion, community, and marital status because an assessment that
 * can see them can be influenced by them, and there is no reading of this
 * domain in which that is acceptable.
 */
export const NEVER_PROJECTED: readonly string[] = [
  "dateOfBirth",
  "age",
  "height",
  "weight",
  "presentAddress",
  "permanentAddress",
  "placeOfMaximumResidence",
  "religion",
  "community",
  "maritalStatus",
  "gender",
  "upscRollNumber",
  "chestNumber",
  "batchNumber",
  "selectionBoardNo",
  "incomePerMonth",
  "unparsed",
];

export interface IdentityAspect {
  /** How to address the candidate. Nothing else. */
  readonly displayName: string | null;
}

export interface FamilyMemberSummary {
  readonly relation: string;
  readonly occupation: string | null;
  readonly education: string | null;
}

export interface FamilyAspect {
  readonly members: readonly FamilyMemberSummary[];
  readonly parentsAlive: string | null;
}

export interface QualificationSummary {
  readonly level: "matric" | "senior-secondary" | "graduation" | "post-graduation";
  readonly institution: string | null;
  readonly course: string | null;
  readonly branchStream: string | null;
  readonly yearOfCompletion: string | null;
}

export interface EducationAspect {
  readonly qualifications: readonly QualificationSummary[];
}

export interface ActivitySummary {
  readonly name: string;
  readonly level: string | null;
}

export interface ActivitiesAspect {
  readonly sports: readonly ActivitySummary[];
  readonly hobbies: readonly ActivitySummary[];
  readonly extracurricular: readonly ActivitySummary[];
  readonly nccTraining: string | null;
  readonly positionsOfResponsibility: readonly string[];
}

export interface ServiceBackgroundAspect {
  readonly natureOfCommissionAppliedFor: string | null;
  readonly choiceOfService: string | null;
  readonly numberOfChancesAvailed: string | null;
  /** Outcomes only — no dates, places, or chest numbers. */
  readonly previousAttemptResults: readonly string[];
}

/**
 * The projection. Every aspect is null unless the activity asked for it, so an
 * activity that requests nothing receives an object of nulls rather than a
 * convenient copy of the profile.
 */
export interface PiqProjection {
  readonly identity: IdentityAspect | null;
  readonly family: FamilyAspect | null;
  readonly education: EducationAspect | null;
  readonly activities: ActivitiesAspect | null;
  readonly serviceBackground: ServiceBackgroundAspect | null;
}

export const EMPTY_PROJECTION: PiqProjection = {
  identity: null,
  family: null,
  education: null,
  activities: null,
  serviceBackground: null,
};

function projectIdentity(profile: CandidateProfile): IdentityAspect {
  return { displayName: profile.personal.name };
}

function projectFamily(profile: CandidateProfile): FamilyAspect {
  return {
    // Names and incomes are left behind: an activity can ask what a parent does
    // without being told what they earn or what they are called.
    members: profile.family.members.map((member) => ({
      relation: member.relation,
      occupation: member.occupation,
      education: member.education,
    })),
    parentsAlive: profile.family.parentsAlive,
  };
}

function projectEducation(profile: CandidateProfile): EducationAspect {
  const qualifications: QualificationSummary[] = [];
  const { education } = profile;

  if (education.matricHigherSecondary) {
    qualifications.push({
      level: "matric",
      institution: education.matricHigherSecondary.nameOfInstitution,
      course: null,
      branchStream: null,
      yearOfCompletion: education.matricHigherSecondary.yearOfPassing,
    });
  }
  if (education.seniorSecondary) {
    qualifications.push({
      level: "senior-secondary",
      institution: education.seniorSecondary.nameOfInstitution,
      course: null,
      branchStream: null,
      yearOfCompletion: education.seniorSecondary.yearOfPassing,
    });
  }
  if (education.graduation) {
    qualifications.push({
      level: "graduation",
      institution: education.graduation.nameOfInstitution,
      course: education.graduation.course,
      branchStream: education.graduation.branchStream,
      yearOfCompletion: education.graduation.yearOfCompletion,
    });
  }
  if (education.postGraduation) {
    qualifications.push({
      level: "post-graduation",
      institution: education.postGraduation.nameOfInstitution,
      course: education.postGraduation.course,
      branchStream: education.postGraduation.branchStream,
      yearOfCompletion: education.postGraduation.yearOfCompletion,
    });
  }

  // Marks tables are deliberately omitted; a percentage is not what an activity
  // needs in order to ask about someone's studies.
  return { qualifications };
}

function projectActivities(profile: CandidateProfile): ActivitiesAspect {
  return {
    sports: profile.sports.map((row) => ({
      name: row.sportOrGamePlayed ?? "",
      level: row.levelAtWhichPlayed,
    })),
    hobbies: profile.hobbies.map((row) => ({
      name: row.hobby ?? "",
      level: row.levelAtWhichParticipated,
    })),
    extracurricular: profile.extracurricularActivities.map((row) => ({
      name: row.extracurricularActivity ?? "",
      level: row.levelAtWhichParticipated,
    })),
    nccTraining: profile.ncc.nccTraining,
    positionsOfResponsibility: profile.ncc.positionsOfResponsibility,
  };
}

function projectServiceBackground(
  profile: CandidateProfile,
): ServiceBackgroundAspect {
  return {
    natureOfCommissionAppliedFor: profile.previousSsb.natureOfCommissionAppliedFor,
    choiceOfService: profile.previousSsb.choiceOfService,
    numberOfChancesAvailed: profile.previousSsb.numberOfChancesAvailed,
    previousAttemptResults: profile.previousSsb.attempts
      .map((attempt) => attempt.result)
      .filter((result): result is string => result !== null),
  };
}

/**
 * Builds the projection for exactly the aspects requested. Pure: it reads the
 * profile and returns a new object, never modifying what it was given.
 */
export function projectPiq(
  profile: CandidateProfile,
  aspects: readonly PiqAspect[],
): PiqProjection {
  const wanted = new Set(aspects);
  return {
    identity: wanted.has("identity") ? projectIdentity(profile) : null,
    family: wanted.has("family") ? projectFamily(profile) : null,
    education: wanted.has("education") ? projectEducation(profile) : null,
    activities: wanted.has("activities") ? projectActivities(profile) : null,
    serviceBackground: wanted.has("service-background")
      ? projectServiceBackground(profile)
      : null,
  };
}

export interface PreviousAttemptRef {
  readonly attemptId: AttemptId;
  readonly activityKind: AssessmentActivityKind;
  readonly status: string;
}

/**
 * Everything an activity receives about the candidate and the run so far.
 *
 * Prior work appears as references, not as content: an activity may know that
 * the candidate has finished WAT, and may fetch the attempt if it has reason
 * to, but it is not handed their sentences as ambient context.
 */
export interface AssessmentContext {
  readonly sessionId: SessionId;
  readonly candidateRef: CandidateRef;
  readonly activityKind: AssessmentActivityKind;
  readonly piq: PiqProjection;
  readonly previousAttempts: readonly PreviousAttemptRef[];
  readonly startedAt: IsoTimestamp;
}

export function buildContext(input: {
  readonly session: AssessmentSession;
  readonly activityKind: AssessmentActivityKind;
  readonly aspects: readonly PiqAspect[];
  readonly profile: CandidateProfile | null;
  readonly startedAt: IsoTimestamp;
}): AssessmentContext {
  const { session, activityKind, aspects, profile, startedAt } = input;

  return {
    sessionId: session.id,
    candidateRef: session.candidateRef,
    activityKind,
    // No profile, or no aspects requested, means no projection at all.
    piq: profile && aspects.length > 0 ? projectPiq(profile, aspects) : EMPTY_PROJECTION,
    previousAttempts: session.attempts.map((attempt) => ({
      attemptId: attempt.id,
      activityKind: attempt.activityKind,
      status: attempt.status,
    })),
    startedAt,
  };
}
