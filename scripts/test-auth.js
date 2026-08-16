#!/usr/bin/env node

const http = require('http');

let accessToken = '';
let refreshToken = '';

// Test endpoint function
function testEndpoint(method, path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: defaultHeaders
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        console.log(`\n[${method} ${path}]`);
        console.log(`Status: ${res.statusCode}`);
        try {
          const parsed = JSON.parse(responseData);
          console.log('Response:', JSON.stringify(parsed, null, 2));
          resolve({ data: parsed, status: res.statusCode });
        } catch (e) {
          console.log('Response:', responseData);
          resolve({ data: responseData, status: res.statusCode });
        }
      });
    });

    req.on('error', (e) => {
      console.error(`Error: ${e.message}`);
      reject(e);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Run tests
async function runTests() {
  console.log('Testing Authentication Endpoints...\n');

  // Test 1: Register
  console.log('=== TEST 1: Register New User ===');
  const reg1 = await testEndpoint('POST', '/api/auth/register', {
    email: 'jane@example.com',
    name: 'Jane Doe',
    password: 'Secure123!@'
  });

  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Test 2: Register same email (should fail)
  console.log('\n=== TEST 2: Register Duplicate Email ===');
  await testEndpoint('POST', '/api/auth/register', {
    email: 'jane@example.com',
    name: 'Jane Smith',
    password: 'Another123!@'
  });

  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Test 3: Login with correct credentials
  console.log('\n=== TEST 3: Login with Correct Credentials ===');
  const login = await testEndpoint('POST', '/api/auth/login', {
    email: 'jane@example.com',
    password: 'Secure123!@'
  });

  if (login.data.data) {
    accessToken = login.data.data.accessToken;
    refreshToken = login.data.data.refreshToken;
  }

  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Test 4: Login with incorrect password
  console.log('\n=== TEST 4: Login with Incorrect Password ===');
  await testEndpoint('POST', '/api/auth/login', {
    email: 'jane@example.com',
    password: 'WrongPassword123!@'
  });

  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Test 5: Get Profile (with valid token)
  console.log('\n=== TEST 5: Get Profile with Valid Token ===');
  if (accessToken) {
    await testEndpoint('GET', '/api/auth/profile', null, {
      'Authorization': `Bearer ${accessToken}`
    });
  } else {
    console.log('Skipping profile test - no access token');
  }

  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Test 6: Get Profile (without token)
  console.log('\n=== TEST 6: Get Profile without Token ===');
  await testEndpoint('GET', '/api/auth/profile', null);

  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Test 7: Refresh Token
  console.log('\n=== TEST 7: Refresh Access Token ===');
  if (refreshToken) {
    const refresh = await testEndpoint('POST', '/api/auth/refresh-token', {
      refreshToken: refreshToken
    });
    if (refresh.data.data) {
      accessToken = refresh.data.data.accessToken;
    }
  } else {
    console.log('Skipping refresh test - no refresh token');
  }

  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Test 8: Logout
  console.log('\n=== TEST 8: Logout ===');
  if (refreshToken) {
    await testEndpoint('POST', '/api/auth/logout', {
      refreshToken: refreshToken
    });
  } else {
    console.log('Skipping logout test - no refresh token');
  }

  console.log('\n\n✅ All tests completed!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

