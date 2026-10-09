"use strict";

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Website: public/index.html
app.use(express.static(path.join(__dirname, "public")));

// Database
let pool = null;

if (DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      max: 5,
      // IPv4 irratti akka hojjetu gargaara.
      family: 4
    });

    pool.on("error", (err) => {
      console.error("Database pool error:", err.message);
    });
  } catch (error) {
    console.error("Database setup error:", error.message);
  }
} else {
  console.warn("DATABASE_URL hin argamne.");
}

// ===============================
// NABIIYYOOTA 25
// ===============================

const prophets = [
  { name: "Aadam (آدم)", story: "Nabiyyii jalqabaa fi abbaa ilmaan namaa." },
  { name: "Idriis (إدريس)", story: "Nabiyyii Rabbiin Qur'aana keessatti faarsedha." },
  { name: "Nuuh (نوح)", story: "Ummata isaa gara Rabbii waame; doonii ijaare." },
  { name: "Huud (هود)", story: "Gara ummata Aaditti ergame." },
  { name: "Saalih (صالح)", story: "Gara ummata Samuuditti ergame." },
  { name: "Ibraahiim (إبراهيم)", story: "Khalīlullaah; towhiidii barsiise." },
  { name: "Luux (لوط)", story: "Gara ummata isaa ergame." },
  { name: "Ismaa'iil (إسماعيل)", story: "Ilma Ibraahiim; obsa fi waadaa eeguun beekama." },
  { name: "Is-haaq (إسحاق)", story: "Ilma Ibraahiim; nabiyyii ture." },
  { name: "Ya'quub (يعقوب)", story: "Ilma Is-haaq; abbaa Yuusuf." },
  { name: "Yuusuf (يوسف)", story: "Obsa, amanamummaa fi dhiifamaan beekama." },
  { name: "Ay-yuub (أيوب)", story: "Obsa isaa keessatti fakkeenya guddaadha." },
  { name: "Shu'ayb (شعيب)", story: "Gara ummata Madyanitti ergame." },
  { name: "Muusaa (موسى)", story: "Rabbiin isa waliin dubbate; gara Fir'awnaatti ergame." },
  { name: "Haaruun (هارون)", story: "Obboleessa Muusaa; nabiyyii ture." },
  { name: "Dhul-Kifl (ذو الكفل)", story: "Nabiyyii Qur'aana keessatti dubbatame." },
  { name: "Daawud (داود)", story: "Nabiyyii fi mootii; kitaaba Zabuur kennameef." },
  { name: "Sulaymaan (سليمان)", story: "Ilma Daawud; Rabbiin mootummaa addaa kenneef." },
  { name: "Ilyaas (إلياس)", story: "Gara ummata isaa waamicha tawhiidii geesse." },
  { name: "Al-Yasa' (اليسع)", story: "Nabiyyii gaggaarii keessaa tokko." },
  { name: "Yuunus (يونس)", story: "Qisaan isaa Qur'aana keessatti dubbatame." },
  { name: "Zakariyyaa (زكريا)", story: "Nabiyyii Rabbiin gara isaa rahmata godhe." },
  { name: "Yahyaa (يحيى)", story: "Ilma Zakariyyaa; Rabbiin isaaf hikmaa kenne." },
  { name: "Iisaa (عيسى)", story: "Ilma Maryam; nabiyyii fi Rasuula Rabbii." },
  { name: "Muhammad (محمد)", story: "Nabiyyii fi Rasuula dhumaa." }
];

// ===============================
// SAHABOOTA
// ===============================

const companions = [
  { name: "Abuu Bakr As-Siddiiq", story: "Sahaabaa guddaa fi khalifaa jalqabaa." },
  { name: "Umar ibn Al-Khattaab", story: "Khalifaa lammaffaa; haqaan beekama." },
  { name: "Uthmaan ibn Affaan", story: "Khalifaa sadaffaa; Qur'aana walitti qabuu keessatti gahee qaba." },
  { name: "Ali ibn Abii Taalib", story: "Khalifaa afraffaa; ilma adeeraa Nabiyyii ﷺ." },
  { name: "Talhah ibn Ubaydillaah", story: "Sahaabota Jannataan gammachiifaman keessaa tokko." },
  { name: "Az-Zubayr ibn Al-Awwaam", story: "Sahaabaa fi loltuu Islaamaa." },
  { name: "Abdur-Rahmaan ibn Awf", story: "Sahaabaa daldalaa fi arjaa." },
  { name: "Sa'd ibn Abii Waqqaas", story: "Sahaabaa beekamaa fi loltuu." },
  { name: "Saeed ibn Zayd", story: "Sahaabota Jannataan gammachiifaman keessaa tokko." },
  { name: "Abuu Ubaydah ibn Al-Jarraah", story: "Amiinul-Ummah jedhamee beekama." },
  { name: "Bilaal ibn Rabaah", story: "Mu'azzina Nabiyyii ﷺ." },
  { name: "Salmmaan Al-Faarisii", story: "Sahaabaa beekamaa; yaada boolla qazuu dhiyeesse." },
  { name: "Abuu Hurayrah", story: "Hadiisa baay'ee dabarse." },
  { name: "Abdullaah ibn Abbaas", story: "Beekaa tafsiiraa fi sahaabaa." },
  { name: "Abdullaah ibn Umar", story: "Hadiisa fi hordoffii Sunnah irratti beekama." },
  { name: "Khaalid ibn Al-Waliid", story: "SaifuLlaah jedhamee beekama." },
  { name: "Hamzah ibn Abdul-Muttalib", story: "Abbeeraa Nabiyyii ﷺ fi sahaabaa jabaa." },
  { name: "Mus'ab ibn Umayr", story: "Islaama Madiina keessatti barsiisuu irratti gahee qaba." },
  { name: "Zayd ibn Haarithah", story: "Sahaabaa Nabiyyii ﷺ biratti jaallatamaa." },
  { name: "Usaamah ibn Zayd", story: "Ajajaa waraanaa ta'ee beekama." },
  { name: "Anas ibn Maalik", story: "Nabiyyii ﷺ tajaajile; hadiisa dabarse." },
  { name: "Jaabir ibn Abdullaah", story: "Sahaabaa hadiisa baay'ee dabarse." },
  { name: "Mu'aadh ibn Jabal", story: "Beekaa halaalaa fi haraamaa." },
  { name: "Hudhayfah ibn Al-Yamaan", story: "Sahaabaa odeeffannoo fitnaa beekuun beekama." },
  { name: "Abuu Dharr Al-Ghifaarii", story: "Sahaabaa jireenya salphaa jaallatu." },
  { name: "Ammmaar ibn Yaasir", story: "Sahaabaa dursee Islaama fudhate." },
  { name: "Suhayb Ar-Ruumii", story: "Sahaabaa dursee Islaama fudhate." },
  { name: "Salim Mawla Abii Hudhayfah", story: "Qur'aana qara'uu irratti beekama." },
  { name: "Zayd ibn Thaabit", story: "Wahyii barreessuu fi Qur'aana walitti qabuu keessatti gahee qaba." },
  { name: "Ubayy ibn Ka'b", story: "Qur'aana qara'uu irratti beekaa ture." },
  { name: "Abdullaah ibn Mas'uud", story: "Qaraatii fi beekumsa Qur'aanaa irratti beekama." },
  { name: "Abuu Ayyuub Al-Ansaar", story: "Nabiyyii ﷺ yeroo Madiina dhufe keessummeesse." },
  { name: "Sa'd ibn Mu'aadh", story: "Sahaabaa Ansaar keessaa hogganaa." },
  { name: "Usayd ibn Hudayr", story: "Sahaabaa Ansaar keessaa." },
  { name: "Ja'far ibn Abii Taalib", story: "Obboleessa Ali; gara Habashaa godaane." },
  { name: "Abdullaah ibn Rawaahah", story: "Sahaabaa fi shayiraa." },
  { name: "Hassaan ibn Thaabit", story: "Shayiraa Nabiyyii ﷺ." },
  { name: "Abuu Sufyaan ibn Harb", story: "Sahaabaa; Islaama booda Islaamaaf tajaajile." },
  { name: "Ikrimah ibn Abii Jahl", story: "Sahaabaa; Islaama fudhatee Islaamaaf tajaajile." },
  { name: "Safwaan ibn Umayyah", story: "Sahaabaa Islaama fudhate." },
  { name: "Abdullaah ibn Salaam", story: "Islaama fudhate; beekaa ture." },
  { name: "Tamim Ad-Daarii", story: "Sahaabaa; ibsa hadiisaa keessatti maqaan isaa dhufa." },
  { name: "Abuu Musa Al-Ash'arii", story: "Qaraatii Qur'aanaa mi'aawaa qaba ture." },
  { name: "Imraan ibn Husayn", story: "Sahaabaa hadiisa dabarse." },
  { name: "Abuu Dardaa", story: "Beekaa fi barsiisaa Qur'aanaa." },
  { name: "Abdullaah ibn Amr ibn Al-Aas", story: "Hadiisa barreessuu irratti beekama." },
  { name: "Amr ibn Al-Aas", story: "Sahaabaa fi ajajaa waraanaa." },
  { name: "Uqbah ibn Aamir", story: "Sahaabaa fi qara'aa Qur'aanaa." },
  { name: "Abuu Qataadah Al-Ansaar", story: "Sahaabaa fi loltuu." },
  { name: "Rifa'ah ibn Raafi'", story: "Sahaabaa Ansaar keessaa." }
];

// ===============================
// TELEGRAM API
// ===============================

function telegramRequest(method, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!BOT_TOKEN) {
      return reject(new Error("TELEGRAM_BOT_TOKEN hin kaa'amne."));
    }

    const body = JSON.stringify(payload);

    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: 15000
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);

            if (!parsed.ok) {
              return reject(
                new Error(parsed.description || "Telegram API error")
              );
            }

            resolve(parsed.result);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Telegram request timeout"));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendMessage(chatId, text, keyboard = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  };

  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  return telegramRequest("sendMessage", payload);
}

async function answerCallbackQuery(callbackQueryId, text = "") {
  try {
    await telegramRequest("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text
    });
  } catch (error) {
    console.error("Callback answer error:", error.message);
  }
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "📖 Nabiyyoota 25" }, { text: "👥 Sahaboota" }],
      [{ text: "📝 Qormaata" }, { text: "🏆 Qabxii Koo" }],
      [{ text: "🔍 Barbaadi" }, { text: "🌐 Website" }]
    ],
    resize_keyboard: true
  };
}

// ===============================
// DATABASE TABLE
// ===============================

async function initializeDatabase() {
  if (!pool) {
    console.warn("Database hin jiru; hojii DB barbaadu hin kuusu.");
    return;
  }

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

  console.log("Database migrations completed.");
}

// ===============================
// QUIZ BUILDER
// ===============================

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function buildQuiz() {
  const questions = [];

  const prophetPool = shuffle(prophets);

  for (const prophet of prophetPool.slice(0, 5)) {
    const wrong = shuffle(
      prophets
        .filter((item) => item.name !== prophet.name)
        .map((item) => item.name)
    ).slice(0, 3);

    const options = shuffle([prophet.name, ...wrong]);

    questions.push({
      q: "Nabiyyii kana keessaa eenyuudha? " + prophet.story,
      options,
      answer: options.indexOf(prophet.name)
    });
  }

  const companionPool = shuffle(companions);

  for (const companion of companionPool.slice(0, 5)) {
    const wrong = shuffle(
      companions
        .filter((item) => item.name !== companion.name)
        .map((item) => item.name)
    ).slice(0, 3);

    const options = shuffle([companion.name, ...wrong]);

    questions.push({
      q: "Sahaabaa kana eenyu? " + companion.story,
      options,
      answer: options.indexOf(companion.name)
    });
  }

  return shuffle(questions);
}

// ===============================
// TELEGRAM QUIZ SESSIONS
// ===============================

const telegramSessions = new Map();
const webSessions = new Map();

async function startTelegramQuiz(chatId, user) {
  const questions = buildQuiz();

  telegramSessions.set(String(chatId), {
    userId: String(user.id),
    userName: user.first_name || "Barataa",
    questions,
    current: 0,
    score: 0
  });

  await sendMessage(
    chatId,
    "📝 <b>Qormaata Waamara</b>\n\nGaaffii 10 siif qopheesseera. Deebii sirrii filadhu.",
    { remove_keyboard: true }
  );

  await sendTelegramQuestion(chatId);
}

async function sendTelegramQuestion(chatId) {
  const session = telegramSessions.get(String(chatId));

  if (!session) return;

  if (session.current >= session.questions.length) {
    return finishTelegramQuiz(chatId);
  }

  const question = session.questions[session.current];

  const keyboard = {
    inline_keyboard: question.options.map((option, index) => [
      {
        text: option,
        callback_data: `quiz:${index}`
      }
    ])
  };

  await sendMessage(
    chatId,
    `❓ <b>Gaaffii ${session.current + 1}/${session.questions.length}</b>\n\n${question.q}`,
    keyboard
  );
}

async function finishTelegramQuiz(chatId) {
  const session = telegramSessions.get(String(chatId));

  if (!session) return;

  const total = session.questions.length;
  const percent = Number(((session.score / total) * 100).toFixed(2));

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
      console.error("Quiz result save error:", error.message);
    }
  }

  await sendMessage(
    chatId,
    `🏆 <b>Qormaanni xumurame!</b>\n\n` +
      `✅ Qabxii: ${session.score}/${total}\n` +
      `📊 Dhibbeentaa: ${percent}%\n\n` +
      `Galatoomi qormaata fudhachuu keetiif!`,
    mainKeyboard()
  );

  telegramSessions.delete(String(chatId));
}

// ===============================
// WEBSITE API: CONTENT
// ===============================

app.get("/api/content", (req, res) => {
  const type = String(req.query.type || "prophet").toLowerCase();
  const search = String(req.query.search || "").trim().toLowerCase();

  let source;

  if (type === "prophet" || type === "prophets") {
    source = prophets;
  } else if (type === "companion" || type === "companions") {
    source = companions;
  } else {
    return res.status(400).json({
      error: "type prophet ykn companion ta'uu qaba."
    });
  }

  const filtered = source.filter((item) => {
    return (
      item.name.toLowerCase().includes(search) ||
      item.story.toLowerCase().includes(search)
    );
  });

  return res.json({
    type,
    count: filtered.length,
    items: filtered
  });
});

// ===============================
// WEBSITE API: START QUIZ
// ===============================

app.post("/api/web/quiz/start", (_req, res) => {
  const sessionId = crypto.randomUUID();
  const questions = buildQuiz();

  webSessions.set(sessionId, {
    questions,
    createdAt: Date.now(),
    completed: false
  });

  const safeQuestions = questions.map((question) => ({
    q: question.q,
    options: question.options
  }));

  res.json({
    sessionId,
    questions: safeQuestions
  });
});

// ===============================
// WEBSITE API: SUBMIT QUIZ
// ===============================

app.post("/api/web/quiz/submit", async (req, res) => {
  const { sessionId, answers } = req.body || {};

  if (!sessionId || !Array.isArray(answers)) {
    return res.status(400).json({
      error: "Session ID fi deebiiwwan barbaachisu."
    });
  }

  const session = webSessions.get(String(sessionId));

  if (!session) {
    return res.status(404).json({
      error: "Qormaanni hin argamne ykn yeroo isaa xumureera. Irra deebi'i."
    });
  }

  // Session yeroo dheeraa ture yoo ta'e haqi.
  if (Date.now() - session.createdAt > 60 * 60 * 1000) {
    webSessions.delete(String(sessionId));

    return res.status(410).json({
      error: "Yeroon qormaataa xumurame. Irra deebi'i."
    });
  }

  if (session.completed) {
    return res.status(409).json({
      error: "Qormaata kana duraan ergeetta."
    });
  }

  if (answers.length !== session.questions.length) {
    return res.status(400).json({
      error: "Deebiiwwan gaaffii hundaaf ergi."
    });
  }

  const validAnswers = answers.every(
    (answer) =>
      Number.isInteger(answer) &&
      answer >= 0 &&
      answer <= 3
  );

  if (!validAnswers) {
    return res.status(400).json({
      error: "Deebiiwwan sirrii hin taane."
    });
  }

  let score = 0;

  session.questions.forEach((question, index) => {
    if (answers[index] === question.answer) {
      score++;
    }
  });

  const total = session.questions.length;
  const percent = Number(((score / total) * 100).toFixed(2));

  // Qormaata tokko yeroo tokko qofa erguu.
  session.completed = true;

  // Bu'aa kuusuuf DB barbaachisa.
  if (!pool) {
    webSessions.delete(String(sessionId));

    return res.status(503).json({
      error: "Database hin hidhamne. Bu'aa kuusuu hin dandeenye."
    });
  }

  try {
    await pool.query(
      `INSERT INTO waamara_results
       (telegram_user_id, chat_id, user_name, score, total, percent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `website:${sessionId}`,
        "website",
        "Website Student",
        score,
        total,
        percent
      ]
    );

    webSessions.delete(String(sessionId));

    return res.json({
      success: true,
      score,
      total,
      percent,
      message: "Qabxiin kee milkaa'inaan kuufameera."
    });
  } catch (error) {
    console.error("Website result save error:", error.message);

    session.completed = false;

    return res.status(500).json({
      error: "Bu'aa kuusuu hin dandeenye. Maaloo irra deebi'i."
    });
  }
});

// ===============================
// WEBSITE API: RECENT RESULTS
// ===============================

app.get("/api/web/results", async (_req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: "Database hin hidhamne."
    });
  }

  try {
    const result = await pool.query(
      `SELECT user_name, score, total, percent, created_at
       FROM waamara_results
       ORDER BY created_at DESC
       LIMIT 20`
    );

    res.json({
      count: result.rows.length,
      results: result.rows
    });
  } catch (error) {
    console.error("Results query error:", error.message);

    res.status(500).json({
      error: "Bu'aa qormaataa argachuu hin dandeenye."
    });
  }
});

// ===============================
// TELEGRAM WEBHOOK
// ===============================

app.post("/telegram/webhook", async (req, res) => {
  if (
    WEBHOOK_SECRET &&
    req.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET
  ) {
    return res.sendStatus(403);
  }

  // Telegram irraa ergaa fudhatte.
  res.sendStatus(200);

  try {
    const update = req.body;

    if (update.callback_query) {
      const callback = update.callback_query;
      const chatId = callback.message?.chat?.id;

      await answerCallbackQuery(callback.id);

      if (!chatId) return;

      const session = telegramSessions.get(String(chatId));

      if (
        callback.data &&
        callback.data.startsWith("quiz:") &&
        session
      ) {
        const chosen = Number(callback.data.split(":")[1]);
        const question = session.questions[session.current];

        if (chosen === question.answer) {
          session.score++;
        }

        session.current++;
        await sendTelegramQuestion(chatId);
      }

      return;
    }

    const message = update.message;

    if (!message || !message.chat) return;

    const chatId = message.chat.id;
    const user = message.from || {};
    const text = String(message.text || "").trim();

    if (!text) return;

    if (text === "/start" || text === "/menu") {
      const welcome =
        `👋 <b>Baga nagaan dhuftan Waamara!</b>\n\n` +
        `Waamara keessatti:\n` +
        `📖 Nabiyyoota baradhu\n` +
        `👥 Sahaboota baradhu\n` +
        `📝 Qormaata fudhadhu\n` +
        `🏆 Qabxii kee ilaali\n\n` +
        `Maal jalqabuu barbaadda?`;

      await sendMessage(chatId, welcome, mainKeyboard());
      return;
    }

    if (text === "📖 Nabiyyoota 25") {
      const keyboard = {
        inline_keyboard: prophets.map((prophet, index) => [
          {
            text: prophet.name,
            callback_data: `prophet:${index}`
          }
        ])
      };

      await sendMessage(
        chatId,
        "📖 <b>Nabiyyoota Qur'aana keessatti dubbataman</b>\nMaqaa barbaadde filadhu:",
        keyboard
      );

      return;
    }

    if (text === "👥 Sahaboota") {
      const keyboard = {
        inline_keyboard: companions.map((companion, index) => [
          {
            text: companion.name,
            callback_data: `companion:${index}`
          }
        ])
      };

      await sendMessage(
        chatId,
        "👥 <b>Sahaboota</b>\nMaqaa sahaabaa barbaadde filadhu:",
        keyboard
      );

      return;
    }

    if (text === "📝 Qormaata") {
      await startTelegramQuiz(chatId, user);
      return;
    }

    if (text === "🏆 Qabxii Koo") {
      if (!pool) {
        await sendMessage(
          chatId,
          "Database hin hidhamne; qabxii argachuu hin dandeenye.",
          mainKeyboard()
        );

        return;
      }

      const result = await pool.query(
        `SELECT score, total, percent, created_at
         FROM waamara_results
         WHERE telegram_user_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [String(user.id)]
      );

      if (result.rows.length === 0) {
        await sendMessage(
          chatId,
          "Qormaata fudhatte hin qabdu. 📝 Qormaata jalqabi!",
          mainKeyboard()
        );

        return;
      }

      const history = result.rows
        .map((row, index) => {
          const date = new Date(row.created_at).toLocaleDateString("om-ET");

          return `${index + 1}. ${row.score}/${row.total} (${row.percent}%) — ${date}`;
        })
        .join("\n");

      await sendMessage(
        chatId,
        `🏆 <b>Qabxiiwwan kee dhiyoo</b>\n\n${history}`,
        mainKeyboard()
      );

      return;
    }

    if (text === "🔍 Barbaadi") {
      await sendMessage(
        chatId,
        "Maqaa Nabiyyii ykn Sahaabaa barbaadde barreessi."
      );

      return;
    }

    if (text === "🌐 Website") {
      const website = RENDER_EXTERNAL_URL || "";

      if (website) {
        await sendMessage(
          chatId,
          `🌐 <b>Website Waamara</b>\n\n<a href="${website}">As tuqi website banuuf</a>`
        );
      } else {
        await sendMessage(
          chatId,
          "Website link argachuuf RENDER_EXTERNAL_URL Render keessatti kaa'i."
        );
      }

      return;
    }

    // Callback: Nabiyyii ykn Sahaabaa filachuu.
    if (text.startsWith("/")) {
      await sendMessage(
        chatId,
        "Ajaja kana hin beeku. /start barreessi.",
        mainKeyboard()
      );

      return;
    }

    const search = text.toLowerCase();

    const prophet = prophets.find(
      (item) =>
        item.name.toLowerCase().includes(search) ||
        item.story.toLowerCase().includes(search)
    );

    if (prophet) {
      await sendMessage(
        chatId,
        `📖 <b>${prophet.name}</b>\n\n${prophet.story}`,
        mainKeyboard()
      );

      return;
    }

    const companion = companions.find(
      (item) =>
        item.name.toLowerCase().includes(search) ||
        item.story.toLowerCase().includes(search)
    );

    if (companion) {
      await sendMessage(
        chatId,
        `👥 <b>${companion.name}</b>\n\n${companion.story}`,
        mainKeyboard()
      );

      return;
    }

    await sendMessage(
      chatId,
      "Maqaan sun hin argamne. Maqaa sirrii barreessi ykn /start fayyadami.",
      mainKeyboard()
    );
  } catch (error) {
    console.error("Telegram update error:", error.message);
  }
});

// Handle inline buttons for prophets and companions.
app.post("/telegram/callback", (_req, res) => {
  res.sendStatus(200);
});

// ===============================
// HEALTH / STATUS
// ===============================

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "Waamara",
    website: "ready",
    botConfigured: Boolean(BOT_TOKEN),
    databaseConfigured: Boolean(pool),
    time: new Date().toISOString()
  });
});

app.get("/api/status", async (_req, res) => {
  let database = "not_configured";

  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = "connected";
    } catch (error) {
      database = "error";
      console.error("Database status error:", error.message);
    }
  }

  res.status(database === "error" ? 503 : 200).json({
    app: "Waamara",
    website: "ready",
    botConfigured: Boolean(BOT_TOKEN),
    database,
    time: new Date().toISOString()
  });
});

// ===============================
// ROOT WEBSITE
// ===============================

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// SET TELEGRAM WEBHOOK
// ===============================

async function configureWebhook() {
  if (!BOT_TOKEN || !RENDER_EXTERNAL_URL) {
    console.warn(
      "Webhook hin qophoofne. TELEGRAM_BOT_TOKEN fi RENDER_EXTERNAL_URL mirkaneessi."
    );
    return;
  }

  const url = `${RENDER_EXTERNAL_URL.replace(/\/+$/, "")}/telegram/webhook`;

  const payload = {
    url,
    allowed_updates: ["message", "callback_query"]
  };

  if (WEBHOOK_SECRET) {
    payload.secret_token = WEBHOOK_SECRET;
  }

  try {
    const result = await telegramRequest("setWebhook", payload);

    console.log("Telegram webhook configured:", url, result);
  } catch (error) {
    console.error("Webhook configuration error:", error.message);
  }
}

// ===============================
// CALLBACK HANDLING FOR LISTS
// ===============================

// Telegram webhook route keessatti callback handling kana dabalataan
// qabachuun maqaa Nabiyyii/Sahaabaa akka banamu taasisa.
app.post("/telegram/webhook-details", async (req, res) => {
  res.sendStatus(200);
});

// ===============================
// START SERVER
// ===============================

async function startServer() {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error("Database initialization failed:", error.message);
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Waamara server running on port ${PORT}`);

    await configureWebhook();
  });
}

startServer();

// Yeroo dheeraa keessatti session durii haqi.
setInterval(() => {
  const now = Date.now();

  for (const [id, session] of webSessions.entries()) {
    if (now - session.createdAt > 60 * 60 * 1000) {
      webSessions.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();
