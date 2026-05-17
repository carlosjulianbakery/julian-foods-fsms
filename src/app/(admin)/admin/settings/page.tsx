export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (session!.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">System configuration for Julian's Foods FSMS</p>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Organization</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Company Name</label>
            <input className="input" defaultValue="Julian's Foods" disabled />
          </div>
          <div>
            <label className="label">System Version</label>
            <input className="input" defaultValue="1.0.0" disabled />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Task Defaults</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Default Priority</label>
            <select className="input">
              <option>MEDIUM</option>
              <option>HIGH</option>
              <option>LOW</option>
            </select>
          </div>
          <div>
            <label className="label">Overdue Notification (hours before)</label>
            <input type="number" className="input" defaultValue={24} />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Compliance</h2>
        <div className="space-y-3">
          {[
            { label: "Require supervisor approval for form submissions", checked: true },
            { label: "Enable audit logging for all actions", checked: true },
            { label: "Auto-mark tasks as overdue after due date", checked: true },
            { label: "Allow operators to create records", checked: true },
          ].map((item) => (
            <label key={item.label} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={item.checked}
                className="w-4 h-4 accent-brand-600"
              />
              <span className="text-sm text-gray-700">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary">Save Settings</button>
      </div>
    </div>
  );
}
