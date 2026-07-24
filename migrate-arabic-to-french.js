/**
 * ============================================================
 * Linkify.ma — Migrate existing Arabic data to French
 * ============================================================
 * 
 * HOW TO USE:
 * 1. Open your Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Delete any existing code and paste this entire file
 * 4. Click Save (💾)
 * 5. Run the function: migrateAllSheets()
 * 6. Grant permissions when prompted
 * 7. Wait for it to finish (check Execution Log)
 * 
 * IMPORTANT:
 * - This script will REPLACE Arabic values with French equivalents
 * - It only changes values that match exactly — free text fields are NOT touched
 * - Run it ONCE. Running it again won't hurt (already-French values won't match Arabic)
 * - Make a BACKUP of your sheet before running (File → Make a copy)
 * ============================================================
 */

// ===== MAPPING: Arabic → French =====
const MAPPING = {
  // Gender
  "ذكر": "H",
  "أنثى": "F",

  // Cities
  "القنيطرة": "Kénitra",
  "سلا": "Salé",
  "الرباط": "Rabat",
  "تمارة": "Témara",
  "الصخيرات": "Skhirat",
  "بوزنيقة": "Bouznika",
  "المحمدية": "Mohammedia",
  "الدار البيضاء": "Casablanca",
  "طنجة": "Tanger",
  "تطوان": "Tétouan",
  "العرائش": "Larache",
  "القصر الكبير": "Ksar El Kébir",
  "سيدي سليمان": "Sidi Slimane",
  "سيدي قاسم": "Sidi Kacem",
  "وزان": "Ouezzane",
  "مكناس": "Meknès",
  "فاس": "Fès",
  "صفرو": "Sefrou",
  "تازة": "Taza",
  "وجدة": "Oujda",
  "بركان": "Berkane",
  "الناضور": "Nador",
  "خريبكة": "Khouribga",
  "بني ملال": "Béni Mellal",
  "الفقيه بن صالح": "Fquih Ben Salah",
  "سطات": "Settat",
  "برشيد": "Berrechid",
  "الجديدة": "El Jadida",
  "سيدي بنور": "Sidi Bennour",
  "آسفي": "Safi",
  "الصويرة": "Essaouira",
  "مراكش": "Marrakech",
  "قلعة السراغنة": "Kelaat Sraghna",
  "أكادير": "Agadir",
  "إنزكان": "Inezgane",
  "آيت ملول": "Aït Melloul",
  "تارودانت": "Taroudant",
  "تيزنيت": "Tiznit",
  "مدينة أخرى": "Autre ville",
  // Common typos/variants the founder may have used
  "القنيطره": "Kénitra",
  "تماره": "Témara",
  "بوزنيقه": "Bouznika",
  "المحمديه": "Mohammedia",
  "طنجه": "Tanger",
  "خريبكه": "Khouribga",
  "تازه": "Taza",
  "الجديده": "El Jadida",
  "الصويره": "Essaouira",
  "اكادير": "Agadir",
  "ايت ملول": "Aït Melloul",
  "اسفي": "Safi",
  "قلعه السراغنه": "Kelaat Sraghna",
  "مدينه اخرى": "Autre ville",

  // Transport
  "نعم، سيارة": "Oui, voiture",
  "نعم، دراجة نارية": "Oui, moto",
  "نعم، دراجه ناريه": "Oui, moto",
  "لا أملك وسيلة نقل": "Je n'ai pas de moyen de transport",

  // License
  "رخصة سيارة": "Permis voiture",
  "رخصة دراجة نارية": "Permis moto",
  "رخصه دراجه": "Permis moto",
  "لا أملك رخصة": "Aucun permis",

  // Relocate
  "نعم، مستعد تماماً": "Oui, tout à fait prêt",
  "حسب العرض والامتيازات": "Selon l'offre et les avantages",
  "لا، مدينتي فقط": "Non, ma ville uniquement",

  // Track
  "علمي / تقني": "Scientifique / Technique",
  "أدبي / إنساني": "Littéraire / Sciences humaines",
  "التعليم الأولي والمربيات": "Éducation préscolaire et éducatrices",
  "التربية الفنية والثقافية": "Éducation artistique et culturelle",

  // Diploma
  "مستوى بكالوريا": "Niveau baccalauréat",
  "بكالوريا": "Baccalauréat",
  "دبلوم سنتين": "Bac+2",
  "إجازة": "Licence",
  "ماستر": "Master",
  "مهندس": "Ingénieur",
  "دكتوراه": "Doctorat",
  "غير ذلك": "Autre",

  // Language levels
  "ممتاز": "Excellent",
  "متوسط": "Intermédiaire",
  "أساسي": "Basique",
  "لا توجد معرفة": "Aucune connaissance",

  // Subjects
  "الرياضيات": "Mathématiques",
  "الفيزياء والكيمياء": "Physique-Chimie",
  "علوم الحياة والأرض": "Sciences de la Vie et de la Terre",
  "المعلوميات": "Informatique",
  "التربية البدنية والرياضية": "Éducation physique et sportive",
  "تسيير ومحاسبة": "Gestion et Comptabilité",
  "التربية الإسلامية": "Éducation islamique",
  "اللغة العربية": "Langue arabe",
  "اللغة الفرنسية": "Langue française",
  "اللغة الإنجليزية": "Langue anglaise",
  "اللغة الإسبانية": "Langue espagnole",
  "اللغة الألمانية": "Langue allemande",
  "الفلسفة": "Philosophie",
  "التاريخ والجغرافيا": "Histoire-Géographie",
  "التربية التشكيلية والفنون البصرية": "Arts plastiques et visuels",
  "المسرح والفنون الأدائية": "Théâtre et arts de la scène",
  "التربية الموسيقية": "Éducation musicale",
  "التصوير الفوتوغرافي والسمعي البصري": "Photographie et audiovisuel",
  "المعامل التربوية والابتكار": "Ateliers pédagogiques et innovation",
  "التنشيط الثقافي والتفتح الفني": "Animation culturelle et éveil artistique",
  "العربية فقط": "Arabe uniquement",
  "الفرنسية": "Français",
  "الإنجليزية": "Anglais",

  // Levels
  "التعليم الأولي (3-5 سنوات)": "Préscolaire (3-5 ans)",
  "التعليم الأولي": "Préscolaire (3-5 ans)",
  "التعليم الابتدائي": "Primaire",
  "التعليم الإعدادي": "Collège",
  "التعليم الثانوي التأهيلي": "Lycée",
  "التعليم العالي": "Enseignement supérieur",
  "تعليم الكبار / التكوين المستمر": "Formation des adultes / Formation continue",
  "الحضانة (أقل من 3 سنوات)": "Crèche (moins de 3 ans)",
  "القسم الصغير (3-4 سنوات)": "Petite Section (3-4 ans)",
  "القسم المتوسط (4-5 سنوات)": "Moyenne Section (4-5 ans)",
  "القسم الكبير (5-6 سنوات)": "Grande Section (5-6 ans)",

  // Institution types
  "مدرسة خاصة": "École privée",
  "مركز دعم وتقوية": "Centre de soutien scolaire",
  "مركز لغات": "Centre de langues",
  "مركز تكوين مهني": "Centre de formation professionnelle",
  "حضانة / تعليم أولي": "Crèche / Préscolaire",
  "مؤسسة تعليم عالي خاصة": "Établissement d'enseignement supérieur privé",
  "حضانة": "Crèche",
  "تعليم أولي (روض)": "Préscolaire (maternelle)",

  // Schedule
  "دوام كامل": "Temps plein",
  "دوام جزئي": "Temps partiel",
  "ساعات إضافية / حصص محددة": "Heures supplémentaires / Séances ponctuelles",
  "ساعات إضافية / حص": "Heures supplémentaires / Séances ponctuelles",
  "كل ما سبق": "Tout ce qui précède",

  // Substitute
  "نعم، متاح للتعويض الطارئ": "Oui, disponible pour remplacement urgent",
  "نعم، حسب الظروف": "Oui, selon les circonstances",

  // Salary
  "لا يهم": "Peu importe",
  "مبلغ آخر": "Autre montant",

  // Contract types
  "لا يهم (أي نوع عقد)": "Peu importe (tout type de contrat)",
  "CDI (غير محدد المدة)": "CDI (Contrat à durée indéterminée)",
  "CDD (محدد المدة)": "CDD (Contrat à durée déterminée)",
  "عقد تجريبي": "Période d'essai",
  "بالتوقيت / بالساعة": "Vacataire (à l'heure)",
  "تعويض مؤقت": "Remplacement temporaire",
  "مقاول ذاتي / Freelance": "Auto-entrepreneur / Freelance",
  "تدريب / إدماج": "Stage / Insertion",

  // Experience
  "نعم": "Oui",
  "لا (حديث التخرج)": "Non (nouveau diplômé)",
  "أقل من سنة": "Moins d'un an",
  "بين سنة و 3 سنوات": "Entre 1 et 3 ans",
  "بين 4 و 5 سنوات": "Entre 4 et 5 ans",
  "أكثر من 5 سنوات": "Plus de 5 ans",

  // Skills (teacher)
  "التدريس عن بعد (Zoom, Meet, Teams)": "Enseignement à distance (Zoom, Meet, Teams)",
  "تصميم المحتوى (Canva, Genially, PPT)": "Conception de contenu (Canva, Genially, PPT)",
  "دمج الذكاء الاصطناعي فالتعليم": "Intégration de l'IA dans l'enseignement",
  "التحليل الإحصائي (SPSS)": "Analyse statistique (SPSS)",
  "المسرح التربوي والتنشيط": "Théâtre éducatif et animation",
  "تدبير الأنشطة الموازية والنوادي": "Gestion des activités parascolaires et clubs",
  "مهارة أخرى": "Autre compétence",

  // Skills (admin)
  "مايكروسوفت أوفيس (Word, Excel)": "Microsoft Office (Word, Excel)",
  "تدبير منصة مسار / برامج المؤسسات": "Gestion plateforme Massar / logiciels scolaires",
  "برامج المحاسبة والتسيير": "Logiciels de comptabilité et gestion",
  "التواصل واستقبال الزبناء": "Communication et accueil",
  "التنظيم والأرشفة": "Organisation et archivage",

  // Admin positions
  "تقني معلوميات / صيانة": "Technicien informatique / Maintenance",
  "مدير(ة) عام / مدير(ة) تربوي (بيداغوجي)": "Directeur(trice) général(e) / Directeur(trice) pédagogique",
  "نائب(ة) المدير / ناظر(ة) المؤسسة": "Adjoint(e) du directeur / Surveillant(e) général(e)",
  "حارس(ة) عام": "Surveillant(e) général(e)",
  "مفتش(ة) / مشرف(ة) تربوي(ة)": "Inspecteur(trice) / Superviseur(e) pédagogique",
  "مسؤول(ة) الموارد البشرية أو التسجيل": "Responsable RH ou inscriptions",
  "سكرتير(ة) / موظف(ة) إداري / مسؤول(ة) استقبال": "Secrétaire / Agent administratif / Réceptionniste",
  "مستشار(ة) في التوجيه / أخصائي(ة) نفسي(ة) أو اجتماعي(ة)": "Conseiller(ère) d'orientation / Psychologue ou assistant(e) social(e)",
  "منصب إداري آخر": "Autre poste administratif",

  // Early role
  "أستاذة / معلمة": "Enseignante / Éducatrice",
  "أستاذة مساعدة / مربية مساعدة": "Assistante enseignante / Aide-éducatrice",

  // Accompanist + misc
  "لا": "Non",
  "موافق": "Oui",
};

/**
 * Main function — run this one!
 * Migrates: Sheet1, Form Responses 1, Administration
 */
function migrateAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const teacherSheets = ["Sheet1", "Form Responses 1"];
  const adminSheets = ["Administration"];
  
  let totalChanges = 0;
  
  for (const name of teacherSheets) {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      Logger.log("📋 Processing: " + name);
      totalChanges += migrateSheet(sheet);
    } else {
      Logger.log("⚠️ Sheet not found: " + name);
    }
  }
  
  for (const name of adminSheets) {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      Logger.log("📋 Processing: " + name);
      totalChanges += migrateSheet(sheet);
    } else {
      Logger.log("⚠️ Sheet not found: " + name);
    }
  }
  
  Logger.log("✅ DONE! Total cells changed: " + totalChanges);
  SpreadsheetApp.getUi().alert("Migration terminée ✅\n\nCellules modifiées: " + totalChanges);
}

/**
 * Process a single sheet: read all data, replace matching values, write back
 */
function migrateSheet(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  if (lastRow < 2 || lastCol < 1) {
    Logger.log("  → Empty or header-only, skipping.");
    return 0;
  }
  
  // Read all data at once (fast!)
  const range = sheet.getRange(2, 1, lastRow - 1, lastCol); // skip header row
  const data = range.getValues();
  let changes = 0;
  
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      const cell = data[r][c];
      if (typeof cell !== "string" || cell === "") continue;
      
      // Some cells contain comma-separated values (e.g. "الرياضيات, الفيزياء والكيمياء")
      // We need to handle both single values and comma-separated lists
      const newValue = translateCell(cell);
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
  
  Logger.log("  → " + changes + " cells changed in " + sheet.getName());
  return changes;
}

/**
 * Translate a single cell value.
 * Handles both single values and comma/newline-separated lists.
 */
function translateCell(cellValue) {
  // First, try exact match (fastest path for single-value cells)
  if (MAPPING[cellValue.trim()]) {
    return MAPPING[cellValue.trim()];
  }
  
  // Check if cell contains comma-separated values
  // Common separators in Google Sheets multi-select: ", " or "," or "\n"
  const separators = [", ", ",", "\n"];
  
  for (const sep of separators) {
    if (cellValue.indexOf(sep) !== -1) {
      const parts = cellValue.split(sep);
      let anyChanged = false;
      const translated = parts.map(function(part) {
        const trimmed = part.trim();
        if (MAPPING[trimmed]) {
          anyChanged = true;
          return MAPPING[trimmed];
        }
        return trimmed;
      });
      if (anyChanged) {
        return translated.join(sep);
      }
    }
  }
  
  // No match found — return original (free text fields stay untouched)
  return cellValue;
}

/**
 * Optional: Run this to see what WOULD change without actually changing anything
 */
function dryRun() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allSheets = ["Sheet1", "Form Responses 1", "Administration"];
  
  let report = "=== DRY RUN (no changes made) ===\n\n";
  
  for (const name of allSheets) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) continue;
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) continue;
    
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    let sheetChanges = 0;
    
    for (let r = 0; r < data.length; r++) {
      for (let c = 0; c < data[r].length; c++) {
        const cell = data[r][c];
        if (typeof cell !== "string" || cell === "") continue;
        const newValue = translateCell(cell);
        if (newValue !== cell) {
          sheetChanges++;
          if (sheetChanges <= 10) { // show first 10 examples
            report += name + " [Row " + (r+2) + ", Col " + (c+1) + "]: \"" + cell + "\" → \"" + newValue + "\"\n";
          }
        }
      }
    }
    
    report += "\n" + name + ": " + sheetChanges + " cells would change\n\n";
  }
  
  Logger.log(report);
  SpreadsheetApp.getUi().alert(report.substring(0, 2000)); // alert has a char limit
}
