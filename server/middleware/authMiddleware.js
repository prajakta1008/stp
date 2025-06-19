const jwt = require('jsonwebtoken');
const JWT_SECRET = 'mySuperSecretKey123'; // Use your actual secret

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; // ✅ This must set the user's role, etc.
    next();
  });
}

module.exports = { authenticateToken };

