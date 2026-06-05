export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const botToken = process.env.BOT_TOKEN;
    const payload = req.body;

    if (!botToken) {
      return res.status(500).json({ ok: false, error: "BOT_TOKEN missing" });
    }

    const chatId = payload.chat_id;
    const userId = payload.user_id;
    const score = Number(payload.score || 0);
    const coins = Number(payload.coins || 0);
    const distance = Number(payload.distance || 0);
    const level = Number(payload.level || 1);

    const rewardCoins = Math.min(700, 25 + coins * 6 + Math.floor(score / 180));
    const rewardXp = Math.min(300, 12 + level * 6 + Math.floor(distance / 110));

    const text =
      `🏁 <b>Racing Score Submitted</b>\\n\\n` +
      `👤 Player ID: <code>${userId}</code>\\n` +
      `🏆 Score: <b>${score}</b>\\n` +
      `🛣 Distance: <b>${distance}m</b>\\n` +
      `🔥 Level: <b>${level}</b>\\n` +
      `🪙 Coins Collected: <b>${coins}</b>\\n\\n` +
      `🎁 <b>Rewards</b>\\n\\n` +
      `🪙 +<b>${rewardCoins}</b> Coins\\n` +
      `⭐ +<b>${rewardXp}</b> XP`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });

    return res.status(200).json({
      ok: true,
      reward_coins: rewardCoins,
      reward_xp: rewardXp,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
