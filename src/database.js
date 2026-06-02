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
}
