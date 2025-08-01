import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const wsErrorRate = new Rate('ws_errors');

export let options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 50 },   // Scale to 50 users
    { duration: '2m', target: 100 },  // Peak at 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.1'],     // Error rate under 10%
    errors: ['rate<0.1'],              // Custom error rate under 10%
    ws_errors: ['rate<0.1'],           // WebSocket error rate under 10%
  },
};

const BASE_URL = __ENV.HOST || 'http://localhost:8000';
const WS_URL = BASE_URL.replace('http', 'ws') + '/ws';

export default function () {
  // Test 1: Authentication endpoint
  let loginResponse = http.post(`${BASE_URL}/auth/login`, {
    username: 'test@example.com',
    password: 'testpassword123'
  });

  let authCheck = check(loginResponse, {
    'login status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    'login response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  if (!authCheck) {
    errorRate.add(1);
  }

  // Test 2: Schedule generation endpoint (critical path)
  let schedulePayload = {
    employees: [
      { id: '1', name: 'Test Employee', availability: [] }
    ],
    constraints: {
      min_employees: 1,
      max_employees: 5,
      operating_hours: [
        { day_of_week: 1, start_time: '09:00', end_time: '17:00', is_open: true }
      ]
    },
    start_date: '2024-01-01',
    end_date: '2024-01-07'
  };

  let scheduleResponse = http.post(`${BASE_URL}/schedules/generate`,
    JSON.stringify(schedulePayload),
    { headers: { 'Content-Type': 'application/json' } }
  );

  let scheduleCheck = check(scheduleResponse, {
    'schedule generation status is 200': (r) => r.status === 200,
    'schedule generation time < 5000ms': (r) => r.timings.duration < 5000,
    'schedule response has data': (r) => {
      try {
        const data = JSON.parse(r.body);
        return Array.isArray(data) || (data && typeof data === 'object');
      } catch {
        return false;
      }
    }
  });

  if (!scheduleCheck) {
    errorRate.add(1);
  }

  // Test 3: WebSocket connection stress test
  let wsResponse = ws.connect(`${WS_URL}/test_user_${__VU}`, function (socket) {
    socket.on('open', function () {
      console.log(`VU ${__VU}: WebSocket connected`);

      // Send test messages
      for (let i = 0; i < 5; i++) {
        socket.send(JSON.stringify({
          type: 'test_message',
          user_id: `test_user_${__VU}`,
          message_id: i,
          timestamp: new Date().toISOString()
        }));
        socket.setTimeout(() => { }, 100); // 100ms between messages
      }
    });

    socket.on('message', function (message) {
      let wsCheck = check(message, {
        'WebSocket message received': (msg) => msg.length > 0,
      });

      if (!wsCheck) {
        wsErrorRate.add(1);
      }
    });

    socket.on('error', function (e) {
      console.log(`VU ${__VU}: WebSocket error:`, e.error());
      wsErrorRate.add(1);
    });

    socket.setTimeout(function () {
      socket.close();
    }, 10000); // Keep connection open for 10 seconds
  });

  let wsCheck = check(wsResponse, {
    'WebSocket connection successful': (r) => r && r.status === 101,
  });

  if (!wsCheck) {
    wsErrorRate.add(1);
  }

  // Test 4: Health check endpoint
  let healthResponse = http.get(`${BASE_URL}/health`);

  let healthCheck = check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 500ms': (r) => r.timings.duration < 500,
    'health status is healthy': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.status === 'healthy' || data.status === 'degraded';
      } catch {
        return false;
      }
    }
  });

  if (!healthCheck) {
    errorRate.add(1);
  }

  // Test 5: Database operations (if available)
  let usersResponse = http.get(`${BASE_URL}/users`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });

  check(usersResponse, {
    'users endpoint accessible': (r) => r.status === 200 || r.status === 401 || r.status === 403,
    'users response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  sleep(1); // 1 second pause between iterations
}

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: `
🎯 NEXTERA LOAD TEST RESULTS
============================

📊 HTTP Performance:
- Total Requests: ${data.metrics.http_reqs.values.count}
- Failed Requests: ${data.metrics.http_req_failed.values.rate * 100}%
- Avg Response Time: ${data.metrics.http_req_duration.values.avg}ms
- 95th Percentile: ${data.metrics.http_req_duration.values['p(95)']}ms

🔌 WebSocket Performance:
- WS Error Rate: ${(data.metrics.ws_errors?.values.rate || 0) * 100}%

⚡ Key Metrics:
- RPS Achieved: ${(data.metrics.http_reqs.values.count / (data.state.testRunDurationMs / 1000)).toFixed(2)}
- Error Rate: ${(data.metrics.errors?.values.rate || 0) * 100}%

✅ Production Readiness:
${data.metrics.http_req_failed.values.rate < 0.1 ? '✅' : '❌'} HTTP Error Rate < 10%
${data.metrics.http_req_duration.values['p(95)'] < 2000 ? '✅' : '❌'} 95th Percentile < 2s
${(data.metrics.ws_errors?.values.rate || 0) < 0.1 ? '✅' : '❌'} WebSocket Error Rate < 10%
${(data.metrics.http_reqs.values.count / (data.state.testRunDurationMs / 1000)) >= 50 ? '✅' : '❌'} Sustained 50+ RPS

🚀 Status: ${data.metrics.http_req_failed.values.rate < 0.1 &&
        data.metrics.http_req_duration.values['p(95)'] < 2000 &&
        (data.metrics.ws_errors?.values.rate || 0) < 0.1 &&
        (data.metrics.http_reqs.values.count / (data.state.testRunDurationMs / 1000)) >= 50
        ? 'PRODUCTION READY 🎉'
        : 'NEEDS OPTIMIZATION ⚠️'
      }
============================
    `
  };
}