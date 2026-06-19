const { Resend } = require('resend');

const resend = new Resend('re_ch4EDQ1Z_CjDk9Az3mYTb2wWuTNnE6urk');

async function sendTestEmail() {
    try {
        console.log('📤 Sending test email...');
        
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: ['alihariaz918@gmail.com'],
            subject: 'Hello World',
            html: '<p>Congrats on sending your <strong>first email</strong>!</p>'
        });

        if (error) {
            console.error('❌ Error:', error);
            return;
        }

        console.log('✅ Email sent!');
        console.log('📨 Data:', data);
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

sendTestEmail();