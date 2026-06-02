import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(".codex_pydeps").resolve()))

import psycopg


EMPLOYEES_FILE = pathlib.Path(".tmp/employees.json")


def read_database_url():
    env_path = pathlib.Path(".env")
    if not env_path.exists():
        raise RuntimeError(".env not found")

    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")

    raise RuntimeError("DATABASE_URL missing")


def main():
    employees = json.loads(EMPLOYEES_FILE.read_text(encoding="utf-8"))
    database_url = read_database_url()

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            team_ids = {}
            cur.execute("SELECT id, name FROM teams")
            for team_id, name in cur.fetchall():
                team_ids[name] = team_id

            inserted = 0
            updated = 0

            for employee in employees:
                team_id = team_ids.get(employee["team_name"])
                if not team_id:
                    raise RuntimeError(f"team not found: {employee['team_name']}")

                cur.execute(
                    """
                    INSERT INTO employees (
                      worker_id, name, title, team_id, is_foreign, is_active
                    )
                    VALUES (%s, %s, %s, %s, %s, TRUE)
                    ON CONFLICT (worker_id) DO UPDATE SET
                      name = EXCLUDED.name,
                      title = EXCLUDED.title,
                      team_id = EXCLUDED.team_id,
                      is_foreign = EXCLUDED.is_foreign,
                      is_active = TRUE,
                      updated_at = now()
                    RETURNING (xmax = 0) AS inserted
                    """,
                    (
                        employee["worker_id"],
                        employee["name"],
                        employee["title"] or None,
                        team_id,
                        bool(employee["is_foreign"]),
                    ),
                )
                was_inserted = cur.fetchone()[0]
                if was_inserted:
                    inserted += 1
                else:
                    updated += 1

            conn.commit()

            cur.execute("SELECT COUNT(*) FROM employees WHERE is_active = TRUE")
            total = cur.fetchone()[0]

            cur.execute(
                """
                SELECT t.name, COUNT(*)
                FROM employees e
                JOIN teams t ON t.id = e.team_id
                WHERE e.is_active = TRUE
                GROUP BY t.name
                ORDER BY t.name
                """
            )
            by_team = cur.fetchall()

    print(f"IMPORTED inserted={inserted} updated={updated} active_total={total}")
    for team_name, count in by_team:
        print(f"TEAM {team_name} {count}")


if __name__ == "__main__":
    main()
