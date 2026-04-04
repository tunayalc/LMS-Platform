const REG_URL = 'http://localhost:59139/auth/register';
const FORGOT_URL = 'http://localhost:59139/auth/forgot-password';

async function test() {
    const username = 'testtuna_' + Date.now();
    console.log(`--- Registering User: ${username} ---`);

    try {
        const regRes = await fetch(REG_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                password: 'Password123!',
                email: 'ytunahan7878@gmail.com',
                role: 'Student'
            })
        });
        console.log('Register Status:', regRes.status);
        const regData = await regRes.json();
        console.log('Register Body:', regData);
    } catch (e) {
        console.error('Register failed:', e);
    }

    console.log('\n--- Requesting Password Reset ---');
    try {
        const resetRes = await fetch(FORGOT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'ytunahan7878@gmail.com'
            })
        });
        console.log('Reset Status:', resetRes.status);
        const resetData = await resetRes.json();
        console.log('Reset Body:', resetData);
    } catch (e) {
        console.error('Reset failed:', e);
    }
}

test();
