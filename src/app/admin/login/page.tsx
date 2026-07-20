import LoginForm from '@/components/admin/LoginForm';

// Login screen — rendered under the minimal root /admin layout (no sidebar).
export default function AdminLoginPage() {
  return (
    <main className="admin-login">
      <div className="admin-login__card">
        <div className="admin-login__brand">
          <span className="admin-login__logo" aria-hidden="true">F</span>
          <span className="admin-login__wordmark">Floree</span>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
