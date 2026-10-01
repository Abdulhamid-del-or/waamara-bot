const https = require("https");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN hin argamne.");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

const users = new Map();
const exams = new Map();
const sessions = new Map();

let nextExamId = 1001;

// =========================
// TELEGRAM API
// =========================

function telegram(method, data = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);

    const url = new URL(`${API}/${method}`);

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
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
              reject(new Error(json.description || "Telegram API error"));
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

async function sendMessage(chatId, text, keyboard = null) {
  const data = {
    chat_id: chatId,
    text
  };

  if (keyboard) {
    data.reply_markup = keyboard;
  }

  return telegram("sendMessage", data);
}

// =========================
// MAIN MENU
// =========================

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

function cancelKeyboard() {
  return {
    keyboard: [
      [{ text: "❌ Haqi" }]
    ],
    resize_keyboard: true
  };
}

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

// =========================
// START
// =========================

async function startBot() {
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

  console.log("🤖 Waamara Bot jalqabe.");

  let offset = 0;

  while (true) {
    try {
      const updates = await telegram("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "callback_query"]
      });

      for (const update of updates) {
        offset = update.update_id + 1;

        try {
          await handleUpdate(update);
        } catch (error) {
          console.error("Update error:", error.message);
        }
      }
    } catch (error) {
      console.error("Telegram connection error:", error.message);

      await new Promise(resolve =>
        setTimeout(resolve, 3000)
      );
    }
  }
}

// =========================
// UPDATE HANDLER
// =========================

async function handleUpdate(update) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  if (!update.message) return;

  const message = update.message;
  const chatId = message.chat.id;
  const text = message.text || "";

  if (!users.has(chatId)) {
    users.set(chatId, {
      id: chatId,
      firstName: message.from?.first_name || "",
      username: message.from?.username || "",
      createdAt: new Date().toISOString()
    });
  }

  if (text === "/start") {
    sessions.delete(chatId);

    await sendMessage(
      chatId,
      `🤖 Baga nagaan dhuftan gara Waamara!

Waamara botii barnootaa fi hojiiwwan adda addaati.

📝 Qormaata uumuu dandeessa.
📖 Qormaata fudhachuu dandeessa.
📊 Qabxii kee ilaaluu dandeessa.
📚 Barnoota argachuu dandeessa.

👇 Mee hojii barbaadde filadhu.`,
      mainMenu()
    );

    return;
  }

  if (text === "/menu") {
    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "🏠 Menu Guddaa",
      mainMenu()
    );

    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      `ℹ️ GARGAARSA WAAMARA

📝 Qormaata Uumi
Qormaata haaraa uumuu.

📖 Qormaata Fudhadhu
Koodii qormaataa fayyadamuun qormaata fudhachuu.

📊 Qabxii Koo
Bu'aa qormaata ati fudhatte ilaalu.

💼 Hojiiwwan Biroo
Tajaajiloota gara fuulduraatti itti dabalamaniif.

❌ /cancel
Hojii amma adeemaa jiru haquu.`,
      mainMenu()
    );

    return;
  }

  if (text === "/cancel" || text === "❌ Haqi") {
    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "✅ Hojii amma adeemaa ture haqame.",
      mainMenu()
    );

    return;
  }

  await handleText(chatId, text, message);
}

// =========================
// TEXT HANDLER
// =========================

async function handleText(chatId, text, message) {
  const session = sessions.get(chatId);

  // =====================
  // MENU
  // =====================

  if (text === "📝 Qormaata Uumi") {
    sessions.set(chatId, {
      type: "create_exam",
      step: "title",
      exam: {
        creatorId: chatId,
        creatorName: message.from?.first_name || "Barsiisaa",
        questions: []
      }
    });

    await sendMessage(
      chatId,
      "📝 QORMAATA UUMI\n\nMaqaa qormaataa barreessi.\n\nFakkeenya:\nQormaata Herrega Kutaa 8",
      cancelKeyboard()
    );

    return;
  }

  if (text === "📖 Qormaata Fudhadhu") {
    sessions.set(chatId, {
      type: "join_exam",
      step: "code"
    });

    await sendMessage(
      chatId,
      "📖 QORMAATA FUDHADHU\n\nKoodii qormaataa galchi.\n\nFakkeenya:\n1001",
      cancelKeyboard()
    );

    return;
  }

  if (text === "📊 Qabxii Koo") {
    await showMyResults(chatId);
    return;
  }

  if (text === "📚 Barnoota") {
    await sendMessage(
      chatId,
      `📚 BARNOOTA

Waamara keessatti barnoota gara garaa ni dabalama.

• Herrega
• Afaan Oromoo
• Afaan Arabaa
• Saayinsii
• Hawaasummaa
• Barnoota Islaamaa

🚧 Kutaan kun gara fuulduraatti bal'inaan ni ijaaramti.`,
      mainMenu()
    );

    return;
  }

  if (text === "💼 Hojiiwwan Biroo") {
    await sendMessage(
      chatId,
      `💼 HOJIIWWAN BIROO

Waamara gara fuulduraatti:

🔹 Galmee barattootaa
🔹 Beeksisa
🔹 Faayila qooduu
🔹 Gaaffii fi deebii
🔹 Tajaajila hojii
🔹 Search
🔹 Report
🔹 Tajaajila barsiisotaa

ni qabaata.

🚧 Isaan kun tartiibaan itti dabalamu.`,
      mainMenu()
    );

    return;
  }

  if (text === "👤 Profile") {
    const user = users.get(chatId);

    await sendMessage(
      chatId,
      `👤 PROFILE

Maqaa: ${user?.firstName || "-"}
Username: ${user?.username ? "@" + user.username : "-"}
Telegram ID: ${chatId}

Qormaata ati uumte:
${countCreatedExams(chatId)}

Qormaata ati fudhatte:
${countTakenExams(chatId)}`,
      mainMenu()
    );

    return;
  }

  if (text === "⚙️ Settings") {
    await sendMessage(
      chatId,
      `⚙️ SETTINGS

🌐 Afaan: Afaan Oromoo

🔔 Beeksisa: Banaa

Version: Waamara v1.0`,
      mainMenu()
    );

    return;
  }

  // =====================
  // SESSION
  // =====================

  if (!session) {
    await sendMessage(
      chatId,
      "Mee menu keessaa hojii tokko filadhu.",
      mainMenu()
    );

    return;
  }

  // =====================
  // CREATE EXAM
  // =====================

  if (session.type === "create_exam") {
    await handleCreateExam(chatId, text, session);
    return;
  }

  // =====================
  // JOIN EXAM
  // =====================

  if (session.type === "join_exam") {
    await handleJoinExam(chatId, text, session);
    return;
  }
}

// =========================
// CREATE EXAM
// =========================

async function handleCreateExam(chatId, text, session) {
  if (session.step === "title") {
    session.exam.title = text;
    session.step = "subject";

    await sendMessage(
      chatId,
      "📚 Maqaa barnootaa galchi.\n\nFakkeenya: Herrega",
      cancelKeyboard()
    );

    return;
  }

  if (session.step === "subject") {
    session.exam.subject = text;
    session.step = "question";

    await sendMessage(
      chatId,
      `❓ Gaaffii 1 barreessi.

Fakkeenya:
2 + 2 = meeqa?`,
      cancelKeyboard()
    );

    return;
  }

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

  if (session.step === "option1") {
    session.currentQuestion.options[0] = text;
    session.step = "option2";

    await sendMessage(
      chatId,
      "B. Filannoo B barreessi."
    );

    return;
  }

  if (session.step === "option2") {
    session.currentQuestion.options[1] = text;
    session.step = "option3";

    await sendMessage(
      chatId,
      "C. Filannoo C barreessi."
    );

    return;
  }

  if (session.step === "option3") {
    session.currentQuestion.options[2] = text;
    session.step = "option4";

    await sendMessage(
      chatId,
      "D. Filannoo D barreessi."
    );

    return;
  }

  if (session.step === "option4") {
    session.currentQuestion.options[3] = text;
    session.step = "correct";

    await sendMessage(
      chatId,
      `✅ Deebii sirrii filadhu.

A = 1
B = 2
C = 3
D = 4

Lakkoofsa qofa barreessi.`,
      cancelKeyboard()
    );

    return;
  }

  if (session.step === "correct") {
    const answer = Number(text);

    if (![1, 2, 3, 4].includes(answer)) {
      await sendMessage(
        chatId,
        "❌ Lakkoofsa 1, 2, 3 ykn 4 keessaa tokko galchi."
      );
      return;
    }

    session.currentQuestion.correct = answer - 1;

    session.exam.questions.push(
      session.currentQuestion
    );

    session.step = "more";

    await sendMessage(
      chatId,
      `✅ Gaaffiin ${session.exam.questions.length} qabame.

Gaaffii biraa dabaluu barbaaddaa?

"eeyyee" ykn "lakki" barreessi.`
    );

    return;
  }

  if (session.step === "more") {
    const answer = text.toLowerCase();

    if (answer === "eeyyee" || answer === "eyyee" || answer === "yes") {
      session.step = "question";

      await sendMessage(
        chatId,
        `❓ Gaaffii ${session.exam.questions.length + 1} barreessi.`
      );

      return;
    }

    if (answer === "lakki" || answer === "no") {
      await finishExam(chatId, session);
      return;
    }

    await sendMessage(
      chatId,
      'Mee "eeyyee" ykn "lakki" barreessi.'
    );
  }
}

// =========================
// FINISH EXAM
// =========================

async function finishExam(chatId, session) {
  if (session.exam.questions.length === 0) {
    sessions.delete(chatId);

    await sendMessage(
      chatId,
      "❌ Qormaanni gaaffii tokko illee hin qabu.",
      mainMenu()
    );

    return;
  }

  const code = String(nextExamId++);

  const exam = {
    id: code,
    ...session.exam,
    createdAt: new Date().toISOString(),
    results: []
  };

  exams.set(code, exam);
  sessions.delete(chatId);

  await sendMessage(
    chatId,
    `🎉 QORMAANNI UUWAME!

📚 Maqaa: ${exam.title}
📖 Barnoota: ${exam.subject}
❓ Gaaffilee: ${exam.questions.length}

🔑 Koodii Qormaataa:
${code}

📢 Koodii kana barattootaaf kenni.

Barataan:
📖 Qormaata Fudhadhu
→ koodii ${code} galcha
→ maqaa isaa galcha
→ qormaata fudhata.`,
    mainMenu()
  );
}

// =========================
// JOIN EXAM
// =========================

async function handleJoinExam(chatId, text, session) {
  if (session.step === "code") {
    const exam = exams.get(text.trim());

    if (!exam) {
      await sendMessage(
        chatId,
        "❌ Qormaata kanaan walqabatu hin argamne.\n\nKoodii sirrii galchi."
      );
      return;
    }

    session.examId = text.trim();
    session.step = "student_name";

    await sendMessage(
      chatId,
      `✅ Qormaanni argame!

📚 ${exam.title}
📖 ${exam.subject}
❓ Gaaffilee: ${exam.questions.length}

Amma maqaa kee barreessi.`
    );

    return;
  }

  if (session.step === "student_name") {
    const exam = exams.get(session.examId);

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

// =========================
// SEND QUESTION
// =========================

async function sendQuestion(chatId, exam, session) {
  const index = session.questionIndex;
  const question = exam.questions[index];

  if (!question) {
    await finishStudentExam(chatId, exam, session);
    return;
  }

  await sendMessage(
    chatId,
    `📝 QORMAATA

Gaaffii ${index + 1}/${exam.questions.length}

${question.question}`,
    examAnswerKeyboard(question.options)
  );
}

// =========================
// CALLBACK
// =========================

async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const data = callback.data;

  await telegram("answerCallbackQuery", {
    callback_query_id: callback.id
  });

  const session = sessions.get(chatId);

  if (!session || session.step !== "taking") {
    await sendMessage(
      chatId,
      "❌ Qormaanni kun yeroo ammaa hin jiruu ykn xumurameera."
    );
    return;
  }

  if (!data.startsWith("answer_")) return;

  const selected = Number(
    data.replace("answer_", "")
  );

  const exam = exams.get(session.examId);

  if (!exam) return;

  const question = exam.questions[
    session.questionIndex
  ];

  const correct =
    selected === question.correct;

  if (correct) {
    session.score += question.points;
  }

  session.answers.push({
    question: question.question,
    selected,
    correct: question.correct,
    isCorrect: correct
  });

  session.questionIndex++;

  await sendQuestion(
    chatId,
    exam,
    session
  );
}

// =========================
// FINISH STUDENT EXAM
// =========================

async function finishStudentExam(chatId, exam, session) {
  const total = exam.questions.reduce(
    (sum, q) => sum + q.points,
    0
  );

  const percentage =
    total > 0
      ? Math.round((session.score / total) * 100)
      : 0;

  const result = {
    studentId: chatId,
    studentName: session.studentName,
    score: session.score,
    total,
    percentage,
    answers: session.answers,
    createdAt: new Date().toISOString()
  };

  exam.results.push(result);

  sessions.delete(chatId);

  await sendMessage(
    chatId,
    `🎉 QORMAATA XUMURTE!

👤 Maqaa: ${session.studentName}

📊 Bu'aa:
✅ Qabxii: ${session.score}/${total}
📈 Dhibbeentaa: ${percentage}%

Gaaffii sirrii:
${session.answers.filter(a => a.isCorrect).length}

Gaaffii dogoggoraa:
${session.answers.filter(a => !a.isCorrect).length}`,
    mainMenu()
  );
}

// =========================
// RESULTS
// =========================

async function showMyResults(chatId) {
  const results = [];

  for (const exam of exams.values()) {
    for (const result of exam.results) {
      if (result.studentId === chatId) {
        results.push({
          exam: exam.title,
          subject: exam.subject,
          ...result
        });
      }
    }
  }

  if (results.length === 0) {
    await sendMessage(
      chatId,
      "📊 Ammaaf qormaata ati fudhatte hin jiru.",
      mainMenu()
    );
    return;
  }

  let text = "📊 QABXII KOO\n\n";

  results.forEach((r, i) => {
    text +=
      `${i + 1}. ${r.exam}\n` +
      `📚 ${r.subject}\n` +
      `👤 ${r.studentName}\n` +
      `✅ ${r.score}/${r.total}\n` +
      `📈 ${r.percentage}%\n\n`;
  });

  await sendMessage(
    chatId,
    text,
    mainMenu()
  );
}

// =========================
// HELPERS
// =========================

function countCreatedExams(chatId) {
  let count = 0;

  for (const exam of exams.values()) {
    if (exam.creatorId === chatId) {
      count++;
    }
  }

  return count;
}

function countTakenExams(chatId) {
  let count = 0;

  for (const exam of exams.values()) {
    for (const result of exam.results) {
      if (result.studentId === chatId) {
        count++;
      }
    }
  }

  return count;
}

// =========================
// START
// =========================

startBot().catch(error => {
  console.error("❌ Bot stopped:", error);
  process.exit(1);
});
