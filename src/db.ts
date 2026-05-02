import { Database } from 'node-sqlite3-wasm';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BASE_DIR = path.resolve(__dirname, '..');
export const DB_PATH = path.join(BASE_DIR, 'evolvex.db');

let _db: Database | null = null;

export function db(): Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL;');
  }
  return _db;
}

export function execute(sql: string, params: any[] = []): any {
  return db().run(sql, params);
}

export function query<T = any>(sql: string, params: any[] = [], one = false): any {
  if (one) return db().get(sql, params) ?? null;
  return db().all(sql, params);
}

/** Verify either bcrypt OR Werkzeug pbkdf2 hash (for migrated DB) */
export function checkPassword(password: string, hash: string): boolean {
  if (hash.startsWith('$2')) {
    return bcrypt.compareSync(password, hash);
  }
  // Werkzeug pbkdf2:sha256:iterations$salt$hexhash
  const parts = hash.split('$');
  if (parts.length !== 3) return false;
  const [methodPart, salt, storedHex] = parts;
  const mp = methodPart.split(':');
  if (mp.length < 3 || mp[0] !== 'pbkdf2') return false;
  try {
    const derived = crypto
      .pbkdf2Sync(Buffer.from(password), Buffer.from(salt), parseInt(mp[2], 10), Math.floor(storedHex.length / 2), mp[1])
      .toString('hex');
    return derived === storedHex;
  } catch { return false; }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function initDb(): void {
  const con = db();
  con.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student', photo TEXT DEFAULT 'https://api.dicebear.com/8.x/shapes/svg?seed=evolvex',
      project_name TEXT DEFAULT '', one_liner TEXT DEFAULT '', problem TEXT DEFAULT '', project_link TEXT DEFAULT '', linkedin TEXT DEFAULT '',
      category TEXT DEFAULT 'Other', stage TEXT DEFAULT 'Idea', is_public INTEGER DEFAULT 1, featured INTEGER DEFAULT 0,
      quote TEXT DEFAULT 'Building one step at a time.', points INTEGER DEFAULT 0, revenue REAL DEFAULT 0, tasks_done INTEGER DEFAULT 0,
      customer_convos INTEGER DEFAULT 0, sessions_attended INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, last_active TEXT DEFAULT '',
      last_login_date TEXT DEFAULT '', login_streak INTEGER DEFAULT 0, must_change_password INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY AUTOINCREMENT, week INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, points INTEGER NOT NULL, due_date TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, task_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Not Started', work_note TEXT DEFAULT '', proof_link TEXT DEFAULT '', submitted_at TEXT DEFAULT '', points_awarded INTEGER DEFAULT 0, UNIQUE(user_id, task_id));
    CREATE TABLE IF NOT EXISTS activities(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, description TEXT DEFAULT '', amount REAL DEFAULT 0, customer_count INTEGER DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS journey(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, event_type TEXT NOT NULL, title TEXT NOT NULL, details TEXT DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS badges(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', earned_on TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wins(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT NOT NULL, description TEXT DEFAULT '', featured INTEGER DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attendance_events(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, event_date TEXT NOT NULL, event_type TEXT NOT NULL, mode TEXT DEFAULT 'Offline', points INTEGER DEFAULT 15, description TEXT DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, user_id INTEGER NOT NULL, status TEXT NOT NULL, mode TEXT DEFAULT '', reason TEXT DEFAULT '', takeaway TEXT DEFAULT '', marked_at TEXT NOT NULL, points_awarded INTEGER DEFAULT 0, UNIQUE(event_id, user_id));
  `);

  // Column migrations
  const colChecks: [string, string, string][] = [
    ['users', 'last_login_date', "TEXT DEFAULT ''"],
    ['users', 'login_streak', 'INTEGER DEFAULT 0'],
    ['users', 'must_change_password', 'INTEGER DEFAULT 0'],
    ['badges', 'description', "TEXT DEFAULT ''"],
    ['activities', 'customer_count', 'INTEGER DEFAULT 0'],
  ];
  for (const [table, col, def] of colChecks) {
    const cols = con.all(`PRAGMA table_info(${table})`) as any[];
    if (!cols.some((c) => c.name === col)) {
      con.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  }

  // Seed if empty
  const count = (con.get('SELECT COUNT(*) as c FROM users') as any).c;
  if (count === 0) {
    const COHORT_START = new Date('2026-03-22');
    const nowIso = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

    const seedUsers = [
      { name: 'Admin', email: 'admin@evolvex.in', pwd: 'admin', role: 'admin', proj: 'EvolveX HQ', pub: 0, feat: 0 },
      { name: 'Lakshmi', email: 'lakshmi@evolvex.in', pwd: 'student', role: 'student', proj: 'EvolveX Project', pub: 1, feat: 1 },
      { name: 'Ananya', email: 'ananya@evolvex.in', pwd: 'student', role: 'student', proj: 'EvolveX Project', pub: 1, feat: 0 },
      { name: 'Rahul', email: 'rahul@evolvex.in', pwd: 'student', role: 'student', proj: 'EvolveX Project', pub: 1, feat: 0 },
    ];
    for (const u of seedUsers) {
      con.run(`INSERT INTO users(name,email,password_hash,role,project_name,one_liner,problem,project_link,linkedin,category,stage,is_public,featured,quote) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [u.name, u.email, hashPassword(u.pwd), u.role, u.proj, 'Building for Bharat', '', 'https://linkedin.com', 'https://linkedin.com', 'Other', 'Idea', u.pub, u.feat, 'Building one step at a time.']);
    }

    for (let i = 1; i <= 12; i++) {
      const due = new Date(COHORT_START);
      due.setDate(due.getDate() + i * 7 - 1);
      const dueStr = due.toISOString().slice(0, 10);
      con.run(`INSERT INTO tasks(week,title,description,points,due_date) VALUES(?,?,?,?,?)`, [i, `Week ${i}: Founder Progress Update`, 'Share what you built, validated, learnt, and what is blocked.', 25, dueStr]);
      con.run(`INSERT INTO tasks(week,title,description,points,due_date) VALUES(?,?,?,?,?)`, [i, `Week ${i}: Customer Conversation`, 'Speak to one target user/customer and record the insight.', 20, dueStr]);
    }

    const lakshmi = con.get("SELECT id FROM users WHERE email='lakshmi@evolvex.in'") as any;
    if (lakshmi) {
      con.run(`INSERT INTO wins(user_id,title,description,featured,created_at) VALUES(?,?,?,?,?)`,
        [lakshmi.id, 'Lakshmi — Student of the Week', 'Moved from idea to prototype.', 1, nowIso()]);
    }
  }
}
