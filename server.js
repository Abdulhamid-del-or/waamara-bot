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
}

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL hin argamne.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =====================================================
   SESSION
===================================================== */

const sessions = new Map();

/*
session examples:

Create:
{
  step,
  title,
  subject,
  duration,
  examId,
  examCode,
  question,
  options,
  correctAnswer,
  points
}

Take:
{
  step: "taking_exam",
  examId,
  examCode,
  examTitle,
  duration,
  attemptId,
  questions,
  questionIndex,
  answers
}
*/

/* =====================================================
   TELEGRAM API
===================================================== */

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
      (res) => {

        let result = "";

        res.on("data", (chunk) => {
          result += chunk;
        });

        res.on("end", () => {

          try {

            const json = JSON.parse(result);

            if (!json.ok) {
              reject(
                new Error(
                  json.description ||
                  "Telegram API error"
                )
              );
              return;
            }

            resolve(json.result);

          } catch (err) {
            reject(err);
          }

        });
      }
    );

    req.on("error", reject);

    req.write(body);
    req.end();
  });
}

async function sendMessage(
  chatId,
  text,
  extra = {}
) {
  return telegram(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      ...extra
    }
  );
}

async function answerCallback(
  callbackQueryId,
  text = ""
) {

  try {

    await telegram(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackQueryId,
        text
      }
    );

  } catch (err) {

    console.error(
      "❌ Callback error:",
      err.message
    );
  }
}

/* =====================================================
   KEYBOARDS
===================================================== */

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
    is_persistent: true
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

/* =====================================================
   DATABASE MIGRATION
===================================================== */

async function migrateDatabase() {

  console.log(
    "🔄 Database migration started..."
  );

  /* USERS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE,
      first_name TEXT,
      username TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* USERS ID */

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

  /* EXAMS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      code VARCHAR(20) UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subject TEXT,
      duration INTEGER DEFAULT 30,
      teacher_id BIGINT,
      creator_id BIGINT,
      starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ends_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 30
  `);

  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS teacher_id BIGINT
  `);

  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS creator_id BIGINT
  `);

  await pool.query(`
    UPDATE exams
    SET creator_id = teacher_id
    WHERE creator_id IS NULL
    AND teacher_id IS NOT NULL
  `);

  /* QUESTIONS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER,
      question_text TEXT,
      correct_answer TEXT,
      points INTEGER DEFAULT 1
    )
  `);

  await pool.query(`
    ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS exam_id INTEGER
  `);

  await pool.query(`
    ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS question_text TEXT
  `);

  await pool.query(`
    ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS correct_answer TEXT
  `);

  await pool.query(`
    ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 1
  `);

  /* OPTIONS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS options (
      id SERIAL PRIMARY KEY,
      question_id INTEGER,
      option_key VARCHAR(5),
      option_text TEXT
    )
  `);

  await pool.query(`
    ALTER TABLE options
    ADD COLUMN IF NOT EXISTS question_id INTEGER
  `);

  await pool.query(`
    ALTER TABLE options
    ADD COLUMN IF NOT EXISTS option_key VARCHAR(5)
  `);

  await pool.query(`
    ALTER TABLE options
    ADD COLUMN IF NOT EXISTS option_text TEXT
  `);

  /* ATTEMPTS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attempts (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER,
      student_id BIGINT,
      student_name TEXT,
      score INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      percentage NUMERIC DEFAULT 0,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP,
      expires_at TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS exam_id INTEGER
  `);

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS student_id BIGINT
  `);

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS student_name TEXT
  `);

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS percentage NUMERIC DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS started_at
    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP
  `);

  await pool.query(`
    ALTER TABLE attempts
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
  `);

  /* ANSWERS */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers (
      id SERIAL PRIMARY KEY,
      attempt_id INTEGER,
      question_id INTEGER,
      answer TEXT,
      is_correct BOOLEAN DEFAULT FALSE
    )
  `);

  await pool.query(`
    ALTER TABLE answers
    ADD COLUMN IF NOT EXISTS attempt_id INTEGER
  `);

  await pool.query(`
    ALTER TABLE answers
    ADD COLUMN IF NOT EXISTS question_id INTEGER
  `);

  await pool.query(`
    ALTER TABLE answers
    ADD COLUMN IF NOT EXISTS answer TEXT
  `);

  await pool.query(`
    ALTER TABLE answers
    ADD COLUMN IF NOT EXISTS is_correct BOOLEAN DEFAULT FALSE
  `);

  console.log(
    "✅ Database migration completed."
  );
}

/* =====================================================
   SAVE USER
===================================================== */

async function saveUser(user) {

  if (!user || !user.id) return;

  await pool.query(
    `
    INSERT INTO users
    (
      telegram_id,
      first_name,
      username
    )
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

/* =====================================================
   EXAM CODE
===================================================== */

function generateExamCode() {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code +=
      chars[
        Math.floor(
          Math.random() * chars.length
        )
      ];
  }

  return code;
}

/* =====================================================
   START
===================================================== */

async function handleStart(msg) {

  const chatId = msg.chat.id;

  await saveUser(msg.from);

  sessions.delete(chatId);

  await sendMessage(
    chatId,
    `👋 Baga nagaan dhuftan gara Waamara!

📚 WAAMARA BOT

Tajaajiloota:

📝 Qormaata uumuu
📖 Qormaata fudhachuu
📊 Qabxii ilaalu
👨‍🏫 Qormaata kee ilaalu
📚 Barnoota
👤 Profile

👇 Mee filannoo keessaa tokko filadhu.`,
    {
      reply_markup:
        mainKeyboard()
    }
  );
}

/* =====================================================
   CREATE EXAM
===================================================== */

async function startCreateExam(chatId) {

  sessions.set(
    chatId,
    {
      step: "exam_title"
    }
  );

  await sendMessage(
    chatId,
    `📝 MAQAA QORMAATAA

Maqaa qormaataa galchi.

Fakkeenya:
Qormaata Herregaa Kutaa 8`,
    {
      reply_markup:
        cancelKeyboard()
    }
  );
}

async function processCreateExam(
  chatId,
  msg,
  text
) {

  const s =
    sessions.get(chatId);

  if (!s) return false;

  /* TITLE */

  if (s.step === "exam_title") {

    if (text.length < 2) {

      await sendMessage(
        chatId,
        "❌ Maqaan qormaataa gabaabaa dha."
      );

      return true;
    }

    s.title = text;
    s.step = "exam_subject";

    await sendMessage(
      chatId,
      `📚 BARNOOTA

Maqaa barnootaa galchi.

Fakkeenya:
Herrega`,
      {
        reply_markup:
          cancelKeyboard()
      }
    );

    return true;
  }

  /* SUBJECT */

  if (s.step === "exam_subject") {

    s.subject = text;
    s.step = "exam_duration";

    await sendMessage(
      chatId,
      `⏱️ YEROO QORMAATAA

Daqiiqaa meeqa akka turu galchi.

1 hanga 1440 galchi.

Fakkeenya:
30`,
      {
        reply_markup:
          cancelKeyboard()
      }
    );

    return true;
  }

  /* DURATION */

  if (s.step === "exam_duration") {

    const cleanText =
      String(text)
        .trim()
        .replace(/[^\d]/g, "");

    const duration =
      parseInt(
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
        `❌ Yeroon sirrii miti.

Lakkoofsa daqiiqaa
1 hanga 1440 galchi.

Fakkeenya:
30`
      );

      return true;
    }

    const code =
      generateExamCode();

    try {

      const result =
        await pool.query(
          `
          INSERT INTO exams
          (
            code,
            title,
            subject,
            duration,
            teacher_id,
            creator_id,
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
            $5,
            CURRENT_TIMESTAMP,
            NULL
          )
          RETURNING id, code
          `,
          [
            code,
            s.title,
            s.subject,
            duration,
            msg.from.id
          ]
        );

      const exam =
        result.rows[0];

      s.examId =
        exam.id;

      s.examCode =
        exam.code;

      s.duration =
        duration;

      s.step =
        "question_text";

      await sendMessage(
        chatId,
        `✅ QORMAANNI UUMAMEERA!

📌 Maqaa:
${s.title}

📚 Barnoota:
${s.subject}

⏱️ Yeroo:
${duration} daqiiqaa

🔑 Code:
${exam.code}

Amma gaaffii 1ffaa galchi.`,
        {
          reply_markup:
            cancelKeyboard()
        }
      );

      await sendMessage(
        chatId,
        `❓ GAAFFII 1FFAA

Gaaffii barreessi.`
      );

    } catch (err) {

      console.error(
        "❌ Exam create error:",
        err
      );

      await sendMessage(
        chatId,
        "❌ Qormaata uumuu irratti dogongorri uumame."
      );
    }

    return true;
  }

  return false;
}

/* =====================================================
   ADD QUESTIONS
===================================================== */

async function processQuestion(
  chatId,
  msg,
  text
) {

  const s =
    sessions.get(chatId);

  if (!s) return false;

  /* QUESTION */

  if (
    s.step ===
    "question_text"
  ) {

    s.question =
      text;

    s.step =
      "option_a";

    await sendMessage(
      chatId,
      "🅰️ Filannoo A galchi."
    );

    return true;
  }

  /* A */

  if (
    s.step ===
    "option_a"
  ) {

    s.options = {
      A: text
    };

    s.step =
      "option_b";

    await sendMessage(
      chatId,
      "🅱️ Filannoo B galchi."
    );

    return true;
  }

  /* B */

  if (
    s.step ===
    "option_b"
  ) {

    s.options.B =
      text;

    s.step =
      "option_c";

    await sendMessage(
      chatId,
      "©️ Filannoo C galchi."
    );

    return true;
  }

  /* C */

  if (
    s.step ===
    "option_c"
  ) {

    s.options.C =
      text;

    s.step =
      "option_d";

    await sendMessage(
      chatId,
      "🆔 Filannoo D galchi."
    );

    return true;
  }

  /* D */

  if (
    s.step ===
    "option_d"
  ) {

    s.options.D =
      text;

    s.step =
      "correct_answer";

    await sendMessage(
      chatId,
      `✅ DEEBII SIRRII

A, B, C ykn D qofa barreessi.

Fakkeenya:
B`
    );

    return true;
  }

  /* CORRECT */

  if (
    s.step ===
    "correct_answer"
  ) {

    const correct =
      text
        .trim()
        .toUpperCase();

    if (
      ![
        "A",
        "B",
        "C",
        "D"
      ].includes(correct)
    ) {

      await sendMessage(
        chatId,
        `❌ Deebiin sirrii miti.

A, B, C ykn D qofa galchi.`
      );

      return true;
    }

    s.correctAnswer =
      correct;

    s.step =
      "question_points";

    await sendMessage(
      chatId,
      `🎯 QABXII

Gaaffiin kun qabxii meeqa qaba?

Fakkeenya:
1`
    );

    return true;
  }

  /* POINTS */

  if (
    s.step ===
    "question_points"
  ) {

    const points =
      parseInt(
        String(text)
          .trim()
          .replace(/[^\d]/g, ""),
        10
      );

    if (
      Number.isNaN(points) ||
      points < 1 ||
      points > 100
    ) {

      await sendMessage(
        chatId,
        `❌ Qabxiin sirrii miti.

1 hanga 100 galchi.

Fakkeenya:
1`
      );

      return true;
    }

    try {

      const correctText =
        s.options[
          s.correctAnswer
        ];

      const questionResult =
        await pool.query(
          `
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
          `,
          [
            s.examId,
            s.question,
            correctText,
            points
          ]
        );

      const questionId =
        questionResult
          .rows[0]
          .id;

      for (
        const key of [
          "A",
          "B",
          "C",
          "D"
        ]
      ) {

        await pool.query(
          `
          INSERT INTO options
          (
            question_id,
            option_key,
            option_text
          )
          VALUES
          ($1, $2, $3)
          `,
          [
            questionId,
            key,
            s.options[key]
          ]
        );
      }

      s.step =
        "next_question";

      await sendMessage(
        chatId,
        `✅ Gaaffiin galmaa'e!

❓ ${s.question}

🅰️ ${s.options.A}
🅱️ ${s.options.B}
©️ ${s.options.C}
🆔 ${s.options.D}

✅ Deebii sirrii:
${s.correctAnswer}

🎯 Qabxii:
${points}

➡️ Gaaffii biraa dabaluuf:
E barreessi

➡️ Qormaata xumuruuf:
X barreessi`,
        {
          reply_markup:
            cancelKeyboard()
        }
      );

    } catch (err) {

      console.error(
        "❌ Question insert error:",
        err
      );

      await sendMessage(
        chatId,
        `❌ Gaaffii galchuu irratti dogongorri uumame.

${err.message}`
      );
    }

    return true;
  }

  /* NEXT */

  if (
    s.step ===
    "next_question"
  ) {

    const command =
      text
        .trim()
        .toUpperCase();

    if (
      command === "X"
    ) {

      sessions.delete(
        chatId
      );

      await sendMessage(
        chatId,
        `🎉 QORMAANNI XUMURAME!

🔑 Code:
${s.examCode}

📌 Maqaa:
${s.title}

📚 Barnoota:
${s.subject}

⏱️ Yeroo:
${s.duration} daqiiqaa

Barataan qormaata fudhachuuf:

📖 Qormaata Fudhadhu

filadhuutii code kana galchi:

${s.examCode}`,
        {
          reply_markup:
            mainKeyboard()
        }
      );

      return true;
    }

    if (
      command === "E"
    ) {

      s.step =
        "question_text";

      await sendMessage(
        chatId,
        `❓ GAAFFII HAARAA

Gaaffii itti aanu barreessi.`
      );

      return true;
    }

    await sendMessage(
      chatId,
      `➡️ Gaaffii biraa dabaluuf E barreessi.

➡️ Qormaata xumuruuf X barreessi.`
    );

    return true;
  }

  return false;
}

/* =====================================================
   TAKE EXAM
===================================================== */

async function startTakeExam(
  chatId
) {

  sessions.set(
    chatId,
    {
      step: "exam_code"
    }
  );

  await sendMessage(
    chatId,
    `📖 QORMAATA FUDHADHU

Code qormaataa galchi.

Fakkeenya:
ABC123`,
    {
      reply_markup:
        cancelKeyboard()
    }
  );
}

/* =====================================================
   START EXAM
===================================================== */

async function startExamByCode(
  chatId,
  msg,
  text
) {

  const code =
    text
      .trim()
      .toUpperCase();

  try {

    const examResult =
      await pool.query(
        `
        SELECT *
        FROM exams
        WHERE UPPER(code) = $1
        LIMIT 1
        `,
        [code]
      );

    if (
      examResult.rows.length === 0
    ) {

      await sendMessage(
        chatId,
        `❌ Qormaata kana hin argamne.

Code sirrii galchi.`
      );

      return true;
    }

    const exam =
      examResult.rows[0];

    const questionsResult =
      await pool.query(
        `
        SELECT *
        FROM questions
        WHERE exam_id = $1
        ORDER BY id ASC
        `,
        [exam.id]
      );

    if (
      questionsResult.rows.length === 0
    ) {

      await sendMessage(
        chatId,
        "❌ Qormaanni kun gaaffii hin qabu."
      );

      sessions.delete(
        chatId
      );

      return true;
    }

    const duration =
      Number(
        exam.duration || 30
      );

    const expiresAt =
      new Date(
        Date.now() +
        duration *
        60 *
        1000
      );

    const attemptResult =
      await pool.query(
        `
        INSERT INTO attempts
        (
          exam_id,
          student_id,
          student_name,
          score,
          total,
          percentage,
          started_at,
          expires_at
        )
        VALUES
        (
          $1,
          $2,
          $3,
          0,
          $4,
          0,
          CURRENT_TIMESTAMP,
          $5
        )
        RETURNING id
        `,
        [
          exam.id,
          msg.from.id,
          msg.from.first_name ||
            "Barataa",
          questionsResult.rows.length,
          expiresAt
        ]
      );

    const attemptId =
      attemptResult
        .rows[0]
        .id;

    sessions.set(
      chatId,
      {
        step: "taking_exam",
        examId: exam.id,
        examCode: exam.code,
        examTitle: exam.title,
        duration,
        attemptId,
        questions:
          questionsResult.rows,
        questionIndex: 0,
        answers: {}
      }
    );

    await sendMessage(
      chatId,
      `📝 QORMAATA JALQABSIISI!

📌 ${exam.title}

📚 ${exam.subject || ""}

⏱️ Yeroo:
${duration} daqiiqaa

❓ Gaaffiiwwan:
${questionsResult.rows.length}

⏳ Yeroon amma irraa eegala.

👇 Gaaffii 1ffaa deebisi.`
    );

    await sendExamQuestion(
      chatId
    );

    return true;

  } catch (err) {

    console.error(
      "❌ Start exam error:",
      err
    );

    await sendMessage(
      chatId,
      "❌ Qormaata jalqabuu irratti dogongorri uumame."
    );

    return true;
  }
}

/* =====================================================
   SEND QUESTION
===================================================== */

async function sendExamQuestion(
  chatId
) {

  const s =
    sessions.get(chatId);

  if (
    !s ||
    s.step !==
    "taking_exam"
  ) {
    return;
  }

  /* TIMER */

  const attemptResult =
    await pool.query(
      `
      SELECT expires_at
      FROM attempts
      WHERE id = $1
      `,
      [s.attemptId]
    );

  if (
    attemptResult.rows.length === 0
  ) {

    sessions.delete(
      chatId
    );

    return;
  }

  const expiresAt =
    new Date(
      attemptResult
        .rows[0]
        .expires_at
    );

  if (
    Date.now() >=
    expiresAt.getTime()
  ) {

    await finishExam(
      chatId,
      "⏰ Yeroon qormaataa xumurame."
    );

    return;
  }

  /* FINISH */

  if (
    s.questionIndex >=
    s.questions.length
  ) {

    await finishExam(
      chatId,
      "🎉 Qormaata xumurte."
    );

    return;
  }

  const question =
    s.questions[
      s.questionIndex
    ];

  const optionsResult =
    await pool.query(
      `
      SELECT
        option_key,
        option_text
      FROM options
      WHERE question_id = $1
      ORDER BY id ASC
      `,
      [question.id]
    );

  const keyboard =
    optionsResult.rows.map(
      (o) => [
        {
          text:
            `${o.option_key}. ${o.option_text}`,

          callback_data:
            `answer_${question.id}_${o.option_key}`
        }
      ]
    );

  await sendMessage(
    chatId,
    `❓ GAAFFII ${s.questionIndex + 1}/${s.questions.length}

${question.question_text}

👇 Deebii sirrii filadhu.`,
    {
      reply_markup: {
        inline_keyboard:
          keyboard
      }
    }
  );
}

/* =====================================================
   PROCESS BUTTON ANSWER
===================================================== */

async function processAnswer(
  callbackQuery,
  questionId,
  answerKey
) {

  const chatId =
    callbackQuery
      .message
      .chat
      .id;

  const s =
    sessions.get(chatId);

  await answerCallback(
    callbackQuery.id
  );

  /* REMOVE OLD BUTTONS */

  try {

    await telegram(
      "editMessageReplyMarkup",
      {
        chat_id: chatId,
        message_id:
          callbackQuery
            .message
            .message_id,

        reply_markup: {
          inline_keyboard: []
        }
      }
    );

  } catch (err) {

    console.error(
      "❌ Button remove error:",
      err.message
    );
  }

  if (
    !s ||
    s.step !==
    "taking_exam"
  ) {

    await sendMessage(
      chatId,
      "❌ Qormaanni kun hin jirre."
    );

    return;
  }

  /* IMPORTANT:
     Button gaaffii duraanii irraa
     dhufe moo gaaffii ammaa?
  */

  const currentQuestion =
    s.questions[
      s.questionIndex
    ];

  if (
    !currentQuestion ||
    Number(currentQuestion.id) !==
      Number(questionId)
  ) {

    await sendMessage(
      chatId,
      "⚠️ Gaaffiin kun duraan deebifameera."
    );

    return;
  }

  try {

    /* TIMER */

    const attemptResult =
      await pool.query(
        `
        SELECT expires_at
        FROM attempts
        WHERE id = $1
        `,
        [s.attemptId]
      );

    if (
      attemptResult.rows.length === 0
    ) {
      return;
    }

    const expiresAt =
      new Date(
        attemptResult
          .rows[0]
          .expires_at
      );

    if (
      Date.now() >=
      expiresAt.getTime()
    ) {

      await finishExam(
        chatId,
        "⏰ Yeroon qormaataa xumurame."
      );

      return;
    }

    /* QUESTION */

    const questionResult =
      await pool.query(
        `
        SELECT *
        FROM questions
        WHERE id = $1
        `,
        [questionId]
      );

    if (
      questionResult.rows.length === 0
    ) {
      return;
    }

    const question =
      questionResult.rows[0];

    /* OPTION */

    const optionResult =
      await pool.query(
        `
        SELECT *
        FROM options
        WHERE question_id = $1
        AND option_key = $2
        LIMIT 1
        `,
        [
          questionId,
          answerKey
        ]
      );

    if (
      optionResult.rows.length === 0
    ) {

      await sendMessage(
        chatId,
        "❌ Filannoo kana hin argamne."
      );

      return;
    }

    const selectedText =
      optionResult
        .rows[0]
        .option_text;

    const isCorrect =
      selectedText ===
      question.correct_answer;

    /* SAVE ANSWER */

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
        s.attemptId,
        questionId,
        selectedText,
        isCorrect
      ]
    );

    s.answers[
      questionId
    ] =
      isCorrect
        ? Number(
            question.points || 0
          )
        : 0;

    /* RESULT */

    if (isCorrect) {

      await sendMessage(
        chatId,
        `✅ DEEBII SIRRII!

🎯 +${question.points} qabxii`
      );

    } else {

      await sendMessage(
        chatId,
        `❌ DEEBII SIRRII MITI.

🎯 Qabxii: 0`
      );
    }

    /* NEXT */

    s.questionIndex++;

    await sendExamQuestion(
      chatId
    );

  } catch (err) {

    console.error(
      "❌ Answer error:",
      err
    );

    await sendMessage(
      chatId,
      "❌ Deebii galchuu irratti dogongorri uumame."
    );
  }
}

/* =====================================================
   PROCESS TEXT ANSWER
===================================================== */

async function processTextAnswer(
  chatId,
  msg,
  questionId,
  answerKey
) {

  const s =
    sessions.get(chatId);

  if (
    !s ||
    s.step !==
    "taking_exam"
  ) {
    return;
  }

  try {

    const currentQuestion =
      s.questions[
        s.questionIndex
      ];

    if (
      !currentQuestion ||
      Number(currentQuestion.id) !==
        Number(questionId)
    ) {

      await sendMessage(
        chatId,
        "⚠️ Gaaffiin kun duraan deebifameera."
      );

      return;
    }

    const attemptResult =
      await pool.query(
        `
        SELECT expires_at
        FROM attempts
        WHERE id = $1
        `,
        [s.attemptId]
      );

    if (
      attemptResult.rows.length === 0
    ) {
      return;
    }

    const expiresAt =
      new Date(
        attemptResult
          .rows[0]
          .expires_at
      );

    if (
      Date.now() >=
      expiresAt.getTime()
    ) {

      await finishExam(
        chatId,
        "⏰ Yeroon qormaataa xumurame."
      );

      return;
    }

    const questionResult =
      await pool.query(
        `
        SELECT *
        FROM questions
        WHERE id = $1
        `,
        [questionId]
      );

    if (
      questionResult.rows.length === 0
    ) {
      return;
    }

    const question =
      questionResult.rows[0];

    const optionResult =
      await pool.query(
        `
        SELECT *
        FROM options
        WHERE question_id = $1
        AND option_key = $2
        LIMIT 1
        `,
        [
          questionId,
          answerKey
        ]
      );

    if (
      optionResult.rows.length === 0
    ) {

      await sendMessage(
        chatId,
        "❌ Filannoo kana hin argamne."
      );

      return;
    }

    const selectedText =
      optionResult
        .rows[0]
        .option_text;

    const isCorrect =
      selectedText ===
      question.correct_answer;

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
        s.attemptId,
        questionId,
        selectedText,
        isCorrect
      ]
    );

    s.answers[
      questionId
    ] =
      isCorrect
        ? Number(
            question.points || 0
          )
        : 0;

    if (isCorrect) {

      await sendMessage(
        chatId,
        `✅ DEEBII SIRRII!

🎯 +${question.points} qabxii`
      );

    } else {

      await sendMessage(
        chatId,
        `❌ DEEBII SIRRII MITI.

🎯 Qabxii: 0`
      );
    }

    s.questionIndex++;

    await sendExamQuestion(
      chatId
    );

  } catch (err) {

    console.error(
      "❌ Text answer error:",
      err
    );

    await sendMessage(
      chatId,
      "❌ Deebii galchuu irratti dogongorri uumame."
    );
  }
}

/* =====================================================
   FINISH EXAM
===================================================== */

async function finishExam(
  chatId,
  message
) {

  const s =
    sessions.get(chatId);

  if (!s) return;

  try {

    const answersResult =
      await pool.query(
        `
        SELECT
          a.is_correct,
          q.points
        FROM answers a
        JOIN questions q
          ON q.id = a.question_id
        WHERE a.attempt_id = $1
        `,
        [s.attemptId]
      );

    let score = 0;

    for (
      const row of
      answersResult.rows
    ) {

      if (
        row.is_correct
      ) {

        score +=
          Number(
            row.points || 0
          );
      }
    }

    const totalResult =
      await pool.query(
        `
        SELECT
          COALESCE(
            SUM(points),
            0
          ) AS total
        FROM questions
        WHERE exam_id = $1
        `,
        [s.examId]
      );

    const total =
      Number(
        totalResult
          .rows[0]
          .total || 0
      );

    const percentage =
      total > 0
        ? (
            score /
            total
          ) * 100
        : 0;

    await pool.query(
      `
      UPDATE attempts
      SET
        score = $1,
        total = $2,
        percentage = $3,
        finished_at =
          CURRENT_TIMESTAMP
      WHERE id = $4
      `,
      [
        score,
        total,
        percentage.toFixed(2),
        s.attemptId
      ]
    );

    sessions.delete(
      chatId
    );

    await sendMessage(
      chatId,
      `${message}

🎉 QORMAANNI XUMURAMEERA!

📌 Qormaata:
${s.examTitle}

🏆 Qabxii:
${score}/${total}

📊 Dhibbeentaa:
${percentage.toFixed(2)}%

📊 Qabxiin kee galmaa'eera.`,
      {
        reply_markup:
          mainKeyboard()
      }
    );

  } catch (err) {

    console.error(
      "❌ Finish exam error:",
      err
    );

    sessions.delete(
      chatId
    );

    await sendMessage(
      chatId,
      "❌ Qormaata xumuru irratti dogongorri uumame.",
      {
        reply_markup:
          mainKeyboard()
      }
    );
  }
}

/* =====================================================
   MY SCORE
===================================================== */

async function showMyScores(
  chatId,
  userId
) {

  try {

    const result =
      await pool.query(
        `
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
        ORDER BY a.id DESC
        LIMIT 10
        `,
        [userId]
      );

    if (
      result.rows.length === 0
    ) {

      await sendMessage(
        chatId,
        "📊 Qabxiin ati argatte ammaaf hin jiru.",
        {
          reply_markup:
            mainKeyboard()
        }
      );

      return;
    }

    let text =
      "📊 QABXII KOO\n\n";

    result.rows.forEach(
      (row, index) => {

        text +=
          `${index + 1}. ${row.title}\n` +
          `📚 ${row.subject || ""}\n` +
          `🏆 ${row.score}/${row.total}\n` +
          `📈 ${Number(row.percentage).toFixed(2)}%\n\n`;
      }
    );

    await sendMessage(
      chatId,
      text,
      {
        reply_markup:
          mainKeyboard()
      }
    );

  } catch (err) {

    console.error(
      "❌ Score error:",
      err
    );

    await sendMessage(
      chatId,
      "❌ Qabxii ilaalu irratti dogongorri uumame."
    );
  }
}

/* =====================================================
   TEACHER EXAMS
===================================================== */

async function showTeacherExams(
  chatId,
  userId
) {

  try {

    const result =
      await pool.query(
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
           OR creator_id = $1
        ORDER BY id DESC
        LIMIT 20
        `,
        [userId]
      );

    if (
      result.rows.length === 0
    ) {

      await sendMessage(
        chatId,
        "👨‍🏫 Qormaata ati uumte hin jiru.",
        {
          reply_markup:
            mainKeyboard()
        }
      );

      return;
    }

    let text =
      "👨‍🏫 QORMAATA KOO\n\n";

    result.rows.forEach(
      (exam, index) => {

        text +=
          `${index + 1}. ${exam.title}\n` +
          `📚 ${exam.subject || ""}\n` +
          `🔑 Code: ${exam.code}\n` +
          `⏱️ ${exam.duration} daqiiqaa\n\n`;
      }
    );

    await sendMessage(
      chatId,
      text,
      {
        reply_markup:
          mainKeyboard()
      }
    );

  } catch (err) {

    console.error(
      "❌ Teacher exams error:",
      err
    );

    await sendMessage(
      chatId,
      "❌ Qormaata kee ilaalu irratti dogongorri uumame."
    );
  }
}

/* =====================================================
   PROFILE
===================================================== */

async function showProfile(
  chatId,
  user
) {

  try {

    const result =
      await pool.query(
        `
        SELECT *
        FROM users
        WHERE telegram_id = $1
        LIMIT 1
        `,
        [user.id]
      );

    const dbUser =
      result.rows[0];

    await sendMessage(
      chatId,
      `👤 PROFILE

👨 Maqaa:
${user.first_name || ""}

🔹 Username:
${
  user.username
    ? "@" + user.username
    : "Hin qabu"
}

🆔 Telegram ID:
${user.id}

📅 Galmee:
${
  dbUser?.created_at
    ? new Date(
        dbUser.created_at
      ).toLocaleString()
    : "-"
}`,
      {
        reply_markup:
          mainKeyboard()
      }
    );

  } catch (err) {

    console.error(
      "❌ Profile error:",
      err
    );

    await sendMessage(
      chatId,
      "❌ Profile ilaalu irratti dogongorri uumame."
    );
  }
}

/* =====================================================
   LEARNING
===================================================== */

async function showLearning(
  chatId
) {

  await sendMessage(
    chatId,
    `📚 BARNOOTA

Waamara keessatti:

📖 Barnoota
📝 Qormaata
📊 Qabxii
🎯 Shaakala
❓ Gaaffii fi Deebii

Tajaajiloonni barnootaa
gara fuulduraatti ni bal'atu.`,
    {
      reply_markup:
        mainKeyboard()
    }
  );
}

/* =====================================================
   OTHER SERVICES
===================================================== */

async function showOtherServices(
  chatId
) {

  await sendMessage(
    chatId,
    `💼 HOJIIWWAN BIROO

Tajaajiloota Waamara:

📚 Barnoota
📝 Qormaata
📊 Qabxii
👤 Profile
🎯 Shaakala
📖 Kitaaba`,
    {
      reply_markup:
        mainKeyboard()
    }
  );
}

/* =====================================================
   NORMAL MESSAGE
===================================================== */

async function handleMessage(
  msg
) {

  if (
    !msg ||
    !msg.chat
  ) {
    return;
  }

  const chatId =
    msg.chat.id;

  const text =
    typeof msg.text ===
    "string"
      ? msg.text.trim()
      : "";

  if (!msg.from) {
    return;
  }

  try {

    await saveUser(
      msg.from
    );

  } catch (err) {

    console.error(
      "❌ Save user error:",
      err
    );
  }

  /* START */

  if (
    text === "/start"
  ) {

    await handleStart(
      msg
    );

    return;
  }

  /* MENU */

  if (
    text === "/menu"
  ) {

    sessions.delete(
      chatId
    );

    await sendMessage(
      chatId,
      "📋 MENU",
      {
        reply_markup:
          mainKeyboard()
      }
    );

    return;
  }

  /* CANCEL */

  if (
    text === "❌ Haqi"
  ) {

    sessions.delete(
      chatId
    );

    await sendMessage(
      chatId,
      "❌ Hojii amma gochaa turte haqameera.",
      {
        reply_markup:
          mainKeyboard()
      }
    );

    return;
  }

  /* CREATE */

  if (
    text ===
    "📝 Qormaata Uumi"
  ) {

    await startCreateExam(
      chatId
    );

    return;
  }

  /* TAKE */

  if (
    text ===
    "📖 Qormaata Fudhadhu"
  ) {

    await startTakeExam(
      chatId
    );

    return;
  }

  /* SCORE */

  if (
    text ===
    "📊 Qabxii Koo"
  ) {

    await showMyScores(
      chatId,
      msg.from.id
    );

    return;
  }

  /* TEACHER */

  if (
    text ===
    "👨‍🏫 Qormaata Koo"
  ) {

    await showTeacherExams(
      chatId,
      msg.from.id
    );

    return;
  }

  /* LEARNING */

  if (
    text ===
    "📚 Barnoota"
  ) {

    await showLearning(
      chatId
    );

    return;
  }

  /* PROFILE */

  if (
    text ===
    "👤 Profile"
  ) {

    await showProfile(
      chatId,
      msg.from
    );

    return;
  }

  /* OTHER */

  if (
    text ===
    "💼 Hojiiwwan Biroo"
  ) {

    await showOtherServices(
      chatId
    );

    return;
  }

  /* ACTIVE SESSION */

  const session =
    sessions.get(chatId);

  if (session) {

    /* EXAM CODE */

    if (
      session.step ===
      "exam_code"
    ) {

      await startExamByCode(
        chatId,
        msg,
        text
      );

      return;
    }

    /* CREATE */

    if (
      [
        "exam_title",
        "exam_subject",
        "exam_duration"
      ].includes(
        session.step
      )
    ) {

      const handled =
        await processCreateExam(
          chatId,
          msg,
          text
        );

      if (handled) {
        return;
      }
    }

    /* QUESTIONS */

    if (
      [
        "question_text",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "correct_answer",
        "question_points",
        "next_question"
      ].includes(
        session.step
      )
    ) {

      const handled =
        await processQuestion(
          chatId,
          msg,
          text
        );

      if (handled) {
        return;
      }
    }

    /* TAKING EXAM */

    if (
      session.step ===
      "taking_exam"
    ) {

      const answerKey =
        text
          .trim()
          .toUpperCase();

      if (
        [
          "A",
          "B",
          "C",
          "D"
        ].includes(
          answerKey
        )
      ) {

        const currentQuestion =
          session.questions[
            session.questionIndex
          ];

        if (
          currentQuestion
        ) {

          await processTextAnswer(
            chatId,
            msg,
            currentQuestion.id,
            answerKey
          );

          return;
        }
      }

      await sendMessage(
        chatId,
        `👇 Deebii tokko keessaa filadhu.

Yookaan A, B, C, D keessaa tokko barreessi.`
      );

      return;
    }
  }

  /* DEFAULT */

  await sendMessage(
    chatId,
    "📋 Mee menu keessaa tajaajila barbaadde filadhu.",
    {
      reply_markup:
        mainKeyboard()
    }
  );
}

/* =====================================================
   CALLBACK QUERY
===================================================== */

async function handleCallbackQuery(
  callbackQuery
) {

  const data =
    callbackQuery.data ||
    "";

  if (
    data.startsWith(
      "answer_"
    )
  ) {

    const parts =
      data.split("_");

    /*
      answer_questionId_A
    */

    const questionId =
      parseInt(
        parts[1],
        10
      );

    const answerKey =
      parts[2];

    if (
      Number.isNaN(
        questionId
      ) ||
      ![
        "A",
        "B",
        "C",
        "D"
      ].includes(
        answerKey
      )
    ) {

      await answerCallback(
        callbackQuery.id,
        "❌ Deebiin sirrii miti."
      );

      return;
    }

    await processAnswer(
      callbackQuery,
      questionId,
      answerKey
    );

    return;
  }

  await answerCallback(
    callbackQuery.id
  );
}

/* =====================================================
   WEBHOOK
===================================================== */

app.post(
  "/telegram/webhook",
  async (req, res) => {

    /*
      Telegram akka saffisaan
      200 argatuuf jalqaba deebisa.
    */

    res.sendStatus(200);

    try {

      const update =
        req.body;

      if (
        update.callback_query
      ) {

        await handleCallbackQuery(
          update.callback_query
        );

        return;
      }

      if (
        update.message
      ) {

        await handleMessage(
          update.message
        );

        return;
      }

    } catch (err) {

      console.error(
        "❌ Update error:",
        err
      );
    }
  }
);

/* =====================================================
   HOME
===================================================== */

app.get(
  "/",
  (req, res) => {

    res.send(
      "🤖 Waamara Telegram Bot is online."
    );
  }
);

/* =====================================================
   HEALTH
===================================================== */

app.get(
  "/health",
  async (req, res) => {

    try {

      await pool.query(
        "SELECT 1"
      );

      res.json(
        {
          ok: true,
          app: "Waamara",
          database:
            "connected"
        }
      );

    } catch (err) {

      res.status(500)
        .json(
          {
            ok: false,
            app: "Waamara",
            database:
              "error",
            error:
              err.message
          }
        );
    }
  }
);

/* =====================================================
   WEBHOOK SETUP
===================================================== */

async function setupWebhook() {

  const renderUrl =
    process.env.RENDER_EXTERNAL_URL;

  if (!renderUrl) {

    console.error(
      "❌ RENDER_EXTERNAL_URL hin argamne."
    );

    return;
  }

  const webhookUrl =
    `${renderUrl}/telegram/webhook`;

  try {

    await telegram(
      "setWebhook",
      {
        url:
          webhookUrl
      }
    );

    console.log(
      "✅ Telegram webhook set:",
      webhookUrl
    );

  } catch (err) {

    console.error(
      "❌ Webhook error:",
      err.message
    );
  }
}

/* =====================================================
   BOT COMMANDS
===================================================== */

async function setupCommands() {

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
              "Menu bani"
          }
        ]
      }
    );

    console.log(
      "✅ Bot commands configured."
    );

  } catch (err) {

    console.error(
      "❌ Commands error:",
      err.message
    );
  }
}

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {

  try {

    await migrateDatabase();

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

  } catch (err) {

    console.error(
      "❌ Server startup error:",
      err
    );

    process.exit(1);
  }
}

startServer();
