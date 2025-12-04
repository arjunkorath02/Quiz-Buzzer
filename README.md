# Quiz Buzzer

A real-time quiz buzzer application built with React and Supabase.

## Features

- Real-time multiplayer quiz buzzer system
- Host controls with admin PIN authentication
- Multiple rounds with configurable timers
- Team support with player registration
- Pre-registration system with access codes
- Live leaderboard and scoring
- Player qualification system for elimination rounds

## Tech Stack

- React 18
- Supabase (PostgreSQL + Real-time)
- Vite
- TailwindCSS
- Lucide Icons

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase account and project set up

### Installation

1. Install dependencies:
```bash
npm install
```

2. Your Supabase credentials are already configured in the `.env` file

3. Start the development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## How to Use

### As a Host

1. Click "New Game" tab
2. Set a 4-digit admin PIN
3. Create the game
4. Share the room code with players
5. Manage teams and rounds
6. Start rounds and control the game

### As a Player

1. Click "Join" tab
2. Enter the room code
3. Either:
   - Join as a guest with your name
   - Login with a pre-registered access code
4. Buzz when the round starts
5. View your ranking and score

## Database Schema

The application uses two main tables:

- `rooms` - Stores game rooms and their state
- `players` - Stores player information and scores

Row Level Security (RLS) policies ensure secure access to data.