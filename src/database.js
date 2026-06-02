import pg from "pg";

const { Pool } = pg;

export class LeaveDatabaseClient {
  constructor({ databaseUrl }) {
    this.pool = new Pool({
      connectionString: databaseUrl,
    });
  }

  async close() {
    await this.pool.end();
  }

  async insertLeaveRequest({ request, source, employee, proofLink = "", rawMessage = "" }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `
        WITH employee_row AS (
          SELECT e.id AS employee_id, e.team_id, t.name AS team_name, t.shift_label
          FROM employees e
          JOIN teams t ON t.id = e.team_id
          WHERE e.worker_id = $1
        ),
        leave_type_row AS (
          SELECT id
          FROM leave_types
          WHERE name = $2
        )
        INSERT INTO leave_requests (
          employee_id,
          requester_line_user_id,
          leave_type_id,
          leave_type_name,
          team_id,
          team_name,
          shift_label,
          schedule_date,
          start_date,
          end_date,
          start_time,
          end_time,
          hours,
          reason,
          status,
          source,
          raw_message
        )
        SELECT
          employee_row.employee_id,
          $3,
          leave_type_row.id,
          $2,
          employee_row.team_id,
          employee_row.team_name,
          employee_row.shift_label,
          $4::date,
          $5::date,
          $6::date,
          $7::time,
          $8::time,
          $9::numeric,
          $10,
          'submitted',
          'line',
          $11
        FROM employee_row, leave_type_row
        RETURNING id
        `,
        [
          employee.workerId,
          request.leaveType,
          source.userId || "",
          request.scheduleStartDate || request.startDate,
          request.startDate,
          request.endDate,
          request.startTime,
          request.endTime,
          request.hours,
          request.reason || "",
          rawMessage,
        ],
      );

      if (result.rowCount !== 1) {
        throw new Error(`Database insert skipped: employee or leave type not found (${employee.workerId}, ${request.leaveType})`);
      }

      const leaveRequestId = result.rows[0].id;

      if (proofLink) {
        await client.query(
          `
          INSERT INTO leave_attachments (
            leave_request_id,
            kind,
            file_name,
            drive_url,
            class_folder_name
          )
          VALUES ($1, 'medical_proof', $2, $3, $4)
          `,
          [
            leaveRequestId,
            `診斷證明_${employee.workerId}_${request.startDate}`,
            proofLink,
            employee.team || "",
          ],
        );
      }

      await client.query("COMMIT");
      return leaveRequestId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLeaveSummary(filters = {}) {
    const { where, values } = buildLeaveWhere(filters);
    const [totals, byTeam, byType, today] = await Promise.all([
      this.pool.query(
        `
        SELECT
          COUNT(*)::int AS count,
          COALESCE(SUM(hours), 0)::float AS hours
        FROM leave_request_view
        ${where}
        `,
        values,
      ),
      this.pool.query(
        `
        SELECT team_name, COUNT(*)::int AS count, COALESCE(SUM(hours), 0)::float AS hours
        FROM leave_request_view
        ${where}
        GROUP BY team_name
        ORDER BY team_name
        `,
        values,
      ),
      this.pool.query(
        `
        SELECT leave_type_name, COUNT(*)::int AS count, COALESCE(SUM(hours), 0)::float AS hours
        FROM leave_request_view
        ${where}
        GROUP BY leave_type_name
        ORDER BY count DESC, leave_type_name
        `,
        values,
      ),
      this.pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM leave_request_view
        WHERE schedule_date = CURRENT_DATE
          AND status = 'submitted'
        `,
      ),
    ]);

    return {
      totalCount: totals.rows[0]?.count || 0,
      totalHours: totals.rows[0]?.hours || 0,
      todayCount: today.rows[0]?.count || 0,
      byTeam: byTeam.rows,
      byType: byType.rows,
    };
  }

  async listLeaveRequests(filters = {}) {
    const { where, values } = buildLeaveWhere(filters);
    const limit = Math.min(Number(filters.limit || 200), 500);
    const result = await this.pool.query(
      `
      SELECT
        id,
        created_at,
        worker_id,
        employee_name,
        team_name,
        shift_label,
        leave_type_name,
        schedule_date,
        start_date,
        end_date,
        start_time,
        end_time,
        hours,
        reason,
        status,
        medical_proof_url
      FROM leave_request_view
      ${where}
      ORDER BY schedule_date DESC, created_at DESC
      LIMIT ${limit}
      `,
      values,
    );
    return result.rows;
  }
}

function buildLeaveWhere(filters = {}) {
  const clauses = ["status = 'submitted'"];
  const values = [];

  function add(value, clause) {
    values.push(value);
    clauses.push(clause.replace("?", `$${values.length}`));
  }

  if (filters.team) add(filters.team, "team_name = ?");
  if (filters.leaveType) add(filters.leaveType, "leave_type_name = ?");
  if (filters.workerId) add(String(filters.workerId).toUpperCase(), "worker_id = ?");
  if (filters.from) add(filters.from, "schedule_date >= ?::date");
  if (filters.to) add(filters.to, "schedule_date <= ?::date");

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}
