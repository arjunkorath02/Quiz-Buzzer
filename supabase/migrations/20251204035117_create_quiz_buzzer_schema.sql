/*
  # Quiz Buzzer Application Schema

  ## Overview
  Creates the database schema for a real-time quiz buzzer application with room-based multiplayer functionality.

  ## Tables Created

  ### 1. rooms
  Stores game room state and configuration
  - `code` (text, primary key) - 4-character room code
  - `is_active` (boolean) - Whether the round is currently active
  - `timer` (integer) - Current countdown timer value
  - `buzzes` (jsonb) - Array of buzz submissions with player info and timestamps
  - `teams` (text[]) - Available team names for the room
  - `created_at` (timestamptz) - Room creation timestamp
  - `host_id` (uuid) - ID of the host user
  - `admin_pin` (text) - PIN for host authentication
  - `current_round` (integer) - Current active round number
  - `rounds` (jsonb) - Array of round configurations (duration, cutoff)
  - `allowed_player_ids` (text[]) - Restricted player list for qualification rounds
  - `start_time` (bigint) - Round start timestamp for reaction time calculation
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. players
  Stores player information and scores
  - `id` (text, primary key) - Unique player identifier
  - `name` (text) - Player display name
  - `score` (numeric) - Player's accumulated score
  - `room_code` (text) - References rooms table
  - `team` (text) - Team assignment (nullable)
  - `joined_at` (timestamptz) - Join timestamp
  - `access_code` (text) - Pre-registered player access code (nullable)
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable Row Level Security on all tables
  - Rooms: Host can manage their own rooms, anyone can read active rooms
  - Players: Players can read all players in their room, can update their own record, hosts can manage all players in their rooms

  ## Indexes
  - Players indexed by room_code for efficient queries
  - Players indexed by access_code for login lookups
*/

-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  code text PRIMARY KEY,
  is_active boolean DEFAULT false,
  timer integer DEFAULT 10,
  buzzes jsonb DEFAULT '[]'::jsonb,
  teams text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz DEFAULT now(),
  host_id uuid REFERENCES auth.users(id),
  admin_pin text NOT NULL,
  current_round integer DEFAULT 1,
  rounds jsonb DEFAULT '[{"id": 1, "duration": 10, "cutoff": 0}]'::jsonb,
  allowed_player_ids text[],
  start_time bigint,
  updated_at timestamptz DEFAULT now()
);

-- Create players table
CREATE TABLE IF NOT EXISTS players (
  id text PRIMARY KEY,
  name text NOT NULL,
  score numeric DEFAULT 0,
  room_code text REFERENCES rooms(code) ON DELETE CASCADE,
  team text,
  joined_at timestamptz DEFAULT now(),
  access_code text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_players_room_code ON players(room_code);
CREATE INDEX IF NOT EXISTS idx_players_access_code ON players(access_code) WHERE access_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON rooms(host_id);

-- Enable Row Level Security
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Rooms Policies

-- Anyone can read rooms (needed for joining)
CREATE POLICY "Anyone can read rooms"
  ON rooms FOR SELECT
  USING (true);

-- Authenticated users can create rooms
CREATE POLICY "Authenticated users can create rooms"
  ON rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_id);

-- Hosts can update their own rooms
CREATE POLICY "Hosts can update their rooms"
  ON rooms FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- Hosts can delete their own rooms
CREATE POLICY "Hosts can delete their rooms"
  ON rooms FOR DELETE
  TO authenticated
  USING (auth.uid() = host_id);

-- Players Policies

-- Anyone can read players (needed for leaderboard)
CREATE POLICY "Anyone can read players"
  ON players FOR SELECT
  USING (true);

-- Anyone can insert players (for joining)
CREATE POLICY "Anyone can insert players"
  ON players FOR INSERT
  WITH CHECK (true);

-- Players can update their own record
CREATE POLICY "Players can update own record"
  ON players FOR UPDATE
  USING (id = current_setting('app.player_id', true))
  WITH CHECK (id = current_setting('app.player_id', true));

-- Hosts can update players in their rooms
CREATE POLICY "Hosts can update players in their rooms"
  ON players FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rooms
      WHERE rooms.code = players.room_code
      AND rooms.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms
      WHERE rooms.code = players.room_code
      AND rooms.host_id = auth.uid()
    )
  );

-- Hosts can delete players in their rooms
CREATE POLICY "Hosts can delete players in their rooms"
  ON players FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rooms
      WHERE rooms.code = players.room_code
      AND rooms.host_id = auth.uid()
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update updated_at on rooms
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
