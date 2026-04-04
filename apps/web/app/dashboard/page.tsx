import Link from "next/link";

export default function DashboardIndexPage() {
  return (
    <main className="card">
      <h1>Dashboard</h1>
      <p className="meta">Bu ekran rol bazli route ile calisir.</p>
      <Link href="/dashboard/student">Ornek: Student dashboard</Link>
    </main>
  );
}
