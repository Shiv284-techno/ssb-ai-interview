/**
 * OIR attempt storage for the SSB AI Interviewer.
 *
 * Add these functions to the SAME Apps Script project that already serves
 * createUser / findUser / findUserById, and add the five branches at the bottom
 * to your existing doPost(e). The application posts to one endpoint and
 * distinguishes requests by `action`, exactly as it already does for accounts.
 *
 * SHEET: create a sheet named OIR_ATTEMPTS with this header row:
 *
 *   A attempt_id | B candidate_ref | C status | D revision | E attempt_json | F updated_at
 *
 * Notes that matter:
 *
 *  - `candidate_ref` is NOT an account id. The application stores a keyed hash
 *    of the user id, so this sheet cannot be read as a list of who sat what.
 *    Do not "helpfully" add an email column.
 *
 *  - `attempt_json` is the whole attempt. Keeping it in one cell means a save is
 *    one row write, which is what lets LockService make it atomic without a
 *    multi-row transaction Sheets cannot give us.
 *
 *  - Every write takes a script lock. Without it two tabs answering at the same
 *    moment can interleave a read-modify-write and lose an answer.
 *
 *  - Updates are conditional on `expected_revision`. A caller whose revision is
 *    stale is told REVISION_CONFLICT and re-reads; it never wins the race by
 *    being slower.
 */

var OIR_SHEET_NAME = 'OIR_ATTEMPTS';
var OIR_LOCK_TIMEOUT_MS = 10000;
/** Statuses that mean the attempt is over. Mirrors the application's model. */
var OIR_SETTLED = ['submitted', 'timed-out', 'abandoned'];

/**
 * The spreadsheet holding OIR_ATTEMPTS.
 *
 * getActiveSpreadsheet() returns null in a STANDALONE script — it only works in
 * one bound to a spreadsheet — so this falls back to opening by id from Script
 * Properties. If the rest of your project already resolves the spreadsheet some
 * other way, replace the body of this function with that instead; the point is
 * only that the OIR sheet and the USERS sheet are reached the same way.
 */
function oirSpreadsheet_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error(
      'This is a standalone script, so it cannot use the active spreadsheet. Set a Script ' +
        'Property named SPREADSHEET_ID to the id of the spreadsheet holding OIR_ATTEMPTS.'
    );
  }
  return SpreadsheetApp.openById(id);
}

function oirSheet_() {
  var sheet = oirSpreadsheet_().getSheetByName(OIR_SHEET_NAME);
  if (!sheet) throw new Error('Missing sheet: ' + OIR_SHEET_NAME);
  return sheet;
}

/** Every data row, as [rowNumber, values[]]. */
function oirRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) rows.push([i + 2, values[i]]);
  return rows;
}

function oirFindRowById_(sheet, attemptId) {
  var rows = oirRows_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1][0]).trim() === attemptId) return rows[i];
  }
  return null;
}

function oirIsSettled_(status) {
  return OIR_SETTLED.indexOf(String(status).trim()) !== -1;
}

/**
 * Creates an attempt, refusing if the candidate already holds an unsettled one.
 * The check and the insert happen under the same lock, so two simultaneous
 * starts cannot both succeed.
 */
function createOirAttempt(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(OIR_LOCK_TIMEOUT_MS)) return { success: false, error: 'BUSY' };
  try {
    var sheet = oirSheet_();
    var rows = oirRows_(sheet);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i][1];
      // Any attempt, settled or not. A candidate sits this paper once: a
      // submitted row must block a second start just as firmly as a live one,
      // or a reload after submitting hands out a fresh twenty-five minutes.
      if (String(row[1]).trim() === payload.candidate_ref) {
        return { success: false, error: 'ATTEMPT_ALREADY_ACTIVE' };
      }
      if (String(row[0]).trim() === payload.attempt_id) {
        return { success: false, error: 'ATTEMPT_ALREADY_ACTIVE' };
      }
    }
    // Format the row as plain text BEFORE writing it. Sheets coerces values on
    // the way in: a candidate reference is base64url and may begin with "-",
    // and appendRow would be free to read that as a number. Writing into a
    // range already formatted as text removes the whole class of problem.
    var rowNumber = sheet.getLastRow() + 1;
    var range = sheet.getRange(rowNumber, 1, 1, 6);
    range.setNumberFormat('@');
    range.setValues([[
      String(payload.attempt_id),
      String(payload.candidate_ref),
      String(payload.status),
      String(payload.revision),
      String(payload.attempt),
      new Date().toISOString()
    ]]);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/** Returns the attempt JSON string, or null. Ownership is checked by the app. */
function getOirAttempt(attemptId) {
  var found = oirFindRowById_(oirSheet_(), String(attemptId).trim());
  return found ? String(found[1][4]) : null;
}

/** The candidate's unsettled attempt, if any. What a browser refresh finds. */
function getUnsettledOirAttempt(candidateRef) {
  var rows = oirRows_(oirSheet_());
  var target = String(candidateRef).trim();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i][1];
    if (String(row[1]).trim() === target && !oirIsSettled_(row[2])) return String(row[4]);
  }
  return null;
}

/**
 * The candidate's most recent attempt, whatever state it is in.
 *
 * `getUnsettledOirAttempt` cannot answer this: it filters settled rows out by
 * design, which is right for finding a paper still being sat but wrong for
 * everything afterwards. A submitted attempt has to stay findable, or the
 * candidate who reloads is told they have no attempt and is given a new one.
 *
 * Rows are appended, so the last match is the newest.
 */
function getLatestOirAttemptFor(candidateRef) {
  var rows = oirRows_(oirSheet_());
  var target = String(candidateRef).trim();
  var latest = null;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i][1];
    if (String(row[1]).trim() === target) latest = String(row[4]);
  }
  return latest;
}

/**
 * Writes an attempt back only if the stored revision is the one the caller read.
 * Also refuses to move an attempt that has already settled, so a late request
 * cannot reopen a submitted or expired paper.
 */
function updateOirAttempt(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(OIR_LOCK_TIMEOUT_MS)) return { success: false, error: 'BUSY' };
  try {
    var sheet = oirSheet_();
    var found = oirFindRowById_(sheet, String(payload.attempt_id).trim());
    if (!found) return { success: false, error: 'NOT_FOUND' };

    var rowNumber = found[0];
    var row = found[1];
    if (String(row[1]).trim() !== String(payload.candidate_ref).trim()) {
      // Same answer as "not found": an attempt id must not be probeable.
      return { success: false, error: 'NOT_FOUND' };
    }
    if (Number(row[3]) !== Number(payload.expected_revision)) {
      return { success: false, error: 'REVISION_CONFLICT' };
    }
    if (oirIsSettled_(row[2])) {
      return { success: false, error: 'REVISION_CONFLICT' };
    }

    var target = sheet.getRange(rowNumber, 3, 1, 4);
    target.setNumberFormat('@');
    target.setValues([[
      String(payload.status),
      String(payload.revision),
      String(payload.attempt),
      new Date().toISOString()
    ]]);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---- branches to add inside your existing doPost(e) ------------------------ */
function oir_doPost_branches_example(body) {
  var action = body.action;

  if (action === 'createOirAttempt') {
    if (!body.attempt_id || !body.candidate_ref || !body.attempt) {
      return { success: false, error: 'MISSING_FIELDS' };
    }
    return createOirAttempt(body);
  }

  if (action === 'getOirAttempt') {
    if (!body.attempt_id) return { success: false, error: 'MISSING_FIELDS' };
    return { success: true, attempt: getOirAttempt(body.attempt_id) };
  }

  if (action === 'getUnsettledOirAttempt') {
    if (!body.candidate_ref) return { success: false, error: 'MISSING_FIELDS' };
    return { success: true, attempt: getUnsettledOirAttempt(body.candidate_ref) };
  }

  if (action === 'getLatestOirAttemptFor') {
    if (!body.candidate_ref) return { success: false, error: 'MISSING_FIELDS' };
    return { success: true, attempt: getLatestOirAttemptFor(body.candidate_ref) };
  }

  if (action === 'updateOirAttempt') {
    if (!body.attempt_id || !body.candidate_ref || !body.attempt) {
      return { success: false, error: 'MISSING_FIELDS' };
    }
    if (typeof body.expected_revision !== 'number') {
      return { success: false, error: 'MISSING_FIELDS' };
    }
    return updateOirAttempt(body);
  }

  return { success: false, error: 'UNKNOWN_ACTION' };
}
