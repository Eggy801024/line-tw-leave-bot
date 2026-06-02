CREATE OR REPLACE VIEW leave_request_view AS
SELECT
  lr.id,
  lr.created_at,
  lr.updated_at,
  e.worker_id,
  e.name AS employee_name,
  e.title,
  lr.team_name,
  lr.shift_label,
  lr.leave_type_name,
  lr.schedule_date,
  lr.start_date,
  lr.end_date,
  lr.start_time,
  lr.end_time,
  lr.hours,
  lr.reason,
  lr.status,
  lr.requester_line_user_id,
  (
    SELECT la.drive_url
    FROM leave_attachments la
    WHERE la.leave_request_id = lr.id
    ORDER BY la.uploaded_at DESC
    LIMIT 1
  ) AS medical_proof_url
FROM leave_requests lr
JOIN employees e ON e.id = lr.employee_id;
