"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getRoleColor } from "@/lib/utils";
import { toUpperCaseInput } from "@/lib/formatters";
import { UserPlus, Trash2, ChevronDown, X } from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  active: boolean;
  createdAt: string;
};

const ROLES = ["SUPERVISOR", "ADMIN"] as const;

export function UserManagementClient({
  users: initialUsers,
  currentUserId,
}: {
  users: User[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [roleDropdown, setRoleDropdown] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "",
    role: "SUPERVISOR" as "SUPERVISOR" | "ADMIN",
  });

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user.");
      setShowForm(false);
      setForm({ name: "", email: "", password: "", department: "", role: "SUPERVISOR" });
      router.refresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function updateUser(id: string, patch: { role?: string; active?: boolean }) {
    setActionLoading(id);
    setRoleDropdown(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Update failed.");
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err: any) {
      alert(err.message ?? "Delete failed.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users",  value: users.length },
          { label: "Admins",       value: users.filter((u) => u.role === "ADMIN").length },
          { label: "Supervisors",  value: users.filter((u) => u.role === "SUPERVISOR").length },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Create user form */}
      {showForm && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">New User</h2>
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={createUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: toUpperCaseInput(e.target.value) }))}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="label">Position</label>
                <input
                  className="input"
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: toUpperCaseInput(e.target.value) }))}
                  placeholder="Production Supervisor"
                />
              </div>
              <div>
                <label className="label">Login Email</label>
                <input
                  type="email"
                  className="input"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@julianbakery.com"
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 8 characters"
                />
              </div>
              <div>
                <label className="label">Role</label>
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "SUPERVISOR" | "ADMIN" }))}
                >
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? "Creating…" : "Create User"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormError(""); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">All Users</h2>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-primary text-xs px-3 py-1.5">
              <UserPlus className="w-3.5 h-3.5" /> New User
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Name", "Position", "Email", "Role", "Status", "Joined", ""].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const loading = actionLoading === user.id;

                return (
                  <tr key={user.id} className={loading ? "opacity-50" : ""}>
                    <td className="px-5 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                      {user.name}
                      {isSelf && <span className="ml-1.5 badge bg-gray-100 text-gray-500 text-[10px]">you</span>}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{user.department ?? "—"}</td>
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{user.email}</td>
                    <td className="px-5 py-3.5">
                      {isSelf ? (
                        <span className={`badge ${getRoleColor(user.role)}`}>{user.role}</span>
                      ) : (
                        <div className="relative inline-block">
                          <button
                            disabled={loading}
                            onClick={() => setRoleDropdown(roleDropdown === user.id ? null : user.id)}
                            className={`badge ${getRoleColor(user.role)} cursor-pointer flex items-center gap-1 pr-1.5`}
                          >
                            {user.role} <ChevronDown className="w-3 h-3" />
                          </button>
                          {roleDropdown === user.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setRoleDropdown(null)} />
                              <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-36">
                                {ROLES.filter((r) => r !== user.role).map((r) => (
                                  <button
                                    key={r}
                                    onClick={() => updateUser(user.id, { role: r })}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors"
                                  >
                                    Set {r}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {isSelf ? (
                        <span className="badge bg-emerald-100 text-emerald-700">Active</span>
                      ) : (
                        <button
                          disabled={loading}
                          onClick={() => updateUser(user.id, { active: !user.active })}
                          className={`badge cursor-pointer hover:opacity-80 transition-opacity ${
                            user.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {user.active ? "Active" : "Inactive"}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap font-mono text-xs">{user.createdAt}</td>
                    <td className="px-5 py-3.5">
                      {!isSelf && (
                        <button
                          disabled={loading}
                          onClick={() => deleteUser(user.id, user.name)}
                          className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
