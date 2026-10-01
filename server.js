const express = require("express");
const https = require("https");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN hin argamne.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL hin argamne.");
  process.exit(1);
}

/* =========================================================
   DATABASE
========================================================= */

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function db(query, params = []) {
  const result = await pool.query(query, params);
  return result.rows;
}

/* =========================================================
   DATABASE TABLES
========================================================= */

async function initDatabase() {
  console.log("Database initialization started...");

  await db(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db(`
    CREATE TABLE IF NOT EXISTS exams (
      id BIGSERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subject TEXT,
      creator_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      duration_minutes INTEGER DEFAULT 30,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db(`
    CREATE TABLE IF NOT EXISTS questions (
      id BIGSERIAL PRIMARY KEY,
      exam_id BIGINT REFERENCES exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_type TEXT DEFAULT 'multiple_choice',
      points INTEGER DEFAULT 1,
      question_order INTEGER DEFAULT 1
    )
  `);

  await db(`
    CREATE TABLE IF NOT EXISTS options (
      id BIGSERIAL PRIMARY KEY,
      question_id BIGINT REFERENCES questions(id) ON DELETE CASCADE,
      option_key TEXT NOT NULL,
      option_text TEXT NOT NULL,
      is_correct BOOLEAN DEFAULT FALSE
    )
  `);

  await db(`
    CREATE TABLE IF NOT EXISTS attempts (
      id BIGSERIAL PRIMARY KEY,
      exam_id BIGINT REFERENCES exams(id) ON DELETE CASCADE,
      student_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      student_name TEXT NOT NULL,
      score NUMERIC DEFAULT 0,
      total_points NUMERIC DEFAULT 0,
      percentage NUMERIC DEFAULT 0,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      submitted_at TIMESTAMPTZ
    )
  `);

  await db(`
    CREATE TABLE IF NOT EXISTS answers (
      id BIGSERIAL PRIMARY KEY,
      attempt_id BIGINT REFERENCES attempts(id) ON DELETE CASCADE,
      question_id BIGINT REFERENCES questions(id) ON DELETE CASCADE,
      selected_option TEXT,
      is_correct BOOLEAN DEFAULT FALSE,
      points_earned NUMERIC DEFAULT 0
    )
  `);

  console.log("Database migrations completed.");
}

/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Waamara Bot</title>
        <style>
          body {
            font-family: Arial;
            text-align: center;
            padding: 50px;
          }
        </style>
      </head>
      <body>
        <h1>📚 Waamara Bot</h1>
        <p>Qormaata fi Barnootaaf Telegram Bot</p>
        <p>🟢 Server online</p>
      </body>
    </html>
  `);
});

app.get("/health", async (req, res) => {
  try {
    await db("SELECT 1");

    res.json({
      ok: true,
      app: "Waamara",
      database: "connected",
      time: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      database: "error",
      error: error.message
    });
  }
});

/* =========================================================
   TELEGRAM API
========================================================= */

function telegram(method, data = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);

    const request = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: 40000
      },
      response => {
        let result = "";

        response.on("data", chunk => {
          result += chunk;
        });

        response.on("end", () => {
          try {
            const json = JSON.parse(result);

            if (!json.ok) {
              reject(
                new Error(
                  json.description || "Telegram API error"
                )
              );
              return;
            }

            resolve(json.result);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);

    request.on("timeout", () => {
      request.destroy(
        new Error("Telegram request timeout")
      );
    });

    request.write(body);
    request.end();
  });
}

/* =========================================================
   TELEGRAM HELPERS
========================================================= */

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

async function answerCallback(callbackId, text = "") {
  try {
    await telegram("answerCallbackQuery", {
      callback_query_id: callbackId,
      text
    });
  } catch (error) {
    console.error(
      "Callback answer error:",
      error.message
    );
  }
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

/* =========================================================
   KEYBOARDS
========================================================= */

function mainKeyboard() {
  return {
    keyboard: [
      [
        {
          text: "📝 Qormaata Uumi"
        },
        {
          text: "📖 Qormaata Fudhadhu"
        }
      ],
      [
        {
          text: "📊 Qabxii Koo"
        },
        {
          text: "👨‍🏫 Qormaata Koo"
        }
      ],
      [
        {
          text: "📚 Barnoota"
        },
        {
          text: "👤 Profile"
        }
      ],
      [
        {
          text: "💼 Hojiiwwan Biroo"
        }
      ]
    ],
    resize_keyboard: true
  };
}

function cancelKeyboard() {
  return {
    keyboard: [
      [
        {
          text: "❌ Haqi"
        }
      ]
    ],
    resize_keyboard: true
  };
}

/* =========================================================
   SESSIONS
========================================================= */

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

/* =========================================================
   USER
========================================================= */

async function saveUser(user) {
  await db(
    `
    INSERT INTO users
      (id, first_name, last_name, username)
    VALUES
      ($1, $2, $3, $4)
    ON CONFLICT (id)
    DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      username = EXCLUDED.username
    `,
    [
      user.id,
      user.first_name || "",
      user.last_name || "",
      user.username || ""
    ]
  );
}

/* =========================================================
   START
========================================================= */

async function handleStart(message, payload = "") {
  const user = message.from;
  const chatId = message.chat.id;

  await saveUser(user);

  if (payload.startsWith("exam_")) {
    const code = payload.replace("exam_", "").trim();

    const exams = await db(
      `
      SELECT *
      FROM exams
      WHERE code = $1
      LIMIT 1
      `,
      [code]
    );

    if (!exams.length) {
      await sendMessage(
        chatId,
        "❌ Qormaanni kun hin argamne."
      );
      return;
    }

    const session = getSession(user.id);

    session.mode = "take_exam_name";
    session.examId = exams[0].id;
    session.examCode = exams[0].code;

    await sendMessage(
      chatId,
      `
📖 <b>${escapeHtml(exams[0].title)}</b>

Maqaa kee barreessi.
      `,
      {
        reply_markup: cancelKeyboard()
      }
    );

    return;
  }

  await sendMessage(
    chatId,
    `
<b>👋 Baga nagaan dhuftan Waamara!</b>

📚 Waamara jechuun bot qormaataa fi barnootaati.

📝 Qormaata uumuu dandeessa.
📖 Qormaata fudhachuu dandeessa.
📊 Qabxii kee ilaaluu dandeessa.
👨‍🏫 Bu'aa barattootaa ilaaluu dandeessa.

👇 Tajaajila barbaadde filadhu.
    `,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   CREATE EXAM
========================================================= */

async function startCreateExam(chatId, userId) {
  clearSession(userId);

  const session = getSession(userId);

  session.mode = "create_title";

  await sendMessage(
    chatId,
    `
📝 <b>QORMAATA UUMI</b>

Mata-duree qormaataa barreessi.

Fakkeenya:
Herrega Kutaa 8
    `,
    {
      reply_markup: cancelKeyboard()
    }
  );
}

async function createExamStep(message) {
  const userId = message.from.id;
  const chatId = message.chat.id;
  const text = message.text.trim();

  const session = getSession(userId);

  if (session.mode === "create_title") {
    session.title = text;
    session.mode = "create_subject";

    await sendMessage(
      chatId,
      "📚 Barnoota/Mata-duree qormaataa barreessi."
    );

    return;
  }

  if (session.mode === "create_subject") {
    session.subject = text;
    session.mode = "create_duration";

    await sendMessage(
      chatId,
      `
⏱ Yeroo qormaataa daqiiqaan meeqa?

Fakkeenya:
30
      `
    );

    return;
  }

  if (session.mode === "create_duration") {
    const duration = Number(text);

    if (
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 300
    ) {
      await sendMessage(
        chatId,
        "❌ Yeroo sirrii galchi. Fakkeenya: 30"
      );
      return;
    }

    session.duration = duration;
    session.questions = [];
    session.mode = "create_question";

    await sendMessage(
      chatId,
      `
❓ <b>Gaaffii 1</b>

Gaaffii barreessi.
      `
    );

    return;
  }

  if (session.mode === "create_question") {
    session.currentQuestion = {
      question_text: text,
      points: 1,
      options: []
    };

    session.mode = "option_a";

    await sendMessage(
      chatId,
      "A) Filannoo A barreessi."
    );

    return;
  }

  if (session.mode === "option_a") {
    session.currentQuestion.options.push({
      key: "A",
      text,
      correct: false
    });

    session.mode = "option_b";

    await sendMessage(
      chatId,
      "B) Filannoo B barreessi."
    );

    return;
  }

  if (session.mode === "option_b") {
    session.currentQuestion.options.push({
      key: "B",
      text,
      correct: false
    });

    session.mode = "option_c";

    await sendMessage(
      chatId,
      "C) Filannoo C barreessi."
    );

    return;
  }

  if (session.mode === "option_c") {
    session.currentQuestion.options.push({
      key: "C",
      text,
      correct: false
    });

    session.mode = "option_d";

    await sendMessage(
      chatId,
      "D) Filannoo D barreessi."
    );

    return;
  }

  if (session.mode === "option_d") {
    session.currentQuestion.options.push({
      key: "D",
      text,
      correct: false
    });

    session.mode = "correct";

    await sendMessage(
      chatId,
      `
✅ Deebiin sirrii kam?

A, B, C ykn D qofa barreessi.
      `
    );

    return;
  }

  if (session.mode === "correct") {
    const correct = text.toUpperCase();

    if (!["A", "B", "C", "D"].includes(correct)) {
      await sendMessage(
        chatId,
        "❌ A, B, C ykn D qofa galchi."
      );
      return;
    }

    for (
      const option of session.currentQuestion.options
    ) {
      option.correct =
        option.key === correct;
    }

    session.questions.push(
      session.currentQuestion
    );

    session.currentQuestion = null;

    session.mode = "more_question";

    await sendMessage(
      chatId,
      `
✅ Gaaffiin kee galmaa'e.

Gaaffii biraa dabaluuf:
👉 <b>Eeyyee</b>

Xumuruuf:
👉 <b>Lakki</b>
      `
    );

    return;
  }

  if (session.mode === "more_question") {
    const answer = text.toLowerCase();

    if (
      answer === "eeyyee" ||
      answer === "eyyee" ||
      answer === "yes"
    ) {
      session.mode = "create_question";

      await sendMessage(
        chatId,
        `
❓ <b>Gaaffii ${session.questions.length + 1}</b>

Gaaffii barreessi.
        `
      );

      return;
    }

    if (
      answer === "lakki" ||
      answer === "no"
    ) {
      await saveExam(userId, chatId);
      return;
    }

    await sendMessage(
      chatId,
      "Eeyyee ykn Lakki barreessi."
    );

    return;
  }
}

/* =========================================================
   SAVE EXAM
========================================================= */

async function saveExam(userId, chatId) {
  const session = getSession(userId);

  if (
    !session.questions ||
    session.questions.length === 0
  ) {
    await sendMessage(
      chatId,
      "❌ Yoo xiqqaate gaaffii tokko qabaachuu qaba."
    );
    return;
  }

  const creator = await db(
    "SELECT id FROM users WHERE id = $1",
    [userId]
  );

  if (!creator.length) {
    await sendMessage(
      chatId,
      "❌ User database keessatti hin argamne."
    );
    return;
  }

  let code;

  for (let i = 0; i < 20; i++) {
    const possible =
      String(
        Math.floor(
          100000 + Math.random() * 900000
        )
      );

    const exists = await db(
      "SELECT id FROM exams WHERE code = $1",
      [possible]
    );

    if (!exists.length) {
      code = possible;
      break;
    }
  }

  if (!code) {
    await sendMessage(
      chatId,
      "❌ Code qormaataa uumuu hin dandeenye."
    );
    return;
  }

  const examRows = await db(
    `
    INSERT INTO exams
      (
        code,
        title,
        subject,
        creator_id,
        duration_minutes
      )
    VALUES
      ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      code,
      session.title,
      session.subject,
      userId,
      session.duration
    ]
  );

  const exam = examRows[0];

  let totalPoints = 0;

  for (
    let i = 0;
    i < session.questions.length;
    i++
  ) {
    const q =
      session.questions[i];

    totalPoints += Number(q.points);

    const qRows = await db(
      `
      INSERT INTO questions
        (
          exam_id,
          question_text,
          question_type,
          points,
          question_order
        )
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        exam.id,
        q.question_text,
        "multiple_choice",
        q.points,
        i + 1
      ]
    );

    const questionId =
      qRows[0].id;

    for (
      const option of q.options
    ) {
      await db(
        `
        INSERT INTO options
          (
            question_id,
            option_key,
            option_text,
            is_correct
          )
        VALUES
          ($1, $2, $3, $4)
        `,
        [
          questionId,
          option.key,
          option.text,
          option.correct
        ]
      );
    }
  }

  const me = await telegram(
    "getMe"
  );

  const botUsername =
    me.username;

  const link =
    `https://t.me/${botUsername}?start=exam_${code}`;

  clearSession(userId);

  await sendMessage(
    chatId,
    `
🎉 <b>QORMAANNI KEE UUMAME!</b>

📝 Mata-duree: <b>${escapeHtml(session.title)}</b>
📚 Barnoota: <b>${escapeHtml(session.subject)}</b>
⏱ Yeroo: <b>${session.duration} daqiiqaa</b>
❓ Gaaffii: <b>${session.questions.length}</b>
💯 Qabxii waliigalaa: <b>${totalPoints}</b>

🔢 <b>Exam Code:</b>
<code>${code}</code>

🔗 <b>Liinkii qormaataa:</b>
${link}

📤 Liinkii kana barattootaaf qoodi.
    `,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   TAKE EXAM
========================================================= */

async function startTakeExam(chatId, userId) {
  clearSession(userId);

  const session = getSession(userId);

  session.mode = "take_exam_code";

  await sendMessage(
    chatId,
    `
📖 <b>QORMAATA FUDHADHU</b>

Exam Code galchi.

Fakkeenya:
123456
    `,
    {
      reply_markup: cancelKeyboard()
    }
  );
}

async function startExamWithCode(
  chatId,
  userId,
  code
) {
  const exams = await db(
    `
    SELECT *
    FROM exams
    WHERE code = $1
    LIMIT 1
    `,
    [code]
  );

  if (!exams.length) {
    await sendMessage(
      chatId,
      "❌ Exam Code sirrii miti."
    );
    return;
  }

  const exam = exams[0];

  const session =
    getSession(userId);

  session.mode = "take_exam_name";
  session.examId = exam.id;
  session.examCode = exam.code;

  await sendMessage(
    chatId,
    `
📖 <b>${escapeHtml(exam.title)}</b>

⏱ Yeroo: ${exam.duration_minutes} daqiiqaa

Maqaa guutuu kee barreessi.
    `,
    {
      reply_markup: cancelKeyboard()
    }
  );
}

async function takeExamStep(message) {
  const userId = message.from.id;
  const chatId = message.chat.id;
  const text = message.text.trim();

  const session =
    getSession(userId);

  if (session.mode === "take_exam_code") {
    await startExamWithCode(
      chatId,
      userId,
      text
    );

    return;
  }

  if (session.mode === "take_exam_name") {
    session.studentName = text;

    const exams = await db(
      `
      SELECT *
      FROM exams
      WHERE id = $1
      LIMIT 1
      `,
      [session.examId]
    );

    if (!exams.length) {
      clearSession(userId);

      await sendMessage(
        chatId,
        "❌ Qormaanni hin argamne."
      );

      return;
    }

    const exam = exams[0];

    const attempts = await db(
      `
      INSERT INTO attempts
        (
          exam_id,
          student_id,
          student_name,
          started_at
        )
      VALUES
        ($1, $2, $3, NOW())
      RETURNING *
      `,
      [
        exam.id,
        userId,
        session.studentName
      ]
    );

    session.attemptId =
      attempts[0].id;

    session.questionIndex = 0;
    session.startedAt =
      new Date(
        attempts[0].started_at
      );

    session.duration =
      Number(
        exam.duration_minutes
      );

    session.questions =
      await db(
        `
        SELECT *
        FROM questions
        WHERE exam_id = $1
        ORDER BY question_order ASC
        `,
        [exam.id]
      );

    session.mode =
      "answering";

    await sendNextQuestion(
      chatId,
      userId
    );
  }
}

/* =========================================================
   SEND QUESTION
========================================================= */

async function sendNextQuestion(
  chatId,
  userId
) {
  const session =
    getSession(userId);

  if (
    session.questionIndex >=
    session.questions.length
  ) {
    await finishExam(
      chatId,
      userId
    );
    return;
  }

  const elapsed =
    Date.now() -
    session.startedAt.getTime();

  const maxTime =
    session.duration *
    60 *
    1000;

  if (elapsed >= maxTime) {
    await sendMessage(
      chatId,
      "⏰ Yeroon qormaataa xumurame."
    );

    await finishExam(
      chatId,
      userId
    );

    return;
  }

  const question =
    session.questions[
      session.questionIndex
    ];

  const options =
    await db(
      `
      SELECT *
      FROM options
      WHERE question_id = $1
      ORDER BY option_key
      `,
      [question.id]
    );

  const keyboard =
    options.map(option => [
      {
        text:
          `${option.option_key}) ${option.option_text}`,
        callback_data:
          `answer:${question.id}:${option.option_key}`
      }
    ]);

  await sendMessage(
    chatId,
    `
❓ <b>Gaaffii ${
      session.questionIndex + 1
    }/${session.questions.length}</b>

${escapeHtml(question.question_text)}

⏱ Yeroo:
${formatRemainingTime(session)}
    `,
    {
      reply_markup: {
        inline_keyboard: keyboard
      }
    }
  );
}

/* =========================================================
   ANSWER
========================================================= */

async function handleAnswer(
  callbackQuery
) {
  const userId =
    callbackQuery.from.id;

  const chatId =
    callbackQuery.message.chat.id;

  const messageId =
    callbackQuery.message.message_id;

  const data =
    callbackQuery.data;

  const parts =
    data.split(":");

  const questionId =
    Number(parts[1]);

  const selected =
    parts[2];

  const session =
    getSession(userId);

  if (
    session.mode !== "answering"
  ) {
    await answerCallback(
      callbackQuery.id,
      "Qormaanni kun xumurameera."
    );
    return;
  }

  const elapsed =
    Date.now() -
    session.startedAt.getTime();

  const maxTime =
    session.duration *
    60 *
    1000;

  if (elapsed >= maxTime) {
    await answerCallback(
      callbackQuery.id,
      "⏰ Yeroon xumurame."
    );

    await finishExam(
      chatId,
      userId
    );

    return;
  }

  const questionRows =
    await db(
      `
      SELECT *
      FROM questions
      WHERE id = $1
      LIMIT 1
      `,
      [questionId]
    );

  if (!questionRows.length) {
    await answerCallback(
      callbackQuery.id,
      "❌ Gaaffiin hin argamne."
    );
    return;
  }

  const question =
    questionRows[0];

  const optionRows =
    await db(
      `
      SELECT *
      FROM options
      WHERE question_id = $1
      `,
      [questionId]
    );

  const correct =
    optionRows.find(
      option =>
        option.is_correct === true
    );

  const isCorrect =
    correct &&
    correct.option_key === selected;

  const points =
    isCorrect
      ? Number(question.points)
      : 0;

  await db(
    `
    INSERT INTO answers
      (
        attempt_id,
        question_id,
        selected_option,
        is_correct,
        points_earned
      )
    VALUES
      ($1, $2, $3, $4, $5)
    `,
    [
      session.attemptId,
      questionId,
      selected,
      isCorrect,
      points
    ]
  );

  await answerCallback(
    callbackQuery.id,
    isCorrect
      ? "✅ Sirrii!"
      : "❌ Dogoggora!"
  );

  try {
    await telegram(
      "editMessageReplyMarkup",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: []
        }
      }
    );
  } catch {}

  session.questionIndex++;

  await sendNextQuestion(
    chatId,
    userId
  );
}

/* =========================================================
   FINISH EXAM
========================================================= */

async function finishExam(
  chatId,
  userId
) {
  const session =
    getSession(userId);

  if (!session.attemptId) {
    clearSession(userId);

    await sendMessage(
      chatId,
      "❌ Attempt hin argamne."
    );

    return;
  }

  const rows =
    await db(
      `
      SELECT
        COALESCE(
          SUM(points_earned),
          0
        ) AS score
      FROM answers
      WHERE attempt_id = $1
      `,
      [session.attemptId]
    );

  const score =
    Number(rows[0].score || 0);

  const totalRows =
    await db(
      `
      SELECT
        COALESCE(
          SUM(points),
          0
        ) AS total
      FROM questions
      WHERE exam_id = $1
      `,
      [session.examId]
    );

  const total =
    Number(totalRows[0].total || 0);

  const percentage =
    total > 0
      ? (score / total) * 100
      : 0;

  const correctRows =
    await db(
      `
      SELECT COUNT(*) AS count
      FROM answers
      WHERE attempt_id = $1
        AND is_correct = TRUE
      `,
      [session.attemptId]
    );

  const wrongRows =
    await db(
      `
      SELECT COUNT(*) AS count
      FROM answers
      WHERE attempt_id = $1
        AND is_correct = FALSE
      `,
      [session.attemptId]
    );

  const correct =
    Number(
      correctRows[0].count
    );

  const wrong =
    Number(
      wrongRows[0].count
    );

  await db(
    `
    UPDATE attempts
    SET
      score = $1,
      total_points = $2,
      percentage = $3,
      submitted_at = NOW()
    WHERE id = $4
    `,
    [
      score,
      total,
      percentage.toFixed(2),
      session.attemptId
    ]
  );

  clearSession(userId);

  await sendMessage(
    chatId,
    `
🎉 <b>QORMAANNI XUMURAME!</b>

👤 Maqaa: <b>${escapeHtml(session.studentName || "")}</b>

💯 Qabxii:
<b>${score} / ${total}</b>

📊 Dhibbeentaa:
<b>${percentage.toFixed(2)}%</b>

✅ Sirrii: <b>${correct}</b>
❌ Dogoggora: <b>${wrong}</b>

Galmeen bu'aa kee database keessatti kuufameera.
    `,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   STUDENT RESULTS
========================================================= */

async function showMyResults(
  chatId,
  userId
) {
  const rows =
    await db(
      `
      SELECT
        a.*,
        e.title,
        e.code
      FROM attempts a
      JOIN exams e
        ON e.id = a.exam_id
      WHERE a.student_id = $1
        AND a.submitted_at IS NOT NULL
      ORDER BY a.submitted_at DESC
      LIMIT 20
      `,
      [userId]
    );

  if (!rows.length) {
    await sendMessage(
      chatId,
      `
📊 <b>Qabxii Koo</b>

Ammaaf bu'aan qormaataa hin jiru.
      `,
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  let text =
    "📊 <b>QABXII KOO</b>\n\n";

  for (
    const row of rows
  ) {
    text +=
      `📝 ${escapeHtml(row.title)}\n` +
      `🔢 Code: <code>${row.code}</code>\n` +
      `💯 ${row.score}/${row.total_points} ` +
      `(${Number(row.percentage).toFixed(2)}%)\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   TEACHER EXAMS
========================================================= */

async function showTeacherExams(
  chatId,
  userId
) {
  const rows =
    await db(
      `
      SELECT *
      FROM exams
      WHERE creator_id = $1
      ORDER BY created_at DESC
      LIMIT 30
      `,
      [userId]
    );

  if (!rows.length) {
    await sendMessage(
      chatId,
      `
👨‍🏫 <b>Qormaata Koo</b>

Ati hanga ammaatti qormaata hin uumne.
      `,
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  const buttons =
    rows.map(row => [
      {
        text:
          `📊 Bu'aa ${row.code}`,
        callback_data:
          `results:${row.id}`
      }
    ]);

  let text =
    "👨‍🏫 <b>QORMAATA KOO</b>\n\n";

  for (
    const row of rows
  ) {
    text +=
      `📝 ${escapeHtml(row.title)}\n` +
      `📚 ${escapeHtml(row.subject || "")}\n` +
      `🔢 <code>${row.code}</code>\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    {
      reply_markup: {
        inline_keyboard: buttons
      }
    }
  );
}

/* =========================================================
   TEACHER RESULTS
========================================================= */

async function showTeacherResults(
  callbackQuery,
  examId
) {
  const userId =
    callbackQuery.from.id;

  const chatId =
    callbackQuery.message.chat.id;

  const exams =
    await db(
      `
      SELECT *
      FROM exams
      WHERE id = $1
        AND creator_id = $2
      `,
      [
        examId,
        userId
      ]
    );

  if (!exams.length) {
    await answerCallback(
      callbackQuery.id,
      "❌ Hayyama hin qabdu."
    );

    return;
  }

  const exam =
    exams[0];

  const rows =
    await db(
      `
      SELECT *
      FROM attempts
      WHERE exam_id = $1
        AND submitted_at IS NOT NULL
      ORDER BY percentage DESC
      `,
      [examId]
    );

  await answerCallback(
    callbackQuery.id,
    "Bu'aa qormaataa"
  );

  if (!rows.length) {
    await sendMessage(
      chatId,
      `
📊 <b>Bu'aa</b>

Qormaata kana namni tokko illee hin xumurre.
      `
    );

    return;
  }

  let text =
    `📊 <b>BU'AA: ${escapeHtml(exam.title)}</b>\n\n`;

  rows.forEach(
    (row, index) => {
      text +=
        `${index + 1}. 👤 ` +
        `${escapeHtml(row.student_name)}\n` +
        `   💯 ${row.score}/${row.total_points}\n` +
        `   📊 ${Number(row.percentage).toFixed(2)}%\n\n`;
    }
  );

  await sendMessage(
    chatId,
    text,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   PROFILE
========================================================= */

async function showProfile(
  chatId,
  userId
) {
  const users =
    await db(
      `
      SELECT *
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

  if (!users.length) {
    await sendMessage(
      chatId,
      "❌ Profile hin argamne."
    );
    return;
  }

  const user =
    users[0];

  const created =
    await db(
      `
      SELECT COUNT(*) AS count
      FROM exams
      WHERE creator_id = $1
      `,
      [userId]
    );

  const taken =
    await db(
      `
      SELECT COUNT(*) AS count
      FROM attempts
      WHERE student_id = $1
      `,
      [userId]
    );

  await sendMessage(
    chatId,
    `
👤 <b>PROFILE</b>

🧑 Maqaa:
${escapeHtml(
  `${user.first_name || ""} ${user.last_name || ""}`
)}

🔹 Username:
@${escapeHtml(user.username || "Hin jiru")}

🆔 Telegram ID:
<code>${user.id}</code>

📝 Qormaata uumte:
${created[0].count}

📖 Qormaata fudhatte:
${taken[0].count}
    `,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   EDUCATION
========================================================= */

async function showEducation(
  chatId
) {
  await sendMessage(
    chatId,
    `
📚 <b>BARNOOTA</b>

Waamara keessatti tajaajiloonni barnootaa gara fuulduraatti bal'inaan ni dabalamu.

🎓 Qormaata
📖 Barnoota
❓ Gaaffilee
📝 Shaakala
📊 Madaallii
    `,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   OTHER SERVICES
========================================================= */

async function showOtherServices(
  chatId
) {
  await sendMessage(
    chatId,
    `
💼 <b>HOJIIWWAN BIROO</b>

Tajaajiloota Waamara keessatti dabaluu dandeenyu:

🔹 Qormaata qopheessuu
🔹 Bu'aa barattootaa
🔹 Qormaata share gochuu
🔹 Profile
🔹 Barnoota
🔹 Gaaffii fi deebii
🔹 Fuulduratti tajaajila dabalataa
    `,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   MESSAGE HANDLER
========================================================= */

async function handleMessage(message) {
  if (
    !message ||
    !message.chat ||
    !message.from
  ) {
    return;
  }

  const chatId =
    message.chat.id;

  const userId =
    message.from.id;

  await saveUser(
    message.from
  );

  const text =
    message.text
      ? message.text.trim()
      : "";

  if (!text) {
    return;
  }

  if (text.startsWith("/start")) {
    const parts =
      text.split(" ");

    const payload =
      parts.length > 1
        ? parts.slice(1).join(" ")
        : "";

    await handleStart(
      message,
      payload
    );

    return;
  }

  if (text === "/cancel" || text === "❌ Haqi") {
    clearSession(userId);

    await sendMessage(
      chatId,
      "❌ Adeemsi amma ture haqameera.",
      {
        reply_markup:
          mainKeyboard()
      }
    );

    return;
  }

  const session =
    getSession(userId);

  if (
    session.mode &&
    (
      session.mode.startsWith("create_") ||
      session.mode.startsWith("option_") ||
      session.mode === "correct" ||
      session.mode === "more_question"
    )
  ) {
    await createExamStep(
      message
    );

    return;
  }

  if (
    session.mode === "take_exam_code" ||
    session.mode === "take_exam_name"
  ) {
    await takeExamStep(
      message
    );

    return;
  }

  if (
    text === "📝 Qormaata Uumi"
  ) {
    await startCreateExam(
      chatId,
      userId
    );
    return;
  }

  if (
    text === "📖 Qormaata Fudhadhu"
  ) {
    await startTakeExam(
      chatId,
      userId
    );
    return;
  }

  if (
    text === "📊 Qabxii Koo"
  ) {
    await showMyResults(
      chatId,
      userId
    );
    return;
  }

  if (
    text === "👨‍🏫 Qormaata Koo"
  ) {
    await showTeacherExams(
      chatId,
      userId
    );
    return;
  }

  if (
    text === "📚 Barnoota"
  ) {
    await showEducation(
      chatId
    );
    return;
  }

  if (
    text === "👤 Profile"
  ) {
    await showProfile(
      chatId,
      userId
    );
    return;
  }

  if (
    text === "💼 Hojiiwwan Biroo"
  ) {
    await showOtherServices(
      chatId
    );
    return;
  }

  await sendMessage(
    chatId,
    `
❓ Ajaja kana hin hubanne.

👇 Menu keessaa filadhu.
    `,
    {
      reply_markup:
        mainKeyboard()
    }
  );
}

/* =========================================================
   CALLBACK HANDLER
========================================================= */

async function handleCallbackQuery(
  callbackQuery
) {
  const data =
    callbackQuery.data || "";

  if (
    data.startsWith("answer:")
  ) {
    await handleAnswer(
      callbackQuery
    );

    return;
  }

  if (
    data.startsWith("results:")
  ) {
    const examId =
      Number(
        data.split(":")[1]
      );

    await showTeacherResults(
      callbackQuery,
      examId
    );

    return;
  }

  await answerCallback(
    callbackQuery.id
  );
}

/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   TIME
========================================================= */

function formatRemainingTime(
  session
) {
  const elapsed =
    Date.now() -
    session.startedAt.getTime();

  const max =
    session.duration *
    60 *
    1000;

  const remaining =
    Math.max(
      0,
      max - elapsed
    );

  const minutes =
    Math.floor(
      remaining / 60000
    );

  const seconds =
    Math.floor(
      (remaining % 60000) / 1000
    );

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/* =========================================================
   TELEGRAM COMMANDS
========================================================= */

async function setupBot() {
  try {
    /*
      Webhook yoo jiraate polling waliin walitti hin bu'u.
    */
    await telegram(
      "deleteWebhook",
      {
        drop_pending_updates: false
      }
    );

    await telegram(
      "setMyCommands",
      {
        commands: [
          {
            command: "start",
            description: "Waamara jalqabi"
          },
          {
            command: "cancel",
            description: "Adeemsa haqii"
          }
        ]
      }
    );

    const me =
      await telegram("getMe");

    console.log(
      `Telegram bot connected: @${me.username}`
    );

    return me;
  } catch (error) {
    console.error(
      "Bot setup error:",
      error.message
    );

    throw error;
  }
}

/* =========================================================
   SAFE TELEGRAM POLLING
========================================================= */

let offset = 0;
let polling = false;
let pollTimer = null;
let conflictCount = 0;

async function pollTelegram() {
  if (polling) {
    return;
  }

  polling = true;

  try {
    const updates =
      await telegram(
        "getUpdates",
        {
          offset,
          timeout: 25,
          allowed_updates: [
            "message",
            "callback_query"
          ]
        }
      );

    /*
      Yoo polling tokko qofa jiraate,
      conflictCount deebisee 0 godha.
    */
    conflictCount = 0;

    for (
      const update of updates
    ) {
      offset =
        update.update_id + 1;

      try {
        if (
          update.callback_query
        ) {
          await handleCallbackQuery(
            update.callback_query
          );
        }

        if (
          update.message
        ) {
          await handleMessage(
            update.message
          );
        }
      } catch (error) {
        console.error(
          "Update handling error:",
          error.message
        );
      }
    }
  } catch (error) {
    console.error(
      "Polling error:",
      error.message
    );

    /*
      Conflict = process biraa tokko
      bot kana fayyadamaa jira.
    */
    if (
      error.message &&
      error.message.includes(
        "Conflict"
      )
    ) {
      conflictCount++;

      console.log(
        `⚠️ Telegram polling conflict #${conflictCount}`
      );

      console.log(
        "⚠️ Waamara bot process tokko qofa akka hojjetu mirkaneessi."
      );

      /*
        Conflict yeroo muraasaaf yoo ta'e
        polling saffisaan irra deddeebi'uu dhiisa.
      */
      const wait =
        Math.min(
          60000,
          5000 *
            conflictCount
        );

      if (pollTimer) {
        clearTimeout(
          pollTimer
        );
      }

      polling = false;

      pollTimer =
        setTimeout(
          pollTelegram,
          wait
        );

      return;
    }
  }

  polling = false;

  if (pollTimer) {
    clearTimeout(
      pollTimer
    );
  }

  pollTimer =
    setTimeout(
      pollTelegram,
      1000
    );
}

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
  try {
    await initDatabase();

    await setupBot();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `🚀 Waamara server running on port ${PORT}`
        );

        console.log(
          "🟢 Database connected"
        );

        console.log(
          "🟢 Telegram polling started"
        );

        pollTelegram();
      }
    );
  } catch (error) {
    console.error(
      "❌ Server startup failed:",
      error.message
    );

    process.exit(1);
  }
}

startServer();

/* =========================================================
   PROCESS ERROR HANDLING
========================================================= */

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught exception:",
      error
    );
  }
);
