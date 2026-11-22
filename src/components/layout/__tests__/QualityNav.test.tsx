import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string; name: string; role: string; email: string } }, pathname: "/dashboard" }));

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: state.session, status: state.session ? "authenticated" : "unauthenticated" }), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => state.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { QUALITY_ROLES, canUseQuality } from "@/lib/quality";
import QualityPage from "@/app/(dashboard)/dashboard/admin/quality/page";
import IncidentPage from "@/app/(dashboard)/dashboard/admin/quality/incidents/[id]/page";
import CapaPage from "@/app/(dashboard)/dashboard/admin/quality/capas/[id]/page";

const user = (role: string, name = "Carlos Gomory") => ({ user: { id: "u1", name, role, email: "someone@example.com" } });
const as = (role: string | null) => { state.session = role ? user(role) : null; };
const count = (html: string, needle: string) => html.split(needle).length - 1;
const QUALITY_LINK = 'href="/dashboard/admin/quality"';
/** The section headings of the navigation, in the order they appear. */
const headings = (html: string) => Array.from(html.matchAll(/uppercase tracking-wider">\s*([^<]+?)\s*<\/p>/g)).map((m) => m[1].replace(/&amp;/g, "&"));

beforeEach(() => { state.session = null; state.pathname = "/dashboard"; });

// The app has ONE navigation component. The desktop sidebar and the phone/tablet drawer are the same
// <Sidebar />, mounted by <DashboardShell />; both are rendered here.
const variants: [string, () => string][] = [
  ["the sidebar (desktop and tablet)", () => renderToStaticMarkup(<Sidebar />)],
  ["the layout with its slide-in drawer (phone)", () => renderToStaticMarkup(<DashboardShell><p>page</p></DashboardShell>)],
];

describe.each(variants)("Quality in %s", (_name, render) => {
  it("an admin sees one 'Quality' entry, in its own section near the top", () => {
    as("ADMIN");
    const html = render();
    expect(count(html, QUALITY_LINK)).toBe(1);
    expect(html).toMatch(/href="\/dashboard\/admin\/quality"[^>]*>.*?<span class="flex-1 font-mono text-\[13px\]">Quality<\/span>/);
    expect(html).toContain('data-nav-section="quality"');
    const order = headings(html);
    expect(order[0]).toBe("Quality"); // the first section, right under the general entries
    expect(order.indexOf("Quality")).toBeLessThan(order.indexOf("Forms"));
    expect(order.indexOf("Quality")).toBeLessThan(order.indexOf("Inventory & Alerts"));
    // it is no longer the last item under "Inventory & Alerts"
    const inventory = html.slice(html.indexOf("Inventory &amp; Alerts"), html.indexOf("Purchasing"));
    expect(inventory).toContain("Quarantine");
    expect(inventory).not.toContain(QUALITY_LINK);
  });

  it("a supervisor does not see it", () => {
    as("SUPERVISOR");
    const html = render();
    expect(html).not.toContain(QUALITY_LINK);
    expect(html).not.toContain('data-nav-section="quality"');
    expect(headings(html)).not.toContain("Quality");
    expect(html).toContain('href="/dashboard/supervisor/pre-op-624"'); // their own entries are still there
  });

  it("with no session nothing of Quality is shown", () => {
    as(null);
    const html = render();
    expect(html).not.toContain(QUALITY_LINK);
    expect(headings(html)).not.toContain("Quality");
  });

  it("any other role value does not see it either (only the app's real admin role does)", () => {
    for (const role of ["admin", "Admin", "MANAGER", ""]) { as(role); expect(render(), role).not.toContain(QUALITY_LINK); }
  });

  it("the entry is highlighted while the admin is anywhere inside Quality", () => {
    as("ADMIN");
    state.pathname = "/dashboard/admin/quality/incidents/abc";
    const html = render();
    const link = html.slice(html.indexOf(QUALITY_LINK) - 200, html.indexOf(QUALITY_LINK) + 400);
    expect(link).toContain("text-brand-600");
  });
});

describe("one role check for the navigation, the pages and the routes", () => {
  it("canUseQuality is built on the shared list of roles, which holds the app's admin role", () => {
    expect(QUALITY_ROLES).toEqual(["ADMIN"]);
    expect(canUseQuality("ADMIN")).toBe(true);
    for (const role of ["SUPERVISOR", "admin", "", null, undefined]) expect(canUseQuality(role), String(role)).toBe(false);
  });
});

describe("the Quality pages for an admin session", () => {
  it("the main page renders for an admin — no redirect — with both tabs and the 'New incident' button", async () => {
    as("ADMIN");
    const html = renderToStaticMarkup(await QualityPage({ searchParams: {} }));
    expect(html).toContain(">Quality</h1>");
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Incidents \(0\)<\/button>/);
    expect(html).toMatch(/role="tab" aria-selected="false"[^>]*>CAPAs \(0\)<\/button>/);
    expect(html).toContain("New incident");
  });

  it("?tab=capas opens on the CAPAs tab", async () => {
    as("ADMIN");
    const html = renderToStaticMarkup(await QualityPage({ searchParams: { tab: "capas" } }));
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>CAPAs \(0\)<\/button>/);
    expect(html).toContain("New CAPA");
  });

  it("the record pages render for an admin too", async () => {
    as("ADMIN");
    expect(renderToStaticMarkup(await IncidentPage({ params: { id: "abc" } }))).toContain("All incidents");
    expect(renderToStaticMarkup(await CapaPage({ params: { id: "abc" } }))).toContain("All CAPAs");
  });

  it("a supervisor or a visitor without a session is sent to the dashboard instead", async () => {
    for (const role of ["SUPERVISOR", null]) {
      as(role);
      await expect(QualityPage({ searchParams: {} })).rejects.toThrow("REDIRECT:/dashboard");
      await expect(IncidentPage({ params: { id: "abc" } })).rejects.toThrow("REDIRECT:/dashboard");
      await expect(CapaPage({ params: { id: "abc" } })).rejects.toThrow("REDIRECT:/dashboard");
    }
  });
});
