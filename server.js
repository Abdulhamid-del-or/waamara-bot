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

/* =========================
   SESSION
========================= */

const sessions = new Map();

/*
session:
{
  step: "...",
  title,
  subject,
  duration,
  examId,
  examCode,
  question,
  options: {},
  correctAnswer,
  points,
  attemptId,
  questionIndex
}
*/

/* =========================
   TELEGRAM API
========================= */

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
              reject(new Error(json.description || "Telegram API error"));
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

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

async function answerCallback(callbackQueryId, text = "") {
  try {
    await telegram("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text
    });
  } catch (err) {
    console.error("Callback error:", err.message);
  }
}

/* =========================
   KEYBOARDS
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

function cancelKeyboard() {
  return {
    keyboard: [
      [{ text: "❌ Haqi" }]
    ],
    resize_keyboard: true
  };
}

/* =========================
   DATABASE MIGRATION
========================= */

async function migrateDatabase() {
  console.log("🔄 Database migration started...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE,
      first_name TEXT,
      username TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /*
   Existing users table keessatti id default yoo hin jirre
   sequence sirreessa.
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
    $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      code VARCHAR(20) UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subject TEXT,
      duration INTEGER DEFAULT 30,
      teacher_id BIGINT,
      creator_id BIGINT NOT NULL,
      starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ends_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /*
   Existing exams table yoo creator_id hin qabne dabala.
  */
  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS creator_id BIGINT
  `);

  /*
   Existing exams keessatti creator_id NULL yoo jiraate,
   teacher_id irraa guuta.
  */
  await pool.query(`
    UPDATE exams
    SET creator_id = teacher_id
    WHERE creator_id IS NULL
    AND teacher_id IS NOT NULL
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

  /*
   Duration yoo hin jirre
  */
  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 30
  `);

  /*
   Teacher ID yoo hin jirre
  */
  await pool.query(`
    ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS teacher_id BIGINT
  `);

  /*
   Creator ID irratti NOT NULL yoo jiraate,
   INSERT keessatti yeroo hunda guutama.
  */

  console.log("✅ Database migration completed.");
}

/* =========================
   SAVE USER
========================= */

async function saveUser(user) {
  if (!user || !user.id) return;

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
   RANDOM EXAM CODE
========================= */

function generateExamCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

/* =========================
   START
========================= */

async function handleStart(msg) {
  const chatId = msg.chat.id;

  await saveUser(msg.from);

  sessions.delete(chatId);

  await sendMessage(
    chatId,
    `👋 Baga nagaan dhuftan gara Waamara!

📚 Waamara Bot

Tajaajiloota:
📝 Qormaata uumuu
📖 Qormaata fudhachuu
📊 Qabxii ilaalu
👨‍🏫 Qormaata kee ilaalu
📚 Barnoota
👤 Profile

👇 Mee filannoo keessaa tokko filadhu.`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   CREATE EXAM
========================= */

async function startCreateExam(chatId) {
  sessions.set(chatId, {
    step: "exam_title"
  });

  await sendMessage(
    chatId,
    "📝 MAQAA QORMAATAA\n\nMaqaa qormaataa galchi.\n\nFakkeenya:\nQormaata Herregaa Kutaa 8",
    {
      reply_markup: cancelKeyboard()
    }
  );
}

async function processCreateExam(chatId, msg, text) {
  const s = sessions.get(chatId);

  if (!s) return false;

  if (s.step === "exam_title") {
    if (text.length < 2) {
      await sendMessage(chatId, "❌ Maqaan qormaataa gabaabaa dha.");
      return true;
    }

    s.title = text;
    s.step = "exam_subject";

    await sendMessage(
      chatId,
      "📚 BARNOOTA\n\nMaqaa barnootaa galchi.\n\nFakkeenya:\nHerrega",
      {
        reply_markup: cancelKeyboard()
      }
    );

    return true;
  }

  if (s.step === "exam_subject") {
    s.subject = text;
    s.step = "exam_duration";

    await sendMessage(
      chatId,
      "⏱️ YEROO QORMAATAA\n\n" +
      "Daqiiqaa meeqa akka turu galchi.\n\n" +
      "1 hanga 1440 galchi.\n\n" +
      "Fakkeenya: 30",
      {
        reply_markup: cancelKeyboard()
      }
    );

    return true;
  }

  if (s.step === "exam_duration") {

    /*
      Lakkoofsa qofa keessaa baasa.
      Fakkeenya:
      30
      30 daqiiqaa
      daqiiqaa 30
    */

    const cleanText = String(text)
      .trim()
      .replace(/[^\d]/g, "");

    const duration = parseInt(cleanText, 10);

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

      return true;
    }

    const code = generateExamCode();

    try {
      const result = await pool.query(
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

      const exam = result.rows[0];

      s.examId = exam.id;
      s.examCode = exam.code;
      s.duration = duration;
      s.step = "question_text";

      await sendMessage(
        chatId,
        `✅ QORMAANNI UUMAMEERA!

📌 Maqaa: ${s.title}
📚 Barnoota: ${s.subject}
⏱️ Yeroo: ${duration} daqiiqaa
🔑 Code: ${exam.code}

Amma gaaffii 1ffaa galchi.`,
        {
          reply_markup: cancelKeyboard()
        }
      );

      await sendMessage(
        chatId,
        "❓ GAAFFII 1FFAA\n\nGaaffii barreessi."
      );

    } catch (err) {
      console.error("❌ Exam create error:", err);

      await sendMessage(
        chatId,
        "❌ Qormaata uumuu irratti dogongorri uumame.\n\n" +
        "Mee irra deebi'i."
      );
    }

    return true;
  }

  return false;
}

/* =========================
   ADD QUESTIONS
========================= */

async function processQuestion(chatId, msg, text) {
  const s = sessions.get(chatId);

  if (!s) return false;

  if (s.step === "question_text") {

    s.question = text;
    s.step = "option_a";

    await sendMessage(
      chatId,
      "🅰️ Filannoo A galchi."
    );

    return true;
  }

  if (s.step === "option_a") {

    s.options = {
      A: text
    };

    s.step = "option_b";

    await sendMessage(
      chatId,
      "🅱️ Filannoo B galchi."
    );

    return true;
  }

  if (s.step === "option_b") {

    s.options.B = text;
    s.step = "option_c";

    await sendMessage(
      chatId,
      "©️ Filannoo C galchi."
    );

    return true;
  }

  if (s.step === "option_c") {

    s.options.C = text;
    s.step = "option_d";

    await sendMessage(
      chatId,
      "🆔 Filannoo D galchi."
    );

    return true;
  }

  if (s.step === "option_d") {

    s.options.D = text;
    s.step = "correct_answer";

    await sendMessage(
      chatId,
      "✅ Deebii sirrii kam?\n\n" +
      "A, B, C ykn D qofa barreessi.\n\n" +
      "Fakkeenya: B"
    );

    return true;
  }

  if (s.step === "correct_answer") {

    const correct = text.trim().toUpperCase();

    if (!["A", "B", "C", "D"].includes(correct)) {

      await sendMessage(
        chatId,
        "❌ Deebiin sirrii miti.\n\n" +
        "A, B, C ykn D qofa galchi."
      );

      return true;
    }

    s.correctAnswer = correct;
    s.step = "question_points";

    await sendMessage(
      chatId,
      "🎯 QABXII\n\n" +
      "Gaaffiin kun qabxii meeqa qaba?\n\n" +
      "Fakkeenya: 1"
    );

    return true;
  }

  if (s.step === "question_points") {

    const points = parseInt(
      String(text).trim().replace(/[^\d]/g, ""),
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
        "1 hanga 100 galchi.\n\n" +
        "Fakkeenya: 1"
      );

      return true;
    }

    try {

      const correctText =
        s.options[s.correctAnswer];

      const questionResult = await pool.query(
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
        questionResult.rows[0].id;

      for (const key of ["A", "B", "C", "D"]) {

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

      s.step = "next_question";

      await sendMessage(
        chatId,
        `✅ Gaaffiin galmaa'e!

❓ ${s.question}

🅰️ ${s.options.A}
🅱️ ${s.options.B}
©️ ${s.options.C}
🆔 ${s.options.D}

✅ Deebii: ${s.correctAnswer}
🎯 Qabxii: ${points}

Gaaffii biraa dabaluuf:
➡️ E barreessi

Qormaata xumuruuf:
➡️ X barreessi`,
        {
          reply_markup: cancelKeyboard()
        }
      );

    } catch (err) {

      console.error(
        "❌ Question insert error:",
        err
      );

      await sendMessage(
        chatId,
        "❌ Gaaffii galchuu irratti dogongorri uumame."
      );
    }

    return true;
  }

  if (s.step === "next_question") {

    const command = text.trim().toUpperCase();

    if (command === "X") {

      sessions.delete(chatId);

      await sendMessage(
        chatId,
        `🎉 QORMAANNI XUMURAME!

🔑 Code: ${s.examCode}

📌 Maqaa: ${s.title}
📚 Barnoota: ${s.subject}
⏱️ Yeroo: ${s.duration} daqiiqaa

Barattoonni qormaata fudhachuuf:

📖 Qormaata Fudhadhu

filadhuutii code kana galchi:

${s.examCode}`,
        {
          reply_markup: mainKeyboard()
        }
      );

      return true;
    }

    if (command === "E") {

      s.step = "question_text";

      await sendMessage(
        chatId,
        "❓ GAAFFII HAARAA\n\nGaaffii itti aanu barreessi."
      );

      return true;
    }

    await sendMessage(
      chatId,
      "➡️ Gaaffii biraa dabaluuf E barreessi.\n\n" +
      "➡️ Qormaata xumuruuf X barreessi."
    );

    return true;
  }

  return false;
}

/* =========================
   TAKE EXAM
========================= */

async function startTakeExam(chatId) {

  sessions.set(chatId, {
    step: "exam_code"
  });

  await sendMessage(
    chatId,
    "📖 QORMAATA FUDHADHU\n\n" +
    "Code qormaataa galchi.\n\n" +
    "Fakkeenya: ABC123",
    {
      reply_markup: cancelKeyboard()
    }
  );
}

async function startExamByCode(chatId, msg, text) {

  const code = text.trim().toUpperCase();

  try {

    const examResult = await pool.query(
      `
      SELECT *
      FROM exams
      WHERE UPPER(code) = $1
      LIMIT 1
      `,
      [code]
    );

    if (examResult.rows.length === 0) {

      await sendMessage(
        chatId,
        "❌ Qormaata kana hin argamne.\n\n" +
        "Code sirrii galchi."
      );

      return true;
    }

    const exam = examResult.rows[0];

    const questionsResult = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE exam_id = $1
      ORDER BY id ASC
      `,
      [exam.id]
    );

    if (questionsResult.rows.length === 0) {

      await sendMessage(
        chatId,
        "❌ Qormaanni kun gaaffii hin qabu."
      );

      sessions.delete(chatId);

      return true;
    }

    const expiresAt =
      new Date(
        Date.now() +
        Number(exam.duration || 30) * 60 * 1000
      );

    const attemptResult = await pool.query(
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
        msg.from.first_name || "Barataa",
        questionsResult.rows.length,
        expiresAt
      ]
    );

    const attemptId =
      attemptResult.rows[0].id;

    sessions.set(chatId, {
      step: "taking_exam",
      examId: exam.id,
      examCode: exam.code,
      examTitle: exam.title,
      duration: Number(exam.duration || 30),
      attemptId,
      questions: questionsResult.rows,
      questionIndex: 0,
      answers: {}
    });

    await sendMessage(
      chatId,
      `📝 QORMAATA JALQABSIISI!

📌 ${exam.title}
📚 ${exam.subject || ""}
⏱️ Yeroo: ${exam.duration} daqiiqaa
❓ Gaaffiiwwan: ${questionsResult.rows.length}

⏳ Yeroon ati qormaata jalqabde irraa eegala.

Mee gaaffii 1ffaa deebisi.`
    );

    await sendExamQuestion(chatId);

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

/* =========================
   SEND QUESTION
========================= */

async function sendExamQuestion(chatId) {

  const s = sessions.get(chatId);

  if (!s || s.step !== "taking_exam") {
    return;
  }

  /*
   Timer check
  */

  const attemptResult = await pool.query(
    `
    SELECT expires_at
    FROM attempts
    WHERE id = $1
    `,
    [s.attemptId]
  );

  if (attemptResult.rows.length === 0) {
    sessions.delete(chatId);
    return;
  }

  const expiresAt =
    new Date(attemptResult.rows[0].expires_at);

  if (Date.now() >= expiresAt.getTime()) {

    await finishExam(
      chatId,
      "⏰ Yeroon qormaataa xumurame."
    );

    return;
  }

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
    s.questions[s.questionIndex];

  const optionsResult = await pool.query(
    `
    SELECT option_key, option_text
    FROM options
    WHERE question_id = $1
    ORDER BY id ASC
    `,
    [question.id]
  );

  const keyboard =
    optionsResult.rows.map((o) => [
      {
        text: `${o.option_key}. ${o.option_text}`,
        callback_data:
          `answer_${question.id}_${o.option_key}`
      }
    ]);

  await sendMessage(
    chatId,
    `❓ Gaaffii ${s.questionIndex + 1}/${s.questions.length}

${question.question_text}

Filannoo keessaa deebii sirrii filadhu.`,
    {
      reply_markup: {
        inline_keyboard: keyboard
      }
    }
  );
}

/* =========================
   ANSWER
========================= */

async function processAnswer(
  callbackQuery,
  questionId,
  answerKey
) {

  const chatId =
    callbackQuery.message.chat.id;

  const s = sessions.get(chatId);

  await answerCallback(
    callbackQuery.id
  );

  if (
    !s ||
    s.step !== "taking_exam"
  ) {

    await sendMessage(
      chatId,
      "❌ Qormaanni kun hin jirre."
    );

    return;
  }

  const attemptResult = await pool.query(
    `
    SELECT expires_at
    FROM attempts
    WHERE id = $1
    `,
    [s.attemptId]
  );

  if (attemptResult.rows.length === 0) {
    return;
  }

  const expiresAt =
    new Date(
      attemptResult.rows[0].expires_at
    );

  if (Date.now() >= expiresAt.getTime()) {

    await finishExam(
      chatId,
      "⏰ Yeroon qormaataa xumurame."
    );

    return;
  }

  const questionResult = await pool.query(
    `
    SELECT *
    FROM questions
    WHERE id = $1
    `,
    [questionId]
  );

  if (questionResult.rows.length === 0) {
    return;
  }

  const question =
    questionResult.rows[0];

  const optionResult = await pool.query(
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

  if (optionResult.rows.length === 0) {
    return;
  }

  const selectedText =
    optionResult.rows[0].option_text;

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

  if (isCorrect) {
    s.answers[questionId] =
      question.points;
  } else {
    s.answers[questionId] = 0;
  }

  await sendMessage(
    chatId,
    isCorrect
      ? "✅ Deebiin kee sirrii dha!"
      : "❌ Deebiin kee sirrii miti."
  );

  s.questionIndex++;

  await sendExamQuestion(chatId);
}

/* =========================
   FINISH EXAM
========================= */

async function finishExam(
  chatId,
  message
) {

  const s = sessions.get(chatId);

  if (!s) return;

  try {

    const answersResult = await pool.query(
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
    let total = 0;

    for (
      const row of answersResult.rows
    ) {

      total +=
        Number(row.points || 0);

      if (row.is_correct) {
        score +=
          Number(row.points || 0);
      }
    }

    /*
      Total qabxii gaaffii hunda irraa
    */

    const totalResult = await pool.query(
      `
      SELECT COALESCE(
        SUM(points),
        0
      ) AS total
      FROM questions
      WHERE exam_id = $1
      `,
      [s.examId]
    );

    total =
      Number(
        totalResult.rows[0].total || 0
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
        total = $2,
        percentage = $3,
        finished_at = CURRENT_TIMESTAMP
      WHERE id = $4
      `,
      [
        score,
        total,
        percentage.toFixed(2),
        s.attemptId
      ]
    );

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      `${message}

🎉 QORMAANNI XUMURAMEERA!

📌 Qormaata: ${s.examTitle}

🏆 Qabxii: ${score}/${total}
📊 Dhibbeentaa: ${percentage.toFixed(2)}%

Galmee kee keessatti kuufameera.`,
      {
        reply_markup: mainKeyboard()
      }
    );

  } catch (err) {

    console.error(
      "❌ Finish exam error:",
      err
    );

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "❌ Qormaata xumuru irratti dogongorri uumame.",
      {
        reply_markup: mainKeyboard()
      }
    );
  }
}

/* =========================
   MY SCORE
========================= */

async function showMyScores(chatId, userId) {

  try {

    const result = await pool.query(
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

    if (result.rows.length === 0) {

      await sendMessage(
        chatId,
        "📊 Qabxiin ati argatte ammaaf hin jiru.",
        {
          reply_markup: mainKeyboard()
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
        reply_markup: mainKeyboard()
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

/* =========================
   TEACHER EXAMS
========================= */

async function showTeacherExams(
  chatId,
  userId
) {

  try {

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
         OR creator_id = $1
      ORDER BY id DESC
      LIMIT 20
      `,
      [userId]
    );

    if (result.rows.length === 0) {

      await sendMessage(
        chatId,
        "👨‍🏫 Qormaata ati uumte hin jiru.",
        {
          reply_markup: mainKeyboard()
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
        reply_markup: mainKeyboard()
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

/* =========================
   PROFILE
========================= */

async function showProfile(
  chatId,
  user
) {

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

👨 Maqaa: ${user.first_name || ""}
🔹 Username: ${
      user.username
        ? "@" + user.username
        : "Hin qabu"
    }
🆔 Telegram ID: ${user.id}

📅 Galmee:
${
  dbUser?.created_at
    ? new Date(
        dbUser.created_at
      ).toLocaleString()
    : "-"
}`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   LEARNING
========================= */

async function showLearning(chatId) {

  await sendMessage(
    chatId,
    `📚 BARNOOTA

Waamara keessatti tajaajiloota barnootaa dabalataa:

📖 Barnoota
📝 Qormaata
📊 Qabxii
🎯 Shaakala
❓ Gaaffii fi Deebii

Tajaajiloonni kun gara fuulduraatti ni bal'atu.`,
    {
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
    `💼 HOJIIWWAN BIROO

Tajaajiloota Waamara:

📚 Barnoota
📝 Qormaata
📊 Qabxii
👤 Profile
🎯 Shaakala
📖 Kitaaba

👇 Tajaajila barbaadde filadhu.`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   NORMAL MESSAGE
========================= */

async function handleMessage(msg) {

  if (!msg || !msg.chat) return;

  const chatId = msg.chat.id;
  const text =
    typeof msg.text === "string"
      ? msg.text.trim()
      : "";

  if (!msg.from) return;

  try {
    await saveUser(msg.from);
  } catch (err) {
    console.error(
      "❌ Save user error:",
      err
    );
  }

  if (text === "/start") {
    await handleStart(msg);
    return;
  }

  if (text === "/menu") {
    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "📋 MENU",
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  if (text === "❌ Haqi") {

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "❌ Hojii amma gochaa turte haqameera.",
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  /*
   CREATE EXAM
  */

  if (text === "📝 Qormaata Uumi") {

    await startCreateExam(chatId);
    return;
  }

  /*
   TAKE EXAM
  */

  if (text === "📖 Qormaata Fudhadhu") {

    await startTakeExam(chatId);
    return;
  }

  /*
   SCORE
  */

  if (text === "📊 Qabxii Koo") {

    await showMyScores(
      chatId,
      msg.from.id
    );

    return;
  }

  /*
   TEACHER EXAMS
  */

  if (text === "👨‍🏫 Qormaata Koo") {

    await showTeacherExams(
      chatId,
      msg.from.id
    );

    return;
  }

  /*
   LEARNING
  */

  if (text === "📚 Barnoota") {

    await showLearning(chatId);
    return;
  }

  /*
   PROFILE
  */

  if (text === "👤 Profile") {

    await showProfile(
      chatId,
      msg.from
    );

    return;
  }

  /*
   OTHER
  */

  if (text === "💼 Hojiiwwan Biroo") {

    await showOtherServices(chatId);
    return;
  }

  /*
   ACTIVE SESSION
  */

  const session =
    sessions.get(chatId);

  if (session) {

    /*
     Exam code
    */

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

    /*
     Create exam
    */

    if (
      session.step ===
        "exam_title" ||
      session.step ===
        "exam_subject" ||
      session.step ===
        "exam_duration"
    ) {

      const handled =
        await processCreateExam(
          chatId,
          msg,
          text
        );

      if (handled) return;
    }

    /*
     Questions
    */

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
      ].includes(session.step)
    ) {

      const handled =
        await processQuestion(
          chatId,
          msg,
          text
        );

      if (handled) return;
    }

    /*
     Taking exam
     */

    if (
      session.step ===
      "taking_exam"
    ) {

      await sendMessage(
        chatId,
        "👇 Deebii tokko keessaa filadhu."
      );

      return;
    }
  }

  await sendMessage(
    chatId,
    "📋 Mee menu keessaa tajaajila barbaadde filadhu.",
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================
   CALLBACK QUERY
========================= */

async function handleCallbackQuery(
  callbackQuery
) {

  const data =
    callbackQuery.data || "";

  if (
    data.startsWith("answer_")
  ) {

    const parts =
      data.split("_");

    /*
      answer_questionId_A
    */

    const questionId =
      parseInt(parts[1], 10);

    const answerKey =
      parts[2];

    if (
      Number.isNaN(questionId) ||
      !["A", "B", "C", "D"].includes(
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

/* =========================
   WEBHOOK
========================= */

app.post(
  "/telegram/webhook",
  async (req, res) => {

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

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

  res.send(
    "🤖 Waamara Telegram Bot is online."
  );
});

/* =========================
   HEALTH
========================= */

app.get(
  "/health",
  async (req, res) => {

    try {

      await pool.query(
        "SELECT 1"
      );

      res.json({
        ok: true,
        app: "Waamara",
        database: "connected"
      });

    } catch (err) {

      res.status(500).json({
        ok: false,
        app: "Waamara",
        database: "error",
        error: err.message
      });
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

    console.error(
      "❌ RENDER_EXTERNAL_URL hin argamne."
    );

    return;
  }

  const webhookUrl =
    `${renderUrl}/telegram/webhook`;

  try {

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
      "Telegram:",
      result
    );

  } catch (err) {

    console.error(
      "❌ Webhook error:",
      err.message
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

/* =========================
   START SERVER
========================= */

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
