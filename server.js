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

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.json());

/* =========================
   DATABASE
========================= */

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

app.get("/", (req, res) => {
  res.send(`
    <h1>🤖 Waamara Bot</h1>
    <p>Waamara Telegram Bot is running.</p>
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
      database: "disconnected"
    });
  }
});

/* =========================
   TELEGRAM
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
              reject(
                new Error(
                  parsed.description || "Telegram error"
                )
              );
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

async function answerCallback(id, text = "") {
  try {
    await telegram("answerCallbackQuery", {
      callback_query_id: id,
      text
    });
  } catch {}
}

/* =========================
   BOT INFO
========================= */

let BOT_USERNAME = "";

async function loadBotInfo() {
  try {
    const me = await telegram("getMe");
    BOT_USERNAME = me.username || "";

    console.log(
      `🤖 Bot: @${BOT_USERNAME}`
    );
  } catch (error) {
    console.error(
      "Bot info error:",
      error.message
    );
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
   MENU
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
    resize_keyboard: true
  };
}

/* =========================
   START
========================= */

async function startBot(chatId, user, examCode = null) {
  await saveUser(user);

  clearSession(chatId);

  if (examCode) {
    await loadExam(chatId, examCode);
    return;
  }

  await sendMessage(
    chatId,
    `🤖 *Baga nagaan dhuftan Waamara!*

Waamara — Bot Qormaataa fi Barnootaa.

Tajaajila barbaadde filadhu:

📝 Qormaata Uumi
📖 Qormaata Fudhadhu
📊 Qabxii Koo
👨‍🏫 Qormaata Koo
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
    action: "create_title",
    exam: {
      questions: []
    }
  });

  await sendMessage(
    chatId,
    `📝 *Qormaata Uumi*

Maqaa qormaataa galchi.

Fakkeenya:
Qormaata Herregaa Kutaa 8`,
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

  const lastRows = await db(
    `
    SELECT code
    FROM exams
    ORDER BY id DESC
    LIMIT 1
    `
  );

  let code = "1001";

  if (lastRows.length) {
    const n = parseInt(
      lastRows[0].code,
      10
    );

    if (!isNaN(n)) {
      code = String(n + 1);
    }
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
      ($1,$2,$3,$4,$5)
    RETURNING id
    `,
    [
      code,
      exam.title,
      exam.subject,
      chatId,
      exam.duration
    ]
  );

  const examId = examRows[0].id;

  for (
    let i = 0;
    i < exam.questions.length;
    i++
  ) {
    const q = exam.questions[i];

    const rows = await db(
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
        ($1,$2,$3,$4,$5)
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

    const questionId = rows[0].id;

    for (const option of q.options) {
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
          ($1,$2,$3,$4)
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

  const link = BOT_USERNAME
    ? `https://t.me/${BOT_USERNAME}?start=exam_${code}`
    : `Botiin kee keessatti Code: ${code}`;

  await sendMessage(
    chatId,
    `🎉 *QORMAATAAN UUMAMEERA!*

📚 Maqaa:
${exam.title}

📖 Barnoota:
${exam.subject}

⏱ Yeroo:
${exam.duration} daqiiqaa

❓ Gaaffii:
${exam.questions.length}

🔢 Exam Code:
*${code}*

🔗 Exam Link:
${link}

Barattoonni link ykn code kana fayyadamuun qormaata fudhachuu danda'u.`,
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
    action: "take_code"
  });

  await sendMessage(
    chatId,
    `📖 *Qormaata Fudhadhu*

Exam Code galchi.

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
    [String(code).trim()]
  );

  if (!exams.length) {
    await sendMessage(
      chatId,
      `❌ Qormaata Code *${code}* qabu hin argamne.`,
      {
        parse_mode: "Markdown",
        reply_markup: mainKeyboard()
      }
    );
    return;
  }

  const exam = exams[0];

  const questions = await db(
    `
    SELECT *
    FROM questions
    WHERE exam_id = $1
    ORDER BY question_order ASC,id ASC
    `,
    [exam.id]
  );

  if (!questions.length) {
    await sendMessage(
      chatId,
      "❌ Qormaanni kun gaaffii hin qabu."
    );
    return;
  }

  const fullQuestions = [];

  for (const q of questions) {
    const options = await db(
      `
      SELECT
        option_key,
        option_text,
        is_correct
      FROM options
      WHERE question_id = $1
      ORDER BY id ASC
      `,
      [q.id]
    );

    fullQuestions.push({
      ...q,
      options
    });
  }

  setSession(chatId, {
    action: "student_name",
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

👤 Maqaa kee galchi:`,
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

/* =========================
   START ATTEMPT
========================= */

async function startExam(chatId, studentName) {
  const session = getSession(chatId);

  const totalPoints =
    session.exam.questions.reduce(
      (sum, q) =>
        sum + Number(q.points || 1),
      0
    );

  const rows = await db(
    `
    INSERT INTO attempts
      (
        exam_id,
        student_id,
        student_name,
        total_points
      )
    VALUES
      ($1,$2,$3,$4)
    RETURNING id, started_at
    `,
    [
      session.exam.id,
      chatId,
      studentName,
      totalPoints
    ]
  );

  setSession(chatId, {
    action: "answer",
    studentName,
    attemptId: rows[0].id,
    startedAt: new Date(rows[0].started_at).getTime(),
    questionIndex: 0,
    score: 0
  });

  await sendMessage(
    chatId,
    `🚀 *Qormaanni jalqabeera!*

⏱ Yeroo:
${session.exam.duration_minutes} daqiiqaa

Deebii kee filadhu.`,
    {
      parse_mode: "Markdown"
    }
  );

  await sendQuestion(chatId);
}

/* =========================
   TIMER CHECK
========================= */

function timeExpired(session) {
  if (!session.startedAt) {
    return false;
  }

  const duration =
    Number(session.exam.duration_minutes || 30) *
    60 *
    1000;

  return (
    Date.now() - session.startedAt >= duration
  );
}

/* =========================
   QUESTION
========================= */

async function sendQuestion(chatId) {
  const session = getSession(chatId);

  if (timeExpired(session)) {
    await finishExam(
      chatId,
      true
    );
    return;
  }

  const q =
    session.exam.questions[
      session.questionIndex
    ];

  if (!q) {
    await finishExam(chatId);
    return;
  }

  const buttons = q.options.map(
    option => [
      {
        text:
          `${option.option_key}. ${option.option_text}`,
        callback_data:
          `answer:${q.id}:${option.option_key}`
      }
    ]
  );

  await sendMessage(
    chatId,
    `❓ *Gaaffii ${session.questionIndex + 1}/${session.exam.questions.length}*

${q.question_text}

🏆 Qabxii: ${q.points || 1}`,
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

async function handleAnswer(
  chatId,
  questionId,
  selectedOption
) {
  const session = getSession(chatId);

  if (session.action !== "answer") {
    return;
  }

  if (timeExpired(session)) {
    await finishExam(
      chatId,
      true
    );
    return;
  }

  const q =
    session.exam.questions.find(
      x => String(x.id) === String(questionId)
    );

  if (!q) {
    return;
  }

  const correct =
    q.options.find(
      x => x.is_correct
    );

  const isCorrect =
    correct &&
    correct.option_key === selectedOption;

  const points = isCorrect
    ? Number(q.points || 1)
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
      ($1,$2,$3,$4,$5)
    `,
    [
      session.attemptId,
      q.id,
      selectedOption,
      isCorrect,
      points
    ]
  );

  const score =
    Number(session.score || 0) +
    points;

  setSession(chatId, {
    score,
    questionIndex:
      session.questionIndex + 1
  });

  if (isCorrect) {
    await sendMessage(
      chatId,
      "✅ Deebiin kee sirrii dha!"
    );
  } else {
    await sendMessage(
      chatId,
      `❌ Deebiin kee sirrii miti.

✅ Deebiin sirrii:
${correct ? correct.option_key : "-"}`
    );
  }

  await sendQuestion(chatId);
}

/* =========================
   FINISH
========================= */

async function finishExam(
  chatId,
  expired = false
) {
  const session = getSession(chatId);

  if (
    !session.attemptId ||
    !session.exam
  ) {
    return;
  }

  const totalPoints =
    session.exam.questions.reduce(
      (sum, q) =>
        sum + Number(q.points || 1),
      0
    );

  const score =
    Number(session.score || 0);

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

  const correct =
    correctRows[0]?.count || 0;

  const wrong =
    wrongRows[0]?.count || 0;

  clearSession(chatId);

  await sendMessage(
    chatId,
    `${expired ? "⏰ *Yeroon Qormaataa Xumurameera!*\n\n" : "🎉 *Qormaata Xumurteetta!*\n\n"}

📚 ${session.exam.title}

👤 Barataa:
${session.studentName}

🏆 Qabxii:
*${score}/${totalPoints}*

📊 Percentage:
*${percentage}%*

✅ Sirrii:
${correct}

❌ Sirrii hin taane:
${wrong}

💾 Bu'aan kee database keessatti kuufameera.`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   STUDENT RESULTS
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
    JOIN exams e
      ON e.id = a.exam_id
    WHERE a.student_id = $1
      AND a.submitted_at IS NOT NULL
    ORDER BY a.submitted_at DESC
    LIMIT 20
    `,
    [chatId]
  );

  if (!rows.length) {
    await sendMessage(
      chatId,
      `📊 *Qabxii Koo*

Qormaata xumurte hin qabdu.`,
      {
        parse_mode: "Markdown"
      }
    );
    return;
  }

  let text =
    "📊 *QABXII KOO*\n\n";

  rows.forEach((r, i) => {
    text +=
      `${i + 1}. *${r.title}*\n` +
      `📖 ${r.subject || "-"}\n` +
      `🏆 ${r.score}/${r.total_points}\n` +
      `📊 ${r.percentage}%\n\n`;
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
   TEACHER EXAMS
========================= */

async function myExams(chatId) {
  const exams = await db(
    `
    SELECT
      e.id,
      e.code,
      e.title,
      e.subject,
      e.duration_minutes,
      COUNT(q.id)::int AS questions
    FROM exams e
    LEFT JOIN questions q
      ON q.exam_id = e.id
    WHERE e.creator_id = $1
    GROUP BY e.id
    ORDER BY e.created_at DESC
    `,
    [chatId]
  );

  if (!exams.length) {
    await sendMessage(
      chatId,
      "👨‍🏫 Ati hanga ammaatti qormaata hin uumne."
    );
    return;
  }

  let text =
    "👨‍🏫 *QORMAATA KOO*\n\n";

  exams.forEach((e, i) => {
    text +=
      `${i + 1}. *${e.title}*\n` +
      `📖 ${e.subject || "-"}\n` +
      `🔢 Code: *${e.code}*\n` +
      `❓ Gaaffii: ${e.questions}\n` +
      `⏱ ${e.duration_minutes} daqiiqaa\n\n`;
  });

  await sendMessage(
    chatId,
    text,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: exams.map(e => [
          {
            text: `📊 Bu'aa ${e.code}`,
            callback_data: `results:${e.id}`
          }
        ])
      }
    }
  );
}

/* =========================
   TEACHER RESULTS
========================= */

async function teacherResults(
  chatId,
  examId
) {
  const exams = await db(
    `
    SELECT *
    FROM exams
    WHERE id = $1
      AND creator_id = $2
    `,
    [examId, chatId]
  );

  if (!exams.length) {
    await sendMessage(
      chatId,
      "❌ Qormaata kana ilaaluuf hayyama hin qabdu."
    );
    return;
  }

  const exam = exams[0];

  const results = await db(
    `
    SELECT
      student_name,
      student_id,
      score,
      total_points,
      percentage,
      submitted_at
    FROM attempts
    WHERE exam_id = $1
      AND submitted_at IS NOT NULL
    ORDER BY percentage DESC
    `,
    [examId]
  );

  if (!results.length) {
    await sendMessage(
      chatId,
      `📊 *Bu'aa Qormaataa*

📚 ${exam.title}

Barataan qormaata kana hin xumurre.`,
      {
        parse_mode: "Markdown"
      }
    );
    return;
  }

  let text =
    `📊 *BU'AA QORMAATAA*\n\n` +
    `📚 *${exam.title}*\n` +
    `🔢 Code: ${exam.code}\n\n`;

  results.forEach((r, i) => {
    text +=
      `${i + 1}. 👤 ${r.student_name}\n` +
      `🏆 ${r.score}/${r.total_points}\n` +
      `📊 ${r.percentage}%\n\n`;
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
   PROFILE
========================= */

async function profile(chatId) {
  const users = await db(
    `
    SELECT *
    FROM users
    WHERE id = $1
    `,
    [chatId]
  );

  if (!users.length) {
    return;
  }

  const user = users[0];

  const created = await db(
    `
    SELECT COUNT(*)::int AS count
    FROM exams
    WHERE creator_id = $1
    `,
    [chatId]
  );

  const taken = await db(
    `
    SELECT COUNT(*)::int AS count
    FROM attempts
    WHERE student_id = $1
    `,
    [chatId]
  );

  await sendMessage(
    chatId,
    `👤 *PROFILE*

👤 Maqaa:
${user.first_name || ""} ${user.last_name || ""}

🔹 Username:
@${user.username || "-"}

📝 Qormaata uumte:
${created[0].count}

📖 Qormaata fudhatte:
${taken[0].count}

🆔 Telegram ID:
${user.id}`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   EDUCATION
========================= */

async function education(chatId) {
  await sendMessage(
    chatId,
    `📚 *BARNOOTA*

Waamara keessatti tajaajiloota barnootaa:

📖 Barnoota
📝 Qormaata
❓ Gaaffii fi Deebii
🎓 Shaakala
📊 Bu'aa barattootaa

Tajaajiloota dabalataa gara fuulduraatti ni daballa.`,
    {
      parse_mode: "Markdown",
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   OTHER
========================= */

async function otherServices(chatId) {
  await sendMessage(
    chatId,
    `💼 *HOJIIWWAN BIROO*

Waamara gara fuulduraatti:

🔎 Barbaacha
📢 Beeksisa
📚 Faayila barnootaa
❓ Gaaffii fi deebii
👥 Hawaasa
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
  if (!message?.chat) return;

  const chatId = message.chat.id;
  const user = message.from || {};
  const text = (message.text || "").trim();

  await saveUser(user);

  if (text.startsWith("/start")) {
    const parts = text.split(" ");

    let examCode = null;

    if (
      parts[1] &&
      parts[1].startsWith("exam_")
    ) {
      examCode =
        parts[1].replace(
          "exam_",
          ""
        );
    }

    await startBot(
      chatId,
      user,
      examCode
    );

    return;
  }

  if (
    text === "❌ Haqi" ||
    text === "/cancel"
  ) {
    clearSession(chatId);

    await sendMessage(
      chatId,
      "❌ Hojichi haqameera.",
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  const session =
    getSession(chatId);

  /* CREATE */

  if (text === "📝 Qormaata Uumi") {
    await createExamStart(chatId);
    return;
  }

  if (
    session.action === "create_title"
  ) {
    session.exam.title = text;
    session.action = "create_subject";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "📖 Barnoota/Subject galchi."
    );

    return;
  }

  if (
    session.action === "create_subject"
  ) {
    session.exam.subject = text;
    session.action = "create_duration";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "⏱ Yeroo qormaataa daqiiqaan galchi.\n\nFakkeenya: 30"
    );

    return;
  }

  if (
    session.action === "create_duration"
  ) {
    const duration =
      parseInt(text, 10);

    if (
      isNaN(duration) ||
      duration <= 0
    ) {
      await sendMessage(
        chatId,
        "❌ Lakkoofsa sirrii galchi. Fakkeenya: 30"
      );
      return;
    }

    session.exam.duration =
      duration;

    session.action =
      "create_question";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      `❓ Gaaffii #${session.exam.questions.length + 1} galchi.`
    );

    return;
  }

  if (
    session.action ===
    "create_question"
  ) {
    session.exam.questions.push({
      text,
      options: [],
      correct: null
    });

    session.action =
      "option_a";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "🅰️ Filannoo A galchi."
    );

    return;
  }

  if (
    session.action === "option_a"
  ) {
    const q =
      session.exam.questions.at(-1);

    q.options.push({
      key: "A",
      text
    });

    session.action =
      "option_b";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "🅱️ Filannoo B galchi."
    );

    return;
  }

  if (
    session.action === "option_b"
  ) {
    const q =
      session.exam.questions.at(-1);

    q.options.push({
      key: "B",
      text
    });

    session.action =
      "option_c";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "©️ Filannoo C galchi."
    );

    return;
  }

  if (
    session.action === "option_c"
  ) {
    const q =
      session.exam.questions.at(-1);

    q.options.push({
      key: "C",
      text
    });

    session.action =
      "option_d";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "🅳 Filannoo D galchi."
    );

    return;
  }

  if (
    session.action === "option_d"
  ) {
    const q =
      session.exam.questions.at(-1);

    q.options.push({
      key: "D",
      text
    });

    session.action =
      "correct";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      "✅ Deebii sirrii galchi: A, B, C ykn D."
    );

    return;
  }

  if (
    session.action === "correct"
  ) {
    const answer =
      text.toUpperCase();

    if (
      !["A", "B", "C", "D"].includes(
        answer
      )
    ) {
      await sendMessage(
        chatId,
        "❌ A, B, C ykn D qofa galchi."
      );
      return;
    }

    const q =
      session.exam.questions.at(-1);

    q.correct = answer;

    session.action =
      "more_questions";

    setSession(chatId, session);

    await sendMessage(
      chatId,
      `✅ Gaaffiin qophaa'eera.

Gaaffii biraa dabalaa?
👉 Eeyyee
👉 Lakki`,
      {
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

  if (
    session.action ===
    "more_questions"
  ) {
    if (
      text.toLowerCase() ===
      "eeyyee"
    ) {
      session.action =
        "create_question";

      setSession(chatId, session);

      await sendMessage(
        chatId,
        `❓ Gaaffii #${session.exam.questions.length + 1} galchi.`
      );

      return;
    }

    if (
      text.toLowerCase() ===
      "lakki"
    ) {
      await saveExam(chatId);
      return;
    }

    await sendMessage(
      chatId,
      "👉 Eeyyee ykn Lakki jedhii deebisi."
    );

    return;
  }

  /* TAKE */

  if (
    text === "📖 Qormaata Fudhadhu"
  ) {
    await takeExamStart(chatId);
    return;
  }

  if (
    session.action === "take_code"
  ) {
    await loadExam(
      chatId,
      text
    );
    return;
  }

  if (
    session.action === "student_name"
  ) {
    if (text.length < 2) {
      await sendMessage(
        chatId,
        "❌ Maqaa sirrii galchi."
      );
      return;
    }

    await startExam(
      chatId,
      text
    );

    return;
  }

  /* RESULTS */

  if (
    text === "📊 Qabxii Koo"
  ) {
    await myResults(chatId);
    return;
  }

  /* TEACHER */

  if (
    text === "👨‍🏫 Qormaata Koo"
  ) {
    await myExams(chatId);
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

  if (
    text === "💼 Hojiiwwan Biroo"
  ) {
    await otherServices(chatId);
    return;
  }

  await sendMessage(
    chatId,
    "🤖 Maaloo menu keessaa filadhu.",
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   CALLBACK
========================= */

async function handleCallback(callback) {
  if (!callback?.message) {
    return;
  }

  const chatId =
    callback.message.chat.id;

  const data =
    callback.data || "";

  await answerCallback(
    callback.id
  );

  if (
    data.startsWith("answer:")
  ) {
    const parts =
      data.split(":");

    await handleAnswer(
      chatId,
      parts[1],
      parts[2]
    );

    return;
  }

  if (
    data.startsWith("results:")
  ) {
    const examId =
      data.split(":")[1];

    await teacherResults(
      chatId,
      examId
    );

    return;
  }
}

/* =========================
   POLLING
========================= */

let offset = 0;
let polling = false;

async function pollTelegram() {
  if (polling) return;

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

    for (const update of updates) {
      offset =
        update.update_id + 1;

      try {
        if (update.message) {
          await handleMessage(
            update.message
          );
        }

        if (update.callback_query) {
          await handleCallback(
            update.callback_query
          );
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
      "Polling error:",
      error.message
    );
  }

  polling = false;

  setTimeout(
    pollTelegram,
    1000
  );
}

/* =========================
   START
========================= */

async function start() {
  try {
    await initDatabase();

    await telegram(
      "deleteWebhook",
      {
        drop_pending_updates: false
      }
    );

    await loadBotInfo();

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
            description: "Hojii haqii"
          }
        ]
      }
    );

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
      "❌ Startup failed:",
      error
    );

    process.exit(1);
  }
}

start();
