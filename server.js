const express = require("express");
const https = require("https");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!TELEGRAM_BOT_TOKEN) {
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

// ===============================
// EXPRESS
// ===============================

app.get("/", (req, res) => {
  res.send(`
    <h1>🤖 Waamara Bot</h1>
    <p>Waamara Telegram Bot online dha.</p>
    <p>Qormaata uumuu, fudhachuu fi qabxii ilaaluuf tajaajila.</p>
  `);
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
      bot: "Waamara"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      error: error.message
    });
  }
});

// ===============================
// TELEGRAM API
// ===============================

function telegram(method, data = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);

    const request = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TELEGRAM_BOT_TOKEN}/${method}`,
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

    request.write(body);
    request.end();
  });
}

// ===============================
// DATABASE
// ===============================

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exams (
      id BIGSERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subject TEXT,
      creator_id BIGINT REFERENCES users(id),
      duration_minutes INTEGER DEFAULT 30,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id BIGSERIAL PRIMARY KEY,
      exam_id BIGINT REFERENCES exams(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_type TEXT DEFAULT 'multiple_choice',
      points INTEGER DEFAULT 1,
      question_order INTEGER
    );

    CREATE TABLE IF NOT EXISTS options (
      id BIGSERIAL PRIMARY KEY,
      question_id BIGINT REFERENCES questions(id) ON DELETE CASCADE,
      option_key TEXT NOT NULL,
      option_text TEXT NOT NULL,
      is_correct BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id BIGSERIAL PRIMARY KEY,
      exam_id BIGINT REFERENCES exams(id),
      student_id BIGINT REFERENCES users(id),
      student_name TEXT,
      score INTEGER DEFAULT 0,
      total_points INTEGER DEFAULT 0,
      percentage NUMERIC DEFAULT 0,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      submitted_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS answers (
      id BIGSERIAL PRIMARY KEY,
      attempt_id BIGINT REFERENCES attempts(id) ON DELETE CASCADE,
      question_id BIGINT REFERENCES questions(id),
      selected_option TEXT,
      is_correct BOOLEAN DEFAULT FALSE,
      points_earned INTEGER DEFAULT 0
    );
  `);

  console.log("✅ Database initialized.");
}

// ===============================
// USERS
// ===============================

async function saveUser(user) {
  await pool.query(
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

// ===============================
// KEYBOARD
// ===============================

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

// ===============================
// SEND MESSAGE
// ===============================

async function sendMessage(
  chatId,
  text,
  extra = {}
) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

// ===============================
// BOT SESSION
// ===============================

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      state: "idle"
    });
  }

  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.delete(userId);
}

// ===============================
// EXAM CODE
// ===============================

function generateExamCode() {
  return Math.floor(
    100000 + Math.random() * 900000
  ).toString();
}

// ===============================
// START
// ===============================

async function handleStart(msg) {
  const user = msg.from;
  const chatId = msg.chat.id;

  await saveUser(user);

  clearSession(user.id);

  const text = `
<b>🤖 Baga nagaan dhuftan gara Waamara!</b>

🎓 Waamara jechuun bot barnootaa fi qormaataa ti.

As keessatti:

📝 Qormaata uumuu dandeessa
📖 Qormaata fudhachuu dandeessa
📊 Qabxii kee ilaaluu dandeessa
👨‍🏫 Qormaata kee fi bu'aa barattootaa ilaaluu dandeessa
📚 Barnoota argachuu dandeessa
👤 Profile kee ilaaluu dandeessa

👇 Mee menu keessaa filadhu.
`;

  await sendMessage(chatId, text, {
    reply_markup: mainKeyboard()
  });
}

// ===============================
// CREATE EXAM
// ===============================

async function startCreateExam(msg) {
  const userId = msg.from.id;
  const session = getSession(userId);

  session.state = "create_title";
  session.exam = {
    questions: []
  };

  await sendMessage(
    msg.chat.id,
    `
<b>📝 Qormaata Uumuu</b>

Mata-duree qormaataa barreessi.

Fakkeenya:
<code>Qormaata Herregaa Kutaa 8</code>
`
  );
}

// ===============================
// HANDLE CREATE EXAM
// ===============================

async function handleCreateExam(msg, session) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (session.state === "create_title") {
    session.exam.title = text;
    session.state = "create_subject";

    await sendMessage(
      chatId,
      "📚 Maqaa barnootaa barreessi.\n\nFakkeenya: <b>Herrega</b>"
    );

    return;
  }

  if (session.state === "create_subject") {
    session.exam.subject = text;
    session.state = "create_duration";

    await sendMessage(
      chatId,
      "⏱ Yeroo qormaataa daqiiqaan barreessi.\n\nFakkeenya: <code>30</code>"
    );

    return;
  }

  if (session.state === "create_duration") {
    const duration = parseInt(text);

    if (isNaN(duration) || duration <= 0) {
      await sendMessage(
        chatId,
        "❌ Lakkoofsa sirrii galchi.\n\nFakkeenya: <code>30</code>"
      );
      return;
    }

    session.exam.duration = duration;
    session.state = "create_question";

    await sendMessage(
      chatId,
      "❓ Gaaffii 1ffaa barreessi."
    );

    return;
  }

  if (session.state === "create_question") {
    session.currentQuestion = {
      question: text,
      options: {}
    };

    session.state = "option_A";

    await sendMessage(
      chatId,
      "A) Deebii A barreessi."
    );

    return;
  }

  if (session.state === "option_A") {
    session.currentQuestion.options.A = text;
    session.state = "option_B";

    await sendMessage(
      chatId,
      "B) Deebii B barreessi."
    );

    return;
  }

  if (session.state === "option_B") {
    session.currentQuestion.options.B = text;
    session.state = "option_C";

    await sendMessage(
      chatId,
      "C) Deebii C barreessi."
    );

    return;
  }

  if (session.state === "option_C") {
    session.currentQuestion.options.C = text;
    session.state = "option_D";

    await sendMessage(
      chatId,
      "D) Deebii D barreessi."
    );

    return;
  }

  if (session.state === "option_D") {
    session.currentQuestion.options.D = text;
    session.state = "correct_answer";

    await sendMessage(
      chatId,
      `
✅ Filannoowwan galmaa'aniiru.

Deebii sirrii barreessi:

<b>A</b>
<b>B</b>
<b>C</b>
ykn
<b>D</b>
`
    );

    return;
  }

  if (session.state === "correct_answer") {
    const answer = text.toUpperCase();

    if (!["A", "B", "C", "D"].includes(answer)) {
      await sendMessage(
        chatId,
        "❌ Deebiin sirrii A, B, C ykn D ta'uu qaba."
      );
      return;
    }

    session.currentQuestion.correct = answer;

    session.exam.questions.push(
      session.currentQuestion
    );

    session.currentQuestion = null;

    session.state = "more_question";

    await sendMessage(
      chatId,
      `
✅ Gaaffiin galmaa'eera.

Gaaffii biraa dabaluuf <b>EYEE</b> barreessi.

Qormaata xumuruuf <b>LAKI</b> barreessi.
`
    );

    return;
  }

  if (session.state === "more_question") {
    const answer = text.toLowerCase();

    if (
      answer === "eeyee" ||
      answer === "yes" ||
      answer === "eeyyee"
    ) {
      session.state = "create_question";

      await sendMessage(
        chatId,
        `❓ Gaaffii ${session.exam.questions.length + 1}ffaa barreessi.`
      );

      return;
    }

    if (
      answer === "laki" ||
      answer === "lakki" ||
      answer === "no"
    ) {
      await saveExam(
        userId,
        session.exam,
        chatId
      );

      clearSession(userId);

      return;
    }

    await sendMessage(
      chatId,
      "Mee <b>EYEE</b> ykn <b>LAKI</b> barreessi."
    );
  }
}

// ===============================
// SAVE EXAM
// ===============================

async function saveExam(
  creatorId,
  exam,
  chatId
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let code;

    while (true) {
      code = generateExamCode();

      const exists = await client.query(
        "SELECT id FROM exams WHERE code = $1",
        [code]
      );

      if (exists.rowCount === 0) break;
    }

    const examResult = await client.query(
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
        creatorId,
        exam.duration
      ]
    );

    const examId = examResult.rows[0].id;

    let order = 1;
    let totalPoints = 0;

    for (const q of exam.questions) {
      const questionResult = await client.query(
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
          examId,
          q.question,
          "multiple_choice",
          1,
          order
        ]
      );

      const questionId =
        questionResult.rows[0].id;

      totalPoints += 1;

      for (const key of ["A", "B", "C", "D"]) {
        await client.query(
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
            key,
            q.options[key],
            key === q.correct
          ]
        );
      }

      order++;
    }

    await client.query("COMMIT");

    const me = await telegram("getMe");

    const botUsername = me.username;

    const link =
      `https://t.me/${botUsername}?start=exam_${code}`;

    await sendMessage(
      chatId,
      `
🎉 <b>Qormaanni uumameera!</b>

📌 <b>Mata-duree:</b> ${escapeHtml(exam.title)}

📚 <b>Barnoota:</b> ${escapeHtml(exam.subject)}

⏱ <b>Yeroo:</b> ${exam.duration} daqiiqaa

❓ <b>Gaaffilee:</b> ${exam.questions.length}

🔢 <b>Exam Code:</b>
<code>${code}</code>

🔗 <b>Linkii Qormaataa:</b>
${link}

📤 Linkii kana barattootaaf qoodi.
`,
      {
        reply_markup: mainKeyboard()
      }
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Save exam error:",
      error.message
    );

    await sendMessage(
      chatId,
      "❌ Qormaata galmeessuu irratti rakkoon uumame."
    );
  } finally {
    client.release();
  }
}

// ===============================
// TAKE EXAM
// ===============================

async function startTakeExam(msg) {
  const userId = msg.from.id;

  const session = getSession(userId);

  session.state = "enter_exam_code";

  await sendMessage(
    msg.chat.id,
    `
📖 <b>Qormaata Fudhachuu</b>

Exam Code galchi.

Fakkeenya:
<code>123456</code>
`
  );
}

// ===============================
// HANDLE TAKE EXAM
// ===============================

async function handleTakeExam(msg, session) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (session.state === "enter_exam_code") {
    const code = text;

    const result = await pool.query(
      `
      SELECT *
      FROM exams
      WHERE code = $1
      AND status = 'active'
      `,
      [code]
    );

    if (result.rowCount === 0) {
      await sendMessage(
        chatId,
        "❌ Exam Code kun hin argamne."
      );
      return;
    }

    session.exam = result.rows[0];
    session.state = "student_name";

    await sendMessage(
      chatId,
      `
✅ Qormaanni argameera.

📌 <b>${escapeHtml(
        result.rows[0].title
      )}</b>

Maqaa kee guutuu barreessi.
`
    );

    return;
  }

  if (session.state === "student_name") {
    const studentName = text;

    const attempt = await pool.query(
      `
      INSERT INTO attempts
        (
          exam_id,
          student_id,
          student_name,
          total_points
        )
      VALUES
        ($1, $2, $3, 0)
      RETURNING id
      `,
      [
        session.exam.id,
        userId,
        studentName
      ]
    );

    session.attemptId = attempt.rows[0].id;
    session.studentName = studentName;

    const questions = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE exam_id = $1
      ORDER BY question_order
      `,
      [session.exam.id]
    );

    session.questions = questions.rows;
    session.questionIndex = 0;
    session.startedAt = Date.now();

    const totalPoints =
      session.questions.length;

    await pool.query(
      `
      UPDATE attempts
      SET total_points = $1
      WHERE id = $2
      `,
      [
        totalPoints,
        session.attemptId
      ]
    );

    session.state = "answering";

    await sendQuestion(
      chatId,
      session
    );

    return;
  }
}

// ===============================
// SEND QUESTION
// ===============================

async function sendQuestion(
  chatId,
  session
) {
  if (session.questionIndex >= session.questions.length) {
    await finishExam(chatId, session);
    return;
  }

  const question =
    session.questions[
      session.questionIndex
    ];

  const options = await pool.query(
    `
    SELECT *
    FROM options
    WHERE question_id = $1
    ORDER BY option_key
    `,
    [question.id]
  );

  const keyboard = [];

  for (const option of options.rows) {
    keyboard.push([
      {
        text:
          `${option.option_key}) ${option.option_text}`,
        callback_data:
          `answer_${question.id}_${option.option_key}`
      }
    ]);
  }

  keyboard.push([
    {
      text: "⛔ Qormaata Xumuri",
      callback_data: "finish_exam"
    }
  ]);

  const elapsed =
    Date.now() - session.startedAt;

  const durationMs =
    session.exam.duration_minutes *
    60 *
    1000;

  if (elapsed >= durationMs) {
    await finishExam(chatId, session);
    return;
  }

  const number =
    session.questionIndex + 1;

  await sendMessage(
    chatId,
    `
<b>❓ Gaaffii ${number}/${session.questions.length}</b>

${escapeHtml(question.question_text)}

⏱ Yeroon:
${session.exam.duration_minutes} daqiiqaa
`,
    {
      reply_markup: {
        inline_keyboard: keyboard
      }
    }
  );
}

// ===============================
// CALLBACK ANSWER
// ===============================

async function handleCallback(query) {
  const userId = query.from.id;
  const data = query.data;
  const chatId = query.message.chat.id;

  const session = sessions.get(userId);

  if (!session) {
    await telegram("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "Session hin argamne."
    });
    return;
  }

  if (data === "finish_exam") {
    await telegram("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "Qormaanni xumuramaa jira."
    });

    await finishExam(
      chatId,
      session
    );

    return;
  }

  if (data.startsWith("answer_")) {
    const parts = data.split("_");

    const questionId = parts[1];
    const selected = parts[2];

    if (
      session.state !== "answering"
    ) {
      return;
    }

    const question =
      session.questions[
        session.questionIndex
      ];

    if (
      String(question.id) !==
      String(questionId)
    ) {
      await telegram(
        "answerCallbackQuery",
        {
          callback_query_id: query.id,
          text: "Gaaffii kun yeroo isaa darbeera."
        }
      );

      return;
    }

    const correctResult =
      await pool.query(
        `
        SELECT *
        FROM options
        WHERE question_id = $1
        AND is_correct = true
        `,
        [question.id]
      );

    const correct =
      correctResult.rows[0];

    const isCorrect =
      correct &&
      correct.option_key === selected;

    await pool.query(
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
        question.id,
        selected,
        isCorrect,
        isCorrect ? question.points : 0
      ]
    );

    await telegram(
      "answerCallbackQuery",
      {
        callback_query_id: query.id,
        text: isCorrect
          ? "✅ Sirrii!"
          : "❌ Sirrii miti."
      }
    );

    session.questionIndex++;

    await sendQuestion(
      chatId,
      session
    );
  }
}

// ===============================
// FINISH EXAM
// ===============================

async function finishExam(
  chatId,
  session
) {
  if (!session.attemptId) {
    clearSession(session.userId);
    return;
  }

  const result =
    await pool.query(
      `
      SELECT
        COALESCE(SUM(points_earned), 0) AS score,
        COUNT(*) AS answered
      FROM answers
      WHERE attempt_id = $1
      `,
      [session.attemptId]
    );

  const score =
    Number(result.rows[0].score || 0);

  const total =
    Number(
      session.questions
        ? session.questions.length
        : 0
    );

  const percentage =
    total > 0
      ? (score / total) * 100
      : 0;

  await pool.query(
    `
    UPDATE attempts
    SET
      score = $1,
      total_points = $2,
      percentage = $3,
      submitted_at = CURRENT_TIMESTAMP
    WHERE id = $4
    `,
    [
      score,
      total,
      percentage.toFixed(2),
      session.attemptId
    ]
  );

  await sendMessage(
    chatId,
    `
🎉 <b>Qormaata xumurte!</b>

👤 Barataa:
${escapeHtml(session.studentName || "")}

📊 <b>Bu'aa Kee</b>

✅ Qabxii: <b>${score}/${total}</b>

📈 Dhibbeentaa:
<b>${percentage.toFixed(2)}%</b>

🙏 Galatoomi!
`,
    {
      reply_markup: mainKeyboard()
    }
  );

  clearSession(chatId);
}

// ===============================
// STUDENT RESULTS
// ===============================

async function showMyResults(msg) {
  const userId = msg.from.id;

  const result = await pool.query(
    `
    SELECT
      a.*,
      e.title,
      e.subject
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

  if (result.rowCount === 0) {
    await sendMessage(
      msg.chat.id,
      `
📊 <b>Qabxii Koo</b>

Ammaaf qormaata xumurame hin qabdu.
`,
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  let text =
    "📊 <b>Qabxiiwwan Kee</b>\n\n";

  for (const row of result.rows) {
    text += `
📚 <b>${escapeHtml(row.title)}</b>
📝 ${escapeHtml(row.subject || "")}
🎯 ${row.score}/${row.total_points}
📈 ${Number(row.percentage).toFixed(2)}%

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

// ===============================
// TEACHER EXAMS
// ===============================

async function showTeacherExams(msg) {
  const userId = msg.from.id;

  const result =
    await pool.query(
      `
      SELECT *
      FROM exams
      WHERE creator_id = $1
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [userId]
    );

  if (result.rowCount === 0) {
    await sendMessage(
      msg.chat.id,
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

  const buttons = [];

  let text =
    "👨‍🏫 <b>Qormaata Koo</b>\n\n";

  for (const exam of result.rows) {
    text += `
📚 <b>${escapeHtml(exam.title)}</b>
🔢 Code: <code>${exam.code}</code>
⏱ ${exam.duration_minutes} daqiiqaa

`;

    buttons.push([
      {
        text:
          `📊 Bu'aa ${exam.code}`,
        callback_data:
          `results_${exam.id}`
      }
    ]);
  }

  await sendMessage(
    msg.chat.id,
    text,
    {
      reply_markup: {
        inline_keyboard: buttons
      }
    }
  );
}

// ===============================
// TEACHER RESULTS
// ===============================

async function showTeacherResults(
  query,
  examId
) {
  const teacherId = query.from.id;

  const examResult =
    await pool.query(
      `
      SELECT *
      FROM exams
      WHERE id = $1
      AND creator_id = $2
      `,
      [examId, teacherId]
    );

  if (examResult.rowCount === 0) {
    await telegram(
      "answerCallbackQuery",
      {
        callback_query_id: query.id,
        text: "Qormaata kana ilaaluu hin dandeessu."
      }
    );

    return;
  }

  const result =
    await pool.query(
      `
      SELECT
        student_name,
        score,
        total_points,
        percentage,
        submitted_at
      FROM attempts
      WHERE exam_id = $1
      AND submitted_at IS NOT NULL
      ORDER BY submitted_at DESC
      `,
      [examId]
    );

  let text =
    `
👨‍🏫 <b>Bu'aa Qormaataa</b>

📚 ${escapeHtml(
      examResult.rows[0].title
    )}

`;

  if (result.rowCount === 0) {
    text +=
      "\nBarataan qormaata kana hin xumurre.";
  } else {
    let number = 1;

    for (const row of result.rows) {
      text += `
<b>${number}. ${escapeHtml(
        row.student_name || "Barataa"
      )}</b>

🎯 ${row.score}/${row.total_points}
📈 ${Number(row.percentage).toFixed(2)}%

`;

      number++;
    }
  }

  await telegram(
    "answerCallbackQuery",
    {
      callback_query_id: query.id
    }
  );

  await sendMessage(
    query.message.chat.id,
    text,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// ===============================
// PROFILE
// ===============================

async function showProfile(msg) {
  const userId = msg.from.id;

  const userResult =
    await pool.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

  const stats =
    await pool.query(
      `
      SELECT
        (SELECT COUNT(*)
         FROM exams
         WHERE creator_id = $1) AS created,
        (SELECT COUNT(*)
         FROM attempts
         WHERE student_id = $1) AS taken
      `,
      [userId]
    );

  const user =
    userResult.rows[0];

  const created =
    stats.rows[0].created;

  const taken =
    stats.rows[0].taken;

  await sendMessage(
    msg.chat.id,
    `
👤 <b>Profile</b>

🧑 Maqaa:
${escapeHtml(
      `${user?.first_name || ""} ${user?.last_name || ""}`
    )}

🔹 Username:
@${escapeHtml(
      user?.username || "Hin qabu"
    )}

🆔 Telegram ID:
<code>${userId}</code>

📝 Qormaata uumte:
<b>${created}</b>

📖 Qormaata fudhatte:
<b>${taken}</b>
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// ===============================
// EDUCATION
// ===============================

async function showEducation(msg) {
  await sendMessage(
    msg.chat.id,
    `
📚 <b>Barnoota</b>

Waamara keessatti tajaajilawwan barnootaa gara fuulduraatti ni dabalamu.

🎓 Qormaata
📖 Barnoota
📝 Gaaffii fi Deebii
📊 Bu'aa Barattootaa
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// ===============================
// OTHER SERVICES
// ===============================

async function showOtherServices(msg) {
  await sendMessage(
    msg.chat.id,
    `
💼 <b>Hojiiwwan Biroo</b>

Tajaajilawwan dabalataa:

🔹 Qormaata
🔹 Barnoota
🔹 Bu'aa
🔹 Profile

Tajaajilawwan haaraan gara fuulduraatti ni dabalamu.
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// ===============================
// HANDLE MESSAGE
// ===============================

async function handleMessage(msg) {
  if (!msg.from || !msg.chat) {
    return;
  }

  await saveUser(msg.from);

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // /start
  if (text === "/start") {
    await handleStart(msg);
    return;
  }

  // /menu
  if (text === "/menu") {
    clearSession(userId);

    await sendMessage(
      chatId,
      "🏠 <b>Menuu Waamara</b>\n\nMee tajaajila barbaadde filadhu:",
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  // /cancel
  if (text === "/cancel") {
    clearSession(userId);

    await sendMessage(
      chatId,
      "❌ Hojii amma gochaa jirtu haqameera.",
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  const session = getSession(userId);

  // Active exam creation
  if (
    session.state &&
    session.state.startsWith("create_") ||
    [
      "option_A",
      "option_B",
      "option_C",
      "option_D",
      "correct_answer",
      "more_question"
    ].includes(session.state)
  ) {
    await handleCreateExam(
      msg,
      session
    );

    return;
  }

  // Take exam
  if (
    session.state === "enter_exam_code" ||
    session.state === "student_name"
  ) {
    await handleTakeExam(
      msg,
      session
    );

    return;
  }

  // Menu buttons
  if (text === "📝 Qormaata Uumi") {
    await startCreateExam(msg);
    return;
  }

  if (text === "📖 Qormaata Fudhadhu") {
    await startTakeExam(msg);
    return;
  }

  if (text === "📊 Qabxii Koo") {
    await showMyResults(msg);
    return;
  }

  if (text === "👨‍🏫 Qormaata Koo") {
    await showTeacherExams(msg);
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

  // Unknown command
  await sendMessage(
    chatId,
    `
❓ Ajaja kana hin hubanne.

🏠 Menuu keessaa filadhu ykn <b>/menu</b> barreessi.
`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

// ===============================
// CALLBACK HANDLER
// ===============================

async function handleUpdate(update) {
  try {
    if (update.message) {
      await handleMessage(
        update.message
      );
    }

    if (update.callback_query) {
      const query =
        update.callback_query;

      if (
        query.data &&
        query.data.startsWith("results_")
      ) {
        const examId =
          query.data.split("_")[1];

        await showTeacherResults(
          query,
          examId
        );

        return;
      }

      await handleCallback(query);
    }
  } catch (error) {
    console.error(
      "Update error:",
      error.message
    );
  }
}

// ===============================
// HTML ESCAPE
// ===============================

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ===============================
// BOT SETUP
// ===============================

let BOT_USERNAME = "";

async function setupBot() {
  const me = await telegram("getMe");

  BOT_USERNAME = me.username;

  console.log(
    `🤖 Bot: @${BOT_USERNAME}`
  );

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
          command: "menu",
          description: "Menuu bani"
        },
        {
          command: "cancel",
          description: "Hojii haqii"
        }
      ]
    }
  );

  console.log(
    "✅ Telegram bot qophaa'eera."
  );
}

// ===============================
// LONG POLLING
// ===============================

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

    conflictCount = 0;

    for (const update of updates) {
      offset =
        update.update_id + 1;

      await handleUpdate(update);
    }
  } catch (error) {
    console.error(
      "Polling error:",
      error.message
    );

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

      const wait =
        Math.min(
          60000,
          5000 * conflictCount
        );

      polling = false;

      if (pollTimer) {
        clearTimeout(pollTimer);
      }

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
    clearTimeout(pollTimer);
  }

  pollTimer =
    setTimeout(
      pollTelegram,
      1000
    );
}

// ===============================
// START SERVER
// ===============================

async function startServer() {
  try {
    console.log(
      "🚀 Waamara server starting..."
    );

    await initDatabase();

    await setupBot();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `🌍 Server running on port ${PORT}`
        );

        console.log(
          "🤖 Waamara Bot is ready."
        );

        pollTelegram();
      }
    );
  } catch (error) {
    console.error(
      "❌ Server start error:",
      error
    );

    process.exit(1);
  }
}

startServer();
