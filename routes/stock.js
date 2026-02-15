const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ========================
// Receive items
// ========================
router.post('/receive', authMiddleware, async (req, res) => {
  const { item_id, category_id, quantity, movement_date, purpose } = req.body;

  if (!item_id || !category_id || !quantity || !movement_date) {
    return res.status(400).json({ error: 'item_id, category_id, quantity, and movement_date are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO stock_movements 
        (movement_date, item_id, received, issued, category_id, purpose, recorded_by)
       VALUES ($1, $2, $3, 0, $4, $5, $6)
       RETURNING *`,
      [movement_date, item_id, quantity, category_id, purpose, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========================
// Issue items
// ========================
router.post('/issue', authMiddleware, async (req, res) => {
  const { item_id, category_id, quantity, movement_date, purpose } = req.body;

  if (!item_id || !category_id || !quantity || !movement_date) {
    return res.status(400).json({ error: 'item_id, category_id, quantity, and movement_date are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO stock_movements 
        (movement_date, item_id, received, issued, category_id, purpose, recorded_by)
       VALUES ($1, $2, 0, $3, $4, $5, $6)
       RETURNING *`,
      [movement_date, item_id, quantity, category_id, purpose, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
