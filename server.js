const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/price/:cardName', async (req, res) => {
  try {
    const cardName = req.params.cardName;
    const response = await axios.get(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
    const card = response.data;

    res.json({
      name: card.name,
      usd: card.prices.usd,
      usd_foil: card.prices.usd_foil,
      eur: card.prices.eur
    });
  } catch (error) {
    res.status(404).json({ error: 'Card not found or API error.' });
  }
});

app.get('/', (req, res) => {
  res.send('MTG Price API is running. Use /price/{cardname} to get prices.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
