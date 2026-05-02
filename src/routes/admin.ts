import { Router, Request, Response } from 'express';
import { query, execute } from '../db';
import { currentWeek, leaderboard, nowIso, todayIso, grantBadge, makePassword, sendEmail, STAGES, EVENT_TYPES } from '../helpers';
import { loginRequired } from '../middleware';
import { hashPassword } from '../db';
import { stringify } from 'csv-stringify/sync';

const router = Router();

// GET /admin
router.get('/admin', loginRequired('admin'), (req: Request, res: Response) => {
  const students = query("SELECT * FROM users WHERE role='student' ORDER BY points DESC");
  const tasks = query('SELECT * FROM tasks ORDER BY week, due_date, id');
  const wins = query('SELECT wins.*, users.name FROM wins LEFT JOIN users ON users.id=wins.user_id ORDER BY wins.id DESC');
  const attendanceEvents = query('SELECT * FROM attendance_events ORDER BY event_date DESC, id DESC');
  res.render('admin_dashboard.html', { students, tasks, wins, attendance_events: attendanceEvents });
});

// POST /admin/add-students
router.post('/admin/add-students', loginRequired('admin'), (req: Request, res: Response) => {
  const raw: string = req.body.emails || '';
  const emails = raw.replace(/\n/g, ',').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
  for (const email of emails) {
    if (!email.includes('@') || query('SELECT id FROM users WHERE email=?', [email], true)) continue;
    const temp = makePassword();
    const name = email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    execute('INSERT INTO users(name,email,password_hash,role,project_name,one_liner,problem,project_link,linkedin,category,stage,is_public,must_change_password,quote) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [name, email, hashPassword(temp), 'student', '', '', '', '', '', 'Other', '', 0, 1, '']);
    sendEmail(email, 'Your EvolveX login setup',
      `Hi ${name},\n\nYour EvolveX student profile has been created.\n\nLogin email: ${email}\nTemporary password: ${temp}\n\nPlease login, change your password from My Profile, and complete your profile.\n\n- EvolveX Team`);
  }
  (req as any).flash('success', 'Status updated.');
  res.redirect('/admin');
});

// POST /admin/attendance-event
router.post('/admin/attendance-event', loginRequired('admin'), (req: Request, res: Response) => {
  execute('INSERT INTO attendance_events(title,event_date,event_type,mode,points,description,created_at) VALUES(?,?,?,?,?,?,?)',
    [req.body.title, req.body.event_date, req.body.event_type, req.body.mode || 'Offline', parseInt(req.body.points || 15), req.body.description || '', nowIso()]);
  (req as any).flash('success', 'Status updated.');
  res.redirect('/admin');
});

// POST /admin/task
router.post('/admin/task', loginRequired('admin'), (req: Request, res: Response) => {
  const taskId = req.body.task_id;
  const payload = [req.body.week, req.body.title, req.body.description || '', req.body.points, req.body.due_date];
  if (taskId) {
    execute('UPDATE tasks SET week=?, title=?, description=?, points=?, due_date=? WHERE id=?', [...payload, taskId]);
  } else {
    execute('INSERT INTO tasks(week,title,description,points,due_date) VALUES(?,?,?,?,?)', payload);
  }
  (req as any).flash('success', 'Status updated.');
  res.redirect('/admin');
});

// POST /admin/task/:id/delete
router.post('/admin/task/:task_id/delete', loginRequired('admin'), (req: Request, res: Response) => {
  const taskId = parseInt(req.params.task_id, 10);
  execute('DELETE FROM submissions WHERE task_id=?', [taskId]);
  execute('DELETE FROM tasks WHERE id=?', [taskId]);
  (req as any).flash('success', 'Status updated.');
  res.redirect('/admin');
});

// POST /admin/student/:id
router.post('/admin/student/:user_id', loginRequired('admin'), (req: Request, res: Response) => {
  const userId = parseInt(req.params.user_id, 10);
  const featured = req.body.featured ? 1 : 0;
  if (featured) {
    execute("UPDATE users SET featured=0 WHERE role='student'");
    grantBadge(userId, 'Student of the Week', req.body.sow_description || 'Selected as Student of the Week by the EvolveX team.', req.body.sow_date || todayIso());
  }
  execute('UPDATE users SET stage=?, featured=?, is_public=? WHERE id=?',
    [req.body.stage, featured, req.body.is_public ? 1 : 0, userId]);
  execute('INSERT INTO journey(user_id,event_type,title,details,created_at) VALUES(?,?,?,?,?)',
    [userId, 'stage', `Stage updated to ${req.body.stage}`, 'Updated by admin', nowIso()]);
  (req as any).flash('success', 'Status updated.');
  res.redirect('/admin');
});

// POST /admin/win
router.post('/admin/win', loginRequired('admin'), (req: Request, res: Response) => {
  if (req.body.featured) execute('UPDATE wins SET featured=0');
  const userId = req.body.user_id || null;
  const student: any = userId ? query('SELECT name FROM users WHERE id=?', [userId], true) : null;
  const title = student ? `${student.name} — Student of the Week` : 'EvolveX Win';
  execute('INSERT INTO wins(user_id,title,description,featured,created_at) VALUES(?,?,?,?,?)',
    [userId, title, req.body.description || '', req.body.featured ? 1 : 0, nowIso()]);
  if (userId) {
    execute("UPDATE users SET featured=0 WHERE role='student'");
    execute('UPDATE users SET featured=1 WHERE id=?', [userId]);
    grantBadge(parseInt(userId), 'Student of the Week', req.body.description || 'Selected as Student of the Week by the EvolveX team.', todayIso());
  }
  (req as any).flash('success', 'Status updated.');
  res.redirect('/admin');
});

// GET /admin/export.csv
router.get('/admin/export.csv', loginRequired('admin'), (req: Request, res: Response) => {
  const rows: any[] = query("SELECT name,project_name,points,tasks_done,customer_convos,sessions_attended,revenue,streak,last_active FROM users WHERE role='student' ORDER BY points DESC");
  const csv = stringify([
    ['Name', 'Project', 'Points', 'Tasks Done', 'Customer Conversation Days', 'Sessions Attended', 'Revenue', 'Login Streak', 'Last Active'],
    ...rows.map(r => [r.name, r.project_name, r.points, r.tasks_done, r.customer_convos, r.sessions_attended, r.revenue, r.streak, r.last_active])
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=evolvex_leaderboard.csv');
  res.send(csv);
});

// GET /admin/attendance-report.csv
router.get('/admin/attendance-report.csv', loginRequired('admin'), (req: Request, res: Response) => {
  const rows: any[] = query(`SELECT e.event_date, e.title, e.event_type, e.mode event_mode, u.name, u.email, COALESCE(a.status,'Not Marked') status, a.mode, a.reason, a.takeaway, COALESCE(a.points_awarded,0) points FROM attendance_events e CROSS JOIN users u LEFT JOIN attendance a ON a.event_id=e.id AND a.user_id=u.id WHERE u.role='student' ORDER BY e.event_date DESC, e.id DESC, u.name`);
  const csv = stringify([
    ['Event Date', 'Event', 'Type', 'Default Mode', 'Student', 'Email', 'Status', 'Student Mode', 'Reason', 'Takeaway', 'Points'],
    ...rows.map(r => [r.event_date, r.title, r.event_type, r.event_mode, r.name, r.email, r.status, r.mode, r.reason, r.takeaway, r.points])
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=evolvex_attendance_report.csv');
  res.send(csv);
});

export default router;
