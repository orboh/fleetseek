-- Migration: Phase 1 – Voyager data field
-- Adds voyager_data JSONB column to episodes table

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS voyager_data JSONB;
