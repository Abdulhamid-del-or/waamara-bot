const express = require("express");
const https = require("https");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

const RENDER_URL =
  process.env.RENDER_EXTERNAL_URL ||
  "https://waamara-bot.onrender.com";

if (!BOT_TOKEN) console.error("❌ TELEGRAM_BOT_TOKEN hin jiru.");
if (!DATABASE_URL) console.error("❌ DATABASE_URL hin jiru.");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ======================================================
// SESSION
// ======================================================

const sessions = new Map();

// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {
  res.send("🤖 Waamara Bot online.");
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      bot: "Waamara",
      database: "connected"
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
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
            reject(new Error(json.description || "Telegram error"));
            return;
          }

          resolve(json.result);
        } catch (e) {
          reject(e);
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
// MAIN MENU
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
// DATABASE
// ======================================================

async function createTables() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE,
      first_name TEXT,
      username TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      points INTEGER DEFAULT 1
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS options (
      id SERIAL PRIMARY KEY,
      question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
      option_key VARCHAR(5) NOT NULL,
      option_text TEXT NOT NULL
    )
  `);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers (
      id SERIAL PRIMARY KEY,
      attempt_id INTEGER REFERENCES attempts(id) ON DELETE CASCADE,
      question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
      answer TEXT,
      is_correct BOOLEAN DEFAULT FALSE
    )
  `);
}

// ======================================================
// MIGRATIONS
// ======================================================

async function migrations() {

  console.log("🔧 Database migrations started...");

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

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
  `);

  // users.id default fix
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
          COALESCE((SELECT MAX(id) FROM users), 0) + 1,
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

async function initDatabase() {
  await createTables();
  await migrations();
  console.log("✅ Database initialized.");
}

// ======================================================
// SAVE USER
// ======================================================

async function saveUser(msg) {

  if (!msg.from) return;

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
    msg.from.id,
    msg.from.first_name || "",
    msg.from.username || ""
  ]);
}

// ======================================================
// EXAM CODE
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
// CREATE EXAM START
// ======================================================

async function startCreateExam(chatId) {

  sessions.set(chatId, {
    type: "create_exam",
    step: "title"
  });

  await sendMessage(
    chatId,

    "📝 QORMAATA UUMI\n\n" +
    "Mata-duree qormaataa barreessi.\n\n" +
    "Fakkeenya:\n" +
    "Qormaata Herregaa Kutaa 10"
  );
}

// ======================================================
// CREATE EXAM
// ======================================================

async function processCreateExam(chatId, text, msg) {

  const s = sessions.get(chatId);

  if (!s) return;

  // TITLE
  if (s.step === "title") {

    if (text.trim().length < 2) {
      await sendMessage(
        chatId,
        "❌ Maaloo mata-duree sirrii barreessi."
      );
      return;
    }

    s.title = text.trim();
    s.step = "subject";

    await sendMessage(
      chatId,
      "📚 Barnoota qormaataa barreessi.\n\n" +
      "Fakkeenya: Herrega"
    );

    return;
  }

  // SUBJECT
  if (s.step === "subject") {

    s.subject = text.trim();
    s.step = "duration";

    await sendMessage(
      chatId,

      "⏱️ Yeroo qormaataa meeqa daqiiqaa?\n\n" +
      "Lakkoofsa qofa galchi.\n\n" +
      "Fakkeenya:\n" +
      "30"
    );

    return;
  }

  // DURATION
  if (s.step === "duration") {

    // Lakkoofsa qofa fudhata
    const cleanText = String(text)
      .trim()
      .replace(/[^\d]/g, "");

    const duration = parseInt(
      cleanText,
      10
    );

    if (
      !cleanText ||
      Number.isNaN(duration) ||
      duration < 1 ||
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

      RETURNING *
    `, [
      code,
      s.title,
      s.subject,
      duration,
      msg.from.id
    ]);

    const exam = result.rows[0];

    s.type = "add_questions";
    s.examId = exam.id;
    s.examCode = exam.code;
    s.questionNumber = 1;
    s.step = "question";

    await sendMessage(
      chatId,

      "✅ QORMAATA UUMAMEERA!\n\n" +
      `📚 ${exam.title}\n` +
      `📖 ${exam.subject}\n` +
      `⏱️ ${exam.duration} daqiiqaa\n` +
      `🔑 Koodii: ${exam.code}\n\n` +

      "Amma gaaffii jalqabaa itti daballa.\n\n" +

      "📝 GAaffii #1 barreessi:"
    );

    return;
  }
}

// ======================================================
// ADD QUESTIONS
// ======================================================

async function processAddQuestion(chatId, text) {

  const s = sessions.get(chatId);

  if (!s || s.type !== "add_questions") {
    return;
  }

  // QUESTION
  if (s.step === "question") {

    s.questionText = text.trim();
    s.step = "optionA";

    await sendMessage(
      chatId,
      "🅰️ Deebii A barreessi:"
    );

    return;
  }

  // OPTION A
  if (s.step === "optionA") {

    s.optionA = text.trim();
    s.step = "optionB";

    await sendMessage(
      chatId,
      "🅱️ Deebii B barreessi:"
    );

    return;
  }

  // OPTION B
  if (s.step === "optionB") {

    s.optionB = text.trim();
    s.step = "optionC";

    await sendMessage(
      chatId,
      "©️ Deebii C barreessi:"
    );

    return;
  }

  // OPTION C
  if (s.step === "optionC") {

    s.optionC = text.trim();
    s.step = "optionD";

    await sendMessage(
      chatId,
      "🅳 Deebii D barreessi:"
    );

    return;
  }

  // OPTION D
  if (s.step === "optionD") {

    s.optionD = text.trim();
    s.step = "correct";

    await sendMessage(
      chatId,

      "✅ Deebii sirrii kam?\n\n" +
      "A, B, C ykn D qofa barreessi."
    );

    return;
  }

  // CORRECT
  if (s.step === "correct") {

    const correct =
      text.trim().toUpperCase();

    if (!["A", "B", "C", "D"].includes(correct)) {

      await sendMessage(
        chatId,

        "❌ Deebiin sirrii miti.\n\n" +
        "A, B, C ykn D qofa barreessi."
      );

      return;
    }

    s.correct = correct;
    s.step = "points";

    await sendMessage(
      chatId,

      "🎯 Qabxii gaaffii kanaa meeqa?\n\n" +
      "Fakkeenya: 1"
    );

    return;
  }

  // POINTS
  if (s.step === "points") {

    const points =
      parseInt(
        String(text).trim(),
        10
      );

    if (
      Number.isNaN(points) ||
      points < 1 ||
      points > 100
    ) {

      await sendMessage(
        chatId,

        "❌ Qabxiin sirrii miti.\n\n" +
        "Lakkoofsa 1 hanga 100 galchi.\n\n" +
        "Fakkeenya: 1"
      );

      return;
    }

    // STORE CORRECT ANSWER AS TEXT
    let correctText = "";

    if (s.correct === "A") correctText = s.optionA;
    if (s.correct === "B") correctText = s.optionB;
    if (s.correct === "C") correctText = s.optionC;
    if (s.correct === "D") correctText = s.optionD;

    // INSERT QUESTION
    const questionResult = await pool.query(`
      INSERT INTO questions
        (
          exam_id,
          question_text,
          correct_answer,
          points
        )

      VALUES
        ($1, $2, $3, $4)

      RETURNING id
    `, [
      s.examId,
      s.questionText,
      correctText,
      points
    ]);

    const questionId =
      questionResult.rows[0].id;

    // INSERT OPTIONS
    await pool.query(`
      INSERT INTO options
        (
          question_id,
          option_key,
          option_text
        )

      VALUES
        ($1, 'A', $2),
        ($1, 'B', $3),
        ($1, 'C', $4),
        ($1, 'D', $5)
    `, [
      questionId,
      s.optionA,
      s.optionB,
      s.optionC,
      s.optionD
    ]);

    await sendMessage(
      chatId,

      `✅ Gaaffii #${s.questionNumber} galmaa'e.\n\n` +

      "Maaliif itti aanu?\n\n" +

      "➕ Gaaffii biraa dabali → `E`\n" +
      "🏁 Qormaata xumuri → `X`"
    );

    s.step = "next";

    return;
  }

  // NEXT
  if (s.step === "next") {

    const command =
      text.trim().toUpperCase();

    if (command === "E") {

      s.questionNumber++;
      s.step = "question";

      await sendMessage(
        chatId,

        `📝 GAAFFII #${s.questionNumber}\n\n` +
        "Gaaffii barreessi:"
      );

      return;
    }

    if (command === "X") {

      const result = await pool.query(`
        SELECT COUNT(*) AS total
        FROM questions
        WHERE exam_id = $1
      `, [s.examId]);

      const total =
        Number(result.rows[0].total);

      sessions.delete(chatId);

      await sendMessage(
        chatId,

        "🎉 QORMAATA XUMURAMEERA!\n\n" +

        `📚 Mata-duree: ${s.title || ""}\n` +
        `🔢 Gaaffiiwwan: ${total}\n` +
        `🔑 Koodii: ${s.examCode}\n\n` +

        "📢 Barattootaaf koodii kana kenni.\n\n" +

        `🔑 ${s.examCode}`,

        mainKeyboard()
      );

      return;
    }

    await sendMessage(
      chatId,

      "❌ Ajaja sirrii miti.\n\n" +
      "➕ Gaaffii biraa: E\n" +
      "🏁 Qormaata xumuruuf: X"
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
    "Fakkeenya: ABC123"
  );
}

// ======================================================
// TAKE EXAM PROCESS
// ======================================================

async function processTakeExam(chatId, text, msg) {

  const s = sessions.get(chatId);

  if (!s) return;

  const code =
    text.trim().toUpperCase();

  const result = await pool.query(`
    SELECT *
    FROM exams
    WHERE code = $1
  `, [code]);

  if (result.rows.length === 0) {

    await sendMessage(
      chatId,
      "❌ Koodii qormaataa kanaan qormaata hin argamne."
    );

    return;
  }

  const exam =
    result.rows[0];

  const questionsResult = await pool.query(`
    SELECT
      id,
      question_text,
      correct_answer,
      points
    FROM questions
    WHERE exam_id = $1
    ORDER BY id
  `, [exam.id]);

  const questions =
    questionsResult.rows;

  if (questions.length === 0) {

    sessions.delete(chatId);

    await sendMessage(
      chatId,

      "⚠️ Qormaanni kun gaaffii hin qabu."
    );

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
        CURRENT_TIMESTAMP +
          ($5 * INTERVAL '1 minute')
      )

    RETURNING id, expires_at
  `, [
    exam.id,
    msg.from.id,
    msg.from.first_name || "Barataa",
    questions.length,
    exam.duration
  ]);

  const attempt =
    attemptResult.rows[0];

  sessions.set(chatId, {
    type: "answer_exam",
    examId: exam.id,
    attemptId: attempt.id,
    questions,
    index: 0,
    expiresAt:
      new Date(attempt.expires_at).getTime()
  });

  await sendMessage(
    chatId,

    "✅ QORMAATA JALQABDEETTA!\n\n" +

    `📚 ${exam.title}\n` +
    `📖 ${exam.subject || "-"}\n` +
    `📝 Gaaffii: ${questions.length}\n` +
    `⏱️ Yeroo: ${exam.duration} daqiiqaa\n\n` +

    "⏳ Yeroon kee amma irraa eegala."
  );

  await sendQuestion(chatId);
}

// ======================================================
// QUESTION KEYBOARD
// ======================================================

function answerKeyboard(options) {

  return {
    inline_keyboard:
      options.map(o => [
        {
          text:
            `${o.option_key}. ${o.option_text}`,
          callback_data:
            `ans:${o.option_key}`
        }
      ])
  };
}

// ======================================================
// SEND QUESTION
// ======================================================

async function sendQuestion(chatId) {

  const s =
    sessions.get(chatId);

  if (!s) return;

  if (
    Date.now() >= s.expiresAt
  ) {

    await finishAttempt(
      chatId,
      s,
      true
    );

    return;
  }

  if (
    s.index >= s.questions.length
  ) {

    await finishAttempt(
      chatId,
      s,
      false
    );

    return;
  }

  const q =
    s.questions[s.index];

  const optionResult =
    await pool.query(`
      SELECT
        option_key,
        option_text
      FROM options
      WHERE question_id = $1
      ORDER BY option_key
    `, [q.id]);

  const options =
    optionResult.rows;

  const remaining =
    Math.max(
      0,
      s.expiresAt - Date.now()
    );

  const minutes =
    Math.floor(
      remaining / 60000
    );

  const seconds =
    Math.floor(
      (remaining % 60000) / 1000
    );

  const timer =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  let message =
    `📝 GAAFFII ${s.index + 1}/${s.questions.length}\n\n`;

  message +=
    `⏱️ Yeroo hafe: ${timer}\n\n`;

  message +=
    `${q.question_text}\n\n`;

  for (const o of options) {

    message +=
      `${o.option_key}. ${o.option_text}\n`;
  }

  message +=
    "\n👇 Deebii kee filadhu.";

  await sendMessage(
    chatId,
    message,
    answerKeyboard(options)
  );
}

// ======================================================
// ANSWER
// ======================================================

async function processAnswer(
  chatId,
  answer
) {

  const s =
    sessions.get(chatId);

  if (!s) return;

  if (
    Date.now() >= s.expiresAt
  ) {

    await finishAttempt(
      chatId,
      s,
      true
    );

    return;
  }

  const q =
    s.questions[s.index];

  if (!q) {

    await finishAttempt(
      chatId,
      s,
      false
    );

    return;
  }

  const selected =
    String(answer)
      .trim()
      .toUpperCase();

  const optionResult =
    await pool.query(`
      SELECT option_text
      FROM options
      WHERE question_id = $1
      AND option_key = $2
    `, [
      q.id,
      selected
    ]);

  if (optionResult.rows.length === 0) {

    await sendMessage(
      chatId,
      "❌ Deebii sirrii filadhu."
    );

    return;
  }

  const selectedText =
    optionResult.rows[0].option_text;

  const correct =
    selectedText.trim().toLowerCase() ===
    q.correct_answer.trim().toLowerCase();

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
    s.attemptId,
    q.id,
    selected,
    correct
  ]);

  if (correct) {

    await sendMessage(
      chatId,
      "✅ Sirrii!"
    );

  } else {

    await sendMessage(
      chatId,
      "❌ Dogoggora."
    );
  }

  s.index++;

  if (
    s.index >= s.questions.length
  ) {

    await finishAttempt(
      chatId,
      s,
      false
    );

    return;
  }

  await sendQuestion(chatId);
}

// ======================================================
// FINISH
// ======================================================

async function finishAttempt(
  chatId,
  s,
  expired
) {

  try {

    const result =
      await pool.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE is_correct = TRUE
          ) AS correct
        FROM answers
        WHERE attempt_id = $1
      `, [
        s.attemptId
      ]);

    const correct =
      Number(
        result.rows[0].correct || 0
      );

    const total =
      s.questions.length;

    const percentage =
      total > 0
        ? (correct / total) * 100
        : 0;

    await pool.query(`
      UPDATE attempts

      SET
        score = $1,
        total = $2,
        percentage = $3,
        finished_at = CURRENT_TIMESTAMP

      WHERE id = $4
    `, [
      correct,
      total,
      percentage.toFixed(2),
      s.attemptId
    ]);

    sessions.delete(chatId);

    if (expired) {

      await sendMessage(
        chatId,

        "⏰ YEROON QORMAATAA DHUMEEERA!\n\n" +

        `✅ Sirrii: ${correct}\n` +
        `❌ Dogoggora: ${total - correct}\n` +
        `📊 Qabxii: ${correct}/${total}\n` +
        `📈 Dhibbeentaa: ${percentage.toFixed(2)}%`,

        mainKeyboard()
      );

    } else {

      await sendMessage(
        chatId,

        "🎉 QORMAATA XUMURTE!\n\n" +

        `✅ Sirrii: ${correct}\n` +
        `❌ Dogoggora: ${total - correct}\n` +
        `📊 Qabxii: ${correct}/${total}\n` +
        `📈 Dhibbeentaa: ${percentage.toFixed(2)}%`,

        mainKeyboard()
      );
    }

  } catch (e) {

    console.error(
      "Finish error:",
      e
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
// CALLBACK
// ======================================================

async function handleCallback(callback) {

  const chatId =
    callback.message.chat.id;

  const data =
    callback.data || "";

  try {

    await telegram(
      "answerCallbackQuery",
      {
        callback_query_id:
          callback.id
      }
    );

  } catch (e) {}

  if (data.startsWith("ans:")) {

    const answer =
      data.substring(4);

    await processAnswer(
      chatId,
      answer
    );
  }
}

// ======================================================
// SCORE
// ======================================================

async function showScores(
  chatId,
  msg
) {

  const result =
    await pool.query(`
      SELECT
        e.title,
        e.subject,
        a.score,
        a.total,
        a.percentage
      FROM attempts a
      JOIN exams e
        ON e.id = a.exam_id
      WHERE a.student_id = $1
      AND a.finished_at IS NOT NULL
      ORDER BY a.finished_at DESC
      LIMIT 20
    `, [
      msg.from.id
    ]);

  if (result.rows.length === 0) {

    await sendMessage(
      chatId,
      "📊 Qabxii kee ammaaf hin jiru.",
      mainKeyboard()
    );

    return;
  }

  let text =
    "📊 QABXII KOO\n\n";

  result.rows.forEach(
    (r, i) => {

      text +=
        `${i + 1}. ${r.title}\n`;

      text +=
        `📚 ${r.subject || "-"}\n`;

      text +=
        `🎯 ${r.score}/${r.total}\n`;

      text +=
        `📈 ${Number(r.percentage).toFixed(2)}%\n\n`;
    }
  );

  await sendMessage(
    chatId,
    text,
    mainKeyboard()
  );
}

// ======================================================
// TEACHER EXAMS
// ======================================================

async function teacherExams(
  chatId,
  msg
) {

  const result =
    await pool.query(`
      SELECT
        e.id,
        e.title,
        e.subject,
        e.code,
        e.duration,
        COUNT(q.id) AS questions
      FROM exams e
      LEFT JOIN questions q
        ON q.exam_id = e.id
      WHERE e.teacher_id = $1
      GROUP BY e.id
      ORDER BY e.created_at DESC
      LIMIT 20
    `, [
      msg.from.id
    ]);

  if (result.rows.length === 0) {

    await sendMessage(
      chatId,
      "👨‍🏫 Qormaata ati uumte hin jiru.",
      mainKeyboard()
    );

    return;
  }

  let text =
    "👨‍🏫 QORMAATA KOO\n\n";

  for (const e of result.rows) {

    text +=
      `📚 ${e.title}\n`;

    text +=
      `📖 ${e.subject || "-"}\n`;

    text +=
      `🔑 Koodii: ${e.code}\n`;

    text +=
      `📝 Gaaffii: ${e.questions}\n`;

    text +=
      `⏱️ Yeroo: ${e.duration} daqiiqaa\n\n`;
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

async function profile(
  chatId,
  msg
) {

  await sendMessage(
    chatId,

    "👤 PROFILE\n\n" +

    `👤 Maqaa: ${msg.from.first_name || "-"}\n` +
    `🔗 Username: @${msg.from.username || "-"}\n` +
    `🆔 Telegram ID: ${msg.from.id}`,

    mainKeyboard()
  );
}

// ======================================================
// HANDLE MESSAGE
// ======================================================

async function handleMessage(msg) {

  if (!msg.chat) return;

  const chatId =
    msg.chat.id;

  const text =
    String(msg.text || "").trim();

  if (!text) return;

  await saveUser(msg);

  // START
  if (text === "/start") {

    sessions.delete(chatId);

    await sendMessage(
      chatId,

      "👋 BAGA NAGAA DHUFTAN!\n\n" +
      "🤖 Ani Waamara dha.\n\n" +
      "👇 Tajaajila barbaaddu filadhu.",

      mainKeyboard()
    );

    return;
  }

  // MENU
  if (text === "/menu") {

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "📋 MENU WAAAMARA",
      mainKeyboard()
    );

    return;
  }

  const s =
    sessions.get(chatId);

  // CREATE EXAM
  if (
    s &&
    s.type === "create_exam"
  ) {

    await processCreateExam(
      chatId,
      text,
      msg
    );

    return;
  }

  // ADD QUESTIONS
  if (
    s &&
    s.type === "add_questions"
  ) {

    await processAddQuestion(
      chatId,
      text
    );

    return;
  }

  // TAKE EXAM
  if (
    s &&
    s.type === "take_exam"
  ) {

    await processTakeExam(
      chatId,
      text,
      msg
    );

    return;
  }

  // ANSWER EXAM
  if (
    s &&
    s.type === "answer_exam"
  ) {

    await processAnswer(
      chatId,
      text
    );

    return;
  }

  // MAIN BUTTONS

  if (text === "📝 Qormaata Uumi") {
    await startCreateExam(chatId);
    return;
  }

  if (text === "📖 Qormaata Fudhadhu") {
    await startTakeExam(chatId);
    return;
  }

  if (text === "📊 Qabxii Koo") {
    await showScores(chatId, msg);
    return;
  }

  if (text === "👨‍🏫 Qormaata Koo") {
    await teacherExams(chatId, msg);
    return;
  }

  if (text === "📚 Barnoota") {

    await sendMessage(
      chatId,

      "📚 BARNOOTA\n\n" +
      "📝 Qormaata\n" +
      "📖 Qormaata Fudhachuu\n" +
      "📊 Qabxii\n" +
      "🎓 Barnoota dabalataa",

      mainKeyboard()
    );

    return;
  }

  if (text === "👤 Profile") {
    await profile(chatId, msg);
    return;
  }

  if (text === "💼 Hojiiwwan Biroo") {

    await sendMessage(
      chatId,

      "💼 HOJIIWWAN BIROO\n\n" +
      "🤖 Waamara Bot\n" +
      "📝 Qormaata\n" +
      "📚 Barnoota\n" +
      "📊 Qabxii",

      mainKeyboard()
    );

    return;
  }

  await sendMessage(
    chatId,
    "❓ Ajaja kana hin hubanne.\n\n👇 Menu keessaa filadhu.",
    mainKeyboard()
  );
}

// ======================================================
// WEBHOOK
// ======================================================

app.post(
  "/telegram/webhook",
  async (req, res) => {

    try {

      console.log(
        "📩 Telegram update received"
      );

      if (req.body.message) {

        await handleMessage(
          req.body.message
        );
      }

      if (req.body.callback_query) {

        await handleCallback(
          req.body.callback_query
        );
      }

      res.sendStatus(200);

    } catch (e) {

      console.error(
        "❌ Update error:",
        e
      );

      res.sendStatus(200);
    }
  }
);

// ======================================================
// TELEGRAM COMMANDS
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
// WEBHOOK
// ======================================================

async function setupWebhook() {

  const url =
    `${RENDER_URL}/telegram/webhook`;

  await telegram(
    "setWebhook",
    {
      url
    }
  );

  console.log(
    `✅ Webhook set: ${url}`
  );
}

// ======================================================
// START
// ======================================================

async function start() {

  try {

    await initDatabase();

    app.listen(
      PORT,
      "0.0.0.0",
      async () => {

        console.log(
          `🚀 Waamara server running on port ${PORT}`
        );

        try {
          await setupCommands();
          await setupWebhook();
        } catch (e) {
          console.error(
            "❌ Telegram setup error:",
            e.message
          );
        }
      }
    );

  } catch (e) {

    console.error(
      "❌ Startup error:",
      e
    );

    process.exit(1);
  }
}

start();

process.on(
  "unhandledRejection",
  e => console.error("❌ Unhandled:", e)
);

process.on(
  "uncaughtException",
  e => console.error("❌ Exception:", e)
);
