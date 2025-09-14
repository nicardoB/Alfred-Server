# Alfred Chat Production Test Plan

## Pre-Deployment Checklist

### Environment Setup
- [ ] Alfred-Server running on Railway (production)
- [ ] Alfred-Chat development server ready
- [ ] Owner account credentials available
- [ ] Safety guards enabled and configured

## Test Cases

### 1. Authentication & Security
**Objective**: Verify secure login and role-based access

**Test Steps:**
1. **Login Flow**
   - [ ] Navigate to Alfred-Chat login page
   - [ ] Enter owner credentials (nick.bhatia@gmail.com)
   - [ ] Verify successful authentication
   - [ ] Check JWT token storage in localStorage
   - [ ] Verify user profile data loaded

2. **Authentication Persistence**
   - [ ] Refresh browser page
   - [ ] Verify user remains logged in
   - [ ] Check token validation on page reload

3. **Logout Flow**
   - [ ] Click logout button
   - [ ] Verify token removed from localStorage
   - [ ] Confirm redirect to login page

**Expected Results:**
- Secure authentication with production Alfred-Server
- Proper token management and persistence
- Clean logout process

---

### 2. Safety Guards Integration
**Objective**: Verify multi-layer protection prevents cost overruns

**Test Steps:**
1. **Rate Limiter (10 requests/minute)**
   - [ ] Send 5 quick messages (should work)
   - [ ] Send 10+ rapid messages
   - [ ] Verify rate limiting kicks in with clear error message
   - [ ] Wait 1 minute, verify requests allowed again

2. **Dev Safeguards (50 requests OR $5/session)**
   - [ ] Check initial session status (0 requests, $0 cost)
   - [ ] Send 10 messages, verify counter increments
   - [ ] Check session cost tracking
   - [ ] Verify warning at 40+ requests or $4+ cost

3. **Server Cost Integration**
   - [ ] Verify real-time cost display in UI
   - [ ] Check cost updates after each message
   - [ ] Test cost threshold warnings (if approaching limits)

**Expected Results:**
- Rate limiting blocks excessive requests
- Dev safeguards track session usage accurately
- Real-time cost display updates correctly
- Clear warning messages for approaching limits

---

### 3. Smart Routing & Model Selection
**Objective**: Test intelligent model routing and cost optimization

**Test Steps:**
1. **Default Routing (GPT-4o Mini)**
   - [ ] Send simple query: "Hello, how are you?"
   - [ ] Verify response from GPT-4o Mini
   - [ ] Check cost tracking (should be ~$0.001-0.005)

2. **Complex Reasoning Detection**
   - [ ] Send complex query: "Analyze the pros and cons of renewable energy vs nuclear power, considering economic, environmental, and political factors"
   - [ ] Verify routing decision (should route to appropriate model)
   - [ ] Check response quality and cost

3. **Code Detection**
   - [ ] Send code query: "Write a Python function to sort a list"
   - [ ] Verify routing to appropriate provider
   - [ ] Check code quality in response

4. **Model Switching Test**
   - [ ] Send variety of queries (simple, complex, code)
   - [ ] Monitor routing decisions in server logs
   - [ ] Verify cost differences between models

**Expected Results:**
- Simple queries use cheapest model (GPT-4o Mini)
- Complex queries route to appropriate model
- Code queries route to code-specialized provider
- Cost tracking reflects actual model usage

---

### 4. Real-Time Cost Tracking
**Objective**: Verify WebSocket cost updates and UI synchronization

**Test Steps:**
1. **Initial Cost Display**
   - [ ] Login and verify initial cost display
   - [ ] Check session cost starts at $0.00
   - [ ] Verify total cost display (if any previous usage)

2. **Real-Time Updates**
   - [ ] Send message and watch cost update in real-time
   - [ ] Verify WebSocket cost-update events received
   - [ ] Check UI updates immediately after message completion
   - [ ] Verify both session and total costs update

3. **Cost Alert System**
   - [ ] Monitor for cost warnings as usage increases
   - [ ] Test warning thresholds (if configured)
   - [ ] Verify alert UI components display correctly

**Expected Results:**
- Cost display updates in real-time via WebSocket
- Accurate cost tracking per message
- Proper alert system for cost thresholds
- UI synchronization with server cost data

---

### 5. Chat Interface & User Experience
**Objective**: Test core chat functionality and user interactions

**Test Steps:**
1. **Message Sending**
   - [ ] Type message in chat input
   - [ ] Click send button
   - [ ] Verify message appears in chat history
   - [ ] Check loading states during AI response

2. **Message History**
   - [ ] Send multiple messages
   - [ ] Verify conversation history persists
   - [ ] Check message timestamps
   - [ ] Test scroll behavior with long conversations

3. **Error Handling**
   - [ ] Test with network disconnection
   - [ ] Send message when rate limited
   - [ ] Verify graceful error messages
   - [ ] Check retry mechanisms

4. **Responsive Design**
   - [ ] Test on different screen sizes
   - [ ] Verify mobile compatibility
   - [ ] Check UI component responsiveness

**Expected Results:**
- Smooth chat experience with real-time responses
- Proper message history and persistence
- Graceful error handling with user feedback
- Responsive design across devices

---

### 6. Performance & Reliability
**Objective**: Test system performance under normal usage

**Test Steps:**
1. **Response Times**
   - [ ] Measure average response time for simple queries
   - [ ] Test response time for complex queries
   - [ ] Verify acceptable performance (<5s for most queries)

2. **Concurrent Usage**
   - [ ] Open multiple browser tabs
   - [ ] Send messages from different tabs
   - [ ] Verify proper session handling

3. **Error Recovery**
   - [ ] Test with temporary network issues
   - [ ] Verify automatic reconnection
   - [ ] Check data consistency after reconnection

**Expected Results:**
- Fast response times for most queries
- Proper handling of concurrent sessions
- Robust error recovery mechanisms

---

### 7. Cost Optimization Validation
**Objective**: Verify cost savings and optimization features

**Test Steps:**
1. **Cost Comparison**
   - [ ] Send 10 simple messages, record total cost
   - [ ] Compare with previous expensive model costs
   - [ ] Verify significant cost reduction achieved

2. **Smart Routing Effectiveness**
   - [ ] Monitor routing decisions over varied queries
   - [ ] Verify appropriate model selection
   - [ ] Check cost vs quality trade-offs

3. **Session Cost Tracking**
   - [ ] Complete full chat session
   - [ ] Verify final session cost under $5 limit
   - [ ] Check cost breakdown by provider/model

**Expected Results:**
- Significant cost reduction vs previous system
- Smart routing optimizes cost without sacrificing quality
- Session costs remain within safety limits

---

## Success Criteria

### Critical (Must Pass)
- [ ] Authentication works with production server
- [ ] Safety guards prevent cost overruns
- [ ] Real-time cost tracking accurate
- [ ] Chat functionality works end-to-end

### Important (Should Pass)
- [ ] Smart routing optimizes costs
- [ ] UI/UX provides good user experience
- [ ] Error handling is graceful
- [ ] Performance is acceptable

### Nice to Have
- [ ] Advanced routing features work
- [ ] All edge cases handled properly
- [ ] Perfect responsive design
- [ ] Optimal performance metrics

## Post-Test Actions

### If Tests Pass
- [ ] Document any issues found
- [ ] Create production deployment plan
- [ ] Set up monitoring and alerts
- [ ] Prepare user documentation

### If Tests Fail
- [ ] Document specific failures
- [ ] Prioritize critical fixes
- [ ] Re-run tests after fixes
- [ ] Update safety thresholds if needed

## Test Environment Details

**Alfred-Server**: https://alfred-server-production.up.railway.app
**Test User**: Owner account (nick.bhatia@gmail.com)
**Safety Limits**: 
- Rate: 10 requests/minute
- Dev: 50 requests OR $5/session
- Server: Production cost thresholds

**Expected Costs**:
- GPT-4o Mini: ~$0.001-0.005 per message
- Session total: <$0.50 for typical testing
- Well within $5 safety limit
