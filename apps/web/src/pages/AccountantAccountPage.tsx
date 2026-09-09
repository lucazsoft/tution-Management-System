import { useAuth } from '../context/AuthContext';
import { PageShell } from '../components/patterns/PageShell';
import { accountantNavItems } from '../components/patterns/accountantNavigation';
import { AccountPage } from './AccountPage';
import { SecurityPage } from './SecurityPage';

export function AccountantAccountPage({ security = false }: { security?: boolean }) {
  const { user, logout } = useAuth();
  return <PageShell title={security ? 'Security settings' : 'My account'} userRole="ACCOUNTANT" userName={user?.name ?? 'Signed-in user'} onLogout={logout} navItems={accountantNavItems} accountPath="/staff/account" securityPath="/staff/security" defaultSidebarCollapsed>
    {security ? <SecurityPage /> : <AccountPage passwordPath="/staff/security" />}
  </PageShell>;
}
