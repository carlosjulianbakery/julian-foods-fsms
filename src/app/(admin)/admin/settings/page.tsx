export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Info, Bell } from "lucide-react";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (session!.user.role !== "ADMIN") redirect("/admin/users");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">System configuration for Julian's Foods FSMS</p>
      </div>

      {/* System Information */}
      <div className="card">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <Info className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900">System Information</h2>
        </div>
        <div className="p-6 grid grid-cols-2 gap-6">
          <div>
            <label className="label">Application Name</label>
            <input className="input" defaultValue="Julian's Foods FSMS" disabled />
          </div>
          <div>
            <label className="label">Version</label>
            <input className="input" defaultValue="1.0.0" disabled />
          </div>
          <div>
            <label className="label">Environment</label>
            <input className="input" defaultValue="Production" disabled />
          </div>
          <div>
            <label className="label">Logged in as</label>
            <input className="input" defaultValue={session!.user.email ?? ""} disabled />
          </div>
        </div>
      </div>

      {/* Notification Settings — placeholder */}
      <div className="card">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <Bell className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Notification Settings</h2>
          <span className="ml-auto badge bg-gray-100 text-gray-500">Coming soon</span>
        </div>
        <div className="p-6 space-y-4">
          {[
            "Email alerts for overdue tasks",
            "Daily digest of pending submissions",
            "Notify supervisor on new form submission",
            "Notify admin on role changes",
          ].map((label) => (
            <label key={label} className="flex items-center gap-3 opacity-50 cursor-not-allowed">
              <input
                type="checkbox"
                disabled
                className="w-4 h-4 accent-brand-600"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
          <p className="text-xs text-gray-400 pt-2">
            Notification delivery will be configurable in a future release.
          </p>
        </div>
      </div>
    </div>
  );
}
