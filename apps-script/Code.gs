/* ===========================================================
   Linkify.ma - Google Apps Script backend (ASCII-safe, paste-proof)
   -----------------------------------------------------------
   1) doPost  -> save/upsert a registration (partial OR complete),
                 upload files to Drive, email you on completion.
   2) doGet   -> ?resume=TOKEN returns saved fields to prefill the form.
   3) processAbandoners -> hourly trigger that queues warm WhatsApp
                 nudges at 1h/24h/72h into a "To Contact" tab.

   SECURITY:
     - Secrets read from Script Properties (env-var equivalent).
     - Rate limiting per submissionId + global.
     - All input validated + sanitized (formula-injection guard).
     - No SQL is used (Sheets API), so no SQL-injection surface.

   NOTE: user-facing Arabic strings are stored as Base64 (pure ASCII) and
   decoded at runtime, so the whole file pastes cleanly into any editor.
   =========================================================== */


/* ============ NON-SECRET CONFIG ============ */
var CONFIG = {
  SHEET_NAME: "",                        // "" = use the FIRST sheet (your existing data sheet)
  // Live site domain used to build resume + retargeting links.
  // A Script Property named SITE_URL overrides this default if set.
  SITE_URL_DEFAULT: "https://linkify.ma",
  NUDGE_HOURS: [1, 24, 72],              // retargeting schedule (hours)
  MAX_FIELD_LEN: 5000,
  MAX_FILE_BYTES: 11 * 1024 * 1024,   // 10MB client limit + base64 rounding headroom
  RL_PER_SID: 40,
  RL_GLOBAL: 2000,
  RL_WINDOW_SEC: 60
};

var HEADERS = [
  "submittedAt", "first_name", "last_name", "age", "gender", "city", "city_other",
  "neighborhood", "whatsapp", "email", "transport", "license", "relocate", "profile_type", "track", "admin_position", "diploma",
  "diploma_other", "specialty", "university", "lang_ar", "lang_fr", "lang_en", "lang_es", "lang_de",
  "subjects", "subject_other_text", "levels", "institution_types", "early_role", "accompanist", "admin_position_other", "schedule", "substitute", "salary_expectation", "salary_custom", "contract_types",
  "has_experience", "exp_years", "last_inst", "last_role", "schools", "prev_employer_name", "prev_employer_phone",
  /* cv_pending = "oui" means the teacher asked to send the CV later. Their
     profile is registered but incomplete, so it is the queue to chase on
     WhatsApp rather than a lost visitor. The form always sends it explicitly,
     "oui" or "non", because this is an upsert: an absent field would leave an
     earlier "oui" standing after the CV finally arrived.
     Safe to slot here -- the teacher tabs are written through a name->column map
     (see ensureHeaders), not positionally like the Schools tab. */
  "skills", "skill_other_text", "consent", "truth_consent", "CV_URL", "cv_pending", "CERTS_URL", "PHOTO_URL", "WORKCERT_URL", "verification",
  "submissionId", "status", "currentStep", "createdAt", "updatedAt", "resume_url", "nudge1_at", "nudge2_at", "nudge3_at", "welcomed", "wa_sent_at"
];

var FILE_FIELDS = { cv: "CV_URL", certs: "CERTS_URL", photo: "PHOTO_URL", work_cert: "WORKCERT_URL" };
var ALLOWED_EXT = { cv: ["pdf", "doc", "docx"], certs: ["pdf", "jpg", "jpeg", "png"], photo: ["jpg", "jpeg", "png"], work_cert: ["pdf", "jpg", "jpeg", "png"] };

/* Columns for the separate "Schools" tab (B2B leads). */
var SCHOOL_SHEET = "Schools";
var SCHOOL_HEADERS = [
  "submissionId", "status", "currentStep", "createdAt", "updatedAt",
  "school_name", "institution_type", "city", "area", "contact_name", "role", "phone", "email",
  "subject", "subject_other", "level", "degree", "need_type", "work_type", "budget", "budget_custom", "contract_types", "min_experience", "prefer_local", "notes",
  "pricing_pref", "resume_url", "source", "usage_consent",
  /* pay_period tells you what "budget" is per: hour, month, 6 months or year.
     Without it "24000-36000" is unreadable. Appended at the END on purpose --
     rows are written positionally and only the header row is ever rewritten, so
     inserting it next to "budget" would shift every existing lead's columns. */
  "pay_period"
];
var SCHOOL_REQUIRED = ["school_name", "institution_type", "city", "area", "contact_name", "role", "phone", "subject", "level", "need_type", "work_type"];

/* ============ FACILITATORS (workshop facilitators) ============
   Facilitator registrations go to their OWN "Facilitators" tab in the SAME
   spreadsheet as the teachers. Like the teacher/admin tabs -- and UNLIKE the
   positional Schools tab -- rows are written through a name->column MAP
   (ensureHeadersFor/findRow/appendRow/updateRow), so the column ORDER in
   FAC_HEADERS is forgiving: adding a field later just appends a header, it never
   shifts existing rows. Carry cv_pending here for the same reason as teachers
   (the form always sends "oui"/"non" so an upsert cannot leave a stale "oui").
   File URLs live in CV_URL / PHOTO_URL / CERTIFICATE_URL. */
var FAC_SHEET = "Facilitators";
var FAC_HEADERS = [
  "submittedAt", "full_name", "whatsapp", "email", "age", "gender", "city", "city_other", "neighborhood",
  "diploma", "diploma_other",
  "portfolio_url", "profile_type", "consent_contact",
  "workshop_domains", "workshop_domain_other", "top_3_domains", "ready_now_specialty",
  "years_experience", "workshops_done", "past_venues",
  "age_groups", "max_participants", "workshop_languages",
  "available_days", "availability", "available_holidays", "workshops_per_week", "workshops_per_day",
  "transport", "work_cities", "notice_needed",
  "pay_per_workshop", "pay_full_service", "pay_full_day_3",
  "auto_entrepreneur",
  "has_equipment", "equipment_list", "has_laptop", "can_use_linkify_equipment",
  "prep_time", "ready_demo", "can_repeat_quality", "cancel_notice",
  "proposed_workshop_name", "proposed_workshop_age", "proposed_workshop_duration",
  "proposed_workshop_goal", "proposed_workshop_activities", "proposed_workshop_materials",
  "consent_data", "consent_truth", "consent_no_guarantee",
  "CV_URL", "cv_pending", "PHOTO_URL", "CERTIFICATE_URL", "verification",
  "submissionId", "status", "currentStep", "createdAt", "updatedAt", "resume_url",
  "nudge1_at", "nudge2_at", "nudge3_at", "welcomed", "wa_sent_at"
];
/* Non-partial (final submit) required set. Mirrors the client-side required
   fields recorded in FEAT-002 (full_name/whatsapp/email/city/consent_contact +
   top_3_domains/ready_now_specialty/years_experience + ready_demo + the three
   final consents). The CV file is required too, unless cv_pending === "oui"
   (the "I'll send it later" escape hatch); that is checked separately in
   validateFacilitator because it depends on the uploaded file, not a text field. */
var FAC_REQUIRED = ["full_name", "whatsapp", "email", "gender", "city", "consent_contact",
  "diploma", "top_3_domains", "ready_now_specialty", "years_experience", "ready_demo",
  "auto_entrepreneur",
  "workshops_per_week", "workshops_per_day",
  "consent_data", "consent_truth", "consent_no_guarantee"];

/* Facilitator file inputs -> URL columns, kept SEPARATE from the teacher
   FILE_FIELDS/ALLOWED_EXT maps so neither can affect the other. `certificate`
   accepts multiple files (joined with ", " like the teacher work_cert). */
var FAC_FILE_FIELDS = { cv: "CV_URL", photo: "PHOTO_URL", certificate: "CERTIFICATE_URL" };
var FAC_ALLOWED_EXT = { cv: ["pdf", "doc", "docx"], photo: ["jpg", "jpeg", "png"], certificate: ["pdf", "jpg", "jpeg", "png"] };

/* Arabic WhatsApp message parts, Base64 (UTF-8). Decoded lazily in msg_(). */
var MSG_B64 = {
  GREET_PRE: "2LPZhNin2YUg",
  GREET_WAVE: "IPCfkYs=",
  GREET_ANON: "2KfZhNiz2YTYp9mFINi52YTZitmD2YUg8J+Riw==",
  P1A: "CgrZhNin2K3YuNmG2Kcg2KPZhtmDINio2K/Zitiq2Yog2KfZhNiq2LPYrNmK2YQg2YHZgCBMaW5raWZ5INmI2YXYpyDZg9mF2ZHZhNiq2YrZh9i0LiDYqtmC2K/YsSDYqtmD2YXZkdmEINmF2YYg2YbZgdizINin2YTYqNmE2KfYtdipINin2YTZhNmKINmI2YLZgdiq2Yog2YHZitmH2Kcg2YXZhiDZh9mG2Kc6Cg==",
  P1B: "CgrYp9mE2KrYs9is2YrZhCDZhdis2KfZhtmKINiq2YXYp9mF2KfZiyDinIUg2YjZg9mK2KfYrtivINi62YrYsSDYr9mC2KfYptmCLg==",
  P2A: "CgrZhdmE2YHZgyDZgdmAIExpbmtpZnkg2YXYp9iy2KfZhCDZhdinINmD2YXZkdmE2LQuINin2YTZhdik2LPYs9in2Kog2KfZhNiq2LnZhNmK2YXZitipINin2YTZgtix2YrYqNipINmF2YbZgyDZg9iq2YLZhNioINi52YTZiSDYo9iz2KfYqtiw2Kkg2KjYrdin2YTZgyDwn46vCtmD2YXZkdmEINiq2LPYrNmK2YTZgyAo2KjYp9mC2Yog2LrZitixINiu2LfZiNin2Kog2YLZhNin2YQpOgo=",
  P3A: "CgrYotiu2LEg2KrYsNmD2YrYsSDwn5mPINmD2YXZkdmEINmF2YTZgdmDINmB2YAgTGlua2lmeSDYqNin2LQg2KfZhNmF2K/Yp9ix2LMg2KfZhNmC2LHZitio2Kkg2YXZhtmDINmK2YLYr9ix2Ygg2YrZiNi12YTZiCDZhNmK2YMuINmF2KzYp9mG2KfZiyDZiNmF2YYg2YbZgdizINin2YTYqNmE2KfYtdipOgo=",
  WELCOME_BODY: "CgrYqtmI2LXZkdmE2YbYpyDYqNmF2LnZhNmI2YXYp9iq2YMg2YHZgCBMaW5raWZ5INmI2LPYrNmR2YTZhtin2YfYpyDYqNmG2KzYp9itIOKchQrYtNmD2LHYp9mLINio2LLYp9mBINi52YTZiSDYp9mE2YjZgtiqINmI2KfZhNmF2KzZh9mI2K8g2KfZhNmE2Yog2K7YtdmR2LXYqtmKINio2KfYtCDYqti52YXZkdixINmF2YTZgdmD2Iwg2YjYudmE2Ykg2KfZhNir2YLYqSDYp9mE2YTZiiDZhdmG2K3YqtmK2YbYpyDwn5mPCti62KfYr9mKINmG2KrZiNin2LXZhNmIINmF2LnYp9mDINmF2KjYp9i02LHYqSDYpdmE2Kcg2YTZgtmK2YbYpyDYtNmKINmB2LHYtdipINiq2YbYp9iz2Kgg2YXZhNmB2YPYjCDZiNmE2Kcg2KXZhNinINin2K3Yqtin2KzZitmG2Kcg2LTZiiDYqtmI2LbZititLgrZhdix2K3YqNin2Ysg2KjZitmDINmF2LnYp9mG2Kcg2YHZgCBMaW5raWZ52Iwg2YjZhtiq2YXZhtin2Ygg2YTZitmDINmD2YQg2KfZhNiq2YjZgdmK2YIhIPCfmoA=",
  SUBJ_WELCOME: "2YXYsdit2KjYp9mLINio2YMg2YHZiiBMaW5raWZ5IOKAlCDYqtmFINin2LPYqtmE2KfZhSDZhdmE2YHZgyDinIU=",
  SUBJ_NUDGE: "TGlua2lmeTog2YPZhdmR2YQg2YXZhNmB2YMg2KfZhNmF2YfZhtmKIOKAlCDYqNmC2YrYqiDYrti32YjYp9iqINmC2YTZitmE2Kk=",
  WA_TEST: "2YXYsdit2KjYpyEg8J+RiyDZh9iw2Ycg2LHYs9in2YTYqSDYqtis2LHZitio2YrYqSDZhdmGIExpbmtpZnkg2LnYqNixINmI2KfYqtiz2KfYqCAoVHdpbGlvKS4g2KXYsNinINmI2LXZhNiq2YMg2YfYsNmHINin2YTYsdiz2KfZhNip2Iwg2YHYp9mE2LHYqNi3INmK2LnZhdmEINio2YbYrNin2K0g4pyF",
  WA_NAME_FALLBACK: "2KPYs9iq2KfYsCjYqSk="
};
var _MSG = null;
function msg_(k) {
  if (!_MSG) {
    _MSG = {};
    Object.keys(MSG_B64).forEach(function (x) {
      _MSG[x] = Utilities.newBlob(Utilities.base64Decode(MSG_B64[x])).getDataAsString("UTF-8");
    });
  }
  return _MSG[k];
}


/* ============ SECRETS (env-var equivalent) ============ */
function prop(key) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(key);
    return (v === null || v === undefined) ? "" : String(v);
  } catch (e) { return ""; }
}
function siteUrl() { return prop("SITE_URL") || CONFIG.SITE_URL_DEFAULT; }

// Build the resume link. Prefer the exact page the visitor submitted from (so an
// Administration lead resumes on administration.html, a teacher on the home page),
// but only accept our own domain to avoid abuse. Falls back to the home page.
function safeResumeUrl(u, sid) {
  var fallback = siteUrl() + "?resume=" + encodeURIComponent(sid);
  if (!u || typeof u !== "string") return fallback;
  if (u.indexOf("resume=") === -1) return fallback;
  if (/^https?:\/\/(www\.)?linkify\.ma\//i.test(u)) return u;
  if (siteUrl() && u.indexOf(siteUrl()) === 0) return u;
  return fallback;
}

function setupSecrets() {
  var secrets = {
    SHEET_ID: "",
    DRIVE_FOLDER_ID: "",
    NOTIFY_EMAIL: "",
    SITE_URL: "https://linkify.ma",
    GREENAPI_ID: "",
    GREENAPI_TOKEN: "",
    ADMIN_PHONE: ""
  };
  var store = PropertiesService.getScriptProperties();
  Object.keys(secrets).forEach(function (k) { if (secrets[k] !== "") store.setProperty(k, secrets[k]); });
}


/* ============ SERVER-SIDE ALLOW-LIST FOR ENUMERATED FIELDS ============
   The forms already restrict these values, but client-side constraints are UX
   only: a POST sent straight to this Web App URL never touches the page. Without
   this check arbitrary text can be written into the very columns the database
   and the matching depend on.

   Generated from the shipped forms so it cannot drift from what they offer.
   Regenerate whenever an option is added.

   Single vs multi matters and is not cosmetic. Several SINGLE-select values
   contain ", " themselves -- "oui, tout a fait pret", "oui, voiture",
   "oui, disponible pour remplacement urgent" -- so they must be matched whole.
   Splitting them would reject transport, relocate and substitute on every
   single submission. No MULTI value currently contains ", ", which is what makes
   the split below safe; the generator fails loudly if that ever stops being true.

   Rollout is deliberately two-stage. Violations are always recorded to the
   "Rejected Values" tab, but nothing is refused until the ENUM_STRICT script
   property is set to "true". That way a missing value shows up as a log line
   instead of a teacher being unable to register.
   ===================================================================== */

var ENUM_TEACHER = {
    accompanist: ["non", "oui"],
    admin_position: ["adjoint(e) du directeur / surveillant(e) general(e)", "autre poste administratif", "conseiller(ere) d'orientation / psychologue ou assistant(e) social(e)", "directeur(trice) general(e) / directeur(trice) pedagogique", "inspecteur(trice) / superviseur(e) pedagogique", "responsable rh ou inscriptions", "secretaire / agent administratif / receptionniste", "surveillant(e) general(e)", "technicien informatique / maintenance"],
    city: ["agadir", "ait melloul", "autre ville", "beni mellal", "berkane", "berrechid", "bouznika", "casablanca", "el jadida", "essaouira", "fes", "fquih ben salah", "inezgane", "kelaat sraghna", "kenitra", "khouribga", "ksar el kebir", "larache", "marrakech", "meknes", "mohammedia", "nador", "ouezzane", "oujda", "rabat", "safi", "sale", "sefrou", "settat", "sidi bennour", "sidi kacem", "sidi slimane", "skhirat", "tanger", "taroudant", "taza", "temara", "tetouan", "tiznit"],
    contract_types: ["auto-entrepreneur / freelance", "cdd (contrat a duree determinee)", "cdi (contrat a duree indeterminee)", "periode d'essai", "peu importe (tout type de contrat)", "remplacement temporaire", "stage / insertion", "temps partiel", "vacataire (a l'heure)"],
    cv_pending: ["non", "oui"],
    diploma: ["autre", "bac+2", "baccalaureat", "doctorat", "ingenieur", "licence", "master", "niveau baccalaureat"],
    early_role: ["assistante enseignante / aide-educatrice", "enseignante / educatrice"],
    exp_years: ["entre 1 et 3 ans", "entre 4 et 5 ans", "moins d'un an", "plus de 5 ans"],
    gender: ["f", "h"],
    has_experience: ["non (nouveau diplome)", "oui"],
    institution_types: ["centre de formation professionnelle", "centre de langues", "centre de soutien scolaire", "creche", "creche / prescolaire", "ecole privee", "etablissement d'enseignement superieur prive", "prescolaire (maternelle)"],
    lang_ar: ["aucune connaissance", "basique", "excellent", "intermediaire"],
    lang_de: ["aucune connaissance", "basique", "excellent", "intermediaire"],
    lang_en: ["aucune connaissance", "basique", "excellent", "intermediaire"],
    lang_es: ["aucune connaissance", "basique", "excellent", "intermediaire"],
    lang_fr: ["aucune connaissance", "basique", "excellent", "intermediaire"],
    levels: ["college", "creche (moins de 3 ans)", "enseignement superieur", "formation des adultes / formation continue", "grande section (5-6 ans)", "lycee", "moyenne section (4-5 ans)", "petite section (3-4 ans)", "prescolaire (3-5 ans)", "primaire"],
    license: ["aucun permis", "permis moto", "permis voiture"],
    relocate: ["non, ma ville uniquement", "oui, tout a fait pret", "selon l'offre et les avantages"],
    salary_expectation: ["2000-3500", "4000-6000", "7000-9000", "autre montant", "peu importe"],
    schedule: ["heures supplementaires / seances ponctuelles", "temps partiel", "temps plein", "tout ce qui precede"],
    subjects: ["anglais", "animation culturelle et eveil artistique", "arabe uniquement", "arts plastiques et visuels", "ateliers pedagogiques et innovation", "autre matiere", "education islamique", "education musicale", "education physique et sportive", "francais", "geologie", "gestion et comptabilite", "histoire-geographie", "informatique", "langue allemande", "langue anglaise", "langue arabe", "langue espagnole", "langue francaise", "mathematiques", "philosophie", "photographie et audiovisuel", "physique-chimie", "psychologie", "sciences de l'ingenieur", "sciences de la vie et de la terre", "technologie", "theatre et arts de la scene"],
    substitute: ["non", "oui, disponible pour remplacement urgent", "oui, selon les circonstances"],
    track: ["education artistique et culturelle", "education prescolaire et educatrices", "litteraire / sciences humaines", "scientifique / technique"],
    transport: ["aucun moyen de transport", "oui, moto", "oui, voiture"]
};
var ENUM_SCHOOL = {
    budget: ["100-150", "12000-21000", "150+", "2000-3500", "24000-36000", "24000-42000", "30-60", "4000-6000", "42000-54000", "48000-72000", "60-100", "7000-9000", "84000-108000", "لا يهم", "مبلغ آخر"],
    city: ["آسفي", "آيت ملول", "أكادير", "إنزكان", "الجديدة", "الدار البيضاء", "الرباط", "الصخيرات", "الصويرة", "العرائش", "الفقيه بن صالح", "القصر الكبير", "القنيطرة", "المحمدية", "الناضور", "برشيد", "بركان", "بني ملال", "بوزنيقة", "تارودانت", "تازة", "تطوان", "تمارة", "تيزنيت", "خريبكة", "سطات", "سلا", "سيدي بنور", "سيدي سليمان", "سيدي قاسم", "صفرو", "طنجة", "فاس", "قلعة السراغنة", "مدينة أخرى", "مراكش", "مكناس", "وجدة", "وزان"],
    contract_types: ["CDD (محدد المدة)", "CDI (غير محدد المدة)", "بالتوقيت / بالساعة", "تدريب / إدماج", "تعويض مؤقت", "دوام جزئي", "عقد تجريبي", "لا يهم (أي نوع عقد)", "مقاول ذاتي / Freelance"],
    degree: ["إجازة", "باكالوريا", "دبلوم (سنتان)", "دكتوراه", "لا يهم", "ماستر", "مهندس"],
    institution_type: ["روض / تعليم أولي", "مؤسسة تعليم عالي خاص", "مؤسسة تكوين مهني", "مدرسة خاصة", "مركز دعم وتقوية", "مركز لغات"],
    level: ["إعدادي", "ابتدائي", "تعليم أولي", "تكوين", "ثانوي تأهيلي", "حضانة", "دعم", "روض", "لغات"],
    min_experience: ["3 سنوات فأكثر", "5 سنوات فأكثر", "سنة فأكثر"],
    need_type: ["أريد تجربة الخدمة", "بداية السنة الدراسية", "خلال هذا الشهر", "فورية"],
    pay_period: ["بالساعة", "بالسنة", "بالشهر", "كل 6 أشهر"],
    prefer_local: ["لا يهم", "نعم، مفضّل"],
    role: ["سكرتير(ة)", "صاحب(ة) المؤسسة", "مدير(ة)", "مسؤول(ة) تربوي(ة)", "مفتش(ة)", "منسق(ة)", "موارد بشرية"],
    subject: ["إطار إداري آخر", "الإسبانية", "الاجتماعيات", "التربية الإسلامية", "التربية البدنية والرياضية", "التربية الفنية والثقافية", "التعليم الأولي", "الدعم واللغات", "الرياضيات", "الفرنسية", "الفلسفة", "الفيزياء والكيمياء", "اللغة الإنجليزية", "اللغة العربية", "المعلوميات", "تقني معلوميات / صيانة", "حارس(ة) عام", "سكرتير(ة) / موظف(ة) إداري / مسؤول(ة) استقبال", "علوم الحياة والأرض", "مادة أخرى", "مدير(ة) عام / مدير(ة) تربوي (بيداغوجي)", "مسؤول(ة) الموارد البشرية أو التسجيل", "مستشار(ة) في التوجيه / أخصائي(ة) نفسي(ة) أو اجتماعي(ة)", "مفتش(ة) / مشرف(ة) تربوي(ة)", "نائب(ة) المدير / ناظر(ة) المؤسسة"],
    work_type: ["تعويض مؤقت", "دوام جزئي", "دوام كامل", "ساعات محددة"]
};
/* Facilitator allow-list (generated from facilitators/index.html by
   tools/gen-enum-allowlist.mjs, same as ENUM_TEACHER/ENUM_SCHOOL). Purely-Arabic
   options are stored verbatim; Latin/mixed labels use lowercase-ascii-fr values.
   Two values keep an intentional lowercase Latin word ("حسب workshop",
   "أكثر من 72 ساعة قبل موعد workshop") because collectData lowercases them on the
   wire -- they MUST stay byte-identical here. Regenerate whenever an option
   changes on the facilitator form. */
var ENUM_FACILITATOR = {
    age_groups: ["10-12 سنة", "13-15 سنة", "16-18 سنة", "4-6 سنوات", "7-9 سنوات", "طلبة الجامعة"],
    auto_entrepreneur: ["لا", "نعم"],
    available_days: ["الأحد", "الأربعاء", "الإثنين", "الثلاثاء", "الجمعة", "الخميس", "السبت"],
    available_holidays: ["أحياناً", "لا", "نعم"],
    can_repeat_quality: ["لا", "نعم"],
    can_use_linkify_equipment: ["حسب نوع المعدات", "لا", "نعم"],
    cancel_notice: ["أقل من 24 ساعة", "أكثر من 72 ساعة قبل موعد workshop", "بين 24 و48 ساعة", "بين 48 و72 ساعة"],
    city: ["agadir", "ait melloul", "autre ville", "beni mellal", "berkane", "berrechid", "bouznika", "casablanca", "el jadida", "essaouira", "fes", "fquih ben salah", "inezgane", "kelaat sraghna", "kenitra", "khouribga", "ksar el kebir", "larache", "marrakech", "meknes", "mohammedia", "nador", "ouezzane", "oujda", "rabat", "safi", "sale", "sefrou", "settat", "sidi bennour", "sidi kacem", "sidi slimane", "skhirat", "tanger", "taroudant", "taza", "temara", "tetouan", "tiznit"],
    cv_pending: ["non", "oui"],
    diploma: ["autre", "bac+2", "baccalaureat", "doctorat", "ingenieur", "licence", "master", "niveau baccalaureat"],
    gender: ["f", "h"],
    has_equipment: ["لا", "نعم"],
    has_laptop: ["لا", "نعم"],
    max_participants: ["10-15", "16-20", "21-25", "26-30", "أقل من 10", "أكثر من 30"],
    notice_needed: ["24 ساعة", "3 أيام", "48 ساعة", "أسبوع"],
    past_venues: ["events", "جامعات", "جمعيات", "مخيمات", "مدارس خاصة", "مدارس عمومية", "مراكز تكوين", "مراكز لغات"],
    prep_time: ["1-2 ساعة", "30-60 دقيقة", "أقل من 30 دقيقة", "أكثر من ساعتين"],
    ready_demo: ["لا", "نعم"],
    transport: ["أخرى", "دراجة نارية", "سيارة", "لا أتوفر على وسيلة نقل خاصة"],
    work_cities: ["casablanca", "kenitra", "mohammedia", "rabat", "sale", "skhirat", "temara"],
    workshop_domains: ["art / drawing / crafts", "artificial intelligence (ai)", "autre domaine", "coding / programming", "communication skills", "creativity & innovation", "debate", "entrepreneurship", "financial literacy", "leadership", "mental math", "photography / video", "problem solving", "public speaking", "robotics", "science experiments", "theatre"],
    workshop_languages: ["الإنجليزية", "الدارجة المغربية", "العربية", "الفرنسية"],
    workshops_done: ["0", "1-5", "21-50", "6-20", "أكثر من 50"],
    years_experience: ["1-2 سنوات", "3-5 سنوات", "أقل من سنة", "أكثر من 5 سنوات", "لا توجد خبرة سابقة"]
};
/* Fields whose wire value is a ", "-joined list of options. Facilitator multi
   groups are added here so enumViolations splits them correctly; none of their
   values contains ", " (the generator's UNSAFE check confirms this), so the
   plain split is safe. The teacher/school multi fields are unchanged. */
var ENUM_MULTI = {
  subjects: 1, levels: 1, institution_types: 1, early_role: 1, contract_types: 1, admin_position: 1,
  workshop_domains: 1, past_venues: 1, age_groups: 1, workshop_languages: 1,
  available_days: 1, work_cities: 1
};

function enumStrict() { return prop("ENUM_STRICT") === "true"; }

/* Returns [{ field, value }] for every value outside its allow-list. */
function enumViolations(data, map) {
  var bad = [];
  Object.keys(map).forEach(function (field) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) return;
    var raw = data[field];
    if (raw === null || raw === undefined) return;
    raw = String(raw).trim();
    if (raw === "") return;                       // empty is handled elsewhere

    var allowed = map[field];
    if (allowed.indexOf(raw) !== -1) return;      // exact match, incl. commas

    if (!ENUM_MULTI[field]) {                     // single -> must match whole
      bad.push({ field: field, value: raw });
      return;
    }
    var parts = raw.split(", ");
    for (var i = 0; i < parts.length; i++) {
      var v = parts[i].trim();
      if (v !== "" && allowed.indexOf(v) === -1) {
        bad.push({ field: field, value: v });
        return;                                   // one report per field is enough
      }
    }
  });
  return bad;
}

/* Always recorded, even in log-only mode: this tab is how we find out whether it
   is safe to switch ENUM_STRICT on, and how we spot someone probing the
   endpoint. */
function recordRejectedValues(sid, formType, violations, enforced) {
  try {
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName("Rejected Values");
    if (!sh) {
      sh = ss.insertSheet("Rejected Values");
      sh.getRange(1, 1, 1, 6).setValues([["at", "submissionId", "form", "field", "value", "enforced"]]);
      sh.setFrozenRows(1);
    }
    var now = new Date();
    for (var i = 0; i < violations.length; i++) {
      sh.appendRow([now, sanitizeCell(sid), formType,
                    sanitizeCell(violations[i].field), sanitizeCell(violations[i].value),
                    enforced ? "rejected" : "logged only"]);
    }
  } catch (e) {}
}

function violationFields(violations) {
  var out = [];
  for (var i = 0; i < violations.length; i++) out.push(violations[i].field);
  return out;
}


/* ============ WEB APP ENTRY POINTS ============ */
function doPost(e) {
  try {
    if (rateLimited("global", CONFIG.RL_GLOBAL, CONFIG.RL_WINDOW_SEC)) {
      return json({ status: "rate_limited" });
    }
    var data = JSON.parse(e.postData.contents);
    if (data.website && String(data.website).trim() !== "") {
      return json({ status: "ignored" });
    }
    if (data.formType === "school") { return handleSchoolPost(data); }
    if (data.formType === "facilitator" || data.profile_type === "facilitator") { return handleFacilitatorPost(data); }
    var sid = sanitizeToken(data.submissionId) || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
    if (rateLimited("sid_" + sid, CONFIG.RL_PER_SID, CONFIG.RL_WINDOW_SEC)) {
      return json({ status: "rate_limited" });
    }
    var isPartial = (data.partial === true) || (data.status === "partial");
    var errors = validatePayload(data, isPartial);
    if (errors.length) return json({ status: "invalid", fields: errors });

    /* Enumerated fields must come from the lists the forms offer. Runs for
       partial saves too -- a partial write pollutes the same columns. */
    var enumBad = enumViolations(data, ENUM_TEACHER);
    if (enumBad.length) {
      var enforce = enumStrict();
      recordRejectedValues(sid, "teacher", enumBad, enforce);
      if (enforce) return json({ status: "invalid", fields: violationFields(enumBad) });
    }

    var now = new Date();
    var record = {};
    HEADERS.forEach(function (h) {
      if (Object.prototype.hasOwnProperty.call(data, h)) record[h] = sanitizeCell(data[h]);
    });
    record.submissionId = sid;
    record.status = isPartial ? "partial" : "complete";
    if (data.currentStep !== undefined && data.currentStep !== null) {
      record.currentStep = clampInt(data.currentStep, 0, 10, 0);
    }
    record.updatedAt = now.toISOString();
    if (!isPartial) record.submittedAt = now.toISOString();
    record.resume_url = safeResumeUrl(data.resumeUrl, sid);

    // Upload files to Drive OUTSIDE the lock. Drive I/O takes seconds; keeping it
    // out of the lock prevents ALL submissions from serializing behind each other
    // during ad-traffic spikes -- the root cause of the intermittent submit errors.
    if (data.files) {
      var folder = getFolder();
      Object.keys(FILE_FIELDS).forEach(function (field) {
        var f = data.files[field];
        if (!f) return;
        if (Object.prototype.toString.call(f) === "[object Array]") {
          // multiple files (e.g. several work certificates) -> save each, join URLs
          var urls = [];
          for (var j = 0; j < f.length && j < 5; j++) {
            var item = f[j];
            if (item && item.data && validateFile(field, item).ok) {
              try { urls.push(saveFile(folder, item, sid + "_" + field + "_" + j)); } catch (upErr) {}
            }
          }
          if (urls.length) record[FILE_FIELDS[field]] = urls.join(", ");
        } else if (f.data) {
          if (validateFile(field, f).ok) {
            try { record[FILE_FIELDS[field]] = saveFile(folder, f, sid + "_" + field); } catch (upErr2) {}
          }
        }
      });
    }

    // verification tier: self -> refs -> docs -> docs+refs (Linkify-verified is set manually)
    var hasCert = record.WORKCERT_URL && String(record.WORKCERT_URL).indexOf("http") === 0;
    var hasRef = (record.prev_employer_name && String(record.prev_employer_name).trim() !== "") ||
                 (record.prev_employer_phone && String(record.prev_employer_phone).trim() !== "");
    record.verification = (hasCert && hasRef) ? "docs+refs" : hasCert ? "docs" : hasRef ? "refs" : "self";

    // Hold the lock ONLY for the fast sheet read-modify-write (milliseconds).
    var welcomeInfo = null;
    var lock = LockService.getScriptLock();
    try { lock.waitLock(30000); } catch (err) {}
    try {
      var sheet = getSheetFor(data);
      var map = ensureHeaders(sheet);
      var rowIndex = findRow(sheet, map, sid);
      if (rowIndex > 0) {
        updateRow(sheet, map, rowIndex, record);
      } else {
        record.createdAt = now.toISOString();
        appendRow(sheet, map, record);
      }
      // Mark "welcomed" atomically inside the lock; SEND the emails outside it.
      if (!isPartial && map["welcomed"]) {
        var savedRow = (rowIndex > 0) ? rowIndex : findRow(sheet, map, sid);
        if (savedRow > 0 && !sheet.getRange(savedRow, map["welcomed"]).getValue()) {
          var rv = sheet.getRange(savedRow, 1, 1, sheet.getLastColumn()).getValues()[0];
          welcomeInfo = {
            name: cell(rv, map, "first_name") || "",
            phone: normalizePhone(cell(rv, map, "whatsapp")),
            email: cell(rv, map, "email")
          };
          sheet.getRange(savedRow, map["welcomed"]).setValue(now);
        }
      }
    } finally {
      try { lock.releaseLock(); } catch (e2) {}
    }

    // Slow notifications run AFTER the lock is released (they don't need it, and
    // must never block other submissions).
    if (!isPartial) {
      try { notifyEmail(record); } catch (mailErr) {}
      if (welcomeInfo) {
        try { queueWelcome(welcomeInfo.name, welcomeInfo.phone); } catch (qErr) {}
        if (welcomeInfo.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(welcomeInfo.email))) {
          try { sendMail(String(welcomeInfo.email), msg_("SUBJ_WELCOME"), buildWelcomeMessage(welcomeInfo.name)); } catch (eErr) {}
        }
      }
    }
    return json({ status: isPartial ? "partial" : "success" });
  } catch (err) {
    return json({ status: "error" });
  }
}

function doGet(e) {
  if (rateLimited("global", CONFIG.RL_GLOBAL, CONFIG.RL_WINDOW_SEC)) {
    return json({ status: "rate_limited" });
  }
  var raw = (e && e.parameter) ? e.parameter.resume : null;
  if (!raw) return json({ status: "ok", message: "Linkify backend is running." });
  var token = sanitizeToken(raw);
  if (!token) return json({ status: "notfound" });
  if (rateLimited("get_" + token, CONFIG.RL_PER_SID, CONFIG.RL_WINDOW_SEC)) {
    return json({ status: "rate_limited" });
  }
  if (e.parameter.t === "s") return schoolResume(token);   // schools resume
  if (e.parameter.t === "f") return facilitatorResume(token);   // facilitators resume
  try {
    var sheet = (e.parameter.t === "a") ? getAdminSheet() : getSheet();
    var map = ensureHeaders(sheet);
    var rowIndex = findRow(sheet, map, token);
    if (rowIndex < 1) return json({ status: "notfound" });
    var values = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    var record = {};
    Object.keys(map).forEach(function (h) {
      if (/_URL$/.test(h)) return; // never expose any stored file link via the public resume endpoint
      var v = values[map[h] - 1];
      if (v !== "" && v !== null && v !== undefined) record[h] = v;
    });
    return json({ status: "found", record: record });
  } catch (err) {
    return json({ status: "error" });
  }
}


/* ============ RETARGETING ENGINE ============ */
function processAbandoners() {
  processAbandonersSheet(getSheet(), true);           // teachers: email + WhatsApp
  try { processAbandonersSheet(getAdminSheet(), false); } catch (e) {}  // admin: email only for now
}
// WhatsApp retargeting is enabled only when WA_RETARGET_ENABLED == "true" AND a
// template + credentials are configured. It fires ONCE per lead at WA_NUDGE_STAGE
// (default 1) and is tracked by the wa_sent_at column so it never repeats.
function waRetargetOn() { return prop("WA_RETARGET_ENABLED") === "true" && !!prop("WA_TEMPLATE_NAME") && !!prop("WA_PHONE_ID") && !!prop("WA_CLOUD_TOKEN"); }
function waRetargetStage() { var s = parseInt(prop("WA_NUDGE_STAGE") || "1", 10); return (s >= 1 && s <= 3) ? s : 1; }
function sendRetargetTemplate(phone, name, token) {
  var comps = [
    { type: "body", parameters: [{ type: "text", text: (name || msg_("WA_NAME_FALLBACK")) }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: String(token) }] }
  ];
  return sendWhatsAppTemplate(phone, prop("WA_TEMPLATE_NAME"), prop("WA_TEMPLATE_LANG") || "ar", comps);
}
function processAbandonersSheet(sheet, sendWA) {
  var map = ensureHeaders(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  var now = new Date();
  var contact = getContactSheet();

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowNum = i + 2;
    if (String(cell(row, map, "status")) !== "partial") continue;
    var updatedAt = cell(row, map, "updatedAt");
    var t = updatedAt ? new Date(updatedAt).getTime() : 0;
    if (!t) continue;
    var hours = (now.getTime() - t) / 3600000;
    var name = cell(row, map, "first_name") || "";
    var phone = normalizePhone(cell(row, map, "whatsapp"));
    var sid = cell(row, map, "submissionId");
    var resumeUrl = cell(row, map, "resume_url") || (siteUrl() + "?resume=" + encodeURIComponent(sid));

    for (var n = 0; n < CONFIG.NUDGE_HOURS.length; n++) {
      var stage = n + 1;
      var col = map["nudge" + stage + "_at"];
      if (!row[col - 1] && hours >= CONFIG.NUDGE_HOURS[n]) {
        var msg = buildNudgeMessage(stage, name, resumeUrl);
        var waLink = phone ? ("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg)) : "";
        contact.appendRow([now, sanitizeCell(name), phone, "Nudge " + stage, resumeUrl, waCell(waLink), sanitizeCell(msg)]);
        // automatic recovery EMAIL to the abandoner (free, no bans, fully automatic)
        var abEmail = cell(row, map, "email");
        if (abEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(abEmail))) {
          try { sendMail(String(abEmail), msg_("SUBJ_NUDGE"), msg); } catch (emErr) {}
        }
        // automatic WhatsApp retargeting (teachers only, once per lead, at the configured stage)
        if (sendWA && waRetargetOn() && phone && stage === waRetargetStage() && !cell(row, map, "wa_sent_at")) {
          try { if (sendRetargetTemplate(phone, name, sid) && map["wa_sent_at"]) sheet.getRange(rowNum, map["wa_sent_at"]).setValue(now); } catch (waErr) {}
        }
        sheet.getRange(rowNum, col).setValue(now);
        adminAlert("Linkify - nudge " + stage + " ready:\n" + name + " (" + phone + ")\n" + waLink);
        break;
      }
    }
  }
}

/* Warm confirmation/thank-you sent (semi-automatically) to a teacher who
   COMPLETED registration. Queued into the "Welcome" tab with a ready wa.me link
   so the team can tap and send it personally. */
function queueWelcome(name, phone) {
  var msg = buildWelcomeMessage(name);
  var waLink = phone ? ("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg)) : "";
  getWelcomeSheet().appendRow([new Date(), sanitizeCell(name), phone, waCell(waLink), sanitizeCell(msg)]);
}

// Plain URLs written by Apps Script are NOT clickable in Sheets; wrap them in a
// HYPERLINK formula so the team can just click "Send message".
function waCell(url) {
  return url ? ('=HYPERLINK("' + url + '","\ud83d\udcf2 Send message")') : "";
}

// ONE-TIME FIX: make already-written wa.me links clickable in the Welcome and
// "To Contact" tabs. Safe to run repeatedly (skips ones already converted).
function makeLinksClickable() {
  var ss = getSpreadsheet();
  var targets = [["Welcome", 4], ["To Contact", 6]];
  var total = 0;
  for (var t = 0; t < targets.length; t++) {
    var sh = ss.getSheetByName(targets[t][0]);
    if (!sh) continue;
    var col = targets[t][1];
    var last = sh.getLastRow();
    if (last < 2) continue;
    var rng = sh.getRange(2, col, last - 1, 1);
    var vals = rng.getValues();
    for (var i = 0; i < vals.length; i++) {
      var v = String(vals[i][0] || "");
      if (v.indexOf("https://wa.me/") === 0) { vals[i][0] = '=HYPERLINK("' + v + '","\ud83d\udcf2 Send message")'; total++; }
    }
    rng.setValues(vals);
  }
  Logger.log("Made " + total + " wa.me link(s) clickable across Welcome + To Contact.");
}

function buildWelcomeMessage(name) {
  var hi = name ? (msg_("GREET_PRE") + name + msg_("GREET_WAVE")) : msg_("GREET_ANON");
  return hi + msg_("WELCOME_BODY");
}

// DIAGNOSTIC: run from the editor, then open Execution log. Shows the exact
// header row, the whatsapp column index, and for the first rows the raw phone
// value + normalized phone + built link. Reveals why links come out empty.
function diagnoseWelcome() {
  var sheet = getSheet();
  var map = ensureHeaders(sheet);
  Logger.log("Sheet name: " + sheet.getName());
  Logger.log("Header row: " + JSON.stringify(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]));
  Logger.log("whatsapp column index (1-based): " + map["whatsapp"]);
  Logger.log("first_name column index: " + map["first_name"]);
  var last = sheet.getLastRow();
  if (last < 2) { Logger.log("No data rows."); return; }
  var n = Math.min(6, last - 1);
  var rows = sheet.getRange(2, 1, n, sheet.getLastColumn()).getValues();
  for (var i = 0; i < rows.length; i++) {
    var raw = cell(rows[i], map, "whatsapp");
    var norm = normalizePhone(raw);
    Logger.log("row " + (i + 2)
      + " | status=" + cell(rows[i], map, "status")
      + " | name=" + cell(rows[i], map, "first_name")
      + " | whatsapp raw='" + raw + "' (type " + (typeof raw) + ")"
      + " | normalized='" + norm + "'"
      + " | link=" + (norm ? ("https://wa.me/" + norm) : "(EMPTY - no phone)"));
  }
}

// ONE-TIME BACKFILL: run this from the editor to queue a welcome for every
// teacher who ALREADY completed the form but wasn't welcomed yet. Safe to run
// again anytime (it skips anyone already welcomed, so no duplicates).
function welcomeExisting() {
  var sheet = getSheet();
  var map = ensureHeaders(sheet);
  var last = sheet.getLastRow();
  if (last < 2) { Logger.log("No rows yet."); return; }
  var rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  var wCol = map["welcomed"];
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(cell(rows[i], map, "status")) !== "complete") continue;   // completed only
    if (wCol && rows[i][wCol - 1]) continue;                              // already welcomed
    queueWelcome(cell(rows[i], map, "first_name") || "", normalizePhone(cell(rows[i], map, "whatsapp")));
    if (wCol) sheet.getRange(i + 2, wCol).setValue(new Date());
    count++;
  }
  Logger.log("Queued welcome for " + count + " existing teacher(s). Open the 'Welcome' tab to send them.");
}

function getWelcomeSheet() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName("Welcome");
  if (!sh) {
    sh = ss.insertSheet("Welcome");
    sh.getRange(1, 1, 1, 5).setValues([["registeredAt", "name", "phone", "whatsappLink", "message"]]);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 5).setValues([["registeredAt", "name", "phone", "whatsappLink", "message"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function buildNudgeMessage(stage, name, resumeUrl) {
  var hi = name ? (msg_("GREET_PRE") + name + msg_("GREET_WAVE")) : msg_("GREET_ANON");
  if (stage === 1) return hi + msg_("P1A") + resumeUrl + msg_("P1B");
  if (stage === 2) return hi + msg_("P2A") + resumeUrl;
  return hi + msg_("P3A") + resumeUrl;
}


/* ============ VALIDATION + SANITIZATION ============ */
function validatePayload(data, isPartial) {
  var errors = [];
  var emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var phoneRe = /^(?:\+212|212|0)[567]\d{8}$/;
  if (data.email && !emailRe.test(String(data.email))) errors.push("email");
  if (data.whatsapp && !phoneRe.test(String(data.whatsapp).replace(/[\s\-().]/g, ""))) errors.push("whatsapp");
  if (data.age !== undefined && data.age !== "") {
    var a = parseInt(data.age, 10);
    if (isNaN(a) || a < 16 || a > 80) errors.push("age");
  }
  if (data.currentStep !== undefined && data.currentStep !== null && data.currentStep !== "") {
    var st = parseInt(data.currentStep, 10);
    if (isNaN(st) || st < 0 || st > 10) errors.push("currentStep");
  }
  if (!isPartial) {
    ["first_name", "last_name", "whatsapp", "email"].forEach(function (f) {
      if (!data[f] || String(data[f]).trim() === "") errors.push("missing:" + f);
    });
    if (!data.consent) errors.push("missing:consent");
  }
  return errors;
}

function validateFile(field, f) {
  try {
    var name = String(f.name || "");
    var ext = name.indexOf(".") >= 0 ? name.split(".").pop().toLowerCase() : "";
    var allowed = ALLOWED_EXT[field] || [];
    if (allowed.indexOf(ext) === -1) return { ok: false, reason: "type" };
    var bytes = Math.floor(String(f.data).length * 3 / 4);
    if (bytes > CONFIG.MAX_FILE_BYTES) return { ok: false, reason: "size" };
    return { ok: true };
  } catch (e) { return { ok: false, reason: "error" }; }
}

function sanitizeCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  if (v instanceof Date) return v;
  var s = String(v);
  if (s.length > CONFIG.MAX_FIELD_LEN) s = s.substring(0, CONFIG.MAX_FIELD_LEN);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function sanitizeToken(v) {
  if (!v) return "";
  var s = String(v);
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : "";
}

function clampInt(v, min, max, dflt) {
  var n = parseInt(v, 10);
  if (isNaN(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

function rateLimited(key, maxHits, windowSec) {
  try {
    var cache = CacheService.getScriptCache();
    var k = "rl_" + key;
    var cur = parseInt(cache.get(k) || "0", 10);
    if (cur >= maxHits) return true;
    cache.put(k, String(cur + 1), windowSec);
    return false;
  } catch (e) { return false; }
}


/* ============ SHEET HELPERS ============ */
function getSpreadsheet() {
  var id = prop("SHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Set SHEET_ID in Script Properties, or bind this script to your Sheet.");
  return ss;
}

function getSheet() {
  var ss = getSpreadsheet();
  // Prefer an explicit tab name from Script Property SHEET_NAME (deterministic,
  // safe even if tab order changes); otherwise fall back to the first sheet.
  var name = prop("SHEET_NAME") || CONFIG.SHEET_NAME;
  var sh = name ? ss.getSheetByName(name) : ss.getSheets()[0];
  if (!sh) sh = ss.insertSheet(name || "Registrations");
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Administrative-staff submissions live in their OWN tab, separate from teachers.
var ADMIN_SHEET = "Administration";
function getAdminSheet() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(ADMIN_SHEET);
  if (!sh) sh = ss.insertSheet(ADMIN_SHEET);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}
// Facilitator submissions live in their OWN tab, separate from teachers/admin.
// Map-based (name->column) like the teacher/admin tabs, so FAC_HEADERS order is
// forgiving (contrast the positional Schools tab).
function getFacilitatorSheet() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(FAC_SHEET);
  if (!sh) sh = ss.insertSheet(FAC_SHEET);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, FAC_HEADERS.length).setValues([FAC_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}
// Route a submission to the right tab based on its profile type.
function getSheetFor(data) {
  if (data && data.profile_type === "facilitator") return getFacilitatorSheet();
  return (data && data.profile_type === "administration") ? getAdminSheet() : getSheet();
}

/* ensureHeaders was teacher-specific (it hard-coded HEADERS). To support the
   Facilitators tab without touching the many teacher/admin callers, the logic is
   factored into ensureHeadersFor(sheet, headers) and ensureHeaders() now simply
   passes HEADERS -- so every existing caller behaves EXACTLY as before, while
   the facilitator path can pass FAC_HEADERS. */
function ensureHeadersFor(sheet, headers) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  header.forEach(function (h, i) { if (h !== "" && h !== null) map[String(h)] = i + 1; });
  var missing = headers.filter(function (h) { return !map[h]; });
  if (missing.length) {
    var start = sheet.getLastColumn() + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    missing.forEach(function (h, i) { map[h] = start + i; });
    sheet.setFrozenRows(1);
  }
  return map;
}
function ensureHeaders(sheet) {
  return ensureHeadersFor(sheet, HEADERS);
}

function findRow(sheet, map, sid) {
  var col = map["submissionId"];
  if (!col) return -1;
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(sid)) return i + 2;
  }
  return -1;
}

function appendRow(sheet, map, record) {
  var width = sheet.getLastColumn();
  var row = [];
  for (var i = 0; i < width; i++) row.push("");
  Object.keys(record).forEach(function (k) { if (map[k]) row[map[k] - 1] = record[k]; });
  sheet.appendRow(row);
}

function updateRow(sheet, map, rowIndex, record) {
  Object.keys(record).forEach(function (k) {
    if (map[k] && record[k] !== undefined) sheet.getRange(rowIndex, map[k]).setValue(record[k]);
  });
}

function cell(row, map, headerName) {
  var col = map[headerName];
  return col ? row[col - 1] : "";
}

function getContactSheet() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName("To Contact");
  if (!sh) {
    sh = ss.insertSheet("To Contact");
    sh.getRange(1, 1, 1, 7).setValues([["queuedAt", "name", "phone", "stage", "resumeUrl", "whatsappLink", "message"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}


/* ============ FILES / EMAIL / WHATSAPP ============ */
function getFolder() {
  var id = prop("DRIVE_FOLDER_ID");
  if (id) return DriveApp.getFolderById(id);
  var it = DriveApp.getFoldersByName("Linkify Uploads");
  return it.hasNext() ? it.next() : DriveApp.createFolder("Linkify Uploads");
}

function saveFile(folder, fileObj, baseName) {
  var bytes = Utilities.base64Decode(fileObj.data);
  var safeName = sanitizeToken(baseName) + "_" + String(fileObj.name || "file").replace(/[^\w.\-]/g, "_");
  var blob = Utilities.newBlob(bytes, fileObj.type || "application/octet-stream", safeName);
  var file = folder.createFile(blob);
  /* Uploads stay PRIVATE.

     These are CVs: full name, phone, email, address, studies, previous
     employers, often a photo. The previous setting was ANYONE_WITH_LINK, which
     let anyone holding the URL read one with no account, no permission and no
     trace -- and those URLs are stored in the sheet, so anyone who ever sees the
     sheet or a screenshot of it holds them permanently.

     Link-sharing was never needed: the team reaches these files through the
     Drive folder they own. Grant access by sharing the "Linkify Uploads" FOLDER
     with the specific people who need it, not by publishing every file.

     Set explicitly rather than relying on the folder's current state, so a
     folder that is itself link-shared cannot silently make uploads public. */
  try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {}
  return file.getUrl();
}

/* ============ UPLOAD SHARING MAINTENANCE ============
   saveFile() now keeps new uploads private, but every file uploaded BEFORE that
   change is still shared with "anyone with the link". These two functions report
   on and repair the existing files.

   Run auditUploadSharing() first: it changes nothing and tells you how many
   files are currently public. Then run lockDownUploads() until it reports DONE.

   Both are resumable. Apps Script stops a function at 6 minutes, and there can
   easily be over a thousand files, so progress is saved in a continuation token
   and each run picks up where the last one stopped. Re-run until you see DONE.
   ==================================================================== */

var LOCKDOWN_TOKEN_KEY = "uploadLockdownToken";
var LOCKDOWN_DONE_KEY  = "uploadLockdownDone";   // cumulative count across passes
var LOCKDOWN_BUDGET_MS = 4.5 * 60 * 1000;        // stop well before the 6-minute kill
var AUDIT_TOKEN_KEY    = "uploadAuditToken";     // the audit is resumable too
var AUDIT_SEEN_KEY     = "uploadAuditSeen";
var AUDIT_PUB_KEY      = "uploadAuditPublic";

function isPubliclyShared(file) {
  try {
    var a = file.getSharingAccess();
    return a === DriveApp.Access.ANYONE || a === DriveApp.Access.ANYONE_WITH_LINK;
  } catch (e) { return false; }
}

/* Changes nothing. Counts how many uploads are readable by anyone with the URL.

   Resumable, for the same reason the sweep is: reading the sharing state costs
   one Drive call per file, so a single pass cannot reach the end of a few
   thousand files before Apps Script stops it. The first version silently
   reported only what it managed to reach -- it said "1270 scanned" for a folder
   holding roughly twice that, which looks like a complete answer and is not.

   Re-run until it logs DONE. Counts accumulate across passes. */
function auditUploadSharing() {
  var started = Date.now();
  var store = PropertiesService.getScriptProperties();
  var token = store.getProperty(AUDIT_TOKEN_KEY);
  var seen  = parseInt(store.getProperty(AUDIT_SEEN_KEY) || "0", 10);
  var pub   = parseInt(store.getProperty(AUDIT_PUB_KEY)  || "0", 10);

  var it = token ? DriveApp.continueFileIterator(token) : getFolder().getFiles();
  var examples = [];

  while (it.hasNext()) {
    if (Date.now() - started > LOCKDOWN_BUDGET_MS) {
      store.setProperty(AUDIT_TOKEN_KEY, it.getContinuationToken());
      store.setProperty(AUDIT_SEEN_KEY, String(seen));
      store.setProperty(AUDIT_PUB_KEY, String(pub));
      Logger.log("Paused to stay inside the time limit -- counts so far:");
      Logger.log("  scanned : " + seen);
      Logger.log("  PUBLIC  : " + pub);
      Logger.log("  private : " + (seen - pub));
      Logger.log("");
      Logger.log("  NOT FINISHED -- run auditUploadSharing() again to continue.");
      return;
    }
    var f = it.next();
    seen++;
    if (isPubliclyShared(f)) {
      pub++;
      if (examples.length < 5) examples.push(f.getName());
    }
  }

  store.deleteProperty(AUDIT_TOKEN_KEY);
  store.deleteProperty(AUDIT_SEEN_KEY);
  store.deleteProperty(AUDIT_PUB_KEY);

  Logger.log("DONE -- every file in the folder was checked.");
  Logger.log("  scanned : " + seen);
  Logger.log("  PUBLIC  : " + pub + "   (readable by anyone with the link)");
  Logger.log("  private : " + (seen - pub));
  if (examples.length) Logger.log("  examples: " + examples.join(", "));
  Logger.log("");
  Logger.log(pub ? "  Run startUploadLockdown() to make these private."
                 : "  Nothing to fix. Every upload is private.");
}

/* Schedules the sweep to run itself until it finishes, then stop.
   With a couple of thousand files a single pass is not enough, and clicking Run
   six or seven times is a good way to lose track of where you are. */
function startUploadLockdown() {
  stopUploadLockdown();
  ScriptApp.newTrigger("lockDownUploads").timeBased().everyMinutes(5).create();
  Logger.log("Scheduled: lockDownUploads() every 5 minutes. It deletes its own");
  Logger.log("trigger once every file is done, so there is nothing to turn off.");
  Logger.log("Running the first pass now...\n");
  lockDownUploads();
}

function stopUploadLockdown() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "lockDownUploads") { ScriptApp.deleteTrigger(t); n++; }
  });
  if (n) Logger.log("Removed " + n + " scheduled sweep trigger(s).");
  return n;
}

/* Makes every upload private. Resumable, and safe to run manually or on a
   trigger. Re-run (or let the trigger re-run it) until it logs DONE. */
function lockDownUploads() {
  /* A manual run and a scheduled run must never share a continuation token, or
     one of them would skip a whole batch. */
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log("Another sweep is already running -- skipping this pass.");
    return;
  }

  try {
    var started = Date.now();
    var store = PropertiesService.getScriptProperties();
    var token = store.getProperty(LOCKDOWN_TOKEN_KEY);
    var done = parseInt(store.getProperty(LOCKDOWN_DONE_KEY) || "0", 10);

    var it = token ? DriveApp.continueFileIterator(token) : getFolder().getFiles();
    var seen = 0, failed = 0;

    while (it.hasNext()) {
      if (Date.now() - started > LOCKDOWN_BUDGET_MS) {
        store.setProperty(LOCKDOWN_TOKEN_KEY, it.getContinuationToken());
        store.setProperty(LOCKDOWN_DONE_KEY, String(done + seen));
        Logger.log("Paused to stay inside the time limit.");
        Logger.log("  this pass: " + seen + " file(s), failed " + failed);
        Logger.log("  total so far: " + (done + seen));
        Logger.log(stillScheduled() ? "  the trigger will continue automatically in ~5 min."
                                    : "  RUN lockDownUploads() AGAIN to continue.");
        return;
      }
      var f = it.next();
      seen++;
      try {
        /* Set unconditionally instead of reading getSharingAccess() first.
           Checking doubled the Drive calls per file and halved throughput; on an
           already-private file this is simply a no-op. auditUploadSharing()
           confirms the end state, so nothing is lost by not checking here.

           PRIVATE removes only the anyone-with-link grant. People and groups
           with explicit access to the file or its folder keep it, so the team
           does not lose anything. */
        f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      } catch (e) {
        failed++;
        if (failed <= 5) Logger.log("  could not change: " + f.getName() + " -- " + e);
      }
    }

    store.deleteProperty(LOCKDOWN_TOKEN_KEY);
    store.deleteProperty(LOCKDOWN_DONE_KEY);
    stopUploadLockdown();

    Logger.log("DONE.");
    Logger.log("  this pass: " + seen + " file(s), failed " + failed);
    Logger.log("  total processed: " + (done + seen));
    if (failed) Logger.log("  re-run once more to retry the failures.");
    Logger.log("  Verify with auditUploadSharing() -- it should report PUBLIC: 0");
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function stillScheduled() {
  var found = false;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "lockDownUploads") found = true;
  });
  return found;
}

/* Clears a stale continuation token if a run died mid-way and you want to start
   the sweep from the beginning again. */
function resetUploadLockdown() {
  var store = PropertiesService.getScriptProperties();
  [LOCKDOWN_TOKEN_KEY, LOCKDOWN_DONE_KEY,
   AUDIT_TOKEN_KEY, AUDIT_SEEN_KEY, AUDIT_PUB_KEY].forEach(function (k) {
    store.deleteProperty(k);
  });
  var removed = stopUploadLockdown();
  Logger.log("Progress reset for both the sweep and the audit.");
  if (removed) Logger.log("WARNING: this also CANCELLED the running sweep.");
  Logger.log("Run startUploadLockdown() to start again from the first file.");
}


// Central mail sender. Uses optional Script Properties so you can brand emails:
//   MAIL_NAME  -> sender display name (e.g. "Linkify.ma") - works right away
//   MAIL_FROM  -> send-from address (e.g. "contact@linkify.ma") - ONLY works once
//                 it's added as a verified "Send mail as" alias on the script's Gmail
//   REPLY_TO   -> reply-to address
function sendMail(to, subject, body) {
  var opts = {};
  var nm = prop("MAIL_NAME"); if (nm) opts.name = nm;
  var fr = prop("MAIL_FROM"); if (fr) opts.from = fr;
  var rt = prop("REPLY_TO");  if (rt) opts.replyTo = rt;
  try { MailApp.sendEmail(to, subject, body, opts); }
  catch (e) { try { MailApp.sendEmail(to, subject, body); } catch (e2) {} }
}

// ---- Twilio WhatsApp (retargeting channel) ----
// Script Properties needed:
//   TWILIO_SID    -> Account SID (starts with AC...)
//   TWILIO_TOKEN  -> Auth Token  (keep secret)
//   TWILIO_WA_FROM-> sender, e.g. "whatsapp:+14155238886" (sandbox) or your approved number
// Sends a WhatsApp message via the Twilio REST API. Returns true on success.
function sendWhatsApp(toPhone, body) {
  var sid = prop("TWILIO_SID"), token = prop("TWILIO_TOKEN"), from = prop("TWILIO_WA_FROM");
  if (!sid || !token || !from || !toPhone || !body) return false;
  var to = normalizePhone(toPhone);
  if (!to) return false;
  var url = "https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json";
  var options = {
    method: "post",
    payload: { From: from, To: "whatsapp:+" + to, Body: body },
    headers: { Authorization: "Basic " + Utilities.base64Encode(sid + ":" + token) },
    muteHttpExceptions: true
  };
  try {
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return true;
    try { Logger.log("Twilio WA error " + code + ": " + res.getContentText()); } catch (e) {}
    return false;
  } catch (e) { return false; }
}

// Run this MANUALLY from the Apps Script editor to test the free Sandbox.
// First set Script Property TEST_WA to your own WhatsApp number (that joined
// the sandbox), e.g. "212710849666" or "0710849666".
function testTwilioWhatsApp() {
  var to = prop("TEST_WA");
  if (!to) { Logger.log("Set Script Property TEST_WA to your WhatsApp number first."); return; }
  var ok = sendWhatsApp(to, msg_("WA_TEST"));
  Logger.log(ok
    ? "WhatsApp test SENT to " + to + " - check your WhatsApp."
    : "WhatsApp test FAILED - verify TWILIO_SID / TWILIO_TOKEN / TWILIO_WA_FROM / TEST_WA and that you sent 'join <code>' to the sandbox.");
}

// ---- WhatsApp Cloud API (Meta, direct - cheaper than Twilio) ----
// Script Properties:
//   WA_CLOUD_TOKEN -> access token (temporary 24h for testing; replace with a
//                     permanent System User token for the live automation)
//   WA_PHONE_ID    -> Phone number ID from the API Setup page
//   WA_GRAPH_VER   -> optional Graph API version, defaults to v21.0
function waCloudVer() { return prop("WA_GRAPH_VER") || "v21.0"; }

// Sends a TEMPLATE message. Templates work anytime, so they're required to
// message leads who haven't written to us in the last 24h (all retargeting).
// components (optional) fills template variables/buttons.
function sendWhatsAppTemplate(toPhone, templateName, langCode, components) {
  var token = prop("WA_CLOUD_TOKEN"), pid = prop("WA_PHONE_ID");
  if (!token || !pid || !toPhone || !templateName) return false;
  var to = normalizePhone(toPhone);
  if (!to) return false;
  var tmpl = { name: templateName, language: { code: langCode || "en_US" } };
  if (components) tmpl.components = components;
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ messaging_product: "whatsapp", to: to, type: "template", template: tmpl }),
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true
  };
  try {
    var res = UrlFetchApp.fetch("https://graph.facebook.com/" + waCloudVer() + "/" + pid + "/messages", options);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return true;
    try { Logger.log("WA Cloud error " + code + ": " + res.getContentText()); } catch (e) {}
    return false;
  } catch (e) { return false; }
}

// Run MANUALLY from the editor to validate the Cloud API using the pre-approved
// hello_world template. Set TEST_WA to your own WhatsApp number (the one you
// verified as a recipient on the API Setup page while in test mode).
function testWhatsAppCloud() {
  var to = prop("TEST_WA");
  if (!to) { Logger.log("Set Script Property TEST_WA first."); return; }
  var ok = sendWhatsAppTemplate(to, "hello_world", "en_US");
  Logger.log(ok
    ? "WA Cloud test SENT (hello_world) to " + to + " - check WhatsApp."
    : "WA Cloud test FAILED - check WA_CLOUD_TOKEN / WA_PHONE_ID / TEST_WA and that the recipient is verified in API Setup.");
}

function notifyEmail(record) {
  var to = prop("NOTIFY_EMAIL");
  if (!to) return;
  var name = ((record.first_name || "") + " " + (record.last_name || "")).trim();
  var subject = "New Linkify registration: " + (name || record.submissionId);
  var lines = [];
  HEADERS.forEach(function (h) {
    if (record[h] !== undefined && record[h] !== "") lines.push(h + ": " + record[h]);
  });
  MailApp.sendEmail(to, subject, lines.join("\n"));
}

function normalizePhone(v) {
  if (!v) return "";
  var s = String(v).replace(/[\s\-().]/g, "");
  if (s.indexOf("+") === 0) s = s.substring(1);
  if (s.indexOf("00") === 0) s = s.substring(2);
  if (s.charAt(0) === "0") s = "212" + s.substring(1);
  else if (s.indexOf("212") !== 0 && s.length === 9) s = "212" + s;
  return s.replace(/\D/g, "");
}

function adminAlert(text) {
  var id = prop("GREENAPI_ID");
  var token = prop("GREENAPI_TOKEN");
  var to = normalizePhone(prop("ADMIN_PHONE"));
  if (!id || !token || !to) return;
  var apiUrl = prop("GREENAPI_URL") || "https://api.green-api.com";
  try {
    var url = apiUrl + "/waInstance" + id + "/sendMessage/" + token;
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chatId: to + "@c.us", message: text }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}

// DIAGNOSTIC: run from the editor, then open Execution log to see EXACTLY why
// Green API is (or isn't) sending. It prints which properties are set, the
// instance state, and the real HTTP response from the send call.
function diagnoseAlert() {
  var id = prop("GREENAPI_ID");
  var token = prop("GREENAPI_TOKEN");
  var raw = prop("ADMIN_PHONE");
  var to = normalizePhone(raw);
  var apiUrl = prop("GREENAPI_URL") || "https://api.green-api.com";
  Logger.log("GREENAPI_ID  : " + (id ? ("set (" + id + ")") : "!! MISSING"));
  Logger.log("GREENAPI_TOKEN: " + (token ? ("set (length " + token.length + ")") : "!! MISSING"));
  Logger.log("ADMIN_PHONE  : raw='" + raw + "' -> normalized='" + to + "'");
  Logger.log("API base URL : " + apiUrl);
  if (!id || !token || !to) { Logger.log(">> STOP: a required Script Property is missing above. Fix it and re-run."); return; }

  try {
    var stateUrl = apiUrl + "/waInstance" + id + "/getStateInstance/" + token;
    var r1 = UrlFetchApp.fetch(stateUrl, { muteHttpExceptions: true });
    Logger.log("getStateInstance -> HTTP " + r1.getResponseCode() + " : " + r1.getContentText());
  } catch (e) { Logger.log("getStateInstance ERROR: " + e); }

  try {
    var url = apiUrl + "/waInstance" + id + "/sendMessage/" + token;
    var r2 = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chatId: to + "@c.us", message: "Linkify diagnose test" }),
      muteHttpExceptions: true
    });
    Logger.log("sendMessage -> HTTP " + r2.getResponseCode() + " : " + r2.getContentText());
    Logger.log(">> HTTP 200 + an idMessage = success. Any other code = read the message above for the reason.");
  } catch (e) { Logger.log("sendMessage ERROR: " + e); }
}

// Run this from the editor to test that Green API alerts reach your WhatsApp.
function testAlert() {
  adminAlert("Linkify test alert - if you received this on WhatsApp, Green API works. Sample: https://wa.me/212600000000?text=hello");
}

// One-click test of the WHOLE retargeting pipeline (run from the editor).
// Takes the most recent "partial" registration and immediately queues a
// Nudge-1 into the "To Contact" tab + sends you the admin alert, ignoring the
// normal 1-hour wait. It does NOT touch the real nudge columns, so live
// scheduling stays intact. Fill the form partially first (click "Next" once).
function testRetarget() {
  var sheet = getSheet();
  var map = ensureHeaders(sheet);
  var last = sheet.getLastRow();
  if (last < 2) { Logger.log("No rows yet - fill the form partially first (click Next once)."); return; }
  var rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {            // newest first
    if (String(cell(rows[i], map, "status")) !== "partial") continue;
    var name = cell(rows[i], map, "first_name") || "";
    var phone = normalizePhone(cell(rows[i], map, "whatsapp"));
    var sid = cell(rows[i], map, "submissionId");
    var resumeUrl = cell(rows[i], map, "resume_url") || (siteUrl() + "?resume=" + encodeURIComponent(sid));
    var msg = buildNudgeMessage(1, name, resumeUrl);
    var waLink = phone ? ("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg)) : "";
    getContactSheet().appendRow([new Date(), sanitizeCell(name), phone, "TEST Nudge 1", resumeUrl, waCell(waLink), sanitizeCell(msg)]);
    adminAlert("Linkify TEST retarget:\n" + name + " (" + phone + ")\n" + waLink);
    Logger.log("Test nudge queued -> " + name + " / " + phone + "\nResume: " + resumeUrl + "\nwa.me: " + waLink);
    return;
  }
  Logger.log("No 'partial' rows found. Open the form, fill step 1 with a real WhatsApp number, click Next (do NOT finish), then run testRetarget again.");
}


/* ============ RESPONSE + ONE-TIME SETUP ============ */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processAbandoners") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("processAbandoners").timeBased().everyHours(1).create();
}


/* ============ FACILITATORS (workshop facilitators) ============
   Same progressive-save engine as teachers, but its OWN tab + header map +
   allow-list + file maps. Partial saves upsert by submissionId; the resume link
   (?resume=SID&t=f) reconnects the visitor. Files upload to Drive PRIVATELY via
   the shared saveFile(). Teacher/admin/school paths are untouched. */
function validateFacilitator(data, isPartial) {
  var errors = [];
  var emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var phoneRe = /^(?:\+212|212|0)[567]\d{8}$/;
  if (data.email && !emailRe.test(String(data.email))) errors.push("email");
  if (data.whatsapp && !phoneRe.test(String(data.whatsapp).replace(/[\s\-().]/g, ""))) errors.push("whatsapp");
  if (data.age !== undefined && data.age !== "") {
    var a = parseInt(data.age, 10);
    if (isNaN(a) || a < 16 || a > 80) errors.push("age");
  }
  if (data.currentStep !== undefined && data.currentStep !== null && data.currentStep !== "") {
    var st = parseInt(data.currentStep, 10);
    if (isNaN(st) || st < 0 || st > 10) errors.push("currentStep");
  }
  if (!isPartial) {
    FAC_REQUIRED.forEach(function (f) {
      if (!data[f] || String(data[f]).trim() === "") errors.push("missing:" + f);
    });
    // CV is required on final submit unless the visitor ticked "I'll send it later".
    var cvLater = String(data.cv_pending || "").trim() === "oui";
    var hasCv = (data.files && data.files.cv && data.files.cv.data) ||
                (data.CV_URL && String(data.CV_URL).indexOf("http") === 0);
    if (!cvLater && !hasCv) errors.push("missing:cv");

    /* Availability time is REQUIRED per ticked day (availability itself stays
       optional). available_days is the ', '-joined day list; availability is the
       serialized picker (day-blocks ' | ', 'DAY: p1، p2'). A day the visitor
       ticked but left without a period is OMITTED from availability, so any
       available_days entry with no matching day-block (with >=1 period) fails.
       Mirrors the client-side fac.v.dayNeedsTime rule (defence in depth). */
    var pickedDays = String(data.available_days || "")
      .split(", ").map(function (d) { return d.trim(); }).filter(function (d) { return d; });
    if (pickedDays.length) {
      var timedDays = {};
      String(data.availability || "").split(" | ").forEach(function (block) {
        var idx = block.indexOf(": ");
        if (idx === -1) return;
        var day = block.slice(0, idx).trim();
        var periods = block.slice(idx + 2).split("، ").filter(function (p) { return p.trim(); });
        if (day && periods.length) timedDays[day] = true;
      });
      var missingTime = pickedDays.some(function (d) { return !timedDays[d]; });
      if (missingTime) errors.push("availability");
    }
  }
  return errors;
}

function handleFacilitatorPost(data) {
  var sid = sanitizeToken(data.submissionId) || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
  if (rateLimited("fac_" + sid, CONFIG.RL_PER_SID, CONFIG.RL_WINDOW_SEC)) return json({ status: "rate_limited" });

  var isPartial = (data.partial === true) || (data.status === "partial");
  var errors = validateFacilitator(data, isPartial);
  if (errors.length) return json({ status: "invalid", fields: errors });

  /* Enumerated fields must come from the lists the form offers. Runs for partial
     saves too -- a partial write pollutes the same columns. Log-only until the
     ENUM_STRICT script property is "true". */
  var enumBad = enumViolations(data, ENUM_FACILITATOR);
  if (enumBad.length) {
    var enforce = enumStrict();
    recordRejectedValues(sid, "facilitator", enumBad, enforce);
    if (enforce) return json({ status: "invalid", fields: violationFields(enumBad) });
  }

  var now = new Date();
  var record = {};
  FAC_HEADERS.forEach(function (h) {
    if (Object.prototype.hasOwnProperty.call(data, h)) record[h] = sanitizeCell(data[h]);
  });
  record.submissionId = sid;
  record.status = isPartial ? "partial" : "complete";
  if (data.currentStep !== undefined && data.currentStep !== null) {
    record.currentStep = clampInt(data.currentStep, 0, 10, 0);
  }
  record.updatedAt = now.toISOString();
  if (!isPartial) record.submittedAt = now.toISOString();
  record.resume_url = safeResumeUrl(data.resumeUrl, sid);

  // Upload files to Drive OUTSIDE the lock (Drive I/O is slow). Facilitator maps
  // only, so teacher uploads are unaffected. `certificate` may be multiple files.
  if (data.files) {
    var folder = getFolder();
    Object.keys(FAC_FILE_FIELDS).forEach(function (field) {
      var f = data.files[field];
      if (!f) return;
      if (Object.prototype.toString.call(f) === "[object Array]") {
        var urls = [];
        for (var j = 0; j < f.length && j < 5; j++) {
          var item = f[j];
          if (item && item.data && validateFacFile(field, item).ok) {
            try { urls.push(saveFile(folder, item, sid + "_" + field + "_" + j)); } catch (upErr) {}
          }
        }
        if (urls.length) record[FAC_FILE_FIELDS[field]] = urls.join(", ");
      } else if (f.data) {
        if (validateFacFile(field, f).ok) {
          try { record[FAC_FILE_FIELDS[field]] = saveFile(folder, f, sid + "_" + field); } catch (upErr2) {}
        }
      }
    });
  }

  // verification tier: a certificate counts as documentary evidence.
  var hasCert = record.CERTIFICATE_URL && String(record.CERTIFICATE_URL).indexOf("http") === 0;
  record.verification = hasCert ? "docs" : "self";

  var welcomeInfo = null;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (err) {}
  try {
    var sheet = getFacilitatorSheet();
    var map = ensureHeadersFor(sheet, FAC_HEADERS);
    var rowIndex = findRow(sheet, map, sid);
    if (rowIndex > 0) {
      updateRow(sheet, map, rowIndex, record);
    } else {
      record.createdAt = now.toISOString();
      appendRow(sheet, map, record);
    }
    if (!isPartial && map["welcomed"]) {
      var savedRow = (rowIndex > 0) ? rowIndex : findRow(sheet, map, sid);
      if (savedRow > 0 && !sheet.getRange(savedRow, map["welcomed"]).getValue()) {
        var rv = sheet.getRange(savedRow, 1, 1, sheet.getLastColumn()).getValues()[0];
        welcomeInfo = {
          name: cell(rv, map, "full_name") || "",
          phone: normalizePhone(cell(rv, map, "whatsapp")),
          email: cell(rv, map, "email")
        };
        sheet.getRange(savedRow, map["welcomed"]).setValue(now);
      }
    }
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }

  if (!isPartial) {
    try { notifyFacilitator(record); } catch (mailErr) {}
    if (welcomeInfo) {
      try { queueWelcome(welcomeInfo.name, welcomeInfo.phone); } catch (qErr) {}
      if (welcomeInfo.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(welcomeInfo.email))) {
        try { sendMail(String(welcomeInfo.email), msg_("SUBJ_WELCOME"), buildWelcomeMessage(welcomeInfo.name)); } catch (eErr) {}
      }
    }
  }
  return json({ status: isPartial ? "partial" : "success" });
}

// Facilitator file gate, kept separate from validateFile so the teacher
// ALLOWED_EXT map is never consulted for facilitator uploads (and vice versa).
function validateFacFile(field, f) {
  try {
    var name = String(f.name || "");
    var ext = name.indexOf(".") >= 0 ? name.split(".").pop().toLowerCase() : "";
    var allowed = FAC_ALLOWED_EXT[field] || [];
    if (allowed.indexOf(ext) === -1) return { ok: false, reason: "type" };
    var bytes = Math.floor(String(f.data).length * 3 / 4);
    if (bytes > CONFIG.MAX_FILE_BYTES) return { ok: false, reason: "size" };
    return { ok: true };
  } catch (e) { return { ok: false, reason: "error" }; }
}

function notifyFacilitator(record) {
  var to = prop("NOTIFY_EMAIL");
  if (!to) return;
  var subject = "New Linkify FACILITATOR: " + (record.full_name || record.submissionId);
  var lines = [];
  FAC_HEADERS.forEach(function (h) {
    if (record[h] !== undefined && record[h] !== "") lines.push(h + ": " + record[h]);
  });
  MailApp.sendEmail(to, subject, lines.join("\n"));
}

function facilitatorResume(token) {
  try {
    var sheet = getFacilitatorSheet();
    var map = ensureHeadersFor(sheet, FAC_HEADERS);
    var rowIndex = findRow(sheet, map, token);
    if (rowIndex < 1) return json({ status: "notfound" });
    var values = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    var record = {};
    Object.keys(map).forEach(function (h) {
      if (/_URL$/.test(h)) return; // never expose stored file links via the public resume endpoint
      var v = values[map[h] - 1];
      if (v !== "" && v !== null && v !== undefined) record[h] = v;
    });
    return json({ status: "found", record: record });
  } catch (err) { return json({ status: "error" }); }
}


/* ============ SCHOOLS (B2B leads) ============ */
/* Same progressive-save engine as teachers: partial saves upsert by
   submissionId; a resume link (?resume=SID&t=s) reconnects the visitor. */
function handleSchoolPost(data) {
  var sid = sanitizeToken(data.submissionId) || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
  if (rateLimited("school_" + sid, 30, CONFIG.RL_WINDOW_SEC)) return json({ status: "rate_limited" });

  var isPartial = (data.partial === true) || (data.status === "partial");
  if (!isPartial) {
    var errors = validateSchool(data);
    if (errors.length) return json({ status: "invalid", fields: errors });
  }

  var enumBadS = enumViolations(data, ENUM_SCHOOL);
  if (enumBadS.length) {
    var enforceS = enumStrict();
    recordRejectedValues(sid, "school", enumBadS, enforceS);
    if (enforceS) return json({ status: "invalid", fields: violationFields(enumBadS) });
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {}
  try {
    var sheet = getSchoolSheet();
    var subCol = SCHOOL_HEADERS.indexOf("submissionId") + 1;
    var rowIndex = findSchoolRow(sheet, subCol, sid);
    var now = new Date();

    // start from the existing row (upsert) so partial saves never wipe data
    var record = {};
    if (rowIndex > 0) {
      var cur = sheet.getRange(rowIndex, 1, 1, SCHOOL_HEADERS.length).getValues()[0];
      SCHOOL_HEADERS.forEach(function (h, i) { record[h] = cur[i]; });
    }
    SCHOOL_HEADERS.forEach(function (h) {
      if (Object.prototype.hasOwnProperty.call(data, h)) record[h] = sanitizeCell(data[h]);
    });
    record.submissionId = sid;
    record.status = isPartial ? "partial" : "complete";
    if (data.currentStep !== undefined && data.currentStep !== null && data.currentStep !== "") {
      record.currentStep = clampInt(data.currentStep, 0, 10, 0);
    }
    record.updatedAt = now.toISOString();
    if (rowIndex < 1) record.createdAt = now.toISOString();
    record.resume_url = siteUrl().replace(/\/+$/, "") + "/schools.html?resume=" + encodeURIComponent(sid) + "&t=s";
    record.source = record.source || "schools_lp";

    var row = SCHOOL_HEADERS.map(function (h) { return (record[h] === undefined || record[h] === null) ? "" : record[h]; });
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, SCHOOL_HEADERS.length).setValues([row]);
    else sheet.appendRow(row);

    if (!isPartial) { try { notifySchool(record); } catch (mailErr) {} }
    return json({ status: isPartial ? "partial" : "success" });
  } catch (err) {
    return json({ status: "error" });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function validateSchool(data) {
  var errors = [];
  var emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var phoneRe = /^(?:\+212|212|0)[567]\d{8}$/;
  SCHOOL_REQUIRED.forEach(function (f) {
    if (!data[f] || String(data[f]).trim() === "") errors.push("missing:" + f);
  });
  if (data.phone && !phoneRe.test(String(data.phone).replace(/[\s\-().]/g, ""))) errors.push("phone");
  if (data.email && !emailRe.test(String(data.email))) errors.push("email");
  return errors;
}

function findSchoolRow(sheet, subCol, sid) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, subCol, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(sid)) return i + 2; }
  return -1;
}

function getSchoolSheet() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(SCHOOL_SHEET);
  if (!sh) sh = ss.insertSheet(SCHOOL_SHEET);
  // Schools rows are written positionally, so keep the header row in sync with
  // SCHOOL_HEADERS. New columns are only ever appended at the end, so existing
  // data stays aligned; this just (re)labels row 1 and adds any new headers.
  var curCols = sh.getLastColumn();
  var needsHeader = sh.getLastRow() === 0;
  if (!needsHeader && curCols < SCHOOL_HEADERS.length) needsHeader = true;
  if (!needsHeader) {
    var hdr = sh.getRange(1, 1, 1, SCHOOL_HEADERS.length).getValues()[0];
    for (var i = 0; i < SCHOOL_HEADERS.length; i++) {
      if (String(hdr[i]) !== SCHOOL_HEADERS[i]) { needsHeader = true; break; }
    }
  }
  if (needsHeader) {
    sh.getRange(1, 1, 1, SCHOOL_HEADERS.length).setValues([SCHOOL_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function schoolResume(token) {
  try {
    var sheet = getSchoolSheet();
    var subCol = SCHOOL_HEADERS.indexOf("submissionId") + 1;
    var rowIndex = findSchoolRow(sheet, subCol, token);
    if (rowIndex < 1) return json({ status: "notfound" });
    var vals = sheet.getRange(rowIndex, 1, 1, SCHOOL_HEADERS.length).getValues()[0];
    var rec = {};
    SCHOOL_HEADERS.forEach(function (h, i) {
      if (h === "resume_url" || h === "source") return;
      if (vals[i] !== "" && vals[i] !== null && vals[i] !== undefined) rec[h] = vals[i];
    });
    return json({ status: "found", record: rec });
  } catch (err) { return json({ status: "error" }); }
}

function notifySchool(record) {
  var to = prop("NOTIFY_EMAIL");
  if (!to) return;
  var subject = "New Linkify SCHOOL lead: " + (record.school_name || "") + " - " + (record.subject || "");
  if (record.need_type === "\u0641\u0648\u0631\u064a\u0629") subject = "[URGENT] " + subject; // need_type == "immediate"
  var lines = [];
  SCHOOL_HEADERS.forEach(function (h) {
    if (record[h] !== undefined && record[h] !== "") lines.push(h + ": " + record[h]);
  });
  MailApp.sendEmail(to, subject, lines.join("\n"));
}
