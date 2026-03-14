const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const ALLOWED_POSITIONS = new Set(['Mason', 'Helper', 'Coating']);

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { week_start, position } = req.query;
    if (!week_start || !position) {
      return res.status(400).json({ error: 'week_start and position are required' });
    }
    if (!ALLOWED_POSITIONS.has(String(position))) {
      return res.status(400).json({ error: 'position must be one of: Mason, Helper, Coating' });
    }

    const result = await pool.query(
      `SELECT p.id, p.worker_id, w.full_name, w.position, p.week_start, p.week_end,
              p.days_worked, p.daily_rate, p.total_pay
       FROM payroll p
       JOIN workers w ON w.id = p.worker_id
       WHERE p.week_start = $1::date
         AND w.position = $2
       ORDER BY w.full_name`,
      [week_start, position]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get payroll error:', err);
    res.status(500).json({ error: 'Failed to fetch payroll' });
  }
});

router.post('/generate', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { week_start, week_end, position } = req.body;

    if (!week_start || !week_end || !position) {
      return res.status(400).json({ error: 'week_start, week_end, and position are required' });
    }
    if (!ALLOWED_POSITIONS.has(String(position))) {
      return res.status(400).json({ error: 'position must be one of: Mason, Helper, Coating' });
    }

    await client.query('BEGIN');

    // Idempotent: clear existing payroll rows for this week+position then rebuild
    await client.query(
      `DELETE FROM payroll p
       USING workers w
       WHERE p.worker_id = w.id
         AND p.week_start = $1::date
         AND p.week_end   = $2::date
         AND w.position   = $3`,
      [week_start, week_end, position]
    );

    const insertRes = await client.query(
      `INSERT INTO payroll (worker_id, week_start, week_end, days_worked, daily_rate, total_pay)
       SELECT
         w.id,
         $1::date,
         $2::date,
         COUNT(a.id)::int AS days_worked,
         w.daily_rate,
         (COUNT(a.id) * w.daily_rate) AS total_pay
       FROM workers w
       LEFT JOIN attendance a
         ON w.id = a.worker_id
        AND a.status = 'present'
        AND a.work_date BETWEEN $1::date AND $2::date
       WHERE w.position = $3
       GROUP BY w.id, w.daily_rate
       RETURNING *`,
      [week_start, week_end, position]
    );

    await client.query('COMMIT');
    res.json({ message: 'Payroll generated', rows: insertRes.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Generate payroll error:', err);
    res.status(500).json({ error: 'Failed to generate payroll' });
  } finally {
    client.release();
  }
});

module.exports = router;
