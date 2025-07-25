// middlewares/auth.optional.js
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, secret);
      req.usuario = decoded;
    } catch (err) {
      console.warn("Token inválido en ruta opcional");
    }
  }

  next();
};