const express = require("express");
const https = require("https");

const app = express();

const PORT = process.env.PORT || 10000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN hin argamne.");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// ======================================================
// DATA
// ======================================================

const users = new Map();
const exams = new Map();
const sessions = new Map();

let nextExamId = 1001;

// ======================================================
// RENDER HEALTH ROUTE
// ======================================================

app.get("/", (req, res) => {
  res.status(200).send(`
    <html>
      <head>
        <title>Waamara Bot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family:Arial;text-align:center;padding:40px">
        <h1>🤖 Waamara Bot</h1>
        <p>Telegram Bot is running.</p>
        <p>Status: 🟢 Online</p>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "Waamara Bot",
    message: "Waamara Telegram Bot is running",
    time: new Date().toISOString()
  });
});

// ======================================================
// TELEGRAM API
// ======================================================

function telegram(method, data = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const url = new URL(`${TELEGRAM_API}/${method}`);

    const request = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
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

// ======================================================
// SEND MESSAGE
// ======================================================

async function sendMessage(chatId, text, keyboard = null) {
  const data = {
    chat_id: chatId,
    text: text
  };

  if (keyboard) {
    data.reply_markup = keyboard;
  }

  return telegram("sendMessage", data);
}

// ======================================================
// MAIN MENU
// ======================================================

function mainMenu() {
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
        { text: "💼 Hojiiwwan Biroo" },
        { text: "👤 Profile" }
      ],
      [
        { text: "⚙️ Settings" }
      ]
    ],
    resize_keyboard: true
  };
}

// ======================================================
// CANCEL MENU
// ======================================================

function cancelKeyboard() {
  return {
    keyboard: [
      [{ text: "❌ Haqi" }]
    ],
    resize_keyboard: true
  };
}

// ======================================================
// ANSWER BUTTONS
// ======================================================

function examAnswerKeyboard(options) {
  return {
    inline_keyboard: options.map((option, index) => [
      {
        text: `${String.fromCharCode(65 + index)}. ${option}`,
        callback_data: `answer_${index}`
      }
    ])
  };
}

// ======================================================
// START COMMAND
// ======================================================

async function startBot() {
  try {
    await telegram("deleteWebhook", {
      drop_pending_updates: true
    });

    await telegram("setMyCommands", {
      commands: [
        {
          command: "start",
          description: "Waamara jalqabi"
        },
        {
          command: "menu",
          description: "Menu bani"
        },
        {
          command: "help",
          description: "Gargaarsa"
        },
        {
          command: "cancel",
          description: "Hojii amma jiru haqi"
        }
      ]
    });

    console.log("🤖 Waamara Telegram Bot jalqabe.");

    let offset = 0;

    while (true) {
      try {
        const updates = await telegram("getUpdates", {
          offset: offset,
          timeout: 30,
          allowed_updates: [
            "message",
            "callback_query"
          ]
        });

        for (const update of updates) {
          offset = update.update_id + 1;

          try {
            await handleUpdate(update);
          } catch (error) {
            console.error(
              "❌ Update error:",
              error.message
            );
          }
        }
      } catch (error) {
        console.error(
          "❌ Telegram connection error:",
          error.message
        );

        await new Promise(resolve =>
          setTimeout(resolve, 3000)
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ Bot startup error:",
      error.message
    );

    process.exit(1);
  }
}

// ======================================================
// UPDATE HANDLER
// ======================================================

async function handleUpdate(update) {

  // CALLBACK
  if (update.callback_query) {
    await handleCallback(
      update.callback_query
    );
    return;
  }

  // MESSAGE
  if (!update.message) {
    return;
  }

  const message = update.message;
  const chatId = message.chat.id;
  const text = message.text || "";

  // USER SAVE
  if (!users.has(chatId)) {
    users.set(chatId, {
      id: chatId,
      firstName:
        message.from?.first_name || "",
      lastName:
        message.from?.last_name || "",
      username:
        message.from?.username || "",
      createdAt:
        new Date().toISOString()
    });
  }

  // START
  if (text === "/start") {

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      `🤖 BAGA NAGAAN DHUFTAN GARA WAAMARA!

Waamara botii barnootaa fi hojiiwwan adda addaati.

📝 Qormaata uumuu dandeessa.
📖 Qormaata fudhachuu dandeessa.
📊 Qabxii kee ilaaluu dandeessa.
📚 Barnoota argachuu dandeessa.
💼 Hojiiwwan biroo fayyadamuu dandeessa.

👇 Mee hojii barbaadde filadhu.`,
      mainMenu()
    );

    return;
  }

  // MENU
  if (text === "/menu") {

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "🏠 MENU GUDDAA",
      mainMenu()
    );

    return;
  }

  // HELP
  if (text === "/help") {

    await sendMessage(
      chatId,
      `ℹ️ GARGAARSA WAAMARA

📝 Qormaata Uumi
Qormaata haaraa uumuu.

📖 Qormaata Fudhadhu
Koodii fayyadamuun qormaata fudhachuu.

📊 Qabxii Koo
Bu'aa qormaata ati fudhatte ilaalu.

📚 Barnoota
Barnoota adda addaa argachuu.

💼 Hojiiwwan Biroo
Tajaajila gara garaa argachuu.

❌ /cancel
Hojii adeemaa jiru haquu.`,
      mainMenu()
    );

    return;
  }

  // CANCEL
  if (
    text === "/cancel" ||
    text === "❌ Haqi"
  ) {

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "✅ Hojii amma adeemaa ture haqame.",
      mainMenu()
    );

    return;
  }

  await handleText(
    chatId,
    text,
    message
  );
}

// ======================================================
// TEXT HANDLER
// ======================================================

async function handleText(
  chatId,
  text,
  message
) {

  const session = sessions.get(chatId);

  // CREATE EXAM
  if (text === "📝 Qormaata Uumi") {

    sessions.set(chatId, {
      type: "create_exam",
      step: "title",

      exam: {
        creatorId: chatId,
        creatorName:
          message.from?.first_name ||
          "Barsiisaa",
        questions: []
      }
    });

    await sendMessage(
      chatId,
      `📝 QORMAATA UUMI

Maqaa qormaataa barreessi.

Fakkeenya:
Qormaata Herrega Kutaa 8`,
      cancelKeyboard()
    );

    return;
  }

  // JOIN EXAM
  if (text === "📖 Qormaata Fudhadhu") {

    sessions.set(chatId, {
      type: "join_exam",
      step: "code"
    });

    await sendMessage(
      chatId,
      `📖 QORMAATA FUDHADHU

Koodii qormaataa galchi.

Fakkeenya:
1001`,
      cancelKeyboard()
    );

    return;
  }

  // RESULTS
  if (text === "📊 Qabxii Koo") {

    await showMyResults(chatId);

    return;
  }

  // EDUCATION
  if (text === "📚 Barnoota") {

    await sendMessage(
      chatId,
      `📚 BARNOOTA

Waamara keessatti barnoota gara garaa ni argatta.

📐 Herrega
📖 Afaan Oromoo
🌍 Saayinsii
📚 Hawaasummaa
🕌 Barnoota Islaamaa
💻 Teknooloojii

Kutaan barnootaa gara fuulduraatti
bal'inaan ni dabalama.`,
      mainMenu()
    );

    return;
  }

  // OTHER SERVICES
  if (text === "💼 Hojiiwwan Biroo") {

    await sendMessage(
      chatId,
      `💼 HOJIIWWAN BIROO

Waamara gara fuulduraatti tajaajiloota hedduu qabaata.

🔹 Gaaffii fi deebii
🔹 Faayila qooduu
🔹 Beeksisa
🔹 Search
🔹 Galmee
🔹 Report
🔹 Tajaajila barsiisotaa
🔹 Tajaajila barattootaa

🚧 Tajaajiloonni kun tartiibaan
itti dabalamu.`,
      mainMenu()
    );

    return;
  }

  // PROFILE
  if (text === "👤 Profile") {

    const user = users.get(chatId);

    await sendMessage(
      chatId,
      `👤 PROFILE

Maqaa:
${user?.firstName || "-"}

Username:
${
  user?.username
    ? "@" + user.username
    : "-"
}

Telegram ID:
${chatId}

📝 Qormaata uumte:
${countCreatedExams(chatId)}

📖 Qormaata fudhatte:
${countTakenExams(chatId)}`,
      mainMenu()
    );

    return;
  }

  // SETTINGS
  if (text === "⚙️ Settings") {

    await sendMessage(
      chatId,
      `⚙️ SETTINGS

🌐 Afaan:
Afaan Oromoo

🔔 Beeksisa:
Banaa

🤖 Bot:
Waamara

📦 Version:
1.0.0`,
      mainMenu()
    );

    return;
  }

  // NO SESSION
  if (!session) {

    await sendMessage(
      chatId,
      "Mee menu keessaa hojii tokko filadhu.",
      mainMenu()
    );

    return;
  }

  // CREATE SESSION
  if (
    session.type ===
    "create_exam"
  ) {

    await handleCreateExam(
      chatId,
      text,
      session
    );

    return;
  }

  // JOIN SESSION
  if (
    session.type ===
    "join_exam"
  ) {

    await handleJoinExam(
      chatId,
      text,
      session
    );

    return;
  }
}

// ======================================================
// CREATE EXAM
// ======================================================

async function handleCreateExam(
  chatId,
  text,
  session
) {

  // TITLE
  if (session.step === "title") {

    session.exam.title = text;

    session.step = "subject";

    await sendMessage(
      chatId,
      `📚 Maqaa barnootaa galchi.

Fakkeenya:
Herrega`,
      cancelKeyboard()
    );

    return;
  }

  // SUBJECT
  if (session.step === "subject") {

    session.exam.subject = text;

    session.step = "question";

    await sendMessage(
      chatId,
      `❓ GAAFFII 1

Gaaffii kee barreessi.

Fakkeenya:
2 + 2 = meeqa?`,
      cancelKeyboard()
    );

    return;
  }

  // QUESTION
  if (session.step === "question") {

    session.currentQuestion = {
      question: text,
      options: [],
      correct: null,
      points: 1
    };

    session.step = "option1";

    await sendMessage(
      chatId,
      "A. Filannoo A barreessi.",
      cancelKeyboard()
    );

    return;
  }

  // OPTION A
  if (session.step === "option1") {

    session.currentQuestion.options[0] =
      text;

    session.step = "option2";

    await sendMessage(
      chatId,
      "B. Filannoo B barreessi."
    );

    return;
  }

  // OPTION B
  if (session.step === "option2") {

    session.currentQuestion.options[1] =
      text;

    session.step = "option3";

    await sendMessage(
      chatId,
      "C. Filannoo C barreessi."
    );

    return;
  }

  // OPTION C
  if (session.step === "option3") {

    session.currentQuestion.options[2] =
      text;

    session.step = "option4";

    await sendMessage(
      chatId,
      "D. Filannoo D barreessi."
    );

    return;
  }

  // OPTION D
  if (session.step === "option4") {

    session.currentQuestion.options[3] =
      text;

    session.step = "correct";

    await sendMessage(
      chatId,
      `✅ DEEBII SIRRII FILADHU

A = 1
B = 2
C = 3
D = 4

Lakkoofsa qofa barreessi.`,
      cancelKeyboard()
    );

    return;
  }

  // CORRECT ANSWER
  if (session.step === "correct") {

    const answer = Number(text);

    if (
      ![1, 2, 3, 4].includes(answer)
    ) {

      await sendMessage(
        chatId,
        "❌ Mee 1, 2, 3 ykn 4 keessaa tokko galchi."
      );

      return;
    }

    session.currentQuestion.correct =
      answer - 1;

    session.exam.questions.push(
      session.currentQuestion
    );

    session.step = "more";

    await sendMessage(
      chatId,
      `✅ Gaaffiin ${
        session.exam.questions.length
      } qabame.

❓ Gaaffii biraa dabaluu barbaaddaa?

"Eeyyee" ykn "Lakkii" barreessi.`
    );

    return;
  }

  // MORE QUESTIONS
  if (session.step === "more") {

    const answer =
      text.toLowerCase().trim();

    if (
      answer === "eeyyee" ||
      answer === "eyyee" ||
      answer === "yes"
    ) {

      session.step = "question";

      await sendMessage(
        chatId,
        `❓ GAAFFII ${
          session.exam.questions.length + 1
        }

Gaaffii kee barreessi.`
      );

      return;
    }

    if (
      answer === "lakkii" ||
      answer === "lakki" ||
      answer === "no"
    ) {

      await finishExam(
        chatId,
        session
      );

      return;
    }

    await sendMessage(
      chatId,
      'Mee "Eeyyee" ykn "Lakkii" barreessi.'
    );
  }
}

// ======================================================
// FINISH EXAM
// ======================================================

async function finishExam(
  chatId,
  session
) {

  if (
    session.exam.questions.length === 0
  ) {

    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "❌ Qormaanni gaaffii tokko illee hin qabu.",
      mainMenu()
    );

    return;
  }

  const code =
    String(nextExamId++);

  const exam = {
    id: code,
    title: session.exam.title,
    subject: session.exam.subject,
    creatorId: session.exam.creatorId,
    creatorName: session.exam.creatorName,
    questions: session.exam.questions,
    createdAt:
      new Date().toISOString(),
    results: []
  };

  exams.set(code, exam);

  sessions.delete(chatId);

  await sendMessage(
    chatId,
    `🎉 QORMAANNI UUWAME!

📚 Maqaa:
${exam.title}

📖 Barnoota:
${exam.subject}

❓ Gaaffilee:
${exam.questions.length}

🔑 KOODII QORMAATAA:
${code}

📢 Koodii kana barattootaaf kenni.

Barataan:
📖 Qormaata Fudhadhu
→ Koodii galcha
→ Maqaa isaa galcha
→ Qormaata fudhata.`,
    mainMenu()
  );
}

// ======================================================
// JOIN EXAM
// ======================================================

async function handleJoinExam(
  chatId,
  text,
  session
) {

  // CODE
  if (session.step === "code") {

    const code = text.trim();

    const exam = exams.get(code);

    if (!exam) {

      await sendMessage(
        chatId,
        `❌ Qormaata koodii:

${code}

jedhu hin argamne.

Mee koodii sirrii galchi.`
      );

      return;
    }

    session.examId = code;

    session.step = "student_name";

    await sendMessage(
      chatId,
      `✅ QORMAANNI ARGAME!

📚 ${exam.title}
📖 ${exam.subject}
❓ Gaaffilee: ${exam.questions.length}

👤 Amma maqaa kee barreessi.`
    );

    return;
  }

  // STUDENT NAME
  if (
    session.step ===
    "student_name"
  ) {

    const exam =
      exams.get(session.examId);

    if (!exam) {

      sessions.delete(chatId);

      await sendMessage(
        chatId,
        "❌ Qormaanni kun hin argamne.",
        mainMenu()
      );

      return;
    }

    session.studentName = text;

    session.step = "taking";
    session.questionIndex = 0;
    session.answers = [];
    session.score = 0;

    await sendQuestion(
      chatId,
      exam,
      session
    );
  }
}

// ======================================================
// SEND QUESTION
// ======================================================

async function sendQuestion(
  chatId,
  exam,
  session
) {

  const index =
    session.questionIndex;

  const question =
    exam.questions[index];

  if (!question) {

    await finishStudentExam(
      chatId,
      exam,
      session
    );

    return;
  }

  await sendMessage(
    chatId,
    `📝 QORMAATA

📌 Gaaffii ${
      index + 1
    }/${exam.questions.length}

${question.question}`,
    examAnswerKeyboard(
      question.options
    )
  );
}

// ======================================================
// CALLBACK
// ======================================================

async function handleCallback(
  callback
) {

  const chatId =
    callback.message.chat.id;

  const data =
    callback.data;

  await telegram(
    "answerCallbackQuery",
    {
      callback_query_id:
        callback.id
    }
  );

  const session =
    sessions.get(chatId);

  if (
    !session ||
    session.step !== "taking"
  ) {

    await sendMessage(
      chatId,
      "❌ Qormaanni kun xumurameera ykn hin jiru."
    );

    return;
  }

  if (
    !data.startsWith("answer_")
  ) {
    return;
  }

  const selected =
    Number(
      data.replace(
        "answer_",
        ""
      )
    );

  const exam =
    exams.get(
      session.examId
    );

  if (!exam) {
    return;
  }

  const question =
    exam.questions[
      session.questionIndex
    ];

  if (!question) {
    return;
  }

  const correct =
    selected === question.correct;

  if (correct) {
    session.score +=
      question.points;
  }

  session.answers.push({
    question:
      question.question,

    selected: selected,

    correct:
      question.correct,

    isCorrect:
      correct
  });

  session.questionIndex++;

  await sendQuestion(
    chatId,
    exam,
    session
  );
}

// ======================================================
// FINISH STUDENT EXAM
// ======================================================

async function finishStudentExam(
  chatId,
  exam,
  session
) {

  const total =
    exam.questions.reduce(
      (sum, question) =>
        sum + question.points,
      0
    );

  const percentage =
    total > 0
      ? Math.round(
          (session.score / total) *
            100
        )
      : 0;

  const correctAnswers =
    session.answers.filter(
      answer =>
        answer.isCorrect
    ).length;

  const wrongAnswers =
    session.answers.filter(
      answer =>
        !answer.isCorrect
    ).length;

  const result = {
    studentId: chatId,
    studentName:
      session.studentName,

    score:
      session.score,

    total:
      total,

    percentage:
      percentage,

    correctAnswers:
      correctAnswers,

    wrongAnswers:
      wrongAnswers,

    answers:
      session.answers,

    createdAt:
      new Date().toISOString()
  };

  exam.results.push(result);

  sessions.delete(chatId);

  await sendMessage(
    chatId,
    `🎉 QORMAATA XUMURTE!

👤 Maqaa:
${session.studentName}

📊 BU'AA

✅ Qabxii:
${session.score}/${total}

📈 Dhibbeentaa:
${percentage}%

✅ Sirrii:
${correctAnswers}

❌ Dogoggoraa:
${wrongAnswers}

Galatoomi Waamara fayyadamuu keetiif!`,
    mainMenu()
  );
}

// ======================================================
// SHOW RESULTS
// ======================================================

async function showMyResults(
  chatId
) {

  const results = [];

  for (
    const exam of exams.values()
  ) {

    for (
      const result of exam.results
    ) {

      if (
        result.studentId === chatId
      ) {

        results.push({
          exam:
            exam.title,

          subject:
            exam.subject,

          studentName:
            result.studentName,

          score:
            result.score,

          total:
            result.total,

          percentage:
            result.percentage,

          correctAnswers:
            result.correctAnswers,

          wrongAnswers:
            result.wrongAnswers,

          createdAt:
            result.createdAt
        });
      }
    }
  }

  if (results.length === 0) {

    await sendMessage(
      chatId,
      `📊 QABXII KOO

Ammaaf qormaata ati fudhatte hin jiru.`,
      mainMenu()
    );

    return;
  }

  let text =
    "📊 QABXII KOO\n\n";

  results.forEach(
    (result, index) => {

      text +=
        `${index + 1}. ${result.exam}\n` +
        `📚 ${result.subject}\n` +
        `👤 ${result.studentName}\n` +
        `✅ ${result.score}/${result.total}\n` +
        `📈 ${result.percentage}%\n` +
        `✔️ Sirrii: ${result.correctAnswers}\n` +
        `❌ Dogoggoraa: ${result.wrongAnswers}\n\n`;
    }
  );

  await sendMessage(
    chatId,
    text,
    mainMenu()
  );
}

// ======================================================
// HELPERS
// ======================================================

function countCreatedExams(
  chatId
) {

  let count = 0;

  for (
    const exam of exams.values()
  ) {

    if (
      exam.creatorId === chatId
    ) {
      count++;
    }
  }

  return count;
}

function countTakenExams(
  chatId
) {

  let count = 0;

  for (
    const exam of exams.values()
  ) {

    for (
      const result of exam.results
    ) {

      if (
        result.studentId === chatId
      ) {
        count++;
      }
    }
  }

  return count;
}

// ======================================================
// START EXPRESS SERVER
// ======================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🌐 Waamara server running on port ${PORT}`
    );

    console.log(
      `❤️ Health: /health`
    );
  }
);

// ======================================================
// START TELEGRAM BOT
// ======================================================

startBot();
