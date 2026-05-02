import { Router, Request, Response } from 'express';
import { query } from '../db';
import { checkPassword, hashPassword } from '../db';
import { currentWeek, leaderboard, recordDailyLogin, getUser, STAGES, CATEGORIES } from '../helpers';
import { loginRequired } from '../middleware';

const router = Router();

// GET /student-dashboard
router.get('/student-dashboard', loginRequired('student'), (req: Request, res: Response) => {
  const userId = (req.session as any).user_id;
  const user = getUser(userId);
  const tasks = query(`SELECT t.*, COALESCE(s.status,'Not Started') status, s.work_note, s.proof_link, s.submitted_at, s.points_awarded FROM tasks t LEFT JOIN submissions s ON s.task_id=t.id AND s.user_id=? WHERE t.week=? ORDER BY t.due_date, t.id`, [userId, currentWeek()]);
  const journey = query('SELECT * FROM journey WHERE user_id=? ORDER BY created_at DESC LIMIT 10', [userId]);
  const badges = query('SELECT * FROM badges WHERE user_id=?', [userId]);
  const rankRows = leaderboard();
  const rank = rankRows.findIndex((r: any) => r.id === userId) + 1 || null;
  const attendanceEvents = query(`SELECT e.*, a.status, a.mode marked_mode, a.reason, a.takeaway, a.marked_at FROM attendance_events e LEFT JOIN attendance a ON a.event_id=e.id AND a.user_id=? ORDER BY e.event_date DESC, e.id DESC`, [userId]);
  const attendanceHistory = query(`SELECT e.title, e.event_date, e.event_type, e.mode event_mode, a.status, a.mode, a.reason, a.takeaway, a.points_awarded, a.marked_at FROM attendance a JOIN attendance_events e ON e.id=a.event_id WHERE a.user_id=? ORDER BY e.event_date DESC, a.id DESC`, [userId]);
  const todayRevenue = query('SELECT id FROM activities WHERE user_id=? AND type=? AND date(created_at)=date(?)', [userId, 'revenue', new Date().toISOString()], true);
  const todayConversation = query('SELECT id FROM activities WHERE user_id=? AND type=? AND date(created_at)=date(?)', [userId, 'conversation', new Date().toISOString()], true);
  res.render('student_dashboard.html', { user, tasks, journey, badges, rank, attendance_events: attendanceEvents, attendance_history: attendanceHistory, today_revenue: todayRevenue, today_conversation: todayConversation });
});

// POST /update-profile
router.post('/update-profile', loginRequired('student'), (req: Request, res: Response) => {
  const { execute } = require('../db');
  const { nowIso } = require('../helpers');
  const userId = (req.session as any).user_id;
  const fields = ['name', 'photo', 'project_name', 'one_liner', 'problem', 'project_link', 'linkedin', 'category', 'stage'];
  const values = fields.map(f => (req.body[f] || '').trim());
  const isPublic = req.body.is_public ? 1 : 0;
  const setClause = fields.map(f => `${f}=?`).join(', ');
  execute(`UPDATE users SET ${setClause}, is_public=?, must_change_password=0, last_active=? WHERE id=?`, [...values, isPublic, nowIso(), userId]);
  execute('INSERT INTO journey(user_id,event_type,title,details,created_at) VALUES(?,?,?,?,?)', [userId, 'profile', 'Profile updated', 'Project/profile details changed', nowIso()]);
  (req as any).flash('success', 'Status updated.');
  res.redirect('/student-dashboard');
});

// POST /change-password
router.post('/change-password', loginRequired(), (req: Request, res: Response) => {
  const { execute } = require('../db');
  const { nowIso, sendEmail } = require('../helpers');
  const userId = (req.session as any).user_id;
  const user = getUser(userId);
  const { current_password, new_password, confirm_password } = req.body;
  if (!checkPassword(current_password, user.password_hash)) {
    (req as any).flash('danger', 'Invalid password.');
  } else if ((new_password || '').length < 6) {
    (req as any).flash('warning', 'Invalid password.');
  } else if (new_password !== confirm_password) {
    (req as any).flash('warning', 'Invalid password.');
  } else {
    execute('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?', [hashPassword(new_password), userId]);
    sendEmail(user.email, 'Your EvolveX password was changed', `Hi ${user.name},\n\nYour EvolveX account password was changed successfully. If this was not you, contact admin.\n\n- EvolveX Team`);
    (req as any).flash('success', 'Password updated.');
  }
  res.redirect('/dashboard');
});

// POST /task/:id/status
router.post('/task/:task_id/status', loginRequired('student'), (req: Request, res: Response) => {
  const { execute } = require('../db');
  const { nowIso, todayIso, recalcUser } = require('../helpers');
  const userId = (req.session as any).user_id;
  const taskId = parseInt(req.params.task_id, 10);
  const status = req.body.status || 'Not Started';
  const note = (req.body.work_note || '').trim();
  const link = (req.body.proof_link || '').trim();
  const task: any = query('SELECT * FROM tasks WHERE id=?', [taskId], true);
  const existing: any = query('SELECT * FROM submissions WHERE user_id=? AND task_id=?', [userId, taskId], true);
  const points = (status === 'Done' && todayIso() <= task.due_date) ? parseInt(task.points) : 0;
  const submittedAt = status === 'Done' ? nowIso() : '';
  if (existing) {
    execute('UPDATE submissions SET status=?, work_note=?, proof_link=?, submitted_at=?, points_awarded=? WHERE id=?',
      [status, note, link, submittedAt || existing.submitted_at, points, existing.id]);
  } else {
    execute('INSERT INTO submissions(user_id,task_id,status,work_note,proof_link,submitted_at,points_awarded) VALUES(?,?,?,?,?,?,?)',
      [userId, taskId, status, note, link, submittedAt, points]);
  }
  execute('INSERT INTO journey(user_id,event_type,title,details,created_at) VALUES(?,?,?,?,?)',
    [userId, 'task', `${task.title} → ${status}`, note || 'Task status updated', nowIso()]);
  recalcUser(userId);
  (req as any).flash('success', 'Status updated.');
  res.redirect('/student-dashboard');
});

// POST /activity
router.post('/activity', loginRequired('student'), (req: Request, res: Response) => {
  const { execute } = require('../db');
  const { nowIso, todayIso, recalcUser } = require('../helpers');
  const userId = (req.session as any).user_id;
  const typ = req.body.type;
  if (!['revenue', 'conversation'].includes(typ)) {
    (req as any).flash('warning', 'Invalid status.');
    return res.redirect('/student-dashboard');
  }
  const already = query('SELECT id FROM activities WHERE user_id=? AND type=? AND date(created_at)=date(?)', [userId, typ, new Date().toISOString()], true);
  if (already) {
    (req as any).flash('warning', 'Already submitted today.');
    return res.redirect('/student-dashboard');
  }
  const title = (req.body.title || typ.charAt(0).toUpperCase() + typ.slice(1)).trim();
  const desc = (req.body.description || '').trim();
  const amount = parseFloat(req.body.amount || 0);
  const customerCount = typ === 'conversation' ? parseInt(req.body.customer_count || 0) : 0;
  execute('INSERT INTO activities(user_id,type,title,description,amount,customer_count,created_at) VALUES(?,?,?,?,?,?,?)',
    [userId, typ, title, desc, amount, customerCount, nowIso()]);
  const details = (typ === 'conversation' ? `Spoke to ${customerCount} customer(s). ` : '') + desc;
  execute('INSERT INTO journey(user_id,event_type,title,details,created_at) VALUES(?,?,?,?,?)',
    [userId, typ, title, details, nowIso()]);
  recalcUser(userId);
  (req as any).flash('success', 'Status updated.');
  res.redirect('/student-dashboard');
});

// POST /attendance/:event_id
router.post('/attendance/:event_id', loginRequired('student'), (req: Request, res: Response) => {
  const { execute } = require('../db');
  const { nowIso, recalcUser } = require('../helpers');
  const userId = (req.session as any).user_id;
  const eventId = parseInt(req.params.event_id, 10);
  const event: any = query('SELECT * FROM attendance_events WHERE id=?', [eventId], true);
  if (!event) {
    (req as any).flash('danger', 'Invalid status.');
    return res.redirect('/student-dashboard');
  }
  const status = req.body.status || 'Attended';
  const mode = req.body.mode || event.mode;
  const reason = (req.body.reason || '').trim();
  const takeaway = (req.body.takeaway || '').trim();
  const points = status === 'Attended' ? parseInt(event.points || 0) : 0;
  const existing: any = query('SELECT id FROM attendance WHERE event_id=? AND user_id=?', [eventId, userId], true);
  if (existing) {
    execute('UPDATE attendance SET status=?, mode=?, reason=?, takeaway=?, marked_at=?, points_awarded=? WHERE id=?',
      [status, mode, reason, takeaway, nowIso(), points, existing.id]);
  } else {
    execute('INSERT INTO attendance(event_id,user_id,status,mode,reason,takeaway,marked_at,points_awarded) VALUES(?,?,?,?,?,?,?,?)',
      [eventId, userId, status, mode, reason, takeaway, nowIso(), points]);
  }
  execute('INSERT INTO journey(user_id,event_type,title,details,created_at) VALUES(?,?,?,?,?)',
    [userId, 'attendance', `${event.title} → ${status}`, status === 'Attended' ? takeaway : `Not attended: ${reason}`, nowIso()]);
  recalcUser(userId);
  (req as any).flash('success', 'Status updated.');
  res.redirect('/student-dashboard');
});

export default router;
