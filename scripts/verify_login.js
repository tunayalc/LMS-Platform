
const fetch = require('node-fetch');

async function checkLogin() {
    try {
        const response = await fetch('http://localhost:3001/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'hoca', password: 'Deneme123.' })
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('Login Failed:', response.status, text);
            return;
        }

        const data = await response.json();
        console.log('Login Success!');
        console.log('User ID:', data.user.id);
        console.log('User Role:', data.user.role);
        console.log('Full User Object:', JSON.stringify(data.user, null, 2));

    } catch (error) {
        console.error('Network Error:', error);
    }
}

checkLogin();
