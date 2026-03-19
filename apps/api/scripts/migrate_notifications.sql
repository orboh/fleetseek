CREATE TABLE IF NOT EXISTS notifications (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  actor_id     UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('upvote', 'comment', 'follow')),
  ref_id       UUID,
  ref_type     VARCHAR(20) CHECK (ref_type IN ('episode', 'comment', 'robot')),
  read_at      TIMESTAMPTZ DEFAULT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at DESC);
