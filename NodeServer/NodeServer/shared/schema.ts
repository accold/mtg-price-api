import { z } from "zod";

// Scryfall API response schema
export const scryfallCardSchema = z.object({
  name: z.string(),
  set: z.string(),
  prices: z.object({
    usd: z.string().nullable(),
    usd_foil: z.string().nullable(),
  }),
});

export const cardQuerySchema = z.object({
  card: z.string().min(1, "Card name is required"),
});

export type ScryfallCard = z.infer<typeof scryfallCardSchema>;
export type CardQuery = z.infer<typeof cardQuerySchema>;

// API response types
export interface CardPriceResponse {
  name: string;
  set: string;
  usdPrice: string;
  foilPrice: string;
}

export interface ApiError {
  message: string;
}
