import { MongoClient } from "mongodb";

let client;
let db;

const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 900, 1400, 2100, 3000, 4200, 5700,
  7500, 9800, 12500, 15800, 19800, 24600, 30400, 37300,
  45500, 55000, 66000, 79000, 94000, 111000, 130000
];

function getLevel(xp) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return Math.min(level, LEVEL_THRESHOLDS.length);
}

function getRankTitle(level) {
  const ranks = {
    1: "🌱 Seedling",
    3: "🔥 Sparked",
    5: "⚔️ Fighter",
    8: "💥 Destroyer",
    10: "🌀 Vortex",
    13: "🌩️ Thunderclap",
    16: "👁️ Phantom",
    19: "🧿 Oracle",
    22: "🏆 Legend",
    25: "👑 Yumeko"
  };

  let title = "🌱 Seedling";

  for (const lvl of Object.keys(ranks).map(Number)) {
    if (level >= lvl) title = ranks[lvl];
  }

  return title;
}

async function getDb() {
  if (db) return db;

  client = new MongoClient(process.env.MONGO_URI);
  await client.connect();

  db = client.db(process.env.MONGO_DB || "YumekoGamesBot");
  return db;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({ ok: false, error: "BOT_TOKEN missing" });
    }

    if (!process.env.MONGO_URI) {
      return res.status(500).json({ ok: false, error: "MONGO_URI missing" });
    }

    const payload = req.body;

    const chatId = payload.chat_id;
    const userId = Number(payload.user_id);
    const score = Number(payload.score || 0);
    const coins = Number(payload.coins || 0);
    const distance = Number(payload.distance || 0);
    const level = Number(payload.level || 1);

    const rewardCoins = Math.min(700, 25 + coins * 6 + Math.floor(score / 180));
    const rewardXp = Math.min(300, 12 + level * 6 + Math.floor(distance / 110));

    const database = await getDb();
    const users = database.collection("users");

    const user = await users.findOne({ user_id: userId });
    const oldXp = user?.xp || 0;
    const newXp = oldXp + rewardXp;
    const newLevel = getLevel(newXp);
    const newRank = getRankTitle(newLevel);

    await users.updateOne(
      { user_id: userId },
      {
        $inc: {
          coins: rewardCoins,
          xp: rewardXp,
          games_played: 1
        },
        $set: {
          level: newLevel,
          rank_title: newRank,
          updated_at: new Date()
        },
        $setOnInsert: {
          user_id: userId,
          name: "Racing Player",
          games_won: 0,
          games_lost: 0,
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    const text =
      `<blockquote>🏁 <b>Racing Score Submitted</b></blockquote>\n\n` +
      `👤 Player ID: <code>${userId}</code>\n` +
      `🏆 Score: <b>${score}</b>\n` +
      `🛣 Distance: <b>${distance}m</b>\n` +
      `🔥 Level: <b>${level}</b>\n` +
      `🪙 Coins Collected: <b>${coins}</b>\n\n` +
      `<blockquote>🎁 <b>Rewards Added</b></blockquote>\n\n` +
      `🪙 +<b>${rewardCoins}</b> Coins\n` +
      `⭐ +<b>${rewardXp}</b> XP\n` +
      `🏅 Rank: <b>${newRank}</b>`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML"
      })
    });

    return res.status(200).json({
      ok: true,
      reward_coins: rewardCoins,
      reward_xp: rewardXp
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
