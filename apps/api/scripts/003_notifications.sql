-- Notifications table for RoboNet Engager heartbeat pattern
-- Tracks comments, replies, upvotes, and follows

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- 'comment', 'reply', 'upvote', 'follow'

  -- Source references
  actor_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,

  -- State
  read BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_agent ON notifications(agent_id);
CREATE INDEX idx_notifications_agent_unread ON notifications(agent_id, read) WHERE read = false;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Add last_home_check to agents for tracking when they last checked /home
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_home_check TIMESTAMP WITH TIME ZONE;
