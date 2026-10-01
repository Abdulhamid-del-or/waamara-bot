const express = require("express");
const https = require("https");
const { Pool } = require("pg");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN hin argamne.");
}

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL hin argamne.");
}

/* =========================
   DATABASE
========================= */

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =========================
   TELEGRAM API
========================= */

function telegram(method, data = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);

    const request = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData)
        }
      },
      (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          try {
            const result = JSON.parse(body);

            if (!result.ok) {
              reject(
                new Error(
                  result.description || "Telegram API error"
                )
              );
              return;
            }

            resolve(result.result);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);

    request.write(postData);
    request.end();
  });
}

/* =========================
   DATABASE INITIALIZATION
========================= */

async function initDatabase() {
  console.log("🔄 Database initialization started...");

  /* USERS TABLE */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE,
      first_name TEXT,
      username TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* Existing users table keessatti
     columns yoo hin jirre dabali */

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS telegram_id BIGINT
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name TEXT
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username TEXT
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
  `);

  /*
    users.id irratti default hin jirre yoo ta'e
    sequence uumnee sirreessina.
  */

  await pool.query(`
    DO $$
    BEGIN

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'id'
        AND column_default IS NULL
      ) THEN

        CREATE SEQUENCE IF NOT EXISTS users_id_seq;

        PERFORM setval(
          'users_id_seq',
          COALESCE(
            (SELECT MAX(id) FROM users),
            0
          ) + 1,
          false
        );

        ALTER TABLE users
        ALTER COLUMN id
        SET DEFAULT nextval('users_id_seq');

        ALTER SEQUENCE users_id_seq
        OWNED BY users.id;

      END IF;

    END
    $$;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    users_telegram_id_unique
    ON users (telegram_id)
  `);

  /* EXAMS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      code VARCHAR(20) UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subject TEXT,
      duration INTEGER DEFAULT 30,
      teacher_id BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* QUESTIONS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER
        REFERENCES exams(id)
        ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      points INTEGER DEFAULT 1
    )
  `);

  /* OPTIONS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS options (
      id SERIAL PRIMARY KEY,
      question_id INTEGER
        REFERENCES questions(id)
        ON DELETE CASCADE,
      option_key VARCHAR(5) NOT NULL,
      option_text TEXT NOT NULL
    )
  `);

  /* ATTEMPTS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attempts (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER
        REFERENCES exams(id)
        ON DELETE CASCADE,
      student_id BIGINT NOT NULL,
      student_name TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      percentage NUMERIC DEFAULT 0,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP
    )
  `);

  /* ANSWERS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers (
      id SERIAL PRIMARY KEY,
      attempt_id INTEGER
        REFERENCES attempts(id)
        ON DELETE CASCADE,
      question_id INTEGER
        REFERENCES questions(id)
        ON DELETE CASCADE,
      answer TEXT,
      is_correct BOOLEAN DEFAULT FALSE
    )
  `);

  console.log("✅ Database migrations completed.");
}

/* =========================
   SESSION
========================= */

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {});
  }

  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.delete(userId);
}

/* =========================
   KEYBOARD
========================= */

function mainKeyboard() {
  return {
    keyboard: [
      [
        { text: "📝 Qormaata Uumi" },
        { text: "📖 Qormaata Fudhadhu" }
      ],
      [
        { text: "📊 Qabxii Koo" },
        { text: "👨‍🏫 Qormaata Koo" }
      ],
      [
        { text: "📚 Barnoota" },
        { text: "👤 Profile" }
      ],
      [
        { text: "💼 Hojiiwwan Biroo" }
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

/* =========================
   SEND MESSAGE
========================= */

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

/* =========================
   SAVE USER
========================= */

async function saveUser(msg) {
  const user = msg.from;

  await pool.query(
    `
    INSERT INTO users
      (telegram_id, first_name, username)
    VALUES
      ($1, $2, $3)

    ON CONFLICT (telegram_id)

    DO UPDATE SET
      first_name = EXCLUDED.first_name,
      username = EXCLUDED.username
    `,
    [
      user.id,
      user.first_name || "",
      user.username || ""
    ]
  );
}

/* =========================
   START
========================= */

async function handleStart(msg) {
  const chatId = msg.chat.id;

  await saveUser(msg);

  await sendMessage(
    chatId,
    `👋 Baga nagaan dhuftan!

🤖 *Waamara* — Bot Barnootaa fi Qormaataa

Tajaajiloota armaan gadii fayyadami:

📝 Qormaata Uumi
📖 Qormaata Fudhadhu
📊 Qabxii Koo
👨‍🏫 Qormaata Koo
📚 Barnoota
👤 Profile

👇 Menu keessaa filadhu.`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   CREATE EXAM
========================= */

async function startCreateExam(chatId, userId) {
  const session = getSession(userId);

  session.action = "create_exam";
  session.step = "title";

  await sendMessage(
    chatId,
    `📝 *Qormaata Uumuu*

Mee maqaa qormaataa barreessi.

Fakkeenya:
*Qormaata Herregaa Kutaa 8*`,
    {
      parse_mode: "Markdown"
    }
  );
}

/* =========================
   TAKE EXAM
========================= */

async function startTakeExam(chatId, userId) {
  const session = getSession(userId);

  session.action = "take_exam";
  session.step = "code";

  await sendMessage(
    chatId,
    `📖 *Qormaata Fudhachuu*

Mee *Code* qormaataa galchi.

Fakkeenya:
*ABC123*`,
    {
      parse_mode: "Markdown"
    }
  );
}

/* =========================
   PROFILE
========================= */

async function showProfile(chatId, userId) {
  const result = await pool.query(
    `
    SELECT
      first_name,
      username,
      telegram_id,
      created_at
    FROM users
    WHERE telegram_id = $1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    await sendMessage(
      chatId,
      "❌ Profile hin argamne."
    );
    return;
  }

  const user = result.rows[0];

  await sendMessage(
    chatId,
    `👤 *Profile*

Maqaa: ${user.first_name || "-"}
Username: ${
      user.username
        ? "@" + user.username
        : "-"
    }

Telegram ID: ${user.telegram_id}

Galmee:
${user.created_at
  ? new Date(user.created_at).toLocaleDateString()
  : "-"}`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   SCORE
========================= */

async function showMyScores(chatId, userId) {
  const result = await pool.query(
    `
    SELECT
      e.title,
      e.code,
      a.score,
      a.total,
      a.percentage,
      a.finished_at
    FROM attempts a
    JOIN exams e
      ON e.id = a.exam_id
    WHERE a.student_id = $1
    ORDER BY a.finished_at DESC NULLS LAST
    LIMIT 10
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    await sendMessage(
      chatId,
      `📊 *Qabxii Koo*

Ammaaf qormaata xumurame hin qabdu.`,
      {
        parse_mode: "Markdown",
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  let text = "📊 *Qabxii Koo*\n\n";

  result.rows.forEach((row, index) => {
    text +=
      `${index + 1}. ${row.title}\n` +
      `Code: ${row.code}\n` +
      `Qabxii: ${row.score}/${row.total}\n` +
      `Dhibbeentaa: ${row.percentage}%\n\n`;
  });

  await sendMessage(
    chatId,
    text,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   MY EXAMS
========================= */

async function showMyExams(chatId, userId) {
  const result = await pool.query(
    `
    SELECT
      id,
      code,
      title,
      subject,
      duration,
      created_at
    FROM exams
    WHERE teacher_id = $1
    ORDER BY created_at DESC
    LIMIT 20
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    await sendMessage(
      chatId,
      `👨‍🏫 *Qormaata Koo*

Ati hanga ammaatti qormaata hin uumne.`,
      {
        parse_mode: "Markdown",
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  let text = "👨‍🏫 *Qormaata Koo*\n\n";

  result.rows.forEach((exam, index) => {
    text +=
      `${index + 1}. ${exam.title}\n` +
      `Code: *${exam.code}*\n` +
      `Mata-duree: ${exam.subject || "-"}\n` +
      `Yeroo: ${exam.duration} daqiiqaa\n\n`;
  });

  await sendMessage(
    chatId,
    text,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   EDUCATION
========================= */

async function showEducation(chatId) {
  await sendMessage(
    chatId,
    `📚 *Barnoota*

Waamara keessatti tajaajiloota barnootaa:

📖 Qormaata
📝 Gaaffii fi Deebii
📊 Qabxii
👨‍🏫 Qormaata Barsiisaa
🎓 Barnoota Barattootaa

Tajaajiloota dabalataa gara fuulduraatti ni dabalamu.`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   OTHER SERVICES
========================= */

async function showOtherServices(chatId) {
  await sendMessage(
    chatId,
    `💼 *Hojiiwwan Biroo*

Tajaajiloota gara fuulduraatti:

🔹 Galmee barattootaa
🔹 Attendance
🔹 Assignment
🔹 Result management
🔹 Share exam
🔹 Teacher tools
🔹 Student tools`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   CREATE EXAM STEP
========================= */

async function processCreateExam(
  msg,
  session
) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();

  if (session.step === "title") {
    session.title = text;
    session.step = "subject";

    await sendMessage(
      chatId,
      `📚 Mata-duree qormaataa galchi.

Fakkeenya:
*Herrega*`,
      {
        parse_mode: "Markdown"
      }
    );

    return;
  }

  if (session.step === "subject") {
    session.subject = text;
    session.step = "duration";

    await sendMessage(
      chatId,
      `⏱️ Yeroo qormaataa meeqa?

Fakkeenya:
*30*

daqiiqaa keessatti barreessi.`,
      {
        parse_mode: "Markdown"
      }
    );

    return;
  }

  if (session.step === "duration") {
    const duration = parseInt(text);

    if (!Number.isInteger(duration) || duration <= 0) {
      await sendMessage(
        chatId,
        "❌ Yeroo sirrii galchi. Fakkeenya: 30"
      );
      return;
    }

    session.duration = duration;

    const code =
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    const result = await pool.query(
      `
      INSERT INTO exams
        (code, title, subject, duration, teacher_id)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING id, code
      `,
      [
        code,
        session.title,
        session.subject,
        session.duration,
        userId
      ]
    );

    const exam = result.rows[0];

    clearSession(userId);

    await sendMessage(
      chatId,
      `✅ *Qormaanni uumameera!*

📝 Maqaa:
${session.title}

📚 Mata-duree:
${session.subject}

⏱️ Yeroo:
${session.duration} daqiiqaa

🔑 *Exam Code:*
\`${exam.code}\`

👉 Code kana barattootaaf qoodi.

⚠️ Gaaffilee qormaataa dabaluu kutaa itti aanu keessatti ni hojjetama.`,
      {
        parse_mode: "Markdown",
        reply_markup: mainKeyboard()
      }
    );
  }
}

/* =========================
   TAKE EXAM STEP
========================= */

async function processTakeExam(
  msg,
  session
) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim().toUpperCase();

  if (session.step === "code") {
    const result = await pool.query(
      `
      SELECT
        id,
        code,
        title,
        subject,
        duration
      FROM exams
      WHERE code = $1
      `,
      [text]
    );

    if (result.rows.length === 0) {
      await sendMessage(
        chatId,
        `❌ Qormaata Code *${text}* jedhu hin argamne.

Code sirrii galchi.`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    const exam = result.rows[0];

    const questions = await pool.query(
      `
      SELECT
        id,
        question_text,
        correct_answer,
        points
      FROM questions
      WHERE exam_id = $1
      ORDER BY id ASC
      `,
      [exam.id]
    );

    if (questions.rows.length === 0) {
      await sendMessage(
        chatId,
        `⚠️ Qormaanni kun ammaaf gaaffii hin qabu.

Barsiisaan gaaffilee dabaluu qaba.`,
        {
          reply_markup: mainKeyboard()
        }
      );

      return;
    }

    const attempt = await pool.query(
      `
      INSERT INTO attempts
        (
          exam_id,
          student_id,
          student_name,
          total
        )
      VALUES
        ($1, $2, $3, $4)
      RETURNING id
      `,
      [
        exam.id,
        userId,
        msg.from.first_name || "Student",
        questions.rows.reduce(
          (sum, q) => sum + (q.points || 1),
          0
        )
      ]
    );

    session.action = "answer_exam";
    session.examId = exam.id;
    session.attemptId = attempt.rows[0].id;
    session.questions = questions.rows;
    session.questionIndex = 0;
    session.score = 0;

    await sendQuestion(
      chatId,
      session
    );
  }
}

/* =========================
   SEND QUESTION
========================= */

async function sendQuestion(
  chatId,
  session
) {
  const q =
    session.questions[
      session.questionIndex
    ];

  if (!q) {
    await finishAttempt(
      chatId,
      session
    );

    return;
  }

  const options = await pool.query(
    `
    SELECT
      option_key,
      option_text
    FROM options
    WHERE question_id = $1
    ORDER BY id ASC
    `,
    [q.id]
  );

  let text =
    `📝 *Gaaffii ${
      session.questionIndex + 1
    }/${session.questions.length}*\n\n`;

  text += q.question_text + "\n\n";

  if (options.rows.length > 0) {
    options.rows.forEach((option) => {
      text +=
        `${option.option_key}. ${option.option_text}\n`;
    });
  }

  text +=
    `\n✍️ Deebii kee barreessi.`;

  await sendMessage(
    chatId,
    text,
    {
      parse_mode: "Markdown"
    }
  );
}

/* =========================
   PROCESS ANSWER
========================= */

async function processAnswer(
  msg,
  session
) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  const q =
    session.questions[
      session.questionIndex
    ];

  if (!q) {
    await finishAttempt(
      chatId,
      session
    );

    return;
  }

  const isCorrect =
    text.toLowerCase() ===
    q.correct_answer.toLowerCase();

  if (isCorrect) {
    session.score += q.points || 1;
  }

  await pool.query(
    `
    INSERT INTO answers
      (
        attempt_id,
        question_id,
        answer,
        is_correct
      )
    VALUES
      ($1, $2, $3, $4)
    `,
    [
      session.attemptId,
      q.id,
      text,
      isCorrect
    ]
  );

  session.questionIndex++;

  if (isCorrect) {
    await sendMessage(
      chatId,
      "✅ Deebiin kee sirrii dha!"
    );
  } else {
    await sendMessage(
      chatId,
      `❌ Deebiin kee sirrii miti.\n\nDeebii sirrii: ${q.correct_answer}`
    );
  }

  await sendQuestion(
    chatId,
    session
  );
}

/* =========================
   FINISH ATTEMPT
========================= */

async function finishAttempt(
  chatId,
  session
) {
  const total = session.questions.reduce(
    (sum, q) => sum + (q.points || 1),
    0
  );

  const percentage =
    total > 0
      ? ((session.score / total) * 100).toFixed(2)
      : 0;

  await pool.query(
    `
    UPDATE attempts
    SET
      score = $1,
      percentage = $2,
      finished_at = CURRENT_TIMESTAMP
    WHERE id = $3
    `,
    [
      session.score,
      percentage,
      session.attemptId
    ]
  );

  await sendMessage(
    chatId,
    `🎉 *Qormaata xumurtee jirta!*

📊 Qabxii:
${session.score}/${total}

📈 Dhibbeentaa:
${percentage}%

Galmee kee keessatti kuufameera.`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );

  /*
    Session ID sirrii fayyadamuuf
    chatId fayyadamna.
  */
  clearSession(chatId);
}

/* =========================
   MESSAGE HANDLER
========================= */

async function handleMessage(msg) {
  if (!msg || !msg.chat || !msg.from) {
    return;
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text =
    typeof msg.text === "string"
      ? msg.text.trim()
      : "";

  try {
    await saveUser(msg);

    /* START */

    if (
      text === "/start" ||
      text.toLowerCase() === "start"
    ) {
      clearSession(userId);
      await handleStart(msg);
      return;
    }

    /* MENU */

    if (
      text === "/menu" ||
      text === "Menu"
    ) {
      clearSession(userId);

      await sendMessage(
        chatId,
        "🏠 Menu Guddaa",
        {
          reply_markup: mainKeyboard()
        }
      );

      return;
    }

    /* CREATE EXAM */

    if (text === "📝 Qormaata Uumi") {
      clearSession(userId);

      await startCreateExam(
        chatId,
        userId
      );

      return;
    }

    /* TAKE EXAM */

    if (text === "📖 Qormaata Fudhadhu") {
      clearSession(userId);

      await startTakeExam(
        chatId,
        userId
      );

      return;
    }

    /* SCORE */

    if (text === "📊 Qabxii Koo") {
      clearSession(userId);

      await showMyScores(
        chatId,
        userId
      );

      return;
    }

    /* MY EXAMS */

    if (text === "👨‍🏫 Qormaata Koo") {
      clearSession(userId);

      await showMyExams(
        chatId,
        userId
      );

      return;
    }

    /* EDUCATION */

    if (text === "📚 Barnoota") {
      clearSession(userId);

      await showEducation(
        chatId
      );

      return;
    }

    /* PROFILE */

    if (text === "👤 Profile") {
      clearSession(userId);

      await showProfile(
        chatId,
        userId
      );

      return;
    }

    /* OTHER */

    if (text === "💼 Hojiiwwan Biroo") {
      clearSession(userId);

      await showOtherServices(
        chatId
      );

      return;
    }

    /* SESSION */

    const session = getSession(userId);

    if (
      session.action ===
      "create_exam"
    ) {
      await processCreateExam(
        msg,
        session
      );

      return;
    }

    if (
      session.action ===
      "take_exam"
    ) {
      await processTakeExam(
        msg,
        session
      );

      return;
    }

    if (
      session.action ===
      "answer_exam"
    ) {
      await processAnswer(
        msg,
        session
      );

      return;
    }

    await sendMessage(
      chatId,
      `Ani si hubadheera.

👇 Mee menu keessaa filadhu.`,
      {
        reply_markup: mainKeyboard()
      }
    );

  } catch (error) {
    console.error(
      "❌ Message error:",
      error.message
    );

    await sendMessage(
      chatId,
      "❌ Rakkoon tokko uumameera. Mee irra deebi'i."
    ).catch(() => {});
  }
}

/* =========================
   WEBHOOK
========================= */

app.post(
  "/telegram/webhook",
  async (req, res) => {

    /*
      Telegram deebii saffisaa argata.
    */
    res.sendStatus(200);

    try {
      await handleMessage(
        req.body.message
      );
    } catch (error) {
      console.error(
        "❌ Webhook error:",
        error.message
      );
    }
  }
);

/* =========================
   SET WEBHOOK
========================= */

async function setupWebhook() {
  const renderUrl =
    process.env.RENDER_EXTERNAL_URL;

  if (!renderUrl) {
    console.log(
      "⚠️ RENDER_EXTERNAL_URL hin argamne."
    );

    return;
  }

  const webhookUrl =
    `${renderUrl}/telegram/webhook`;

  try {

    await telegram(
      "deleteWebhook",
      {
        drop_pending_updates: false
      }
    );

    const result =
      await telegram(
        "setWebhook",
        {
          url: webhookUrl
        }
      );

    console.log(
      "✅ Telegram webhook set:",
      webhookUrl
    );

    console.log(
      "Telegram response:",
      result
    );

  } catch (error) {
    console.error(
      "❌ Webhook error:",
      error.message
    );
  }
}

/* =========================
   BOT COMMANDS
========================= */

async function setupCommands() {
  try {

    await telegram(
      "setMyCommands",
      {
        commands: [
          {
            command: "start",
            description: "Waamara jalqabi"
          },
          {
            command: "menu",
            description: "Menu guddaa bani"
          }
        ]
      }
    );

    console.log(
      "✅ Telegram commands installed."
    );

  } catch (error) {
    console.error(
      "❌ Command error:",
      error.message
    );
  }
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send(
    "🤖 Waamara Telegram Bot is online."
  );
});

app.get("/health", async (req, res) => {
  try {

    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      app: "Waamara Telegram Bot",
      database: "connected"
    });

  } catch (error) {

    res.status(500).json({
      status: "error",
      database: "disconnected",
      message: error.message
    });
  }
});

/* =========================
   START SERVER
========================= */

async function startServer() {
  try {

    await initDatabase();

    app.listen(
      PORT,
      "0.0.0.0",
      async () => {

        console.log(
          `🚀 Waamara server running on port ${PORT}`
        );

        await setupCommands();

        await setupWebhook();
      }
    );

  } catch (error) {

    console.error(
      "❌ Server startup error:",
      error
    );

    process.exit(1);
  }
}

startServer();
