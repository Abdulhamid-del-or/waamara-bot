const express = require("express");
const https = require("https");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN hin argamne.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL hin argamne.");
  process.exit(1);
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

async function db(query, params = []) {
  const result = await pool.query(query, params);
  return result.rows;
}

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
      creator_id BIGINT NOT NULL REFERENCES users(id),
      duration_minutes INTEGER DEFAULT 30,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db(`
    CREATE TABLE IF NOT EXISTS questions (
      id BIGSERIAL PRIMARY KEY,
      exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_type TEXT DEFAULT 'multiple_choice',
      points INTEGER DEFAULT 1,
      question_order INTEGER DEFAULT 1
    )
  `);

  await db(`
    CREATE TABLE IF NOT EXISTS options (
      id BIGSERIAL PRIMARY KEY,
      question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_key TEXT NOT NULL,
      option_text TEXT NOT NULL,
      is_correct BOOLEAN DEFAULT FALSE
    )
  `);

  await db(`
    CREATE TABLE IF NOT EXISTS attempts (
      id BIGSERIAL PRIMARY KEY,
      exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id BIGINT NOT NULL REFERENCES users(id),
      student_name TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      total_points INTEGER DEFAULT 0,
      percentage NUMERIC(5,2) DEFAULT 0,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      submitted_at TIMESTAMPTZ
    )
  `);

  await db(`
    CREATE TABLE IF NOT EXISTS answers (
      id BIGSERIAL PRIMARY KEY,
      attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option TEXT,
      is_correct BOOLEAN DEFAULT FALSE,
      points_earned INTEGER DEFAULT 0
    )
  `);

  console.log("Database migrations completed.");
}

/* =========================
   EXPRESS
========================= */

app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Waamara Bot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family:Arial;text-align:center;padding:40px">
        <h1>🤖 Waamara Bot</h1>
        <p>Waamara Telegram Bot is running.</p>
        <p>📝 Qormaata uumuu</p>
        <p>📖 Qormaata fudhachuu</p>
        <p>📊 Qabxii agarsiisuu</p>
      </body>
    </html>
  `);
});

app.get("/health", async (req, res) => {
  try {
    await db("SELECT 1");

    res.json({
      status: "ok",
      app: "Waamara Bot",
      database: "connected",
      time: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      error: error.message
    });
  }
});

/* =========================
   TELEGRAM API
========================= */

function telegram(method, data = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);

    const request = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TOKEN}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      response => {
        let result = "";

        response.on("data", chunk => {
          result += chunk;
        });

        response.on("end", () => {
          try {
            const parsed = JSON.parse(result);

            if (!parsed.ok) {
              reject(new Error(parsed.description || "Telegram API error"));
              return;
            }

            resolve(parsed.result);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);

    request.write(body);
    request.end();
  });
}

async function sendMessage(chatId, text, options = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...options
  });
}

async function answerCallback(callbackId, text = "") {
  try {
    await telegram("answerCallbackQuery", {
      callback_query_id: callbackId,
      text
    });
  } catch (error) {
    console.log("Callback error:", error.message);
  }
}

/* =========================
   USER
========================= */

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

/* =========================
   SESSION
========================= */

const sessions = new Map();

function setSession(chatId, data) {
  sessions.set(chatId, {
    ...(sessions.get(chatId) || {}),
    ...data
  });
}

function getSession(chatId) {
  return sessions.get(chatId) || {};
}

function clearSession(chatId) {
  sessions.delete(chatId);
}

/* =========================
   MAIN MENU
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
        { text: "📚 Barnoota" }
      ],
      [
        { text: "👤 Profile" },
        { text: "💼 Hojiiwwan Biroo" }
      ]
    ],
    resize_keyboard: true
  };
}

/* =========================
   START
========================= */

async function startBot(chatId, user) {
  await saveUser(user);

  clearSession(chatId);

  await sendMessage(
    chatId,
    `🤖 *Baga nagaan dhuftan Waamara!*

Waamara jechuun bot barnootaa fi qormaataa ti.

Tajaajiloota armaan gadii keessaa filadhu:

📝 Qormaata Uumi
📖 Qormaata Fudhadhu
📊 Qabxii Koo
📚 Barnoota
👤 Profile
💼 Hojiiwwan Biroo`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   CREATE EXAM
========================= */

async function createExamStart(chatId) {
  setSession(chatId, {
    action: "create_exam_title",
    exam: {
      questions: []
    }
  });

  await sendMessage(
    chatId,
    `📝 *Qormaata Uumuu*

Maqaa qormaataa galchi.

Fakkeenya:
*Qormaata Herregaa Kutaa 8*`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [[{ text: "❌ Haqi" }],
        ],
        resize_keyboard: true
      }
    }
  );
}

async function saveExam(chatId) {
  const session = getSession(chatId);
  const exam = session.exam;

  const codeResult = await db(
    "SELECT code FROM exams ORDER BY id DESC LIMIT 1"
  );

  let code = "1001";

  if (codeResult.length > 0) {
    const last = parseInt(codeResult[0].code, 10);

    if (!isNaN(last)) {
      code = String(last + 1);
    }
  }

  const examRows = await db(
    `
    INSERT INTO exams
      (code, title, subject, creator_id, duration_minutes)
    VALUES
      ($1, $2, $3, $4, $5)
    RETURNING id
    `,
    [
      code,
      exam.title,
      exam.subject,
      chatId,
      exam.duration || 30
    ]
  );

  const examId = examRows[0].id;

  for (let i = 0; i < exam.questions.length; i++) {
    const q = exam.questions[i];

    const questionRows = await db(
      `
      INSERT INTO questions
        (exam_id, question_text, question_type, points, question_order)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        examId,
        q.text,
        "multiple_choice",
        1,
        i + 1
      ]
    );

    const questionId = questionRows[0].id;

    for (const option of q.options) {
      await db(
        `
        INSERT INTO options
          (question_id, option_key, option_text, is_correct)
        VALUES
          ($1, $2, $3, $4)
        `,
        [
          questionId,
          option.key,
          option.text,
          option.key === q.correct
        ]
      );
    }
  }

  clearSession(chatId);

  await sendMessage(
    chatId,
    `✅ *Qormaanni uumameera!*

📚 Maqaa: ${exam.title}
📖 Barnoota: ${exam.subject}
⏱ Yeroo: ${exam.duration || 30} daqiiqaa
🔢 Lakkoofsa Qormaataa: *${code}*
❓ Gaaffilee: ${exam.questions.length}

Barattoonni qormaata kana fudhachuuf lakkoofsa kana fayyadamu.

🔗 Exam Code:
*${code}*`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   TAKE EXAM
========================= */

async function takeExamStart(chatId) {
  setSession(chatId, {
    action: "take_exam_code"
  });

  await sendMessage(
    chatId,
    `📖 *Qormaata Fudhachuu*

Lakkoofsa qormaataa galchi.

Fakkeenya:
*1001*`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [[{ text: "❌ Haqi" }],
        ],
        resize_keyboard: true
      }
    }
  );
}

async function loadExam(chatId, code) {
  const exams = await db(
    `
    SELECT *
    FROM exams
    WHERE code = $1
      AND status = 'active'
    `,
    [code]
  );

  if (exams.length === 0) {
    await sendMessage(
      chatId,
      "❌ Qormaanni lakkoofsa kana qabu hin argamne."
    );
    return;
  }

  const exam = exams[0];

  const questions = await db(
    `
    SELECT *
    FROM questions
    WHERE exam_id = $1
    ORDER BY question_order ASC, id ASC
    `,
    [exam.id]
  );

  if (questions.length === 0) {
    await sendMessage(
      chatId,
      "❌ Qormaanni kun gaaffii hin qabu."
    );
    return;
  }

  const fullQuestions = [];

  for (const question of questions) {
    const options = await db(
      `
      SELECT option_key, option_text, is_correct
      FROM options
      WHERE question_id = $1
      ORDER BY id ASC
      `,
      [question.id]
    );

    fullQuestions.push({
      ...question,
      options
    });
  }

  setSession(chatId, {
    action: "take_exam_name",
    exam: {
      ...exam,
      questions: fullQuestions
    }
  });

  await sendMessage(
    chatId,
    `📚 *${exam.title}*

📖 Barnoota: ${exam.subject || "-"}
❓ Gaaffii: ${questions.length}
⏱ Yeroo: ${exam.duration_minutes} daqiiqaa

Maqaa kee galchi:`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [[{ text: "❌ Haqi" }],
        ],
        resize_keyboard: true
      }
    }
  );
}

async function startExam(chatId, studentName) {
  const session = getSession(chatId);

  const attemptRows = await db(
    `
    INSERT INTO attempts
      (exam_id, student_id, student_name, total_points)
    VALUES
      ($1, $2, $3, $4)
    RETURNING id
    `,
    [
      session.exam.id,
      chatId,
      studentName,
      session.exam.questions.reduce(
        (sum, q) => sum + Number(q.points || 1),
        0
      )
    ]
  );

  setSession(chatId, {
    action: "answer_question",
    studentName,
    attemptId: attemptRows[0].id,
    questionIndex: 0,
    score: 0
  });

  await sendQuestion(chatId);
}

async function sendQuestion(chatId) {
  const session = getSession(chatId);
  const question = session.exam.questions[session.questionIndex];

  if (!question) {
    await finishExam(chatId);
    return;
  }

  const buttons = [];

  for (const option of question.options) {
    buttons.push([
      {
        text: `${option.option_key}. ${option.option_text}`,
        callback_data: `answer:${question.id}:${option.option_key}`
      }
    ]);
  }

  await sendMessage(
    chatId,
    `❓ *Gaaffii ${session.questionIndex + 1}/${session.exam.questions.length}*

${question.question_text}

📌 Qabxii: ${question.points || 1}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: buttons
      }
    }
  );
}

/* =========================
   ANSWER
========================= */

async function handleAnswer(chatId, questionId, selectedOption) {
  const session = getSession(chatId);

  if (session.action !== "answer_question") {
    return;
  }

  const question = session.exam.questions.find(
    q => String(q.id) === String(questionId)
  );

  if (!question) {
    return;
  }

  const correctOption = question.options.find(
    o => o.is_correct
  );

  const isCorrect =
    correctOption &&
    correctOption.option_key === selectedOption;

  const points = isCorrect
    ? Number(question.points || 1)
    : 0;

  await db(
    `
    INSERT INTO answers
      (attempt_id, question_id, selected_option, is_correct, points_earned)
    VALUES
      ($1, $2, $3, $4, $5)
    `,
    [
      session.attemptId,
      question.id,
      selectedOption,
      isCorrect,
      points
    ]
  );

  let newScore = Number(session.score || 0);

  if (isCorrect) {
    newScore += points;
  }

  setSession(chatId, {
    score: newScore,
    questionIndex: session.questionIndex + 1
  });

  if (isCorrect) {
    await sendMessage(chatId, "✅ Deebiin kee sirrii dha!");
  } else {
    await sendMessage(
      chatId,
      `❌ Deebiin kee sirrii miti.

✅ Deebiin sirrii:
${correctOption ? correctOption.option_key : "-"}`
    );
  }

  await sendQuestion(chatId);
}

/* =========================
   FINISH EXAM
========================= */

async function finishExam(chatId) {
  const session = getSession(chatId);

  const totalPoints = session.exam.questions.reduce(
    (sum, q) => sum + Number(q.points || 1),
    0
  );

  const score = Number(session.score || 0);

  const percentage =
    totalPoints > 0
      ? ((score / totalPoints) * 100).toFixed(2)
      : "0.00";

  await db(
    `
    UPDATE attempts
    SET
      score = $1,
      percentage = $2,
      submitted_at = NOW()
    WHERE id = $3
    `,
    [
      score,
      percentage,
      session.attemptId
    ]
  );

  const correctRows = await db(
    `
    SELECT COUNT(*)::int AS count
    FROM answers
    WHERE attempt_id = $1
      AND is_correct = TRUE
    `,
    [session.attemptId]
  );

  const wrongRows = await db(
    `
    SELECT COUNT(*)::int AS count
    FROM answers
    WHERE attempt_id = $1
      AND is_correct = FALSE
    `,
    [session.attemptId]
  );

  const correct = correctRows[0].count;
  const wrong = wrongRows[0].count;

  clearSession(chatId);

  await sendMessage(
    chatId,
    `🎉 *Qormaata xumurteetta!*

📚 Qormaata: ${session.exam.title}

👤 Barataa: ${session.studentName}

🏆 Qabxii: *${score}/${totalPoints}*
📊 Percentage: *${percentage}%*

✅ Sirrii: ${correct}
❌ Sirrii hin taane: ${wrong}

Galmee kee database keessatti kuufameera.`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   MY RESULTS
========================= */

async function myResults(chatId) {
  const rows = await db(
    `
    SELECT
      e.title,
      e.subject,
      a.score,
      a.total_points,
      a.percentage,
      a.submitted_at
    FROM attempts a
    JOIN exams e ON e.id = a.exam_id
    WHERE a.student_id = $1
      AND a.submitted_at IS NOT NULL
    ORDER BY a.submitted_at DESC
    LIMIT 10
    `,
    [chatId]
  );

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      `📊 *Qabxii Koo*

Ammaaf qormaata xumurte tokko illee hin qabdu.`,
      {
        parse_mode: "Markdown"
      }
    );

    return;
  }

  let text = "📊 *Qabxii Koo*\n\n";

  rows.forEach((row, index) => {
    text +=
      `${index + 1}. *${row.title}*\n` +
      `📖 ${row.subject || "-"}\n` +
      `🏆 ${row.score}/${row.total_points}\n` +
      `📊 ${row.percentage}%\n\n`;
  });

  await sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: mainKeyboard()
  });
}

/* =========================
   MY EXAMS - TEACHER
========================= */

async function myExams(chatId) {
  const exams = await db(
    `
    SELECT
      e.id,
      e.code,
      e.title,
      e.subject,
      e.created_at,
      COUNT(DISTINCT q.id)::int AS questions
    FROM exams e
    LEFT JOIN questions q ON q.exam_id = e.id
    WHERE e.creator_id = $1
    GROUP BY e.id
    ORDER BY e.created_at DESC
    `,
    [chatId]
  );

  if (exams.length === 0) {
    await sendMessage(
      chatId,
      "📝 Ati hanga ammaatti qormaata hin uumne."
    );
    return;
  }

  let text = "📝 *Qormaata Koo*\n\n";

  exams.forEach((exam, index) => {
    text +=
      `${index + 1}. *${exam.title}*\n` +
      `📖 ${exam.subject || "-"}\n` +
      `🔢 Code: *${exam.code}*\n` +
      `❓ Gaaffii: ${exam.questions}\n\n`;
  });

  await sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: mainKeyboard()
  });
}

/* =========================
   PROFILE
========================= */

async function profile(chatId) {
  const userRows = await db(
    "SELECT * FROM users WHERE id = $1",
    [chatId]
  );

  if (userRows.length === 0) {
    await sendMessage(chatId, "❌ Profile hin argamne.");
    return;
  }

  const user = userRows[0];

  const created = await db(
    "SELECT COUNT(*)::int AS count FROM exams WHERE creator_id = $1",
    [chatId]
  );

  const taken = await db(
    "SELECT COUNT(*)::int AS count FROM attempts WHERE student_id = $1",
    [chatId]
  );

  await sendMessage(
    chatId,
    `👤 *Profile*

🆔 Telegram ID: ${user.id}
👤 Maqaa: ${user.first_name || "-"} ${user.last_name || ""}
🔹 Username: @${user.username || "-"}

📝 Qormaata uumte: ${created[0].count}
📖 Qormaata fudhatte: ${taken[0].count}`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   OTHER SERVICES
========================= */

async function education(chatId) {
  await sendMessage(
    chatId,
    `📚 *Barnoota*

Waamara keessatti tajaajiloonni barnootaa gara fuulduraatti ni dabalamau.

• 📖 Barnoota
• ❓ Gaaffii fi Deebii
• 📝 Shaakala
• 📊 Qormaata
• 🎓 Qabxii fi bu'aa

Tajaajiloota kana gara fuulduraatti bal'inaan ni ijaarra.`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

async function otherServices(chatId) {
  await sendMessage(
    chatId,
    `💼 *Hojiiwwan Biroo*

Waamara gara fuulduraatti:

🔎 Barbaacha
📢 Beeksisa
📚 Faayila barnootaa
❓ Gaaffii fi deebii
👥 Hawaasa barattootaa
📨 Ergaa

fi tajaajila biroo ni qabaata.`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   MESSAGE HANDLER
========================= */

async function handleMessage(message) {
  if (!message || !message.chat) {
    return;
  }

  const chatId = message.chat.id;
  const user = message.from || {};

  await saveUser(user);

  const text = (message.text || "").trim();

  if (text === "/start") {
    await startBot(chatId, user);
    return;
  }

  if (text === "❌ Haqi" || text === "/cancel") {
    clearSession(chatId);

    await sendMessage(
      chatId,
      "❌ Hojii haqameera.",
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  const session = getSession(chatId);

  /* CREATE EXAM */

  if (text === "📝 Qormaata Uumi") {
    await createExamStart(chatId);
    return;
  }

  if (session.action === "create_exam_title") {
    session.exam.title = text;
    session.action = "create_exam_subject";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "📖 Barnoota/Subject qormaataa galchi.\n\nFakkeenya: Herrega"
    );

    return;
  }

  if (session.action === "create_exam_subject") {
    session.exam.subject = text;
    session.action = "create_exam_duration";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "⏱ Yeroo qormaataa daqiiqaan galchi.\n\nFakkeenya: 30"
    );

    return;
  }

  if (session.action === "create_exam_duration") {
    const duration = parseInt(text, 10);

    if (isNaN(duration) || duration <= 0) {
      await sendMessage(
        chatId,
        "❌ Lakkoofsa sirrii galchi. Fakkeenya: 30"
      );
      return;
    }

    session.exam.duration = duration;
    session.action = "create_question";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      `❓ Gaaffii #${session.exam.questions.length + 1} galchi.`
    );

    return;
  }

  if (session.action === "create_question") {
    session.exam.questions.push({
      text,
      options: [],
      correct: null
    });

    session.action = "option_a";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "🅰️ Filannoo A galchi."
    );

    return;
  }

  if (session.action === "option_a") {
    const q = session.exam.questions.at(-1);

    q.options.push({
      key: "A",
      text
    });

    session.action = "option_b";

    setSession(chatId, session);

    await sendMessage(chatId, "🅱️ Filannoo B galchi.");

    return;
  }

  if (session.action === "option_b") {
    const q = session.exam.questions.at(-1);

    q.options.push({
      key: "B",
      text
    });

    session.action = "option_c";

    setSession(chatId, session);

    await sendMessage(chatId, "©️ Filannoo C galchi.");

    return;
  }

  if (session.action === "option_c") {
    const q = session.exam.questions.at(-1);

    q.options.push({
      key: "C",
      text
    });

    session.action = "option_d";

    setSession(chatId, session);

    await sendMessage(chatId, "🅳 Filannoo D galchi.");

    return;
  }

  if (session.action === "option_d") {
    const q = session.exam.questions.at(-1);

    q.options.push({
      key: "D",
      text
    });

    session.action = "correct_answer";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      `✅ Deebii sirrii filadhu.

A, B, C ykn D qofa galchi.`
    );

    return;
  }

  if (session.action === "correct_answer") {
    const answer = text.toUpperCase();

    if (!["A", "B", "C", "D"].includes(answer)) {
      await sendMessage(
        chatId,
        "❌ A, B, C ykn D qofa galchi."
      );
      return;
    }

    const q = session.exam.questions.at(-1);
    q.correct = answer;

    session.action = "more_questions";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      `✅ Gaaffiin ${session.exam.questions.length} qophaa'eera.

Gaaffii biraa dabaluuf:
👉 *Eeyyee*

Yoo xumurte:
👉 *Lakki*`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [
            [
              { text: "Eeyyee" },
              { text: "Lakki" }
            ],
            [
              { text: "❌ Haqi" }
            ]
          ],
          resize_keyboard: true
        }
      }
    );

    return;
  }

  if (session.action === "more_questions") {
    const answer = text.toLowerCase();

    if (answer === "eeyyee" || answer === "yes") {
      session.action = "create_question";

      setSession(chatId, session);

      await sendMessage(
        chatId,
        `❓ Gaaffii #${session.exam.questions.length + 1} galchi.`,
        {
          reply_markup: {
            keyboard: [[{ text: "❌ Haqi" }],
            ],
            resize_keyboard: true
          }
        }
      );

      return;
    }

    if (answer === "lakki" || answer === "no") {
      await saveExam(chatId);
      return;
    }

    await sendMessage(
      chatId,
      "👉 Eeyyee ykn Lakki jedhii deebisi."
    );

    return;
  }

  /* TAKE EXAM */

  if (text === "📖 Qormaata Fudhadhu") {
    await takeExamStart(chatId);
    return;
  }

  if (session.action === "take_exam_code") {
    await loadExam(chatId, text);
    return;
  }

  if (session.action === "take_exam_name") {
    if (text.length < 2) {
      await sendMessage(
        chatId,
        "❌ Maqaa sirrii galchi."
      );
      return;
    }

    await startExam(chatId, text);
    return;
  }

  /* RESULTS */

  if (text === "📊 Qabxii Koo") {
    await myResults(chatId);
    return;
  }

  /* PROFILE */

  if (text === "👤 Profile") {
    await profile(chatId);
    return;
  }

  /* EDUCATION */

  if (text === "📚 Barnoota") {
    await education(chatId);
    return;
  }

  /* OTHER */

  if (text === "💼 Hojiiwwan Biroo") {
    await otherServices(chatId);
    return;
  }

  /* DEFAULT */

  await sendMessage(
    chatId,
    "🤖 Ajaja kana hin hubanne. Maaloo menu keessaa filadhu.",
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   CALLBACK HANDLER
========================= */

async function handleCallback(callback) {
  if (!callback || !callback.message) {
    return;
  }

  const chatId = callback.message.chat.id;
  const data = callback.data || "";

  await answerCallback(callback.id);

  if (data.startsWith("answer:")) {
    const parts = data.split(":");

    const questionId = parts[1];
    const selectedOption = parts[2];

    await handleAnswer(
      chatId,
      questionId,
      selectedOption
    );
  }
}

/* =========================
   POLLING
========================= */

let offset = 0;
let polling = false;

async function pollTelegram() {
  if (polling) {
    return;
  }

  polling = true;

  try {
    const updates = await telegram("getUpdates", {
      offset,
      timeout: 25,
      allowed_updates: ["message", "callback_query"]
    });

    for (const update of updates) {
      offset = update.update_id + 1;

      try {
        if (update.message) {
          await handleMessage(update.message);
        }

        if (update.callback_query) {
          await handleCallback(update.callback_query);
        }
      } catch (error) {
        console.error(
          "Update error:",
          error.message
        );
      }
    }
  } catch (error) {
    console.error(
      "Telegram polling error:",
      error.message
    );
  } finally {
    polling = false;

    setTimeout(
      pollTelegram,
      1000
    );
  }
}

/* =========================
   START SERVER
========================= */

async function start() {
  try {
    await initDatabase();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `🚀 Waamara server running on port ${PORT}`
        );

        pollTelegram();
      }
    );
  } catch (error) {
    console.error(
      "❌ Server startup failed:",
      error
    );

    process.exit(1);
  }
}

start();
