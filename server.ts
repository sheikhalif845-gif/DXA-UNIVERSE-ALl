import express from "express";
import { createServer as createViteServer } from "vite";
import TelegramBot from "node-telegram-bot-api";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import https from "https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("bot_data.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    numbers_taken INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    service TEXT,
    country TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER,
    number_string TEXT,
    is_used INTEGER DEFAULT 0,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bot_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  INSERT OR IGNORE INTO bot_settings (key, value) VALUES ('force_join', 'enabled');
`);

const BOT_TOKEN = "8332473503:AAGEHzMPRw_zrliI_keOOQ0UCYVj-yo-32M";
const ADMIN_IDS = [8197284774, 8570538705];
const CHANNELS = ["dxa_universe", "developer_x_asik"]; // Without @ for getChatMember
const OTP_GROUP = "https://t.me/dxaotpzone";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function isAdmin(userId: number) {
  return ADMIN_IDS.includes(userId);
}

const userStates: Record<number, { 
  step: string; 
  file_id?: number; 
  service?: string; 
  country?: string; 
  temp_file_path?: string;
}> = {};

async function checkForceJoin(userId: number): Promise<boolean> {
  const setting = db.prepare("SELECT value FROM bot_settings WHERE key = 'force_join'").get() as { value: string };
  if (setting.value === "disabled") return true;

  for (const channel of CHANNELS) {
    try {
      const member = await bot.getChatMember(`@${channel}`, userId);
      if (member.status === "left" || member.status === "kicked") return false;
    } catch (e) {
      console.error(`Error checking join for ${channel}:`, e);
      return false;
    }
  }
  return true;
}

function isMaintenanceMode(): boolean {
  return false;
}

const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: "📲 Get Number" }, { text: "👤 My Profile" }],
      [{ text: "🛠️ Admin Panel" }]
    ],
    resize_keyboard: true
  }
};

const ADMIN_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "📊 System Analytics", callback_data: "admin_stats" }, { text: "👥 User Base", callback_data: "admin_users" }],
      [{ text: "📤 Import Numbers", callback_data: "admin_upload" }, { text: "📂 Manage Files", callback_data: "admin_delete_list" }],
      [{ text: "📣 Announcement", callback_data: "admin_broadcast" }, { text: "⚙️ Bot Settings", callback_data: "admin_settings" }],
      [{ text: "🏠 Return Home", callback_data: "main_menu" }]
    ]
  }
};

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!userId) return;

  // Register user
  const stmt = db.prepare("INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)");
  stmt.run(userId, msg.from?.username || "Unknown");

  if (!(await checkForceJoin(userId))) {
    return bot.sendMessage(chatId, "⚠️ *Access Denied!*\n\nYou must join our official channels to use this bot:\n\n1️⃣ [DXA Universe](https://t.me/dxa_universe)\n2️⃣ [Developer X Asik](https://t.me/developer_x_asik)\n\n*After joining, click /start again.*", {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 Join Channel 1", url: "https://t.me/dxa_universe" }],
          [{ text: "📢 Join Channel 2", url: "https://t.me/developer_x_asik" }],
          [{ text: "✅ Joined", callback_data: "check_join" }]
        ]
      }
    });
  }

  const keyboard = { ...MAIN_KEYBOARD };
  if (!isAdmin(userId)) {
    keyboard.reply_markup.keyboard = [[{ text: "📲 Get Number" }, { text: "👤 My Profile" }]];
  }

  const firstName = msg.from?.first_name || "User";
  const welcomeMessage = `🔥 *DXA NUMBER BOT* 🔥
━━━━━━━━━━━
👋 *Hello, ${firstName}!* Welcome To *DXA UNIVERSE*. Thanks For Using Our Bot.

📌 Tap 📱 *Get Number* to start!
━━━━━━━━━━━
😒 *POWERED BY DXA UNIVERSE*`;

  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: "Markdown",
    ...keyboard
  });
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = msg.text;

  if (!userId) return;

  // Maintenance Check - Removed as requested

  // Handle Broadcast
  if (userStates[userId]?.step === "waiting_for_broadcast") {
    const users = db.prepare("SELECT id FROM users").all() as { id: number }[];
    let success = 0;
    let fail = 0;

    bot.sendMessage(chatId, `Starting broadcast to ${users.length} users...`);

    for (const user of users) {
      try {
        if (msg.photo) {
          await bot.sendPhoto(user.id, msg.photo[msg.photo.length - 1].file_id, { caption: msg.caption });
        } else if (msg.video) {
          await bot.sendVideo(user.id, msg.video.file_id, { caption: msg.caption });
        } else if (msg.text) {
          await bot.sendMessage(user.id, msg.text);
        } else if (msg.document) {
          await bot.sendDocument(user.id, msg.document.file_id, { caption: msg.caption });
        } else {
          // Forward message
          await bot.forwardMessage(user.id, chatId, msg.message_id);
        }
        success++;
      } catch (e) {
        fail++;
      }
    }

    delete userStates[userId];
    return bot.sendMessage(chatId, `Broadcast finished!\nSuccess: ${success}\nFailed: ${fail}`, ADMIN_KEYBOARD);
  }

  if (text === "🛠️ Admin Panel" && isAdmin(userId)) {
    return bot.sendMessage(chatId, `⚡ *DXA COMMAND CENTER* ⚡
━━━━━━━━━━━

👋 *Greetings, Administrator.*
The system is fully operational. Use the controls below to manage the DXA ecosystem.

🛠️ *System Status:* 100% Stable
━━━━━━━━━━━`, {
      parse_mode: "Markdown",
      ...ADMIN_KEYBOARD
    });
  }

  if (text === "👤 My Profile") {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    
    const profileMsg = `👤 *USER PROFILE*
━━━━━━━━━━━
🆔 *User ID:* \`${userId}\`
👤 *Username:* @${user.username || "N/A"}
📅 *Joined:* \`${new Date(user.joined_at).toLocaleDateString()}\`
🔢 *Numbers Taken:* \`${user.numbers_taken || 0}\`

🚀 *Account Status:* Active ✅
━━━━━━━━━━━`;
    return bot.sendMessage(chatId, profileMsg, { parse_mode: "Markdown" });
  }

  if (text === "📲 Get Number") {
    if (!(await checkForceJoin(userId))) {
      return bot.sendMessage(chatId, "❌ Please join channels first!");
    }

    const services = db.prepare("SELECT DISTINCT service FROM files").all() as { service: string }[];
    if (services.length === 0) {
      return bot.sendMessage(chatId, "📭 *No numbers available yet.*\n\nPlease check back later or contact the admin.", { parse_mode: "Markdown" });
    }

    const buttons = services.map(s => [{ text: `🔹 ${s.service}`, callback_data: `get_service_${s.service}` }]);
    bot.sendMessage(chatId, "💎 *Select Service*\n\nChoose the service you need a number for:", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [...buttons, [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] }
    });
  }

  // Handle File Upload
  if (msg.document && isAdmin(userId) && userStates[userId]?.step === "waiting_for_file") {
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;

    if (!fileName?.endsWith(".txt")) {
      return bot.sendMessage(chatId, "❌ *Error:* Please upload a valid `.txt` file.", { parse_mode: "Markdown" });
    }

    const fileLink = await bot.getFileLink(fileId);
    
    bot.sendMessage(chatId, "⏳ *Processing file...*", { parse_mode: "Markdown" });

    https.get(fileLink, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        const rawNumbers = data.split(/\r?\n/).filter(n => n.trim() !== "");
        if (rawNumbers.length === 0) {
          return bot.sendMessage(chatId, "❌ *Error:* The uploaded file is empty.", { parse_mode: "Markdown" });
        }

        // Normalize numbers: Add + if missing
        const numbers = rawNumbers.map(n => {
          let trimmed = n.trim();
          return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
        });

        userStates[userId] = { 
          step: "waiting_for_service", 
          temp_file_path: fileName,
        };
        (userStates[userId] as any).numbers = numbers;

        bot.sendMessage(chatId, "📝 *Enter Service Name*\n\n(e.g., Telegram, WhatsApp, Gmail)", { parse_mode: "Markdown" });
      });
    });
  } else if (isAdmin(userId) && userStates[userId]?.step === "waiting_for_service") {
    userStates[userId].service = text;
    userStates[userId].step = "waiting_for_country";
    bot.sendMessage(chatId, `🌍 *Enter Country Name* for *${text}*:`, { parse_mode: "Markdown" });
  } else if (isAdmin(userId) && userStates[userId]?.step === "waiting_for_country") {
    const service = userStates[userId].service!;
    const country = text!;
    const numbers = (userStates[userId] as any).numbers as string[];
    const fileName = userStates[userId].temp_file_path!;

    const fileStmt = db.prepare("INSERT INTO files (name, service, country) VALUES (?, ?, ?)");
    const info = fileStmt.run(fileName, service, country);
    const fileId = info.lastInsertRowid;

    const numStmt = db.prepare("INSERT INTO numbers (file_id, number_string) VALUES (?, ?)");
    const insertMany = db.transaction((nums: string[]) => {
      for (const n of nums) numStmt.run(fileId, n);
    });
    insertMany(numbers);

    delete userStates[userId];
    bot.sendMessage(chatId, `✅ *Success!*\n\nUploaded *${numbers.length}* numbers for *${service}* (${country}).`, {
      parse_mode: "Markdown",
      ...ADMIN_KEYBOARD
    });
  }
});

function sendAdminSettings(chatId: number, messageId?: number) {
  const forceJoin = db.prepare("SELECT value FROM bot_settings WHERE key = 'force_join'").get() as { value: string };

  const fjText = forceJoin.value === "enabled" ? "Enabled ✅" : "Disabled ❌";

  const text = `⚙️ *BOT CONFIGURATION*
━━━━━━━━━━━
Manage global bot settings here.

🔒 *Force Join:* ${fjText}

━━━━━━━━━━━`;

  const options: any = {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: { 
      inline_keyboard: [
        [{ text: `🔒 Toggle Force Join`, callback_data: `toggle_force_join` }],
        [{ text: "🔙 Back", callback_data: "admin_panel" }]
      ] 
    }
  };

  if (messageId) {
    bot.editMessageText(text, options);
  } else {
    bot.sendMessage(chatId, text, options);
  }
}

bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (!chatId || !data) return;

  // Maintenance Check - Removed as requested

  if (data === "admin_users" && isAdmin(userId)) {
    try {
      const users = db.prepare("SELECT * FROM users ORDER BY joined_at DESC LIMIT 15").all() as any[];
      const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
      
      let userList = users.map((u, i) => {
        const username = u.username ? `@${u.username}` : "N/A";
        return `${i+1}. ${username} (\`${u.id}\`) - 🔢 \`${u.numbers_taken || 0}\``;
      }).join("\n");
      
      bot.editMessageText(`👥 *USER BASE OVERVIEW*
━━━━━━━━━━━
📈 *Total Users:* \`${totalUsers.count}\`

🆕 *Recent Signups & Activity:*
${userList || "_No users yet_"}

━━━━━━━━━━━`, {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "admin_panel" }]] }
      });
    } catch (error) {
      console.error("Error in admin_users:", error);
      bot.answerCallbackQuery(query.id, { text: "❌ Error fetching user base!", show_alert: true });
    }
  }

  if (data === "admin_settings" && isAdmin(userId)) {
    sendAdminSettings(chatId, query.message?.message_id);
  }

  if (data === "toggle_force_join" && isAdmin(userId)) {
    const current = db.prepare("SELECT value FROM bot_settings WHERE key = 'force_join'").get() as { value: string };
    const newValue = current.value === "enabled" ? "disabled" : "enabled";
    db.prepare("UPDATE bot_settings SET value = ? WHERE key = 'force_join'").run(newValue);
    bot.answerCallbackQuery(query.id, { text: `Force Join ${newValue}` });
    sendAdminSettings(chatId, query.message?.message_id);
  }

  if (data === "admin_stats" && isAdmin(userId)) {
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    const totalFiles = db.prepare("SELECT COUNT(*) as count FROM files").get() as { count: number };
    const totalNumbers = db.prepare("SELECT COUNT(*) as count FROM numbers").get() as { count: number };
    const unusedNumbers = db.prepare("SELECT COUNT(*) as count FROM numbers WHERE is_used = 0").get() as { count: number };
    const assignedNumbers = totalNumbers.count - unusedNumbers.count;

    // Progress bar logic
    const total = totalNumbers.count || 1;
    const percentage = Math.round((unusedNumbers.count / total) * 100);
    const filledBlocks = Math.round(percentage / 10);
    const emptyBlocks = 10 - filledBlocks;
    const progressBar = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);

    const now = new Date().toLocaleTimeString();

    const statsMessage = `💎 *DXA SYSTEM ANALYTICS* 💎
━━━━━━━━━━━

📊 *DATABASE OVERVIEW*
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  👤  *Total Users*   »  \`${totalUsers.count}\`
  📁  *Active Files*  »  \`${totalFiles.count}\`
  🔢  *Total Stock*   »  \`${totalNumbers.count}\`
  ✅  *Assigned*      »  \`${assignedNumbers}\`
  🚀  *Available*     »  \`${unusedNumbers.count}\`

📈 *STOCK UTILIZATION*
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  \`[${progressBar}]\`  *${percentage}%* Free

🛡️ *SYSTEM HEALTH*
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  ⚙️  *Engine:* \`Node.js v20+\`
  💾  *Database:* \`SQLite 3\`
  🟢  *Status:* \`Operational\`
  🕒  *Updated:* \`${now}\`

━━━━━━━━━━━`;

    bot.editMessageText(statsMessage, {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Admin Panel", callback_data: "admin_panel" }]] }
    });
  }

  if (data === "admin_upload" && isAdmin(userId)) {
    userStates[userId] = { step: "waiting_for_file" };
    bot.editMessageText(`📤 *UPLOAD DATABASE*
━━━━━━━━━━━

Please upload the \`.txt\` file containing numbers (one per line).

📌 *Note:* Numbers will be automatically normalized with a \`+\` prefix if missing.

━━━━━━━━━━━`, {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "admin_panel" }]] }
    });
  }

  if (data === "admin_delete_list" && isAdmin(userId)) {
    const files = db.prepare("SELECT * FROM files").all() as any[];
    if (files.length === 0) {
      return bot.answerCallbackQuery(query.id, { text: "❌ No files found in the database." });
    }

    const buttons = files.map(f => [{ text: `🗑️ ${f.service} | ${f.country}`, callback_data: `delete_file_${f.id}` }]);
    bot.editMessageText(`📂 *MANAGE NUMBER FILES*
━━━━━━━━━━━

Select a file from the list below to permanently delete it and all its associated numbers from the database.

━━━━━━━━━━━`, {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [...buttons, [{ text: "🔙 Back to Admin Panel", callback_data: "admin_panel" }]] }
    });
  }

  if (data.startsWith("delete_file_") && isAdmin(userId)) {
    const fileId = data.split("_")[2];
    db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
    db.prepare("DELETE FROM numbers WHERE file_id = ?").run(fileId);
    bot.answerCallbackQuery(query.id, { text: "✅ File deleted successfully!" });
    // Refresh list
    const files = db.prepare("SELECT * FROM files").all() as any[];
    const buttons = files.map(f => [{ text: `🗑️ ${f.service} | ${f.country}`, callback_data: `delete_file_${f.id}` }]);
    bot.editMessageText(`📂 *MANAGE NUMBER FILES*
━━━━━━━━━━━

Select a file from the list below to permanently delete it and all its associated numbers from the database.

━━━━━━━━━━━`, {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [...buttons, [{ text: "🔙 Back to Admin Panel", callback_data: "admin_panel" }]] }
    });
  }

  if (data === "admin_broadcast" && isAdmin(userId)) {
    userStates[userId] = { step: "waiting_for_broadcast" };
    bot.editMessageText(`📣 *GLOBAL BROADCAST*
━━━━━━━━━━━

Send the message you want to broadcast to all users.
You can send:
📝 *Text*
🖼️ *Photos*
🎥 *Videos*
📄 *Documents*
🔄 *Forwarded Messages*

━━━━━━━━━━━`, {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel", callback_data: "admin_panel" }]] }
    });
  }

  if (data === "admin_panel" && isAdmin(userId)) {
    bot.editMessageText(`👑 *DXA ADMIN TERMINAL* 👑
━━━━━━━━━━━

👋 *Welcome, Authorized Administrator.*
Monitor system health and manage the number distribution database from this secure interface.

━━━━━━━━━━━`, {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: ADMIN_KEYBOARD.reply_markup
    });
  }

  if (data === "main_menu") {
    const keyboard = { ...MAIN_KEYBOARD };
    if (!isAdmin(userId)) {
      keyboard.reply_markup.keyboard = [[{ text: "📲 Get Number" }, { text: "👤 My Profile" }]];
    }
    bot.editMessageText("🔥 *DXA NUMBER BOT* 🔥\n━━━━━━━━━━━\nWelcome back! What would you like to do?", {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: { 
        inline_keyboard: [
          [{ text: "📲 Get Number", callback_data: "get_number_start" }],
          [{ text: "👥 Join Community", url: OTP_GROUP }]
        ] 
      }
    });
  }

  if (data === "get_number_start") {
    if (!(await checkForceJoin(userId))) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Please join channels first!", show_alert: true });
    }

    const services = db.prepare("SELECT DISTINCT service FROM files").all() as { service: string }[];
    if (services.length === 0) {
      return bot.editMessageText("📭 *No numbers available yet.*\n\nPlease check back later or contact the admin.", {
        chat_id: chatId,
        message_id: query.message?.message_id,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "main_menu" }]] }
      });
    }

    const buttons = services.map(s => [{ text: `🔹 ${s.service}`, callback_data: `get_service_${s.service}` }]);
    bot.editMessageText("💎 *SELECT SERVICE*\n━━━━━━━━━━━\nChoose the service you need a number for from the list below:", {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [...buttons, [{ text: "🔙 Return to Menu", callback_data: "main_menu" }]] }
    });
  }

  if (data === "check_join") {
    if (await checkForceJoin(userId)) {
      bot.answerCallbackQuery(query.id, { text: "✅ Access Granted!" });
      const keyboard = { ...MAIN_KEYBOARD };
      if (!isAdmin(userId)) {
        keyboard.reply_markup.keyboard = [[{ text: "📲 Get Number" }, { text: "👤 My Profile" }]];
      }
      
      const firstName = query.from.first_name || "User";
      const welcomeMessage = `🔥 *DXA NUMBER BOT* 🔥
━━━━━━━━━━━
👋 *Hello, ${firstName}!* Welcome To *DXA UNIVERSE*. Thanks For Using Our Bot.

📌 Tap 📱 *Get Number* to start!
━━━━━━━━━━━
😒 *POWERED BY DXA UNIVERSE*`;

      bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: "Markdown",
        ...keyboard
      });
    } else {
      bot.answerCallbackQuery(query.id, { text: "❌ You still haven't joined all channels!", show_alert: true });
    }
  }

  if (data.startsWith("get_service_")) {
    const service = data.split("_")[2];
    const countries = db.prepare("SELECT DISTINCT country FROM files WHERE service = ?").all(service) as { country: string }[];
    const buttons = countries.map(c => [{ text: `📍 ${c.country}`, callback_data: `get_country_${service}_${c.country}` }]);
    bot.editMessageText(`🌍 *SELECT COUNTRY*
━━━━━━━━━━━
Pick a country for *${service}* to proceed:`, {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [...buttons, [{ text: "🔙 Back", callback_data: "get_number_back" }]] }
    });
  }

  if (data === "get_number_back") {
    const services = db.prepare("SELECT DISTINCT service FROM files").all() as { service: string }[];
    const buttons = services.map(s => [{ text: `🔹 ${s.service}`, callback_data: `get_service_${s.service}` }]);
    bot.editMessageText("💎 *SELECT SERVICE*\n━━━━━━━━━━━\nChoose the service you need a number for from the list below:", {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [...buttons, [{ text: "🔙 Return to Menu", callback_data: "main_menu" }]] }
    });
  }

  if (data.startsWith("get_country_")) {
    const parts = data.split("_");
    const service = parts[2];
    const country = parts[3];

    // Get 3 random unused numbers
    const numbers = db.prepare(`
      SELECT n.id, n.number_string 
      FROM numbers n
      JOIN files f ON n.file_id = f.id
      WHERE f.service = ? AND f.country = ? AND n.is_used = 0
      ORDER BY RANDOM() LIMIT 3
    `).all(service, country) as { id: number, number_string: string }[];

    if (numbers.length === 0) {
      return bot.answerCallbackQuery(query.id, { text: "❌ No more numbers available for this service/country.", show_alert: true });
    }

    // Mark as used
    const updateStmt = db.prepare("UPDATE numbers SET is_used = 1 WHERE id = ?");
    for (const n of numbers) updateStmt.run(n.id);

    // Increment user numbers_taken
    db.prepare("UPDATE users SET numbers_taken = numbers_taken + ? WHERE id = ?").run(numbers.length, userId);

    const numberList = numbers.map((n, i) => {
      const emojis = ["1️⃣", "2️⃣", "3️⃣"];
      return `${emojis[i]} \`${n.number_string}\``;
    }).join("\n");
    
    const message = `✅ *NUMBERS ALLOCATED*
━━━━━━━━━━━━━━
 🔹 *Service:* \`${service}\`
 📍 *Country:* \`${country}\`
━━━━━━━━━━━━━━
${numberList}
━━━━━━━━━━━━━━
😒 *POWERED BY DXA UNIVERSE*`;

    bot.editMessageText(message, {
      chat_id: chatId,
      message_id: query.message?.message_id,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Change Number", callback_data: `get_country_${service}_${country}` }],
          [{ text: "👥 OTP Group", url: OTP_GROUP }],
          [{ text: "🏠 Main Menu", callback_data: "main_menu" }]
        ]
      }
    });
  }
});

// Express Server
async function startServer() {
  const app = express();
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      app.get("*", (req, res) => {
        res.send("Bot is running. Frontend not built.");
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
