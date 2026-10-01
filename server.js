const express = require("express");
const https = require("https");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

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

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// =====================================
// TELEGRAM API
// =====================================

function telegram(method, data = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);

    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      res => {
        let result = "";

        res.on("data", chunk => {
          result += chunk;
        });

        res.on("end", () => {
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

    req.on("error", reject);

    req.write(body);
    req.end();
  });
}

// =====================================
// SEND MESSAGE
// =====================================

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

// =====================================
// MAIN MENU
// =====================================

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
    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: false
  };
}

// =====================================
// DATABASE INITIALIZATION
// =====================================

async function initDatabase() {
  console.log("🔄 Database initialization started...");

  // USERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY
    )
  `);

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
    CREATE UNIQUE INDEX IF NOT EXISTS
    users_telegram_id_unique
    ON users (telegram_id)
  `);

  // EXAMS
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

  // QUESTIONS
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

  // OPTIONS
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

  // ATTEMPTS
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

  // ANSWERS
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

// =====================================
// USER
// =====================================

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

// =====================================
// SESSION
// =====================================

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      state: null,
      data: {}
    });
  }

  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.delete(userId);
}

// =====================================
// START
// =====================================

async function handleStart(msg) {
  const chatId = msg.chat.id;

  clearSession(msg.from.id);

  const text = `
🤖 <b>Baga nagaan dhuftan gara Waamara!</b>

🎓 Waamara jechuun bot barnootaa fi qormaataa ti.

As keessatti:

📝 Qormaata uumuu dandeessa
📖 Qormaata fudhachuu dandeessa
📊 Qabxii kee ilaaluu dandeessa
👨‍🏫 Qormaata kee fi bu'aa barattootaa ilaaluu dandeessa
📚 Barnoota argachuu dandeessa
👤 Profile kee ilaaluu dandeessa

👇 <b>Mee menu keessaa filadhu.</b>
`;

  await sendMessage(chatId, text, {
    reply_markup: mainKeyboard()
  });
}

// =====================================
// MENU
// =====================================

async function handleMenu(msg) {
  clearSession(msg.from.id);

  await sendMessage(
    msg.chat.id,
    `
🏠 <b>Menuu Waamara</b>

Mee tajaajila barbaadde filadhu.
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// =====================================
// CREATE EXAM
// =====================================

async function startCreateExam(msg) {
  const session = getSession(msg.from.id);

  session.state = "exam_title";
  session.data = {};

  await sendMessage(
    msg.chat.id,
    `
📝 <b>Qormaata Uumi</b>

Maqaa qormaataa galchi.

Fakkeenya:
<b>Qormaata Herregaa Kutaa 8</b>

❌ Haquuf /cancel barreessi.
`
  );
}

async function handleExamTitle(msg, session) {
  session.data.title = msg.text.trim();
  session.state = "exam_subject";

  await sendMessage(
    msg.chat.id,
    `
📚 Subject / Barnoota qormaataa galchi.

Fakkeenya:
<b>Herrega</b>
`
  );
}

async function handleExamSubject(msg, session) {
  session.data.subject = msg.text.trim();
  session.state = "exam_duration";

  await sendMessage(
    msg.chat.id,
    `
⏱️ Yeroo qormaataa meeqa?

Daqiiqaa meeqa akka ta'e lakkoofsaan galchi.

Fakkeenya:
<b>30</b>
`
  );
}

async function handleExamDuration(msg, session) {
  const duration = Number(msg.text.trim());

  if (!Number.isInteger(duration) || duration <= 0) {
    await sendMessage(
      msg.chat.id,
      "❌ Lakkoofsa daqiiqaa sirrii galchi. Fakkeenya: <b>30</b>"
    );
    return;
  }

  session.data.duration = duration;
  session.data.questions = [];
  session.state = "question_text";

  await sendMessage(
    msg.chat.id,
    `
❓ <b>Gaaffii 1ffaa</b>

Gaaffii kee barreessi.
`
  );
}

async function handleQuestionText(msg, session) {
  session.data.currentQuestion = {
    text: msg.text.trim()
  };

  session.state = "option_a";

  await sendMessage(
    msg.chat.id,
    "🅰️ Filannoo A galchi."
  );
}

async function handleOptionA(msg, session) {
  session.data.currentQuestion.a = msg.text.trim();
  session.state = "option_b";

  await sendMessage(
    msg.chat.id,
    "🅱️ Filannoo B galchi."
  );
}

async function handleOptionB(msg, session) {
  session.data.currentQuestion.b = msg.text.trim();
  session.state = "option_c";

  await sendMessage(
    msg.chat.id,
    "©️ Filannoo C galchi."
  );
}

async function handleOptionC(msg, session) {
  session.data.currentQuestion.c = msg.text.trim();
  session.state = "option_d";

  await sendMessage(
    msg.chat.id,
    "🅳 Filannoo D galchi."
  );
}

async function handleOptionD(msg, session) {
  session.data.currentQuestion.d = msg.text.trim();
  session.state = "correct_answer";

  await sendMessage(
    msg.chat.id,
    `
✅ Deebii sirrii filadhu.

A, B, C ykn D qofa barreessi.
`
  );
}

async function handleCorrectAnswer(msg, session) {
  const answer = msg.text.trim().toUpperCase();

  if (!["A", "B", "C", "D"].includes(answer)) {
    await sendMessage(
      msg.chat.id,
      "❌ A, B, C ykn D keessaa tokko galchi."
    );
    return;
  }

  const q = session.data.currentQuestion;

  q.correct = answer;

  session.data.questions.push(q);
  session.data.currentQuestion = null;
  session.state = "more_question";

  await sendMessage(
    msg.chat.id,
    `
✅ Gaaffiin galmaa'e.

Gaaffii biraa dabaluuf:
<b>1</b>

Qormaata xumuruuf:
<b>2</b>
`
  );
}

async function handleMoreQuestion(msg, session) {
  const answer = msg.text.trim();

  if (answer === "1") {
    session.state = "question_text";

    await sendMessage(
      msg.chat.id,
      `
❓ <b>Gaaffii ${session.data.questions.length + 1}ffaa</b>

Gaaffii barreessi.
`
    );

    return;
  }

  if (answer === "2") {
    await saveExam(msg, session);
    return;
  }

  await sendMessage(
    msg.chat.id,
    "❌ 1 ykn 2 qofa galchi."
  );
}

// =====================================
// SAVE EXAM
// =====================================

function generateExamCode() {
  return String(
    Math.floor(100000 + Math.random() * 900000)
  );
}

async function saveExam(msg, session) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let code = generateExamCode();

    let check = await client.query(
      "SELECT id FROM exams WHERE code = $1",
      [code]
    );

    while (check.rows.length > 0) {
      code = generateExamCode();

      check = await client.query(
        "SELECT id FROM exams WHERE code = $1",
        [code]
      );
    }

    const examResult = await client.query(
      `
      INSERT INTO exams
        (code, title, subject, duration, teacher_id)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        code,
        session.data.title,
        session.data.subject,
        session.data.duration,
        msg.from.id
      ]
    );

    const examId = examResult.rows[0].id;

    for (const q of session.data.questions) {
      const questionResult = await client.query(
        `
        INSERT INTO questions
          (exam_id, question_text, correct_answer, points)
        VALUES
          ($1, $2, $3, $4)
        RETURNING id
        `,
        [
          examId,
          q.text,
          q.correct,
          1
        ]
      );

      const questionId = questionResult.rows[0].id;

      await client.query(
        `
        INSERT INTO options
          (question_id, option_key, option_text)
        VALUES
          ($1, 'A', $2),
          ($1, 'B', $3),
          ($1, 'C', $4),
          ($1, 'D', $5)
        `,
        [
          questionId,
          q.a,
          q.b,
          q.c,
          q.d
        ]
      );
    }

    await client.query("COMMIT");

    const title = session.data.title;
    const subject = session.data.subject;
    const duration = session.data.duration;
    const questionCount = session.data.questions.length;

    clearSession(msg.from.id);

    await sendMessage(
      msg.chat.id,
      `
🎉 <b>Qormaanni uumameera!</b>

📚 Maqaa: <b>${title}</b>
📖 Subject: <b>${subject}</b>
⏱️ Yeroo: <b>${duration} daqiiqaa</b>
❓ Gaaffilee: <b>${questionCount}</b>

🔑 <b>Exam Code:</b>
<code>${code}</code>

📤 Code kana barattootaaf qoodi.
`,
      {
        reply_markup: mainKeyboard()
      }
    );

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "❌ Save exam error:",
      error.message
    );

    await sendMessage(
      msg.chat.id,
      "❌ Qormaata kuusuu irratti rakkoon uumame."
    );

  } finally {
    client.release();
  }
}

// =====================================
// TAKE EXAM
// =====================================

async function startTakeExam(msg) {
  const session = getSession(msg.from.id);

  session.state = "enter_exam_code";
  session.data = {};

  await sendMessage(
    msg.chat.id,
    `
📖 <b>Qormaata Fudhadhu</b>

🔑 Exam Code galchi.

Fakkeenya:
<code>123456</code>
`
  );
}

async function handleExamCode(msg, session) {
  const code = msg.text.trim();

  const result = await pool.query(
    `
    SELECT *
    FROM exams
    WHERE code = $1
    `,
    [code]
  );

  if (result.rows.length === 0) {
    await sendMessage(
      msg.chat.id,
      "❌ Exam Code kun hin argamne."
    );
    return;
  }

  session.data.exam = result.rows[0];
  session.state = "student_name";

  await sendMessage(
    msg.chat.id,
    `
✅ Qormaanni argameera.

📚 <b>${result.rows[0].title}</b>

👤 Maqaa kee guutuu galchi.
`
  );
}

async function handleStudentName(msg, session) {
  const name = msg.text.trim();

  if (!name) {
    await sendMessage(
      msg.chat.id,
      "❌ Maaloo maqaa kee galchi."
    );
    return;
  }

  const exam = session.data.exam;

  const result = await pool.query(
    `
    INSERT INTO attempts
      (exam_id, student_id, student_name)
    VALUES
      ($1, $2, $3)
    RETURNING id
    `,
    [
      exam.id,
      msg.from.id,
      name
    ]
  );

  session.data.attemptId = result.rows[0].id;
  session.data.questionIndex = 0;
  session.state = "answering";

  await sendQuestion(
    msg.chat.id,
    session
  );
}

// =====================================
// SEND QUESTION
// =====================================

async function sendQuestion(chatId, session) {
  const examId = session.data.exam.id;
  const index = session.data.questionIndex;

  const result = await pool.query(
    `
    SELECT
      q.id,
      q.question_text,
      o.option_key,
      o.option_text
    FROM questions q
    JOIN options o
      ON o.question_id = q.id
    WHERE q.exam_id = $1
    ORDER BY q.id, o.id
    `,
    [examId]
  );

  const grouped = {};

  for (const row of result.rows) {
    if (!grouped[row.id]) {
      grouped[row.id] = {
        id: row.id,
        text: row.question_text,
        options: []
      };
    }

    grouped[row.id].options.push({
      key: row.option_key,
      text: row.option_text
    });
  }

  const questions = Object.values(grouped);

  if (index >= questions.length) {
    await finishAttempt(
      chatId,
      session
    );
    return;
  }

  const question = questions[index];

  session.data.currentQuestionId = question.id;

  const buttons = question.options.map(
    option => [
      {
        text: `${option.key}. ${option.text}`,
        callback_data: `answer_${option.key}`
      }
    ]
  );

  await sendMessage(
    chatId,
    `
❓ <b>Gaaffii ${index + 1}/${questions.length}</b>

${question.text}
`,
    {
      reply_markup: {
        inline_keyboard: buttons
      }
    }
  );
}

// =====================================
// CALLBACK
// =====================================

async function handleCallback(callback) {
  const data = callback.data || "";

  if (!data.startsWith("answer_")) {
    return;
  }

  const userId = callback.from.id;
  const session = getSession(userId);

  if (session.state !== "answering") {
    await telegram(
      "answerCallbackQuery",
      {
        callback_query_id: callback.id,
        text: "Qormaanni kun hin banamne."
      }
    );

    return;
  }

  const answer = data.replace(
    "answer_",
    ""
  );

  const questionId =
    session.data.currentQuestionId;

  const attemptId =
    session.data.attemptId;

  const result = await pool.query(
    `
    SELECT correct_answer
    FROM questions
    WHERE id = $1
    `,
    [questionId]
  );

  if (result.rows.length === 0) {
    return;
  }

  const correct =
    result.rows[0].correct_answer;

  const isCorrect =
    answer === correct;

  await pool.query(
    `
    INSERT INTO answers
      (attempt_id, question_id, answer, is_correct)
    VALUES
      ($1, $2, $3, $4)
    `,
    [
      attemptId,
      questionId,
      answer,
      isCorrect
    ]
  );

  await telegram(
    "answerCallbackQuery",
    {
      callback_query_id: callback.id,
      text: isCorrect
        ? "✅ Deebii sirrii!"
        : "❌ Deebii sirrii miti."
    }
  );

  session.data.questionIndex++;

  await sendQuestion(
    callback.message.chat.id,
    session
  );
}

// =====================================
// FINISH ATTEMPT
// =====================================

async function finishAttempt(chatId, session) {
  const attemptId =
    session.data.attemptId;

  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE is_correct = TRUE
      )::int AS score
    FROM answers
    WHERE attempt_id = $1
    `,
    [attemptId]
  );

  const total =
    result.rows[0].total;

  const score =
    result.rows[0].score;

  const percentage =
    total > 0
      ? Math.round(
          (score / total) * 100
        )
      : 0;

  await pool.query(
    `
    UPDATE attempts
    SET
      score = $1,
      total = $2,
      percentage = $3,
      finished_at = CURRENT_TIMESTAMP
    WHERE id = $4
    `,
    [
      score,
      total,
      percentage,
      attemptId
    ]
  );

  clearSession(
    session.userId
  );

  await sendMessage(
    chatId,
    `
🏁 <b>Qormaanni xumurameera!</b>

📊 <b>Bu'aa kee</b>

✅ Sirrii: <b>${score}</b>
❓ Waliigala: <b>${total}</b>
📈 Qabxii: <b>${percentage}%</b>

Galatoomi!
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// =====================================
// MY SCORES
// =====================================

async function showMyScores(msg) {
  const result = await pool.query(
    `
    SELECT
      a.student_name,
      e.title,
      a.score,
      a.total,
      a.percentage
    FROM attempts a
    JOIN exams e
      ON e.id = a.exam_id
    WHERE a.student_id = $1
    ORDER BY a.id DESC
    LIMIT 20
    `,
    [msg.from.id]
  );

  if (result.rows.length === 0) {
    await sendMessage(
      msg.chat.id,
      `
📊 <b>Qabxii Koo</b>

Ammaaf qormaata fudhatte hin qabdu.
`,
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  let text =
    "📊 <b>Qabxii Koo</b>\n\n";

  result.rows.forEach(
    (row, index) => {
      text += `
${index + 1}. 📚 <b>${row.title}</b>
👤 ${row.student_name}
✅ ${row.score}/${row.total}
📈 ${row.percentage}%

`;
    }
  );

  await sendMessage(
    msg.chat.id,
    text,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// =====================================
// MY EXAMS
// =====================================

async function showMyExams(msg) {
  const result = await pool.query(
    `
    SELECT
      e.code,
      e.title,
      e.subject,
      e.duration,
      COUNT(q.id)::int AS questions
    FROM exams e
    LEFT JOIN questions q
      ON q.exam_id = e.id
    WHERE e.teacher_id = $1
    GROUP BY e.id
    ORDER BY e.id DESC
    LIMIT 20
    `,
    [msg.from.id]
  );

  if (result.rows.length === 0) {
    await sendMessage(
      msg.chat.id,
      `
👨‍🏫 <b>Qormaata Koo</b>

Ati amma qormaata hin uumne.
`,
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  let text =
    "👨‍🏫 <b>Qormaata Koo</b>\n\n";

  for (const exam of result.rows) {
    text += `
📚 <b>${exam.title}</b>
📖 ${exam.subject || "-"}
⏱️ ${exam.duration} daqiiqaa
❓ ${exam.questions} gaaffii
🔑 Code: <code>${exam.code}</code>

`;
  }

  await sendMessage(
    msg.chat.id,
    text,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// =====================================
// PROFILE
// =====================================

async function showProfile(msg) {
  const result = await pool.query(
    `
    SELECT *
    FROM users
    WHERE telegram_id = $1
    `,
    [msg.from.id]
  );

  const user =
    result.rows[0] || msg.from;

  await sendMessage(
    msg.chat.id,
    `
👤 <b>Profile</b>

🆔 Telegram ID:
<code>${msg.from.id}</code>

👤 Maqaa:
<b>${user.first_name || "-"}</b>

🔹 Username:
<b>${
      user.username
        ? "@" + user.username
        : "-"
    }</b>
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// =====================================
// EDUCATION
// =====================================

async function showEducation(msg) {
  await sendMessage(
    msg.chat.id,
    `
📚 <b>Barnoota</b>

🎓 Tajaajiloota barnootaa:

📖 Barnoota adda addaa
📝 Gaaffilee shaakalaa
📝 Qormaata
📊 Bu'aa fi qabxii
🎯 Gorsa barnootaa

🚀 Tajaajiloonni dabalataa gara fuulduraatti ni dhufu.
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// =====================================
// OTHER SERVICES
// =====================================

async function showOtherServices(msg) {
  await sendMessage(
    msg.chat.id,
    `
💼 <b>Hojiiwwan Biroo</b>

🔎 Barbaacha barnootaa
📚 Kitaabota fi barruulee
📝 Shaakala gaaffii
🎓 Tajaajila barattootaa

🚀 Tajaajiloonni dabalataa gara fuulduraatti ni dhufu.
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// =====================================
// MESSAGE HANDLER
// =====================================

async function handleMessage(msg) {
  if (!msg || !msg.from || !msg.chat) {
    return;
  }

  await saveUser(msg);

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // START
  if (
    text === "/start" ||
    text === "start" ||
    text === "Start"
  ) {
    await handleStart(msg);
    return;
  }

  // MENU
  if (
    text === "/menu" ||
    text === "menu" ||
    text === "Menu"
  ) {
    await handleMenu(msg);
    return;
  }

  // CANCEL
  if (text === "/cancel") {
    clearSession(userId);

    await sendMessage(
      chatId,
      "❌ Hojii haqameera.",
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  const session =
    getSession(userId);

  // MAIN MENU
  if (text === "📝 Qormaata Uumi") {
    await startCreateExam(msg);
    return;
  }

  if (text === "📖 Qormaata Fudhadhu") {
    await startTakeExam(msg);
    return;
  }

  if (text === "📊 Qabxii Koo") {
    await showMyScores(msg);
    return;
  }

  if (text === "👨‍🏫 Qormaata Koo") {
    await showMyExams(msg);
    return;
  }

  if (text === "📚 Barnoota") {
    await showEducation(msg);
    return;
  }

  if (text === "👤 Profile") {
    await showProfile(msg);
    return;
  }

  if (text === "💼 Hojiiwwan Biroo") {
    await showOtherServices(msg);
    return;
  }

  // CREATE EXAM
  if (session.state === "exam_title") {
    await handleExamTitle(
      msg,
      session
    );
    return;
  }

  if (session.state === "exam_subject") {
    await handleExamSubject(
      msg,
      session
    );
    return;
  }

  if (session.state === "exam_duration") {
    await handleExamDuration(
      msg,
      session
    );
    return;
  }

  if (session.state === "question_text") {
    await handleQuestionText(
      msg,
      session
    );
    return;
  }

  if (session.state === "option_a") {
    await handleOptionA(
      msg,
      session
    );
    return;
  }

  if (session.state === "option_b") {
    await handleOptionB(
      msg,
      session
    );
    return;
  }

  if (session.state === "option_c") {
    await handleOptionC(
      msg,
      session
    );
    return;
  }

  if (session.state === "option_d") {
    await handleOptionD(
      msg,
      session
    );
    return;
  }

  if (session.state === "correct_answer") {
    await handleCorrectAnswer(
      msg,
      session
    );
    return;
  }

  if (session.state === "more_question") {
    await handleMoreQuestion(
      msg,
      session
    );
    return;
  }

  // TAKE EXAM
  if (
    session.state === "enter_exam_code"
  ) {
    await handleExamCode(
      msg,
      session
    );
    return;
  }

  if (
    session.state === "student_name"
  ) {
    await handleStudentName(
      msg,
      session
    );
    return;
  }

  // UNKNOWN
  await sendMessage(
    chatId,
    `
❓ Ajaja kana hin hubanne.

🏠 Mee menuu keessaa filadhu.
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// =====================================
// CALLBACK HANDLER
// =====================================

async function processUpdate(update) {
  try {
    if (update.callback_query) {
      await handleCallback(
        update.callback_query
      );
      return;
    }

    if (update.message) {
      await handleMessage(
        update.message
      );
    }
  } catch (error) {
    console.error(
      "❌ Update error:",
      error.message
    );

    try {
      if (update.message) {
        await sendMessage(
          update.message.chat.id,
          "❌ Rakkoon uumame. Mee irra deebi'i."
        );
      }
    } catch (_) {}
  }
}

// =====================================
// POLLING
// =====================================

let offset = 0;
let pollingStarted = false;

async function startPolling() {
  if (pollingStarted) {
    return;
  }

  pollingStarted = true;

  console.log(
    "🤖 Waamara polling started..."
  );

  try {
    await telegram(
      "deleteWebhook",
      {
        drop_pending_updates: false
      }
    );

    console.log(
      "✅ Telegram webhook cleared."
    );
  } catch (error) {
    console.error(
      "Webhook error:",
      error.message
    );
  }

  try {
    await telegram(
      "setMyCommands",
      {
        commands: [
          {
            command: "start",
            description:
              "Waamara jalqabi"
          },
          {
            command: "menu",
            description:
              "Menuu bani"
          },
          {
            command: "cancel",
            description:
              "Hojii haqii"
          }
        ]
      }
    );

    console.log(
      "✅ Telegram commands set."
    );
  } catch (error) {
    console.error(
      "Commands error:",
      error.message
    );
  }

  while (true) {
    try {
      const updates =
        await telegram(
          "getUpdates",
          {
            offset,
            timeout: 30,
            allowed_updates: [
              "message",
              "callback_query"
            ]
          }
        );

      for (const update of updates) {
        offset =
          update.update_id + 1;

        await processUpdate(
          update
        );
      }

    } catch (error) {
      console.error(
        "Polling error:",
        error.message
      );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            5000
          )
      );
    }
  }
}

// =====================================
// WEB SERVER
// =====================================

app.get("/", (req, res) => {
  res.send(`
    <h1>🤖 Waamara Bot</h1>
    <p>Waamara Telegram Bot online dha.</p>
  `);
});

app.get("/health", async (req, res) => {
  try {
    await pool.query(
      "SELECT 1"
    );

    res.json({
      ok: true,
      app: "Waamara",
      database: "connected"
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      app: "Waamara",
      database: "error",
      message: error.message
    });
  }
});

// =====================================
// START SERVER
// =====================================

app.listen(
  PORT,
  "0.0.0.0",
  async () => {
    console.log(
      `🚀 Waamara server running on port ${PORT}`
    );

    try {
      await initDatabase();
      await startPolling();
    } catch (error) {
      console.error(
        "❌ Startup error:",
        error
      );
    }
  }
);
