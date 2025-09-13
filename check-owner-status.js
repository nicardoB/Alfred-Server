const baseUrl = 'https://alfred-server-production.up.railway.app';

// Test known credentials
const testCredentials = [
  {
    email: 'nick.bhatia@gmail.com',
    password: 'Yqb0IFQGO/RNfIKswJmLoDit2RqsLTDYyPf4jlnBeo0=',
    apiKey: 'ak_2ac14dd361800dbb799bc7553175b1922c3abbcab3852097ab10b18f572140f7'
  },
  {
    email: 'test-check@example.com', 
    password: 'testpass',
    apiKey: 'ak_95e6b79912f42a92d33eb86a3a94dda2fc8ea58aa3bb0a2a85890ec0724ebd48'
  }
];

const checkOwnerAccess = async () => {
  console.log('Checking existing owner accounts...\n');
  
  for (const creds of testCredentials) {
    console.log(`Testing: ${creds.email}`);
    
    // Test API key
    try {
      const apiResponse = await fetch(`${baseUrl}/api/v1/auth/profile`, {
        headers: { 'x-api-key': creds.apiKey }
      });
      
      if (apiResponse.ok) {
        const data = await apiResponse.json();
        console.log('✅ API Key works!');
        console.log('User:', data.user.email);
        console.log('Role:', data.user.role);
        console.log('API Key:', creds.apiKey);
        
        // Test login
        const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: creds.email,
            password: creds.password
          })
        });
        
        if (loginResponse.ok) {
          console.log('✅ Password login works!');
          console.log('Password:', creds.password);
        } else {
          console.log('❌ Password login failed');
        }
        
        console.log('\n=== WORKING OWNER CREDENTIALS ===');
        console.log('Email:', creds.email);
        console.log('Password:', creds.password);
        console.log('API Key:', creds.apiKey);
        console.log('================================\n');
        return;
      } else {
        console.log('❌ API Key failed');
      }
    } catch (error) {
      console.log('❌ Error testing credentials:', error.message);
    }
    
    console.log('---');
  }
  
  console.log('❌ No working owner credentials found');
};

checkOwnerAccess();
