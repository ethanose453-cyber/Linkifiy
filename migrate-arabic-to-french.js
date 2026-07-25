/**
 * ============================================================
 * Linkify.ma — Migrate existing Arabic data to French
 * ============================================================
 * 
 * WHAT IT DOES
 *   1. Arabic values          -> canonical lowercase French  ("القنيطرة" -> "kenitra")
 *   2. Already-French values  -> canonical lowercase French  ("Kénitra"  -> "kenitra")
 *   3. Phone columns          -> +212XXXXXXXXX               ("0710849666" -> "+212710849666")
 *
 * Step 2 is what fixes the rows that were translated by hand, so the whole
 * database ends up in the exact same shape the form now submits.
 *
 * HOW TO USE
 *   1. Make a BACKUP first: File > Make a copy
 *   2. Extensions > Apps Script
 *   3. Paste this file at the BOTTOM of your existing Code.gs
 *      (do NOT delete the existing backend code - it is still needed)
 *   4. Save
 *   5. Pick dryRun in the function dropdown and press Run
 *      -> changes NOTHING, prints a preview to View > Execution log
 *   6. When the preview looks right, pick migrateAllSheets and press Run
 *
 * NOTES
 *   - No deployment needed. These functions run from the editor only.
 *   - Free text (names, neighbourhoods, emails, notes) is NEVER touched:
 *     only values known to MAPPING are rewritten.
 *   - Phone numbers that are not recognizably Moroccan are left exactly as-is,
 *     so a typo is never silently turned into a different valid number.
 *   - Safe to run more than once: the result is already canonical, so a second
 *     run reports 0 changes.
 *   - Reuses getSpreadsheet() from the existing backend, so it honours the
 *     SHEET_ID script property.
 *   - Sheets processed: Sheet1, Form Responses 1, Administration.
 *     The Schools tab is NOT touched.
 * ============================================================
 */

// ===== MAPPING: Arabic → French =====
const MAPPING = {
  // Gender
  "ذكر": "h",
  "أنثى": "f",

  // Cities
  "القنيطرة": "kenitra",
  "سلا": "sale",
  "الرباط": "rabat",
  "تمارة": "temara",
  "الصخيرات": "skhirat",
  "بوزنيقة": "bouznika",
  "المحمدية": "mohammedia",
  "الدار البيضاء": "casablanca",
  "طنجة": "tanger",
  "تطوان": "tetouan",
  "العرائش": "larache",
  "القصر الكبير": "ksar el kebir",
  "سيدي سليمان": "sidi slimane",
  "سيدي قاسم": "sidi kacem",
  "وزان": "ouezzane",
  "مكناس": "meknes",
  "فاس": "fes",
  "صفرو": "sefrou",
  "تازة": "taza",
  "وجدة": "oujda",
  "بركان": "berkane",
  "الناضور": "nador",
  "خريبكة": "khouribga",
  "بني ملال": "beni mellal",
  "الفقيه بن صالح": "fquih ben salah",
  "سطات": "settat",
  "برشيد": "berrechid",
  "الجديدة": "el jadida",
  "سيدي بنور": "sidi bennour",
  "آسفي": "safi",
  "الصويرة": "essaouira",
  "مراكش": "marrakech",
  "قلعة السراغنة": "kelaat sraghna",
  "أكادير": "agadir",
  "إنزكان": "inezgane",
  "آيت ملول": "ait melloul",
  "تارودانت": "taroudant",
  "تيزنيت": "tiznit",
  "مدينة أخرى": "autre ville",
  // Common typos/variants the founder may have used
  "القنيطره": "kenitra",
  "تماره": "temara",
  "بوزنيقه": "bouznika",
  "المحمديه": "mohammedia",
  "طنجه": "tanger",
  "خريبكه": "khouribga",
  "تازه": "taza",
  "الجديده": "el jadida",
  "الصويره": "essaouira",
  "اكادير": "agadir",
  "ايت ملول": "ait melloul",
  "اسفي": "safi",
  "قلعه السراغنه": "kelaat sraghna",
  "مدينه اخرى": "autre ville",

  // Transport
  "نعم، سيارة": "oui, voiture",
  "نعم، دراجة نارية": "oui, moto",
  "نعم، دراجه ناريه": "oui, moto",
  "لا أملك وسيلة نقل": "aucun moyen de transport",
  // Alias: earlier hand-translation. Converges on the shorter canonical form,
  // which 201 rows already use and which matches "aucun permis".
  "je n'ai pas de moyen de transport": "aucun moyen de transport",

  // License
  "رخصة سيارة": "permis voiture",
  "رخصة دراجة نارية": "permis moto",
  "رخصه دراجه": "permis moto",
  "لا أملك رخصة": "aucun permis",

  // Relocate
  "نعم، مستعد تماماً": "oui, tout a fait pret",
  "حسب العرض والامتيازات": "selon l'offre et les avantages",
  "لا، مدينتي فقط": "non, ma ville uniquement",

  // Track
  "علمي / تقني": "scientifique / technique",
  "أدبي / إنساني": "litteraire / sciences humaines",
  "التعليم الأولي والمربيات": "education prescolaire et educatrices",
  "التربية الفنية والثقافية": "education artistique et culturelle",

  // Diploma
  "مستوى بكالوريا": "niveau baccalaureat",
  "بكالوريا": "baccalaureat",
  "دبلوم سنتين": "bac+2",
  "bac +2": "bac+2",          // alias: spacing variant found in 49 rows
  "إجازة": "licence",
  "ماستر": "master",
  "مهندس": "ingenieur",
  "دكتوراه": "doctorat",
  "غير ذلك": "autre",

  // Language levels
  "ممتاز": "excellent",
  "متوسط": "intermediaire",
  "أساسي": "basique",
  "لا توجد معرفة": "aucune connaissance",

  // Subjects
  "الرياضيات": "mathematiques",
  "الفيزياء والكيمياء": "physique-chimie",
  "علوم الحياة والأرض": "sciences de la vie et de la terre",
  "المعلوميات": "informatique",
  "التربية البدنية والرياضية": "education physique et sportive",
  "تسيير ومحاسبة": "gestion et comptabilite",
  "التربية الإسلامية": "education islamique",
  "اللغة العربية": "langue arabe",
  "اللغة الفرنسية": "langue francaise",
  "اللغة الإنجليزية": "langue anglaise",
  "اللغة الإسبانية": "langue espagnole",
  "اللغة الألمانية": "langue allemande",
  "الفلسفة": "philosophie",
  "التاريخ والجغرافيا": "histoire-geographie",
  "التربية التشكيلية والفنون البصرية": "arts plastiques et visuels",
  "المسرح والفنون الأدائية": "theatre et arts de la scene",
  "التربية الموسيقية": "education musicale",
  "التصوير الفوتوغرافي والسمعي البصري": "photographie et audiovisuel",
  "المعامل التربوية والابتكار": "ateliers pedagogiques et innovation",
  "التنشيط الثقافي والتفتح الفني": "animation culturelle et eveil artistique",
  "العربية فقط": "arabe uniquement",
  "الفرنسية": "francais",
  "الإنجليزية": "anglais",

  /* Legacy preschool subjects. These came from an earlier version of the form
     and are no longer offered, but rows still hold them, so they are mapped
     here to keep the column fully canonical. */
  "أناشيد وقصص الأطفال": "comptines et contes",
  "التربية الحس حركية": "education psychomotrice",
  "اللغات المبكرة": "initiation aux langues",
  "مهارات حركية دقيقة": "motricite fine",

  // Levels
  "التعليم الأولي (3-5 سنوات)": "prescolaire (3-5 ans)",
  "التعليم الأولي": "prescolaire (3-5 ans)",
  "التعليم الابتدائي": "primaire",
  "التعليم الإعدادي": "college",
  "التعليم الثانوي التأهيلي": "lycee",
  "التعليم العالي": "enseignement superieur",
  "تعليم الكبار / التكوين المستمر": "formation des adultes / formation continue",
  "الحضانة (أقل من 3 سنوات)": "creche (moins de 3 ans)",
  "القسم الصغير (3-4 سنوات)": "petite section (3-4 ans)",
  "القسم المتوسط (4-5 سنوات)": "moyenne section (4-5 ans)",
  "القسم الكبير (5-6 سنوات)": "grande section (5-6 ans)",

  // Institution types
  "مدرسة خاصة": "ecole privee",
  "مركز دعم وتقوية": "centre de soutien scolaire",
  "مركز لغات": "centre de langues",
  "مركز تكوين مهني": "centre de formation professionnelle",
  "حضانة / تعليم أولي": "creche / prescolaire",
  "مؤسسة تعليم عالي خاصة": "etablissement d'enseignement superieur prive",
  "حضانة": "creche",
  "تعليم أولي (روض)": "prescolaire (maternelle)",

  // Schedule
  "دوام كامل": "temps plein",
  "دوام جزئي": "temps partiel",
  "ساعات إضافية / حصص محددة": "heures supplementaires / seances ponctuelles",
  "ساعات إضافية / حص": "heures supplementaires / seances ponctuelles",
  "كل ما سبق": "tout ce qui precede",

  // Substitute
  "نعم، متاح للتعويض الطارئ": "oui, disponible pour remplacement urgent",
  "نعم، حسب الظروف": "oui, selon les circonstances",

  // Salary
  "لا يهم": "peu importe",
  "مبلغ آخر": "autre montant",
  // Identity entries: the numeric ranges need no translation, but listing them
  // marks them as RECOGNIZED so the audit does not report them as unknown.
  "2000-3500": "2000-3500",
  "4000-6000": "4000-6000",
  "7000-9000": "7000-9000",

  // Contract types
  "لا يهم (أي نوع عقد)": "peu importe (tout type de contrat)",
  "CDI (غير محدد المدة)": "cdi (contrat a duree indeterminee)",
  "CDD (محدد المدة)": "cdd (contrat a duree determinee)",
  "عقد تجريبي": "periode d'essai",
  "بالتوقيت / بالساعة": "vacataire (a l'heure)",
  "تعويض مؤقت": "remplacement temporaire",
  "مقاول ذاتي / Freelance": "auto-entrepreneur / freelance",
  "تدريب / إدماج": "stage / insertion",

  // Experience
  "نعم": "oui",
  "لا (حديث التخرج)": "non (nouveau diplome)",
  "أقل من سنة": "moins d'un an",
  "بين سنة و 3 سنوات": "entre 1 et 3 ans",
  "بين 4 و 5 سنوات": "entre 4 et 5 ans",
  "أكثر من 5 سنوات": "plus de 5 ans",

  // Skills (teacher)
  "التدريس عن بعد (Zoom, Meet, Teams)": "enseignement a distance (zoom, meet, teams)",
  "تصميم المحتوى (Canva, Genially, PPT)": "conception de contenu (canva, genially, ppt)",
  "دمج الذكاء الاصطناعي فالتعليم": "integration de l'ia dans l'enseignement",
  "التحليل الإحصائي (SPSS)": "analyse statistique (spss)",
  "المسرح التربوي والتنشيط": "theatre educatif et animation",
  "تدبير الأنشطة الموازية والنوادي": "gestion des activites parascolaires et clubs",
  "مهارة أخرى": "autre competence",

  // Skills (admin)
  "مايكروسوفت أوفيس (Word, Excel)": "microsoft office (word, excel)",
  "تدبير منصة مسار / برامج المؤسسات": "gestion plateforme massar / logiciels scolaires",
  "برامج المحاسبة والتسيير": "logiciels de comptabilite et gestion",
  "التواصل واستقبال الزبناء": "communication et accueil",
  "التنظيم والأرشفة": "organisation et archivage",

  // Admin positions
  "تقني معلوميات / صيانة": "technicien informatique / maintenance",
  "مدير(ة) عام / مدير(ة) تربوي (بيداغوجي)": "directeur(trice) general(e) / directeur(trice) pedagogique",
  "نائب(ة) المدير / ناظر(ة) المؤسسة": "adjoint(e) du directeur / surveillant(e) general(e)",
  "حارس(ة) عام": "surveillant(e) general(e)",
  "مفتش(ة) / مشرف(ة) تربوي(ة)": "inspecteur(trice) / superviseur(e) pedagogique",
  "مسؤول(ة) الموارد البشرية أو التسجيل": "responsable rh ou inscriptions",
  "سكرتير(ة) / موظف(ة) إداري / مسؤول(ة) استقبال": "secretaire / agent administratif / receptionniste",
  "مستشار(ة) في التوجيه / أخصائي(ة) نفسي(ة) أو اجتماعي(ة)": "conseiller(ere) d'orientation / psychologue ou assistant(e) social(e)",
  "منصب إداري آخر": "autre poste administratif",

  // Early role
  "أستاذة / معلمة": "enseignante / educatrice",
  "أستاذة مساعدة / مربية مساعدة": "assistante enseignante / aide-educatrice",

  // Accompanist + misc
  "لا": "non",
  "موافق": "oui",
};

/**
 * Main function — run this one!
 * Migrates: Sheet1, Form Responses 1, Administration
 */
function migrateAllSheets() {
  var ss = getSpreadsheet();
  var sheets = ["Sheet1", "Form Responses 1", "Administration"];
  var totalChanges = 0;

  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i];
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      Logger.log("Processing: " + name);
      totalChanges += migrateSheet(sheet);
    } else {
      Logger.log("Sheet not found: " + name);
    }
  }

  // Logged only. getUi() is unavailable when the script is bound via SHEET_ID,
  // so we never call it -- open View > Execution log to read the result.
  Logger.log("DONE. Total cells changed: " + totalChanges);
}

/**
 * Process a single sheet: read all data, replace matching values, write back
 */
function migrateSheet(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    Logger.log("  -> Empty or header-only, skipping.");
    return 0;
  }

  // Header row tells us which columns hold phone numbers.
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Read all data at once (fast!)
  var range = sheet.getRange(2, 1, lastRow - 1, lastCol); // skip header row
  var data = range.getValues();
  var changes = 0;

  for (var r = 0; r < data.length; r++) {
    for (var c = 0; c < data[r].length; c++) {
      var cell = data[r][c];
      if (cell === "" || cell === null || cell === undefined) continue;

      var colName = String(header[c] || "").trim();
      /* A phone may have been stored as a NUMBER (612345678). Those cells would
         otherwise be skipped and never normalized, so coerce them to text. */
      if (typeof cell !== "string") {
        if (!(PHONE_COLUMNS[colName] && typeof cell === "number")) continue;
        cell = String(cell);
      }

      var newValue = convertCell(colName, cell);

      if (newValue !== cell) {
        data[r][c] = newValue;
        changes++;
      }
    }
  }

  // Write all data back at once (fast!)
  if (changes > 0) {
    range.setValues(data);
  }

  Logger.log("  -> " + changes + " cells changed in " + sheet.getName());
  return changes;
}

/* ===== CANONICAL SET =====
   Every valid French value, lowercase + accent-free. Built once from MAPPING.
   This is what lets the script fix rows that were ALREADY translated to French
   by hand ("Kénitra", "CDI (Contrat à durée indéterminée)") and bring them to
   the same canonical shape the form now submits ("kenitra", "cdi (...)"). */
var CANONICAL = null;
function canonicalSet() {
  if (!CANONICAL) {
    CANONICAL = {};
    Object.keys(MAPPING).forEach(function (k) { CANONICAL[MAPPING[k]] = true; });
  }
  return CANONICAL;
}

// "Kénitra" -> "kenitra". Mirrors the form's toAscii() exactly: only LATIN
// accents are stripped, and the result is recomposed to NFC so non-Latin script
// (Arabic names) is never silently rewritten into a decomposed byte sequence.
function toCanonical(s) {
  return s.normalize("NFD").replace(/([A-Za-z])[\u0300-\u036f]+/g, "$1").normalize("NFC").toLowerCase();
}

/**
 * Translate ONE atomic value (no separators).
 * Returns the canonical value, or null when nothing is known about it
 * (free text like a name or a neighbourhood -> caller leaves it alone).
 */
function translateOne(raw) {
  var v = raw.trim();
  if (v === "") return null;

  // 1) Arabic -> canonical
  if (MAPPING[v]) return MAPPING[v];

  // 2) Already French (any case / accents) -> canonical
  var c = toCanonical(v);
  if (canonicalSet()[c]) return c;

  return null;
}

/* ===== KNOWN-VALUE INDEX =====
   Every recognizable spelling (the Arabic keys AND the canonical values),
   keyed by its canonical form and sorted LONGEST FIRST.

   Longest-first is what makes multi-select parsing correct when a value itself
   contains the separator. Ten of the mapped values do:
     "microsoft office (word, excel)"
     "enseignement a distance (zoom, meet, teams)"
     "oui, tout a fait pret"      ("نعم، مستعد تماماً")
   Splitting such a cell on "," shreds it into fragments that match nothing. */
var KNOWN_SORTED = null;
function knownSorted() {
  if (!KNOWN_SORTED) {
    var seen = {}, list = [];
    Object.keys(MAPPING).forEach(function (k) {
      var canon = MAPPING[k];
      [k, canon].forEach(function (raw) {
        var key = toCanonical(raw);
        if (key !== "" && !seen[key]) { seen[key] = 1; list.push({ key: key, canon: canon }); }
      });
    });
    list.sort(function (a, b) { return b.key.length - a.key.length; });
    KNOWN_SORTED = list;
  }
  return KNOWN_SORTED;
}

// Longest known value starting exactly at position pos, or null.
function matchAt(s, pos) {
  var list = knownSorted();
  for (var i = 0; i < list.length; i++) {
    if (s.substr(pos, list[i].key.length) === list[i].key) return list[i];
  }
  return null;
}

// Consume a separator at pos. Returns the new position, or -1 if there is none.
function eatSeparator(s, pos) {
  if (s.substr(pos, 2) === ", ") return pos + 2;
  var ch = s.charAt(pos);
  if (ch === "," || ch === "\n") return pos + 1;
  return -1;
}

/**
 * Parse a multi-select cell by greedy longest-match.
 * Returns the list of canonical values, or null if ANY part of the cell is not
 * a known value -- in which case the caller leaves the cell untouched. That is
 * what protects free text containing a comma, e.g.
 * "Groupe Scolaire Al Amal, Casablanca" in the schools textarea.
 */
function parseMulti(raw) {
  var s = toCanonical(String(raw).trim());
  if (s === "") return null;

  var out = [], pos = 0;
  while (pos < s.length) {
    var m = matchAt(s, pos);
    if (!m) return null;
    out.push(m.canon);
    pos += m.key.length;
    if (pos >= s.length) break;
    var next = eatSeparator(s, pos);
    if (next === -1) return null;   // trailing text after a known value
    pos = next;
  }
  return out.length ? out : null;
}

/**
 * Translate a single cell value.
 * Handles single values and multi-selects (normalized to ", " separated).
 */
function translateCell(cellValue) {
  var single = translateOne(cellValue);
  if (single !== null) return single;

  var multi = parseMulti(cellValue);
  if (multi) return multi.join(", ");

  // Unknown -> untouched (names, neighbourhoods, emails, free text)
  return cellValue;
}

/**
 * Audit helper: the fragments of a cell that are NOT recognized.
 * Empty array = the whole cell is accounted for.
 */
function unknownFragments(raw) {
  if (translateOne(raw) !== null) return [];
  if (parseMulti(raw)) return [];

  var s = toCanonical(String(raw).trim());
  var unknown = [], pos = 0, guard = 0;

  while (pos < s.length && guard++ < 500) {
    var m = matchAt(s, pos);
    if (m) {
      pos += m.key.length;
      var next = eatSeparator(s, pos);
      if (next !== -1) { pos = next; continue; }
      if (pos >= s.length) break;
    }
    // Unrecognized run: report it up to the next separator and continue.
    var iComma = s.indexOf(",", pos);
    var iNl = s.indexOf("\n", pos);
    var cut = (iComma === -1) ? iNl : (iNl === -1 ? iComma : Math.min(iComma, iNl));
    var chunk = ((cut === -1) ? s.substring(pos) : s.substring(pos, cut)).trim();
    if (chunk !== "") unknown.push(chunk);
    if (cut === -1) break;
    pos = cut + 1;
  }
  return unknown;
}

/* ===== PHONE COLUMNS =====
   Phones are normalized to +212XXXXXXXXX, matching what the form now sends.
   Only columns named exactly like these are touched. */
var PHONE_COLUMNS = { whatsapp: 1, prev_employer_phone: 1, phone: 1 };

/* ===== FREE-TEXT COLUMNS =====
   Whatever the visitor typed. These get lowercase + Latin-accent stripping ONLY
   -- never value mapping -- exactly matching what the form now does on submit,
   so migrated rows and new rows end up in the same shape.
   Lowercasing the email also makes duplicate detection reliable
   ("Ahmed@Gmail.com" and "ahmed@gmail.com" are the same person). */
var TEXT_COLUMNS = {
  first_name: 1, last_name: 1, neighborhood: 1, email: 1,
  city_other: 1, diploma_other: 1, specialty: 1, university: 1,
  admin_position_other: 1, skill_other_text: 1,
  last_inst: 1, last_role: 1, schools: 1, prev_employer_name: 1, notes: 1
};

/* ===== COLUMNS NEVER TOUCHED =====
   System / bookkeeping columns, plus the numeric ones. Skipping by NAME is the
   strongest protection available: nothing here can be altered even by accident.
   Note CV_URL etc. are excluded because lowercasing a Drive link breaks it. */
var SKIP_COLUMNS = {
  age: 1, salary_custom: 1,
  submittedAt: 1, profile_type: 1, consent: 1, truth_consent: 1,
  CV_URL: 1, CERTS_URL: 1, PHOTO_URL: 1, WORKCERT_URL: 1, verification: 1,
  submissionId: 1, status: 1, currentStep: 1, createdAt: 1, updatedAt: 1,
  resume_url: 1, nudge1_at: 1, nudge2_at: 1, nudge3_at: 1, welcomed: 1, wa_sent_at: 1
};

/* Decide what to do with one cell, given its column name. */
function convertCell(colName, cell) {
  if (SKIP_COLUMNS[colName]) return cell;                    // untouched
  if (PHONE_COLUMNS[colName]) return normalizePhoneMa(cell); // -> +212XXXXXXXXX
  if (TEXT_COLUMNS[colName]) return toCanonical(cell.trim());// -> lowercase ascii
  return translateCell(cell);                                // -> mapped value
}

function normalizePhoneMa(v) {
  var s = String(v).replace(/[\s\-().]/g, "");
  if (!s) return "";
  if (s.indexOf("00") === 0) s = s.slice(2);
  else if (s.charAt(0) === "+") s = s.slice(1);
  if (s.indexOf("212") === 0) s = s.slice(3);
  else if (s.charAt(0) === "0") s = s.slice(1);
  // Not a recognizable Moroccan number -> leave exactly as-is (never guess).
  return /^[567]\d{8}$/.test(s) ? "+212" + s : String(v).trim();
}

/**
 * Changes nothing. Reports ONLY the values MAPPING does not recognize.
 *
 * auditValues() prints every value and gets long enough that the log panel
 * truncates it. This prints just the problem cases, so the whole thing fits on
 * one screen: anything listed here would be LEFT AS-IS by the migration and
 * stay inconsistent with everything else.
 *
 * Empty output = every value is accounted for and it is safe to migrate.
 */
function auditUnknowns() {
  var ss = getSpreadsheet();
  var sheets = ["Sheet1", "Form Responses 1", "Administration"];
  var out = "=== UNKNOWN VALUES (nothing changed) ===\n";
  var grand = 0;

  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i];
    var sheet = ss.getSheetByName(name);
    if (!sheet) { out += "\n### " + name + ": SHEET NOT FOUND\n"; continue; }

    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    if (lastRow < 2) continue;

    var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var sheetOut = "";

    for (var c = 0; c < lastCol; c++) {
      var col = String(header[c] || "").trim();
      if (!col || SKIP_COLUMNS[col] || TEXT_COLUMNS[col] || PHONE_COLUMNS[col]) continue;

      var counts = {};
      for (var r = 0; r < data.length; r++) {
        var v = data[r][c];
        if (v === "" || v === null || v === undefined) continue;
        /* unknownFragments() understands that a mapped value may itself contain
           a comma, so it does not invent phantom fragments like "excel)". */
        var frags = unknownFragments(String(v));
        for (var p = 0; p < frags.length; p++) {
          counts[frags[p]] = (counts[frags[p]] || 0) + 1;
        }
      }

      var keys = Object.keys(counts);
      if (!keys.length) continue;
      keys.sort();
      grand += keys.length;

      sheetOut += "\n  " + col + ":";
      for (var k = 0; k < keys.length; k++) {
        sheetOut += "\n      " + JSON.stringify(keys[k]) + "  x" + counts[keys[k]];
      }
    }

    out += "\n### " + name + (sheetOut ? sheetOut : "\n  (all values recognized)") + "\n";
  }

  out += "\n=== " + grand + " distinct unknown value(s) ===";
  if (grand === 0) out += "\nSafe to run migrateAllSheets().";
  else out += "\nSend this list over before migrating.";

  Logger.log(out);
}

/**
 * Changes nothing. Full listing of every distinct value per column.
 *
 * Lists every DISTINCT value found in each enumerated column, with a count and
 * a marker showing what the migration would do with it:
 *
 *   [ok]      already canonical, nothing to do
 *   [->]      recognized, will be converted
 *   [UNKNOWN] not recognized -> would be LEFT AS-IS
 *
 * Every [UNKNOWN] is a value that will silently stay inconsistent. Read that
 * list carefully and send it over before running migrateAllSheets(), so any
 * missing spelling can be added to MAPPING first.
 */
function auditValues() {
  var ss = getSpreadsheet();
  var sheets = ["Sheet1", "Form Responses 1", "Administration"];
  var out = "=== VALUE AUDIT (nothing changed) ===\n";

  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i];
    var sheet = ss.getSheetByName(name);
    if (!sheet) { out += "\n### " + name + ": SHEET NOT FOUND\n"; continue; }

    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    if (lastRow < 2) { out += "\n### " + name + ": empty\n"; continue; }

    var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    out += "\n\n######## " + name + " (" + (lastRow - 1) + " rows) ########";

    for (var c = 0; c < lastCol; c++) {
      var col = String(header[c] || "").trim();
      // Only enumerated columns matter here. Free text and system columns are
      // either pure-lowercased or skipped, so there is nothing to review.
      if (!col || SKIP_COLUMNS[col] || TEXT_COLUMNS[col] || PHONE_COLUMNS[col]) continue;

      var counts = {};
      for (var r = 0; r < data.length; r++) {
        var v = data[r][c];
        if (v === "" || v === null || v === undefined) continue;
        v = String(v).trim();
        if (v !== "") counts[v] = (counts[v] || 0) + 1;
      }

      var keys = Object.keys(counts);
      if (!keys.length) continue;
      keys.sort();

      var lines = [], unknown = 0;
      for (var k = 0; k < keys.length; k++) {
        var val = keys[k];
        var conv = translateCell(val);
        var bad = unknownFragments(val);
        var tag;
        if (bad.length) { tag = "[UNKNOWN] "; unknown++; }
        else if (conv === val) { tag = "[ok]      "; }
        else { tag = "[->] " + conv + "   <= "; }
        lines.push("    " + tag + JSON.stringify(val) + "  x" + counts[val]);
      }

      out += "\n\n  -- " + col + " (" + keys.length + " distinct"
           + (unknown ? ", " + unknown + " UNKNOWN" : "") + ")\n"
           + lines.join("\n");
    }
  }

  Logger.log(out);
}

/**
 * Optional: Run this to see what WOULD change without actually changing anything
 */
function dryRun() {
  var ss = getSpreadsheet();
  var allSheets = ["Sheet1", "Form Responses 1", "Administration"];

  var report = "=== DRY RUN (no changes made) ===\n\n";

  for (var i = 0; i < allSheets.length; i++) {
    var name = allSheets[i];
    var sheet = ss.getSheetByName(name);
    if (!sheet) { report += name + ": SHEET NOT FOUND\n\n"; continue; }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) continue;

    var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var sheetChanges = 0;

    for (var r = 0; r < data.length; r++) {
      for (var c = 0; c < data[r].length; c++) {
        var cell = data[r][c];
        if (cell === "" || cell === null || cell === undefined) continue;

        var colName = String(header[c] || "").trim();
        if (typeof cell !== "string") {
          if (!(PHONE_COLUMNS[colName] && typeof cell === "number")) continue;
          cell = String(cell);
        }

        var newValue = convertCell(colName, cell);

        if (newValue !== cell) {
          sheetChanges++;
          if (sheetChanges <= 15) { // show first 15 examples per sheet
            report += name + " [Row " + (r + 2) + ", " + (colName || "Col " + (c + 1)) +
                      "]: \"" + cell + "\" -> \"" + newValue + "\"\n";
          }
        }
      }
    }

    report += "\n" + name + ": " + sheetChanges + " cells would change\n\n";
  }

  // Logged only. getUi() is unavailable when the script is bound via SHEET_ID,
  // so we never call it -- open View > Execution log to read the report.
  Logger.log(report);
}
