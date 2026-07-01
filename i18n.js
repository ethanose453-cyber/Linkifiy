/* ===========================================================
   Linkify.ma — i18n (ar / fr / en)
   Text is swapped by [data-i18n] / [data-i18n-ph] keys.
   Stored form VALUES stay canonical (Arabic) for clean data.
   =========================================================== */
(function () {
  var KEY = "linkify-lang";
  var ORDER = ["ar", "fr", "en"];
  var SHORT = { ar: "AR", fr: "FR", en: "EN" };

  var DICT = {
    ar: {
      "meta.title": "Linkify.ma — منصة ربط الأطر التربوية بالمؤسسات التعليمية بالمغرب",
      "nav.register": "سجّل", "nav.how": "آلية العمل", "nav.why": "لماذا Linkify", "nav.cta": "سجّل مجاناً",
      "hero.badge": "مجاني تماماً للأساتذة",
      "hero.h1": "المؤسسة التعليمية التي تبحث عنك… قد تكون على بُعد بضعة كيلومترات.",
      "hero.lead": "تربط Linkify الأطر التربوية والإدارية بالمؤسسات التعليمية الخاصة القريبة منهم. أنشئ ملفك المهني مرة واحدة، ودع صنّاع القرار يصلون إليك.",
      "hero.cta": "أنشئ ملفك الآن ↓",
      "match.left": "المؤسسات", "match.right": "الأساتذة",
      "match.title": "مطابقة ذكية", "match.sub": "نربط الكفاءة بالفرصة الأقرب",
      "form.title": "أنشئ ملفك المهني — مجاناً",
      "form.sub": "املأ ملفك في دقائق، ودع المؤسسات القريبة منك تصل إليك. كل خطوة قصيرة.",
      "form.step": "الخطوة", "form.of": "من",
      "s1.legend": "المعلومات الشخصية",
      "s1.consentNote": "بمواصلتك، أنت توافق على حفظ معلوماتك وعلى تواصلنا معك عبر واتساب أو البريد الإلكتروني لمساعدتك في إتمام تسجيلك. اطّلع على",
      "f.first": "الاسم الشخصي", "f.last": "الاسم العائلي", "f.age": "السن",
      "f.gender": "الجنس", "g.male": "ذكر", "g.female": "أنثى",
      "f.city": "المدينة", "ph.city": "اختر مدينتك", "f.cityOther": "اسم مدينتك", "opt.cityOther": "مدينة أخرى",
      "city.kenitra":"القنيطرة","city.sale":"سلا","city.rabat":"الرباط","city.temara":"تمارة","city.skhirat":"الصخيرات","city.bouznika":"بوزنيقة","city.mohammedia":"المحمدية","city.casa":"الدار البيضاء","city.tanger":"طنجة","city.tetouan":"تطوان","city.larache":"العرائش","city.ksarkebir":"القصر الكبير","city.sidislimane":"سيدي سليمان","city.sidikacem":"سيدي قاسم","city.ouezzane":"وزان","city.meknes":"مكناس","city.fes":"فاس","city.sefrou":"صفرو","city.taza":"تازة","city.oujda":"وجدة","city.berkane":"بركان","city.nador":"الناضور","city.khouribga":"خريبكة","city.benimellal":"بني ملال","city.fkihbensalah":"الفقيه بن صالح","city.settat":"سطات","city.berrechid":"برشيد","city.eljadida":"الجديدة","city.sidibennour":"سيدي بنور","city.safi":"آسفي","city.essaouira":"الصويرة","city.marrakech":"مراكش","city.kelaa":"قلعة السراغنة","city.agadir":"أكادير","city.inezgane":"إنزكان","city.aitmelloul":"آيت ملول","city.taroudant":"تارودانت","city.tiznit":"تيزنيت",
      "f.neigh": "الحي السكني", "ph.neigh": "ابدأ الكتابة أو اختر حيّك...",
      "hint.neigh": "اختر مدينتك أولاً، ثم ابدأ كتابة اسم الحي وستظهر اقتراحات. إن لم تجد حيّك، اكتبه يدوياً.",
      "f.whatsapp": "رقم الواتساب", "f.email": "البريد الإلكتروني",
      "s2.legend": "معلومات عامة وتعليمية",
      "f.transport": "هل تتوفر على وسيلة نقل خاصة؟", "tr.car": "سيارة", "tr.moto": "دراجة نارية", "tr.none": "لا أملك",
      "f.license": "هل تتوفر على رخصة قيادة؟", "lic.car": "رخصة سيارة", "lic.moto": "رخصة دراجة", "lic.none": "لا أملك",
      "f.relocate": "مستعد للانتقال لمدينة أخرى من أجل العمل؟", "rel.yes": "نعم تماماً", "rel.offer": "حسب العرض", "rel.no": "مدينتي فقط",
      "f.track": "التوجه العام", "tk.sci": "علمي / تقني", "tk.lit": "أدبي / إنساني", "tk.pre": "تعليم أولي ومربيات",
      "hint.track": "بناءً على توجهك، سنعرض عليك المواد المناسبة في الخطوة التالية.",
      "f.diploma": "أعلى شهادة حصلت عليها", "ph.choose": "اختر",
      "dp.bacLevel": "مستوى بكالوريا", "dp.bac": "بكالوريا", "dp.dut": "دبلوم سنتين", "dp.lic": "إجازة",
      "dp.master": "ماستر", "dp.eng": "مهندس", "dp.phd": "دكتوراه", "dp.other": "غير ذلك",
      "f.diplomaOther": "اذكر اسم الشهادة",
      "f.specialty": "التخصص", "ph.specialty": "مثال: رياضيات، لغة فرنسية...", "f.university": "المؤسسة أو الجامعة",
      "s3.legend": "الكفاءات اللغوية وملفاتك",
      "lang.rate": "قيّم مستواك في اللغات التالية:",
      "lang.ar": "العربية", "lang.fr": "الفرنسية", "lang.en": "الإنجليزية", "lang.es": "الإسبانية", "lang.de": "الألمانية",
      "lv.native": "اللغة الأم", "lv.exc": "ممتاز", "lv.mid": "متوسط", "lv.basic": "أساسي", "lv.none": "لا توجد معرفة",
      "f.cv": "السيرة الذاتية (CV)", "hint.cv": "بصيغة PDF أو Word · أقصى حجم 5MB. هذا الملف أساسي في ملفك.",
      "f.certs": "شواهد إضافية (اختياري)", "hint.certs": "شواهد التكوين المستمر، دبلومات اللغات... (ملف واحد، أقصى حجم 5MB)",
      "s4.legend": "ماذا وأين تريد أن تُدرّس",
      "f.subjects": "المواد / اللغات التي تريد تدريسها",
      "hint.subjects": "المواد معروضة بناءً على توجهك العام. غيّر التوجه في الخطوة السابقة لتتغيّر.",
      "sub.math": "الرياضيات", "sub.pc": "الفيزياء والكيمياء", "sub.svt": "علوم الحياة والأرض", "sub.it": "المعلوميات",
      "sub.acc": "تسيير ومحاسبة", "sub.islam": "التربية الإسلامية", "sub.arabic": "اللغة العربية", "sub.french": "اللغة الفرنسية",
      "sub.english": "اللغة الإنجليزية", "sub.spanish": "اللغة الإسبانية", "sub.german": "اللغة الألمانية", "sub.philo": "الفلسفة",
      "sub.hist": "التاريخ والجغرافيا", "sub.motor": "مهارات حركية دقيقة", "sub.psy": "التربية الحس حركية",
      "sub.earlyLang": "اللغات المبكرة", "sub.songs": "أناشيد وقصص الأطفال",
      "f.levels": "الفئة العمرية / الأسلاك التي تقدر تتعامل معها",
      "lvl.pre": "التعليم الأولي (3-5 سنوات)", "lvl.primary": "الابتدائي", "lvl.college": "الإعدادي",
      "lvl.high": "الثانوي التأهيلي", "lvl.higher": "التعليم العالي", "lvl.adult": "تعليم الكبار / التكوين المستمر",
      "f.instTypes":"أنواع المؤسسات التي ترغب في العمل بها",
      "it.school":"مدرسة خاصة","it.support":"مركز دعم وتقوية","it.lang":"مركز لغات","it.training":"مركز تكوين مهني","it.nursery":"حضانة / تعليم أولي","it.higher":"تعليم عالي خاص",
      "about.line":"Linkify مبادرة مغربية هدفها سدّ الفجوة بين الأطر التربوية الكفؤة والمؤسسات التعليمية التي تحتاجها — بطريقة مجانية، قريبة، وآمنة.",
      "f.schedule": "نمط الدوام الذي تقدر تشتغل به", "sch.full": "دوام كامل", "sch.part": "دوام جزئي",
      "sch.hours": "ساعات / حصص محددة", "sch.all": "كل ما سبق",
      "f.substitute": "هل أنت مستعد للعمل كأستاذ بديل (احتياط) عند الغياب الطارئ؟",
      "subst.yes": "نعم، متاح", "subst.cond": "حسب الظروف", "subst.no": "لا",
      "hint.substitute": "تبحث المؤسسات كثيراً عن أساتذة مستعدين للتعويض الطارئ خلال الموسم — هذا الاستعداد يرفع من فرصك.",
      "s5.legend": "الخبرة المهنية",
      "f.hasExp": "هل سبق لك العمل في مجال التعليم؟", "exp.yes": "نعم", "exp.no": "لا (حديث التخرج)",
      "f.expYears": "عدد سنوات الخبرة الإجمالية", "ey.lt1": "أقل من سنة", "ey.1to3": "بين سنة و 3 سنوات",
      "ey.4to5": "بين 4 و 5 سنوات", "ey.gt5": "أكثر من 5 سنوات",
      "f.lastInst": "آخر مؤسسة عملت بها (أو الحالية)", "f.lastRole": "آخر منصب (أو الحالي)", "ph.lastRole": "معلم، حارس عام...",
      "f.schools": "أبرز المدارس والمراكز التي عملت بها", "ph.schools": "قدّم أكبر قدر من التفاصيل لنجد لك أفضل المناصب المناسبة.",
      "s6.legend": "مهارات إضافية وإنهاء التسجيل",
      "f.skills": "المهارات التربوية والرقمية (اختياري)",
      "sk.remote": "التدريس عن بعد", "sk.content": "تصميم المحتوى التعليمي", "sk.ai": "الذكاء الاصطناعي في التعليم",
      "sk.spss": "التحليل الإحصائي (SPSS)", "sk.theater": "المسرح التربوي والتنشيط", "sk.clubs": "الأنشطة الموازية والنوادي",
      "sk.other": "مهارة أخرى", "f.skillOther": "اذكر مهاراتك الأخرى",
      "f.photo": "الصورة الشخصية", "opt.optional": "(اختياري)",
      "hint.photo": "يمكنك تجاوزها الآن وإضافتها لاحقاً إلى ملفك. يُفضّل صورة بخلفية محايدة وملامح واضحة (أقصى حجم 5MB).",
      "f.consent": "أوافق على مشاركة بياناتي مع المؤسسات التعليمية الشريكة لغرض التوظيف، وأقرّ بأنني اطّلعت على", "f.privacyLink": "سياسة الخصوصية",
      "pp.title":"سياسة الخصوصية","pp.updated":"آخر تحديث: يونيو 2026",
      "pp.introT":"من نحن","pp.introB":"تشرح هذه السياسة كيف تجمع منصة Linkify معطياتك الشخصية وتستعملها وتحميها، وفقاً للقانون المغربي رقم 09-08 المتعلق بحماية الأشخاص الذاتيين تجاه معالجة المعطيات ذات الطابع الشخصي.",
      "pp.collectT":"المعطيات التي نجمعها","pp.collectB":"نجمع فقط المعطيات التي تدخلها بنفسك في نموذج التسجيل: الاسم، السن، الجنس، المدينة والحي، رقم الهاتف والبريد الإلكتروني، الشهادة والتخصص، اللغات، المواد والمستويات، الخبرة المهنية والمهارات، بالإضافة إلى سيرتك الذاتية وأي شواهد أو صورة تختار رفعها.",
      "pp.purposeT":"لماذا نجمعها","pp.purposeB":"نستعمل هذه المعطيات لغرض وحيد: ربطك بالمؤسسات التعليمية الخاصة القريبة منك التي تبحث عن أطر تربوية، وتسهيل عملية التوظيف.",
      "pp.legalT":"الأساس القانوني","pp.legalB":"تتم معالجة معطياتك بناءً على موافقتك الصريحة التي تمنحها عند إرسال النموذج. يمكنك سحب موافقتك في أي وقت بمراسلتنا.",
      "pp.shareT":"مع من نشاركها","pp.shareB":"لا نبيع معطياتك أبداً. نشاركها فقط مع المؤسسات التعليمية الشريكة لغرض التوظيف، وبعد موافقتك.",
      "pp.storeT":"أين تُخزَّن","pp.storeB":"تُخزَّن معطياتك على خدمات Google (Google Sheets وGoogle Drive) المؤمَّنة، والوصول إليها محصور في فريق Linkify.",
      "pp.retentionT":"مدة الاحتفاظ","pp.retentionB":"نحتفظ بمعطياتك ما دام ملفك نشطاً على المنصة. يمكنك طلب حذفها نهائياً في أي وقت.",
      "pp.rightsT":"حقوقك","pp.rightsB":"وفقاً للقانون 09-08، لك الحق في الولوج إلى معطياتك وتصحيحها أو حذفها أو الاعتراض على معالجتها. لممارسة هذه الحقوق، راسلنا على البريد أدناه.",
      "pp.securityT":"أمن المعطيات","pp.securityB":"نتخذ تدابير معقولة لحماية معطياتك من الوصول غير المصرَّح به أو الفقدان أو الإفشاء.",
      "pp.contactT":"تواصل معنا","pp.contactB":"لأي سؤال حول هذه السياسة أو معطياتك الشخصية، تواصل معنا عبر:",
      "pp.changesT":"تحديثات السياسة","pp.changesB":"قد نحدّث هذه السياسة من حين لآخر، وسيُنشر أي تغيير على هذه الصفحة مع تحديث التاريخ أعلاه.",
      "pp.back":"العودة إلى الصفحة الرئيسية",
      "btn.prev": "السابق", "btn.next": "التالي", "btn.submit": "إرسال وإنشاء الملف",
      "ok.title": "تهانينا! تم تسجيل ملفك بنجاح.",
      "ok.body": "سنتواصل معك عبر الواتساب أو البريد الإلكتروني عند توفّر فرصة قريبة منك تناسبك.",
      "ok.share": "تعرف أساتذة قد تفيدهم المنصة؟ شارك معهم الرابط:", "ok.wa": "شارك عبر واتساب",
      "how.title": "كيف تعمل Linkify", "how.sub": "ثلاث خطوات بسيطة، دون تعقيد.",
      "how.1t": "أنشئ ملفك", "how.1b": "أدخل معلوماتك المهنية مرة واحدة: التخصص، الخبرة، اللغات، وموقعك الجغرافي.",
      "how.2t": "نوصلك بالأقرب إليك", "how.2b": "تجد المؤسسات التعليمية القريبة من سكناك ملفك ضمن قاعدة بياناتنا.",
      "how.3t": "تواصل مباشر", "how.3b": "تتواصل معك المؤسسة المهتمة مباشرة. القرار النهائي دائماً بيدك.",
      "why.title": "لماذا Linkify",
      "why.1t": "القُرب الجغرافي", "why.1b": "نركّز على الفرص القريبة من سكناك — وقت أقل في الطريق، واستقرار أكبر.",
      "why.2t": "مجاني للأساتذة", "why.2b": "إنشاء الملف والظهور للمؤسسات مجاني بالكامل.",
      "why.3t": "ملف مهني منظّم", "why.3b": "سيرتك وشهاداتك ولغاتك في مكان واحد، كما يفضّله المدراء.",
      "why.4t": "بياناتك محمية", "why.4b": "نشارك معلوماتك فقط بعد موافقتك، ومع المؤسسات الشريكة لا غير.",
      "foot.tag": "نربط الكفاءات التربوية بالفرص القريبة منها.", "foot.made": "صُنع بالمغرب 🇲🇦", "foot.rights": "جميع الحقوق محفوظة.",
      "v.required": "هذا الحقل مطلوب", "v.email": "البريد الإلكتروني غير صحيح",
      "v.phone": "رقم هاتف مغربي غير صحيح (مثال: 0612345678 أو ‎+212612345678‎)",
      "v.choose": "اختر أحد الخيارات", "v.file": "هذا الملف مطلوب", "v.fileSize": "حجم الملف كبير (أقصى 5MB)",
      "v.consent": "يجب الموافقة لإتمام التسجيل",
      "st.sending": "جارٍ الإرسال...", "st.uploading": "جارٍ رفع ملفك والوثائق... قد يستغرق بضع ثوانٍ. الرجاء عدم إغلاق الصفحة.",
      "st.error": "حدث خطأ أثناء الإرسال. حاول مرة أخرى، أو تواصل معنا عبر contact@linkify.ma",
      "wa.msg": "سجّل مجاناً في منصة Linkify ودع المؤسسات التعليمية القريبة منك تصل إليك 👇"
    },

    fr: {
      "meta.title": "Linkify.ma — La plateforme qui relie les enseignants aux établissements au Maroc",
      "nav.register": "S'inscrire", "nav.how": "Comment ça marche", "nav.why": "Pourquoi Linkify", "nav.cta": "Inscription gratuite",
      "hero.badge": "100% gratuit pour les enseignants",
      "hero.h1": "L'établissement qui vous cherche… est peut-être à quelques kilomètres.",
      "hero.lead": "Linkify relie les cadres pédagogiques et administratifs aux établissements privés proches d'eux. Créez votre profil professionnel une seule fois, et laissez les décideurs vous trouver.",
      "hero.cta": "Créez votre profil ↓",
      "match.left": "Établissements", "match.right": "Enseignants",
      "match.title": "Mise en relation intelligente", "match.sub": "Nous relions le talent à l'opportunité la plus proche",
      "form.title": "Créez votre profil professionnel — gratuitement",
      "form.sub": "Remplissez votre profil en quelques minutes et laissez les établissements proches vous trouver. Chaque étape est courte.",
      "form.step": "Étape", "form.of": "sur",
      "s1.legend": "Informations personnelles",
      "s1.consentNote": "En continuant, vous acceptez que vos informations soient enregistrées et que nous vous contactions par WhatsApp ou e-mail pour vous aider à finaliser votre inscription. Consultez notre",
      "f.first": "Prénom", "f.last": "Nom", "f.age": "Âge",
      "f.gender": "Sexe", "g.male": "Homme", "g.female": "Femme",
      "f.city": "Ville", "ph.city": "Choisissez votre ville", "f.cityOther": "Nom de votre ville", "opt.cityOther": "Autre ville",
      "city.kenitra":"Kénitra","city.sale":"Salé","city.rabat":"Rabat","city.temara":"Témara","city.skhirat":"Skhirat","city.bouznika":"Bouznika","city.mohammedia":"Mohammedia","city.casa":"Casablanca","city.tanger":"Tanger","city.tetouan":"Tétouan","city.larache":"Larache","city.ksarkebir":"Ksar El Kébir","city.sidislimane":"Sidi Slimane","city.sidikacem":"Sidi Kacem","city.ouezzane":"Ouezzane","city.meknes":"Meknès","city.fes":"Fès","city.sefrou":"Sefrou","city.taza":"Taza","city.oujda":"Oujda","city.berkane":"Berkane","city.nador":"Nador","city.khouribga":"Khouribga","city.benimellal":"Béni Mellal","city.fkihbensalah":"Fkih Ben Salah","city.settat":"Settat","city.berrechid":"Berrechid","city.eljadida":"El Jadida","city.sidibennour":"Sidi Bennour","city.safi":"Safi","city.essaouira":"Essaouira","city.marrakech":"Marrakech","city.kelaa":"Kelaât Sraghna","city.agadir":"Agadir","city.inezgane":"Inezgane","city.aitmelloul":"Aït Melloul","city.taroudant":"Taroudant","city.tiznit":"Tiznit",
      "f.neigh": "Quartier", "ph.neigh": "Commencez à taper ou choisissez votre quartier...",
      "hint.neigh": "Choisissez d'abord votre ville, puis commencez à taper le quartier : des suggestions apparaîtront. S'il n'y figure pas, saisissez-le manuellement.",
      "f.whatsapp": "Numéro WhatsApp", "f.email": "Adresse e-mail",
      "s2.legend": "Informations générales et études",
      "f.transport": "Disposez-vous d'un moyen de transport personnel ?", "tr.car": "Voiture", "tr.moto": "Moto", "tr.none": "Aucun",
      "f.license": "Avez-vous un permis de conduire ?", "lic.car": "Permis voiture", "lic.moto": "Permis moto", "lic.none": "Aucun",
      "f.relocate": "Prêt à déménager pour le travail ?", "rel.yes": "Oui, tout à fait", "rel.offer": "Selon l'offre", "rel.no": "Ma ville uniquement",
      "f.track": "Filière générale", "tk.sci": "Scientifique / technique", "tk.lit": "Littéraire / humaine", "tk.pre": "Préscolaire et éducatrices",
      "hint.track": "Selon votre filière, nous afficherons les matières adaptées à l'étape suivante.",
      "f.diploma": "Plus haut diplôme obtenu", "ph.choose": "Choisir",
      "dp.bacLevel": "Niveau baccalauréat", "dp.bac": "Baccalauréat", "dp.dut": "Bac+2", "dp.lic": "Licence",
      "dp.master": "Master", "dp.eng": "Ingénieur", "dp.phd": "Doctorat", "dp.other": "Autre",
      "f.diplomaOther": "Précisez le diplôme",
      "f.specialty": "Spécialité", "ph.specialty": "Ex : mathématiques, langue française...", "f.university": "Établissement ou université",
      "s3.legend": "Compétences linguistiques et documents",
      "lang.rate": "Évaluez votre niveau dans les langues suivantes :",
      "lang.ar": "Arabe", "lang.fr": "Français", "lang.en": "Anglais", "lang.es": "Espagnol", "lang.de": "Allemand",
      "lv.native": "Langue maternelle", "lv.exc": "Excellent", "lv.mid": "Moyen", "lv.basic": "De base", "lv.none": "Aucune notion",
      "f.cv": "CV", "hint.cv": "Format PDF ou Word · taille max 5 Mo. Ce document est essentiel dans votre profil.",
      "f.certs": "Attestations supplémentaires (facultatif)", "hint.certs": "Attestations de formation continue, diplômes de langues... (un seul fichier, max 5 Mo)",
      "s4.legend": "Quoi et où souhaitez-vous enseigner",
      "f.subjects": "Matières / langues que vous souhaitez enseigner",
      "hint.subjects": "Les matières s'affichent selon votre filière. Modifiez la filière à l'étape précédente pour les changer.",
      "sub.math": "Mathématiques", "sub.pc": "Physique-Chimie", "sub.svt": "SVT", "sub.it": "Informatique",
      "sub.acc": "Gestion et comptabilité", "sub.islam": "Éducation islamique", "sub.arabic": "Langue arabe", "sub.french": "Langue française",
      "sub.english": "Langue anglaise", "sub.spanish": "Langue espagnole", "sub.german": "Langue allemande", "sub.philo": "Philosophie",
      "sub.hist": "Histoire-Géographie", "sub.motor": "Motricité fine", "sub.psy": "Psychomotricité",
      "sub.earlyLang": "Langues précoces", "sub.songs": "Chants et contes pour enfants",
      "f.levels": "Tranche d'âge / cycles que vous pouvez gérer",
      "lvl.pre": "Préscolaire (3-5 ans)", "lvl.primary": "Primaire", "lvl.college": "Collège",
      "lvl.high": "Lycée qualifiant", "lvl.higher": "Enseignement supérieur", "lvl.adult": "Adultes / formation continue",
      "f.instTypes":"Types d'établissements où vous souhaitez travailler",
      "it.school":"École privée","it.support":"Centre de soutien scolaire","it.lang":"Centre de langues","it.training":"Centre de formation","it.nursery":"Crèche / préscolaire","it.higher":"Enseignement supérieur privé",
      "about.line":"Linkify est une initiative marocaine qui vise à combler le fossé entre les enseignants compétents et les établissements éducatifs qui les recherchent — de manière gratuite, locale et sûre.",
      "f.schedule": "Type d'emploi du temps possible", "sch.full": "Temps plein", "sch.part": "Temps partiel",
      "sch.hours": "Heures / séances précises", "sch.all": "Tout ce qui précède",
      "f.substitute": "Êtes-vous prêt à enseigner comme remplaçant en cas d'absence urgente ?",
      "subst.yes": "Oui, disponible", "subst.cond": "Selon les circonstances", "subst.no": "Non",
      "hint.substitute": "Les établissements recherchent souvent des enseignants prêts à remplacer en urgence pendant l'année — cette disponibilité augmente vos chances.",
      "s5.legend": "Expérience professionnelle",
      "f.hasExp": "Avez-vous déjà travaillé dans l'enseignement ?", "exp.yes": "Oui", "exp.no": "Non (jeune diplômé)",
      "f.expYears": "Nombre total d'années d'expérience", "ey.lt1": "Moins d'un an", "ey.1to3": "Entre 1 et 3 ans",
      "ey.4to5": "Entre 4 et 5 ans", "ey.gt5": "Plus de 5 ans",
      "f.lastInst": "Dernier établissement (ou actuel)", "f.lastRole": "Dernier poste (ou actuel)", "ph.lastRole": "Enseignant, surveillant général...",
      "f.schools": "Principales écoles et centres où vous avez travaillé", "ph.schools": "Donnez un maximum de détails pour que nous trouvions les meilleurs postes pour vous.",
      "s6.legend": "Compétences supplémentaires et finalisation",
      "f.skills": "Compétences pédagogiques et numériques (facultatif)",
      "sk.remote": "Enseignement à distance", "sk.content": "Création de contenu pédagogique", "sk.ai": "IA dans l'éducation",
      "sk.spss": "Analyse statistique (SPSS)", "sk.theater": "Théâtre pédagogique et animation", "sk.clubs": "Activités parascolaires et clubs",
      "sk.other": "Autre compétence", "f.skillOther": "Précisez vos autres compétences",
      "f.photo": "Photo de profil", "opt.optional": "(facultatif)",
      "hint.photo": "Vous pouvez l'ajouter plus tard à votre profil. Préférez une photo sur fond neutre avec des traits visibles (max 5 Mo).",
      "f.consent": "J'accepte le partage de mes données avec les établissements partenaires à des fins de recrutement, et je reconnais avoir pris connaissance de la", "f.privacyLink": "politique de confidentialité",
      "pp.title":"Politique de confidentialité","pp.updated":"Dernière mise à jour : juin 2026",
      "pp.introT":"Qui sommes-nous","pp.introB":"Cette politique explique comment Linkify collecte, utilise et protège vos données personnelles, conformément à la loi marocaine n° 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel.",
      "pp.collectT":"Données que nous collectons","pp.collectB":"Nous ne collectons que les données que vous saisissez vous-même dans le formulaire : nom, âge, sexe, ville et quartier, téléphone et e-mail, diplôme et spécialité, langues, matières et niveaux, expérience et compétences, ainsi que votre CV et les attestations ou la photo que vous choisissez d'ajouter.",
      "pp.purposeT":"Pourquoi nous les collectons","pp.purposeB":"Nous utilisons ces données dans un seul but : vous mettre en relation avec les établissements privés proches de vous qui recherchent des enseignants, et faciliter le recrutement.",
      "pp.legalT":"Base légale","pp.legalB":"Le traitement repose sur votre consentement explicite donné lors de l'envoi du formulaire. Vous pouvez le retirer à tout moment en nous contactant.",
      "pp.shareT":"Avec qui nous les partageons","pp.shareB":"Nous ne vendons jamais vos données. Nous ne les partageons qu'avec les établissements partenaires à des fins de recrutement, et après votre consentement.",
      "pp.storeT":"Où elles sont stockées","pp.storeB":"Vos données sont stockées sur les services sécurisés de Google (Google Sheets et Google Drive), et l'accès est limité à l'équipe Linkify.",
      "pp.retentionT":"Durée de conservation","pp.retentionB":"Nous conservons vos données tant que votre profil est actif sur la plateforme. Vous pouvez demander leur suppression définitive à tout moment.",
      "pp.rightsT":"Vos droits","pp.rightsB":"Conformément à la loi 09-08, vous disposez d'un droit d'accès, de rectification, de suppression et d'opposition au traitement de vos données. Pour les exercer, écrivez-nous à l'adresse ci-dessous.",
      "pp.securityT":"Sécurité des données","pp.securityB":"Nous prenons des mesures raisonnables pour protéger vos données contre tout accès non autorisé, perte ou divulgation.",
      "pp.contactT":"Nous contacter","pp.contactB":"Pour toute question concernant cette politique ou vos données personnelles, contactez-nous à :",
      "pp.changesT":"Mises à jour","pp.changesB":"Nous pouvons mettre à jour cette politique de temps à autre ; tout changement sera publié sur cette page avec la date mise à jour ci-dessus.",
      "pp.back":"Retour à l'accueil",
      "btn.prev": "Précédent", "btn.next": "Suivant", "btn.submit": "Envoyer et créer le profil",
      "ok.title": "Félicitations ! Votre profil a été enregistré.",
      "ok.body": "Nous vous contacterons par WhatsApp ou e-mail dès qu'une opportunité proche de vous se présente.",
      "ok.share": "Vous connaissez des enseignants que la plateforme pourrait aider ? Partagez le lien :", "ok.wa": "Partager sur WhatsApp",
      "how.title": "Comment fonctionne Linkify", "how.sub": "Trois étapes simples, sans complications.",
      "how.1t": "Créez votre profil", "how.1b": "Saisissez vos informations professionnelles une seule fois : spécialité, expérience, langues et localisation.",
      "how.2t": "Nous vous relions au plus proche", "how.2b": "Les établissements proches de chez vous trouvent votre profil dans notre base de données.",
      "how.3t": "Contact direct", "how.3b": "L'établissement intéressé vous contacte directement. La décision finale vous appartient toujours.",
      "why.title": "Pourquoi Linkify",
      "why.1t": "Proximité géographique", "why.1b": "Nous privilégions les opportunités proches de chez vous — moins de trajet, plus de stabilité.",
      "why.2t": "Gratuit pour les enseignants", "why.2b": "La création du profil et la visibilité auprès des établissements sont entièrement gratuites.",
      "why.3t": "Profil professionnel organisé", "why.3b": "Votre CV, vos diplômes et vos langues au même endroit, comme le préfèrent les directeurs.",
      "why.4t": "Vos données sont protégées", "why.4b": "Nous ne partageons vos informations qu'après votre accord, et uniquement avec les établissements partenaires.",
      "foot.tag": "Nous relions les talents pédagogiques aux opportunités proches.", "foot.made": "Fait au Maroc 🇲🇦", "foot.rights": "Tous droits réservés.",
      "v.required": "Ce champ est obligatoire", "v.email": "Adresse e-mail invalide",
      "v.phone": "Numéro marocain invalide (ex : 0612345678 ou ‎+212612345678‎)",
      "v.choose": "Choisissez une option", "v.file": "Ce fichier est obligatoire", "v.fileSize": "Fichier trop volumineux (max 5 Mo)",
      "v.consent": "Vous devez accepter pour continuer",
      "st.sending": "Envoi en cours...", "st.uploading": "Téléchargement de votre profil et de vos documents... cela peut prendre quelques secondes. Merci de ne pas fermer la page.",
      "st.error": "Une erreur est survenue lors de l'envoi. Réessayez ou contactez-nous à contact@linkify.ma",
      "wa.msg": "Inscrivez-vous gratuitement sur Linkify et laissez les établissements proches vous trouver 👇"
    },

    en: {
      "meta.title": "Linkify.ma — Connecting teachers with schools across Morocco",
      "nav.register": "Sign up", "nav.how": "How it works", "nav.why": "Why Linkify", "nav.cta": "Sign up free",
      "hero.badge": "100% free for teachers",
      "hero.h1": "The school looking for you… might be just a few kilometers away.",
      "hero.lead": "Linkify connects teaching and administrative staff with nearby private institutions. Build your professional profile once, and let decision-makers reach you.",
      "hero.cta": "Create your profile ↓",
      "match.left": "Institutions", "match.right": "Teachers",
      "match.title": "Smart matching", "match.sub": "Connecting talent to the nearest opportunity",
      "form.title": "Create your professional profile — for free",
      "form.sub": "Fill in your profile in minutes and let nearby institutions find you. Each step is short.",
      "form.step": "Step", "form.of": "of",
      "s1.legend": "Personal information",
      "s1.consentNote": "By continuing, you agree that your information will be saved and that we may contact you via WhatsApp or email to help you complete your registration. See our",
      "f.first": "First name", "f.last": "Last name", "f.age": "Age",
      "f.gender": "Gender", "g.male": "Male", "g.female": "Female",
      "f.city": "City", "ph.city": "Choose your city", "f.cityOther": "Your city name", "opt.cityOther": "Other city",
      "city.kenitra":"Kenitra","city.sale":"Salé","city.rabat":"Rabat","city.temara":"Temara","city.skhirat":"Skhirat","city.bouznika":"Bouznika","city.mohammedia":"Mohammedia","city.casa":"Casablanca","city.tanger":"Tangier","city.tetouan":"Tetouan","city.larache":"Larache","city.ksarkebir":"Ksar el-Kebir","city.sidislimane":"Sidi Slimane","city.sidikacem":"Sidi Kacem","city.ouezzane":"Ouezzane","city.meknes":"Meknes","city.fes":"Fez","city.sefrou":"Sefrou","city.taza":"Taza","city.oujda":"Oujda","city.berkane":"Berkane","city.nador":"Nador","city.khouribga":"Khouribga","city.benimellal":"Beni Mellal","city.fkihbensalah":"Fkih Ben Salah","city.settat":"Settat","city.berrechid":"Berrechid","city.eljadida":"El Jadida","city.sidibennour":"Sidi Bennour","city.safi":"Safi","city.essaouira":"Essaouira","city.marrakech":"Marrakesh","city.kelaa":"Kelaat Sraghna","city.agadir":"Agadir","city.inezgane":"Inezgane","city.aitmelloul":"Ait Melloul","city.taroudant":"Taroudant","city.tiznit":"Tiznit",
      "f.neigh": "Neighborhood", "ph.neigh": "Start typing or pick your neighborhood...",
      "hint.neigh": "Choose your city first, then start typing your neighborhood and suggestions will appear. If it's not listed, type it manually.",
      "f.whatsapp": "WhatsApp number", "f.email": "Email address",
      "s2.legend": "General & educational info",
      "f.transport": "Do you have your own means of transport?", "tr.car": "Car", "tr.moto": "Motorcycle", "tr.none": "None",
      "f.license": "Do you have a driving license?", "lic.car": "Car license", "lic.moto": "Motorcycle license", "lic.none": "None",
      "f.relocate": "Willing to relocate for work?", "rel.yes": "Yes, definitely", "rel.offer": "Depends on the offer", "rel.no": "My city only",
      "f.track": "General track", "tk.sci": "Science / technical", "tk.lit": "Literary / humanities", "tk.pre": "Preschool & caregivers",
      "hint.track": "Based on your track, we'll show the relevant subjects in the next step.",
      "f.diploma": "Highest diploma obtained", "ph.choose": "Choose",
      "dp.bacLevel": "Baccalaureate level", "dp.bac": "Baccalaureate", "dp.dut": "2-year diploma", "dp.lic": "Bachelor's",
      "dp.master": "Master's", "dp.eng": "Engineer", "dp.phd": "PhD", "dp.other": "Other",
      "f.diplomaOther": "Specify the diploma",
      "f.specialty": "Specialty", "ph.specialty": "e.g. mathematics, French language...", "f.university": "Institution or university",
      "s3.legend": "Language skills & documents",
      "lang.rate": "Rate your level in the following languages:",
      "lang.ar": "Arabic", "lang.fr": "French", "lang.en": "English", "lang.es": "Spanish", "lang.de": "German",
      "lv.native": "Native", "lv.exc": "Excellent", "lv.mid": "Intermediate", "lv.basic": "Basic", "lv.none": "None",
      "f.cv": "Resume (CV)", "hint.cv": "PDF or Word · max 5MB. This document is essential in your profile.",
      "f.certs": "Additional certificates (optional)", "hint.certs": "Continuing-education certificates, language diplomas... (one file, max 5MB)",
      "s4.legend": "What and where you want to teach",
      "f.subjects": "Subjects / languages you want to teach",
      "hint.subjects": "Subjects are shown based on your general track. Change the track in the previous step to update them.",
      "sub.math": "Mathematics", "sub.pc": "Physics & Chemistry", "sub.svt": "Life & Earth Sciences", "sub.it": "Computer Science",
      "sub.acc": "Management & Accounting", "sub.islam": "Islamic Education", "sub.arabic": "Arabic", "sub.french": "French",
      "sub.english": "English", "sub.spanish": "Spanish", "sub.german": "German", "sub.philo": "Philosophy",
      "sub.hist": "History & Geography", "sub.motor": "Fine motor skills", "sub.psy": "Psychomotor education",
      "sub.earlyLang": "Early languages", "sub.songs": "Children's songs & stories",
      "f.levels": "Age group / levels you can handle",
      "lvl.pre": "Preschool (3-5 years)", "lvl.primary": "Primary", "lvl.college": "Middle school",
      "lvl.high": "High school", "lvl.higher": "Higher education", "lvl.adult": "Adults / continuing education",
      "f.instTypes":"Types of institutions you'd like to work in",
      "it.school":"Private school","it.support":"Support & tutoring center","it.lang":"Language center","it.training":"Training center","it.nursery":"Nursery / preschool","it.higher":"Private higher education",
      "about.line":"Linkify is a Moroccan initiative bridging the gap between qualified teaching staff and the educational institutions that need them — free, local, and secure.",
      "f.schedule": "Schedule type you can work", "sch.full": "Full time", "sch.part": "Part time",
      "sch.hours": "Specific hours / sessions", "sch.all": "All of the above",
      "f.substitute": "Are you willing to work as a substitute teacher for emergency absences?",
      "subst.yes": "Yes, available", "subst.cond": "Depending on circumstances", "subst.no": "No",
      "hint.substitute": "Institutions often look for teachers ready to cover emergencies during the year — this availability boosts your chances.",
      "s5.legend": "Professional experience",
      "f.hasExp": "Have you worked in education before?", "exp.yes": "Yes", "exp.no": "No (recent graduate)",
      "f.expYears": "Total years of experience", "ey.lt1": "Less than a year", "ey.1to3": "Between 1 and 3 years",
      "ey.4to5": "Between 4 and 5 years", "ey.gt5": "More than 5 years",
      "f.lastInst": "Last institution (or current)", "f.lastRole": "Last role (or current)", "ph.lastRole": "Teacher, head supervisor...",
      "f.schools": "Main schools and centers you worked at", "ph.schools": "Give as much detail as possible so we can find the best-fitting positions for you.",
      "s6.legend": "Additional skills & finish",
      "f.skills": "Pedagogical & digital skills (optional)",
      "sk.remote": "Remote teaching", "sk.content": "Educational content design", "sk.ai": "AI in education",
      "sk.spss": "Statistical analysis (SPSS)", "sk.theater": "Educational theater & animation", "sk.clubs": "Extracurricular activities & clubs",
      "sk.other": "Other skill", "f.skillOther": "Specify your other skills",
      "f.photo": "Profile photo", "opt.optional": "(optional)",
      "hint.photo": "You can skip it now and add it to your profile later. A neutral background with clear features is preferred (max 5MB).",
      "f.consent": "I agree to share my data with partner institutions for recruitment purposes, and I acknowledge that I have read the", "f.privacyLink": "privacy policy",
      "pp.title":"Privacy Policy","pp.updated":"Last updated: June 2026",
      "pp.introT":"Who we are","pp.introB":"This policy explains how Linkify collects, uses and protects your personal data, in accordance with Moroccan Law No. 09-08 on the protection of individuals with regard to the processing of personal data.",
      "pp.collectT":"Data we collect","pp.collectB":"We only collect the data you enter yourself in the form: name, age, gender, city and neighborhood, phone and email, diploma and specialty, languages, subjects and levels, experience and skills, as well as your CV and any certificates or photo you choose to upload.",
      "pp.purposeT":"Why we collect it","pp.purposeB":"We use this data for one purpose only: to connect you with nearby private institutions looking for teachers, and to facilitate recruitment.",
      "pp.legalT":"Legal basis","pp.legalB":"Processing is based on the explicit consent you give when submitting the form. You can withdraw it at any time by contacting us.",
      "pp.shareT":"Who we share it with","pp.shareB":"We never sell your data. We only share it with partner institutions for recruitment purposes, and after your consent.",
      "pp.storeT":"Where it is stored","pp.storeB":"Your data is stored on Google's secure services (Google Sheets and Google Drive), and access is limited to the Linkify team.",
      "pp.retentionT":"Retention period","pp.retentionB":"We keep your data as long as your profile is active on the platform. You can request its permanent deletion at any time.",
      "pp.rightsT":"Your rights","pp.rightsB":"Under Law 09-08, you have the right to access, rectify, delete, and object to the processing of your data. To exercise these rights, write to us at the address below.",
      "pp.securityT":"Data security","pp.securityB":"We take reasonable measures to protect your data against unauthorized access, loss, or disclosure.",
      "pp.contactT":"Contact us","pp.contactB":"For any question about this policy or your personal data, contact us at:",
      "pp.changesT":"Policy updates","pp.changesB":"We may update this policy from time to time; any change will be published on this page with the updated date above.",
      "pp.back":"Back to home",
      "btn.prev": "Previous", "btn.next": "Next", "btn.submit": "Submit and create profile",
      "ok.title": "Congratulations! Your profile has been registered.",
      "ok.body": "We'll contact you via WhatsApp or email when a nearby opportunity that fits you becomes available.",
      "ok.share": "Know teachers the platform could help? Share the link with them:", "ok.wa": "Share on WhatsApp",
      "how.title": "How Linkify works", "how.sub": "Three simple steps, no hassle.",
      "how.1t": "Create your profile", "how.1b": "Enter your professional info once: specialty, experience, languages, and location.",
      "how.2t": "We connect you to the nearest", "how.2b": "Institutions near you find your profile within our database.",
      "how.3t": "Direct contact", "how.3b": "The interested institution contacts you directly. The final decision is always yours.",
      "why.title": "Why Linkify",
      "why.1t": "Geographic proximity", "why.1b": "We focus on opportunities close to home — less commuting, more stability.",
      "why.2t": "Free for teachers", "why.2b": "Creating your profile and being visible to institutions is completely free.",
      "why.3t": "Organized professional profile", "why.3b": "Your CV, certificates and languages in one place, the way directors like it.",
      "why.4t": "Your data is protected", "why.4b": "We share your information only after your consent, and only with partner institutions.",
      "foot.tag": "Connecting teaching talent with nearby opportunities.", "foot.made": "Made in Morocco 🇲🇦", "foot.rights": "All rights reserved.",
      "v.required": "This field is required", "v.email": "Invalid email address",
      "v.phone": "Invalid Moroccan number (e.g. 0612345678 or ‎+212612345678‎)",
      "v.choose": "Choose an option", "v.file": "This file is required", "v.fileSize": "File too large (max 5MB)",
      "v.consent": "You must agree to continue",
      "st.sending": "Sending...", "st.uploading": "Uploading your profile and documents... this may take a few seconds. Please don't close the page.",
      "st.error": "An error occurred while sending. Please try again, or contact us at contact@linkify.ma",
      "wa.msg": "Sign up free on Linkify and let nearby institutions find you 👇"
    }
  };

  function current() {
    var p;
    try { p = new URLSearchParams(location.search).get("lang"); } catch (e) {}
    if (p && DICT[p]) return p;
    var l;
    try { l = localStorage.getItem(KEY); } catch (e) {}
    return (l && DICT[l]) ? l : "ar";
  }

  function setUrlLang(lang) {
    try { var u = new URL(location.href); u.searchParams.set("lang", lang); history.replaceState(null, "", u); } catch (e) {}
  }

  // global translator (available immediately for form.js)
  window.LINKIFY_LANG = current();
  window.t = function (key) {
    var l = window.LINKIFY_LANG || "ar";
    return (DICT[l] && DICT[l][key] != null) ? DICT[l][key] : (DICT.ar[key] != null ? DICT.ar[key] : key);
  };

  function apply(lang) {
    var d = DICT[lang] || DICT.ar;
    var root = document.documentElement;
    root.setAttribute("lang", lang);
    root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    window.LINKIFY_LANG = lang;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (d[k] != null) el.textContent = d[k];
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-ph");
      if (d[k] != null) el.setAttribute("placeholder", d[k]);
    });
    if (d["meta.title"]) {
      var tk = document.documentElement.getAttribute("data-title-key") || "meta.title";
      if (d[tk]) document.title = d[tk];
    }
    var lbl = document.getElementById("langLabel");
    if (lbl) lbl.textContent = SHORT[lang];
  }

  document.addEventListener("DOMContentLoaded", function () {
    apply(current());
    var btn = document.getElementById("langToggle");
    if (btn) btn.addEventListener("click", function () {
      var i = ORDER.indexOf(current());
      var next = ORDER[(i + 1) % ORDER.length];
      try { localStorage.setItem(KEY, next); } catch (e) {}
      setUrlLang(next);
      // smooth: fade content out, swap text + direction, fade back in
      var root = document.documentElement;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(next); return; }
      root.classList.add("lang-switching");
      setTimeout(function () {
        apply(next);
        // next frame: remove class so it fades back in
        requestAnimationFrame(function () { root.classList.remove("lang-switching"); });
      }, 230);
    });
  });
})();
