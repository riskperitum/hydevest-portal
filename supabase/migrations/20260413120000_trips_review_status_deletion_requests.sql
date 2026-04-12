ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'review_requested', 'reviewed')),
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS modified_since_last_review BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS trip_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE OR REPLACE FUNCTION mark_trip_modified() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_reviewed_at IS NOT DISTINCT FROM OLD.last_reviewed_at
     AND NEW.review_status IS NOT DISTINCT FROM OLD.review_status
     AND NEW.review_requested_at IS NOT DISTINCT FROM OLD.review_requested_at
  THEN NEW.modified_since_last_review := true; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trip_modified_trigger ON trips;
CREATE TRIGGER trip_modified_trigger BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION mark_trip_modified();

CREATE OR REPLACE FUNCTION clear_modified_on_review() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.review_status = 'reviewed' AND OLD.review_status != 'reviewed' THEN
    NEW.modified_since_last_review := false;
    NEW.last_reviewed_at := now();
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trip_reviewed_trigger ON trips;
CREATE TRIGGER trip_reviewed_trigger BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION clear_modified_on_review();
