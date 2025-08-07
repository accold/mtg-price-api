import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { cardQuerySchema, type ScryfallCard } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Main endpoint to fetch card prices from Scryfall
  app.get("/api/card", async (req, res) => {
    try {
      // Validate query parameter
      const result = cardQuerySchema.safeParse(req.query);
      
      if (!result.success) {
        res.status(400).type('text/plain').send("Error: Missing 'card' query parameter");
        return;
      }

      const { card } = result.data;
      
      // URL encode the card name for the API request
      const encodedCardName = encodeURIComponent(card.trim());
      
      // Make request to Scryfall API
      const scryfallUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodedCardName}`;
      
      const response = await fetch(scryfallUrl);
      
      if (!response.ok) {
        if (response.status === 404) {
          res.status(404).type('text/plain').send("Error: Card not found");
          return;
        }
        throw new Error(`Scryfall API error: ${response.status}`);
      }

      const cardData: ScryfallCard = await response.json();
      
      // Format the response as plain text
      const usdPrice = cardData.prices.usd || "N/A";
      const foilPrice = cardData.prices.usd_foil || "N/A";
      
      const formattedResponse = `Card: ${cardData.name}
Set: ${cardData.set.toUpperCase()}
USD Price: ${usdPrice === "N/A" ? "N/A" : `$${usdPrice}`}
Foil Price: ${foilPrice === "N/A" ? "N/A" : `$${foilPrice}`}`;

      res.type('text/plain').send(formattedResponse);
      
    } catch (error) {
      console.error('API Error:', error);
      res.status(500).type('text/plain').send("Error: API request failed");
    }
  });

  // Nightbot-friendly endpoint for Twitch chat
  app.get("/api/nightbot", async (req, res) => {
    try {
      // Validate query parameter
      const result = cardQuerySchema.safeParse(req.query);
      
      if (!result.success) {
        res.type('text/plain').send("Usage: !card <card name>");
        return;
      }

      const { card } = result.data;
      
      // URL encode the card name for the API request
      const encodedCardName = encodeURIComponent(card.trim());
      
      // Make request to Scryfall API
      const scryfallUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodedCardName}`;
      
      const response = await fetch(scryfallUrl);
      
      if (!response.ok) {
        if (response.status === 404) {
          res.type('text/plain').send(`Card "${card}" not found`);
          return;
        }
        throw new Error(`Scryfall API error: ${response.status}`);
      }

      const cardData: ScryfallCard = await response.json();
      
      // Format response for Twitch chat (shorter format)
      const usdPrice = cardData.prices.usd || "N/A";
      const foilPrice = cardData.prices.usd_foil || "N/A";
      
      const chatResponse = `${cardData.name} (${cardData.set.toUpperCase()}) - $${usdPrice === "N/A" ? "N/A" : usdPrice} | Foil: $${foilPrice === "N/A" ? "N/A" : foilPrice}`;

      res.type('text/plain').send(chatResponse);
      
    } catch (error) {
      console.error('Nightbot API Error:', error);
      res.type('text/plain').send("Error fetching card data");
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
