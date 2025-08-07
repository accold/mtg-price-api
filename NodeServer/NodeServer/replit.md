# Overview

This is a Magic: The Gathering card price lookup application built with React and Express. The application allows users to search for MTG cards and retrieve their current market prices from the Scryfall API through a simple REST API endpoint. It features a clean, modern interface built with shadcn/ui components and provides real-time price information for both regular and foil versions of cards.

**Status**: ✅ Complete and fully functional
**API Endpoint**: GET /api/card?card={card_name}
**Last Updated**: August 7, 2025

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React 18** with TypeScript for the client-side application
- **Vite** as the build tool and development server
- **wouter** for lightweight client-side routing
- **shadcn/ui** component library built on Radix UI primitives
- **TailwindCSS** for styling with CSS custom properties for theming
- **TanStack Query** for server state management and API caching

## Backend Architecture
- **Express.js** server with TypeScript running on port 5000
- **RESTful API** design with single endpoint `/api/card` for card price lookups
- **Scryfall API integration** for fetching live card data and prices
- **Zod** for request validation and type safety
- **Stateless design** - no database required, all data fetched from Scryfall API
- **Plain text responses** with formatted card information

## Development Tools
- **Drizzle ORM** configured for PostgreSQL (though currently using memory storage)
- **ESBuild** for production builds
- **Hot Module Replacement** via Vite in development
- **TypeScript** strict mode enabled across the entire codebase

## Project Structure
- **Monorepo layout** with separate client and server directories
- **Shared schema** directory for common types and validation
- **Component-based architecture** with UI components in dedicated directories
- **Path aliases** configured for clean imports (@/, @shared/, etc.)

## Design Patterns
- **Separation of concerns** with distinct client, server, and shared layers
- **Interface-based storage** allowing easy swapping of storage implementations
- **Type-safe API** contracts using Zod schemas
- **Error handling** with proper HTTP status codes and user-friendly messages
- **Responsive design** with mobile-first approach using TailwindCSS

# External Dependencies

## APIs
- **Scryfall API** - Primary data source for Magic: The Gathering card information and pricing

## UI Framework
- **Radix UI** - Headless component primitives for accessibility
- **shadcn/ui** - Pre-built component library with consistent design system
- **Lucide React** - Icon library for UI elements

## Database
- **Drizzle ORM** - Type-safe database toolkit configured for PostgreSQL
- **Neon Database** - Serverless PostgreSQL (via @neondatabase/serverless driver)

## Development Services
- **Replit** - Development environment with integrated tooling
- **Vite plugins** - Runtime error overlay and cartographer for Replit integration

## Styling
- **TailwindCSS** - Utility-first CSS framework
- **PostCSS** - CSS processing with autoprefixer

## State Management
- **TanStack Query** - Server state management with caching and synchronization
- **React Hook Form** - Form state management with validation