/**
 * File Upload Integration Tests - JavaScript Version
 * End-to-end verification of upload lifecycle, security, quota, and edge cases
 */

const axios = require('axios')
const FormData = require('form-data')

// ============================================
// Test Configuration
// ============================================

const API_BASE = 'http://localhost:3000/api'

// Test user credentials (unique per run)
const TEST_USERS = {
  user1: {
    email: 'upload_test_user1_' + Date.now() + '@example.com',
    name: 'Upload Test User 1',
    password: 'TestPassword@123',
  },
  user2: {
    email: 'upload_test_user2_' + Date.now() + '@example.com',
    name: 'Upload Test User 2',
    password: 'TestPassword@456',
  },
}

// Test tokens
let accessTokens = {}

// ============================================
// Helper Functions
// ============================================

function logTest(name, passed, details) {
  const status = passed ? '✅' : '❌'
  console.log(`${status} ${name}`)
  if (details) {
    console.log(`   ${details}`)
  }
}

/**
 * Create mock PDF buffer with valid header
 */
function createMockPdf(sizeKb = 100) {
  const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]) // %PDF
  const padding = Buffer.alloc(Math.max(0, sizeKb * 1024 - 4))
  return Buffer.concat([pdfHeader, padding])
}

/**
 * Create mock DOCX buffer with valid ZIP header
 */
function createMockDocx(sizeKb = 100) {
  const docxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]) // ZIP
  const padding = Buffer.alloc(Math.max(0, sizeKb * 1024 - 4))
  return Buffer.concat([docxHeader, padding])
}

/**
 * Create fake PDF file (invalid header)
 */
function createFakePdf() {
  return Buffer.from('This is not a real PDF')
}

/**
 * Register and login test user
 */
async function setupTestUser(userKey) {
  try {
    const user = TEST_USERS[userKey]

    // Register
    await axios.post(`${API_BASE}/auth/register`, {
      email: user.email,
      name: user.name,
      password: user.password,
    })

    // Login
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: user.email,
      password: user.password,
    })

    if (response.status === 200 && response.data?.data?.accessToken) {
      accessTokens[userKey] = response.data.data.accessToken
      console.log(`✅ Setup: User ${userKey} registered and logged in`)
      return true
    } else {
      console.log(`❌ Setup: Failed to login user ${userKey}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Setup: Error with user ${userKey}:`, error.message)
    return false
  }
}

// ============================================
// Test Suite
// ============================================

async function runTests() {
  console.log(
    '╔════════════════════════════════════════════════════════════╗'
  )
  console.log(
    '║   FILE UPLOAD INTEGRATION TEST SUITE                       ║'
  )
  console.log(
    '╚════════════════════════════════════════════════════════════╝\n'
  )

  let testsPassed = 0
  let testsFailed = 0

  // Setup test users
  console.log('📝 SETUP PHASE\n')
  const user1Setup = await setupTestUser('user1')
  const user2Setup = await setupTestUser('user2')

  if (!user1Setup || !user2Setup) {
    console.log('\n❌ Setup failed. Cannot proceed with tests.')
    return
  }

  // ============================================
  // Test 1: Upload Valid PDF
  // ============================================

  console.log('\n📝 TEST 1: Upload Valid PDF\n')
  try {
    const pdfBuffer = createMockPdf(100) // 100 KB
    const form = new FormData()
    form.append('file', pdfBuffer, 'Resume.pdf')

    const response = await axios.post(`${API_BASE}/resumes/upload`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${accessTokens.user1}`,
      },
    })

    if (response.status === 201 && response.data?.data?.resumeId) {
      logTest(
        'Upload valid PDF',
        true,
        `resumeId: ${response.data.data.resumeId.substring(0, 12)}...`
      )
      testsPassed++
    } else {
      logTest('Upload valid PDF', false, `Unexpected status: ${response.status}`)
      testsFailed++
    }
  } catch (error) {
    logTest('Upload valid PDF', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 2: Upload Valid DOCX
  // ============================================

  console.log('\n📝 TEST 2: Upload Valid DOCX\n')
  try {
    const docxBuffer = createMockDocx(150) // 150 KB
    const form = new FormData()
    form.append('file', docxBuffer, 'Resume.docx')

    const response = await axios.post(`${API_BASE}/resumes/upload`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${accessTokens.user1}`,
      },
    })

    if (response.status === 201 && response.data?.data?.resumeId) {
      logTest(
        'Upload valid DOCX',
        true,
        `resumeId: ${response.data.data.resumeId.substring(0, 12)}...`
      )
      testsPassed++
    } else {
      logTest('Upload valid DOCX', false, `Unexpected status: ${response.status}`)
      testsFailed++
    }
  } catch (error) {
    logTest('Upload valid DOCX', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 3: List Resumes
  // ============================================

  console.log('\n📝 TEST 3: List Resumes\n')
  try {
    const response = await axios.get(`${API_BASE}/resumes`, {
      headers: {
        Authorization: `Bearer ${accessTokens.user1}`,
      },
    })

    if (response.status === 200 && response.data?.data?.resumes?.length >= 2) {
      logTest(
        'List resumes',
        true,
        `Found ${response.data.data.resumes.length} resumes`
      )
      testsPassed++
    } else {
      logTest(
        'List resumes',
        false,
        `Resumes: ${response.data?.data?.resumes?.length || 0}`
      )
      testsFailed++
    }
  } catch (error) {
    logTest('List resumes', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 4: Get Quota Info
  // ============================================

  console.log('\n📝 TEST 4: Get Quota Info\n')
  try {
    const response = await axios.get(`${API_BASE}/resumes/quota/info`, {
      headers: {
        Authorization: `Bearer ${accessTokens.user1}`,
      },
    })

    if (response.status === 200 && response.data?.data?.quotaLimit) {
      const { quotaLimit, quotaUsed, quotaRemaining } = response.data.data
      logTest(
        'Get quota info',
        true,
        `Limit: ${quotaLimit}, Used: ${quotaUsed}, Remaining: ${quotaRemaining}`
      )
      testsPassed++
    } else {
      logTest('Get quota info', false, `Status: ${response.status}`)
      testsFailed++
    }
  } catch (error) {
    logTest('Get quota info', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 5: Verify Authentication Required
  // ============================================

  console.log('\n📝 TEST 5: Verify Authentication Required\n')
  try {
    const response = await axios.get(`${API_BASE}/resumes`).catch((e) => e.response)

    if (response.status === 401) {
      logTest(
        'Authentication required',
        true,
        'Correctly rejected unauthenticated request'
      )
      testsPassed++
    } else {
      logTest(
        'Authentication required',
        false,
        `Expected 401, got: ${response.status}`
      )
      testsFailed++
    }
  } catch (error) {
    logTest('Authentication required', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 6: Reject Oversized Files
  // ============================================

  console.log('\n📝 TEST 6: Reject Oversized Files (> 10 MB)\n')
  try {
    const largeBuffer = createMockPdf(11000) // 11 MB
    const form = new FormData()
    form.append('file', largeBuffer, 'Large.pdf')

    const response = await axios
      .post(`${API_BASE}/resumes/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${accessTokens.user1}`,
        },
      })
      .catch((e) => e.response)

    if (response.status === 400) {
      logTest('Reject oversized files', true, `Correctly rejected 11 MB file`)
      testsPassed++
    } else {
      logTest('Reject oversized files', false, `Expected 400, got: ${response.status}`)
      testsFailed++
    }
  } catch (error) {
    logTest('Reject oversized files', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 7: Reject Malformed PDF
  // ============================================

  console.log('\n📝 TEST 7: Reject Malformed PDF (Invalid Header)\n')
  try {
    const fakeBuffer = createFakePdf()
    const form = new FormData()
    form.append('file', fakeBuffer, 'Fake.pdf')

    const response = await axios
      .post(`${API_BASE}/resumes/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${accessTokens.user1}`,
        },
      })
      .catch((e) => e.response)

    if (response.status === 400) {
      logTest('Reject malformed PDF', true, `Correctly rejected invalid header`)
      testsPassed++
    } else {
      logTest('Reject malformed PDF', false, `Expected 400, got: ${response.status}`)
      testsFailed++
    }
  } catch (error) {
    logTest('Reject malformed PDF', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 8: Reject Unsupported File Type
  // ============================================

  console.log('\n📝 TEST 8: Reject Unsupported File Type\n')
  try {
    const textBuffer = Buffer.from('This is a text file')
    const form = new FormData()
    form.append('file', textBuffer, 'Resume.txt')

    const response = await axios
      .post(`${API_BASE}/resumes/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${accessTokens.user1}`,
        },
      })
      .catch((e) => e.response)

    if (response.status === 400) {
      logTest('Reject unsupported file type', true, `Correctly rejected .txt file`)
      testsPassed++
    } else {
      logTest(
        'Reject unsupported file type',
        false,
        `Expected 400, got: ${response.status}`
      )
      testsFailed++
    }
  } catch (error) {
    logTest('Reject unsupported file type', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 9: Verify Unauthorized File Access
  // ============================================

  console.log('\n📝 TEST 9: Verify Unauthorized File Access\n')
  try {
    // Get first resume ID from user1
    const listResponse = await axios.get(`${API_BASE}/resumes`, {
      headers: { Authorization: `Bearer ${accessTokens.user1}` },
    })

    const resumeId = listResponse.data?.data?.resumes?.[0]?.resumeId

    if (!resumeId) {
      logTest('Unauthorized file access', false, 'Could not get resume ID')
      testsFailed++
    } else {
      // Try to access as user2
      const response = await axios
        .get(`${API_BASE}/resumes/${resumeId}`, {
          headers: { Authorization: `Bearer ${accessTokens.user2}` },
        })
        .catch((e) => e.response)

      if (response.status === 403) {
        logTest(
          'Unauthorized file access',
          true,
          'Correctly rejected cross-user access'
        )
        testsPassed++
      } else {
        logTest(
          'Unauthorized file access',
          false,
          `Expected 403, got: ${response.status}`
        )
        testsFailed++
      }
    }
  } catch (error) {
    logTest('Unauthorized file access', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 10: Filename Sanitization
  // ============================================

  console.log('\n📝 TEST 10: Filename Sanitization (Special Characters)\n')
  try {
    const pdfBuffer = createMockPdf(50)
    const form = new FormData()
    form.append('file', pdfBuffer, 'Resume@#$%^&().pdf')

    const response = await axios
      .post(`${API_BASE}/resumes/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${accessTokens.user1}`,
        },
      })
      .catch((e) => e.response)

    if (response.status === 201) {
      const fileName = response.data?.data?.fileName
      // Special characters should be replaced with underscores
      if (!fileName?.match(/[@#$%^&()]/)) {
        logTest(
          'Filename sanitization',
          true,
          `Special chars removed: ${fileName}`
        )
        testsPassed++
      } else {
        logTest(
          'Filename sanitization',
          false,
          `Special chars not removed: ${fileName}`
        )
        testsFailed++
      }
    } else {
      logTest('Filename sanitization', false, `Upload failed: ${response.status}`)
      testsFailed++
    }
  } catch (error) {
    logTest('Filename sanitization', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test 11: Soft Delete Resume
  // ============================================

  console.log('\n📝 TEST 11: Soft Delete Resume\n')
  try {
    // Get a resume ID to delete
    const listResponse = await axios.get(`${API_BASE}/resumes`, {
      headers: { Authorization: `Bearer ${accessTokens.user1}` },
    })

    const resumeId = listResponse.data?.data?.resumes?.[0]?.resumeId

    if (!resumeId) {
      logTest('Soft delete resume', false, 'Could not get resume ID')
      testsFailed++
    } else {
      const response = await axios.delete(`${API_BASE}/resumes/${resumeId}`, {
        headers: { Authorization: `Bearer ${accessTokens.user1}` },
      })

      if (response.status === 200) {
        logTest('Soft delete resume', true, `Resume deleted successfully`)
        testsPassed++
      } else {
        logTest('Soft delete resume', false, `Expected 200, got: ${response.status}`)
        testsFailed++
      }
    }
  } catch (error) {
    logTest('Soft delete resume', false, `Error: ${error.message}`)
    testsFailed++
  }

  // ============================================
  // Test Results
  // ============================================

  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║   TEST RESULTS SUMMARY                                     ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  const total = testsPassed + testsFailed
  const percentage = total > 0 ? ((testsPassed / total) * 100).toFixed(1) : '0'

  console.log(`Total Tests: ${total}`)
  console.log(`Passed: ${testsPassed} ✅`)
  console.log(`Failed: ${testsFailed} ❌`)
  console.log(`Coverage: ${percentage}%\n`)

  console.log('╔════════════════════════════════════════════════════════════╗')
  if (testsFailed === 0 && testsPassed > 0) {
    console.log('║   ✅ GO - FILE UPLOAD MODULE VERIFIED                       ║')
  } else if (testsFailed <= 2) {
    console.log('║   ⚠️  CAUTION - Review failures before deployment          ║')
  } else {
    console.log('║   ❌ STOP - Fix failures before proceeding                  ║')
  }
  console.log('╚════════════════════════════════════════════════════════════╝\n')
}

// Run tests
runTests().catch(console.error)
