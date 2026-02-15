const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ============================
// Daily report (all items)
// Optional filters: date, category name
// ============================
router.get('/daily', authMiddleware, async (req, res) => {
  try {
    const { date, category } = req.query;
    let query = 'SELECT * FROM daily_stock_report WHERE 1=1';
    const params = [];

    if (date) {
      params.push(date);
      query += ` AND report_date = $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`; // matches view column "category"
    }

    query += ' ORDER BY report_date, description';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Daily report error:', err);
    res.status(500).json({ error: 'Failed to fetch daily report' });
  }
});

// ============================
// Category/Team report
// Optional filters: date, category name
// ============================
router.get('/category', authMiddleware, async (req, res) => {
  try {
    const { date, category } = req.query;
    let query = 'SELECT * FROM category_stock_report WHERE 1=1';
    const params = [];

    if (date) {
      params.push(date);
      query += ` AND report_date = $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`; // match view column
    }

    query += ' ORDER BY report_date, category, description';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Category report error:', err);
    res.status(500).json({ error: 'Failed to fetch category report' });
  }
});

// ============================
// Period summary report (weekly/monthly)
// Optional: filter by category name
// ============================
router.get('/period', authMiddleware, async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM period_stock_summary WHERE 1=1';
    const params = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    query += ' ORDER BY category, description';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Period summary error:', err);
    res.status(500).json({ error: 'Failed to fetch period summary' });
  }
});

module.exports = router;
