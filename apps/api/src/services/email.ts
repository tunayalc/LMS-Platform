/**
 * Email Service using Nodemailer
 * Handles system notifications, password resets, and welcome emails.
 */

import nodemailer from "nodemailer";

const isSmtpConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

// Lazy load transporter to ensure process.env is ready (fix for initialization order)
let _transporter: nodemailer.Transporter | null = null;
const getTransporter = () => {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: { rejectUnauthorized: false },
      debug: true
    });
    console.log(`[EmailService] Initialized with User: ${process.env.SMTP_USER}`);
  }
  return _transporter;
};

export const EmailService = {
  // transporter removed in favor of getTransporter()
  // Debug log to verify config loading
  _debug: console.log(`[EmailService] Configured with Host: ${process.env.SMTP_HOST}, User: ${process.env.SMTP_USER}`),

  sendMail: async (to: string, subject: string, html: string) => {
    if (!isSmtpConfigured()) {
      console.warn("SMTP settings missing. Email not sent.");
      console.log(`[MOCK EMAIL] To: ${to}, Subject: ${subject}`);
      return false;
    }

    try {
      const info = await getTransporter().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || '"LMS System" <noreply@lms.local>',
        to,
        subject,
        html
      });
      console.log("Email sent:", info.messageId);
      return true;
    } catch (error) {
      console.error("Email error:", error);
      return false;
    }
  },

  sendPasswordReset: async (email: string, token: string) => {
    // FORCE PRODUCTION DOMAIN
    const baseUrl = "https://lms.tunayalcin.site";
    const resetLink = `${baseUrl}/auth/reset-password?token=${token}&email=${email}`;
    const html = `
      <h3>Sifre Sifirlama Istegi</h3>
      <p>Hesabiniz icin sifre sifirlama talebi aldik.</p>
      <p>Asagidaki baglantiya tiklayarak sifrenizi yenileyebilirsiniz:</p>
      <a href="${resetLink}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Sifremi Sifirla</a>
      <p><small>Bu istegi siz yapmadiysaniz lutfen dikkate almayin.</small></p>
    `;
    return EmailService.sendMail(email, "Sifre Sifirlama", html);
  },

  sendEmailVerification: async (email: string, token: string) => {
    // FORCE PRODUCTION DOMAIN
    const baseUrl = "https://lms.tunayalcin.site";
    const verifyLink = `${baseUrl}/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

    // ALWAYS LOG LINK FOR DEBUGGING
    console.log("=====================================================");
    console.log(`[VERIFICATION LINK] For ${email}:`);
    console.log(verifyLink);
    console.log("=====================================================");
    const html = `
      <h3>Email Dogrulama</h3>
      <p>Hesabinizi aktiflestirmek icin emailinizi dogrulamaniz gerekiyor.</p>
      <a href="${verifyLink}" style="padding: 10px 20px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 5px;">Emaili Dogrula</a>
      <p><small>Bu istegi siz yapmadiysaniz lutfen dikkate almayin.</small></p>
    `;
    return EmailService.sendMail(email, "Email Dogrulama", html);
  },

  sendWelcome: async (email: string, username: string) => {
    const html = `
      <h3>Hosgeldiniz, ${username}!</h3>
      <p>LMS sistemine kaydiniz basariyla olusturuldu.</p>
      <p>Egitim hayatinizda basarilar dileriz.</p>
    `;
    return EmailService.sendMail(email, "Hosgeldiniz!", html);
  }
};
