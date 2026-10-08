const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RENDER_URL = (process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

app.use(express.json({ limit: "1mb" }));

// ========================================
// WAAMARA BOT - SEENAA NABIYYOOTAA
// Afaan Oromoo fi Afaan Arabaa
// ========================================

const MAIN_MENU = {
  keyboard: [
    [{ text: "📚 Seenaa Nabiyyootaa" }, { text: "🤍 Seenaa Sahaabota" }],
    [{ text: "🌙 Seenaa Nabiyyii ﷺ" }, { text: "👩 Dubartoota Sahaabota" }],
    [{ text: "🕌 Barnoota Islaamaa" }, { text: "❓ Gaaffii fi Deebii" }],
    [{ text: "ℹ️ Waa'ee Botichaa" }]
  ],
  resize_keyboard: true
};

// ========================================
// SEENAA NABIYYOOTA 25
// ========================================

const PROPHETS = [
  {
    id: "adam",
    name: "Aadam (آدم عليه السلام)",
    om: "Aadam عليه السلام nama jalqabaa fi abbaa ilmaan namaa ti. Rabbiin isa uume; maqaa wantootaa isa barsiise. Rabbiin isaaf fi haadha manaa isaa Hawwaa jannata keessa jiraachuu ajaje. Seenaa Aadam Qur'aana keessatti bakka garaagaraatti argina.",
    ar: "آدم عليه السلام هو أبو البشر، خلقه الله وعلّمه الأسماء، وأسكنه الجنة مع زوجته. ثم تاب الله عليه بعد توبته. وردت قصته في مواضع متعددة من القرآن.",
    lesson: "Tawbaa, ajaja Rabbiitiif ajajamuu fi araarama Rabbii abdachuu.",
    ref: "البقرة 30-39، طه 115-123"
  },
  {
    id: "idris",
    name: "Idriis (إدريس عليه السلام)",
    om: "Idriis عليه السلام Nabiyyii Rabbiin dhugaa fi nabiyyummaa isaatiin faarse dha. Qur'aanni isa dhugaa ba'aa fi Nabiyyii ta'uu isaa ibsa; bakka ol'aanaa geessuu isaas dubbata.",
    ar: "إدريس عليه السلام نبيٌّ صدّيق، أثنى الله عليه بالصبر والصدق، وذكر أنه رفعه مكانًا عليًّا.",
    lesson: "Dhugaa dubbachuu, obsuu fi hojii gaarii irratti cichuu.",
    ref: "مريم 56-57، الأنبياء 85"
  },
  {
    id: "nuh",
    name: "Nuuh (نوح عليه السلام)",
    om: "Nuuh عليه السلام ummata isaa yeroo dheeraaf gara Rabbiitti waame. Isaan keessaa namoonni muraasni amanan. Rabbiin amantoota doonii keessatti baraare; warri didan bishaaniin adabaman.",
    ar: "دعا نوح عليه السلام قومه إلى عبادة الله زمنًا طويلًا، فكذّبه أكثرهم. فأمره الله بصنع السفينة، ونجّى المؤمنين وأهلك المكذبين بالطوفان.",
    lesson: "Obsa, waamicha gara toltuutti itti fufuu fi Rabbiitti hirkachuu.",
    ref: "سورة نوح، هود 25-49"
  },
  {
    id: "hud",
    name: "Huud (هود عليه السلام)",
    om: "Huud عليه السلام gara ummata Aaditti ergaman. Ummanni isaanii humna isaanii boonu turan. Huud Rabbiin qofa akka gabbaran isaan waame; yeroo didan bubbee cimaadhaan adabaman.",
    ar: "أرسل الله هودًا عليه السلام إلى قوم عاد، فدعاهم إلى توحيد الله وترك الكبر. فلما كذبوه أهلكهم الله بريح شديدة.",
    lesson: "Of tuulummaa dhiisuu fi humna ofii irratti hin boonin.",
    ref: "الأعراف 65-72، الحاقة 6-8"
  },
  {
    id: "salih",
    name: "Saalih (صالح عليه السلام)",
    om: "Saalih عليه السلام ummata Samuuditti ergaman. Rabbiin gaala akka mallattoo taatu isaaniif kenne. Isaan garuu ajaja Rabbiitiin mormanii gaala sana miidhan; adabbii Rabbii isaan mudate.",
    ar: "أرسل صالح عليه السلام إلى ثمود، وأيّد الله دعوته بالناقة آيةً لهم. لكنهم عقروها وكذّبوا نبيهم، فنزل بهم العذاب.",
    lesson: "Mallattoolee Rabbii kabajuu fi ajaja isaa tuffachuu dhiisuu.",
    ref: "الأعراف 73-79، الشمس 11-15"
  },
  {
    id: "ibrahim",
    name: "Ibraahiim (إبراهيم عليه السلام)",
    om: "Ibraahiim عليه السلام Rabbiin qofa gabbaruu irratti cichan. Sanamoota ummata isaanii didan. Rabbiin ibidda isaan irratti qabbanaa'aa fi nagaa akka taatu godhe. Ibraahiim fi Ismaa'iil Ka'baa ijaaran.",
    ar: "دعا إبراهيم عليه السلام قومه إلى التوحيد ورفض عبادة الأصنام. وجعل الله النار عليه بردًا وسلامًا. ورفع إبراهيم وإسماعيل قواعد البيت الحرام.",
    lesson: "Tawhiida, iimaana cimaa fi Rabbiif ajajamuu.",
    ref: "البقرة 124-129، الأنبياء 51-70"
  },
  {
    id: "lut",
    name: "Luux (لوط عليه السلام)",
    om: "Luux عليه السلام ummata isaa gara qulqullummaa fi ajaja Rabbiitti waame. Isaan gorsa isaa didan. Rabbiin Luux fi maatii isaa keessaa warra amanan baraare; ummata isaa adabe.",
    ar: "دعا لوط عليه السلام قومه إلى الطهارة وترك الفواحش، فكذبوه. فنجّى الله لوطًا وأهله المؤمنين، وأهلك القوم المجرمين.",
    lesson: "Qulqullummaa, safuu fi gorsa haqaa fudhachuu.",
    ref: "هود 77-83، الشعراء 160-175"
  },
  {
    id: "ismail",
    name: "Ismaa'iil (إسماعيل عليه السلام)",
    om: "Ismaa'iil عليه السلام ilma Ibraahiim ti. Qur'aanni isa waadaa eegu, obsa qabu fi maatii isaa salaataa fi zakaa ajajuun faarsa. Inni abbaa isaa waliin Ka'baa ijaaruu keessatti hirmaate.",
    ar: "إسماعيل عليه السلام ابن إبراهيم، وصفه الله بصدق الوعد والصبر، وكان يأمر أهله بالصلاة والزكاة، وشارك أباه في رفع قواعد الكعبة.",
    lesson: "Waadaa eeguu, obsa qabaachuu fi maatii barsiisuu.",
    ref: "مريم 54-55، البقرة 127"
  },
  {
    id: "ishaq",
    name: "Is'haaq (إسحاق عليه السلام)",
    om: "Is'haaq عليه السلام ilma Ibraahiim fi abbaa Ya'aquub ti. Rabbiin Ibraahiim fi haadha manaa isaa Bishaaro Is'haaq kennuun gammachiise. Is'haaq Nabiyyii gaarii ture.",
    ar: "إسحاق عليه السلام ابن إبراهيم، بشّر الله إبراهيم وزوجته به، وجعله نبيًّا من الصالحين.",
    lesson: "Rahmata Rabbii abdachuu fi maatii gaarii ijaaruu.",
    ref: "هود 71-73، الصافات 112-113"
  },
  {
    id: "yaqub",
    name: "Ya'aquub (يعقوب عليه السلام)",
    om: "Ya'aquub عليه السلام ilma Is'haaq ti; abbaa Yuusuf ti. Ilma isaa Yuusuf irraa adda ba'ee gadda guddaa keessa jiraatus Rabbiin irraa abdii hin kutanne.",
    ar: "يعقوب عليه السلام أبو يوسف، صبر على فراق ابنه ولم ييأس من رحمة الله، وقال إنه يشكو بثّه وحزنه إلى الله.",
    lesson: "Obsa bareedaa qabaachuu fi rahmata Rabbii irraa abdii kutachuu dhiisuu.",
    ref: "يوسف 83-87"
  },
  {
    id: "yusuf",
    name: "Yuusuf (يوسف عليه السلام)",
    om: "Yuusuf عليه السلام obboloota isaa irraa rakkina arge; booda garbummaa fi hidhaa keessa darbe. Garuu Rabbiitti amanamee hamaa irraa of eeggata ture. Dhumarratti Rabbiin sadarkaa ol'aanaa isaaf kenne; obboloota isaa dhiiseef.",
    ar: "ابتُلي يوسف عليه السلام بحسد إخوته ثم بالرق والسجن، لكنه صبر واتقى الله. ثم مكّنه الله في الأرض، وعفا عن إخوته.",
    lesson: "Obsa, qulqullummaa, dhiifama fi Rabbiitti amanamuu.",
    ref: "سورة يوسف"
  },
  {
    id: "ayyub",
    name: "Ayyuub (أيوب عليه السلام)",
    om: "Ayyuub عليه السلام rakkina guddaa keessa darban. Garuu Rabbiin hin komanne; obsanii kadhatan. Rabbiin rakkoo isaanii irraa isaan fayyise.",
    ar: "ابتُلي أيوب عليه السلام بالضر، فصبر ولجأ إلى الله بالدعاء، فكشف الله ضرّه وردّ عليه أهله ورحمته.",
    lesson: "Yeroo rakkoo keessatti obsa qabaachuu fi Rabbiitti kadhachuu.",
    ref: "الأنبياء 83-84، ص 41-44"
  },
  {
    id: "shuayb",
    name: "Shu'aayb (شعيب عليه السلام)",
    om: "Shu'aayb عليه السلام ummata Madyanitti ergaman. Isaan safartuu fi madaallii keessatti haqa akka eeganiif gorsan; saamicha fi gowwoomsaa irraa isaan dhoowwan.",
    ar: "أرسل شعيب عليه السلام إلى مدين، فأمرهم بعبادة الله وإيفاء الكيل والميزان وترك الغش والفساد.",
    lesson: "Daldala keessatti amanamummaa fi haqa eeguu.",
    ref: "هود 84-95"
  },
  {
    id: "musa",
    name: "Muusaa (موسى عليه السلام)",
    om: "Muusaa عليه السلام Fira'awna fi Banii Israa'iilitti ergaman. Rabbiin Muusaa mallattoolee hedduudhaan deeggere. Muusaan ummata isaa Fira'awna jalaa baase; Rabbiin galaana qooduun isaan baraare.",
    ar: "أرسل الله موسى عليه السلام إلى فرعون، وأيّده بالآيات. ثم أنجى الله موسى وبني إسرائيل من فرعون وشقّ لهم البحر.",
    lesson: "Zulmii mormuu, haqarratti cichuu fi Rabbiitti hirkachuu.",
    ref: "طه، القصص، الشعراء"
  },
  {
    id: "harun",
    name: "Haaruun (هارون عليه السلام)",
    om: "Haaruun عليه السلام obboleessa Muusaa ti. Rabbiin isa Muusaa waliin ummata gara tawhiidaatti waamuuf erge. Inni gargaaraa fi Nabiyyii gaarii ture.",
    ar: "هارون عليه السلام أخو موسى، جعله الله نبيًّا ووزيرًا لأخيه، فعاونه في دعوة فرعون وبني إسرائيل.",
    lesson: "Obboleeyyan waliif gargaarsa ta'uu fi hojii gaarii keessatti wal deeggaruu.",
    ref: "طه 29-36، مريم 53"
  },
  {
    id: "dhulkifl",
    name: "Dhulkifl (ذو الكفل عليه السلام)",
    om: "Dhulkifl عليه السلام Qur'aana keessatti maqaan isaanii namoota obsa qaban fi gaggaarii waliin dubbatame. Tafsiirri maqaa kana irratti ibsa garaagaraa qaba; waan Qur'aanni ifatti hin ibsine murteessinee hin dubbannu.",
    ar: "ذو الكفل ذُكر في القرآن مع الصابرين والأخيار. ولم يذكر القرآن تفاصيل كثيرة عن قصته، لذلك لا نجزم بتفاصيل لم تثبت.",
    lesson: "Obsa qabaachuu fi hojii gaarii irratti cichuu.",
    ref: "الأنبياء 85-86، ص 48"
  },
  {
    id: "dawud",
    name: "Daawud (داود عليه السلام)",
    om: "Daawud عليه السلام Nabiyyii fi mootii ture. Rabbiin isaaf Zabuur kenne. Inni haqa irratti murteessa, Rabbiin faarsa ture; hojii fi murtii keessatti haqa eeguun beekama.",
    ar: "آتَى الله داود عليه السلام الملك والحكمة والزبور، وأمره بالعدل في الحكم، وكان كثير العبادة والتسبيح.",
    lesson: "Haqaan murteessuu, Rabbiin faarsuu fi amanamummaa.",
    ref: "ص 17-26، الإسراء 55"
  },
  {
    id: "sulayman",
    name: "Sulaymaan (سليمان عليه السلام)",
    om: "Sulaymaan عليه السلام ilma Daawud ti. Rabbiin mootummaa fi beekumsa guddaa isaaf kenne. Inni uumamtoota Rabbiin isaaf kenne sirnaan bulche; qophii fi murtii isaa keessatti hikmaa agarsiise.",
    ar: "سليمان عليه السلام ابن داود، آتاه الله ملكًا عظيمًا وعلّمه، وسخّر له الريح والجن بإذن الله، وكان شاكرًا لنعمة ربه.",
    lesson: "Nim'a Rabbii irratti galata galchuu fi aangoo haqaaf fayyadamuu.",
    ref: "النمل 15-44، ص 30-40"
  },
  {
    id: "ilyas",
    name: "Ilyaas (إلياس عليه السلام)",
    om: "Ilyaas عليه السلام ummata isaa gara Rabbiitti waame; waaqeffannaa Ba'al irraa isaan dhoowwe. Rabbiin isa nageenyaan faarsa.",
    ar: "دعا إلياس عليه السلام قومه إلى عبادة الله وحده وترك عبادة بعل، فذكره الله في عباده المؤمنين.",
    lesson: "Tawhiida irratti cichuu fi shirkii irraa fagaachuu.",
    ref: "الصافات 123-132"
  },
  {
    id: "alyasa",
    name: "Al-Yasa'a (اليسع عليه السلام)",
    om: "Al-Yasa'a عليه السلام Qur'aana keessatti maqaan isaanii Nabiyyoota gaggaarii keessaa dubbatame. Qur'aanni seenaa isaanii bal'inaan hin ibsu; kanaaf waan mirkanaa'e qofa ni dubbanna.",
    ar: "اليسع عليه السلام من الأنبياء الذين ذكرهم الله في القرآن ضمن الأخيار، ولم تُذكر تفاصيل كثيرة عن قصته.",
    lesson: "Namoota gaggaarii hordofuu fi ajaja Rabbiitti ajajamuu.",
    ref: "الأنعام 86، ص 48"
  },
  {
    id: "yunus",
    name: "Yuunus (يونس عليه السلام)",
    om: "Yuunus عليه السلام ummata isaa biraa ba'anii, booda gara rakkoo guddaa seene. Gara Rabbiitti tawbaa fi kadhannaa godhe. Rabbiin isa baraare; ummanni isaas amanee fayyadame.",
    ar: "ذهب يونس عليه السلام مغاضبًا، فابتلعه الحوت، فنادى ربه في الظلمات، فاستجاب الله له ونجّاه. وآمن قومه فانتفعوا بإيمانهم.",
    lesson: "Yeroo rakkinaa Rabbiin kadhachuu fi tawbaa gochuu.",
    ref: "الأنبياء 87-88، سورة يونس 98"
  },
  {
    id: "zakariya",
    name: "Zakariyyaa (زكريا عليه السلام)",
    om: "Zakariyyaa عليه السلام Rabbiin ilma gaarii akka isaaf kennu kadhate. Umuriin isaanii guddaa ta'us, Rabbiin Yahyaa isaaf kenne.",
    ar: "دعا زكريا عليه السلام ربه أن يهب له ولدًا صالحًا، فاستجاب الله دعاءه وبشّره بيحيى.",
    lesson: "Du'aa'ii gochuu fi rahmata Rabbii abdachuu.",
    ref: "آل عمران 38-41، مريم 2-11"
  },
  {
    id: "yahya",
    name: "Yahyaa (يحيى عليه السلام)",
    om: "Yahyaa عليه السلام ilma Zakariyyaa ti. Rabbiin isa ijoollummaa irraa ogummaa fi qulqullummaa kenneef. Inni Nabiyyii gaggaarii fi abbaa haqaati.",
    ar: "يحيى عليه السلام ابن زكريا، آتاه الله الحكم صبيًّا، وكان تقيًّا بارًّا بوالديه ولم يكن جبارًا عصيًّا.",
    lesson: "Qulqullummaa, kabaja maatii fi beekumsa barbaaduu.",
    ref: "مريم 12-15"
  },
  {
    id: "isa",
    name: "Iisaa (عيسى عليه السلام)",
    om: "Iisaa عليه السلام ilma Maryam ti. Rabbiin isa abbaa malee uume; mallattoolee isaaf kenne. Iisaa ummata gara Rabbiitti waame. Akka amantii Islaamaatti Iisaa Nabiyyii Rabbiiti; Rabbiin hin ta'u.",
    ar: "عيسى ابن مريم عبد الله ورسوله، خلقه الله من غير أب، وأيّده بالمعجزات بإذن الله، ودعا بني إسرائيل إلى عبادة الله وحده.",
    lesson: "Rabbiin qofa gabbaruu, qulqullummaa fi rahmata.",
    ref: "آل عمران 45-59، مريم 16-36"
  },
  {
    id: "muhammad",
    name: "Muhammad ﷺ (محمد صلى الله عليه وسلم)",
    om: "Muhammad ﷺ Nabiyyii fi Ergaa Rabbii isa dhumaa dha. Makkaa keessatti dhalatan. Umrii waggaa 40tti wahyiin jalqabame. Booda Madiinaatti hijraa godhan. Qur'aanni isaan irratti bu'e; ummata tawhiida, haqa, rahmata fi amala gaariitti waaman.",
    ar: "محمد صلى الله عليه وسلم خاتم الأنبياء والمرسلين. وُلد بمكة، ونزل عليه الوحي وهو ابن أربعين سنة، ثم هاجر إلى المدينة، وبلّغ رسالة الإسلام ودعا إلى التوحيد والرحمة ومكارم الأخلاق.",
    lesson: "Sunnah isaanii hordofuu, rahmata qabaachuu fi amala gaarii qabaachuu.",
    ref: "الأحزاب 40، العلق 1-5، التوبة 128"
  },
  {
    id: "ismail_extra",
    name: "Yaadannoo: Nabiyyoota 25",
    om: "Maqaaleen Nabiyyoota 25 Qur'aana keessatti beekaman: Aadam, Idriis, Nuuh, Huud, Saalih, Ibraahiim, Luux, Ismaa'iil, Is'haaq, Ya'aquub, Yuusuf, Ayyuub, Shu'aayb, Muusaa, Haaruun, Dhulkifl, Daawud, Sulaymaan, Ilyaas, Al-Yasa'a, Yuunus, Zakariyyaa, Yahyaa, Iisaa fi Muhammad ﷺ.",
    ar: "الأنبياء الخمسة والعشرون المذكورون بأسمائهم في القرآن: آدم، إدريس، نوح، هود، صالح، إبراهيم، لوط، إسماعيل، إسحاق، يعقوب، يوسف، أيوب، شعيب، موسى، هارون، ذو الكفل، داود، سليمان، إلياس، اليسع، يونس، زكريا، يحيى، عيسى، ومحمد صلى الله عليهم وسلم.",
    lesson: "Maqaalee Nabiyyoota Qur'aana keessatti dubbataman irra deebi'ii baradhu.",
    ref: "القرآن الكريم"
  }
];

// ========================================
// SEENAA SAHAABOTAA
// ========================================

const COMPANIONS = [
  {
    id: "abu_bakr",
    name: "Abuu Bakr (أبو بكر الصديق رضي الله عنه)",
    om: "Abuu Bakr رضي الله عنه hiriyyaa dhihoo Nabiyyii Muhammad ﷺ fi namoota jalqaba amanan keessaa tokko ture. Hijraa keessatti Nabiyyii waliin ture. Erga Nabiyyii ﷺ du'anii booda Khaliifaa jalqabaa ta'e.",
    ar: "أبو بكر الصديق رضي الله عنه صاحب النبي ﷺ وأول الخلفاء الراشدين. رافق النبي في الهجرة، وعُرف بالصدق والإيمان والثبات.",
    lesson: "Dhugaa dubbachuu, amanamummaa fi hiriyyaa gaarii ta'uu."
  },
  {
    id: "umar",
    name: "Umar ibn Al-Khattaab (عمر بن الخطاب رضي الله عنه)",
    om: "Umar رضي الله عنه Khaliifaa lammaffaa ture. Haqa, murtii sirrii fi bulchiinsa cimaadhaan beekama. Muslimootaaf tajaajila guddaa kenne.",
    ar: "عمر بن الخطاب رضي الله عنه ثاني الخلفاء الراشدين، اشتهر بالعدل والقوة في الحق، وعمل على إقامة العدل ورعاية شؤون المسلمين.",
    lesson: "Haqa eeguu, itti gaafatamummaa fi nama hundaaf haqa ta'uu."
  },
  {
    id: "uthman",
    name: "Usmaan ibn Affaan (عثمان بن عفان رضي الله عنه)",
    om: "Usmaan رضي الله عنه Khaliifaa sadaffaa ture. Qabeenya isaa hojii toltuu keessatti baase. Qur'aana walitti qindeessuu fi koppii isaa babal'isuu keessatti gahee guddaa qaba.",
    ar: "عثمان بن عفان رضي الله عنه ثالث الخلفاء الراشدين، عُرف بالحياء والكرم، وكان له دور عظيم في نسخ المصاحف وإرسالها إلى الأمصار.",
    lesson: "Arjummaa, haya'ii fi Qur'aana tajaajiluu."
  },
  {
    id: "ali",
    name: "Alii ibn Abii Xaalib (علي بن أبي طالب رضي الله عنه)",
    om: "Alii رضي الله عنه ilma abbeeraa Nabiyyii ﷺ fi abbaa manaa Faaximaa ture. Beekumsa, gootummaa fi murtii sirriidhaan beekama. Khaliifaa afraffaa ture.",
    ar: "علي بن أبي طالب رضي الله عنه ابن عم النبي ﷺ وزوج فاطمة، ورابع الخلفاء الراشدين. اشتهر بالشجاعة والعلم والحكمة.",
    lesson: "Beekumsa barbaaduu, gootummaa fi hikmaa.",
  },
  {
    id: "bilal",
    name: "Bilaal ibn Rabaah (بلال بن رباح رضي الله عنه)",
    om: "Bilaal رضي الله عنه Muslimoota jalqabaa keessaa ture. Sababa iimaana isaatiin rakkina arge; garuu tawhiida irratti ciche. Booda mu'azzina Nabiyyii ﷺ ta'e.",
    ar: "بلال بن رباح رضي الله عنه من السابقين إلى الإسلام، تحمّل الأذى بسبب إيمانه وثبت على التوحيد، وكان من أشهر مؤذني النبي ﷺ.",
    lesson: "Iimaana irratti cichuu fi rakkoo keessatti obsa qabaachuu."
  },
  {
    id: "khadija",
    name: "Khadiijaa (خديجة رضي الله عنها)",
    om: "Khadiijaa رضي الله عنها haadha manaa jalqabaa Nabiyyii Muhammad ﷺ ti. Yeroo wahyiin jalqabu Nabiyyii deeggarte; qabeenya, jaalala fi gorsa isaaniif kennite.",
    ar: "خديجة رضي الله عنها زوجة النبي ﷺ الأولى، آزرته عند نزول الوحي، وكانت مثالًا في الإيمان والوفاء والبذل.",
    lesson: "Nama gaarii deeggaruu, amanamummaa fi obsa.",
  },
  {
    id: "aisha",
    name: "Aa'ishaa (عائشة رضي الله عنها)",
    om: "Aa'ishaa رضي الله عنها haadha mu'mintootaa fi haadha manaa Nabiyyii ﷺ ti. Hadiisa hedduu dabarsite; Muslimoonni beekumsa amantii irraa baratan.",
    ar: "عائشة رضي الله عنها أم المؤمنين، نقلت أحاديث كثيرة عن النبي ﷺ، وكانت من أعلم النساء في الفقه والحديث.",
    lesson: "Beekumsa barachuu fi beekumsa sirriitti dabarsuu.",
  },
  {
    id: "fatima",
    name: "Faaximaa (فاطمة رضي الله عنها)",
    om: "Faaximaa رضي الله عنها intala Nabiyyii Muhammad ﷺ ti. Amala gaarii, salphina jireenyaa fi jaalala maatii irratti fakkeenya gaarii turte.",
    ar: "فاطمة رضي الله عنها ابنة النبي ﷺ، عُرفت بالفضل والقرب من أبيها، وكانت مثالًا في الصبر والعبادة والاهتمام بالأسرة.",
    lesson: "Maatii kabajuu, salphina jireenyaa fi amala gaarii.",
  },
  {
    id: "abdurrahman",
    name: "Abdur-Rahmaan ibn Awf (عبد الرحمن بن عوف رضي الله عنه)",
    om: "Abdur-Rahmaan ibn Awf رضي الله عنه Sahaabaa beekamaa fi daldalaa amanamaa ture. Qabeenya isaa hojii toltuu fi gargaaruu Muslimootaaf baase.",
    ar: "عبد الرحمن بن عوف رضي الله عنه من كبار الصحابة، عُرف بالتجارة والأمانة والإنفاق في سبيل الله ومساعدة المحتاجين.",
    lesson: "Hojii amanamaa, arjummaa fi gargaaruu namoota rakkatan.",
  },
  {
    id: "salman",
    name: "Salmaan Al-Faarisii (سلمان الفارسي رضي الله عنه)",
    om: "Salmaan Al-Faarisii رضي الله عنه dhugaa barbaaduuf imala dheeraa godhe; dhumarratti Islaama fudhate. Yaada isaa waraana Khandaq keessatti dhiheesse.",
    ar: "سلمان الفارسي رضي الله عنه بحث عن الحق حتى هداه الله إلى الإسلام، وأشار بحفر الخندق في غزوة الأحزاب.",
    lesson: "Dhugaa barbaaduu, barachuu fi yaada gaarii dhiheessuu.",
  },
  {
    id: "khalid",
    name: "Khaalid ibn Al-Waliid (خالد بن الوليد رضي الله عنه)",
    om: "Khaalid ibn Al-Waliid رضي الله عنه ajajaa waraanaa beekamaa ture. Islaama erga fudhatee booda Muslimootaaf tajaajila guddaa kenne; gootummaa fi dandeettii hoggansaan beekama.",
    ar: "خالد بن الوليد رضي الله عنه قائد عسكري مشهور، أسلم وخدم المسلمين، وعُرف بالشجاعة وحسن القيادة.",
    lesson: "Dandeettii ofii hojii gaarii fi tajaajilaaf fayyadamuu.",
  },
  {
    id: "zayd",
    name: "Zayd ibn Haarithaa (زيد بن حارثة رضي الله عنه)",
    om: "Zayd ibn Haarithaa رضي الله عنه Sahaabaa Nabiyyii ﷺ biratti jaallatamaa ture. Qur'aana keessatti maqaan Sahaabaa ifatti dubbatame isa qofa.",
    ar: "زيد بن حارثة رضي الله عنه من أصحاب النبي ﷺ، وكان محبوبًا عنده، وهو الصحابي الوحيد الذي ذُكر اسمه صراحة في القرآن.",
    lesson: "Amanamummaa, jaalala fi hojii gaarii.",
  }
];

// ========================================
// BARNOOTA ISLAAMAA
// ========================================

const LESSONS = [
  {
    id: "islam",
    name: "أركان الإسلام - Arkaana Islaamaa",
    om: "Arkaanni Islaamaa shan:\n1. Shahadaa ragaa bahuu.\n2. Salaata salaatuu.\n3. Zakaa kennuu.\n4. Ji'a Ramadaanaa soomuu.\n5. Nama dandeettii qabuuf Hajjii deemuu.",
    ar: "أركان الإسلام خمسة: شهادة أن لا إله إلا الله وأن محمدًا رسول الله، وإقام الصلاة، وإيتاء الزكاة، وصوم رمضان، وحج البيت لمن استطاع إليه سبيلًا."
  },
  {
    id: "iman",
    name: "أركان الإيمان - Arkaana Iimaanaa",
    om: "Arkaanni Iimaanaa ja'a:\n1. Rabbiitti amanuu.\n2. Malaa'ikoota isaatti amanuu.\n3. Kitaabota isaatti amanuu.\n4. Ergamtoota isaatti amanuu.\n5. Guyyaa Qiyaamaatti amanuu.\n6. Qadara gaarii fi hamaa Rabbiirraa ta'uu amanuu.",
    ar: "أركان الإيمان ستة: الإيمان بالله، وملائكته، وكتبه، ورسله، واليوم الآخر، والقدر خيره وشره."
  },
  {
    id: "salah",
    name: "الصلاة - Salaata",
    om: "Salaanni utubaa amantii Islaamaa keessaa isa guddaa dha. Salaata shanan yeroo isaanii keessatti, shuruutii fi arkaana isaanii eegnee salaatuun barbaachisaa dha. Akkaataa salaataa sirriitti barachuuf barsiisaa amanamaa irraa baradhu.",
    ar: "الصلاة من أعظم شعائر الإسلام، ويجب أداء الصلوات الخمس في أوقاتها مع مراعاة شروطها وأركانها. ويُتعلم أداؤها الصحيح من أهل العلم الموثوقين."
  }
];

// ========================================
// GAAFFII FI DEEBII
// ========================================

const QUIZ = [
  {
    q: "Nabiyyii dhumaa eenyu?",
    a: ["Muusaa عليه السلام", "Iisaa عليه السلام", "Muhammad ﷺ"],
    correct: 2,
    ar: "من هو خاتم الأنبياء؟"
  },
  {
    q: "Nabiyyii galaana keessatti rakkoo arge eenyu?",
    a: ["Yuunus عليه السلام", "Yuusuf عليه السلام", "Idriis عليه السلام"],
    correct: 0,
    ar: "من النبي الذي التقمه الحوت؟"
  },
  {
    q: "Khaliifaan jalqabaa eenyu?",
    a: ["Umar رضي الله عنه", "Abuu Bakr رضي الله عنه", "Alii رضي الله عنه"],
    correct: 1,
    ar: "من أول الخلفاء الراشدين؟"
  },
  {
    q: "Nabiyyii Muusaa obboleessi isaa eenyu?",
    a: ["Haaruun عليه السلام", "Daawud عليه السلام", "Ismaa'iil عليه السلام"],
    correct: 0,
    ar: "من أخو موسى عليه السلام؟"
  },
  {
    q: "Arkaanni Islaamaa meeqa?",
    a: ["Shan", "Ja'a", "Torba"],
    correct: 0,
    ar: "كم عدد أركان الإسلام؟"
  },
  {
    q: "Nabiyyii Ka'baa waliin ijaare ilma isaa eenyu?",
    a: ["Yuusuf عليه السلام", "Ismaa'iil عليه السلام", "Yahyaa عليه السلام"],
    correct: 1,
    ar: "من ابن إبراهيم الذي شاركه في رفع قواعد الكعبة؟"
  }
];

// ========================================
// TELEGRAM API
// ========================================

async function telegram(method, body = {}) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN hin kaa'amne.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    console.error("Telegram API error:", data);
  }

  return data;
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

async function answerCallback(callbackId, text = "") {
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackId,
    text
  });
}

function inlineKeyboard(rows) {
  return {
    inline_keyboard: rows.map(row =>
      row.map(button => ({
        text: button.text,
        callback_data: button.data
      }))
    )
  };
}

function homeButton() {
  return [{ text: "🏠 Menu Guddaa", data: "home" }];
}

// ========================================
// MENU FI LISTAA
// ========================================

function prophetsKeyboard() {
  const rows = [];

  for (let i = 0; i < PROPHETS.length; i += 2) {
    rows.push(
      PROPHETS.slice(i, i + 2).map(p => ({
        text: p.name,
        data: `prophet:${p.id}`
      }))
    );
  }

  rows.push(homeButton());
  return inlineKeyboard(rows);
}

function companionsKeyboard() {
  const rows = [];

  for (let i = 0; i < COMPANIONS.length; i += 2) {
    rows.push(
      COMPANIONS.slice(i, i + 2).map(c => ({
        text: c.name,
        data: `companion:${c.id}`
      }))
    );
  }

  rows.push(homeButton());
  return inlineKeyboard(rows);
}

function lessonsKeyboard() {
  const rows = LESSONS.map(item => [
    { text: item.name, data: `lesson:${item.id}` }
  ]);

  rows.push(homeButton());
  return inlineKeyboard(rows);
}

async function showHome(chatId) {
  const text =
    "🌙 WAAMARA — وامارا\n\n" +
    "Baga nagaan dhuftan!\n" +
    "Seenaa Nabiyyootaa fi Sahaabota Afaan Oromoo fi Afaan Arabaa baradhaa.\n\n" +
    "مرحبًا بكم في وامارا!\n" +
    "تعلّموا قصص الأنبياء والصحابة باللغتين الأورومية والعربية.\n\n" +
    "Maal barachuu barbaadda?";

  return sendMessage(chatId, text, { reply_markup: MAIN_MENU });
}

async function showProphets(chatId) {
  return sendMessage(
    chatId,
    "📚 SEENAA NABIYYOOTAA\n\nقصص الأنبياء\n\nNabiyyii barachuu barbaaddu filadhu.\nاختر اسم النبي:",
    { reply_markup: prophetsKeyboard() }
  );
}

async function showCompanions(chatId) {
  return sendMessage(
    chatId,
    "🤍 SEENAA SAHAABOTAA\n\nقصص الصحابة\n\nSahaabaa barachuu barbaaddu filadhu.\nاختر اسم الصحابي أو الصحابية:",
    { reply_markup: companionsKeyboard() }
  );
}

async function showLessons(chatId) {
  return sendMessage(
    chatId,
    "🕌 BARNOOTA ISLAAMAA\n\nالدروس الإسلامية\n\nBarnoota barbaaddu filadhu.",
    { reply_markup: lessonsKeyboard() }
  );
}

// ========================================
// SEENAA TOKKO AGARSIISUU
// ========================================

async function showProphet(chatId, id) {
  const item = PROPHETS.find(p => p.id === id);

  if (!item) {
    return sendMessage(chatId, "Seenaa kana argachuu hin dandeenye.");
  }

  const text =
    "📚 " + item.name + "\n\n" +
    "🇪🇹 AFAAN OROMOO\n" + item.om + "\n\n" +
    "📖 Barumsa irraa argamu:\n" + item.lesson + "\n\n" +
    "🇸🇦 العربية\n" + item.ar + "\n\n" +
    "📚 المرجع القرآني:\n" + item.ref + "\n\n" +
    "⚠️ Yaadachiisa: Seenaa kana keessatti wanti Qur'aana keessatti ifatti hin dhufne akka dhugaa mirkanaa'eetti hin dhiyaatu.";

  return sendMessage(chatId, text, {
    reply_markup: inlineKeyboard([
      [
        { text: "⬅️ Nabiyyoota", data: "prophets" },
        { text: "🏠 Menu", data: "home" }
      ]
    ])
  });
}

async function showCompanion(chatId, id) {
  const item = COMPANIONS.find(c => c.id === id);

  if (!item) {
    return sendMessage(chatId, "Seenaa Sahaabaa kana argachuu hin dandeenye.");
  }

  const text =
    "🤍 " + item.name + "\n\n" +
    "🇪🇹 AFAAN OROMOO\n" + item.om + "\n\n" +
    "📖 Barumsa irraa argamu:\n" + item.lesson + "\n\n" +
    "🇸🇦 العربية\n" + item.ar + "\n\n" +
    "📚 Odeeffannoon seenaa Sahaabaa Qur'aana, Hadiisa sahiiha fi kitaabota seenaa amanamoo irraa mirkaneeffamuu qaba.";

  return sendMessage(chatId, text, {
    reply_markup: inlineKeyboard([
      [
        { text: "⬅️ Sahaabota", data: "companions" },
        { text: "🏠 Menu", data: "home" }
      ]
    ])
  });
}

async function showLesson(chatId, id) {
  const item = LESSONS.find(x => x.id === id);

  if (!item) {
    return sendMessage(chatId, "Barnoota kana argachuu hin dandeenye.");
  }

  return sendMessage(
    chatId,
    "🕌 " + item.name + "\n\n" +
    "🇪🇹 AFAAN OROMOO\n" + item.om + "\n\n" +
    "🇸🇦 العربية\n" + item.ar,
    {
      reply_markup: inlineKeyboard([
        [
          { text: "⬅️ Barnoota", data: "lessons" },
          { text: "🏠 Menu", data: "home" }
        ]
      ])
    }
  );
}

// ========================================
// QUIZ
// ========================================

async function startQuiz(chatId, index = 0) {
  if (index >= QUIZ.length) {
    return sendMessage(
      chatId,
      "🎉 Gaaffii fi deebii xumurtee jirta!\n\nأحسنت! انتهيت من الأسئلة.",
      {
        reply_markup: inlineKeyboard([
          [{ text: "🔁 Irra deebi'i", data: "quiz:0" }],
          homeButton()
        ])
      }
    );
  }

  const q = QUIZ[index];

  const rows = q.a.map((answer, i) => [
    {
      text: answer,
      data: `answer:${index}:${i}`
    }
  ]);

  rows.push(homeButton());

  return sendMessage(
    chatId,
    `❓ Gaaffii ${index + 1}/${QUIZ.length}\n\n${q.q}\n\n🇸🇦 ${q.ar}`,
    { reply_markup: inlineKeyboard(rows) }
  );
}

// ========================================
// MESSAGE HANDLER
// ========================================

async function handleMessage(message) {
  if (!message || !message.chat) return;

  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  if (text.startsWith("/start") || text === "🏠 Menu Guddaa") {
    return showHome(chatId);
  }

  if (text === "/help") {
    return sendMessage(
      chatId,
      "Waamara bot seenaa Nabiyyootaa fi Sahaabota barachuuf si gargaara.\n\n" +
      "/start - Menu guddaa\n" +
      "/prophets - Seenaa Nabiyyootaa\n" +
      "/companions - Seenaa Sahaabota\n" +
      "/quiz - Gaaffii fi deebii"
    );
  }

  if (text === "/prophets" || text === "📚 Seenaa Nabiyyootaa") {
    return showProphets(chatId);
  }

  if (text === "/companions" || text === "🤍 Seenaa Sahaabota") {
    return showCompanions(chatId);
  }

  if (text === "🌙 Seenaa Nabiyyii ﷺ") {
    return showProphet(chatId, "muhammad");
  }

  if (text === "👩 Dubartoota Sahaabota") {
    return sendMessage(
      chatId,
      "👩 DUBARTOOTA SAHAABOTA\n\n" +
      "اختاري الصحابية:\n\n" +
      "1. Khadiijaa رضي الله عنها\n" +
      "2. Aa'ishaa رضي الله عنها\n" +
      "3. Faaximaa رضي الله عنها",
      {
        reply_markup: inlineKeyboard([
          [{ text: "Khadiijaa", data: "companion:khadija" }],
          [{ text: "Aa'ishaa", data: "companion:aisha" }],
          [{ text: "Faaximaa", data: "companion:fatima" }],
          homeButton()
        ])
      }
    );
  }

  if (text === "🕌 Barnoota Islaamaa") {
    return showLessons(chatId);
  }

  if (text === "❓ Gaaffii fi Deebii" || text === "/quiz") {
    return startQuiz(chatId);
  }

  if (text === "ℹ️ Waa'ee Botichaa") {
    return sendMessage(
      chatId,
      "🤖 WAAMARA\n\n" +
      "Bot barnootaa seenaa Nabiyyootaa, Sahaabota fi barnoota Islaamaa Afaan Oromoo fi Afaan Arabaa barsiisuuf qophaa'e.\n\n" +
      "بوت تعليمي لقصص الأنبياء والصحابة والدروس الإسلامية باللغتين الأورومية والعربية.",
      { reply_markup: MAIN_MENU }
    );
  }

  return sendMessage(
    chatId,
    "Filannoo kana hin hubanne. Mee button menu keessaa tokko filadhu.\n\nلم أفهم اختيارك، اختر من القائمة.",
    { reply_markup: MAIN_MENU }
  );
}

// ========================================
// CALLBACK HANDLER
// ========================================

async function handleCallback(query) {
  const data = query.data || "";
  const chatId = query.message && query.message.chat.id;

  await answerCallback(query.id);

  if (!chatId) return;

  if (data === "home") {
    return showHome(chatId);
  }

  if (data === "prophets") {
    return showProphets(chatId);
  }

  if (data === "companions") {
    return showCompanions(chatId);
  }

  if (data === "lessons") {
    return showLessons(chatId);
  }

  if (data.startsWith("prophet:")) {
    return showProphet(chatId, data.slice("prophet:".length));
  }

  if (data.startsWith("companion:")) {
    return showCompanion(chatId, data.slice("companion:".length));
  }

  if (data.startsWith("lesson:")) {
    return showLesson(chatId, data.slice("lesson:".length));
  }

  if (data.startsWith("quiz:")) {
    const index = Number(data.split(":")[1]) || 0;
    return startQuiz(chatId, index);
  }

  if (data.startsWith("answer:")) {
    const parts = data.split(":");
    const questionIndex = Number(parts[1]);
    const answerIndex = Number(parts[2]);
    const question = QUIZ[questionIndex];

    if (!question) {
      return sendMessage(chatId, "Gaaffiin kun hin jiru.");
    }

    const correct = answerIndex === question.correct;

    const resultText = correct
      ? "✅ Sirrii dha! بارك الله فيك"
      : "❌ Deebiin sirrii: " + question.a[question.correct];

    await sendMessage(
      chatId,
      resultText + "\n\n" + question.ar
    );

    return startQuiz(chatId, questionIndex + 1);
  }
}

// ========================================
// WEBHOOK
// ========================================

app.post("/telegram/webhook", async (req, res) => {
  if (WEBHOOK_SECRET) {
    const receivedSecret = req.get("X-Telegram-Bot-Api-Secret-Token");

    if (receivedSecret !== WEBHOOK_SECRET) {
      return res.status(403).send("Forbidden");
    }
  }

  // Telegram deebii saffisaan argata.
  res.sendStatus(200);

  try {
    const update = req.body;

    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  } catch (error) {
    console.error("Update handling error:", error.message);
  }
});

// ========================================
// HEALTH CHECK
// ========================================

app.get("/", (req, res) => {
  res.send(
    "Waamara Bot is running. " +
    "Botichi seenaa Nabiyyootaa fi Sahaabota Afaan Oromoo fi Arabaa barsiisa."
  );
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "Waamara",
    service: "Seenaa Nabiyyootaa fi Sahaabota",
    languages: ["Afaan Oromoo", "العربية"],
    prophets: PROPHETS.length - 1,
    companions: COMPANIONS.length,
    lessons: LESSONS.length,
    quiz_questions: QUIZ.length,
    webhook_configured: Boolean(RENDER_URL && BOT_TOKEN)
  });
});

// ========================================
// START SERVER & SET WEBHOOK
// ========================================

app.listen(PORT, async () => {
  console.log(`Waamara server running on port ${PORT}`);

  if (!BOT_TOKEN) {
    console.error("ERROR: TELEGRAM_BOT_TOKEN Render keessatti hin kaa'amne.");
    return;
  }

  if (!RENDER_URL) {
    console.error("ERROR: RENDER_EXTERNAL_URL Render keessatti hin jiru.");
    return;
  }

  try {
    const webhookUrl = `${RENDER_URL}/telegram/webhook`;

    const body = {
      url: webhookUrl,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false
    };

    if (WEBHOOK_SECRET) {
      body.secret_token = WEBHOOK_SECRET;
    }

    const result = await telegram("setWebhook", body);

    if (result.ok) {
      console.log("Waamara Telegram webhook configured successfully.");
    } else {
      console.error("Webhook setup failed:", result.description);
    }
  } catch (error) {
    console.error("Webhook setup error:", error.message);
  }
});
