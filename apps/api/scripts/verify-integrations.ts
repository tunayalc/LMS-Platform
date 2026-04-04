import dotenv from 'dotenv';
import { MattermostService } from '../src/services/mattermost';
import { LdapService } from '../src/services/ldap';
import { JitsiService } from '../src/services/jitsi';
import { EmailService } from '../src/services/email';

dotenv.config();

async function verifyIntegrations() {
    console.log('🔍 Entegrasyon Doğrulama Başlatılıyor...\n');

    // 1. Mattermost Verification
    console.log('--- Mattermost Kontrolü ---');
    try {
        const config = MattermostService.getConfig();
        if (config.webhookUrl) {
            console.log('✅ Mattermost: Webhook MEVCUT');
            console.log('   URL:', config.webhookUrl.substring(0, 40) + '...');
        } else if (config.serverUrl && config.accessToken) {
            const user = await MattermostService.getMe();
            console.log('✅ Bağlantı BAŞARILI! Bot Kullanıcısı:', user.username);
        } else {
            console.log('⚠️  Mattermost: Yapılandırma Eksik');
        }
    } catch (error: any) {
        console.log('⚠️  Mattermost:', error.message);
    }

    // 2. Google Workspace Verification
    console.log('\n--- Google Workspace Kontrolü ---');
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        console.log('✅ Google Config: MEVCUT');
    } else {
        console.log('⚠️  Google: Yapılandırma BEKLENİYOR (GOOGLE_CLIENT_ID/SECRET eksik)');
    }

    // 3. Jitsi Meet Verification
    console.log('\n--- Jitsi Meet Kontrolü ---');
    const jitsiConfig = JitsiService.getConfig();
    if (jitsiConfig.appId && jitsiConfig.privateKeyPath) {
        try {
            const url = JitsiService.generateMeetingUrl('test-room', {
                name: 'Test User',
                email: 'test@test.com',
                moderator: true
            });
            console.log('✅ Jitsi JaaS: Konfigürasyon MEVCUT');
            console.log('   Domain:', jitsiConfig.domain);
            console.log('   App ID:', jitsiConfig.appId.substring(0, 30) + '...');
        } catch (e: any) {
            console.log('❌ Jitsi: URL Üretme Hatası', e.message);
        }
    } else {
        console.log('⚠️  Jitsi: JWT yapılandırması yok (public link kullanılacak)');
        console.log('   Domain:', jitsiConfig.domain);
    }

    // 4. Email Service Verification
    console.log('\n--- SMTP Email Kontrolü ---');
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        console.log('✅ SMTP: Yapılandırma MEVCUT (' + process.env.SMTP_HOST + ')');
        console.log('   (Gerçek gönderim testi için API kullanılmalıdır)');
    } else {
        console.log('⚠️  SMTP: Yapılandırma Eksik (SMTP_HOST/USER/PASS)');
    }

    // 5. Microsoft 365 Verification
    console.log('\n--- Microsoft 365 Kontrolu ---');
    const msMode = (process.env.MICROSOFT_MODE || '').toLowerCase();
    if (msMode === 'mock') {
        console.log('? Microsoft 365: MOCK modunda');
    } else if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
        console.log('? Microsoft 365: Yapilandirma MEVCUT');
    } else {
        console.log('??  Microsoft 365: Yapilandirma Eksik (MICROSOFT_CLIENT_ID/SECRET)');
    }


    // 5. LDAP Verification
    console.log('\n--- LDAP Kontrolü ---');
    if (process.env.LDAP_URL) {
        try {
            const ldapTest = await LdapService.testConnection();
            if (ldapTest.success) {
                console.log('✅ LDAP: BAĞLI (' + ldapTest.message + ')');
            } else {
                console.log('⚠️  LDAP: Bağlantı Başarısız (' + ldapTest.message + ')');
                console.log('   -> Mock sunucuyu çalıştırdınız mı? (npm run mock:ldap)');
            }
        } catch (e) {
            console.log('❌ LDAP: Hata', e);
        }
    } else {
        console.log('⚠️  LDAP: Yapılandırma Yok');
    }

    console.log('\n----------------------------------------');
    console.log('✅ DOĞRULAMA TAMAMLANDI.');
}

verifyIntegrations().catch(console.error);
