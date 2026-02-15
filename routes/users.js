const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// List all users
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  const result = await pool.query('SELECT u.id, u.full_name, u.username, r.name AS role FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.id');
    res.json(result.rows);
    });

    // Get single user
    router.get('/:id', authMiddleware, adminOnly, async (req, res) => {
      const { id } = req.params;
        const result = await pool.query('SELECT u.id, u.full_name, u.username, r.name AS role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id=$1', [id]);
          res.json(result.rows[0]);
          });

          // Update user (full_name, username, role)
          router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
            const { id } = req.params;
              const { full_name, username, role_id } = req.body;

                const result = await pool.query(
                    'UPDATE users SET full_name=$1, username=$2, role_id=$3 WHERE id=$4 RETURNING id, full_name, username',
                        [full_name, username, role_id, id]
                          );
                            res.json(result.rows[0]);
                            });

                            // Delete user
                           router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;

  await pool.query(
    'UPDATE users SET is_active = FALSE WHERE id=$1',
    [id]
  );

  res.json({ message: 'User deactivated' });
});

// Add new user
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { full_name, username, password, role_id } = req.body;

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, username, password_hash, role_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, username`,
      [full_name, username, hashedPassword, role_id]
    );

    res.json({ message: 'User created', user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

                                  module.exports = router;
