"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";

interface User { id: string; name: string; department?: string | null; }
interface Form { id: string; title: string; category: string; }

interface Props { users: User[]; forms?: Form[]; }

export function NewTaskForm({ users }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDue = tomorrow.toISOString().slice(0, 16);

  const [form, setForm] = useState({
    title: "",
    description: "",
    assignedToId: users[0]?.id ?? "",
    priority: "MEDIUM",
    dueDate: defaultDue,
    recurrence: "NONE",
    location: "",
  });
  const [saving, setSaving] = useState(false);

  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) { toast("Task title is required.", "error"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          dueDate: new Date(form.dueDate).toISOString(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("Task created!", "success");
      router.push("/tasks");
    } catch (err: any) {
      toast(err.message ?? "Failed to create task.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tasks" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="page-title">New Task</h1>
          <p className="page-subtitle">Schedule a food safety activity</p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Task Details</h2>

        <div>
          <label className="label">Title *</label>
          <input name="title" className="input" placeholder="e.g. Daily Refrigerator Temperature Check" value={form.title} onChange={onChange} required />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea name="description" className="input resize-none" rows={2} placeholder="Instructions or notes" value={form.description} onChange={onChange} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Assign To *</label>
            <select name="assignedToId" className="input" value={form.assignedToId} onChange={onChange} required>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select name="priority" className="input" value={form.priority} onChange={onChange}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Due Date & Time *</label>
            <input type="datetime-local" name="dueDate" className="input" value={form.dueDate} onChange={onChange} required />
          </div>
          <div>
            <label className="label">Recurrence</label>
            <select name="recurrence" className="input" value={form.recurrence} onChange={onChange}>
              <option value="NONE">One-time</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Location / Area</label>
          <input name="location" className="input" placeholder="e.g. Walk-in Cooler, Production Floor" value={form.location} onChange={onChange} />
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <Link href="/tasks" className="btn-secondary">Cancel</Link>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><Save className="w-4 h-4" /> Create Task</>}
        </button>
      </div>
    </form>
  );
}
