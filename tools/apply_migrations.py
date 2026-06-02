import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(".codex_pydeps").resolve()))

import psycopg


def read_database_url():
    env_path = pathlib.Path(".env")
    if not env_path.exists():
        raise RuntimeError(".env not found")

    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")

    raise RuntimeError("DATABASE_URL missing")


def main():
    database_url = read_database_url()
    migration_files = [
        pathlib.Path("db/migrations/001_init.sql"),
        pathlib.Path("db/migrations/002_updated_at_triggers.sql"),
    ]

    with psycopg.connect(database_url) as conn:
      for migration_file in migration_files:
          sql = migration_file.read_text(encoding="utf-8")
          with conn.cursor() as cur:
              cur.execute(sql)
          conn.commit()
          print(f"APPLIED {migration_file.as_posix()}")

      with conn.cursor() as cur:
          cur.execute(
              """
              SELECT table_name
              FROM information_schema.tables
              WHERE table_schema = 'public'
              ORDER BY table_name
              """
          )
          print("TABLES " + ",".join(row[0] for row in cur.fetchall()))


if __name__ == "__main__":
    main()
