import AdminSidebar from '@/components/admin/AdminSidebar';

// Sidebar tree, expand/pin state and the accordion live in AdminSidebar
// (client component) — see docs/posiflora/admin-map.md §0/§1 for the
// hover-to-expand / burger-to-pin behaviour this mirrors from live Posiflora.
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <AdminSidebar />
      <div className="admin-main">
        <header className="admin-topbar" />
        <div className="admin-body">{children}</div>
      </div>
    </div>
  );
}
