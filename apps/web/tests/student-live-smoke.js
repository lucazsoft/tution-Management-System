import { ClientFunction, Selector } from 'testcafe';

fixture `TMS Student Live Portal`
  .page `http://localhost:5173/login`;

const studentEmail = process.env.TMS_STUDENT_EMAIL;
const studentPassword = process.env.TMS_STUDENT_PASSWORD;
const hasHorizontalOverflow = ClientFunction(() => document.documentElement.scrollWidth > window.innerWidth);

test('Student portal is account-scoped, live, responsive, and theme-aware', async t => {
  if (!studentEmail || !studentPassword) {
    await t.expect(Selector('#login-email').value).eql('');
    return;
  }

  await t
    .resizeWindow(1280, 800)
    .typeText('#login-email', studentEmail)
    .typeText('#login-password', studentPassword)
    .click('.auth-submit-btn')
    .expect(Selector('.student-portal').exists).ok({ timeout: 15000 })
    .expect(Selector('.student-page-header').withText('Anisha').exists).ok()
    .expect(Selector('.student-portal').withText('Aarav Shrestha').exists).notOk()
    .expect(Selector('.student-sync').withText('Loaded').exists).ok()
    .expect(Selector('.student-card').withText('No classes today').exists).ok();

  const themeButton = Selector('button[aria-label^="Switch to dark mode"]');
  await t
    .expect(themeButton.count).eql(1)
    .click(themeButton)
    .expect(Selector('html').getAttribute('data-theme')).eql('dark')
    .expect(Selector('.student-card').getStyleProperty('background-color')).notEql('rgb(245, 247, 250)');

  await t
    .navigateTo('http://localhost:5173/student/fees')
    .expect(Selector('.student-empty').withText('No invoices issued').exists).ok()
    .navigateTo('http://localhost:5173/student/notifications')
    .expect(Selector('.student-empty').withText('All caught up').exists).ok()
    .resizeWindow(375, 812)
    .navigateTo('http://localhost:5173/student/digital-id')
    .expect(Selector('.student-digital-id').withText('Anisha Poudel').exists).ok()
    .expect(Selector('.student-digital-id').withText('Pinnacle Demo Academy').exists).ok()
    .expect(Selector('.student-digital-id').withText('Official student identification').exists).ok()
    .expect(Selector('.student-digital-id').withText('Enrollment ID').exists).ok()
    .expect(hasHorizontalOverflow()).notOk();

  await t
    .resizeWindow(768, 900)
    .expect(hasHorizontalOverflow()).notOk()
    .resizeWindow(1280, 900)
    .expect(hasHorizontalOverflow()).notOk();
});
