import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const sessionsFile = __ENV.LOAD_SESSIONS_FILE || "load-tests/.sessions.local.json";
const sessionData = new SharedArray("academy-load-sessions", () => [JSON.parse(open(sessionsFile))])[0];
const apiUrl = (__ENV.LOAD_API_URL || "http://localhost:4000/api").replace(/\/$/, "");
const webOrigin = (__ENV.LOAD_WEB_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
const studentVus = Math.max(4, Number(__ENV.LOAD_STUDENT_VUS || 100));
const vusPerReadScenario = Math.floor(studentVus / 4);
const playbackVus = studentVus - (vusPerReadScenario * 3);
const duration = __ENV.LOAD_DURATION || "2m";
const adminVus = Math.max(0, Number(__ENV.LOAD_ADMIN_VUS || 2));

if (!Array.isArray(sessionData.students) || sessionData.students.length < studentVus) {
  throw new Error(`O arquivo de sessões precisa conter pelo menos ${studentVus} alunos únicos.`);
}

const scenarios = {
  home: { executor: "constant-vus", vus: vusPerReadScenario, duration, exec: "home", gracefulStop: "10s" },
  catalog: { executor: "constant-vus", vus: vusPerReadScenario, duration, exec: "catalog", gracefulStop: "10s" },
  library: { executor: "constant-vus", vus: vusPerReadScenario, duration, exec: "library", gracefulStop: "10s" },
  playback: { executor: "constant-vus", vus: playbackVus, duration, exec: "playback", gracefulStop: "20s" },
};
if (adminVus > 0 && sessionData.admin?.cookie) {
  scenarios.admin = { executor: "constant-vus", vus: adminVus, duration, exec: "admin", gracefulStop: "10s" };
}

export const options = {
  scenarios,
  discardResponseBodies: false,
  thresholds: {
    checks: ["rate>0.99"],
    "http_req_failed{endpoint:home}": ["rate<0.01"],
    "http_req_duration{endpoint:home}": ["p(95)<500", "p(99)<1000"],
    "http_req_failed{endpoint:catalog}": ["rate<0.01"],
    "http_req_duration{endpoint:catalog}": ["p(95)<600", "p(99)<1200"],
    "http_req_failed{endpoint:library}": ["rate<0.01"],
    "http_req_duration{endpoint:library}": ["p(95)<700", "p(99)<1400"],
    "http_req_failed{endpoint:playback}": ["rate<0.01"],
    "http_req_duration{endpoint:playback}": ["p(95)<1000", "p(99)<2000"],
    "http_req_failed{endpoint:admin}": ["rate<0.01"],
    "http_req_duration{endpoint:admin}": ["p(95)<500", "p(99)<1000"],
  },
};

function student() {
  return sessionData.students[(__VU - 1) % sessionData.students.length];
}

function headers(session, write = false) {
  return {
    Cookie: session.cookie,
    ...(write ? { Origin: webOrigin, "Content-Type": "application/json" } : {}),
  };
}

function get(path, endpoint) {
  const response = http.get(`${apiUrl}${path}`, { headers: headers(student()), tags: { endpoint } });
  check(response, { [`${endpoint}: HTTP 200`]: result => result.status === 200 });
  sleep(1);
}

export function home() {
  get("/experience/home", "home");
}

export function catalog() {
  get("/experience/catalog?page=1&limit=24", "catalog");
}

export function library() {
  get("/experience/library?page=1&limit=24&favoritePage=1", "library");
}

export function playback() {
  const session = student();
  const request = http.post(`${apiUrl}/playback/lessons/${session.lessonId}/bootstrap`, JSON.stringify({
    deviceFingerprint: `k6-stage3-${session.userId}`.slice(0, 128),
    deviceLabel: "k6 Etapa 3",
  }), { headers: headers(session, true), tags: { endpoint: "playback" } });
  const started = check(request, { "playback: HTTP 201": response => response.status === 201 || response.status === 200 });
  if (started) {
    let playbackSessionId = "";
    try { playbackSessionId = request.json("playbackSession.id"); } catch { playbackSessionId = ""; }
    if (playbackSessionId) {
      http.post(`${apiUrl}/playback/sessions/${playbackSessionId}/heartbeat`, JSON.stringify({ positionSec: 15 }), {
        headers: headers(session, true), tags: { endpoint: "playback" },
      });
      http.post(`${apiUrl}/playback/sessions/${playbackSessionId}/end`, "{}", {
        headers: headers(session, true), tags: { endpoint: "playback" },
      });
    }
  }
  sleep(2);
}

export function admin() {
  const response = http.get(`${apiUrl}/admin/dashboard`, {
    headers: headers(sessionData.admin),
    tags: { endpoint: "admin" },
  });
  check(response, { "admin: HTTP 200": result => result.status === 200 });
  sleep(1);
}

export function handleSummary(data) {
  const target = __ENV.LOAD_SUMMARY_FILE || "load-tests/stage3-summary.json";
  return { [target]: JSON.stringify(data, null, 2), stdout: "Teste concluído. Consulte o resumo JSON e /api/admin/observability/metrics.\n" };
}
