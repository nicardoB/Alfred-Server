import crypto from 'crypto';

// Generate a secure password
const generateSecurePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 24; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const baseUrl = 'https://alfred-server-production.up.railway.app';
const setupKey = '24a0783d8ffe5aa024b082d98659b67fd0cef227e19d0dfdb930d8b4d56a53a7';

const createSecureOwner = async () => {
  const securePassword = generateSecurePassword();
  const ownerEmail = 'nick.bhatia@gmail.com';
  
  console.log('Creating secure owner account...');
  console.log('Email:', ownerEmail);
  console.log('Generated secure password:', securePassword);
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/setup-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        password: securePassword,
        setupKey: setupKey
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('\n✅ SECURE OWNER ACCOUNT CREATED SUCCESSFULLY!');
      console.log('==========================================');
      console.log('Email:', ownerEmail);
      console.log('Password:', securePassword);
      console.log('API Key:', data.apiKey);
      console.log('==========================================');
      console.log('⚠️  SAVE THESE CREDENTIALS SECURELY - THEY WILL NOT BE SHOWN AGAIN!');
      
      // Test the credentials
      console.log('\nTesting login...');
      const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ownerEmail,
          password: securePassword
        })
      });
      
      if (loginResponse.ok) {
        console.log('✅ Login test successful!');
      } else {
        console.log('❌ Login test failed');
      }
      
    } else {
      console.log('❌ Failed to create owner account:', data);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

createSecureOwner();
