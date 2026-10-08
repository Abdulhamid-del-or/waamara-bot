const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

const API = "https://api.telegram.org/bot${BOT_TOKEN || ""}";

const pool = process.env.DATABASE_URL
? new Pool({
connectionString: process.env.DATABASE_URL,
ssl: process.env.DATABASE_URL.includes("localhost")
? false
: { rejectUnauthorized: false },
connectionTimeoutMillis: 15000,
max: 5
})
: null;

// ========================================
// 1. NABIIYYOOTA 25
// ========================================

const prophets = [
{
name: "Aadam",
ar: "آدم عليه السلام",
om: "Nabii Aadam (AS) abbaa ilmaan namaa ti. Qur'aanni uumama isaa, malaa'ikotaaf sujuuda ajajamuu fi tawbaa isaa dubbata.",
arabic: "آدم عليه السلام أبو البشر. ذكر القرآن خلقه وأمر الملائكة بالسجود له وتوبته.",
source: "Al-Baqarah 2:30–39"
},
{
name: "Idriis",
ar: "إدريس عليه السلام",
om: "Nabii Idriis (AS) Qur'aana keessatti dhugaa dubbataa fi Nabiyyii ta'uu isaatiin faarsame.",
arabic: "ذكر الله إدريس عليه السلام بأنه كان صديقًا نبيًّا ورفعه مكانًا عليًّا.",
source: "Maryam 19:56–57"
},
{
name: "Nuuh",
ar: "نوح عليه السلام",
om: "Nabii Nuuh (AS) ummata isaa gara Rabbiin qofa gabbaruutti waame. Inni yeroo dheeraaf isaan gorse; doonii ijaaruuf ajajame.",
arabic: "دعا نوح عليه السلام قومه إلى عبادة الله، وصبر على دعوتهم، وأمره الله بصنع السفينة.",
source: "Huud 11:25–49"
},
{
name: "Huud",
ar: "هود عليه السلام",
om: "Nabii Huud (AS) gara ummata Aaditti ergamee tawhiidaaf isaan waame.",
arabic: "أرسل الله هودًا عليه السلام إلى قوم عاد، فدعاهم إلى توحيد الله.",
source: "Al-A'raaf 7:65–72"
},
{
name: "Saalih",
ar: "صالح عليه السلام",
om: "Nabii Saalih (AS) gara ummata Samuuditti ergame. Gaalli mallattoo ta'ee kennameef; ummanni isaa garuu fincile.",
arabic: "أرسل الله صالحًا إلى ثمود، وجعل الناقة آية لهم.",
source: "Al-A'raaf 7:73–79"
},
{
name: "Ibraahiim",
ar: "إبراهيم عليه السلام",
om: "Nabii Ibraahiim (AS) tawhiidaaf dhaabbate. Rabbiin ibidda irraa isa baraare; inni Ismaa'iil waliin Ka'baa ijaare.",
arabic: "دعا إبراهيم إلى توحيد الله، ونجّاه الله من النار، ورفع مع إسماعيل قواعد الكعبة.",
source: "Al-Anbiyaa 21:51–70; Al-Baqarah 2:127"
},
{
name: "Luux",
ar: "لوط عليه السلام",
om: "Nabii Luux (AS) ummata isaa gara ajaja Rabbii fi qulqullinaatti waame.",
arabic: "دعا لوط عليه السلام قومه إلى طاعة الله وترك الفواحش.",
source: "Huud 11:77–83"
},
{
name: "Ismaa'iil",
ar: "إسماعيل عليه السلام",
om: "Nabii Ismaa'iil (AS) ilma Ibraahiim ti. Qur'aanni isa waadaa eegu ta'uu fi maatii isaa salaataaf ajajuu isaa dubbata.",
arabic: "كان إسماعيل صادق الوعد، وكان يأمر أهله بالصلاة والزكاة.",
source: "Maryam 19:54–55"
},
{
name: "Is'haaq",
ar: "إسحاق عليه السلام",
om: "Nabii Is'haaq (AS) ilma Ibraahiim ti. Rabbiin Ibraahiimii fi Saaraa isaatiin isaan gammachiise.",
arabic: "وهب الله لإبراهيم إسحاق وجعله نبيًّا من الصالحين.",
source: "Huud 11:71–73"
},
{
name: "Ya'quub",
ar: "يعقوب عليه السلام",
om: "Nabii Ya'quub (AS) abbaa Yuusuf ti. Rakkoo keessa obsaan jiraate, rahmata Rabbiis irraa abdii hin kutanne.",
arabic: "يعقوب والد يوسف، وصبر على فراق ابنه ولم يقنط من رحمة الله.",
source: "Yuusuf 12:83–87"
},
{
name: "Yuusuf",
ar: "يوسف عليه السلام",
om: "Nabii Yuusuf (AS) rakkoo hedduu keessa darbe. Rabbiin isaaf aangoo kenne; inni obboloota isaatiif dhiifama godhe.",
arabic: "ابتلي يوسف فصبر واتقى الله، ثم مكّنه الله في الأرض فعفا عن إخوته.",
source: "Suuratu Yuusuf 12:4–101"
},
{
name: "Shu'ayb",
ar: "شعيب عليه السلام",
om: "Nabii Shu'ayb (AS) ummata isaa daldala keessatti safartuu fi madaallii sirrii akka fayyadaman gorse.",
arabic: "دعا شعيب قومه إلى عبادة الله والعدل في الكيل والميزان.",
source: "Huud 11:84–95"
},
{
name: "Ayyuub",
ar: "أيوب عليه السلام",
om: "Nabii Ayyuub (AS) rakkoo keessa obse, Rabbiin kadhate; Rabbiinis rakkina isaa irraa isa fayyise.",
arabic: "ابتلي أيوب فصبر ودعا ربه فكشف الله ضره.",
source: "Al-Anbiyaa 21:83–84"
},
{
name: "Dhul-Kifl",
ar: "ذو الكفل",
om: "Dhul-Kifl namoota gaggaarii fi obsitoota keessaa ta'uu isaa Qur'aanni dubbata. Waa'ee isaa odeeffannoo hin mirkanoofne irraa of qusachuun gaarii dha.",
arabic: "ذكر الله ذا الكفل في جملة الصابرين والأخيار.",
source: "Al-Anbiyaa 21:85–86"
},
{
name: "Muusaa",
ar: "موسى عليه السلام",
om: "Nabii Muusaa (AS) gara Fir'awnitti ergame. Rabbiin mallattoolee isaaf kenne; galaana qooduun Muusaa fi ummata isaa baraare.",
arabic: "أرسل الله موسى إلى فرعون وأيّده بالآيات ونجّاه وبني إسرائيل.",
source: "Taa-Haa 20:9–79"
},
{
name: "Haaruun",
ar: "هارون عليه السلام",
om: "Nabii Haaruun (AS) obboleessa Muusaa ti. Muusaa waliin ummata isaanii gara Rabbii waamuuf gargaare.",
arabic: "كان هارون أخا موسى ووزيره في الدعوة إلى الله.",
source: "Taa-Haa 20:29–36"
},
{
name: "Daawuud",
ar: "داود عليه السلام",
om: "Nabii Daawuud (AS) Nabiyyummaa fi mootummaa argate. Qur'aanni haqaan murteessuu isaaf ajaja kenname dubbata.",
arabic: "آتَى الله داود النبوة والحكمة والملك وأمره بالعدل.",
source: "Saad 38:17–26"
},
{
name: "Sulaymaan",
ar: "سليمان عليه السلام",
om: "Nabii Sulaymaan (AS) ilma Daawuud ti. Rabbiin beekumsa fi mootummaa guddaa isaaf kenne.",
arabic: "وهب الله لسليمان ملكًا عظيمًا وعلّمه، فكان شاكرًا لنعمة الله.",
source: "An-Naml 27:15–44"
},
{
name: "Ilyaas",
ar: "إلياس عليه السلام",
om: "Nabii Ilyaas (AS) ummata isaa gara Rabbiin qofa gabbaruutti waame.",
arabic: "دعا إلياس قومه إلى عبادة الله وحده وترك عبادة البعل.",
source: "As-Saaffaat 37:123–132"
},
{
name: "Al-Yasa'",
ar: "اليسع عليه السلام",
om: "Al-Yasa' (AS) Qur'aana keessatti maqaan isaa dubbatamee namoota gaggaarii keessaa ta'uu isaa ibsame.",
arabic: "ذكر الله اليسع في جملة الأخيار.",
source: "Al-An'aam 6:86"
},
{
name: "Yuunus",
ar: "يونس عليه السلام",
om: "Nabii Yuunus (AS) Rabbiin dukkana keessatti kadhate; Rabbiin isaaf deebii kenne, gaddas irraa isa baraare.",
arabic: "دعا يونس ربه في الظلمات فاستجاب الله له ونجّاه من الغم.",
source: "Al-Anbiyaa 21:87–88"
},
{
name: "Zakariyyaa",
ar: "زكريا عليه السلام",
om: "Nabii Zakariyyaa (AS) Rabbiin ilma gaarii isaaf akka kennu kadhate. Rabbiin kadhannaa isaa qeebale.",
arabic: "دعا زكريا ربه أن يهب له ولدًا صالحًا فاستجاب الله له.",
source: "Maryam 19:2–11"
},
{
name: "Yahyaa",
ar: "يحيى عليه السلام",
om: "Nabii Yahyaa (AS) ilma Zakariyyaa ti. Rabbiin isaaf beekumsa, qulqullina fi gara-laafina kenne.",
arabic: "آتَى الله يحيى الحكم صبيًّا وجعله بارًّا تقيًّا.",
source: "Maryam 19:12–15"
},
{
name: "Iisaa",
ar: "عيسى عليه السلام",
om: "Nabii Iisaa (AS) ilma Maryam ti. Inni gabricha Rabbii fi Ergamaa Isaa dha; Rabbiin mallattoolee isaaf kenne.",
arabic: "عيسى ابن مريم عبد الله ورسوله، أرسله الله إلى بني إسرائيل وأيّده بالآيات.",
source: "Aali-Imraan 3:45–55"
},
{
name: "Muhammad",
ar: "محمد ﷺ",
om: "Nabii Muhammad ﷺ Ergamaa Rabbii isa dhumaa ti. Qur'aanni isa irratti bu'e; inni rahmata, haqaa fi amala gaariitti waame.",
arabic: "محمد ﷺ رسول الله وخاتم النبيين، أنزل الله عليه القرآن هداية ورحمة للعالمين.",
source: "Al-Ahzaab 33:40; Al-Anbiyaa 21:107"
}
];

// ========================================
// 2. SAHAABOTA 50
// ========================================

const companions = [
{ name: "Abuu Bakr As-Siddiiq", ar: "أبو بكر الصديق رضي الله عنه", om: "Michuu Nabii ﷺ fi Khaliifaa jalqabaa Muslimootaa ture.", source: "At-Tawbah 9:40" },
{ name: "Umar ibn Al-Khattaab", ar: "عمر بن الخطاب رضي الله عنه", om: "Khaliifaa lammaffaa ture; haqaa fi murtii sirrii irratti beekama.", source: "Seenaa Khulafaa' Ar-Raashidiin" },
{ name: "Usmaan ibn Affaan", ar: "عثمان بن عفان رضي الله عنه", om: "Khaliifaa sadaffaa ture; arjummaa fi hayaa isaatiin beekama.", source: "Seenaa Khulafaa' Ar-Raashidiin" },
{ name: "Alii ibn Abii Taalib", ar: "علي بن أبي طالب رضي الله عنه", om: "Khaliifaa afraffaa ture; ilma adeeraa Nabii ﷺ ti.", source: "Seenaa Khulafaa' Ar-Raashidiin" },
{ name: "Bilal ibn Rabaah", ar: "بلال بن رباح رضي الله عنه", om: "Sahaabaa jalqabaa keessaa ture; azaanaaf beekama.", source: "Seenaa Sahaabota" },
{ name: "Khadijaa bint Khuwaylid", ar: "خديجة بنت خويلد رضي الله عنها", om: "Haadha manaa Nabii ﷺ isa jalqabaa; yeroo wahyiin jalqabaa bu'e isa deeggarte.", source: "Sahiih Al-Bukhaarii, Bad'u Al-Wahy" },
{ name: "Aa'ishaa bint Abii Bakr", ar: "عائشة رضي الله عنها", om: "Haadha warraa Nabii ﷺ; hadiisaa fi beekumsa Islaamaa keessatti gahee guddaa qabdi.", source: "Sahiih Al-Bukhaarii fi Sahiih Muslim" },
{ name: "Faaximaa bint Muhammad", ar: "فاطمة رضي الله عنها", om: "Intala Nabii Muhammad ﷺ ti.", source: "Sahiih Al-Bukhaarii" },
{ name: "Khaalid ibn Al-Waliid", ar: "خالد بن الوليد رضي الله عنه", om: "Hogganaa waraanaa Muslimootaa beekamaa ture.", source: "Seenaa Sahaabota" },
{ name: "Abdur-Rahmaan ibn Awf", ar: "عبد الرحمن بن عوف رضي الله عنه", om: "Sahaabaa arjaa fi daldala keessatti beekamaa ture.", source: "Seenaa Sahaabota" },
{ name: "Talhaa ibn Ubaydillaah", ar: "طلحة بن عبيد الله رضي الله عنه", om: "Sahaabaa beekamaa fi warra Jannataan gammachiifaman keessaa tokko.", source: "Jaami'u At-Tirmidhii" },
{ name: "Az-Zubayr ibn Al-Awwaam", ar: "الزبير بن العوام رضي الله عنه", om: "Sahaabaa beekamaa fi warra Jannataan gammachiifaman keessaa tokko.", source: "Jaami'u At-Tirmidhii" },
{ name: "Sa'd ibn Abii Waqqaas", ar: "سعد بن أبي وقاص رضي الله عنه", om: "Sahaabaa beekamaa; warra Jannataan gammachiifaman keessaa tokko.", source: "Jaami'u At-Tirmidhii" },
{ name: "Abuu Ubaydah ibn Al-Jarraah", ar: "أبو عبيدة بن الجراح رضي الله عنه", om: "Sahaabaa amanamaa fi warra Jannataan gammachiifaman keessaa tokko.", source: "Sahiih Al-Bukhaarii" },
{ name: "Sa'iid ibn Zayd", ar: "سعيد بن زيد رضي الله عنه", om: "Sahaabaa beekamaa fi warra Jannataan gammachiifaman keessaa tokko.", source: "Jaami'u At-Tirmidhii" },
{ name: "Hamza ibn Abdul-Muxxalib", ar: "حمزة بن عبد المطلب رضي الله عنه", om: "Abbeeraa Nabii ﷺ fi sahaabaa ija-jabaa ture.", source: "Seenaa Sahaabota" },
{ name: "Abbaas ibn Abdul-Muxxalib", ar: "العباس بن عبد المطلب رضي الله عنه", om: "Abbeeraa Nabii ﷺ ti.", source: "Seenaa Sahaabota" },
{ name: "Zayd ibn Haarithah", ar: "زيد بن حارثة رضي الله عنه", om: "Sahaabaa Nabii ﷺ biratti jaallatamaa ture.", source: "Al-Ahzaab 33:37" },
{ name: "Usaamah ibn Zayd", ar: "أسامة بن زيد رضي الله عنه", om: "Sahaabaa fi hogganaa waraanaa ture.", source: "Seenaa Sahaabota" },
{ name: "Mus'ab ibn Umayr", ar: "مصعب بن عمير رضي الله عنه", om: "Sahaabaa gara Madiinaatti barnoota Islaamaa barsiisuuf ergame.", source: "Seenaa Sahaabota" },
{ name: "Salmaan Al-Faarisii", ar: "سلمان الفارسي رضي الله عنه", om: "Sahaabaa beekumsa fi barbaacha haqaa isaatiin beekama.", source: "Seenaa Sahaabota" },
{ name: "Abuu Dharr Al-Ghifaarii", ar: "أبو ذر الغفاري رضي الله عنه", om: "Sahaabaa jireenya salphaa fi dhugaa dubbachuun beekama.", source: "Sahiih Muslim" },
{ name: "Ammar ibn Yaasir", ar: "عمار بن ياسر رضي الله عنه", om: "Muslima jalqabaa keessaa ture; rakkoo amantii irratti isa mudate keessatti obsaan dhaabbate.", source: "Seenaa Sahaabota" },
{ name: "Yaasir ibn Aamir", ar: "ياسر بن عامر رضي الله عنه", om: "Abbaa Ammar ti; Muslimoota jalqabaa keessaa ture.", source: "Seenaa Sahaabota" },
{ name: "Sumayyah bint Khayyaat", ar: "سمية بنت خياط رضي الله عنها", om: "Dubartii Muslimoota jalqabaa keessaa fi shahiidaa Islaamaa keessatti beekamtu.", source: "Seenaa Sahaabota" },
{ name: "Khabaab ibn Al-Aratt", ar: "خباب بن الأرت رضي الله عنه", om: "Sahaabaa rakkoo cimaa keessatti amantii isaatti jabaatee dhaabbate.", source: "Seenaa Sahaabota" },
{ name: "Suhaib Ar-Ruumii", ar: "صهيب الرومي رضي الله عنه", om: "Sahaabaa hijraa fi aarsaa isaatiin beekama.", source: "Seenaa Sahaabota" },
{ name: "Abdullaah ibn Mas'uud", ar: "عبد الله بن مسعود رضي الله عنه", om: "Sahaabaa Qur'aana qara'uu fi beekumsa isaatiin beekama.", source: "Sahiih Al-Bukhaarii" },
{ name: "Ubayy ibn Ka'b", ar: "أبي بن كعب رضي الله عنه", om: "Sahaabaa Qur'aana keessatti beekumsa qabu ture.", source: "Sahiih Muslim" },
{ name: "Zayd ibn Thaabit", ar: "زيد بن ثابت رضي الله عنه", om: "Sahaabaa barreessaa wahyii fi hojii Qur'aana walitti qabu keessatti gahee qabu.", source: "Seenaa Sahaabota" },
{ name: "Abuu Hurayrah", ar: "أبو هريرة رضي الله عنه", om: "Sahaabaa hadiisaa baay'ee dabarse keessaa tokko.", source: "Sahiih Al-Bukhaarii fi Sahiih Muslim" },
{ name: "Anas ibn Maalik", ar: "أنس بن مالك رضي الله عنه", om: "Nabii ﷺ tajaajile; hadiisaa hedduu dabarse.", source: "Sahiih Al-Bukhaarii" },
{ name: "Jaabir ibn Abdillaah", ar: "جابر بن عبد الله رضي الله عنه", om: "Sahaabaa hadiisaa hedduu dabarse.", source: "Sahiih Muslim" },
{ name: "Abdullaah ibn Umar", ar: "عبد الله بن عمر رضي الله عنهما", om: "Ilma Umar ti; hordoffii Sunnah keessatti beekama.", source: "Sahiih Al-Bukhaarii" },
{ name: "Abdullaah ibn Abbaas", ar: "عبد الله بن عباس رضي الله عنهما", om: "Sahaabaa beekumsa tafsiiraa isaatiin beekama.", source: "Sahiih Al-Bukhaarii" },
{ name: "Abdullaah ibn Amr ibn Al-Aas", ar: "عبد الله بن عمرو بن العاص رضي الله عنهما", om: "Sahaabaa hadiisaa barreessuu fi dabarsuu keessatti beekama.", source: "Sahiih Al-Bukhaarii" },
{ name: "Mu'aadh ibn Jabal", ar: "معاذ بن جبل رضي الله عنه", om: "Sahaabaa beekumsa halaalaa fi haraamaa keessatti beekama.", source: "Seenaa Sahaabota" },
{ name: "Abuu Muusaa Al-Ash'arii", ar: "أبو موسى الأشعري رضي الله عنه", om: "Sahaabaa sagalee Qur'aana bareedaa fi beekumsa isaatiin beekama.", source: "Sahiih Al-Bukhaarii" },
{ name: "Hudhayfah ibn Al-Yamaan", ar: "حذيفة بن اليمان رضي الله عنه", om: "Sahaabaa odeeffannoo fitnaa irratti beekumsa qabu ture.", source: "Sahiih Muslim" },
{ name: "Abuu Ayyuub Al-Ansaar", ar: "أبو أيوب الأنصاري رضي الله عنه", om: "Sahaabaa Nabii ﷺ yeroo Madiina ga'an keessummeesse.", source: "Seenaa Sahaabota" },
{ name: "Sa'd ibn Mu'aadh", ar: "سعد بن معاذ رضي الله عنه", om: "Hogganaa Ansaar keessaa sahaabaa beekamaa ture.", source: "Sahiih Al-Bukhaarii" },
{ name: "Usayd ibn Hudayr", ar: "أسيد بن حضير رضي الله عنه", om: "Sahaabaa Ansaar keessaa; Qur'aana qara'uu isaatiin beekama.", source: "Sahiih Al-Bukhaarii" },
{ name: "Abdullaah ibn Rawaahah", ar: "عبد الله بن رواحة رضي الله عنه", om: "Sahaabaa fi walaloo Islaamaa keessatti beekamaa ture.", source: "Seenaa Sahaabota" },
{ name: "Ja'far ibn Abii Taalib", ar: "جعفر بن أبي طالب رضي الله عنه", om: "Sahaabaa hijraa Habashaa keessatti gahee qabu.", source: "Seenaa Sahaabota" },
{ name: "Asmaa bint Abii Bakr", ar: "أسماء بنت أبي بكر رضي الله عنها", om: "Dubartii sahaabaa; yeroo hijraa keessatti gargaarsa goote.", source: "Seenaa Sahaabota" },
{ name: "Hafsaa bint Umar", ar: "حفصة بنت عمر رضي الله عنها", om: "Haadha warraa Nabii ﷺ; waraqaaleen Qur'aanaa ishee bira turan.", source: "Sahiih Al-Bukhaarii" },
{ name: "Ummu Salamah", ar: "أم سلمة رضي الله عنها", om: "Haadha warraa Nabii ﷺ; beekumsa fi gorsa gaarii qabdi.", source: "Sahiih Muslim" },
{ name: "Zaynab bint Jahsh", ar: "زينب بنت جحش رضي الله عنها", om: "Haadha warraa Nabii ﷺ; arjummaa isheetiin beekamti.", source: "Sahiih Al-Bukhaarii" },
{ name: "Ummu Sulaym", ar: "أم سليم رضي الله عنها", om: "Dubartii sahaabaa amanamummaa fi jabaachuu amantiitiin beekamtu.", source: "Sahiih Al-Bukhaarii" },
{ name: "Nusaybah bint Ka'b", ar: "نسيبة بنت كعب رضي الله عنها", om: "Dubartii sahaabaa yeroo Uhud keessatti Nabii ﷺ deeggarte jedhamee seenaa keessatti dubbatamtu.", source: "Seenaa Sahaabota" }
];

// ========================================
// 3. BARNOOTA DABALATAA
// ========================================

const lessons = [
{
name: "Tawhiida",
om: "Tawhiid jechuun Rabbiin gabbaruu keessatti Isa tokkicha gochuu dha. Rabbiin qofa gabbaruun bu'uura Islaamaa ti.",
ar: "التوحيد هو إفراد الله بالعبادة، وهو أصل دين الإسلام.",
source: "Al-Ikhlaas 112:1–4"
},
{
name: "Salaata",
om: "Salaanni utubaalee Islaamaa keessaa isa guddaa dha. Muslima irratti salaata dirqamaa shanan yeroo isaanii eeganii salaatuun barbaachisaa dha.",
ar: "الصلاة من أعظم أركان الإسلام، ويجب أداء الصلوات الخمس في أوقاتها.",
source: "Al-Baqarah 2:43"
},
{
name: "Arkaana Islaamaa",
om: "Arkaanni Islaamaa shan: shahadaa, salaata, zakaa, sooma Ramadaanaa fi Hajjii nama danda'uuf.",
ar: "أركان الإسلام خمسة: الشهادتان، والصلاة، والزكاة، وصوم رمضان، وحج البيت لمن استطاع.",
source: "Sahiih Muslim"
},
{
name: "Arkaana Iimaanaa",
om: "Arkaanni Iimaanaa jaha: Rabbiitti, malaa'ikotaatti, kitaabotaatti, ergamtootaatti, Guyyaa Qiyaamaatti fi qadaritti amanuu.",
ar: "أركان الإيمان ستة: الإيمان بالله وملائكته وكتبه ورسله واليوم الآخر والقدر.",
source: "Sahiih Muslim, Hadiisa Jibriil"
},
{
name: "Akhlaaqa gaarii",
om: "Muslimni dhugaa dubbachuu, amanamaa ta'uu, ollaa isaa kabajuu fi namootaaf rahmata gochuu qaba.",
ar: "ينبغي للمسلم أن يتحلى بالصدق والأمانة وحسن الخلق والإحسان إلى الناس.",
source: "Al-Qalam 68:4"
},
{
name: "Tawbaa",
om: "Tawbaan gara Rabbii deebi'uu, cubbuu dhiisuu, waan darbeef gaabbuu fi irra deebi'anii akka hin hojjenne murteessuu dha. Yoo mirga namaa miidhe, mirga sana deebisuun barbaachisa.",
ar: "التوبة هي الرجوع إلى الله، وترك الذنب والندم عليه والعزم على عدم العودة إليه، مع رد حقوق الناس.",
source: "At-Tahriim 66:8"
}
];

// ========================================
// 4. GAFFII QORMAATAA 100 OL
// ========================================

const quizQuestions = [];

function shuffle(items) {
const arr = [...items];

for (let i = arr.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[arr[i], arr[j]] = [arr[j], arr[i]];
}

return arr;
}

function addQuestion(q, ar, answer, answerAr, poolNames, explanation, explanationAr) {
const wrong = shuffle(poolNames.filter(x => x !== answer)).slice(0, 2);
const options = shuffle([answer, ...wrong]);
const answerIndex = options.indexOf(answer);

const optionsAr = options.map(name => {
const p = prophets.find(x => x.name === name);
if (p) return p.ar;

const c = companions.find(x => x.name === name);
if (c) return c.ar;

return name;

});

quizQuestions.push({
q,
ar,
options,
optionsAr,
answer: answerIndex,
explanation,
explanationAr
});
}

const prophetNames = prophets.map(p => p.name);
const companionNames = companions.map(c => c.name);

// Gaaffii Nabiyyoota: maqaa Oromoo gara Arabiffaatti fi deebii faallaa.
for (const p of prophets) {
addQuestion(
"Maqaan Arabaa "${p.ar}" jedhu Afaan Oromoo keessatti eenyu?",
"من النبي الذي اسمه ${p.ar}؟",
p.name,
p.ar,
prophetNames,
"${p.name}: ${p.om}",
p.arabic
);

addQuestion(
"Nabiyyii ${p.name} (AS) ilaalchisee seenaa barbaaddu? Maqaa isaa filadhu.",
"اختر اسم النبي ${p.ar}.",
p.name,
p.ar,
prophetNames,
"${p.name}: ${p.om}",
p.arabic
);
}

// Gaaffii Sahaabota.
for (const c of companions) {
addQuestion(
"Maqaan Arabaa "${c.ar}" jedhu Sahaabaa kam?",
"من الصحابي الذي اسمه ${c.ar}؟",
c.name,
c.ar,
companionNames,
"${c.name}: ${c.om}",
c.ar
);

addQuestion(
"Sahaabaa ${c.name} barbaaduuf maqaa isaa filadhu.",
"اختر اسم الصحابي ${c.ar}.",
c.name,
c.ar,
companionNames,
"${c.name}: ${c.om}",
c.ar
);
}

// Gaaffii waliigalaa sirrii.
const generalQuestions = [
{
q: "Nabiyyii dhumaa eenyu?",
ar: "من هو خاتم الأنبياء؟",
options: ["Muusaa", "Iisaa", "Muhammad"],
optionsAr: ["موسى", "عيسى", "محمد ﷺ"],
answer: 2,
explanation: "Nabii Muhammad ﷺ Ergamaa Rabbii isa dhumaa dha.",
explanationAr: "محمد ﷺ خاتم النبيين."
},
{
q: "Nabiyyii doonii ijaare eenyu?",
ar: "من النبي الذي صنع السفينة؟",
options: ["Nuuh", "Yuusuf", "Daawuud"],
optionsAr: ["نوح", "يوسف", "داود"],
answer: 0,
explanation: "Nabii Nuuh (AS) doonii ijaare.",
explanationAr: "صنع نوح عليه السلام السفينة بأمر الله."
},
{
q: "Abbaan Nabii Yuusuf eenyu?",
ar: "من والد يوسف عليه السلام؟",
options: ["Ibraahiim", "Ya'quub", "Is'haaq"],
optionsAr: ["إبراهيم", "يعقوب", "إسحاق"],
answer: 1,
explanation: "Abbaan Yuusuf Ya'quub (AS) dha.",
explanationAr: "والد يوسف عليه السلام هو يعقوب."
},
{
q: "Khaliifaan jalqabaa eenyu?",
ar: "من أول الخلفاء الراشدين؟",
options: ["Umar", "Alii", "Abuu Bakr"],
optionsAr: ["عمر", "علي", "أبو بكر"],
answer: 2,
explanation: "Abuu Bakr As-Siddiiq (RA) Khaliifaa jalqabaa ture.",
explanationAr: "أبو بكر الصديق أول الخلفاء الراشدين."
},
{
q: "Haadha manaa Nabii ﷺ isa jalqabaa eenyu?",
ar: "من أول زوجات النبي ﷺ؟",
options: ["Aa'ishaa", "Khadijaa", "Hafsaa"],
optionsAr: ["عائشة", "خديجة", "حفصة"],
answer: 1,
explanation: "Khadijaa bint Khuwaylid (RA) dha.",
explanationAr: "خديجة بنت خويلد رضي الله عنها."
},
{
q: "Arkaana Islaamaa meeqa?",
ar: "كم عدد أركان الإسلام؟",
options: ["Shan", "Jaha", "Torba"],
optionsAr: ["خمسة", "ستة", "سبعة"],
answer: 0,
explanation: "Arkaanni Islaamaa shan.",
explanationAr: "أركان الإسلام خمسة."
},
{
q: "Arkaana Iimaanaa meeqa?",
ar: "كم عدد أركان الإيمان؟",
options: ["Shan", "Jaha", "Saddeet"],
optionsAr: ["خمسة", "ستة", "ثمانية"],
answer: 1,
explanation: "Arkaanni Iimaanaa jaha.",
explanationAr: "أركان الإيمان ستة."
},
{
q: "Salaata dirqamaa guyyaatti meeqa?",
ar: "كم صلاة مفروضة في اليوم والليلة؟",
options: ["Sadii", "Afuri", "Shan"],
optionsAr: ["ثلاث", "أربع", "خمس"],
answer: 2,
explanation: "Salaanni dirqamaa guyyaatti shan.",
explanationAr: "الصلوات المفروضة خمس."
},
{
q: "Qur'aanni Nabiyyii kam irratti bu'e?",
ar: "على أي نبي نزل القرآن؟",
options: ["Muhammad ﷺ", "Muusaa", "Iisaa"],
optionsAr: ["محمد ﷺ", "موسى", "عيسى"],
answer: 0,
explanation: "Qur'aanni Nabii Muhammad ﷺ irratti bu'e.",
explanationAr: "نزل القرآن على محمد ﷺ."
},
{
q: "Ramadhaan keessatti Muslimaaf maal dirqama?",
ar: "ما العبادة المفروضة في رمضان؟",
options: ["Sooma", "Hajjii", "Qurbana qofa"],
optionsAr: ["الصيام", "الحج", "الأضحية فقط"],
answer: 0,
explanation: "Soomni Ramadaanaa Muslima ga'eessa, dandeettii qabu irratti dirqama.",
explanationAr: "صيام رمضان واجب على المسلم المستطيع المستوفي للشروط."
}
];

for (const q of generalQuestions) {
quizQuestions.push(q);
}

// ========================================
// 5. SESSIONS
// ========================================

const sessions = new Map();

function getSession(chatId) {
const id = String(chatId);

if (!sessions.has(id)) {
sessions.set(id, {
lang: "both",
inQuiz: false,
quiz: [],
quizIndex: 0,
score: 0,
answered: false,
searchMode: false
});
}

return sessions.get(id);
}

// ========================================
// 6. DATABASE
// ========================================

async function initDatabase() {
if (!pool) {
throw new Error("DATABASE_URL Render Environment keessatti hin jiru.");
}

await pool.query("CREATE TABLE IF NOT EXISTS waamara_users ( telegram_id TEXT PRIMARY KEY, first_name TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW() )");

await pool.query("CREATE TABLE IF NOT EXISTS waamara_quiz_results ( id BIGSERIAL PRIMARY KEY, telegram_id TEXT NOT NULL, first_name TEXT NOT NULL DEFAULT '', quiz_title TEXT NOT NULL DEFAULT 'Qormaata Islaamaa', score INTEGER NOT NULL, total INTEGER NOT NULL, percentage INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() )");

await pool.query("CREATE INDEX IF NOT EXISTS waamara_results_user_date_idx ON waamara_quiz_results (telegram_id, created_at DESC)");

console.log("Waamara database tables are ready.");
}

async function saveUser(user) {
if (!pool || !user) return;

const telegramId = String(user.id);
const firstName = user.first_name || "";
const username = user.username || "";

await pool.query(
"INSERT INTO waamara_users (telegram_id, first_name, username, last_seen) VALUES ($1, $2, $3, NOW()) ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name, username = EXCLUDED.username, last_seen = NOW()",
[telegramId, firstName, username]
);
}

async function saveQuizResult(chatId, firstName, score, total, percentage) {
if (!pool) throw new Error("Database hin walqabanne.");

await pool.query(
"INSERT INTO waamara_quiz_results (telegram_id, first_name, quiz_title, score, total, percentage) VALUES ($1, $2, $3, $4, $5, $6)",
[
String(chatId),
firstName || "Barataa",
"Qormaata Islaamaa",
score,
total,
percentage
]
);
}

async function getResults(chatId) {
if (!pool) return [];

const result = await pool.query(
"SELECT score, total, percentage, created_at FROM waamara_quiz_results WHERE telegram_id = $1 ORDER BY created_at DESC LIMIT 10",
[String(chatId)]
);

return result.rows;
}

// ========================================
// 7. TELEGRAM API
// ========================================

async function telegram(method, body) {
if (!BOT_TOKEN) {
throw new Error("TELEGRAM_BOT_TOKEN hin argamne.");
}

const response = await fetch("${API}/${method}", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(body)
});

const data = await response.json();

if (!data.ok) {
console.error("Telegram API error:", method, data.description);
}

return data;
}

async function sendMessage(chatId, text, replyMarkup) {
const body = {
chat_id: chatId,
text,
disable_web_page_preview: true
};

if (replyMarkup) body.reply_markup = replyMarkup;

return telegram("sendMessage", body);
}

function mainKeyboard() {
return {
keyboard: [
["📖 Nabiyyoota", "🕌 Sahaabota"],
["📝 Qormaata", "🏆 Qabxii Koo"],
["🔍 Barbaadi", "📚 Barnoota"],
["🎧 Barnoota Sagalee"],
["🇪🇹 Afaan Oromoo", "🇸🇦 Afaan Arabaa"],
["🌐 Afaan Lamaan", "ℹ️ Gargaarsa"]
],
resize_keyboard: true
};
}

function languageText(session, om, ar) {
if (session.lang === "om") return om;
if (session.lang === "ar") return ar;
return "${om}\n\n━━━━━━━━━━━━━━\n\n${ar}";
}

// ========================================
// 8. MENU
// ========================================

async function showMenu(chatId) {
const session = getSession(chatId);

const text = languageText(
session,
"Assalaamu alaykum! 🌙\n\nBaga gara Waamaraatti dhuftan.\n\n📖 Seenaa Nabiyyootaa\n🕌 Seenaa Sahaabota\n📝 Qormaata Islaamaa\n🏆 Qabxii fi seenaa qormaataa\n🔍 Barbaacha barnootaa\n🎧 Barnoota sagalee\n\nMaal barachuu barbaadda?",
"السلام عليكم ورحمة الله وبركاته\n\nمرحبًا بكم في وامارا.\n\n📖 قصص الأنبياء\n🕌 قصص الصحابة\n📝 الاختبار الإسلامي\n🏆 النتائج وسجل الاختبارات\n🔍 البحث عن الدروس\n🎧 الدروس الصوتية\n\nماذا تريد أن تتعلم؟"
);

await sendMessage(chatId, text, mainKeyboard());
}

// ========================================
// 9. LISTS AND STORIES
// ========================================

async function showProphets(chatId) {
const session = getSession(chatId);

const buttons = prophets.map((p, i) => [{
text: "${i + 1}. ${p.name} — ${p.ar}",
callback_data: "p:${i}"
}]);

await sendMessage(
chatId,
languageText(
session,
"📖 Seenaa Nabiyyootaa\nNabiyyii barbaaddu filadhu:",
"📖 قصص الأنبياء\nاختر النبي:"
),
{ inline_keyboard: buttons }
);
}

async function showCompanions(chatId) {
const session = getSession(chatId);

const buttons = companions.map((c, i) => [{
text: "${i + 1}. ${c.name}",
callback_data: "c:${i}"
}]);

await sendMessage(
chatId,
languageText(
session,
"🕌 Sahaabaa barbaaddu filadhu:",
"🕌 اختر الصحابي أو الصحابية:"
),
{ inline_keyboard: buttons }
);
}

async function showStory(chatId, story, title, session) {
const om = "📖 ${title}\n\n${story.om}\n\n📚 Madda: ${story.source || "Madda seenaa Islaamaa"}";
const ar = "📖 ${story.ar || title}\n\n${story.arabic || story.om}\n\n📚 المصدر: ${story.source || "مصادر السيرة الإسلامية"}";

await sendMessage(chatId, languageText(session, om, ar), {
inline_keyboard: [
[{ text: "⬅️ Menu", callback_data: "menu" }]
]
});
}

async function showLessons(chatId) {
const session = getSession(chatId);

const buttons = lessons.map((lesson, i) => [{
text: lesson.name,
callback_data: "l:${i}"
}]);

await sendMessage(
chatId,
languageText(
session,
"📚 Mata-duree barnootaa filadhu:",
"📚 اختر موضوع الدرس:"
),
{ inline_keyboard: buttons }
);
}

// ========================================
// 10. AUDIO LESSON LINKS
// ========================================

async function showAudio(chatId) {
const session = getSession(chatId);

const topics = [
{ name: "Qur'aana", query: "Quran recitation" },
{ name: "Seenaa Nabiyyootaa", query: "قصص الأنبياء درس" },
{ name: "Seenaa Nabii Muhammad ﷺ", query: "السيرة النبوية درس صوتي" },
{ name: "Tawhiida", query: "شرح التوحيد درس" },
{ name: "Salaata", query: "تعليم الصلاة للمبتدئين" },
{ name: "Afaan Oromoo", query: "barnoota islaamaa Afaan Oromoo" }
];

const buttons = topics.map((topic, i) => [{
text: "🎧 ${topic.name}",
callback_data: "audio:${i}"
}]);

await sendMessage(
chatId,
languageText(
session,
"🎧 Barnoota sagalee barbaaddu filadhu. Liinkiin si geessu bakka sagaleen argamu barbaaduuf gargaaru.",
"🎧 اختر الدرس الصوتي. سيفتح الرابط نتائج البحث عن الدروس."
),
{ inline_keyboard: buttons }
);

// Keep the topics for callback handling.
sessions.get(String(chatId)).audioTopics = topics;
}

// ========================================
// 11. QUIZ
// ========================================

async function startQuiz(chatId) {
const session = getSession(chatId);

// Gaaffii adda addaa 10 qofa yeroo tokko keessatti.
session.quiz = shuffle(quizQuestions).slice(0, 10);
session.quizIndex = 0;
session.score = 0;
session.inQuiz = true;
session.answered = false;

await sendMessage(
chatId,
languageText(
session,
"📝 Qormaanni jalqabe!\n\nGaaffii 10 qabda. Deebii sirrii filadhu.",
"📝 بدأ الاختبار!\n\nلديك 10 أسئلة. اختر الإجابة الصحيحة."
)
);

await sendQuizQuestion(chatId);
}

async function sendQuizQuestion(chatId) {
const session = getSession(chatId);

if (session.quizIndex >= session.quiz.length) {
session.inQuiz = false;

const score = session.score;
const total = session.quiz.length;
const percentage = Math.round((score / total) * 100);

try {
  await saveQuizResult(
    chatId,
    session.firstName || "Barataa",
    score,
    total,
    percentage
  );
} catch (error) {
  console.error("Saving quiz result failed:", error.message);
}

const resultText = languageText(
  session,
  `🏆 Qormaanni xumurame!\n\n👤 Barataa: ${session.firstName || "Barataa"}\n✅ Qabxii: ${score}/${total}\n📊 Dhibbeentaa: ${percentage}%\n\n${percentage >= 80 ? "🌟 Baay'ee gaarii!" : percentage >= 50 ? "👍 Gaarii. Itti fufi!" : "📚 Irra deebi'ii baradhu; ni fooyya'a!"}\n\nQabxiin kee database keessatti kuufamuuf yaalameera.`,
  `🏆 انتهى الاختبار!\n\n👤 الطالب: ${session.firstName || "طالب"}\n✅ النتيجة: ${score}/${total}\n📊 النسبة: ${percentage}%\n\n${percentage >= 80 ? "🌟 ممتاز!" : percentage >= 50 ? "👍 جيد، واصل!" : "📚 راجع الدروس وحاول مرة أخرى!"}`
);

await sendMessage(chatId, resultText, mainKeyboard());
return;

}

const index = session.quizIndex;
const question = session.quiz[index];
session.answered = false;

const buttons = question.options.map((option, i) => [{
text: "${String.fromCharCode(65 + i)}. ${ session.lang === "ar" ? (question.optionsAr?.[i] || option) : option }",
callback_data: "a:${index}:${i}"
}]);

await sendMessage(
chatId,
languageText(
session,
"❓ Gaaffii ${index + 1}/${session.quiz.length}\n\n${question.q}",
"❓ السؤال ${index + 1}/${session.quiz.length}\n\n${question.ar || question.q}"
),
{ inline_keyboard: buttons }
);
}

// ========================================
// 12. SCORE HISTORY
// ========================================

async function showHistory(chatId) {
const session = getSession(chatId);

try {
const results = await getResults(chatId);

if (!results.length) {
  return sendMessage(
    chatId,
    languageText(
      session,
      "🏆 Qabxii duraan galmeeffame hin jiru. Qormaata fudhachuuf 📝 Qormaata tuqi.",
      "🏆 لا توجد نتائج مسجلة حتى الآن. ابدأ اختبارًا جديدًا."
    ),
    mainKeyboard()
  );
}

let text = "🏆 Qabxii Koo / نتائجي\n\n";

results.forEach((r, i) => {
  const date = new Date(r.created_at).toLocaleString("en-GB", {
    timeZone: "UTC"
  });

  text += `${i + 1}. ${r.score}/${r.total} — ${r.percentage}%\n📅 ${date} UTC\n\n`;
});

await sendMessage(chatId, text, mainKeyboard());

} catch (error) {
console.error("History error:", error.message);

await sendMessage(
  chatId,
  "Qabxii dubbisuun hin danda'amne. DATABASE_URL fi database Render ilaali."
);

}
}

// ========================================
// 13. CALLBACK HANDLER
// ========================================

async function handleCallback(callback) {
const chatId = callback.message.chat.id;
const data = callback.data || "";
const session = getSession(chatId);

await telegram("answerCallbackQuery", {
callback_query_id: callback.id
});

if (data === "menu") return showMenu(chatId);

if (data.startsWith("p:")) {
const index = Number(data.split(":")[1]);
const story = prophets[index];
if (story) return showStory(chatId, story, story.name, session);
}

if (data.startsWith("c:")) {
const index = Number(data.split(":")[1]);
const story = companions[index];
if (story) return showStory(chatId, story, story.name, session);
}

if (data.startsWith("l:")) {
const index = Number(data.split(":")[1]);
const lesson = lessons[index];

if (!lesson) return;

return showStory(
  chatId,
  {
    om: lesson.om,
    arabic: lesson.ar,
    ar: lesson.name,
    source: lesson.source
  },
  lesson.name,
  session
);

}

if (data.startsWith("audio:")) {
const index = Number(data.split(":")[1]);
const topic = session.audioTopics?.[index];

if (!topic) {
  return sendMessage(chatId, "Mata-dureen sagalee hin argamne.");
}

const url =
  "https://www.youtube.com/results?search_query=" +
  encodeURIComponent(topic.query);

return sendMessage(
  chatId,
  `🎧 ${topic.name}\n\nBarnoota sagalee barbaaduuf liinkii kana bani:\n${url}`
);

}

if (data.startsWith("a:")) {
if (!session.inQuiz) {
return sendMessage(chatId, "Qormaanni kun xumurameera. Qormaata haaraa jalqabi.");
}

const parts = data.split(":");
const questionIndex = Number(parts[1]);
const answerIndex = Number(parts[2]);

if (questionIndex !== session.quizIndex || session.answered) {
  return;
}

const question = session.quiz[questionIndex];
if (!question) return;

session.answered = true;

const correct = answerIndex === question.answer;
if (correct) session.score++;

const rightAnswer = session.lang === "ar"
  ? (question.optionsAr?.[question.answer] || question.options[question.answer])
  : question.options[question.answer];

const feedback = languageText(
  session,
  correct
    ? `✅ Deebiin sirrii dha!\n\n${question.explanation || ""}`
    : `❌ Deebiin sirrii miti.\n\nDeebiin sirrii: ${rightAnswer}\n${question.explanation || ""}`,
  correct
    ? `✅ إجابة صحيحة!\n\n${question.explanationAr || ""}`
    : `❌ إجابة غير صحيحة.\n\nالإجابة الصحيحة: ${rightAnswer}\n${question.explanationAr || ""}`
);

await sendMessage(chatId, feedback);

session.quizIndex++;
return sendQuizQuestion(chatId);

}
}

// ========================================
// 14. TEXT HANDLER
// ========================================

async function handleText(message) {
const chatId = message.chat.id;
const text = (message.text || "").trim();
const session = getSession(chatId);

session.firstName = message.from?.first_name || session.firstName || "Barataa";

try {
await saveUser(message.from);
} catch (error) {
console.error("Saving user failed:", error.message);
}

if (text === "/start" || text === "/menu") {
return showMenu(chatId);
}

if (text === "/help" || text === "ℹ️ Gargaarsa") {
return sendMessage(
chatId,
"Waamara fayyadamuuf:\n\n" +
"📖 Nabiyyoota — seenaa Nabiyyootaa\n" +
"🕌 Sahaabota — seenaa Sahaabota\n" +
"📝 Qormaata — qormaata fi qabxii\n" +
"🏆 Qabxii Koo — seenaa qormaataa\n" +
"🔍 Barbaadi — maqaa ykn mata-duree\n" +
"📚 Barnoota — tawhiida, salaata fi kanneen biroo\n" +
"🎧 Barnoota Sagalee — liinkii barnootaa\n\n" +
"Afaan jijjiiruuf button afaanii fayyadami.",
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

if (text === "📖 Nabiyyoota") return showProphets(chatId);
if (text === "🕌 Sahaabota") return showCompanions(chatId);
if (text === "📝 Qormaata") return startQuiz(chatId);
if (text === "🏆 Qabxii Koo") return showHistory(chatId);
if (text === "📚 Barnoota") return showLessons(chatId);
if (text === "🎧 Barnoota Sagalee") return showAudio(chatId);

if (text === "🔍 Barbaadi" || text === "/search") {
session.searchMode = true;

return sendMessage(
  chatId,
  "Maqaa Nabiyyii, Sahaabaa ykn mata-duree barnootaa barbaaddu barreessi.\n\nاكتب اسم النبي أو الصحابي أو موضوع الدرس."
);

}

const query = text.toLowerCase();

const prophet = prophets.find(p =>
p.name.toLowerCase().includes(query) ||
p.ar.toLowerCase().includes(query)
);

if (prophet) {
session.searchMode = false;
return showStory(chatId, prophet, prophet.name, session);
}

const companion = companions.find(c =>
c.name.toLowerCase().includes(query) ||
c.ar.toLowerCase().includes(query)
);

if (companion) {
session.searchMode = false;
return showStory(chatId, companion, companion.name, session);
}

const lesson = lessons.find(l =>
l.name.toLowerCase().includes(query) ||
l.om.toLowerCase().includes(query) ||
l.ar.toLowerCase().includes(query)
);

if (lesson) {
session.searchMode = false;

return showStory(
  chatId,
  {
    om: lesson.om,
    arabic: lesson.ar,
    ar: lesson.name,
    source: lesson.source
  },
  lesson.name,
  session
);

}

if (session.searchMode) {
return sendMessage(
chatId,
languageText(
session,
"Maqaan ykn mata-dureen kun hin argamne. Maqaa sirriitti barreessi ykn menu irraa filadhu.",
"لم نجد الاسم أو الموضوع. اكتب الاسم بشكل صحيح أو اختر من القائمة."
),
mainKeyboard()
);
}

return sendMessage(
chatId,
languageText(
session,
"Maaloo menu irraa filadhu ykn 🔍 Barbaadi tuqi.",
"يرجى اختيار خدمة من القائمة أو الضغط على البحث."
),
mainKeyboard()
);
}

// ========================================
// 15. ROUTES
// ========================================

app.get("/", (req, res) => {
res.send("Waamara Islamic Learning Bot is running.");
});

app.get("/health", async (req, res) => {
let database = "not configured";

if (pool) {
try {
await pool.query("SELECT 1");
database = "connected";
} catch (error) {
database = "error";
}
}

res.json({
ok: true,
app: "Waamara",
database,
prophets: prophets.length,
companions: companions.length,
lessons: lessons.length,
quizQuestions: quizQuestions.length,
time: new Date().toISOString()
});
});

app.post("/telegram/webhook", async (req, res) => {
if (
WEBHOOK_SECRET &&
req.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET
) {
return res.sendStatus(403);
}

// Telegram ariif deebii saffisaa kenna.
res.sendStatus(200);

try {
const update = req.body;

if (update.callback_query) {
  await handleCallback(update.callback_query);
} else if (update.message && update.message.text) {
  await handleText(update.message);
}

} catch (error) {
console.error("Webhook processing error:", error.message);
}
});

// ========================================
// 16. WEBHOOK SETUP
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

const url = "${RENDER_URL.replace(/\/$/, "")}/telegram/webhook";

const body = { url };

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

// ========================================
// 17. START SERVER
// ========================================

async function startServer() {
try {
await initDatabase();
console.log("Database initialization completed.");
} catch (error) {
console.error("Database initialization failed:", error.message);
}

app.listen(PORT, async () => {
console.log("Waamara running on port ${PORT}");
await setupWebhook();
});
}

startServer();
