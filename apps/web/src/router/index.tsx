import { TenantAccountPage } from '../pages/TenantAccountPage';
import { MobileRecoveryPage } from '../pages/auth/MobileRecoveryPage';
import { PaymentSettingsPage } from '../pages/PaymentSettingsPage';
import { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { findNavigationItem, mapAuthRoleToDashboardRole, type DashboardRole } from '../components/patterns/dashboardNavigation';
import type { UserRole } from '../features/auth/types';
import { NotFoundPage, RouteFailurePage, SessionStatePage } from '../components/patterns/SystemStatePage';

const DashboardShell = lazy(() => import('../components/patterns/DashboardShell').then((module) => ({ default: module.DashboardShell })));
const SessionTimeoutDialog = lazy(() => import('../components/ui/SessionTimeoutDialog').then((module) => ({ default: module.SessionTimeoutDialog })));

const LoginPage = lazy(() => import('../pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('../pages/auth/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })));
const ForceChangePasswordPage = lazy(() => import('../pages/auth/ForceChangePasswordPage').then((module) => ({ default: module.ForceChangePasswordPage })));
const TwoFactorPage = lazy(() => import('../pages/auth/TwoFactorPage').then((module) => ({ default: module.TwoFactorPage })));
const TenantSetupWizard = lazy(() => import('../pages/setup/TenantSetupWizard').then((module) => ({ default: module.TenantSetupWizard })));
const BranchSetupWizard = lazy(() => import('../pages/setup/BranchSetupWizard').then((module) => ({ default: module.BranchSetupWizard })));

const TenantAdminDashboard = lazy(() => import('../pages/TenantAdminDashboard').then((module) => ({ default: module.TenantAdminDashboard })));
const TenantBranches = lazy(() => import('../pages/TenantBranches').then((module) => ({ default: module.TenantBranches })));
const TenantControlCenter = lazy(() => import('../pages/TenantControlCenter').then((module) => ({ default: module.TenantControlCenter })));
const TenantPettyCashPage = lazy(() => import('../pages/TenantOperationsPages').then((module) => ({ default: module.TenantPettyCashPage })));
const TenantReportsPage = lazy(() => import('../pages/TenantOperationsPages').then((module) => ({ default: module.TenantReportsPage })));
const TenantPayrollPage = lazy(() => import('../pages/TenantOperationsPages').then((module) => ({ default: module.TenantPayrollPage })));
const TenantResourcesPage = lazy(() => import('../pages/TenantOperationsPages').then((module) => ({ default: module.TenantResourcesPage })));
const TenantCalendarPage = lazy(() => import('../pages/TenantOperationsPages').then((module) => ({ default: module.TenantCalendarPage })));
const TenantHrPage = lazy(() => import('../pages/TenantOperationsPages').then((module) => ({ default: module.TenantHrPage })));
const TenantAdmissionsPage = lazy(() => import('../pages/TenantOperationsPages').then((module) => ({ default: module.TenantAdmissionsPage })));
const TenantCertificatesPage = lazy(() => import('../pages/TenantOperationsPages').then((module) => ({ default: module.TenantCertificatesPage })));
const TenantLeaveRequestsPage = lazy(() => import('../pages/TenantOperationsPages').then((module) => ({ default: module.TenantLeaveRequestsPage })));
const PeopleDirectory = lazy(() => import('../pages/PeopleDirectory').then((module) => ({ default: module.PeopleDirectory })));
const AcademicCourses = lazy(() => import('../pages/AcademicCourses').then((module) => ({ default: module.AcademicCourses })));
const AcademicTimetables = lazy(() => import('../pages/AcademicTimetables').then((module) => ({ default: module.AcademicTimetables })));
const AcademicStudents = lazy(() => import('../pages/AcademicRoster').then((module) => ({ default: module.AcademicStudents })));
const AcademicTeachers = lazy(() => import('../pages/AcademicRoster').then((module) => ({ default: module.AcademicTeachers })));
const AcademicFees = lazy(() => import('../pages/AcademicFees').then((module) => ({ default: module.AcademicFees })));
const TenantPaymentsPage = lazy(() => import('../pages/TenantPaymentsPage').then((module) => ({ default: module.TenantPaymentsPage })));
const AcademicGrades = lazy(() => import('../pages/AcademicGrades').then((module) => ({ default: module.AcademicGrades })));
const BranchAdminDashboard = lazy(() => import('../pages/BranchAdminDashboard').then((module) => ({ default: module.BranchAdminDashboard })));
const BranchAdminWorkspace = lazy(() => import('../pages/BranchAdminWorkspace').then((module) => ({ default: module.BranchAdminWorkspace })));
const TenantResultsPage = lazy(() => import('../pages/BranchAdminWorkspace').then((module) => ({ default: module.BranchResultsView })));
const TeacherPortal = lazy(() => import('../pages/TeacherPortal').then((module) => ({ default: module.TeacherPortal })));
const ParentStudentPortal = lazy(() => import('../pages/ParentStudentPortal').then((module) => ({ default: module.ParentStudentPortal })));
const StudentPortal = lazy(() => import('../pages/StudentPortal').then((module) => ({ default: module.StudentPortal })));
const StaffFinancePage = lazy(() => import('../pages/StaffFinancePage').then((module) => ({ default: module.StaffFinancePage })));
const StaffReceptionPage = lazy(() => import('../pages/StaffReceptionPage').then((module) => ({ default: module.StaffReceptionPage })));
const StaffTasksPage = lazy(() => import('../pages/StaffTasksPage').then((module) => ({ default: module.StaffTasksPage })));
const SuperAdminDashboard = lazy(() => import('../pages/SuperAdminDashboard').then((module) => ({ default: module.SuperAdminDashboard })));
const SuperAdminTenants = lazy(() => import('../pages/SuperAdminTenants').then((module) => ({ default: module.SuperAdminTenants })));
const SecurityPage = lazy(() => import('../pages/SecurityPage').then((module) => ({ default: module.SecurityPage })));
const PaymentResultPage = lazy(() => import('../pages/PaymentResultPage').then((module) => ({ default: module.PaymentResultPage })));

function RequireAuth() {
  const { isAuthenticated, isLoading, isTwoFactorPending, sessionIssue } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isTwoFactorPending) {
    return <Navigate to="/2fa" replace />;
  }

  if (!isAuthenticated) {
    if (sessionIssue === 'signed-out') return <Navigate to="/login" replace />;
    return <Navigate to={`/session-ended?reason=${sessionIssue === 'unavailable' ? 'unavailable' : 'missing'}`} replace />;
  }

  return (
    <>
      <Suspense fallback={null}><SessionTimeoutDialog /></Suspense>
      <Outlet />
    </>
  );
}

function RequireRole({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const { user, roleRedirectPath } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.requiresPasswordChange && window.location.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleRedirectPath()} replace />;
  }

  return <Outlet />;
}

function RequireTwoFactor() {
  const { isAuthenticated, isLoading, isTwoFactorPending, roleRedirectPath } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isAuthenticated) {
    return <Navigate to={roleRedirectPath()} replace />;
  }

  if (!isTwoFactorPending) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function PublicAuthLayout() {
  return <Outlet />;
}

function AuthenticatedLayout() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (location.pathname.startsWith('/setup')) {
    return <Outlet />;
  }

  const dashboardRole = mapAuthRoleToDashboardRole(user.role);

  if (!dashboardRole) {
    return <Outlet />;
  }

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <DashboardShell role={dashboardRole}>
        <Outlet />
      </DashboardShell>
    </Suspense>
  );
}

function RedirectIfAuth() {
  const { isAuthenticated, isLoading, isTwoFactorPending, roleRedirectPath, user } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isTwoFactorPending) {
    return <Navigate to="/2fa" replace />;
  }

  if (user?.requiresPasswordChange) {
    return <Navigate to="/force-change-password" replace />;
  }

  if (isAuthenticated) {
    return <Navigate to={roleRedirectPath()} replace />;
  }

  return <Outlet />;
}

function FullPageSpinner() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div className="auth-spinner" style={{ width: '40px', height: '40px', borderWidth: '4px' }} />
      <p style={{ color: 'var(--text-muted-foreground)', fontSize: '14px' }}>Loading…</p>
    </div>
  );
}

function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '60px 40px', textAlign: 'center' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--color-primary-light)' }}>
        construction
      </span>
      <h2 style={{ marginTop: '16px', fontSize: '24px', fontWeight: 700 }}>{title}</h2>
      <p style={{ color: 'rgba(44, 62, 80, 0.68)', marginTop: '8px' }}>{description ?? 'This workspace will be wired to the module flow next.'}</p>
      <button type="button" className="auth-submit-btn" style={{ marginTop: '24px' }} onClick={() => navigate(-1)}>
        Go Back
      </button>
    </div>
  );
}

function RoleWorkspacePlaceholder({ role }: { role: DashboardRole }) {
  const location = useLocation();
  const item = findNavigationItem(role, location.pathname);

  return (
    <PlaceholderPage
      title={item?.label ?? 'Workspace'}
      description={item?.phase ? `This module is planned for Phase ${item.phase}.` : 'Dashboard shell and navigation are ready; feature wiring will follow.'}
    />
  );
}

const router = createBrowserRouter([
  // Available while signed in as well as when locked out; the private recovery
  // token and approved-destination SMS authenticate this flow.
  { path: '/recover-mobile', element: <PublicAuthLayout />, children: [{ index: true, element: <MobileRecoveryPage /> }], errorElement: <RouteFailurePage /> },
  {
    errorElement: <RouteFailurePage />,
    element: <RedirectIfAuth />,
    children: [
      {
        element: <PublicAuthLayout />,
        children: [
          { path: '/login', element: <Suspense fallback={<FullPageSpinner />}><LoginPage /></Suspense> },
          { path: '/forgot-password', element: <Suspense fallback={<FullPageSpinner />}><ForgotPasswordPage /></Suspense> },
          { path: '/reset-password', element: <Navigate to="/forgot-password" replace /> },
          { path: '/reset-password/:token', element: <Suspense fallback={<FullPageSpinner />}><ResetPasswordPage /></Suspense> },
          { path: '/session-ended', element: <SessionStatePage /> },
        ],
      },
    ],
  },
  {
    path: '/force-change-password',
    errorElement: <RouteFailurePage />,
    element: <Suspense fallback={<FullPageSpinner />}><ForceChangePasswordPage /></Suspense>,
  },
  {
    errorElement: <RouteFailurePage />,
    element: <RequireTwoFactor />,
    children: [
      { path: '/2fa', element: <Suspense fallback={<FullPageSpinner />}><TwoFactorPage /></Suspense> },
      { path: '/two-factor', element: <Navigate to="/2fa" replace /> },
    ],
  },
  {
    errorElement: <RouteFailurePage />,
    element: <RequireAuth />,
    children: [
      {
        element: <AuthenticatedLayout />,
        children: [
          { path: '/setup/tenant', element: <Suspense fallback={<FullPageSpinner />}><TenantSetupWizard /></Suspense> },
          { path: '/setup/branch', element: <Suspense fallback={<FullPageSpinner />}><BranchSetupWizard /></Suspense> },

          {
            element: <RequireRole allowedRoles={['SUPER_ADMIN']} />,
            children: [
              { path: '/platform/overview', element: <Suspense fallback={<FullPageSpinner />}><SuperAdminDashboard /></Suspense> },
              { path: '/platform/onboarding', element: <Navigate to="/platform/overview" replace /> },
              { path: '/platform/support', element: <Navigate to="/platform/overview" replace /> },
              { path: '/platform/policies', element: <Navigate to="/platform/overview" replace /> },
              { path: '/platform/billing', element: <Navigate to="/platform/overview" replace /> },
              { path: '/platform/audit', element: <Navigate to="/platform/overview" replace /> },
              { path: '/platform/tenants', element: <Suspense fallback={<FullPageSpinner />}><SuperAdminTenants /></Suspense> },
              { path: '/platform/security', element: <Suspense fallback={<FullPageSpinner />}><SecurityPage /></Suspense> },
            ],
          },
          {
            element: <RequireRole allowedRoles={['TENANT_ADMIN']} />,
            children: [
              { path: '/tenant/account', element: <TenantAccountPage /> },
              { path: '/tenant/dashboard', element: <Suspense fallback={<FullPageSpinner />}><TenantAdminDashboard /></Suspense> },
              { path: '/tenant/payment-settings', element: <PaymentSettingsPage /> },
              { path: '/tenant/branches', element: <Suspense fallback={<FullPageSpinner />}><TenantBranches /></Suspense> },
              { path: '/tenant/people', element: <Suspense fallback={<FullPageSpinner />}><PeopleDirectory /></Suspense> },
              { path: '/tenant/admissions', element: <Suspense fallback={<FullPageSpinner />}><TenantAdmissionsPage /></Suspense> },
              { path: '/tenant/students', element: <Suspense fallback={<FullPageSpinner />}><AcademicStudents /></Suspense> },
              { path: '/tenant/teachers', element: <Suspense fallback={<FullPageSpinner />}><AcademicTeachers /></Suspense> },
              { path: '/tenant/courses', element: <Suspense fallback={<FullPageSpinner />}><AcademicCourses /></Suspense> },
              { path: '/tenant/timetables', element: <Suspense fallback={<FullPageSpinner />}><AcademicTimetables /></Suspense> },
              { path: '/tenant/fees', element: <Suspense fallback={<FullPageSpinner />}><AcademicFees /></Suspense> },
              { path: '/tenant/payments', element: <Suspense fallback={<FullPageSpinner />}><TenantPaymentsPage /></Suspense> },
              { path: '/tenant/grades', element: <Suspense fallback={<FullPageSpinner />}><AcademicGrades /></Suspense> },
              { path: '/tenant/results', element: <Suspense fallback={<FullPageSpinner />}><TenantResultsPage /></Suspense> },
              { path: '/tenant/control-center', element: <Suspense fallback={<FullPageSpinner />}><TenantControlCenter /></Suspense> },
              { path: '/tenant/settings', element: <Navigate to="/tenant/control-center" replace /> },
              { path: '/tenant/petty-cash', element: <Suspense fallback={<FullPageSpinner />}><TenantPettyCashPage /></Suspense> },
              { path: '/tenant/pl-reports', element: <Suspense fallback={<FullPageSpinner />}><TenantReportsPage /></Suspense> },
              { path: '/tenant/payroll', element: <Suspense fallback={<FullPageSpinner />}><TenantPayrollPage /></Suspense> },
              { path: '/tenant/hr-management', element: <Suspense fallback={<FullPageSpinner />}><TenantHrPage /></Suspense> },
              { path: '/tenant/resource-logs', element: <Suspense fallback={<FullPageSpinner />}><TenantResourcesPage /></Suspense> },
              { path: '/tenant/academic-calendar', element: <Suspense fallback={<FullPageSpinner />}><TenantCalendarPage /></Suspense> },
              { path: '/tenant/certificates', element: <Suspense fallback={<FullPageSpinner />}><TenantCertificatesPage /></Suspense> },
              { path: '/tenant/leave-requests', element: <Suspense fallback={<FullPageSpinner />}><TenantLeaveRequestsPage /></Suspense> },
              { path: '/tenant/security', element: <Suspense fallback={<FullPageSpinner />}><SecurityPage /></Suspense> },
              { path: '/tenant/*', element: <RoleWorkspacePlaceholder role="tenant-admin" /> },
            ],
          },
          {
            element: <RequireRole allowedRoles={['BRANCH_ADMIN']} />,
            children: [
              { path: '/branch/payment-settings', element: <PaymentSettingsPage /> },
              { path: '/branch/dashboard', element: <Suspense fallback={<FullPageSpinner />}><BranchAdminDashboard /></Suspense> },
              { path: '/branch/staff', element: <Suspense fallback={<FullPageSpinner />}><PeopleDirectory /></Suspense> },
              { path: '/branch/admissions', element: <Suspense fallback={<FullPageSpinner />}><TenantAdmissionsPage /></Suspense> },
              { path: '/branch/students', element: <Suspense fallback={<FullPageSpinner />}><AcademicStudents /></Suspense> },
              { path: '/branch/payments', element: <Suspense fallback={<FullPageSpinner />}><TenantPaymentsPage /></Suspense> },
              { path: '/branch/*', element: <Suspense fallback={<FullPageSpinner />}><BranchAdminWorkspace /></Suspense> },
            ],
          },
          {
            element: <RequireRole allowedRoles={['TEACHER']} />,
            children: [
              { path: '/teacher', element: <Navigate to="/teacher/dashboard" replace /> },
              { path: '/teacher/*', element: <Suspense fallback={<FullPageSpinner />}><TeacherPortal /></Suspense> },
            ],
          },
          {
            element: <RequireRole allowedRoles={['STUDENT']} />,
            children: [
              { path: '/student/*', element: <Suspense fallback={<FullPageSpinner />}><StudentPortal /></Suspense> },
            ],
          },
          {
            element: <RequireRole allowedRoles={['PARENT']} />,
            children: [
              { path: '/parent/*', element: <Suspense fallback={<FullPageSpinner />}><ParentStudentPortal /></Suspense> },
            ],
          },

          {
            element: <RequireRole allowedRoles={['ACCOUNTANT']} />,
            children: [
              { path: '/staff/finance', element: <Suspense fallback={<FullPageSpinner />}><StaffFinancePage /></Suspense> },
            ],
          },
          { path: '/payment/result', element: <Suspense fallback={<FullPageSpinner />}><PaymentResultPage /></Suspense> },
          {
            element: <RequireRole allowedRoles={['RECEPTIONIST']} />,
            children: [
              { path: '/staff/reception', element: <Suspense fallback={<FullPageSpinner />}><StaffReceptionPage /></Suspense> },
            ],
          },
          {
            element: <RequireRole allowedRoles={['JANITOR']} />,
            children: [
              { path: '/staff/tasks', element: <Suspense fallback={<FullPageSpinner />}><StaffTasksPage /></Suspense> },
            ],
          },
        ],
      },
    ],
  },
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <NotFoundPage />, errorElement: <RouteFailurePage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

