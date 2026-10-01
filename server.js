// ======================================================
// WAAMARA TELEGRAM BOT
// Qormaata Uumuu • Qormaata Fudhachuu • Qabxii
// PostgreSQL + Render + Telegram Webhook
// ======================================================

const express = require("express");
const https = require("https");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

const RENDER_URL =
  process.env.RENDER_EXTERNAL_URL ||
  "https://waamara-bot.onrender.com";

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN hin argamne.");
}

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL hin argamne.");
}

// ======================================================
// POSTGRESQL
// ======================================================

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ======================================================
// EXPRESS ROUTES
// ======================================================

app.get("/", (req, res) => {
  res.send("🤖 Waamara Telegram Bot online.");
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      bot: "Waamara",
      database: "connected"
    });
  } catch (error) {
    console.error("Health error:", error);

    res.status(500).json({
      ok: false,
      bot: "Waamara",
      database: "error"
    });
  }
});

// ======================================================
// TELEGRAM API
// ======================================================

function telegram(method, data = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);

    const options = {
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };

    const request = https.request(options, response => {
      let result = "";

      response.on("data", chunk => {
        result += chunk;
      });

      response.on("end", () => {
        try {
          const json = JSON.parse(result);

          if (!json.ok) {
            reject(new Error(json.description || "Telegram API error"));
            return;
          }

          resolve(json.result);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);

    request.write(body);
    request.end();
  });
}

// ======================================================
// SEND MESSAGE
// ======================================================

async function sendMessage(chatId, text, replyMarkup = null) {
  const data = {
    chat_id: chatId,
    text
  };

  if (replyMarkup) {
    data.reply_markup = replyMarkup;
  }

  return telegram("sendMessage", data);
}

// ======================================================
// MAIN KEYBOARD
// ======================================================

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

// ======================================================
// INLINE OPTIONS
// ======================================================

function questionKeyboard(options) {
  return {
    inline_keyboard: options.map(option => [
      {
        text: `${option.option_key}. ${option.option_text}`,
        callback_data: `answer:${option.option_key}`
      }
    ])
  };
}

// ======================================================
// DATABASE TABLES
// ======================================================

async function createTables() {

  // USERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE,
      first_name TEXT,
      username TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // EXAMS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      code VARCHAR(20) UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subject TEXT,
      duration INTEGER DEFAULT 30,
      teacher_id BIGINT,
      starts_at TIMESTAMP,
      ends_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // QUESTIONS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      points INTEGER DEFAULT 1
    )
  `);

  // OPTIONS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS options (
      id SERIAL PRIMARY KEY,
      question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
      option_key VARCHAR(5) NOT NULL,
      option_text TEXT NOT NULL
    )
  `);

  // ATTEMPTS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attempts (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
      student_id BIGINT NOT NULL,
      student_name TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      percentage NUMERIC DEFAULT 0,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP,
      expires_at TIMESTAMP
    )
  `);

  // ANSWERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers (
      id SERIAL PRIMARY KEY,
      attempt_id INTEGER REFERENCES attempts(id) ON DELETE CASCADE,
      question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
      answer TEXT,
      is_correct BOOLEAN DEFAULT FALSE
    )
  `);

  console.log("✅ Tables checked.");
}

// ======================================================
// DATABASE MIGRATIONS
// ======================================================

async function runMigrations() {

  console.log("🔧 Database migrations started...");

  // ----------------------------------------------------
  // EXAMS
  // ----------------------------------------------------

  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS teacher_id BIGINT
  `);

  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 30
  `);

  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP
  `);

  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP
  `);

  // ----------------------------------------------------
  // ATTEMPTS
  // ----------------------------------------------------

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
  `);

  // ----------------------------------------------------
  // USERS ID FIX
  // ----------------------------------------------------

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
    $$
  `);

  console.log("✅ Database migrations completed.");
}

// ======================================================
// INIT DATABASE
// ======================================================

async function initDatabase() {

  await createTables();

  await runMigrations();

  console.log("✅ Database initialized.");
}

// ======================================================
// SAVE USER
// ======================================================

async function saveUser(msg) {

  const user = msg.from;

  if (!user) return;

  await pool.query(`
    INSERT INTO users
      (telegram_id, first_name, username)
    VALUES
      ($1, $2, $3)

    ON CONFLICT (telegram_id)

    DO UPDATE SET
      first_name = EXCLUDED.first_name,
      username = EXCLUDED.username
  `, [
    user.id,
    user.first_name || "",
    user.username || ""
  ]);
}

// ======================================================
// SESSIONS
// ======================================================

const sessions = new Map();

// ======================================================
// GENERATE EXAM CODE
// ======================================================

function generateExamCode() {

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

// ======================================================
// CREATE EXAM
// ======================================================

async function startCreateExam(chatId) {

  sessions.set(chatId, {
    type: "create_exam",
    step: "title"
  });

  await sendMessage(
    chatId,
    "📝 QORMAATA UUMUU\n\n" +
    "Mata-duree qormaataa barreessi.\n\n" +
    "Fakkeenya:\n" +
    "Qormaata Herregaa Kutaa 10",
    mainKeyboard()
  );
}

// ======================================================
// PROCESS CREATE EXAM
// ======================================================

async function processCreateExam(chatId, text, msg) {

  const session = sessions.get(chatId);

  if (!session) return;

  // ----------------------------------------------------
  // TITLE
  // ----------------------------------------------------

  if (session.step === "title") {

    if (text.length < 2) {

      await sendMessage(
        chatId,
        "❌ Maaloo mata-duree sirrii barreessi."
      );

      return;
    }

    session.title = text;
    session.step = "subject";

    await sendMessage(
      chatId,
      "📚 Maaloo barnoota / subject qormaataa barreessi.\n\n" +
      "Fakkeenya: Herrega"
    );

    return;
  }

  // ----------------------------------------------------
  // SUBJECT
  // ----------------------------------------------------

  if (session.step === "subject") {

    session.subject = text;
    session.step = "duration";

    await sendMessage(
      chatId,
      "⏱️ Yeroo qormaataa meeqa daqiiqaa?\n\n" +
      "Fakkeenya:\n" +
      "30\n\n" +
      "Daqqiiqaa 1 hanga 1440 galchi."
    );

    return;
  }

  // ----------------------------------------------------
  // DURATION
  // ----------------------------------------------------

  if (session.step === "duration") {

    const duration = Number(text);

    if (
      !Number.isInteger(duration) ||
      duration <= 0 ||
      duration > 1440
    ) {

      await sendMessage(
        chatId,
        "❌ Yeroon sirrii miti.\n\n" +
        "Lakkoofsa daqiiqaa 1 hanga 1440 galchi.\n\n" +
        "Fakkeenya: 30"
      );

      return;
    }

    const code = generateExamCode();

    const result = await pool.query(`
      INSERT INTO exams
        (
          code,
          title,
          subject,
          duration,
          teacher_id,
          starts_at,
          ends_at
        )

      VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          CURRENT_TIMESTAMP,
          NULL
        )

      RETURNING
        id,
        code,
        title,
        subject,
        duration
    `, [
      code,
      session.title,
      session.subject,
      duration,
      msg.from.id
    ]);

    const exam = result.rows[0];

    sessions.delete(chatId);

    await sendMessage(
      chatId,

      "✅ QORMAATAAN UUMAMEERA!\n\n" +

      `📚 Mata-duree: ${exam.title}\n` +
      `📖 Barnoota: ${exam.subject}\n` +
      `⏱️ Yeroo: ${exam.duration} daqiiqaa\n\n` +

      `🔑 Koodii Qormaataa:\n` +
      `${exam.code}\n\n` +

      "⚠️ Amma gaaffilee qormaataa itti dabali.\n" +
      "Qormaata fudhachuuf barattoonni koodii kana fayyadamu.",
      mainKeyboard()
    );

    return;
  }
}

// ======================================================
// TAKE EXAM
// ======================================================

async function startTakeExam(chatId) {

  sessions.set(chatId, {
    type: "take_exam",
    step: "code"
  });

  await sendMessage(
    chatId,
    "📖 QORMAATA FUDHADHU\n\n" +
    "🔑 Koodii qormaataa galchi.\n\n" +
    "Fakkeenya:\n" +
    "AB12CD"
  );
}

// ======================================================
// PROCESS TAKE EXAM
// ======================================================

async function processTakeExam(chatId, text, msg) {

  const session = sessions.get(chatId);

  if (!session) return;

  if (session.step === "code") {

    const code = text.trim().toUpperCase();

    const result = await pool.query(`
      SELECT
        id,
        code,
        title,
        subject,
        duration,
        starts_at,
        ends_at
      FROM exams
      WHERE code = $1
    `, [code]);

    if (result.rows.length === 0) {

      await sendMessage(
        chatId,
        "❌ Qormaata koodii kanaan argame hin jiru.\n\n" +
        "🔑 Koodii sirrii galchi."
      );

      return;
    }

    const exam = result.rows[0];

    const questionResult = await pool.query(`
      SELECT
        id,
        question_text,
        correct_answer,
        points
      FROM questions
      WHERE exam_id = $1
      ORDER BY id
    `, [exam.id]);

    if (questionResult.rows.length === 0) {

      await sendMessage(
        chatId,
        "⚠️ Qormaanni kun amma gaaffii tokko illee hin qabu.\n\n" +
        "👨‍🏫 Barsiisaan gaaffilee itti dabalu qaba."
      );

      sessions.delete(chatId);

      return;
    }

    const attemptResult = await pool.query(`
      INSERT INTO attempts
        (
          exam_id,
          student_id,
          student_name,
          total,
          expires_at
        )

      VALUES
        (
          $1,
          $2,
          $3,
          $4,
          CURRENT_TIMESTAMP + ($5 * INTERVAL '1 minute')
        )

      RETURNING
        id,
        expires_at
    `, [
      exam.id,
      msg.from.id,
      msg.from.first_name || "Barataa",
      questionResult.rows.length,
      exam.duration
    ]);

    const attempt = attemptResult.rows[0];

    sessions.set(chatId, {
      type: "answer_exam",
      examId: exam.id,
      examCode: exam.code,
      attemptId: attempt.id,
      questions: questionResult.rows,
      index: 0,
      expiresAt: new Date(attempt.expires_at).getTime()
    });

    await sendMessage(
      chatId,
      "✅ Qormaata jalqabdeetta.\n\n" +
      `📚 ${exam.title}\n` +
      `⏱️ Yeroo: ${exam.duration} daqiiqaa\n\n` +
      "Qormaata jalqabuuf qophii ta'i."
    );

    await sendQuestion(chatId);

    return;
  }
}

// ======================================================
// FORMAT TIME
// ======================================================

function formatRemaining(milliseconds) {

  const seconds = Math.max(
    0,
    Math.floor(milliseconds / 1000)
  );

  const minutes = Math.floor(seconds / 60);

  const secs = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// ======================================================
// SEND QUESTION
// ======================================================

async function sendQuestion(chatId) {

  const session = sessions.get(chatId);

  if (!session) return;

  // ----------------------------------------------------
  // TIME CHECK
  // ----------------------------------------------------

  if (
    session.expiresAt &&
    Date.now() >= session.expiresAt
  ) {

    await finishAttempt(
      chatId,
      session,
      true
    );

    return;
  }

  // ----------------------------------------------------
  // ALL QUESTIONS
  // ----------------------------------------------------

  if (
    session.index >= session.questions.length
  ) {

    await finishAttempt(
      chatId,
      session,
      false
    );

    return;
  }

  const question =
    session.questions[session.index];

  const optionResult = await pool.query(`
    SELECT
      id,
      option_key,
      option_text
    FROM options
    WHERE question_id = $1
    ORDER BY id
  `, [question.id]);

  const options = optionResult.rows;

  const remaining =
    formatRemaining(
      session.expiresAt - Date.now()
    );

  let message =
    `📝 GAAFFII ${session.index + 1}/${session.questions.length}\n\n`;

  message +=
    `⏱️ Yeroo hafe: ${remaining}\n\n`;

  message +=
    `${question.question_text}\n\n`;

  if (options.length > 0) {

    for (const option of options) {

      message +=
        `${option.option_key}. ${option.option_text}\n`;
    }

    message +=
      "\n👇 Deebii kee filadhu.";
  } else {

    message +=
      "\n✍️ Deebii kee barreessi.";
  }

  if (options.length > 0) {

    await sendMessage(
      chatId,
      message,
      questionKeyboard(options)
    );

  } else {

    await sendMessage(
      chatId,
      message
    );
  }
}

// ======================================================
// PROCESS ANSWER
// ======================================================

async function processAnswer(chatId, text) {

  const session = sessions.get(chatId);

  if (!session) return;

  // ----------------------------------------------------
  // TIME EXPIRED
  // ----------------------------------------------------

  if (
    session.expiresAt &&
    Date.now() >= session.expiresAt
  ) {

    await finishAttempt(
      chatId,
      session,
      true
    );

    return;
  }

  const question =
    session.questions[session.index];

  if (!question) {

    await finishAttempt(
      chatId,
      session,
      false
    );

    return;
  }

  const answer =
    text.trim();

  const correct =
    String(question.correct_answer)
      .trim()
      .toLowerCase();

  const userAnswer =
    answer.toLowerCase();

  const isCorrect =
    userAnswer === correct;

  await pool.query(`
    INSERT INTO answers
      (
        attempt_id,
        question_id,
        answer,
        is_correct
      )

    VALUES
      ($1, $2, $3, $4)
  `, [
    session.attemptId,
    question.id,
    answer,
    isCorrect
  ]);

  session.index++;

  if (
    session.index >= session.questions.length
  ) {

    await finishAttempt(
      chatId,
      session,
      false
    );

    return;
  }

  await sendQuestion(chatId);
}

// ======================================================
// CALLBACK ANSWER
// ======================================================

async function processCallback(callback) {

  const chatId =
    callback.message.chat.id;

  const data =
    callback.data || "";

  if (!data.startsWith("answer:")) {
    return;
  }

  const answer =
    data.replace("answer:", "").trim();

  try {

    await telegram(
      "answerCallbackQuery",
      {
        callback_query_id:
          callback.id
      }
    );

  } catch (error) {
    console.error(
      "Callback answer error:",
      error.message
    );
  }

  await processAnswer(
    chatId,
    answer
  );
}

// ======================================================
// FINISH ATTEMPT
// ======================================================

async function finishAttempt(
  chatId,
  session,
  expired = false
) {

  if (!session || !session.attemptId) {
    sessions.delete(chatId);
    return;
  }

  try {

    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE is_correct = TRUE
        ) AS correct_count
      FROM answers
      WHERE attempt_id = $1
    `, [
      session.attemptId
    ]);

    const correctCount =
      Number(
        result.rows[0].correct_count || 0
      );

    const total =
      session.questions.length;

    const percentage =
      total > 0
        ? (correctCount / total) * 100
        : 0;

    await pool.query(`
      UPDATE attempts

      SET
        score = $1,
        total = $2,
        percentage = $3,
        finished_at = CURRENT_TIMESTAMP

      WHERE id = $4
        AND finished_at IS NULL
    `, [
      correctCount,
      total,
      percentage.toFixed(2),
      session.attemptId
    ]);

    sessions.delete(chatId);

    if (expired) {

      await sendMessage(
        chatId,

        "⏰ YEROON QORMAATAA DHUMEEERA!\n\n" +

        `📊 Qabxii: ${correctCount}/${total}\n` +
        `📈 Dhibbeentaa: ${percentage.toFixed(2)}%`,
        mainKeyboard()
      );

    } else {

      await sendMessage(
        chatId,

        "🎉 QORMAATA XUMURTE!\n\n" +

        `✅ Sirrii: ${correctCount}\n` +
        `❌ Dogoggora: ${total - correctCount}\n` +
        `📊 Qabxii: ${correctCount}/${total}\n` +
        `📈 Dhibbeentaa: ${percentage.toFixed(2)}%`,
        mainKeyboard()
      );
    }

  } catch (error) {

    console.error(
      "Finish attempt error:",
      error
    );

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "❌ Qabxii galmeessuu irratti rakkoon uumame.",
      mainKeyboard()
    );
  }
}

// ======================================================
// SHOW MY SCORE
// ======================================================

async function showMyScore(chatId, msg) {

  const result = await pool.query(`
    SELECT
      a.score,
      a.total,
      a.percentage,
      a.finished_at,
      e.title,
      e.subject
    FROM attempts a

    JOIN exams e
      ON e.id = a.exam_id

    WHERE a.student_id = $1
      AND a.finished_at IS NOT NULL

    ORDER BY a.finished_at DESC

    LIMIT 10
  `, [
    msg.from.id
  ]);

  if (result.rows.length === 0) {

    await sendMessage(
      chatId,
      "📊 Qabxiiwwan kee ammaaf hin argamne.",
      mainKeyboard()
    );

    return;
  }

  let text =
    "📊 QABXII KOO\n\n";

  result.rows.forEach((row, index) => {

    text +=
      `${index + 1}. ${row.title}\n`;

    text +=
      `📚 ${row.subject || "-"}\n`;

    text +=
      `🎯 ${row.score}/${row.total}\n`;

    text +=
      `📈 ${Number(row.percentage).toFixed(2)}%\n\n`;
  });

  await sendMessage(
    chatId,
    text,
    mainKeyboard()
  );
}

// ======================================================
// TEACHER EXAMS
// ======================================================

async function showTeacherExams(chatId, msg) {

  const result = await pool.query(`
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
  `, [
    msg.from.id
  ]);

  if (result.rows.length === 0) {

    await sendMessage(
      chatId,
      "👨‍🏫 Qormaata ati uumte ammaaf hin jiru.",
      mainKeyboard()
    );

    return;
  }

  let text =
    "👨‍🏫 QORMAATA KOO\n\n";

  for (const exam of result.rows) {

    text +=
      `📚 ${exam.title}\n`;

    text +=
      `📖 ${exam.subject || "-"}\n`;

    text +=
      `🔑 Koodii: ${exam.code}\n`;

    text +=
      `⏱️ ${exam.duration} daqiiqaa\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    mainKeyboard()
  );
}

// ======================================================
// PROFILE
// ======================================================

async function showProfile(chatId, msg) {

  const result = await pool.query(`
    SELECT
      first_name,
      username,
      telegram_id,
      created_at
    FROM users
    WHERE telegram_id = $1
  `, [
    msg.from.id
  ]);

  if (result.rows.length === 0) {

    await sendMessage(
      chatId,
      "👤 Profile kee argachuu hin dandeenye.",
      mainKeyboard()
    );

    return;
  }

  const user =
    result.rows[0];

  await sendMessage(
    chatId,

    "👤 PROFILE KEE\n\n" +

    `👤 Maqaa: ${user.first_name || "-"}\n` +
    `🔗 Username: @${user.username || "-"}\n` +
    `🆔 Telegram ID: ${user.telegram_id}`,

    mainKeyboard()
  );
}

// ======================================================
// LEARNING
// ======================================================

async function showLearning(chatId) {

  await sendMessage(
    chatId,

    "📚 BARNOOTA\n\n" +

    "Waamara keessatti tajaajiloota barnootaa hedduu dabaluu dandeenya.\n\n" +

    "📝 Qormaata\n" +
    "📖 Qormaata Fudhachuu\n" +
    "📊 Qabxii\n" +
    "🎓 Barnoota\n\n" +

    "Tajaajiloota dabalataa yeroo itti aanu keessatti ni dabalamu.",

    mainKeyboard()
  );
}

// ======================================================
// OTHER SERVICES
// ======================================================

async function showOtherServices(chatId) {

  await sendMessage(
    chatId,

    "💼 HOJIIWWAN BIROO\n\n" +

    "🤖 Waamara Bot\n" +
    "📝 Qormaata Uumuu\n" +
    "📖 Qormaata Fudhachuu\n" +
    "📊 Qabxii Ilaaluu\n" +
    "📚 Barnoota\n\n" +

    "Tajaajila dabalataa itti fufsiifna.",

    mainKeyboard()
  );
}

// ======================================================
// HANDLE TEXT MESSAGE
// ======================================================

async function handleMessage(msg) {

  if (!msg || !msg.chat) return;

  const chatId =
    msg.chat.id;

  const text =
    String(msg.text || "").trim();

  if (!text) return;

  await saveUser(msg);

  // ----------------------------------------------------
  // START
  // ----------------------------------------------------

  if (text === "/start") {

    sessions.delete(chatId);

    await sendMessage(
      chatId,

      "👋 BAGA NAGAA DHUFTAN!\n\n" +

      "🤖 Ani Waamara dha.\n" +
      "Barnootaa fi qormaataaf si gargaaruuf qophaa'eera.\n\n" +

      "👇 Tajaajila barbaaddu filadhu.",

      mainKeyboard()
    );

    return;
  }

  // ----------------------------------------------------
  // MENU
  // ----------------------------------------------------

  if (text === "/menu") {

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "📋 MENU WAAAMARA",
      mainKeyboard()
    );

    return;
  }

  // ----------------------------------------------------
  // ACTIVE SESSION
  // ----------------------------------------------------

  const session =
    sessions.get(chatId);

  if (
    session &&
    session.type === "create_exam"
  ) {

    await processCreateExam(
      chatId,
      text,
      msg
    );

    return;
  }

  if (
    session &&
    session.type === "take_exam"
  ) {

    await processTakeExam(
      chatId,
      text,
      msg
    );

    return;
  }

  if (
    session &&
    session.type === "answer_exam"
  ) {

    await processAnswer(
      chatId,
      text
    );

    return;
  }

  // ----------------------------------------------------
  // MAIN MENU
  // ----------------------------------------------------

  if (text === "📝 Qormaata Uumi") {

    await startCreateExam(chatId);
    return;
  }

  if (text === "📖 Qormaata Fudhadhu") {

    await startTakeExam(chatId);
    return;
  }

  if (text === "📊 Qabxii Koo") {

    await showMyScore(
      chatId,
      msg
    );

    return;
  }

  if (text === "👨‍🏫 Qormaata Koo") {

    await showTeacherExams(
      chatId,
      msg
    );

    return;
  }

  if (text === "📚 Barnoota") {

    await showLearning(chatId);
    return;
  }

  if (text === "👤 Profile") {

    await showProfile(
      chatId,
      msg
    );

    return;
  }

  if (text === "💼 Hojiiwwan Biroo") {

    await showOtherServices(chatId);
    return;
  }

  // ----------------------------------------------------
  // UNKNOWN MESSAGE
  // ----------------------------------------------------

  await sendMessage(
    chatId,

    "❓ Ajaja kana hin hubanne.\n\n" +
    "👇 Menu keessaa filadhu.",

    mainKeyboard()
  );
}

// ======================================================
// TELEGRAM WEBHOOK
// ======================================================

app.post(
  "/telegram/webhook",
  async (req, res) => {

    try {

      const update =
        req.body;

      console.log(
        "📩 Telegram update received"
      );

      if (update.message) {

        await handleMessage(
          update.message
        );
      }

      if (update.callback_query) {

        await processCallback(
          update.callback_query
        );
      }

      res.sendStatus(200);

    } catch (error) {

      console.error(
        "❌ Update error:",
        error
      );

      res.sendStatus(200);
    }
  }
);

// ======================================================
// SET BOT COMMANDS
// ======================================================

async function setupCommands() {

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
          description: "Menu bani"
        }
      ]
    }
  );

  console.log(
    "✅ Telegram commands configured."
  );
}

// ======================================================
// SET WEBHOOK
// ======================================================

async function setupWebhook() {

  const webhookUrl =
    `${RENDER_URL}/telegram/webhook`;

  try {

    await telegram(
      "setWebhook",
      {
        url: webhookUrl
      }
    );

    console.log(
      `✅ Webhook set: ${webhookUrl}`
    );

  } catch (error) {

    console.error(
      "❌ Webhook error:",
      error.message
    );
  }
}

// ======================================================
// START SERVER
// ======================================================

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

// ======================================================
// ERROR HANDLERS
// ======================================================

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "❌ Unhandled rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {

    console.error(
      "❌ Uncaught exception:",
      error
    );
  }
);
