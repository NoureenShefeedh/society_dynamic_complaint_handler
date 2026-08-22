import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Navbar from "./components/Navbar.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import ResidentDashboard from "./pages/ResidentDashboard.jsx";
import AdminBoard from "./pages/AdminBoard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import NoticeBoard from "./pages/NoticeBoard.jsx";

function HomeRoute() {
  const { user } = useAuth();
  if (user?.role === "admin") return <AdminBoard />;
  return <ResidentDashboard />;
}

function Shell({ children }) {
  return (
    <div className="app-shell">
      <Navbar />
      {children}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Shell><HomeRoute /></Shell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute role="admin">
                <Shell><AdminDashboard /></Shell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notices"
            element={
              <ProtectedRoute>
                <Shell><NoticeBoard /></Shell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
