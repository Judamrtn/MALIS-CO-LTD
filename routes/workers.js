const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const ALLOWED_POSITIONS = new Set(['Mason', 'Helper', 'Coating']);

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, phone, position, daily_rate, status, created_at
       FROM workers
       ORDER BY position, full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List workers error:', err);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { full_name, phone, position, daily_rate } = req.body;

    if (!full_name || !position || daily_rate == null) {
      return res.status(400).json({ error: 'full_name, position, and daily_rate are required' });
    }
    if (!ALLOWED_POSITIONS.has(String(position))) {
      return res.status(400).json({ error: 'position must be one of: Mason, Helper, Coating' });
    }

    const rate = Number(daily_rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(400).json({ error: 'daily_rate must be a positive number' });
    }

    const result = await pool.query(
      `INSERT INTO workers (full_name, phone, position, daily_rate)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, phone, position, daily_rate, status, created_at`,
      [full_name, phone || null, position, rate]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Create worker error:', err);
    res.status(500).json({ error: 'Failed to create worker' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, position, daily_rate, status } = req.body;

    if (position !== undefined && !ALLOWED_POSITIONS.has(String(position))) {
      return res.status(400).json({ error: 'position must be one of: Mason, Helper, Coating' });
    }
    if (daily_rate !== undefined) {
      const rate = Number(daily_rate);
      if (!Number.isFinite(rate) || rate <= 0) {
        return res.status(400).json({ error: 'daily_rate must be a positive number' });
      }
    }
    if (status !== undefined && !['active', 'inactive'].includes(String(status))) {
      return res.status(400).json({ error: "status must be 'active' or 'inactive'" });
    }

    const result = await pool.query(
      `UPDATE workers
       SET full_name  = COALESCE($1, full_name),
           phone      = COALESCE($2, phone),
           position   = COALESCE($3, position),
           daily_rate = COALESCE($4, daily_rate),
           status     = COALESCE($5, status)
       WHERE id = $6
       RETURNING id, full_name, phone, position, daily_rate, status, created_at`,
      [
        full_name ?? null,
        phone ?? null,
        position ?? null,
        daily_rate ?? null,
        status ?? null,
        id
      ]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update worker error:', err);
    res.status(500).json({ error: 'Failed to update worker' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE workers
       SET status = 'inactive'
       WHERE id = $1
       RETURNING id, full_name, status`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    res.json({ message: 'Worker deactivated', worker: result.rows[0] });
  } catch (err) {
    console.error('Deactivate worker error:', err);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});

module.exports = router;
