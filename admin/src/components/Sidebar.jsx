import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../authContext";

const navItems = [
  { path: "/", label: "Home" },
  { path: "/calendar", label: "Calendar" },
  { path: "/working-hours", label: "Working Hours" },
  { path: "/clients", label: "Clients" },
  { path: "/session-types", label: "Session Types" },
//   { path: "/form-questions", label: "Form Questions" },
  { path: "/payment-settings", label: "Payment Settings" },
  { path: "/invoices", label: "Invoices" },
];

export default function Sidebar() {
  const { signOut, user } = useAuth();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col">
      <h1 className="text-xl font-bold mb-6">Studio Admin</h1>
      <nav className="space-y-2 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md ${
                isActive ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t pt-3">
        <div className="text-xs text-gray-500 mb-2 truncate">{user?.email}</div>
        <button
          onClick={signOut}
          className="w-full text-left px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
