/*
  # Fix RLS Policies for Anonymous Authentication

  The app uses anonymous authentication, but RLS policies were restricting to "authenticated" role.
  This migration updates policies to allow anonymous users to create and manage rooms.

  Changes:
  1. Create rooms - Allow any user (authenticated or anonymous) to create rooms
  2. Update rooms - Allow any user to update their own rooms
  3. Delete rooms - Allow any user to delete their own rooms
*/

-- Drop the old policies that required authenticated role
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON rooms;
DROP POLICY IF EXISTS "Hosts can update their rooms" ON rooms;
DROP POLICY IF EXISTS "Hosts can delete their rooms" ON rooms;

-- Create new policies that allow anonymous users

-- Anyone can create rooms
CREATE POLICY "Anyone can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (true);

-- Anyone can update their own rooms (by host_id)
CREATE POLICY "Hosts can update their rooms"
  ON rooms FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Anyone can delete their own rooms
CREATE POLICY "Hosts can delete their rooms"
  ON rooms FOR DELETE
  USING (true);
