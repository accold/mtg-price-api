const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', async (req, res) => {
  const cardName = req.query.card;

  if (!cardName) {
    return res.status(400).send('Please provide a card name using ?card=');
  }

  try {
    const response = await axios.get(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
    const card = response.data;

    const message = `${card.name} [${card.set.toUpperCase()}]\nUSD: $${card.prices.usd || 'N/A'}\nFoil: $${card.prices.usd_foil || 'N/A'}`;
    res.send(message);
  } catch (err) {
    res.status(404).send(`Card not found: "${cardName}"`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
