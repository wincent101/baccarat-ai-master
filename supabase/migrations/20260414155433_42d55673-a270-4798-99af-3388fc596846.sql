CREATE TABLE public.training_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  history_length INTEGER NOT NULL,
  streak INTEGER NOT NULL DEFAULT 0,
  p_ratio REAL NOT NULL DEFAULT 0.5,
  b_ratio REAL NOT NULL DEFAULT 0.5,
  t_ratio REAL NOT NULL DEFAULT 0,
  last_10 TEXT NOT NULL DEFAULT '',
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  signal_count INTEGER NOT NULL DEFAULT 0,
  player_score REAL NOT NULL DEFAULT 0,
  banker_score REAL NOT NULL DEFAULT 0,
  margin REAL NOT NULL DEFAULT 0,
  predicted TEXT NOT NULL CHECK (predicted IN ('Player', 'Banker')),
  confidence REAL NOT NULL DEFAULT 50,
  actual TEXT NOT NULL CHECK (actual IN ('Player', 'Banker', 'Tie')),
  correct BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.training_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert training logs"
  ON public.training_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read training logs"
  ON public.training_logs FOR SELECT
  USING (true);

CREATE INDEX idx_training_logs_session ON public.training_logs (session_id, round_number);
CREATE INDEX idx_training_logs_created ON public.training_logs (created_at DESC);