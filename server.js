const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const RENDER_URL = (process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

const API = `https://api.telegram.org/bot${BOT_TOKEN || ""}`;

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
      family: 4
    })
  : null;

const prophets = [
  ["Aadam", "آدم"],
  ["Idriis", "إدريس"],
  ["Nuuh", "نوح"],
  ["Huud", "هود"],
  ["Saalih", "صالح"],
  ["Ibraahiim", "إبراهيم"],
  ["Luux", "لوط"],
  ["Ismaa'iil", "إسماعيل"],
  ["Is'haaq", "إسحاق"],
  ["Ya'aquub", "يعقوب"],
  ["Yuusuf", "يوسف"],
  ["Shu'ayb", "شعيب"],
  ["Ayyuub", "أيوب"],
  ["Zul-Kifl", "ذو الكفل"],
  ["Muusaa", "موسى"],
  ["Haaruun", "هارون"],
  ["Daawud", "داود"],
  ["Sulaymaan", "سليمان"],
  ["Ilyaas", "إلياس"],
  ["Al-Yasa'", "اليسع"],
  ["Yuunus", "يونس"],
  ["Zakariyyaa", "زكريا"],
  ["Yahyaa", "يحيى"],
  ["Iisaa", "عيسى"],
  ["Muhammad", "محمد"]
].map(([name, ar]) => ({ name, ar }));

const companions = [
  ["Abuu Bakr As-Siddiiq", "أبو بكر الصديق"],
  ["Umar ibn Al-Khattaab", "عمر بن الخطاب"],
  ["Uthmaan ibn Affaan", "عثمان بن عفان"],
  ["Ali ibn Abii Taalib", "علي بن أبي طالب"],
  ["Talha ibn Ubaydillaah", "طلحة بن عبيد الله"],
  ["Az-Zubayr ibn Al-Awwaam", "الزبير بن العوام"],
  ["Abdur-Rahmaan ibn Awf", "عبد الرحمن بن عوف"],
  ["Sa'd ibn Abii Waqqaas", "سعد بن أبي وقاص"],
  ["Sa'iid ibn Zayd", "سعيد بن زيد"],
  ["Abuu Ubaydah ibn Al-Jarraah", "أبو عبيدة بن الجراح"],
  ["Bilaal ibn Rabaah", "بلال بن رباح"],
  ["Salmān Al-Faarisii", "سلمان الفارسي"],
  ["Abuu Dharr Al-Ghifaarii", "أبو ذر الغفاري"],
  ["Khaalid ibn Al-Waliid", "خالد بن الوليد"],
  ["Ammaar ibn Yaasir", "عمار بن ياسر"],
  ["Yaasir ibn Aamir", "ياسر بن عامر"],
  ["Sumayyah bint Khayyaat", "سمية بنت خياط"],
  ["Mus'ab ibn Umayr", "مصعب بن عمير"],
  ["Hamza ibn Abdul-Muttalib", "حمزة بن عبد المطلب"],
  ["Ja'far ibn Abii Taalib", "جعفر بن أبي طالب"],
  ["Abdullaah ibn Mas'uud", "عبد الله بن مسعود"],
  ["Ubayy ibn Ka'b", "أبي بن كعب"],
  ["Zayd ibn Thaabit", "زيد بن ثابت"],
  ["Abuu Hurayrah", "أبو هريرة"],
  ["Anas ibn Maalik", "أنس بن مالك"],
  ["Abdullaah ibn Umar", "عبد الله بن عمر"],
  ["Abdullaah ibn Abbaas", "عبد الله بن عباس"],
  ["Aishah bint Abii Bakr", "عائشة بنت أبي بكر"],
  ["Hafsah bint Umar", "حفصة بنت عمر"],
  ["Ummu Salamah", "أم سلمة"],
  ["Khadijah bint Khuwaylid", "خديجة بنت خويلد"],
  ["Faatimah bint Muhammad", "فاطمة بنت محمد"],
  ["Hasan ibn Ali", "الحسن بن علي"],
  ["Husayn ibn Ali", "الحسين بن علي"],
  ["Zayd ibn Haarithah", "زيد بن حارثة"],
  ["Usaamah ibn Zayd", "أسامة بن زيد"],
  ["Abdullaah ibn Rawaahah", "عبد الله بن رواحة"],
  ["Ka'b ibn Maalik", "كعب بن مالك"],
  ["Hanzalah ibn Abii Aamir", "حنظلة بن أبي عامر"],
  ["Abuu Ayyuub Al-Ansaarī", "أبو أيوب الأنصاري"],
  ["Sa'd ibn Mu'aadh", "سعد بن معاذ"],
  ["Sa'd ibn Ubaadah", "سعد بن عبادة"],
  ["Mu'aadh ibn Jabal", "معاذ بن جبل"],
  ["Abuu Dardaa", "أبو الدرداء"],
  ["Abuu Musa Al-Ash'arii", "أبو موسى الأشعري"],
  ["Imraan ibn Husayn", "عمران بن حصين"],
  ["Jariir ibn Abdillaah", "جرير بن عبد الله"],
  ["Abdullaah ibn Amr ibn Al-Aas", "عبد الله بن عمرو بن العاص"],
  ["Amr ibn Al-Aas", "عمرو بن العاص"],
  ["Abuu Sufyaan ibn Harb", "أبو سفيان بن حرب"]
].map(([name, ar]) => ({ name, ar }));

const sessions = new Map();

const lessons = [
  { name: "Qur'aana", url: "https://quran.com" },
  { name: "Hadiisa", url: "https://sunnah.com" }
];

async function telegram(method, payload = {}) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN hin qindaa'in.");
  }

  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.description || "Telegram API error");
  }

  return result.result;
}

async function sendMessage(chatId, text, reply_markup) {
  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  };

  if (reply_markup) {
    payload.reply_markup = reply_markup;
  }

  return telegram("sendMessage", payload);
}

function mainKeyboard() {
  return {
    keyboard: [
      [
        { text: "📖 Seenaa Nabiyyootaa" },
        { text: "🤝 Seenaa Sahaabota" }
      ],
      [
        { text: "📝 Qormaata Fudhadhu" },
        { text: "🏆 Qabxii Koo" }
      ],
      [
        { text: "🔎 Barbaadi" },
        { text: "🎧 Barnoota" }
      ],
      [{ text: "ℹ️ Gargaarsa" }]
    ],
    resize_keyboard: true
  };
}

async function initDatabase() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS waamara_results (
      id BIGSERIAL PRIMARY KEY,
      telegram_user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      user_name TEXT,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      percent NUMERIC(6,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function showList(chatId, type, page = 0) {
  const list = type === "prophet" ? prophets : companions;
  const size = 8;
  const start = page * size;

  const rows = list.slice(start, start + size);

  const buttons = rows.map((item, i) => [{
    text: `${start + i + 1}. ${item.name}`,
    callback_data: `${type}:${start + i}`
  }]);

  const nav = [];

  if (page > 0) {
    nav.push({
      text: "⬅️ Dura",
      callback_data: `${type}_page:${page - 1}`
    });
  }

  if (start + size < list.length) {
    nav.push({
      text: "Itti fufi ➡️",
      callback_data: `${type}_page:${page + 1}`
    });
  }

  if (nav.length) buttons.push(nav);

  await sendMessage(
    chatId,
    type === "prophet"
      ? "📖 Nabiyyii barbaaddu filadhu:"
      : "🤝 Sahaabaa barbaaddu filadhu:",
    { inline_keyboard: buttons }
  );
}

async function showStory(chatId, item, type) {
  const text =
    type === "prophet"
      ? `📖 Nabiyyii ${item.name} (${item.ar})\n\nMaqaan isaa seenaa Islaamaa keessatti beekamaa dha. Seenaa isaa bal'inaan Qur'aana fi kitaabota seenaa amanamoo irraa baradhu.\n\n📚 Madda: https://quran.com`
      : `🤝 Sahaabaa ${item.name} (${item.ar})\n\nSahaabota Nabiyyii Muhammad (SAW) keessaa tokko. Seenaa sahaabota kitaabota seenaa Islaamaa amanamoo irraa baradhu.\n\n📚 Madda: https://sunnah.com`;

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "⬅️ Gara menuutti", callback_data: "menu" }]
    ]
  });
}

function buildQuiz() {
  const questions = [];

  for (const p of prophets) {
    questions.push({
      q: `Maqaan Arabaa ${p.ar} jedhu Nabiyyii eenyu?`,
      options: [p.name, "Muusaa", "Yuunus", "Nuuh"],
      answer: p.name
    });
  }

  for (const c of companions) {
    questions.push({
      q: `Maqaan Arabaa ${c.ar} jedhu Sahaabaa kam?`,
      options: [
        c.name,
        "Abuu Bakr As-Siddiiq",
        "Umar ibn Al-Khattaab",
        "Bilaal ibn Rabaah"
      ],
      answer: c.name
    });
  }

  questions.push(
    {
      q: "Nabiyyii xumuraa eenyu?",
      options: ["Muhammad", "Muusaa", "Iisaa", "Nuuh"],
      answer: "Muhammad"
    },
    {
      q: "Kitaabni Muslimootaaf bu'e maal jedhama?",
      options: ["Qur'aana", "Tawraat", "Injiil", "Zabuur"],
      answer: "Qur'aana"
    },
    {
      q: "Arkāna Islaamaa meeqa?",
      options: ["Shan", "Sadii", "Jaha", "Torba"],
      answer: "Shan"
    }
  );

  return questions.sort(() => Math.random() - 0.5).slice(0, 10);
}

async function startQuiz(chatId, user) {
  sessions.set(String(chatId), {
    quiz: buildQuiz(),
    index: 0,
    score: 0,
    userId: String(user.id),
    userName: user.first_name || ""
  });

  await sendQuizQuestion(chatId);
}

async function sendQuizQuestion(chatId) {
  const session = sessions.get(String(chatId));

  if (!session) return;

  if (session.index >= session.quiz.length) {
    return finishQuiz(chatId, session);
  }

  const q = session.quiz[session.index];

  const options = [...q.options].sort(() => Math.random() - 0.5);

  session.currentOptions = options;

  const buttons = options.map((option, i) => [{
    text: option,
    callback_data: `answer:${session.index}:${i}`
  }]);

  await sendMessage(
    chatId,
    `❓ Gaaffii ${session.index + 1}/${session.quiz.length}\n\n${q.q}`,
    { inline_keyboard: buttons }
  );
}

async function finishQuiz(chatId, session) {
  const total = session.quiz.length;
  const percent = total ? (session.score / total) * 100 : 0;

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO waamara_results
         (telegram_user_id, chat_id, user_name, score, total, percent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          session.userId,
          String(chatId),
          session.userName,
          session.score,
          total,
          percent
        ]
      );
    } catch (error) {
      console.error("Bu'aa kuusuu hin dandeenye:", error.message);
    }
  }

  sessions.delete(String(chatId));

  await sendMessage(
    chatId,
    `🏆 Qormaanni xumurame!\n\n✅ Sirrii: ${session.score}\n📝 Waliigala: ${total}\n📊 Dhibbeentaa: ${percent.toFixed(1)}%`,
    {
      inline_keyboard: [
        [{ text: "🔁 Qormaata biraa", callback_data: "quiz" }],
        [{ text: "🏠 Menu", callback_data: "menu" }]
      ]
    }
  );
}

async function showHistory(chatId, user) {
  if (!pool) {
    return sendMessage(
      chatId,
      "Database hin qindaa'in. Render Environment keessatti DATABASE_URL dabali."
    );
  }

  try {
    const result = await pool.query(
      `SELECT score, total, percent, created_at
       FROM waamara_results
       WHERE telegram_user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [String(user.id)]
    );

    if (!result.rows.length) {
      return sendMessage(
        chatId,
        "Bu'aan qormaataa hin jiru. Jalqaba qormaata fudhadhu."
      );
    }

    const lines = result.rows.map((row, i) =>
      `${i + 1}. ${row.score}/${row.total} — ${Number(row.percent).toFixed(1)}%`
    );

    await sendMessage(chatId, `🏆 Qabxii kee:\n\n${lines.join("\n")}`);
  } catch (error) {
    console.error("History error:", error.message);
    await sendMessage(chatId, "❌ Qabxii argachuun hin danda'amne.");
  }
}

async function searchContent(chatId, term) {
  const q = term.toLowerCase().trim();

  const p = prophets.filter(x =>
    x.name.toLowerCase().includes(q) || x.ar.includes(q)
  );

  const c = companions.filter(x =>
    x.name.toLowerCase().includes(q) || x.ar.includes(q)
  );

  const buttons = [];

  p.slice(0, 5).forEach(item => {
    buttons.push([{
      text: `📖 ${item.name}`,
      callback_data: `prophet:${prophets.indexOf(item)}`
    }]);
  });

  c.slice(0, 5).forEach(item => {
    buttons.push([{
      text: `🤝 ${item.name}`,
      callback_data: `companion:${companions.indexOf(item)}`
    }]);
  });

  if (!buttons.length) {
    return sendMessage(chatId, "Waan barbaadde hin arganne. Maqaa biraa yaali.");
  }

  await sendMessage(chatId, "🔎 Bu'aa barbaacha:", {
    inline_keyboard: buttons
  });
}

async function handleText(message) {
  const chatId = message.chat.id;
  const user = message.from || {};
  const text = (message.text || "").trim();

  if (text.startsWith("/start") || text.startsWith("/menu")) {
    return sendMessage(
      chatId,
      `Assalaamu alaykum ${user.first_name || ""}! 👋\n\nBaga gara Waamaraatti dhuftan.\n\n📖 Seenaa Nabiyyootaa\n🤝 Seenaa Sahaabota\n📝 Qormaata\n🏆 Qabxii\n🔎 Barbaacha`,
      mainKeyboard()
    );
  }

  if (text === "📖 Seenaa Nabiyyootaa") return showList(chatId, "prophet");
  if (text === "🤝 Seenaa Sahaabota") return showList(chatId, "companion");
  if (text === "📝 Qormaata Fudhadhu") return startQuiz(chatId, user);
  if (text === "🏆 Qabxii Koo") return showHistory(chatId, user);

  if (text === "🎧 Barnoota") {
    const buttons = lessons.map(item => [{
      text: `🎧 ${item.name}`,
      url: item.url
    }]);

    return sendMessage(chatId, "Madda barnootaa filadhu:", {
      inline_keyboard: buttons
    });
  }

  if (text === "🔎 Barbaadi") {
    sessions.set(`search:${chatId}`, true);
    return sendMessage(chatId, "Maqaa Nabiyyii ykn Sahaabaa barbaaddu barreessi.");
  }

  if (text === "ℹ️ Gargaarsa") {
    return sendMessage(
      chatId,
      "Akka itti fayyadamtu:\n• Seenaa Nabiyyootaa filadhu.\n• Seenaa Sahaabota filadhu.\n• Qormaata fudhadhu.\n• Qabxii kee ilaali.\n• Barbaachaaf maqaa barreessi.",
      mainKeyboard()
    );
  }

  if (sessions.has(`search:${chatId}`)) {
    sessions.delete(`search:${chatId}`);
    return searchContent(chatId, text);
  }

  return sendMessage(chatId, "Menu keessaa filadhu ykn /start barreessi.", mainKeyboard());
}

async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const user = callback.from || {};
  const data = callback.data || "";

  try {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id
    });
  } catch (_) {}

  if (data === "menu") {
    return sendMessage(chatId, "🏠 Menu keessaa filadhu:", mainKeyboard());
  }

  if (data === "quiz") return startQuiz(chatId, user);

  if (data.startsWith("prophet_page:")) {
    return showList(chatId, "prophet", Number(data.split(":")[1]) || 0);
  }

  if (data.startsWith("companion_page:")) {
    return showList(chatId, "companion", Number(data.split(":")[1]) || 0);
  }

  if (data.startsWith("prophet:")) {
    const index = Number(data.split(":")[1]);
    if (prophets[index]) return showStory(chatId, prophets[index], "prophet");
  }

  if (data.startsWith("companion:")) {
    const index = Number(data.split(":")[1]);
    if (companions[index]) return showStory(chatId, companions[index], "companion");
  }

  if (data.startsWith("answer:")) {
    const session = sessions.get(String(chatId));
    if (!session) {
      return sendMessage(chatId, "Qormaanni xumurameera. Qormaata haaraa jalqabi.");
    }

    const [, questionIndex, optionIndex] = data.split(":");

    if (Number(questionIndex) !== session.index) return;

    const question = session.quiz[session.index];
    const selected = session.currentOptions[Number(optionIndex)];

    if (selected === question.answer) {
      session.score += 1;
      await sendMessage(chatId, "✅ Sirrii!");
    } else {
      await sendMessage(chatId, `❌ Deebiin sirrii: ${question.answer}`);
    }

    session.index += 1;
    return sendQuizQuestion(chatId);
  }
}

app.get("/", (_req, res) => {
  res.status(200).send("Waamara Telegram Bot is running.");
});

app.get("/health", async (_req, res) => {
  let database = "not_configured";

  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = "connected";
    } catch (_) {
      database = "error";
    }
  }

  res.json({ ok: true, app: "Waamara", database });
});

app.post("/telegram/webhook", async (req, res) => {
  if (WEBHOOK_SECRET) {
    const secret = req.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== WEBHOOK_SECRET) return res.sendStatus(401);
  }

  res.sendStatus(200);

  try {
    if (req.body.message) await handleText(req.body.message);
    if (req.body.callback_query) await handleCallback(req.body.callback_query);
  } catch (error) {
    console.error("Update handling error:", error);
  }
});

async function configureWebhook() {
  if (!BOT_TOKEN || !RENDER_URL) {
    console.log("Webhook hin qindaa'in. TELEGRAM_BOT_TOKEN fi RENDER_EXTERNAL_URL ilaali.");
    return;
  }

  const url = `${RENDER_URL}/telegram/webhook`;
  const payload = { url };

  if (WEBHOOK_SECRET) payload.secret_token = WEBHOOK_SECRET;

  const result = await telegram("setWebhook", payload);
  console.log("Webhook configured:", result);
}

async function startServer() {
  try {
    if (pool) {
      await initDatabase();
      console.log("Database migrations completed.");
    }
  } catch (error) {
    console.error("Database initialization failed:", error.message);
  }

  app.listen(PORT, async () => {
    console.log(`Waamara running on port ${PORT}`);

    try {
      await configureWebhook();
    } catch (error) {
      console.error("Webhook setup failed:", error.message);
    }
  });
}

startServer();

process.on("SIGTERM", async () => {
  if (pool) await pool.end().catch(() => {});
  process.exit(0);
});
