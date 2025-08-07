const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/price/:cardName', async (req, res) => {
  try {
    // Decode URI component to handle spaces and special chars
    const rawCardName = decodeURIComponent(req.params.cardName);

    // Scryfall fuzzy search supports spaces; use rawCardName directly
    const response = await axios.get(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(rawCardName)}`);

    const card = response.data;
    res.json({
      name: card.name,
      price: card.prices.usd || "N/A",
      price_foil: card.prices.usd_foil || "N/A"
    });
  } catch (error) {
    res.status(404).json({ error: "Card not found" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
