const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// Admin register new user
router.post('/register', authMiddleware, adminOnly, async (req, res) => {
  const { full_name, username, password, role_id } = req.body;
    const hashed = await bcrypt.hash(password, 10);

      try {
          const result = await pool.query(
                'INSERT INTO users (full_name, username, password_hash, role_id) VALUES ($1,$2,$3,$4) RETURNING id, username',
                      [full_name, username, hashed, role_id]
                          );
                              res.json({ user: result.rows[0] });
                                } catch (err) {
                                    res.status(400).json({ error: 'Username already exists' });
                                      }
                                      });

                                      // Login
                                      router.post('/login', async (req, res) => {
                                        const { username, password } = req.body;

                                          const user = await pool.query('SELECT u.id, u.username, u.password_hash, r.name AS role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username=$1', [username]);
                                            if (!user.rows.length) return res.status(400).json({ error: 'Invalid credentials' });

                                              const valid = await bcrypt.compare(password, user.rows[0].password_hash);
                                                if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

                                                  const token = jwt.sign({ id: user.rows[0].id, username, role: user.rows[0].role }, process.env.JWT_SECRET, { expiresIn: '8h' });
                                                    res.json({ token });
                                                    });

                                                    module.exports = router;
