import { redirect } from "next/navigation";

export default function ShipstationBundlesPage() {
  redirect("/dashboard/admin/planning/shipstation-data?tab=bundle-config");
}
