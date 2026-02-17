import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'social_agent.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def dict_from_row(row):
    if row is None:
        return None
    return dict(row)


def dicts_from_rows(rows):
    return [dict(r) for r in rows]
