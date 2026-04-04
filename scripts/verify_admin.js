
const fetch = require('node-fetch');

async function checkAdmin() {
    try {
        const response = await fetch('http://localhost:3001/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
        });

        if (!response.ok) {
            console.error('Admin Login Failed:', response.status);
            return;
        }

        const data = await response.json();
        console.log('Admin Login Success!');
        console.log('Role:', data.user.role);
    } catch (error) {
        console.error('Network Error:', error);
    }
}

checkAdmin();
