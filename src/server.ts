import express from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import nunjucks from 'nunjucks';
import path from 'path';
import { initDb } from './db';
import { currentWeek, STAGES, CATEGORIES, EVENT_TYPES } from './helpers';
import publicRoutes from './routes/public';
import studentRoutes from './routes/student';
import adminRoutes from './routes/admin';

const app = express();
const PORT = 5000;

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use('/static', express.static(path.join(__dirname, '..', 'static')));

// Session
app.use(session({
  secret: process.env.SECRET_KEY || 'evolvex-dev-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// Flash messages
app.use(flash());

// Nunjucks templating
const env = nunjucks.configure(path.join(__dirname, '..', 'templates'), {
  autoescape: true,
  express: app,
  watch: true,
});

// Custom filters to match Jinja2 behaviour
env.addFilter('format', (fmt: string, val: number) => {
  if (fmt === '%.0f') return Math.round(val || 0).toString();
  return String(val);
});
env.addFilter('min', (arr: number[]) => Math.min(...arr));
env.addFilter('length', (val: any) => (Array.isArray(val) ? val.length : 0));

// Global context injected into every render (mirrors Flask context_processor)
app.use((req, res, next) => {
  const sess = req.session as any;
  // Inject template globals via res.locals
  res.locals.current_week = currentWeek();
  res.locals.stages = STAGES;
  res.locals.categories = CATEGORIES;
  res.locals.event_types = EVENT_TYPES;
  res.locals.today = new Date().toISOString().slice(0, 10);
  res.locals.currentUser = sess.user_id ? { id: sess.user_id, role: sess.role, name: sess.name } : null;
  res.locals.session = { user_id: sess.user_id, role: sess.role, name: sess.name };
  // Flash messages in Flask style: [{cat, msg}]
  const rawFlash = (req as any).flash() as Record<string, string[]>;
  const messages: { cat: string; msg: string }[] = [];
  for (const [cat, msgs] of Object.entries(rawFlash)) {
    for (const msg of msgs) messages.push({ cat, msg });
  }
  res.locals.messages = messages;
  next();
});

// Routes
app.use('/', publicRoutes);
app.use('/', studentRoutes);
app.use('/', adminRoutes);

// Init DB and start server
initDb();
app.listen(PORT, () => {
  console.log(` * Serving EvolveX (Node.js/TypeScript) on http://127.0.0.1:${PORT}`);
  console.log(' * Debug mode: on');
});

export default app;
