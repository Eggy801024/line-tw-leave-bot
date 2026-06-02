CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE shift_kind AS ENUM ('day', 'night');
CREATE TYPE leave_status AS ENUM ('submitted', 'cancelled', 'imported');
CREATE TYPE attachment_kind AS ENUM ('medical_proof', 'other');
CREATE TYPE admin_role AS ENUM ('viewer', 'manager', 'owner');

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  shift_kind shift_kind NOT NULL,
  shift_label TEXT NOT NULL,
  shift_code TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  work_hours NUMERIC(4, 1) NOT NULL DEFAULT 10.0,
  break_hours NUMERIC(4, 1) NOT NULL DEFAULT 2.0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  title TEXT,
  team_id UUID NOT NULL REFERENCES teams(id),
  line_user_id TEXT,
  is_foreign BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX employees_team_id_idx ON employees(team_id);
CREATE INDEX employees_line_user_id_idx ON employees(line_user_id);

CREATE TABLE employee_line_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, line_user_id)
);

CREATE INDEX employee_line_users_line_user_id_idx ON employee_line_users(line_user_id);

CREATE TABLE leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  requires_medical_proof BOOLEAN NOT NULL DEFAULT FALSE,
  is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  requester_line_user_id TEXT NOT NULL,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  leave_type_name TEXT NOT NULL,
  team_id UUID NOT NULL REFERENCES teams(id),
  team_name TEXT NOT NULL,
  shift_label TEXT NOT NULL,
  schedule_date DATE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  hours NUMERIC(5, 2) NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status leave_status NOT NULL DEFAULT 'submitted',
  source TEXT NOT NULL DEFAULT 'line',
  raw_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX leave_requests_employee_id_idx ON leave_requests(employee_id);
CREATE INDEX leave_requests_team_id_idx ON leave_requests(team_id);
CREATE INDEX leave_requests_schedule_date_idx ON leave_requests(schedule_date);
CREATE INDEX leave_requests_start_date_idx ON leave_requests(start_date);
CREATE INDEX leave_requests_requester_line_user_id_idx ON leave_requests(requester_line_user_id);
CREATE INDEX leave_requests_status_idx ON leave_requests(status);

CREATE TABLE leave_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  kind attachment_kind NOT NULL DEFAULT 'medical_proof',
  file_name TEXT NOT NULL,
  mime_type TEXT,
  drive_file_id TEXT,
  drive_url TEXT NOT NULL,
  class_folder_name TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX leave_attachments_leave_request_id_idx ON leave_attachments(leave_request_id);

CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role admin_role NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_line_user_id TEXT,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);
CREATE INDEX audit_logs_actor_line_user_id_idx ON audit_logs(actor_line_user_id);

INSERT INTO teams (name, shift_kind, shift_label, shift_code, start_time, end_time)
VALUES
  ('婷芬班', 'day', '日A班', 'A1', '07:30', '19:30'),
  ('俊志班', 'night', '夜A班', 'A1', '19:30', '07:30'),
  ('美香班', 'day', '日B班', 'B1', '07:30', '19:30'),
  ('翊展班', 'night', '夜B班', 'B1', '19:30', '07:30')
ON CONFLICT (name) DO NOTHING;

INSERT INTO leave_types (name, requires_medical_proof, is_excluded)
VALUES
  ('病假', TRUE, FALSE),
  ('事假', FALSE, FALSE),
  ('公假', FALSE, FALSE),
  ('生理假', FALSE, FALSE),
  ('家庭照顧假', FALSE, FALSE),
  ('產檢假', FALSE, FALSE),
  ('陪產假', FALSE, FALSE),
  ('特休', FALSE, TRUE),
  ('喪假', FALSE, TRUE),
  ('婚假', FALSE, TRUE)
ON CONFLICT (name) DO NOTHING;
