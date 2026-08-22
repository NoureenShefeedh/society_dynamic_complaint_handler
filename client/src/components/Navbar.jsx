import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  if (!user) return null;

  return (
    <header className="navbar">
      <div className="brand">
        Society Tracker <span className="tag">{user.role}</span>
      </div>
      <nav>
        {user.role === "resident" && (
          <NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")}>
            My Complaints
          </NavLink>
        )}
        {user.role === "admin" && (
          <>
            <NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")}>
              Board
            </NavLink>
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
              Dashboard
            </NavLink>
          </>
        )}
        <NavLink to="/notices" className={({ isActive }) => (isActive ? "active" : "")}>
          Notices
        </NavLink>
        <a onClick={handleLogout}>Log out</a>
      </nav>
    </header>
  );
}
