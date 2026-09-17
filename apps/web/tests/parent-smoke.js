import { Selector } from 'testcafe';

fixture `TMS Parent Portal`
    .page `http://localhost:5173/login`;

const parentEmail = process.env.TMS_PARENT_EMAIL;
const parentPassword = process.env.TMS_PARENT_PASSWORD;

test('Parent can switch children and open privacy-scoped workspaces', async t => {
    if (!parentEmail || !parentPassword) {
        await t.expect(Boolean(parentEmail && parentPassword)).ok('Set TMS_PARENT_EMAIL and TMS_PARENT_PASSWORD; this test must not pass without authenticating.');
    }

    await t
        .typeText('#login-email', parentEmail)
        .typeText('#login-password', parentPassword)
        .click('.auth-submit-btn')
        .expect(Selector('h1').withText('Family overview').exists).ok({ timeout: 15000 });

    const activeChild = Selector('.parent-child-tabs button').withAttribute('aria-pressed', 'true');
    await t.expect(activeChild.withText('Aarav Shrestha').exists).ok();

    await t
        .click(Selector('.parent-child-tabs button').withText('Mira Shrestha'))
        .expect(activeChild.withText('Mira Shrestha').exists).ok()
        .expect(Selector('.parent-child-context').withText('Mira Shrestha').exists).ok()
        .expect(Selector('.parent-session').withText('English').exists).ok()
        .expect(Selector('.parent-session').withText('Guitar Fundamentals').exists).notOk();

    await t.navigateTo('http://localhost:5173/parent/messages?child=child-aarav');
    await t
        .expect(Selector('h1').withText('Teacher messages').exists).ok()
        .expect(Selector('.parent-privacy-note').withText('Only teachers assigned to this child').exists).ok()
        .expect(Selector('.parent-teacher-list').withText('Riya Gurung').exists).ok()
        .expect(Selector('.parent-teacher-list').withText('Nima Sherpa').exists).notOk();

    await t.navigateTo('http://localhost:5173/parent/appointments?child=child-aarav');
    await t
        .expect(Selector('select#parent-appointment-target').exists).ok()
        .expect(Selector('button').withText('Send request').exists).ok();

    await t.navigateTo('http://localhost:5173/parent/fees?child=child-aarav');
    await t
        .click(Selector('.parent-fee-hero button').withText('Show Nepal Pay QR'))
        .expect(Selector('[role="dialog"]').withText('Aarav Shrestha').exists).ok()
        .pressKey('esc')
        .expect(Selector('[role="dialog"]').exists).notOk();
});
