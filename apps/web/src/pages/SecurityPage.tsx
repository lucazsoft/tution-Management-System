import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { AccountLayout, AccountSection } from '../components/AccountLayout';

export function SecurityPage() {
  return <AccountLayout title="Security settings" description="Manage your account password and sign-in security.">
    <AccountSection title="Password" description="Choose a unique password to protect your account."><ChangePasswordForm /></AccountSection>
  </AccountLayout>;
}
