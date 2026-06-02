CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teams_set_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER employees_set_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER leave_requests_set_updated_at
BEFORE UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER admins_set_updated_at
BEFORE UPDATE ON admins
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
