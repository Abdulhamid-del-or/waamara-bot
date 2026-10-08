const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

const API = `https://api.telegram.org/bot${BOT_TOKEN || ""}`;

// ========================================
// 1. SEENAA NABIIYYOOTAA
// Afaan Oromoo + Afaan Arabaa
// ========================================

const prophets = [
  {
    name: "Aadam",
    ar: "آدم عليه السلام",
    om: "Nabii Aadam (AS) nama jalqabaa fi abbaa ilmaan namaa ti. Rabbiin isa uume; malaa'ikotaafis akka isaaf sujuudan ajaje. Seenaa isaa keessatti uumama namaa, tawbaa fi ajaja Rabbii kabajuun baranna.",
    arabic: "آدم عليه السلام أبو البشر، خلقه الله تعالى وعلّمه، وأمر الملائكة بالسجود له. وفي قصته نتعلم التوبة وطاعة الله.",
    source: "Al-Baqarah 2:30–39"
  },
  {
    name: "Idriis",
    ar: "إدريس عليه السلام",
    om: "Nabii Idriis (AS) nama dhugaa dubbatu fi Nabiyyii ture. Qur'aanni isa dhugaa dubbataa fi sadarkaa ol'aanaatti ol kaafame jechuun isa ibsa.",
    arabic: "إدريس عليه السلام كان صدّيقًا نبيًّا، وقد أثنى الله عليه وذكر أنه رفعه مكانًا عليًّا.",
    source: "Maryam 19:56–57"
  },
  {
    name: "Nuuh",
    ar: "نوح عليه السلام",
    om: "Nabii Nuuh (AS) ummata isaa gara Rabbiitti waame. Yeroo dheeraaf isaan gorse; warri amanan doonii seenuun balaa bishaan guddaa irraa baraaraman.",
    arabic: "دعا نوح عليه السلام قومه إلى عبادة الله وحده، وصبر على أذاهم، ونجّى الله المؤمنين في السفينة.",
    source: "Huud 11:25–49"
  },
  {
    name: "Huud",
    ar: "هود عليه السلام",
    om: "Nabii Huud (AS) gara ummata Aaditti ergame. Inni isaan Rabbiin qofa akka gabbaran waame; garuu hedduun isaanii didan.",
    arabic: "أرسل الله هودًا عليه السلام إلى قوم عاد، فدعاهم إلى توحيد الله وترك الكبر.",
    source: "Al-A'raaf 7:65–72"
  },
  {
    name: "Saalih",
    ar: "صالح عليه السلام",
    om: "Nabii Saalih (AS) gara ummata Samuuditti ergame. Mallattoo Rabbiin kenneef keessaa gaalli dubartii ture; ummanni isaa ajaja Rabbiitti fincile.",
    arabic: "أرسل الله صالحًا عليه السلام إلى ثمود، وجعل الناقة آية لهم، لكنهم عصوا أمر الله.",
    source: "Al-A'raaf 7:73–79"
  },
  {
    name: "Ibraahiim",
    ar: "إبراهيم عليه السلام",
    om: "Nabii Ibraahiim (AS) tawhiidaaf dhaabbatee waaqeffannaa sanamootaa morme. Rabbiin ibidda keessatti isa baraare. Inni Ismaa'iil waliin Ka'baa ijaare.",
    arabic: "دعا إبراهيم عليه السلام إلى توحيد الله، ونجّاه الله من النار، ورفع مع إسماعيل قواعد الكعبة.",
    source: "Al-Anbiyaa 21:51–70; Al-Baqarah 2:127"
  },
  {
    name: "Luux",
    ar: "لوط عليه السلام",
    om: "Nabii Luux (AS) ummata isaa gara waan gaarii fi qulqullinaatti waame. Inni hojii badaa isaanii irraa isaan akeekkachiise.",
    arabic: "دعا لوط عليه السلام قومه إلى الطاعة والطهارة، وحذّرهم من الفواحش.",
    source: "Huud 11:77–83"
  },
  {
    name: "Ismaa'iil",
    ar: "إسماعيل عليه السلام",
    om: "Nabii Ismaa'iil (AS) ilma Ibraahiim ti. Inni waadaa eegu, obsa qabaachuu fi ajaja Rabbii fudhachuu irratti fakkeenya gaarii ture.",
    arabic: "كان إسماعيل عليه السلام صادق الوعد، وأمر أهله بالصلاة والزكاة.",
    source: "Maryam 19:54–55"
  },
  {
    name: "Is'haaq",
    ar: "إسحاق عليه السلام",
    om: "Nabii Is'haaq (AS) ilma Ibraahiim ti. Rabbiin Ibraahiimii fi Saaraa ilma kana isaan gammachiise.",
    arabic: "وهب الله لإبراهيم عليه السلام إسحاق، وجعله نبيًّا من الصالحين.",
    source: "Huud 11:71–73"
  },
  {
    name: "Ya'quub",
    ar: "يعقوب عليه السلام",
    om: "Nabii Ya'quub (AS) ilma Is'haaq ti. Inni abbaa Yuusuf ti. Yeroo rakkina guddaa keessa darbus Rabbiitti abdii hin kutanne.",
    arabic: "يعقوب عليه السلام والد يوسف، وصبر على فراق ابنه، ولم يقنط من رحمة الله.",
    source: "Yuusuf 12:83–87"
  },
  {
    name: "Yuusuf",
    ar: "يوسف عليه السلام",
    om: "Nabii Yuusuf (AS) obboloota isaatiin miidhame, garuu obse. Rakkoolee hedduu booda Rabbiin isaaf aangoo kenne; inni dhiifama gochuun fakkeenya ta'e.",
    arabic: "ابتُلي يوسف عليه السلام، فصبر واتقى الله، ثم مكّنه الله في الأرض، وعفا عن إخوته.",
    source: "Suuratu Yuusuf 12:4–101"
  },
  {
    name: "Shu'ayb",
    ar: "شعيب عليه السلام",
    om: "Nabii Shu'ayb (AS) ummata isaa daldala keessatti safartuu fi madaallii sirrii akka fayyadaman gorse.",
    arabic: "دعا شعيب عليه السلام قومه إلى عبادة الله، والعدل في الكيل والميزان، وترك الظلم.",
    source: "Huud 11:84–95"
  },
  {
    name: "Ayyuub",
    ar: "أيوب عليه السلام",
    om: "Nabii Ayyuub (AS) rakkoo cimaa keessa obsaan dhaabbate. Inni Rabbiin kadhate; Rabbiinis rahmata isaaf godhe.",
    arabic: "ابتُلي أيوب عليه السلام، فصبر ودعا ربه، فكشف الله ضره ورحمه.",
    source: "Al-Anbiyaa 21:83–84"
  },
  {
    name: "Dhul-Kifl",
    ar: "ذو الكفل",
    om: "Dhul-Kifl (AS) namoota gaggaarii keessaa akka ta'e Qur'aana keessatti dubbatame. Waa'ee isaa odeeffannoo dabalataa keessatti wanta mirkanaa'aa hin taane irraa of qusachuun barbaachisa.",
    arabic: "ذكر الله ذا الكفل في جملة الصابرين والأخيار، وينبغي التثبت في تفاصيل قصته.",
    source: "Al-Anbiyaa 21:85–86"
  },
  {
    name: "Muusaa",
    ar: "موسى عليه السلام",
    om: "Nabii Muusaa (AS) gara Fir'awnitti ergame. Rabbiin isaaf mallattoolee kenne; Biyya galaanaa qooduun Muusaa fi ummata isaa baraare.",
    arabic: "أرسل الله موسى عليه السلام إلى فرعون، وأيّده بالآيات، ونجّاه وبني إسرائيل من فرعون.",
    source: "Taa-Haa 20:9–79"
  },
  {
    name: "Haaruun",
    ar: "هارون عليه السلام",
    om: "Nabii Haaruun (AS) obboleessa Muusaa ti. Muusaa waliin ummata isaanii gara Rabbiitti waamuuf gargaare.",
    arabic: "كان هارون عليه السلام أخا موسى ووزيره في الدعوة إلى الله.",
    source: "Taa-Haa 20:29–36"
  },
  {
    name: "Daawuud",
    ar: "داود عليه السلام",
    om: "Nabii Daawuud (AS) Rabbiin Nabiyyummaa fi mootummaa isaaf kenne. Inni haqaan murteessuu fi Rabbiin faarsuudhaan beekama.",
    arabic: "آتَى الله داود عليه السلام النبوة والحكمة والملك، وأمره بالعدل.",
    source: "Saad 38:17–26"
  },
  {
    name: "Sulaymaan",
    ar: "سليمان عليه السلام",
    om: "Nabii Sulaymaan (AS) ilma Daawuud ti. Rabbiin beekumsa fi mootummaa guddaa isaaf kenne; inni kennaa Rabbiitiif galata galche.",
    arabic: "وهب الله لسليمان عليه السلام ملكًا عظيمًا، فكان شاكرًا لنعمة الله.",
    source: "An-Naml 27:15–44"
  },
  {
    name: "Ilyaas",
    ar: "إلياس عليه السلام",
    om: "Nabii Ilyaas (AS) ummata isaa gara Rabbiin qofa gabbaruutti waame; waaqeffannaa sobaa irraa isaan akeekkachiise.",
    arabic: "دعا إلياس عليه السلام قومه إلى عبادة الله وحده وترك عبادة البعل.",
    source: "As-Saaffaat 37:123–132"
  },
  {
    name: "Al-Yasa'",
    ar: "اليسع عليه السلام",
    om: "Al-Yasa' (AS) Qur'aana keessatti maqaan isaa dubbatame. Rabbiin isa namoota gaggaarii keessaa taasise.",
    arabic: "ذكر الله اليسع عليه السلام في جملة الأخيار.",
    source: "Al-An'aam 6:86"
  },
  {
    name: "Yuunus",
    ar: "يونس عليه السلام",
    om: "Nabii Yuunus (AS) gara ummata isaa ergame. Rakkoo keessa Rabbiin kadhate; Rabbiinis isa baraare.",
    arabic: "دعا يونس عليه السلام ربه في الظلمات، فاستجاب الله له ونجّاه من الغم.",
    source: "Al-Anbiyaa 21:87–88"
  },
  {
    name: "Zakariyyaa",
    ar: "زكريا عليه السلام",
    om: "Nabii Zakariyyaa (AS) Rabbiin ilma gaarii isaaf akka kennu kadhate. Rabbiin kadhannaa isaa qeebalee Yahyaa isaaf kenne.",
    arabic: "دعا زكريا عليه السلام ربه أن يهب له ولدًا صالحًا، فاستجاب الله له.",
    source: "Maryam 19:2–11"
  },
  {
    name: "Yahyaa",
    ar: "يحيى عليه السلام",
    om: "Nabii Yahyaa (AS) ilma Zakariyyaa ti. Rabbiin isaaf beekumsa, qulqullina fi gara-laafina kenne.",
    arabic: "آتَى الله يحيى عليه السلام الحكم صبيًّا، وجعله بارًّا تقيًّا.",
    source: "Maryam 19:12–15"
  },
  {
    name: "Iisaa",
    ar: "عيسى عليه السلام",
    om: "Nabii Iisaa (AS) ilma Maryam ti. Rabbiin isa mallattoolee kenne; Iisaan ummata isaa gara Rabbiitti waame. Muslimaaf Iisaan gabricha Rabbii fi Ergamaa Isaa ti.",
    arabic: "عيسى ابن مريم عبد الله ورسوله، أرسله الله إلى بني إسرائيل وأيّده بالآيات.",
    source: "Aali-Imraan 3:45–55"
  },
  {
    name: "Muhammad",
    ar: "محمد ﷺ",
    om: "Nabii Muhammad ﷺ Ergamaa Rabbii isa dhumaa ti. Qur'aanni isa irratti bu'e. Inni tawhiida, rahmata, haqaa fi amala gaariitti ummata waame.",
    arabic: "محمد ﷺ رسول الله وخاتم النبيين، أنزل الله عليه القرآن هدايةً ورحمةً للعالمين.",
    source: "Al-Ahzaab 33:40; Al-Anbiyaa 21:107"
  }
];

// ========================================
// 2. SAHAABOTA
// ========================================

const companions = [
  {
    name: "Abuu Bakr As-Siddiiq",
    ar: "أبو بكر الصديق رضي الله عنه",
    om: "Abuu Bakr (RA) michuu dhugaa Nabii Muhammad ﷺ fi Khaliifaa jalqabaa Muslimootaa ture. Dhugaa irratti dhaabbachuu fi amanamummaa isaatiin beekama.",
    arabic: "أبو بكر الصديق رضي الله عنه صاحب النبي ﷺ، وأول الخلفاء الراشدين، عُرف بالصدق والثبات.",
    source: "At-Tawbah 9:40"
  },
  {
    name: "Umar ibn Al-Khattaab",
    ar: "عمر بن الخطاب رضي الله عنه",
    om: "Umar (RA) Khaliifaa lammaffaa ture. Haqaa, murtii sirrii fi bulchiinsa haqaa irratti fakkeenya gaarii ture.",
    arabic: "عمر بن الخطاب رضي الله عنه ثاني الخلفاء الراشدين، اشتهر بالعدل والقوة في الحق.",
    source: "Seenaa sahaabota keessatti beekama"
  },
  {
    name: "Usmaan ibn Affaan",
    ar: "عثمان بن عفان رضي الله عنه",
    om: "Usmaan (RA) Khaliifaa sadaffaa ture. Arjaa fi nama Qur'aana tiksuu keessatti gahee guddaa qabu ture.",
    arabic: "عثمان بن عفان رضي الله عنه ثالث الخلفاء الراشدين، عُرف بالحياء والكرم.",
    source: "Seenaa sahaabota keessatti beekama"
  },
  {
    name: "Alii ibn Abii Taalib",
    ar: "علي بن أبي طالب رضي الله عنه",
    om: "Alii (RA) ilma adeeraa Nabii Muhammad ﷺ fi abbaa manaa Faaximaa ture. Beekumsa, ija-jabina fi haqaan murteessuu isaatiin beekama.",
    arabic: "علي بن أبي طالب رضي الله عنه ابن عم النبي ﷺ، عُرف بالعلم والشجاعة.",
    source: "Seenaa sahaabota keessatti beekama"
  },
  {
    name: "Bilal ibn Rabaah",
    ar: "بلال بن رباح رضي الله عنه",
    om: "Bilaal (RA) Muslimoota jalqabaa keessaa tokko ture. Rakkoo amantii isaa irratti isa mudate keessatti obsaan dhaabbate.",
    arabic: "بلال بن رباح رضي الله عنه من السابقين إلى الإسلام، وصبر على الأذى في سبيل الله.",
    source: "Seenaa sahaabota keessatti beekama"
  },
  {
    name: "Khadijaa bint Khuwaylid",
    ar: "خديجة بنت خويلد رضي الله عنها",
    om: "Khadijaa (RA) haadha manaa Nabii Muhammad ﷺ isa jalqabaa ti. Yeroo wahyiin jalqabaa bu'e isa deeggarte.",
    arabic: "خديجة رضي الله عنها زوج النبي ﷺ الأولى، وساندته عند بدء الوحي.",
    source: "Sahiih Al-Bukhaarii, Kitaaba Bad' Al-Wahy"
  },
  {
    name: "Aa'ishaa bint Abii Bakr",
    ar: "عائشة رضي الله عنها",
    om: "Aa'ishaan (RA) haadha warraa Nabii Muhammad ﷺ fi dubartii beekumsa hadiisaa keessatti gahee guddaa qabdu turte.",
    arabic: "عائشة رضي الله عنها من أمهات المؤمنين، وكانت من أعلم الناس بالحديث والفقه.",
    source: "Sahiih Al-Bukhaarii fi Sahiih Muslim"
  },
  {
    name: "Faaximaa bint Muhammad",
    ar: "فاطمة رضي الله عنها",
    om: "Faaximaan (RA) intala Nabii Muhammad ﷺ ti. Amala gaarii fi maatii isheetiif kunuunsa gochuun beekamti.",
    arabic: "فاطمة رضي الله عنها بنت رسول الله ﷺ، عُرفت بفضلها ومكانتها.",
    source: "Sahiih Al-Bukhaarii"
  },
  {
    name: "Khaalid ibn Al-Waliid",
    ar: "خالد بن الوليد رضي الله عنه",
    om: "Khaalid (RA) sahaabaa hoggansa waraanaa keessatti beekama. Inni Muslimootaaf tajaajila guddaa kenne.",
    arabic: "خالد بن الوليد رضي الله عنه من قادة المسلمين المشهورين بالشجاعة.",
    source: "Seenaa sahaabota keessatti beekama"
  },
  {
    name: "Abdur-Rahmaan ibn Awf",
    ar: "عبد الرحمن بن عوف رضي الله عنه",
    om: "Abdur-Rahmaan ibn Awf (RA) sahaabaa arjaa fi daldala keessatti amanamaa ture. Qabeenya isaa keessaa hedduu karaa gaariitti arjoome.",
    arabic: "عبد الرحمن بن عوف رضي الله عنه من العشرة المبشرين بالجنة، وعُرف بالسخاء.",
    source: "Seenaa sahaabota keessatti beekama"
  }
];

// ========================================
// 3. QORMAATA ISLAAMAA
// ========================================

const quizQuestions = [
  {
    q: "Nabiyyii dhumaa eenyu?",
    ar: "من هو خاتم الأنبياء؟",
    options: ["Muusaa", "Iisaa", "Muhammad ﷺ"],
    optionsAr: ["موسى", "عيسى", "محمد ﷺ"],
    answer: 2,
    explanation: "Muhammad ﷺ Ergamaa Rabbii isa dhumaa dha.",
    explanationAr: "محمد ﷺ خاتم النبيين."
  },
  {
    q: "Nabiyyii doonii ijaare eenyu?",
    ar: "من هو النبي الذي صنع السفينة؟",
    options: ["Nuuh", "Yuusuf", "Daawuud"],
    optionsAr: ["نوح", "يوسف", "داود"],
    answer: 0,
    explanation: "Nabii Nuuh (AS) doonii ijaare.",
    explanationAr: "صنع نوح عليه السلام السفينة بأمر الله."
  },
  {
    q: "Abbaan Yuusuf eenyu?",
    ar: "من هو والد يوسف عليه السلام؟",
    options: ["Ibraahiim", "Ya'quub", "Is'haaq"],
    optionsAr: ["إبراهيم", "يعقوب", "إسحاق"],
    answer: 1,
    explanation: "Abbaan Nabii Yuusuf Ya'quub (AS) dha.",
    explanationAr: "والد يوسف عليه السلام هو يعقوب."
  },
  {
    q: "Khaliifaan jalqabaa eenyu?",
    ar: "من هو أول الخلفاء الراشدين؟",
    options: ["Umar", "Alii", "Abuu Bakr"],
    optionsAr: ["عمر", "علي", "أبو بكر"],
    answer: 2,
    explanation: "Abuu Bakr As-Siddiiq (RA) Khaliifaa jalqabaa ture.",
    explanationAr: "أبو بكر الصديق رضي الله عنه أول الخلفاء الراشدين."
  },
  {
    q: "Haadha manaa Nabii Muhammad ﷺ isa jalqabaa eenyu?",
    ar: "من هي أول زوجات النبي ﷺ؟",
    options: ["Aa'ishaa", "Khadijaa", "Hafsaa"],
    optionsAr: ["عائشة", "خديجة", "حفصة"],
    answer: 1,
    explanation: "Khadijaa bint Khuwaylid (RA) dha.",
    explanationAr: "خديجة بنت خويلد رضي الله عنها."
  }
];

// ========================================
// 4. USER SESSION
// ========================================

// Hubannoo: session kun memory keessa jira.
// Render restart yoo ta'e qabxiin duraanii ni bada.
// Database malee yeroo bot hojjetu qofa tura.

const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      lang: "both",
      quizIndex: 0,
      score: 0,
      inQuiz: false,
      quizCount: 0
    });
  }

  return sessions.get(chatId);
}

// ========================================
// 5. TELEGRAM API
// ========================================

async function telegram(method, body) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN hin argamne.");
  }

  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!data.ok) {
    console.error("Telegram API error:", data);
  }

  return data;
}

async function sendMessage(chatId, text, replyMarkup) {
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  return telegram("sendMessage", body);
}

function mainKeyboard() {
  return {
    keyboard: [
      ["📖 Nabiyyoota", "🕌 Sahaabota"],
      ["📝 Qormaata", "🔍 Barbaadi"],
      ["🇪🇹 Afaan Oromoo", "🇸🇦 Afaan Arabaa"],
      ["🌐 Afaan Lamaan", "ℹ️ Gargaarsa"]
    ],
    resize_keyboard: true
  };
}

function languageText(session, om, ar) {
  if (session.lang === "om") return om;
  if (session.lang === "ar") return ar;
  return `${om}\n\n━━━━━━━━━━━━━━\n\n${ar}`;
}

// ========================================
// 6. START / MENU
// ========================================

async function showMenu(chatId) {
  const session = getSession(chatId);

  const welcome = languageText(
    session,
    "Assalaamu alaykum! 🌙\n\nBaga gara Waamaraatti dhuftan.\n\nAs keessatti seenaa Nabiyyootaa, Sahaabota, barnoota Islaamaa fi qormaata argattu.",
    "السلام عليكم ورحمة الله وبركاته\n\nمرحبًا بكم في وامارا.\n\nيمكنكم هنا قراءة قصص الأنبياء والصحابة، وتعلم العلوم الإسلامية، وأداء الاختبارات."
  );

  await sendMessage(chatId, welcome, mainKeyboard());
}

// ========================================
// 7. NABIIYYOOTA FI SAHAABOTA
// ========================================

async function showProphets(chatId) {
  const session = getSession(chatId);

  const buttons = prophets.map((p, index) => [{
    text: `${index + 1}. ${p.name} | ${p.ar}`,
    callback_data: `prophet:${index}`
  }]);

  await sendMessage(
    chatId,
    languageText(
      session,
      "📖 Seenaa Nabiyyootaa\nNabiyyii barbaaddu filadhu:",
      "📖 قصص الأنبياء\nاختر النبي الذي تريد معرفة قصته:"
    ),
    { inline_keyboard: buttons }
  );
}

async function showCompanions(chatId) {
  const session = getSession(chatId);

  const buttons = companions.map((c, index) => [{
    text: c.name,
    callback_data: `companion:${index}`
  }]);

  await sendMessage(
    chatId,
    languageText(
      session,
      "🕌 Seenaa Sahaabota\nSahaabaa barbaaddu filadhu:",
      "🕌 قصص الصحابة\nاختر الصحابي أو الصحابية:"
    ),
    { inline_keyboard: buttons }
  );
}

async function showStory(chatId, story, title, session) {
  const text = languageText(
    session,
    `📖 ${title}\n\n${story.om}\n\n📚 Madda: ${story.source}`,
    `📖 ${story.ar}\n\n${story.arabic}\n\n📚 المصدر: ${story.source}`
  );

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "⬅️ Menu", callback_data: "menu" }]
    ]
  });
}

// ========================================
// 8. QORMAATA QABXII WALIIN
// ========================================

async function startQuiz(chatId) {
  const session = getSession(chatId);

  session.quizIndex = 0;
  session.score = 0;
  session.quizCount = quizQuestions.length;
  session.inQuiz = true;

  await sendMessage(
    chatId,
    languageText(
      session,
      `📝 Qormaanni jalqabe!\nGaaffii ${quizQuestions.length} qabda.\nDeebii sirrii filadhu.`,
      `📝 بدأ الاختبار!\nلديك ${quizQuestions.length} أسئلة.\nاختر الإجابة الصحيحة.`
    )
  );

  await sendQuizQuestion(chatId);
}

async function sendQuizQuestion(chatId) {
  const session = getSession(chatId);

  if (session.quizIndex >= quizQuestions.length) {
    session.inQuiz = false;

    const score = session.score;
    const total = quizQuestions.length;
    const percentage = Math.round((score / total) * 100);

    await sendMessage(
      chatId,
      languageText(
        session,
        `🏆 Qormaanni xumurame!\n\n✅ Qabxii: ${score}/${total}\n📊 Dhibbeentaa: ${percentage}%\n\nGalatoomi hirmaachuu keetiif!`,
        `🏆 انتهى الاختبار!\n\n✅ النتيجة: ${score}/${total}\n📊 النسبة: ${percentage}%\n\nشكرًا لمشاركتك!`
      ),
      mainKeyboard()
    );

    return;
  }

  const index = session.quizIndex;
  const question = quizQuestions[index];

  const buttons = question.options.map((option, i) => [{
    text: `${String.fromCharCode(65 + i)}. ${session.lang === "ar" ? question.optionsAr[i] : option}`,
    callback_data: `answer:${index}:${i}`
  }]);

  await sendMessage(
    chatId,
    languageText(
      session,
      `❓ Gaaffii ${index + 1}/${quizQuestions.length}\n\n${question.q}`,
      `❓ السؤال ${index + 1}/${quizQuestions.length}\n\n${question.ar}`
    ),
    { inline_keyboard: buttons }
  );
}

// ========================================
// 9. CALLBACK HANDLER
// ========================================

async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const data = callback.data || "";
  const session = getSession(chatId);

  await telegram("answerCallbackQuery", {
    callback_query_id: callback.id
  });

  if (data === "menu") {
    return showMenu(chatId);
  }

  if (data.startsWith("prophet:")) {
    const index = Number(data.split(":")[1]);
    const story = prophets[index];

    if (!story) return;

    return showStory(chatId, story, story.name, session);
  }

  if (data.startsWith("companion:")) {
    const index = Number(data.split(":")[1]);
    const story = companions[index];

    if (!story) return;

    return showStory(chatId, story, story.name, session);
  }

  if (data.startsWith("answer:")) {
    if (!session.inQuiz) {
      return sendMessage(
        chatId,
        "Qormaanni kun xumurameera. Qormaata haaraa jalqabi.",
        mainKeyboard()
      );
    }

    const parts = data.split(":");
    const questionIndex = Number(parts[1]);
    const answerIndex = Number(parts[2]);

    if (questionIndex !== session.quizIndex) {
      return sendMessage(chatId, "Gaaffiin kun duraan deebifameera.");
    }

    const question = quizQuestions[questionIndex];
    const correct = answerIndex === question.answer;

    if (correct) session.score++;

    const feedback = languageText(
      session,
      correct
        ? `✅ Deebiin sirrii dha!\n\n${question.explanation}`
        : `❌ Deebiin sirrii miti.\n\nDeebiin sirrii: ${question.options[question.answer]}\n${question.explanation}`,
      correct
        ? `✅ إجابة صحيحة!\n\n${question.explanationAr}`
        : `❌ إجابة غير صحيحة.\n\nالإجابة الصحيحة: ${question.optionsAr[question.answer]}\n${question.explanationAr}`
    );

    await sendMessage(chatId, feedback);

    session.quizIndex++;

    return sendQuizQuestion(chatId);
  }
}

// ========================================
// 10. TEXT HANDLER
// ========================================

async function handleText(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const session = getSession(chatId);

  if (text === "/start" || text === "/menu") {
    return showMenu(chatId);
  }

  if (text === "/help" || text === "ℹ️ Gargaarsa") {
    return sendMessage(
      chatId,
      "Waamara fayyadamuuf:\n\n" +
      "📖 Nabiyyoota — seenaa Nabiyyootaa\n" +
      "🕌 Sahaabota — seenaa Sahaabota\n" +
      "📝 Qormaata — qormaata qabxii waliin\n" +
      "🔍 Barbaadi — maqaa barbaadi\n\n" +
      "Afaan kee jijjiiruuf button afaanii fayyadami.",
      mainKeyboard()
    );
  }

  if (text === "🇪🇹 Afaan Oromoo") {
    session.lang = "om";
    return showMenu(chatId);
  }

  if (text === "🇸🇦 Afaan Arabaa") {
    session.lang = "ar";
    return showMenu(chatId);
  }

  if (text === "🌐 Afaan Lamaan") {
    session.lang = "both";
    return showMenu(chatId);
  }

  if (text === "📖 Nabiyyoota") {
    return showProphets(chatId);
  }

  if (text === "🕌 Sahaabota") {
    return showCompanions(chatId);
  }

  if (text === "📝 Qormaata") {
    return startQuiz(chatId);
  }

  if (text === "🔍 Barbaadi" || text === "/search") {
    return sendMessage(
      chatId,
      "Maqaa Nabiyyii ykn Sahaabaa barbaaddu barreessi.\n\nاكتب اسم النبي أو الصحابي الذي تبحث عنه."
    );
  }

  const query = text.toLowerCase();

  const prophet = prophets.find(p =>
    p.name.toLowerCase().includes(query) ||
    p.ar.toLowerCase().includes(query)
  );

  if (prophet) {
    return showStory(chatId, prophet, prophet.name, session);
  }

  const companion = companions.find(c =>
    c.name.toLowerCase().includes(query) ||
    c.ar.toLowerCase().includes(query)
  );

  if (companion) {
    return showStory(chatId, companion, companion.name, session);
  }

  return sendMessage(
    chatId,
    languageText(
      session,
      "Maqaan kun hin argamne. Maaloo maqaa Nabiyyii ykn Sahaabaa sirriitti barreessi, yookaan menu irraa filadhu.",
      "لم نجد هذا الاسم. يرجى كتابة اسم النبي أو الصحابي بشكل صحيح، أو اختر من القائمة."
    ),
    mainKeyboard()
  );
}

// ========================================
// 11. ROUTES
// ========================================

app.get("/", (req, res) => {
  res.send("Waamara Islamic Learning Bot is running.");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "Waamara",
    prophets: prophets.length,
    companions: companions.length,
    quizQuestions: quizQuestions.length
  });
});

app.post("/telegram/webhook", async (req, res) => {
  if (
    WEBHOOK_SECRET &&
    req.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET
  ) {
    return res.sendStatus(403);
  }

  // Telegram response saffisaan deebisi.
  res.sendStatus(200);

  try {
    const update = req.body;

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message && update.message.text) {
      await handleText(update.message);
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
  }
});

// ========================================
// 12. WEBHOOK SETUP
// ========================================

async function setupWebhook() {
  if (!BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN hin jiru.");
    return;
  }

  if (!RENDER_URL) {
    console.error("RENDER_EXTERNAL_URL hin jiru.");
    return;
  }

  const url = `${RENDER_URL.replace(/\/$/, "")}/telegram/webhook`;

  const body = {
    url
  };

  if (WEBHOOK_SECRET) {
    body.secret_token = WEBHOOK_SECRET;
  }

  const result = await telegram("setWebhook", body);

  console.log(
    result.ok
      ? "Waamara webhook successfully configured."
      : "Webhook configuration failed."
  );
}

app.listen(PORT, async () => {
  console.log(`Waamara running on port ${PORT}`);
  await setupWebhook();
});
