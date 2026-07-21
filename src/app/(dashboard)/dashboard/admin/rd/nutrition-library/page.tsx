import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import NutritionLibraryClient from "./NutritionLibraryClient";

export default async function NutritionLibraryPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role: string }).role !== "ADMIN") {
    redirect("/dashboard");
  }
  return <NutritionLibraryClient />;
}
