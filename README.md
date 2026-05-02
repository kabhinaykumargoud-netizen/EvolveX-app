# EvolveX Flask Cohort Dashboard

Updated version includes:

- Admin-controlled Student of the Week that updates the public home page.
- Wins Board simplified to select a student and optional description only.
- Editable weekly task manager in admin.
- Late completed tasks automatically receive 0 points.
- Badges for First Revenue Earned, Talked to 5 Customers, Student of the Week, Momentum Maker, and login consistency.
- Daily login streak tracking.
- Improved interactive leaderboard; clicking a student row opens their public profile.
- Public Home link in the menu bar.
- Removed the old quote/“Curiosity creates momentum” admin control.

## Run locally

```bash
pip install -r requirements.txt
python app.py
```

Default logins:

- Admin: `admin@evolvex.in` / `admin`
- Student: `lakshmi@evolvex.in` / `student`

The SQLite database is created automatically on first run.

## New updates in this version

- Password Manager in student profile: students can change password and receive confirmation email.
- Admin Add Student Profiles: paste one email or a list of emails; app generates temporary passwords and sends login setup email.
- SMTP email support via environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`. If not configured, emails are printed in the terminal for testing.
- Removed manual Saturday/Sunday session form from Log Activity.
- New Attendance tab for students with upcoming admin-created events and full attendance history.
- Admin can create custom attendance events with event type, date, mode, points, and description.
- Admin attendance report CSV added.
- Customer conversation now has customer count and awards 5 points per customer.
- Revenue and Customer Conversation submissions are limited to once per day per student.

## Notes for this patched version

- Student Attendance now shows all admin-created events, not only future-dated events. This fixes events created from Admin not appearing for students when the date is today or already passed.
- The attendance takeaway field is now treated as “Learning for the day” and is saved into My Journey after the student marks attendance.
- New student accounts are created with an empty project/profile and private visibility. No default “Idea” project is shown until the student fills their profile.
- Flash/alert messages are simplified to relevant messages only, such as login, logout, invalid email/password, invalid password, and status updated.
- Email sending needs SMTP environment variables. For Gmail, use an App Password, not the normal Gmail password:

```bash
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USERNAME=your_email@gmail.com
export SMTP_PASSWORD=your_google_app_password
export MAIL_FROM=your_email@gmail.com
```

Without SMTP values, the email content prints in the terminal as a preview and is not actually sent.
