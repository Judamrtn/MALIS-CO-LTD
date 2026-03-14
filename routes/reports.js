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
// Returns ALL items in the category with correct opening/closing
// for the selected date (or today if not provided).
// ============================
router.get('/category', authMiddleware, async (req, res) => {
  try {
    let { date, category } = req.query;

    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }

    // Default to today if no date is supplied
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    }

    const query = `
      WITH item_base AS (
        SELECT
          i.id        AS item_id,
          i.name      AS description,
          i.unit      AS unit,
          c.name      AS category,
          i.initial_qty
        FROM items i
        JOIN categories c ON i.category_id = c.id
        WHERE c.name = $2
      ),
      movement_before AS (
        -- all movements BEFORE the selected date -> used to compute opening
        SELECT
          item_id,
          COALESCE(SUM(received - issued), 0) AS delta_before
        FROM stock_movements
        WHERE movement_date < $1::date
        GROUP BY item_id
      ),
      movement_on AS (
        -- movements ON the selected date -> today's received/issued and purposes
        SELECT
          item_id,
          COALESCE(SUM(received), 0) AS received,
          COALESCE(SUM(issued), 0)   AS issued,
          STRING_AGG(DISTINCT COALESCE(purpose,''), ', ') AS purpose
        FROM stock_movements
        WHERE movement_date = $1::date
        GROUP BY item_id
      )
      SELECT
        $1::date                                AS report_date,
        b.category                              AS category,
        b.description                           AS description,
        b.unit                                  AS unit,
        (b.initial_qty
          + COALESCE(mb.delta_before, 0))       AS opening_stock,
        COALESCE(mo.received, 0)                AS received,
        COALESCE(mo.issued, 0)                  AS issued,
        (b.initial_qty
          + COALESCE(mb.delta_before, 0)
          + COALESCE(mo.received, 0)
          - COALESCE(mo.issued, 0))             AS closing_stock,
        mo.purpose                              AS purpose
      FROM item_base b
      LEFT JOIN movement_before mb ON mb.item_id = b.item_id
      LEFT JOIN movement_on     mo ON mo.item_id = b.item_id
      ORDER BY b.description;
    `;

    const params = [date, category];
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
