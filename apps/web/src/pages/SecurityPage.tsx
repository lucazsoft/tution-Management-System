import { useLocation } from 'react-router-dom';
import { TwoStepSettings } from '../components/TwoStepSettings';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { AccountLayout, AccountSection } from '../components/AccountLayout';

export function SecurityPage() {
  const { pathname } = useLocation();
  const accountPath = /^\/(tenant|branch|teacher|staff|parent|student)\/security$/.test(pathname) ? pathname.replace(/security$/, 'account') : undefined;
  return <AccountLayout title="Security settings" description="Manage your account password and sign-in security.">
    {accountPath && <TwoStepSettings accountPath={accountPath} />}
    <AccountSection title="Password" description="Choose a unique password to protect your account."><ChangePasswordForm /></AccountSection>
  </AccountLayout>;
}
