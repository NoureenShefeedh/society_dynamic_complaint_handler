import jwt from "jsonwebtoken";

// Verifies the JWT on protected routes and attaches the decoded
// { id, role } payload to req.user for downstream handlers to use.
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Restricts a route to specific roles. Use after requireAuth.
// Example: router.get("/admin-only", requireAuth, requireRole("admin"), handler)
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
