#!/usr/bin/env node

const http = require('http');
const crypto = require('crypto');

let refreshToken = '';
let userId = '';

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
        try {
          const parsed = JSON.parse(responseData);
          resolve({ data: parsed, status: res.statusCode, raw: responseData });
        } catch (e) {
          resolve({ data: responseData, status: res.statusCode, raw: responseData });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runDebugTests() {
  console.log('=== REFRESH TOKEN LIFECYCLE DEBUG ===\n');

  // Test 1: Register unique user
  const email = `testuser_${Date.now()}@example.com`;
  console.log(`1. REGISTER (${email})`);
  const regRes = await testEndpoint('POST', '/api/auth/register', {
    email: email,
    name: 'Test User',
    password: 'Secure123!@'
  });
  if (regRes.status === 201) {
    userId = regRes.data.data.id;
    console.log(`   ✅ Registered user: ${userId}`);
  } else {
    console.log(`   ❌ Failed: ${regRes.status}`);
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 2: Login
  console.log(`\n2. LOGIN`);
  const loginRes = await testEndpoint('POST', '/api/auth/login', {
    email: email,
    password: 'Secure123!@'
  });
  if (loginRes.status === 200) {
    refreshToken = loginRes.data.data.refreshToken;
    console.log(`   ✅ Login successful`);
    console.log(`   Refresh Token (from response): ${refreshToken}`);
    console.log(`   Length: ${refreshToken.length} characters`);
    console.log(`   First 20 chars: ${refreshToken.substring(0, 20)}`);
  } else {
    console.log(`   ❌ Failed: ${loginRes.status}`);
    console.log(`   Response:`, loginRes.data);
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 3: Hash the token like the backend does
  console.log(`\n3. VERIFY TOKEN HASHING`);
  const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  console.log(`   Original token: ${refreshToken}`);
  console.log(`   Hashed token:   ${hashedToken}`);
  console.log(`   Hash length: ${hashedToken.length} characters`);

  await new Promise(r => setTimeout(r, 500));

  // Test 4: Try to refresh with correct token
  console.log(`\n4. REFRESH TOKEN (correct token)`);
  console.log(`   Sending: ${refreshToken}`);
  const refreshRes = await testEndpoint('POST', '/api/auth/refresh-token', {
    refreshToken: refreshToken
  });
  console.log(`   Status: ${refreshRes.status}`);
  if (refreshRes.status === 200) {
    console.log(`   ✅ Refresh successful`);
    console.log(`   New Access Token:`, refreshRes.data.data.accessToken.substring(0, 50) + '...');
  } else {
    console.log(`   ❌ Refresh failed`);
    console.log(`   Response:`, JSON.stringify(refreshRes.data, null, 2));
  }

  await new Promise(r => setTimeout(r, 500));

  // Test 5: Query database directly
  console.log(`\n5. DATABASE VERIFICATION`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Checking refresh_tokens table...`);
  
  const { exec } = require('child_process');
  const dbCmd = `docker exec resumeiq_postgres psql -U resumeiq_user -d resumeiq -c "SELECT id, token, isRevoked, expiresAt > NOW() as isValid FROM refresh_tokens WHERE userId = '${userId}' ORDER BY createdAt DESC LIMIT 1;" 2>&1`;
  
  exec(dbCmd, (error, stdout, stderr) => {
    if (error) {
      console.log(`   ❌ Database query failed: ${error.message}`);
    } else {
      console.log(stdout);
    }

    console.log('\n=== ANALYSIS ===');
    console.log('If refresh failed:');
    console.log('1. Check if database has tokens for this user');
    console.log('2. Verify token hashing is consistent');
    console.log('3. Check if token string contains extra spaces or encoding issues');
    console.log('4. Verify database connection and refresh_tokens table structure');
    
    process.exit(0);
  });
}

runDebugTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
