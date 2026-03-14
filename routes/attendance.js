const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

function isSunday(dateStr) {
  // Interpret as UTC to avoid local timezone shifting the day
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.getUTCDay() === 0;
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date=YYYY-MM-DD is required' });

    const result = await pool.query(
      `SELECT a.id, a.worker_id, w.full_name, w.position, a.work_date, a.status
       FROM attendance a
       JOIN workers w ON w.id = a.worker_id
       WHERE a.work_date = $1::date
       ORDER BY w.full_name`,
      [date]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { worker_id, work_date, status } = req.body;

    if (!worker_id || !work_date) {
      return res.status(400).json({ error: 'worker_id and work_date are required' });
    }
    if (isSunday(work_date)) {
      return res.status(400).json({ error: 'Sunday is off. Attendance cannot be recorded on Sunday.' });
    }
    if (status !== undefined && !['present', 'absent'].includes(String(status))) {
      return res.status(400).json({ error: "status must be 'present' or 'absent'" });
    }

    const result = await pool.query(
      `INSERT INTO attendance (worker_id, work_date, status)
       VALUES ($1, $2::date, $3)
       ON CONFLICT (worker_id, work_date) DO UPDATE
       SET status = EXCLUDED.status
       RETURNING *`,
      [worker_id, work_date, status || 'present']
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Save attendance error:', err);
    res.status(500).json({ error: 'Failed to save attendance' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status !== undefined && !['present', 'absent'].includes(String(status))) {
      return res.status(400).json({ error: "status must be 'present' or 'absent'" });
    }

    const result = await pool.query(
      `UPDATE attendance
       SET status = COALESCE($1, status)
       WHERE id = $2
       RETURNING *`,
      [status ?? null, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Attendance record not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update attendance error:', err);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM attendance WHERE id=$1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Attendance record not found' });
    res.json({ message: 'Attendance removed' });
  } catch (err) {
    console.error('Delete attendance error:', err);
    res.status(500).json({ error: 'Failed to delete attendance' });
  }
});

module.exports = router;
