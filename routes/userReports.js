const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const ALLOWED_PAYROLL_POSITIONS = new Set(['Mason', 'Helper', 'Coating']);
const REPORT_VIEW_ROLES = new Set(['admin', 'engineer', 'storekeeper']);
const REPORT_GENERATE_ROLES = new Set(['admin', 'engineer']);

function canViewReports(req, res, next) {
  const role = req.user?.role;
  if (!REPORT_VIEW_ROLES.has(String(role))) {
    return res.status(403).json({ error: 'Not allowed to view reports' });
  }
  next();
}

function canGenerateReports(req, res, next) {
  const role = req.user?.role;
  if (!REPORT_GENERATE_ROLES.has(String(role))) {
    return res.status(403).json({ error: 'Not allowed to generate reports' });
  }
  next();
}

router.get('/', authMiddleware, canViewReports, (req, res) => {
  res.json({
    reports: [
      {
        type: 'stock_daily',
        method: 'GET',
        path: '/view',
        query: { date: 'YYYY-MM-DD (optional)', category: 'string (optional)' }
      },
      {
        type: 'stock_category',
        method: 'GET',
        path: '/view',
        query: { date: 'YYYY-MM-DD (optional, defaults today)', category: 'string (required)' }
      },
      {
        type: 'stock_period',
        method: 'GET',
        path: '/view',
        query: { category: 'string (optional)' }
      },
      {
        type: 'attendance_daily',
        method: 'GET',
        path: '/view',
        query: { date: 'YYYY-MM-DD (required)' }
      },
      {
        type: 'payroll_view',
        method: 'GET',
        path: '/view',
        query: { week_start: 'YYYY-MM-DD (required)', position: 'Mason|Helper|Coating (required)' }
      },
      {
        type: 'payroll_generate',
        method: 'POST',
        path: '/generate',
        body: {
          week_start: 'YYYY-MM-DD (required)',
          week_end: 'YYYY-MM-DD (required)',
          position: 'Mason|Helper|Coating (required)'
        }
      }
    ]
  });
});

router.get('/view', authMiddleware, canViewReports, async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) return res.status(400).json({ error: 'type is required' });

    if (type === 'stock_daily') {
      const { date, category } = req.query;
      let query = 'SELECT * FROM daily_stock_report WHERE 1=1';
      const params = [];

      if (date) {
        params.push(date);
        query += ` AND report_date = $${params.length}`;
      }
      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }

      query += ' ORDER BY report_date, description';
      const result = await pool.query(query, params);
      return res.json(result.rows);
    }

    if (type === 'stock_category') {
      let { date, category } = req.query;
      if (!category) return res.status(400).json({ error: 'category is required' });
      if (!date) date = new Date().toISOString().split('T')[0];

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
          SELECT
            item_id,
            COALESCE(SUM(received - issued), 0) AS delta_before
          FROM stock_movements
          WHERE movement_date < $1::date
          GROUP BY item_id
        ),
        movement_on AS (
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

      const result = await pool.query(query, [date, category]);
      return res.json(result.rows);
    }

    if (type === 'stock_period') {
      const { category } = req.query;
      let query = 'SELECT * FROM period_stock_summary WHERE 1=1';
      const params = [];
      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }
      query += ' ORDER BY category, description';
      const result = await pool.query(query, params);
      return res.json(result.rows);
    }

    if (type === 'attendance_daily') {
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
      return res.json(result.rows);
    }

    if (type === 'payroll_view') {
      const { week_start, position } = req.query;
      if (!week_start || !position) {
        return res.status(400).json({ error: 'week_start and position are required' });
      }
      if (!ALLOWED_PAYROLL_POSITIONS.has(String(position))) {
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
      return res.json(result.rows);
    }

    return res.status(400).json({
      error: 'Unknown report type',
      allowed_types: ['stock_daily', 'stock_category', 'stock_period', 'attendance_daily', 'payroll_view']
    });
  } catch (err) {
    console.error('User report view error:', err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

router.post('/generate', authMiddleware, canGenerateReports, async (req, res) => {
  const { type } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type is required' });

  if (type !== 'payroll_generate') {
    return res.status(400).json({ error: 'Only payroll_generate is supported for generation' });
  }

  const client = await pool.connect();
  try {
    const { week_start, week_end, position } = req.body;

    if (!week_start || !week_end || !position) {
      return res.status(400).json({ error: 'week_start, week_end, and position are required' });
    }
    if (!ALLOWED_PAYROLL_POSITIONS.has(String(position))) {
      return res.status(400).json({ error: 'position must be one of: Mason, Helper, Coating' });
    }

    await client.query('BEGIN');

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
    console.error('User payroll generate error:', err);
    res.status(500).json({ error: 'Failed to generate payroll' });
  } finally {
    client.release();
  }
});

module.exports = router;

