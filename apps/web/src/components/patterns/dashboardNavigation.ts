export type DashboardRole = 'super-admin' | 'tenant-admin' | 'branch-admin' | 'teacher' | 'student' | 'parent' | 'receptionist' | 'janitor';

export interface DashboardNavItem {
  label: string;
  icon: string;
  path: string;
  section: string;
  phase?: 2 | 3;
}

const ROLE_LABELS: Record<DashboardRole, string> = {
  'super-admin': 'Super Admin',
  'tenant-admin': 'Tenant Admin',
  'branch-admin': 'Branch Admin',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
  receptionist: 'Receptionist',
  janitor: 'Maintenance Staff',
};

export const DASHBOARD_NAVIGATION: Record<DashboardRole, DashboardNavItem[]> = {
  'super-admin': [
    { section: 'Bootstrap', label: 'Create Tenant Admin', icon: 'person_add', path: '/platform/overview' },
    { section: 'Bootstrap', label: 'Created Tenants', icon: 'domain', path: '/platform/tenants' },
    { section: 'Security', label: 'Security', icon: 'security', path: '/platform/security' },
  ],
  'tenant-admin': [
    { section: 'Main', label: 'Dashboard', icon: 'dashboard', path: '/tenant/dashboard' },
    { section: 'Main', label: 'Branches', icon: 'domain', path: '/tenant/branches' },
    { section: 'Main', label: 'Staff & Parents', icon: 'group', path: '/tenant/people' },
    { section: 'Main', label: 'Admissions', icon: 'person_add', path: '/tenant/admissions' },
    { section: 'Main', label: 'Control Center', icon: 'admin_panel_settings', path: '/tenant/control-center' },
    { section: 'Academic', label: 'Students', icon: 'school', path: '/tenant/students' },
    { section: 'Academic', label: 'Teachers', icon: 'badge', path: '/tenant/teachers' },
    { section: 'Academic', label: 'Grades', icon: 'stairs', path: '/tenant/grades' },
    { section: 'Academic', label: 'Timetables', icon: 'calendar_month', path: '/tenant/timetables' },
    { section: 'Academic', label: 'Courses', icon: 'menu_book', path: '/tenant/courses' },
    { section: 'Academic', label: 'Results', icon: 'emoji_events', path: '/tenant/results' },
    { section: 'Finance', label: 'Payment settings', icon: 'qr_code_2', path: '/tenant/payment-settings' },
    { section: 'Finance', label: 'Fee & Billing', icon: 'payments', path: '/tenant/fees' },
    { section: 'Finance', label: 'Payments', icon: 'account_balance', path: '/tenant/payments' },
    { section: 'Finance', label: 'Payroll', icon: 'account_balance_wallet', path: '/tenant/payroll' },
    { section: 'Finance', label: 'Petty Cash', icon: 'savings', path: '/tenant/petty-cash' },
    { section: 'Finance', label: 'P&L Reports', icon: 'monitoring', path: '/tenant/pl-reports' },
    { section: 'Operations', label: 'Leave Requests', icon: 'event_busy', path: '/tenant/leave-requests' },
    { section: 'Operations', label: 'Resource Logs', icon: 'inventory_2', path: '/tenant/resource-logs' },
    { section: 'Operations', label: 'HR Management', icon: 'group', path: '/tenant/hr-management' },
    { section: 'Operations', label: 'Certificates', icon: 'workspace_premium', path: '/tenant/certificates' },
    { section: 'Operations', label: 'Academic Calendar', icon: 'date_range', path: '/tenant/academic-calendar' },
    { section: 'Settings', label: 'My account', icon: 'account_circle', path: '/tenant/account' },
    { section: 'Settings', label: 'Institution settings', icon: 'settings', path: '/tenant/settings' },
    { section: 'Settings', label: 'Security', icon: 'security', path: '/tenant/security' },
  ],
  'branch-admin': [
    { section: 'Main', label: 'Dashboard', icon: 'dashboard', path: '/branch/dashboard' },
    { section: 'Main', label: 'Staff', icon: 'group', path: '/branch/staff' },
    { section: 'Main', label: 'Admissions', icon: 'person_add', path: '/branch/admissions' },
    { section: 'Academic', label: 'Students', icon: 'groups', path: '/branch/students' },
    { section: 'Academic', label: 'Teachers', icon: 'person', path: '/branch/teachers' },
    { section: 'Academic', label: 'Syllabus Tracking', icon: 'menu_book', path: '/branch/syllabus' },
    { section: 'Academic', label: 'Timetable', icon: 'calendar_today', path: '/branch/timetable' },
    { section: 'Academic', label: 'Attendance', icon: 'co_present', path: '/branch/attendance' },
    { section: 'Academic', label: 'Classes', icon: 'group_work', path: '/branch/classes' },
    { section: 'Academic', label: 'Homework', icon: 'assignment', path: '/branch/homework' },
    { section: 'Academic', label: 'Results', icon: 'emoji_events', path: '/branch/results' },
    { section: 'Finance', label: 'Payment settings', icon: 'qr_code_2', path: '/branch/payment-settings' },
    { section: 'Finance', label: 'Fee & Billing', icon: 'payments', path: '/branch/fees' },
    { section: 'Finance', label: 'Payment Requests', icon: 'fact_check', path: '/branch/payments' },
    { section: 'Finance', label: 'Petty Cash', icon: 'savings', path: '/branch/petty-cash' },
    { section: 'Operations', label: 'Leave Requests', icon: 'event_busy', path: '/branch/leave-requests' },
    { section: 'Operations', label: 'Resource Logs', icon: 'description', path: '/branch/resource-logs' },
    { section: 'Operations', label: 'Appointments', icon: 'event', path: '/branch/appointments' },
    { section: 'Operations', label: 'Certificates', icon: 'workspace_premium', path: '/branch/certificates' },
    { section: 'Communication', label: 'Messages', icon: 'forum', path: '/branch/messages' },
    { section: 'Communication', label: 'Announcements', icon: 'campaign', path: '/branch/announcements' },
    { section: 'Calendar', label: 'Academic Calendar', icon: 'date_range', path: '/branch/academic-calendar' },
    { section: 'Settings', label: 'Security', icon: 'security', path: '/branch/security' },
  ],
  teacher: [
    { section: 'Overview', label: 'Academic Calendar', icon: 'date_range', path: '/teacher/calendar' },
    { section: 'Overview', label: 'Teacher Dashboard', icon: 'dashboard', path: '/teacher/dashboard' },
    { section: 'Overview', label: 'My Timetable', icon: 'calendar_view_week', path: '/teacher/timetable' },
    { section: 'Overview', label: 'Geo Attendance', icon: 'person_pin_circle', path: '/teacher/geo-attendance' },
    { section: 'Classroom', label: 'Attendance', icon: 'checklist', path: '/teacher/attendance' },
    { section: 'Classroom', label: 'Syllabus', icon: 'menu_book', path: '/teacher/syllabus' },
    { section: 'Classroom', label: 'Daily Update Log', icon: 'note_alt', path: '/teacher/daily-update-log' },
    { section: 'Classroom', label: 'Homework', icon: 'assignment', path: '/teacher/homework' },
    { section: 'Classroom', label: 'Results', icon: 'task', path: '/teacher/results' },
    { section: 'Personal', label: 'My Profile', icon: 'person', path: '/teacher/profile' },
    { section: 'Personal', label: 'Leave Requests', icon: 'time_to_leave', path: '/teacher/leave-requests' },
    { section: 'Personal', label: 'Salary Slips', icon: 'receipt_long', path: '/teacher/salary-slips' },
    { section: 'Personal', label: 'Security', icon: 'security', path: '/teacher/security' },
  ],
  student: [
    { section: 'Overview', label: 'Home', icon: 'home', path: '/student/home' },
    { section: 'Academics', label: 'Timetable', icon: 'calendar_today', path: '/student/timetable' },
    { section: 'Academics', label: 'Homework', icon: 'assignment', path: '/student/homework' },
    { section: 'Academics', label: 'Syllabus Progress', icon: 'menu_book', path: '/student/syllabus' },
    { section: 'Academics', label: 'Results & Insights', icon: 'analytics', path: '/student/results' },
    { section: 'My Record', label: 'Attendance', icon: 'fact_check', path: '/student/attendance' },
    { section: 'My Record', label: 'Fees & Payment', icon: 'payments', path: '/student/fees' },
    { section: 'My Record', label: 'Digital ID', icon: 'badge', path: '/student/digital-id' },
    { section: 'My Record', label: 'Certificates', icon: 'workspace_premium', path: '/student/certificates' },
    { section: 'Calendar', label: 'Academic Calendar', icon: 'date_range', path: '/student/calendar' },
    { section: 'Settings', label: 'Security', icon: 'security', path: '/student/security' },
  ],
  parent: [
    { section: 'Family', label: 'Home', icon: 'home', path: '/parent/home' },
    { section: 'Family', label: 'Timetable', icon: 'calendar_view_week', path: '/parent/timetable' },
    { section: 'Family', label: 'Attendance', icon: 'fact_check', path: '/parent/attendance' },
    { section: 'Family', label: 'Performance', icon: 'insights', path: '/parent/performance' },
    { section: 'Connect', label: 'Messages', icon: 'forum', path: '/parent/messages' },
    { section: 'Connect', label: 'Appointments', icon: 'event', path: '/parent/appointments' },
    { section: 'Connect', label: 'Leave', icon: 'event_available', path: '/parent/leave' },
    { section: 'Records', label: 'Fees & Payment', icon: 'payments', path: '/parent/fees' },
    { section: 'Records', label: 'Certificates', icon: 'workspace_premium', path: '/parent/certificates' },
    { section: 'Calendar', label: 'Academic Calendar', icon: 'date_range', path: '/parent/calendar' },
    { section: 'Settings', label: 'Profile', icon: 'person', path: '/parent/profile' },
    { section: 'Settings', label: 'Security', icon: 'security', path: '/parent/security' },
  ],
  receptionist: [
    { section: 'Front desk', label: "Today's desk", icon: 'desk', path: '/staff/reception' },
    { section: 'Settings', label: 'Security', icon: 'security', path: '/staff/reception#security' },
  ],
  janitor: [
    { section: 'Maintenance', label: 'My Tasks', icon: 'cleaning_services', path: '/staff/tasks' },
    { section: 'Settings', label: 'Security', icon: 'security', path: '/staff/tasks#security' },
  ],
};

export function getDashboardRoleLabel(role: DashboardRole): string {
  return ROLE_LABELS[role];
}

export function mapAuthRoleToDashboardRole(role: string): DashboardRole | null {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'super-admin';
    case 'TENANT_ADMIN':
      return 'tenant-admin';
    case 'BRANCH_ADMIN':
      return 'branch-admin';
    case 'TEACHER':
      return 'teacher';
    case 'STUDENT':
      return 'student';
    case 'PARENT':
      return 'parent';
    case 'RECEPTIONIST':
      return 'receptionist';
    case 'JANITOR':
      return 'janitor';
    default:
      return null;
  }
}

export function getDashboardNavigation(role: DashboardRole): DashboardNavItem[] {
  return DASHBOARD_NAVIGATION[role];
}

export function findNavigationItem(role: DashboardRole, pathname: string): DashboardNavItem | undefined {
  return [...DASHBOARD_NAVIGATION[role]]
    .sort((left, right) => right.path.length - left.path.length)
    .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
}
